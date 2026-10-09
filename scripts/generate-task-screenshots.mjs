import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';

const docsRoot = process.cwd();
const outputRoot = join(docsRoot, 'images', 'tasks');
const manifestPath = join(outputRoot, 'manifest.json');
const figraniumRoot = resolve(process.env.FIGRANIUM_DIR ?? '../figranium');
const require = createRequire(join(figraniumRoot, 'package.json'));
const { chromium } = require('playwright');

const mdxFiles = (await readdir(docsRoot, { recursive: true }))
  .filter((path) => path.endsWith('.mdx') && !path.startsWith('node_modules/'));

function findEmbeds(source) {
  const matches = [];
  let cursor = 0;
  while ((cursor = source.indexOf('<FigraniumTask', cursor)) !== -1) {
    let depth = 0;
    let quote = null;
    let end = cursor;
    for (; end < source.length - 1; end++) {
      const char = source[end];
      if (quote) {
        if (char === quote && source[end - 1] !== '\\') quote = null;
        continue;
      }
      if (char === '"' || char === "'" || char === '`') quote = char;
      else if (char === '{') depth++;
      else if (char === '}') depth--;
      else if (char === '/' && source[end + 1] === '>' && depth === 0) {
        end += 2;
        break;
      }
    }
    const tag = source.slice(cursor, end);
    const taskStart = tag.indexOf('task={') + 'task={'.length;
    let taskDepth = 0;
    let taskEnd = taskStart;
    for (; taskEnd < tag.length; taskEnd++) {
      if (tag[taskEnd] === '{') taskDepth++;
      if (tag[taskEnd] === '}') {
        taskDepth--;
        if (taskDepth === 0) break;
      }
    }
    const expression = tag.slice(taskStart, taskEnd + 1);
    const title = tag.match(/title="([^"]+)"/)?.[1] ?? 'Figranium task';
    const height = Number(tag.match(/height={(\d+)}/)?.[1] ?? 560);
    matches.push({ start: cursor, end, title, height, task: Function(`"use strict"; return (${expression});`)() });
    cursor = end;
  }
  return matches;
}

let manifest;
try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch { manifest = { version: 1, screenshots: [] }; }

if (!manifest.screenshots.length) {
  for (const file of mdxFiles) {
    const absolute = join(docsRoot, file);
    const source = await readFile(absolute, 'utf8');
    const embeds = findEmbeds(source);
    embeds.forEach((embed, index) => {
      const base = file.replace(/\.mdx$/, '').replaceAll('/', '-');
      const filename = `${base}-task-${index + 1}.png`;
      manifest.screenshots.push({ file, filename, ...embed });
    });
    if (!embeds.length) continue;
    let next = source;
    for (const embed of [...embeds].reverse()) {
      const filename = `${file.replace(/\.mdx$/, '').replaceAll('/', '-')}-task-${embeds.indexOf(embed) + 1}.png`;
      next = next.slice(0, embed.start) + `<img src="/images/tasks/${filename}" alt="${embed.title}" />` + next.slice(embed.end);
    }
    next = next.replace(/^import \{ FigraniumTask \} from '\/snippets\/figranium-embed\.jsx';\n\n/m, '');
    await writeFile(absolute, next);
  }
}

await mkdir(outputRoot, { recursive: true });
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

const baseUrl = process.env.FIGRANIUM_URL ?? 'http://127.0.0.1:11345';
const apiBaseUrl = process.env.FIGRANIUM_API_URL ?? baseUrl;
const setup = await fetch(`${apiBaseUrl}/api/auth/setup`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: apiBaseUrl },
  body: JSON.stringify({ name: 'Docs screenshots', email: 'docs@figranium.dev', password: 'screenshots-only' }),
});
if (!setup.ok) throw new Error(`Figranium setup failed: ${setup.status}`);
const [sessionCookie] = setup.headers.getSetCookie();
if (!sessionCookie) throw new Error('Figranium setup did not create a browser session');
const [nameValue] = sessionCookie.split(';');
const separator = nameValue.indexOf('=');
const sessionName = nameValue.slice(0, separator);
const sessionValue = nameValue.slice(separator + 1);



