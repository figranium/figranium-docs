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


const demoPresetUrl = 'https://templates.figranium.dev/api/presets/41da9f7c-0a49-490f-aca8-f287519cca87';

function normalizePreset(raw) {
  let value = raw;
  if (value && typeof value === 'object' && 'configuration' in value) value = value.configuration;
  if (typeof value === 'string') value = JSON.parse(value);
  if (Array.isArray(value)) return value[0];
  if (value && Array.isArray(value.tasks)) return value.tasks[0];
  if (value?.task && typeof value.task === 'object') return value.task;
  return value;
}

async function seedTourWorkspace() {
  const headers = {
    'content-type': 'application/json',
    origin: apiBaseUrl,
    cookie: `${sessionName}=${sessionValue}`,
  };

  let mapsTask = null;
  try {
    const presetResponse = await fetch(demoPresetUrl);
    if (presetResponse.ok) mapsTask = normalizePreset(await presetResponse.json());
  } catch {}

  const demoTasks = [
    mapsTask ? {
      ...mapsTask,
      id: 'tour_maps_leads',
      name: 'Google Maps Lead Scraper',
      description: 'Collect local business names, ratings, addresses, phones, and websites.',
      last_opened: Date.now() - 1000 * 60 * 7,
    } : {
      id: 'tour_maps_leads', name: 'Google Maps Lead Scraper',
      description: 'Collect local business names, ratings, addresses, phones, and websites.',
      mode: 'agent', url: 'https://www.google.com/maps', actions: [], wait: 0,
      last_opened: Date.now() - 1000 * 60 * 7,
    },
    {
      id: 'tour_competitor_watch', name: 'Competitor Price Monitor',
      description: 'Track product pricing and availability across a competitor catalog.',
      mode: 'agent', url: 'https://example.com/products', actions: [], wait: 0,
      last_opened: Date.now() - 1000 * 60 * 38,
    },
    {
      id: 'tour_directory_export', name: 'Directory Export',
      description: 'Extract a structured company directory and save the result as CSV.',
      mode: 'scraper', url: 'https://example.com/directory', actions: [], wait: 0,
      last_opened: Date.now() - 1000 * 60 * 92,
    },
    {
      id: 'tour_weekly_report', name: 'Weekly Market Report',
      description: 'Gather weekly market data and prepare a clean report for downstream workflows.',
      mode: 'agent', url: 'https://example.com/markets', actions: [], wait: 0,
      last_opened: Date.now() - 1000 * 60 * 60 * 5,
    },
    {
      id: 'tour_job_board', name: 'Job Board Monitor',
      description: 'Watch selected job listings and extract new matches.',
      mode: 'scraper', url: 'https://example.com/jobs', actions: [], wait: 0,
      last_opened: Date.now() - 1000 * 60 * 60 * 24,
    },
  ];

  for (const task of demoTasks) {
    const response = await fetch(`${apiBaseUrl}/api/tasks`, {
      method: 'POST', headers, body: JSON.stringify(task),
    });
    if (!response.ok) throw new Error(`Tour task seed failed: ${response.status}`);
  }

  const now = Date.now();
  const executions = [
    ['exec_tour_1', 'Google Maps Lead Scraper', 'tour_maps_leads', 'agent', 'editor', 200, 'success', 8421, 8],
    ['exec_tour_2', 'Competitor Price Monitor', 'tour_competitor_watch', 'agent', 'api', 200, 'success', 5240, 24],
    ['exec_tour_3', 'Directory Export', 'tour_directory_export', 'scraper', 'api', 200, 'success', 2218, 47],
    ['exec_tour_4', 'Weekly Market Report', 'tour_weekly_report', 'agent', 'editor', 200, 'success', 6914, 83],
    ['exec_tour_5', 'Job Board Monitor', 'tour_job_board', 'scraper', 'api', 500, 'error', 3170, 118],
    ['exec_tour_6', 'Google Maps Lead Scraper', 'tour_maps_leads', 'agent', 'api', 200, 'success', 7742, 164],
  ].map(([id, taskName, taskId, mode, source, status, outcome, durationMs, minutesAgo]) => ({
    id, taskName, taskId, mode, source, status, outcome, durationMs,
    timestamp: now - Number(minutesAgo) * 60 * 1000,
    method: 'POST', path: `/api/tasks/${taskId}/api`,
    url: demoTasks.find((task) => task.id === taskId)?.url,
    result: { outcome, data: [] },
  }));
  await writeFile(join(figraniumRoot, 'data', 'executions.json'), JSON.stringify(executions, null, 2) + '\n');

  const cabinetsRoot = join(figraniumRoot, 'data', 'cabinets');
  const cabinetDefs = [
    { id: 'cab_basic', name: 'Basic Cabinet', files: [
      ['item_leads', 'google-maps-leads.csv', 'unuploaded', 'name,rating,address\\nAcme Coffee,4.8,Main Street\\n'],
      ['item_report', 'weekly-market-report.pdf', 'uploaded', 'Figranium tour placeholder report\\n'],
    ]},
    { id: 'cab_exports', name: 'Client Exports', files: [
      ['item_directory', 'company-directory.csv', 'unuploaded', 'company,website\\nNorthstar Labs,https://example.com\\n'],
      ['item_prices', 'competitor-prices.json', 'uploaded', '{"items":[{"name":"Example product","price":49}]}\\n'],
    ]},
    { id: 'cab_archive', name: 'Archive', files: [
      ['item_jobs', 'job-board-results.csv', 'uploaded', 'title,company\\nProduct Designer,Example Studio\\n'],
    ]},
  ];
  const catalog = { version: 1, defaultCabinetId: 'cab_basic', migratedLegacy: true, legacyPaths: {}, cabinets: [] };
  for (const cabinet of cabinetDefs) {
    const items = [];
    for (let i = 0; i < cabinet.files.length; i++) {
      const [itemId, name, status, contents] = cabinet.files[i];
      const dir = join(cabinetsRoot, cabinet.id, itemId);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, name), contents);
      items.push({ id: itemId, name, kind: 'file', status, size: Buffer.byteLength(contents),
        createdAt: now - (i + 1) * 1000 * 60 * 12, storageName: name });
    }
    catalog.cabinets.push({ id: cabinet.id, name: cabinet.name,
      createdAt: now - 1000 * 60 * 60 * 24 * 14, items });
  }
  await mkdir(cabinetsRoot, { recursive: true });
  await writeFile(join(cabinetsRoot, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
}

await seedTourWorkspace();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await context.addCookies([{ name: sessionName, value: sessionValue, url: baseUrl }]);
const page = await context.newPage();

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
  { path: '/executions', filename: 'ui-executions.png', waitFor: 'Executions' },
  { path: '/cabinets/cab_basic', filename: 'ui-cabinets.png', waitFor: 'Cabinets' },
  { path: '/settings', filename: 'ui-settings.png', waitFor: 'Settings' },
];

for (const screen of tourScreens) {
  await page.goto(`${baseUrl}${screen.path}`, { waitUntil: 'domcontentloaded' });
  await page.getByText(screen.waitFor, { exact: true }).first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(outputRoot, screen.filename), fullPage: false });
}

await browser.close();
