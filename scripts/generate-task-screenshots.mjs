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
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto(`${baseUrl}/signup`);
const setup = await page.evaluate(async () => {
  const response = await fetch('/api/auth/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Docs screenshots', email: 'docs@figranium.dev', password: 'screenshots-only' }),
  });
  return { ok: response.ok, status: response.status };
});
if (!setup.ok) throw new Error(`Figranium setup failed: ${setup.status}`);

for (let index = 0; index < manifest.screenshots.length; index++) {
  const item = manifest.screenshots[index];
  const task = { ...item.task, id: `docs_screenshot_${index + 1}`, name: item.title };
  const saved = await page.evaluate(async (nextTask) => {
    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(nextTask),
    });
    return { ok: response.ok, status: response.status };
  }, task);
  if (!saved.ok) throw new Error(`Figranium task save failed: ${saved.status}`);
  await page.goto(`${baseUrl}/tasks/${task.id}`);
  await page.locator('.canvas-workflow').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.canvas-workflow').screenshot({ path: join(outputRoot, item.filename) });
}

const uiTourPath = join(docsRoot, 'ui-tour.mdx');
const uiTour = await readFile(uiTourPath, 'utf8');
if (manifest.screenshots.length) {
  await page.screenshot({ path: join(outputRoot, 'editor-ui.png'), fullPage: false });
  if (!uiTour.includes('/images/tasks/editor-ui.png')) {
    await writeFile(uiTourPath, uiTour.replace(/^(---[\s\S]*?---\n)/, '$1\n<img src="/images/tasks/editor-ui.png" alt="Figranium editor interface" />\n'));
  }
}

await browser.close();
