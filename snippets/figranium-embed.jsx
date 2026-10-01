const CSR_BUNDLE_URL =
  'https://cdn.jsdelivr.net/npm/@figranium/embed@0.2.0/dist/csr/figranium-embed.csr.js';

const BLOCK_LABELS = {
  click: 'Click',
  type: 'Type text',
  navigate: 'Navigate',
  wait: 'Wait',
  wait_selector: 'Wait for selector',
  press: 'Press key',
  scroll: 'Scroll',
  select: 'Select option',
  javascript: 'Run JavaScript',
  get_content: 'Get content',
  http_request: 'HTTP request',
  solve_captcha: 'Solve CAPTCHA',
  wait_captcha: 'Wait for CAPTCHA',
  do_nothing: 'Do nothing',
  if: 'If',
  else: 'Else',
  end: 'End block',
  while: 'While',
  foreach: 'For each',
  repeat: 'Repeat',
  on_error: 'On error',
  set: 'Set variable',
  start: 'Start task',
  stop: 'Stop task',
};

const ACTION_VALUES = [
  ['selector', 'Selector'],
  ['value', 'Value'],
  ['varName', 'Save result as'],
  ['method', 'Method'],
  ['headers', 'Headers'],
  ['body', 'Body'],
  ['timeout', 'Timeout (ms)'],
  ['captchaType', 'CAPTCHA type'],
  ['conditionVarType', 'Condition type'],
  ['conditionOp', 'Operator'],
  ['conditionValue', 'Compare with'],
  ['key', 'Key'],
  ['typeMode', 'Text mode'],
  ['clickType', 'Click type'],
  ['targetSelector', 'Target selector'],
];

const formatValue = (value) => {
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

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

const TaskInstructions = ({ task }) => {
  const settings = task.translation
    ? [{ label: 'Translate the page', value: `Enabled · ${task.translation.targetLanguage}` }]
    : [];

  return (
    <section className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
      <h4 className="m-0 text-base font-semibold text-gray-900 dark:text-gray-100">Build this task</h4>
      <p className="mb-3 mt-1 text-sm text-gray-600 dark:text-gray-400">Add these blocks to the canvas in order.</p>
      {settings.length > 0 && (
        <dl className="mb-4 grid gap-1 text-sm">
          {settings.map((setting) => (
            <div key={setting.label} className="flex gap-2">
              <dt className="font-medium text-gray-800 dark:text-gray-200">{setting.label}:</dt>
              <dd className="m-0 text-gray-600 dark:text-gray-400">{setting.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {task.actions.length === 0 ? (
        <p className="m-0 text-sm text-gray-600 dark:text-gray-400">This example only changes task settings.</p>
      ) : (
        <ol className="m-0 list-decimal space-y-3 pl-5">
          {task.actions.map((action) => {
            const values = ACTION_VALUES.filter(([key]) => action[key] !== undefined && action[key] !== '');
            return (
              <li key={action.id} className="pl-1">
                <p className="m-0 font-medium text-gray-900 dark:text-gray-100">
                  {BLOCK_LABELS[action.type] || action.type}
                </p>
                {values.length > 0 && (
                  <dl className="mt-1 grid gap-1 text-sm">
                    {values.map(([key, label]) => (
                      <div key={key} className="grid grid-cols-[9rem_1fr] gap-2">
                        <dt className="font-medium text-gray-700 dark:text-gray-300">{label}</dt>
                        <dd className="m-0 break-words font-mono text-gray-600 dark:text-gray-400">
                          {formatValue(action[key])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
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
      <TaskInstructions task={task} />
    </div>
  );
};