const headers = {
  'content-type': 'application/json',
  origin: apiBaseUrl,
  cookie: `${sessionName}=${sessionValue}`,
};
const hubBase = 'https://templates.figranium.dev';
const hubItems = [];
let next = `${hubBase}/api/presets`;
const visited = new Set();
while (next && !visited.has(next)) {
  visited.add(next);
  const response = await fetch(next);
  if (!response.ok) throw new Error(`Templates Hub request failed: ${response.status} ${next}`);
  const body = await response.json();
  const items = Array.isArray(body) ? body
    : body.presets ?? body.templates ?? body.data?.presets ?? body.data?.templates
      ?? body.data?.items ?? body.data ?? body.items ?? body.results;
  if (!Array.isArray(items)) throw new Error('Unexpected Templates Hub listing format');
  hubItems.push(...items);
  const nextPage = body.next ?? body.nextPage ?? body.pagination?.next ?? null;
  next = typeof nextPage === 'string' ? new URL(nextPage, hubBase).href : null;
}
if (!hubItems.length) throw new Error('Templates Hub returned no templates; refusing to generate an empty tour');
const tasks = [];
for (const [index, item] of hubItems.entries()) {
  const detail = item.configuration != null ? item
    : await (async () => {
        const id = item.id ?? item.uuid ?? item.slug;
        if (!id) throw new Error('Templates Hub entry missing an identifier');
        const response = await fetch(`${hubBase}/api/presets/${encodeURIComponent(id)}`);
        if (!response.ok) throw new Error(`Template fetch failed: ${response.status} ${id}`);
        return response.json();
      })();
  let config = detail.configuration ?? detail.task ?? detail;
  if (typeof config === 'string') config = JSON.parse(config);
  if (Array.isArray(config?.tasks)) config = config.tasks[0];
  if (!config || !Array.isArray(config.actions)) throw new Error(`Template has no valid task actions: ${item.title ?? item.id}`);
  const task = {
    ...config,
    id: `tour_hub_${index + 1}`,
    name: detail.title ?? detail.name ?? config.name ?? `Template ${index + 1}`,
    description: detail.description ?? config.description ?? '',
    last_opened: Date.now() - index * 600000,
  };
  const saved = await fetch(`${apiBaseUrl}/api/tasks`, {
    method: 'POST', headers, body: JSON.stringify(task),
  });
  if (!saved.ok) throw new Error(`Could not import template ${task.name}: ${saved.status} ${await saved.text()}`);
  tasks.push(task);
}
console.log(`Imported ${tasks.length} genuine Templates Hub tasks`);

// Populate the Settings API Keys view with realistic, independently scoped demo keys.
// Secrets stay server-side and are never written to documentation or screenshots.
const demoKeys = [
  { name: 'Production Automation', permissions: ['tasks:read', 'tasks:run', 'results:read', 'tasks:manage'] },
  { name: 'CI/CD Pipeline', permissions: ['tasks:read', 'tasks:run', 'results:read'] },
  { name: 'Reporting Dashboard', permissions: ['tasks:read', 'results:read'] },
  { name: 'Scheduled Scrapers', permissions: ['tasks:run'], taskIds: tasks.slice(0, 3).map(task => task.id) },
];
for (const key of demoKeys) {
  const response = await fetch(`${apiBaseUrl}/api/api-keys`, {
    method: 'POST', headers, body: JSON.stringify(key),
  });
  if (!response.ok) {
    const detail = await response.text();
    const serverLog = await readFile('/tmp/figranium.log', 'utf8').catch(() => 'Server log unavailable');
    throw new Error(`Could not create demo API key "${key.name}": ${response.status} ${detail.slice(0, 400)}\nServer log:\n${serverLog.slice(-5000)}`);
  }
}


// These are illustrative historical entries, not claims that external websites were run.
// Intercept only the demo tour's history endpoint, leaving Figranium's real UI untouched.
const now = Date.now();
const demoExecutions = tasks.slice(0, 12).map((task, i) => ({
  id: `tour_history_${i + 1}`, taskId: task.id, taskName: task.name,
  mode: task.mode ?? 'agent', source: i % 3 === 0 ? 'editor' : 'api',
  method: 'POST', path: `/api/tasks/${task.id}/api`, url: task.url,
  timestamp: now - (i + 1) * 600000,
  status: i === 7 ? 500 : 200,
  outcome: i === 7 ? 'error' : 'success',
  durationMs: 2800 + i * 713,
}));
if (!demoExecutions.length) throw new Error('No Hub tasks to populate execution history');

