export const FigraniumTask = ({ task, title, height = 560 }) => {
  const labels = {
    click: 'Click', type: 'Type text', navigate: 'Navigate', wait: 'Wait',
    wait_selector: 'Wait for selector', press: 'Press key', scroll: 'Scroll',
    select: 'Select option', javascript: 'Run JavaScript', get_content: 'Get content',
    http_request: 'HTTP request', solve_captcha: 'Solve CAPTCHA',
    wait_captcha: 'Wait for CAPTCHA', do_nothing: 'Do nothing', if: 'If', else: 'Else',
    end: 'End block', while: 'While', foreach: 'For each', repeat: 'Repeat',
    on_error: 'On error', set: 'Set variable', start: 'Start task', stop: 'Stop task',
  };
  const fields = [
    ['selector', 'Selector'], ['value', 'Value'], ['varName', 'Save result as'],
    ['method', 'Method'], ['headers', 'Headers'], ['body', 'Body'], ['timeout', 'Timeout (ms)'],
    ['captchaType', 'CAPTCHA type'], ['conditionVarType', 'Condition type'],
    ['conditionOp', 'Operator'], ['conditionValue', 'Compare with'], ['key', 'Key'],
    ['typeMode', 'Text mode'], ['clickType', 'Click type'], ['targetSelector', 'Target selector'],
  ];
  const formatValue = (value) => typeof value === 'object' ? JSON.stringify(value) : String(value);
  const currentTheme = () => {
    const root = document.documentElement;
    const configured = root.dataset.theme || document.body?.dataset.theme;
    if (configured === 'solarized-light' || configured === 'solarized-dark') return configured;
    return root.classList.contains('dark') || document.body?.classList.contains('dark') ? 'dark' : 'light';
  };
  const mount = (host) => {
    if (!host) return;
    const applyTheme = () => host.__figraniumController?.setTheme(currentTheme());
    if (!host.__figraniumThemeObserver) {
      host.__figraniumThemeObserver = new MutationObserver(applyTheme);
      host.__figraniumThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
      if (document.body) host.__figraniumThemeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    }
    if (host.__figraniumController) {
      host.__figraniumController.setTask(task);
      applyTheme();
      return;
    }
    const start = () => {
      if (!host.isConnected || host.__figraniumController || !window.FigraniumEmbed?.mountFigraniumEmbedCsr) return;
      host.__figraniumController = window.FigraniumEmbed.mountFigraniumEmbedCsr(host, { task, theme: currentTheme(), height, title });
    };
    if (window.FigraniumEmbed?.mountFigraniumEmbedCsr) {
      start();
      return;
    }
    let script = document.querySelector('script[data-figranium-embed-csr]');
    if (!script) {
      script = document.createElement('script');
      script.src = '/images/figranium-embed/figranium-embed.csr.js';
      script.async = true;
      script.dataset.figraniumEmbedCsr = 'true';
      document.head.appendChild(script);
    }
    script.addEventListener('load', start, { once: true });
    script.addEventListener('error', () => { if (host.isConnected) host.textContent = 'Figranium Embed failed to load.'; }, { once: true });
  };
  return (
    <div className="not-prose my-6">
      <div ref={mount} style={{ height: `${height}px` }} aria-label={title} />
      <section className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
        <h4 className="m-0 text-base font-semibold text-gray-900 dark:text-gray-100">Build this task</h4>
        <p className="mb-3 mt-1 text-sm text-gray-600 dark:text-gray-400">Add these blocks to the canvas in order.</p>
        {task.translation && <p className="mb-4 text-sm text-gray-700 dark:text-gray-300"><strong>Translate the page:</strong> Enabled · <code>{task.translation.targetLanguage}</code></p>}
        {task.actions.length === 0 ? <p className="m-0 text-sm text-gray-600 dark:text-gray-400">This example only changes task settings.</p> : (
          <ol className="m-0 list-decimal space-y-3 pl-5">
            {task.actions.map((action) => {
              const values = fields.filter(([key]) => action[key] !== undefined && action[key] !== '');
              return <li key={action.id} className="pl-1">
                <p className="m-0 font-medium text-gray-900 dark:text-gray-100">{labels[action.type] || action.type}</p>
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
    </div>
  );
};
