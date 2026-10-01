const CSR_BUNDLE_URL = '/images/figranium-embed/figranium-embed.csr.js';

const BLOCK_LABELS = {
  click: 'Click', type: 'Type text', navigate: 'Navigate', wait: 'Wait',
  wait_selector: 'Wait for selector', press: 'Press key', scroll: 'Scroll',
  select: 'Select option', javascript: 'Run JavaScript', get_content: 'Get content',
  http_request: 'HTTP request', solve_captcha: 'Solve CAPTCHA',
  wait_captcha: 'Wait for CAPTCHA', do_nothing: 'Do nothing', if: 'If', else: 'Else',
  end: 'End block', while: 'While', foreach: 'For each', repeat: 'Repeat',
  on_error: 'On error', set: 'Set variable', start: 'Start task', stop: 'Stop task',
};

const ACTION_VALUES = [
  ['selector', 'Selector'], ['value', 'Value'], ['varName', 'Save result as'],
  ['method', 'Method'], ['headers', 'Headers'], ['body', 'Body'], ['timeout', 'Timeout (ms)'],
  ['captchaType', 'CAPTCHA type'], ['conditionVarType', 'Condition type'],
  ['conditionOp', 'Operator'], ['conditionValue', 'Compare with'], ['key', 'Key'],
  ['typeMode', 'Text mode'], ['clickType', 'Click type'], ['targetSelector', 'Target selector'],
];

const formatValue = (value) => typeof value === 'object' ? JSON.stringify(value) : String(value);

const loadRenderer = () => {
  if (window.FigraniumEmbed?.mountFigraniumEmbedCsr) return Promise.resolve(window.FigraniumEmbed);
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
  const configured = root.dataset.theme || document.body?.dataset.theme;
  if (configured === 'solarized-light' || configured === 'solarized-dark') return configured;
  return root.classList.contains('dark') || document.body?.classList.contains('dark') ? 'dark' : 'light';
};

const mountTask = (host, task, title, height) => {
  if (!host) return;
  const updateTheme = () => host.__figraniumController?.setTheme(readTheme());
  if (!host.__figraniumThemeObserver) {
    host.__figraniumThemeObserver = new MutationObserver(updateTheme);
    host.__figraniumThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    if (document.body) host.__figraniumThemeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  }
  if (host.__figraniumController) {
    host.__figraniumController.setTask(task);
    updateTheme();
    return;
  }
  void loadRenderer().then((renderer) => {
    if (!host.isConnected || host.__figraniumController || !renderer?.mountFigraniumEmbedCsr) return;
    host.__figraniumController = renderer.mountFigraniumEmbedCsr(host, { task, theme: readTheme(), height, title });
  }).catch((reason) => {
    if (host.isConnected) host.textContent = reason instanceof Error ? reason.message : 'Figranium Embed failed to load.';
  });
};

const renderInstructions = (task) => (
  <section className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
    <h4 className="m-0 text-base font-semibold text-gray-900 dark:text-gray-100">Build this task</h4>
    <p className="mb-3 mt-1 text-sm text-gray-600 dark:text-gray-400">Add these blocks to the canvas in order.</p>
    {task.translation && <p className="mb-4 text-sm text-gray-700 dark:text-gray-300"><strong>Translate the page:</strong> Enabled · <code>{task.translation.targetLanguage}</code></p>}
    {task.actions.length === 0 ? <p className="m-0 text-sm text-gray-600 dark:text-gray-400">This example only changes task settings.</p> : (
      <ol className="m-0 list-decimal space-y-3 pl-5">
        {task.actions.map((action) => {
          const values = ACTION_VALUES.filter(([key]) => action[key] !== undefined && action[key] !== '');
          return <li key={action.id} className="pl-1">
            <p className="m-0 font-medium text-gray-900 dark:text-gray-100">{BLOCK_LABELS[action.type] || action.type}</p>
            {values.length > 0 && <dl className="mt-1 grid gap-1 text-sm">
              {values.map(([key, label]) => <div key={key} className="grid grid-cols-[9rem_1fr] gap-2">
                <dt className="font-medium text-gray-700 dark:text-gray-300">{label}</dt>
                <dd className="m-0 break-words font-mono text-gray-600 dark:text-gray-400">{formatValue(action[key])}</dd>
              </div>)}
            </dl>}
          </li>;
        })}
      </ol>
    )}
  </section>
);

export const FigraniumTask = ({ task, title, height = 560 }) => (
  <div className="not-prose my-6">
    <div ref={(host) => mountTask(host, task, title, height)} style={{ height: `${height}px` }} aria-label={title} />
    {renderInstructions(task)}
  </div>
);
