import { readFile, writeFile } from 'node:fs/promises';

const path = 'scripts/generate-task-screenshots.mjs';
const source = await readFile(path, 'utf8');
const dashboard = "  { path: '/dashboard', filename: 'ui-dashboard.png', waitFor: 'Overview' },";
const templates = "  { path: '/templates', filename: 'ui-templates.png', waitFor: 'Templates' },";
if (!source.includes(templates)) {
  if (!source.includes(dashboard)) throw new Error('Dashboard capture entry missing');
  await writeFile(path, source.replace(dashboard, dashboard + '\n' + templates));
}