// Use the actual Cabinets API so the server cache and UI stay in sync.
const cabinetResponse = await fetch(`${apiBaseUrl}/api/cabinets`, { headers });
if (!cabinetResponse.ok) throw new Error('Could not load demo Cabinets');
const existing = await cabinetResponse.json();
const basicId = existing.defaultCabinetId;
const cabinetIds = [basicId];
for (const name of ['Lead Exports', 'Reports']) {
  const response = await fetch(`${apiBaseUrl}/api/cabinets`, {
    method: 'POST', headers, body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error(`Could not create Cabinet ${name}`);
  cabinetIds.push((await response.json()).id);
}
// The Cabinets API does not expose direct file import. For screenshot-only demo
// data, intercept its GET responses instead of writing behind the server's cache.
const demoCabinets = {
  defaultCabinetId: basicId,
  cabinets: [
    { id: basicId, name: 'Basic Cabinet', isDefault: true, itemCount: 3, unuploadedCount: 2 },
    { id: cabinetIds[1], name: 'Lead Exports', isDefault: false, itemCount: 4, unuploadedCount: 1 },
    { id: cabinetIds[2], name: 'Reports', isDefault: false, itemCount: 2, unuploadedCount: 0 },
  ],
};
const demoItems = {
  [basicId]: ['business-leads.csv', 'company-directory.json', 'scrape-log.txt'],
  [cabinetIds[1]]: ['maps-leads.csv', 'directory-export.csv', 'contacts.json', 'verified-leads.csv'],
  [cabinetIds[2]]: ['weekly-report.csv', 'summary.json'],
};
function itemResponse(id) {
  return { items: (demoItems[id] ?? []).map((name, index) => ({
    id: `tour_item_${id}_${index}`, name, kind: 'file',
    status: index === 0 ? 'unuploaded' : 'uploaded', size: 2048 + index * 1354,
    createdAt: now - index * 3600000,
  })) };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await context.addCookies([{ name: sessionName, value: sessionValue, url: baseUrl }]);
const page = await context.newPage();
await page.route('**/api/executions', async (route) => {
  if (route.request().method() !== 'GET') return route.continue();
  await route.fulfill({ json: { executions: demoExecutions } });
});
await page.route('**/api/cabinets', async (route) => {
  if (route.request().method() !== 'GET') return route.continue();
  await route.fulfill({ json: demoCabinets });
});
await page.route((url) => url.pathname.startsWith('/api/cabinets/') && url.pathname.endsWith('/items'), async (route) => {
  const id = new URL(route.request().url()).pathname.split('/')[3];
  await route.fulfill({ json: itemResponse(id) });
});


for (let index = 0; index < manifest.screenshots.length; index++) {
  const item = manifest.screenshots[index];
  const task = { ...item.task, id: `docs_screenshot_${index + 1}`, name: item.title };
  const saved = await fetch(`${apiBaseUrl}/api/tasks`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: apiBaseUrl,
      cookie: `${sessionName}=${sessionValue}`,
    },
    body: JSON.stringify(task),
  });
  if (!saved.ok) throw new Error(`Figranium task save failed: ${saved.status}`);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate((id) => {
    window.history.pushState({}, '', `/tasks/${id}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, task.id);
  const canvas = page.locator('.canvas-workflow');
  try {
    await canvas.waitFor({ state: 'visible', timeout: 30000 });
  } catch (error) {
    const body = await page.locator('body').innerText().catch(() => '');
    throw new Error(`Figranium editor did not load at ${page.url()}: ${body.slice(0, 800)}`, { cause: error });
  }
  // Center the workflow itself in the final docs capture. The editor's left
  // navigation rail makes the natural editor composition sit slightly right.
  const trigger = page.getByText('On Execution', { exact: true }).first();
  const triggerBox = await trigger.boundingBox();
  const viewport = page.viewportSize();
  if (triggerBox && viewport) {
    const workflowCenter = triggerBox.x + triggerBox.width / 2;
    const viewportCenter = viewport.width / 2;
    const deltaX = workflowCenter - viewportCenter;
    if (Math.abs(deltaX) > 1) {
      await page.mouse.move(viewportCenter, viewport.height / 2);
      await page.mouse.wheel(deltaX, 0);
      await page.waitForTimeout(100);
    }
  }
  await page.screenshot({ path: join(outputRoot, item.filename), fullPage: false });
}

const uiTourPath = join(docsRoot, 'ui-tour.mdx');
const uiTour = await readFile(uiTourPath, 'utf8');
if (manifest.screenshots.length) {
  await page.screenshot({ path: join(outputRoot, 'editor-ui.png'), fullPage: false });
  if (!uiTour.includes('/images/tasks/editor-ui.png')) {
    await writeFile(uiTourPath, uiTour.replace(/^(---[\s\S]*?---\n)/, '$1\n<img src="/images/tasks/editor-ui.png" alt="Figranium editor interface" />\n'));
  }
}


const tourScreens = [
  { path: '/dashboard', filename: 'ui-dashboard.png', waitFor: 'Overview' },
  { path: '/templates', filename: 'ui-templates.png', waitFor: 'Templates' },
  { path: '/executions', filename: 'ui-executions.png', waitFor: 'Executions' },
  { path: '/cabinets/cab_basic', filename: 'ui-cabinets.png', waitFor: 'Cabinets' },
  { path: '/settings', filename: 'ui-settings.png', waitFor: 'Settings' },
  { path: '/vault', filename: 'ui-vault.png', waitFor: 'Vault' },
];

for (const screen of tourScreens) {
  await page.goto(`${baseUrl}${screen.path}`, { waitUntil: 'domcontentloaded' });
  await page.getByText(screen.waitFor, { exact: true }).first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1100);
  await page.screenshot({ path: join(outputRoot, screen.filename), fullPage: false });
}

await browser.close();
