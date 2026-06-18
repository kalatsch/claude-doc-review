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

  // select the first paragraph's text and click the floating add button
  await page.evaluate(() => {
    const p = document.querySelector('#doc p');
    const r = document.createRange(); r.selectNodeContents(p);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.waitForSelector('#addBtn', { state: 'visible' });
  // real trusted mouse click at the button's centre. page.click()'s hover/scroll
  // actionability sequence stalls on this fixed-position overlay after a
  // programmatic selection; a direct mouse click drives the same mousedown+click
  // handlers a user would trigger.
  const addBox = await page.locator('#addBtn').boundingBox();
  await page.mouse.click(addBox.x + addBox.width / 2, addBox.y + addBox.height / 2);
  await page.waitForSelector('#threads .thread', { timeout: 3000 });
  const threadCount = await page.locator('#threads .thread').count();
  threadCount >= 1 ? ok('selecting text creates a thread') : fail('no thread created');

  // type a message and send, then confirm it persisted to comments.json via the server
  await page.fill('#threads .thread textarea', 'Это понятно?');
  await page.click('#threads .thread [data-act="send"]');
  await page.waitForTimeout(700); // debounce + POST
  const saved = JSON.parse(readFileSync(join(dir, 'comments.json'), 'utf8'));
  (saved.threads[0] && saved.threads[0].messages.some(m => m.text === 'Это понятно?'))
    ? ok('comment persisted to comments.json') : fail('comment not persisted');
  const mark = await page.locator('#doc mark.hl').count();
  mark >= 1 ? ok('highlight rendered in document') : fail('no highlight mark');
  const glossCount = await page.locator('#doc .gloss').count();
  glossCount >= 1 ? ok('glossary terms wrapped with tooltip spans') : fail('no .gloss spans');
  const def = await page.locator('#doc .gloss').first().getAttribute('data-def');
  def && def.length > 0 ? ok('glossary tooltip has a definition') : fail('gloss span missing data-def');
} catch (e) {
  fail(e.message);
} finally {
  await browser.close();
  srv.kill();
}
process.exit(failed ? 1 : 0);
