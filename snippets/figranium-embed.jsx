const CSR_BUNDLE_URL =
  'https://cdn.jsdelivr.net/npm/@figranium/embed@0.2.0/dist/csr/figranium-embed.csr.js';

const loadRenderer = () => {
  if (window.FigraniumEmbed?.mountFigraniumEmbedCsr) {
    return Promise.resolve(window.FigraniumEmbed);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-figranium-embed-csr]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.FigraniumEmbed), { once: true });
      existing.addEventListener('error', () => reject(new Error('Figranium Embed failed to load.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = CSR_BUNDLE_URL;
    script.async = true;
    script.dataset.figraniumEmbedCsr = 'true';
    script.onload = () => resolve(window.FigraniumEmbed);
    script.onerror = () => reject(new Error('Figranium Embed failed to load.'));
    document.head.appendChild(script);
  });
};

const readTheme = () => {
  const root = document.documentElement;
  const body = document.body;
  const configured = root.dataset.theme || body?.dataset.theme;
  if (configured === 'solarized-light' || configured === 'solarized-dark') return configured;
  return root.classList.contains('dark') || body?.classList.contains('dark') ? 'dark' : 'light';
};

export const FigraniumTask = ({ task, title, height = 560 }) => {
  const hostRef = useRef(null);
  const controllerRef = useRef(null);
  const [theme, setTheme] = useState('light');
  const [error, setError] = useState('');

  useEffect(() => {
    const syncTheme = () => setTheme(readTheme());
    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;

    void loadRenderer()
      .then((renderer) => {
        if (disposed || !hostRef.current || !renderer?.mountFigraniumEmbedCsr) return;
        controllerRef.current?.destroy();
        controllerRef.current = renderer.mountFigraniumEmbedCsr(hostRef.current, {
          task,
          theme,
          height,
          title,
        });
        setError('');
      })
      .catch((reason) => {
        if (!disposed) setError(reason instanceof Error ? reason.message : 'Figranium Embed failed to load.');
      });

    return () => {
      disposed = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [task, theme, height, title]);

  return (
    <div className="not-prose my-6">
      <div ref={hostRef} style={{ height: `${height}px` }} aria-label={title} />
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
};
