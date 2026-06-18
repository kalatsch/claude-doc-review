import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const dir = mkdtempSync(join(tmpdir(), 'docrev-smoke-'));
for (const f of ['serve.js', 'review.html', 'marked.min.js']) cpSync(new URL('assets/' + f, root), join(dir, f));
writeFileSync(join(dir, 'human.md'), readFileSync(new URL('test/fixtures/sample-technical.md', root)));
writeFileSync(join(dir, 'comments.json'), '{"version":1,"threads":[]}');

const PORT = 4321;
const srv = spawn(process.execPath, ['serve.js'], { cwd: dir, env: { ...process.env, PORT: String(PORT) } });
await new Promise(r => setTimeout(r, 600));

let failed = false;
const fail = (m) => { failed = true; console.error('FAIL:', m); };
const ok = (m) => console.log('ok:', m);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

  const h1 = await page.locator('#doc h1').first().textContent();
  h1 && h1.includes('split engine') ? ok('human.md rendered as HTML') : fail('h1 from human.md missing, got: ' + h1);

  const paras = await page.locator('#doc p').count();
  paras > 0 ? ok('document paragraphs present') : fail('no paragraphs rendered');
} catch (e) {
  fail(e.message);
} finally {
  await browser.close();
  srv.kill();
}
process.exit(failed ? 1 : 0);
