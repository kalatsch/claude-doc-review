# claude-doc-review Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin `claude-doc-review` whose `/doc-review <file.md>` command turns a terse technical document Claude wrote for itself into a human-friendly review page (clear prose + glossary tooltips + collapsible technical detail) with an inline text-selection commenting layer that syncs live to Claude through a tiny local server.

**Architecture:** A slash command (runs in the main loop) humanizes the source markdown into `human.md`, copies three proven assets into `<project>/.claude/info/<slug>/`, and starts a Node server. `review.html` fetches `human.md`, renders it client-side with a vendored `marked`, and overlays the commenting engine ported from `screens-admin/.claude/plan/plan.html`. Comments live in `comments.json`, which both the browser (poll/POST) and Claude (file read/write) share.

**Tech Stack:** Node.js (no deps for the server; `marked` vendored as a static asset), plain browser HTML/CSS/JS, Playwright for headless smoke verification, Claude Code plugin conventions (`.claude-plugin/plugin.json`, `commands/`, `${CLAUDE_PLUGIN_ROOT}`).

**Proven source files to port (real artifacts, not placeholders):**
- `/Users/hubstaff/Desktop/GitLab/screens-admin/.claude/plan/serve.js`
- `/Users/hubstaff/Desktop/GitLab/screens-admin/.claude/plan/plan.html`

**Project root for all paths below:** `/Users/hubstaff/Desktop/GitLab/claude-doc-review-plugin/`

---

## File Structure

```
claude-doc-review-plugin/
├─ .claude-plugin/
│  ├─ plugin.json          # plugin manifest
│  └─ marketplace.json     # marketplace entry (mirrors claude-activity)
├─ commands/
│  └─ doc-review.md        # the /doc-review command (orchestration + humanization rules)
├─ assets/                 # copied verbatim into <project>/.claude/info/<slug>/ at runtime
│  ├─ review.html          # renderer shell + commenting engine (ported, generalized)
│  ├─ serve.js             # static server + comments API + serves human.md (ported)
│  └─ marked.min.js        # vendored markdown→HTML (offline, no CDN)
├─ test/
│  ├─ serve.test.mjs       # node test: comments API + human.md serving
│  ├─ smoke.mjs            # playwright headless smoke of review.html
│  └─ fixtures/
│     └─ sample-technical.md  # a terse technical doc used by tests/e2e
├─ docs/
│  ├─ specs/2026-06-19-claude-doc-review-plugin-design.md
│  └─ plans/2026-06-19-claude-doc-review-plugin.md
├─ README.md
├─ LICENSE
└─ .gitignore
```

**Responsibilities:**
- `assets/review.html` — the only source of truth for look & behaviour. Renders any `human.md`; never contains document content itself.
- `assets/serve.js` — transport only: static files, `GET/POST /api/comments`, `GET /human.md`.
- `commands/doc-review.md` — orchestration + the humanization rules Claude follows.
- `test/*` — automated verification (node for the server, Playwright for the page).

---

## Task 1: Plugin scaffold + manifest

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `.gitignore`
- Create: `README.md`
- Create: `LICENSE` (MIT, copy from `../claude-activity-plugin/LICENSE`)

- [ ] **Step 1: Initialise the repo and directories**

Run:
```bash
cd /Users/hubstaff/Desktop/GitLab/claude-doc-review-plugin
git init
mkdir -p .claude-plugin commands assets test/fixtures
cp ../claude-activity-plugin/LICENSE ./LICENSE
```

- [ ] **Step 2: Write `.claude-plugin/plugin.json`**

```json
{
  "name": "claude-doc-review",
  "version": "0.1.0",
  "description": "Turn a terse technical document Claude wrote for itself into a human-friendly review page: clear prose, glossary tooltips, collapsible technical detail, and an inline text-selection commenting layer that syncs live to Claude through a tiny local server. No cloud, no accounts, no telemetry.",
  "author": {
    "name": "kalatsch",
    "email": "kirill.kalatsch@gmail.com"
  },
  "keywords": ["review", "comments", "markdown", "annotations", "glossary", "documentation", "collaboration"],
  "license": "MIT"
}
```

- [ ] **Step 3: Write `.claude-plugin/marketplace.json`**

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "claude-doc-review",
  "description": "Human-friendly review page with inline comments for any markdown document Claude writes",
  "owner": { "name": "kalatsch", "email": "kirill.kalatsch@gmail.com" },
  "plugins": [
    {
      "name": "claude-doc-review",
      "version": "0.1.0",
      "description": "Turn a terse technical document into a human-friendly review page with glossary, collapsible detail, and an inline commenting layer that syncs live to Claude.",
      "author": { "name": "kalatsch", "email": "kirill.kalatsch@gmail.com" },
      "category": "productivity",
      "source": "./"
    }
  ]
}
```

- [ ] **Step 4: Write `.gitignore`**

```gitignore
.DS_Store
node_modules/
test-results/
```

- [ ] **Step 5: Write a minimal `README.md`**

```markdown
# claude-doc-review

A Claude Code plugin. `/doc-review <file.md>` renders any markdown document Claude
produced as a human-friendly review page — clear prose, glossary tooltips,
collapsible technical detail — with an inline text-selection commenting layer
that syncs live to Claude through a tiny local server.

## Usage

```
/doc-review path/to/document.md
```

Artifacts are written to `<project>/.claude/info/<slug>/` and served locally.
Select text on the page to leave a comment; Claude answers in the thread.

See `docs/specs/` for the design and `docs/plans/` for the implementation plan.
```

- [ ] **Step 6: Verify the manifests are valid JSON**

Run:
```bash
cd /Users/hubstaff/Desktop/GitLab/claude-doc-review-plugin
node -e "for (const f of ['.claude-plugin/plugin.json','.claude-plugin/marketplace.json']) { const j=require('./'+f); if(!j.name) throw new Error(f+' missing name'); console.log(f,'OK',j.name); }"
```
Expected: prints `.claude-plugin/plugin.json OK claude-doc-review` and the marketplace line; exit 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold claude-doc-review plugin (manifest, marketplace, readme)"
```

---

## Task 2: Vendor `marked` + test fixture

**Files:**
- Create: `assets/marked.min.js`
- Create: `test/fixtures/sample-technical.md`

- [ ] **Step 1: Vendor a pinned `marked` build (offline, no runtime CDN)**

Run:
```bash
cd /Users/hubstaff/Desktop/GitLab/claude-doc-review-plugin
curl -sL https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js -o assets/marked.min.js
test -s assets/marked.min.js && echo "downloaded $(wc -c < assets/marked.min.js) bytes"
```
Expected: prints a byte count > 20000.

- [ ] **Step 2: Verify `marked` parses markdown in Node (UMD works in node too)**

Run:
```bash
cd /Users/hubstaff/Desktop/GitLab/claude-doc-review-plugin
node -e "const m=require('./assets/marked.min.js'); const html=(m.parse||m.marked.parse)('# Hi\n\n- a\n- b'); if(!/<h1[^>]*>Hi<\/h1>/.test(html)) throw new Error('no h1'); if(!/<li>a<\/li>/.test(html)) throw new Error('no li'); console.log('marked OK');"
```
Expected: `marked OK`. (If the UMD export shape differs, the page uses `window.marked.parse`; this node check only confirms the file is a working build.)

- [ ] **Step 3: Verify raw HTML passes through (needed for `<details>` "под кат")**

Run:
```bash
cd /Users/hubstaff/Desktop/GitLab/claude-doc-review-plugin
node -e "const m=require('./assets/marked.min.js'); const html=(m.parse||m.marked.parse)('<details><summary>more</summary>\n\nbody\n\n</details>'); if(!/<details>/.test(html)) throw new Error('details stripped'); console.log('raw-html OK');"
```
Expected: `raw-html OK`.

- [ ] **Step 4: Write `test/fixtures/sample-technical.md` (a terse doc to humanize/render)**

```markdown
# screens-admin editor — split engine

Recursive binary split tree. Each node is a `SplitNode { axis, ratio, a, b }` or a
`LeafBlock`. Snap ratios to powers of two (1/2..1/32); Alt disables snap. Merge on
leaf delete: sibling absorbs the freed region. Coordinates are % of parent block.

## Persistence

Layout in localStorage (`screens-admin:v1`), media blobs in IndexedDB. No backend.

## Risks

Re-anchoring drift if the block id scheme changes mid-session.
```

- [ ] **Step 5: Commit**

```bash
git add assets/marked.min.js test/fixtures/sample-technical.md
git commit -m "chore: vendor marked@12 and add technical fixture"
```

---

## Task 3: `serve.js` — port and extend to serve `human.md`

**Files:**
- Create: `assets/serve.js` (port of `screens-admin/.claude/plan/serve.js`)
- Test: `test/serve.test.mjs`

- [ ] **Step 1: Copy the proven server as the base**

Run:
```bash
cd /Users/hubstaff/Desktop/GitLab/claude-doc-review-plugin
cp ../screens-admin/.claude/plan/serve.js assets/serve.js
```

- [ ] **Step 2: Generalise the served default file and serve `human.md`**

In `assets/serve.js`, the static handler currently maps `/` to `/plan.html`. Change the default page to `review.html`. Find:
```js
  let rel = u.pathname === '/' ? '/plan.html' : decodeURIComponent(u.pathname);
```
Replace with:
```js
  let rel = u.pathname === '/' ? '/review.html' : decodeURIComponent(u.pathname);
```
No other change is needed for `human.md`: the static handler already serves any file in `DIR` by extension, and `.md` is in the `TYPES` map. Confirm `TYPES` includes `'.md': 'text/markdown; charset=utf-8'` (it does in the source).

- [ ] **Step 3: Write the failing server test**

Create `test/serve.test.mjs`:
```js
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'docrev-'));
cpSync(new URL('../assets/serve.js', import.meta.url), join(dir, 'serve.js'));
writeFileSync(join(dir, 'review.html'), '<!doctype html><title>ok</title>hello');
writeFileSync(join(dir, 'human.md'), '# Title\n\nbody');
writeFileSync(join(dir, 'comments.json'), '{"version":1,"threads":[]}');

const PORT = 4319;
const srv = spawn(process.execPath, ['serve.js'], { cwd: dir, env: { ...process.env, PORT: String(PORT) } });
await new Promise(r => setTimeout(r, 500));

let failed = false;
const base = `http://localhost:${PORT}`;
function assert(cond, msg) { if (!cond) { failed = true; console.error('FAIL:', msg); } else { console.log('ok:', msg); } }

try {
  const root = await fetch(base + '/');
  assert(root.ok && (await root.text()).includes('hello'), 'GET / serves review.html');

  const md = await fetch(base + '/human.md');
  assert(md.ok && (await md.text()).includes('# Title'), 'GET /human.md serves markdown');

  const c0 = await fetch(base + '/api/comments');
  const v0 = c0.headers.get('X-Version');
  assert(c0.ok && Array.isArray((await c0.json()).threads), 'GET /api/comments returns threads[]');
  assert(!!v0, 'GET /api/comments sets X-Version');

  const post = await fetch(base + '/api/comments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 1, threads: [{ id: 't1', quote: 'body', messages: [] }] }),
  });
  assert(post.ok, 'POST /api/comments accepts valid payload');

  const c1 = await fetch(base + '/api/comments');
  assert((await c1.json()).threads.length === 1, 'POST persisted the thread');
  assert(c1.headers.get('X-Version') !== v0, 'X-Version changes after write');

  const bad = await fetch(base + '/api/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"nope":true}' });
  assert(bad.status === 400, 'POST rejects payload without threads[]');
} finally {
  srv.kill();
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd /Users/hubstaff/Desktop/GitLab/claude-doc-review-plugin
node test/serve.test.mjs
```
Expected: a list of `ok:` lines, no `FAIL:`, exit 0. (If `GET / serves review.html` is the only failure, Step 2 was not applied.)

- [ ] **Step 5: Commit**

```bash
git add assets/serve.js test/serve.test.mjs
git commit -m "feat: port serve.js, default to review.html, add server test"
```

---

## Task 4: `review.html` — port engine, render `human.md`

**Files:**
- Create: `assets/review.html` (port of `screens-admin/.claude/plan/plan.html`)

- [ ] **Step 1: Copy the proven page as the engine base**

Run:
```bash
cd /Users/hubstaff/Desktop/GitLab/claude-doc-review-plugin
cp ../screens-admin/.claude/plan/plan.html assets/review.html
```

- [ ] **Step 2: Replace the hardcoded document with an empty mount + title**

In `assets/review.html`, replace the entire `<article id="doc"> … </article>` block (the plan content, lines ~109–184 in the source) with:
```html
  <article id="doc"><p class="empty">Загрузка документа…</p></article>
```
Also change `<title>screens-admin — План v1</title>` to:
```html
<title>Doc Review</title>
```

- [ ] **Step 3: Include the vendored markdown renderer**

In `<head>` of `assets/review.html`, immediately before the closing `</head>`, add:
```html
<script src="./marked.min.js"></script>
```
Remove the two Google Fonts `<link>` tags (`preconnect` + `css2`) so the page is fully offline; the CSS already falls back to `system-ui`. Find and delete:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Nunito+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 4: Render `human.md` before comments load**

In the `<script>` IIFE of `assets/review.html`, find the `// ---------- init ----------` section:
```js
  // ---------- init ----------
  loadLocal();
  render();
  if(SERVER){
    setSync('⏳ подключение…');
    pullServer(true);
    setInterval(function(){ pullServer(false); }, 4000);
  } else {
```
Replace that whole init block down to the end of the IIFE with a version that loads the document first, then comments:
```js
  // ---------- document rendering ----------
  function mdToHtml(md){
    try { return (window.marked && (window.marked.parse ? window.marked.parse(md) : window.marked(md))) || ''; }
    catch(e){ return '<pre>'+esc(md)+'</pre>'; }
  }
  function renderDoc(md){
    docEl.innerHTML = mdToHtml(md);
    buildGlossary();      // Task 6 (no-op until defined)
    buildToc();           // Task 8 (no-op until defined)
  }
  function loadDoc(){
    var url = SERVER ? '/human.md' : './human.md';
    return fetch(url,{cache:'no-store'}).then(function(r){ return r.ok?r.text():''; })
      .then(function(md){ if(md) renderDoc(md); else docEl.innerHTML='<p class="empty">Документ не найден (human.md).</p>'; })
      .catch(function(){ docEl.innerHTML='<p class="empty">Не удалось загрузить human.md.</p>'; });
  }

  // ---------- init ----------
  loadLocal();
  loadDoc().then(function(){
    render();                       // renders threads + highlights over the now-mounted doc
    if(SERVER){
      setSync('⏳ подключение…');
      pullServer(true);
      setInterval(function(){ pullServer(false); }, 4000);
    } else {
      setSync('файл-режим (Экспорт/Импорт)');
      if(!state.threads.length){
        fetch('./comments.json',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; })
          .then(function(d){ if(d&&Array.isArray(d.threads)&&d.threads.length){ state.threads=d.threads; saveLocal(); render(); } })
          .catch(function(){});
      }
    }
  });
```
Then define stubs so Steps work before Tasks 6/8 are done — add near the top of the IIFE (after `var state = …`):
```js
  function buildGlossary(){}   // replaced in Task 6
  function buildToc(){}        // replaced in Task 8
```

- [ ] **Step 5: Generalise the panel header copy (remove plan-specific text)**

In the document body, the `<h1>` and intro `<p>` belonged to the plan and were removed in Step 2 (now inside the rendered doc). In the comments panel `<aside id="panel">`, the header reads `💬 Обсуждение` — keep it. Remove the plan-specific `#howBox` paragraph that mentions "comments-round1.json" wording if present; leave the auto/fallback explanation generic. Find the sentence starting `<b>Авто-режим (открыто через локальный сервер):</b>` and replace its body text with:
```html
        <b>Авто-режим (через локальный сервер):</b> комментарии сразу пишутся в <code>comments.json</code>, ответы Claude появляются сами в течение пары секунд.<br><br>
        <b>Резервный вариант</b> (файл открыт напрямую): кнопки <button class="lnk" id="expBtn">⬇ Экспорт</button> / <button class="lnk" id="impBtn">⬆ Импорт</button> для ручного обмена JSON.
```

- [ ] **Step 6: Write the Playwright smoke (document renders)**

Create `test/smoke.mjs`:
```js
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
```

- [ ] **Step 7: Run the smoke to verify it passes**

Run:
```bash
cd /Users/hubstaff/Desktop/GitLab/claude-doc-review-plugin
node test/smoke.mjs
```
Expected: `ok: human.md rendered as HTML`, `ok: document paragraphs present`, exit 0. (First run may download the Chromium browser; if it errors with "browser not installed", run `npx playwright install chromium` once, then re-run.)

- [ ] **Step 8: Commit**

```bash
git add assets/review.html test/smoke.mjs
git commit -m "feat: review.html renders human.md via marked, add playwright smoke"
```

---

## Task 5: Commenting layer works over the rendered document

The engine (selection → thread, nested replies, resolve, server sync) is ported verbatim and already operates on `#doc` text offsets. This task proves it still works now that `#doc` is populated asynchronously.

**Files:**
- Modify: `test/smoke.mjs` (add a commenting assertion)

- [ ] **Step 1: Add a comment-roundtrip assertion to the smoke**

In `test/smoke.mjs`, before `} catch (e) {`, add:
```js
  // select the first paragraph's text and click the floating add button
  await page.evaluate(() => {
    const p = document.querySelector('#doc p');
    const r = document.createRange(); r.selectNodeContents(p);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.waitForSelector('#addBtn', { state: 'visible' });
  await page.click('#addBtn');
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
```

- [ ] **Step 2: Run the smoke**

Run:
```bash
cd /Users/hubstaff/Desktop/GitLab/claude-doc-review-plugin
node test/smoke.mjs
```
Expected: all `ok:` including `selecting text creates a thread`, `comment persisted to comments.json`, `highlight rendered in document`; exit 0.

- [ ] **Step 3: Commit**

```bash
git add test/smoke.mjs
git commit -m "test: verify commenting roundtrip over async-rendered document"
```

---

## Task 6: Glossary terms with tooltips

A `## Словарь` (or `## Glossary`) section in `human.md` lists `- **term** — definition` lines. After rendering, wrap occurrences of each term in the body with a hoverable span.

**Files:**
- Modify: `assets/review.html` (replace the `buildGlossary` stub + add CSS)
- Modify: `test/fixtures/sample-technical.md` (add a glossary section)
- Modify: `test/smoke.mjs` (assert tooltip wiring)

- [ ] **Step 1: Add glossary CSS**

In the `<style>` of `assets/review.html`, add:
```css
  .gloss{border-bottom:1px dotted var(--teal-9);cursor:help;position:relative}
  .gloss:hover::after,.gloss:focus::after{content:attr(data-def);position:absolute;left:0;top:1.5em;z-index:80;
    width:max-content;max-width:280px;background:var(--slate-12);color:#fff;font-size:12px;font-weight:400;
    line-height:1.4;padding:7px 10px;border-radius:6px;box-shadow:var(--shadow-3);white-space:normal}
  #glossary{margin-top:32px;border-top:2px solid var(--slate-4);padding-top:8px}
```

- [ ] **Step 2: Replace the `buildGlossary` stub with the real implementation**

In `assets/review.html`, replace `function buildGlossary(){}` with:
```js
  function buildGlossary(){
    // find a heading whose text is Словарь/Glossary, read its following <ul>
    var heads = docEl.querySelectorAll('h2,h3'); var gHead=null;
    for(var i=0;i<heads.length;i++){ var t=heads[i].textContent.trim().toLowerCase(); if(t==='словарь'||t==='glossary'){ gHead=heads[i]; break; } }
    if(!gHead) return;
    var list = gHead.nextElementSibling; if(!list || list.tagName!=='UL') return;
    gHead.id='glossary';
    var map=[];
    list.querySelectorAll('li').forEach(function(li){
      // expected shape: <strong>term</strong> — definition
      var strong=li.querySelector('strong'); if(!strong) return;
      var term=strong.textContent.trim();
      var def=li.textContent.replace(strong.textContent,'').replace(/^[\s—:-]+/,'').trim();
      if(term && def) map.push({term:term, def:def});
    });
    if(!map.length) return;
    map.sort(function(a,b){ return b.term.length-a.term.length; }); // longest first
    // wrap first occurrence of each term in body text nodes outside the glossary list, code, marks, existing gloss
    map.forEach(function(entry){
      var w=document.createTreeWalker(docEl,NodeFilter.SHOW_TEXT,{acceptNode:function(n){
        if(!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p=n.parentNode;
        while(p && p!==docEl){ var tag=p.tagName; if(tag==='CODE'||tag==='PRE'||tag==='A'||tag==='MARK'||p.classList&&p.classList.contains('gloss')) return NodeFilter.FILTER_REJECT; if(p===gHead||p===list) return NodeFilter.FILTER_REJECT; p=p.parentNode; }
        return NodeFilter.FILTER_ACCEPT;
      }});
      var node;
      while((node=w.nextNode())){
        var idx=node.nodeValue.indexOf(entry.term);
        if(idx<0) continue;
        var range=document.createRange(); range.setStart(node,idx); range.setEnd(node,idx+entry.term.length);
        var span=document.createElement('span'); span.className='gloss'; span.tabIndex=0; span.setAttribute('data-def',entry.def);
        try{ range.surroundContents(span); }catch(e){ continue; }
        break; // first occurrence only
      }
    });
  }
```

- [ ] **Step 3: Add a glossary section to the fixture**

Append to `test/fixtures/sample-technical.md`:
```markdown

## Словарь

- **SplitNode** — узел дерева раскладки: ось, доля и две дочерние области.
- **snap** — привязка границы блока к долям степени двойки (1/2…1/32).
```

- [ ] **Step 4: Assert tooltip wiring in the smoke**

In `test/smoke.mjs`, after the highlight assertion, add:
```js
  const glossCount = await page.locator('#doc .gloss').count();
  glossCount >= 1 ? ok('glossary terms wrapped with tooltip spans') : fail('no .gloss spans');
  const def = await page.locator('#doc .gloss').first().getAttribute('data-def');
  def && def.length > 0 ? ok('glossary tooltip has a definition') : fail('gloss span missing data-def');
```

- [ ] **Step 5: Run the smoke**

Run:
```bash
cd /Users/hubstaff/Desktop/GitLab/claude-doc-review-plugin
node test/smoke.mjs
```
Expected: all `ok:` including the two new glossary lines; exit 0.

- [ ] **Step 6: Commit**

```bash
git add assets/review.html test/fixtures/sample-technical.md test/smoke.mjs
git commit -m "feat: glossary terms with hover tooltips from a Словарь section"
```

---

## Task 7: Collapsible technical detail ("под кат")

`<details><summary>…</summary>…</details>` blocks in `human.md` are passed through by `marked` (verified in Task 2). This task only styles them and proves they collapse.

**Files:**
- Modify: `assets/review.html` (add `<details>` CSS)
- Modify: `test/fixtures/sample-technical.md` (add a details block)
- Modify: `test/smoke.mjs` (assert collapse/expand)

- [ ] **Step 1: Add details CSS**

In the `<style>` of `assets/review.html`, add:
```css
  #doc details{background:var(--slate-2);border:1px solid var(--slate-6);border-radius:var(--radius);padding:8px 12px;margin:12px 0}
  #doc details>summary{cursor:pointer;font-family:var(--head);font-weight:600;color:var(--teal-10);list-style:none}
  #doc details>summary::-webkit-details-marker{display:none}
  #doc details>summary::before{content:"▸ ";color:var(--teal-9)}
  #doc details[open]>summary::before{content:"▾ "}
```

- [ ] **Step 2: Add a details block to the fixture**

Append to `test/fixtures/sample-technical.md`:
```markdown

<details>
<summary>Детали алгоритма merge</summary>

При удалении листа соседний узел заменяет родительский `SplitNode`, наследуя его
прямоугольник; доли пересчитываются от родителя.

</details>
```

- [ ] **Step 3: Assert collapse/expand in the smoke**

In `test/smoke.mjs`, after the glossary assertions, add:
```js
  const det = page.locator('#doc details').first();
  (await det.count()) ? ok('details block present') : fail('no details block');
  const bodyVisibleClosed = await det.locator('p').first().isVisible();
  !bodyVisibleClosed ? ok('details collapsed by default') : fail('details not collapsed');
  await det.locator('summary').click();
  const bodyVisibleOpen = await det.locator('p').first().isVisible();
  bodyVisibleOpen ? ok('details expands on click') : fail('details did not expand');
```

- [ ] **Step 4: Run the smoke**

Run:
```bash
cd /Users/hubstaff/Desktop/GitLab/claude-doc-review-plugin
node test/smoke.mjs
```
Expected: all `ok:` including the three details lines; exit 0.

- [ ] **Step 5: Commit**

```bash
git add assets/review.html test/fixtures/sample-technical.md test/smoke.mjs
git commit -m "feat: style and verify collapsible <details> sections"
```

---

## Task 8: Navigation, status header, dark theme, print

**Files:**
- Modify: `assets/review.html` (TOC/minimap, status header, next-open button, dark theme, print CSS; replace the `buildToc` stub)
- Modify: `test/smoke.mjs` (assert TOC + open-comment counter + theme toggle)

- [ ] **Step 1: Add the status header markup**

In `assets/review.html`, immediately inside `<article id="doc">`'s parent — i.e. as the first child of `<div class="wrap">`, before `<article id="doc">` — insert a header bar spanning the document column:
```html
  <header id="bar">
    <span id="bar-title">Doc Review</span>
    <span id="bar-status" class="pill open">черновик</span>
    <span class="spacer"></span>
    <span id="bar-counts" class="cnt"></span>
    <button class="lnk" id="nextOpen">↓ след. открытый</button>
    <button class="lnk" id="themeBtn" title="Тема">🌓</button>
    <button class="lnk" id="printBtn" title="Печать / PDF">🖨</button>
  </header>
```

- [ ] **Step 2: Add CSS for the header, TOC, dark theme, print**

In `<style>`, add:
```css
  #bar{grid-column:1 / -1;display:flex;align-items:center;gap:10px;padding:8px 16px;background:var(--slate-1);
    border-bottom:1px solid var(--slate-6);position:sticky;top:0;z-index:40;font-family:var(--head)}
  #bar .spacer{flex:1}
  #bar-title{font-weight:700}
  #toc{position:sticky;top:52px;align-self:start;max-height:calc(100vh - 60px);overflow:auto;padding:12px 8px;font-size:13px}
  #toc a{display:block;color:var(--slate-11);text-decoration:none;padding:2px 6px;border-radius:4px;border-left:2px solid transparent}
  #toc a:hover{background:var(--slate-3)}
  #toc a.lvl3{padding-left:18px;font-size:12px}
  #toc a.active{color:var(--teal-10);border-left-color:var(--teal-9);font-weight:600}
  .wrap.with-toc{grid-template-columns:200px minmax(0,1fr) 360px}
  body.dark{--slate-1:#1a1c19;--slate-2:#141612;--slate-3:#22251f;--slate-4:#2c2f28;--slate-6:#3a3e36;--slate-8:#55594f;--slate-11:#b8bbB0;--slate-12:#f1f2ee}
  body.dark pre{background:#000}
  @media print{#panel,#bar,#toc,#addBtn,#mobToggle{display:none!important}.wrap{display:block;max-width:none}#doc{box-shadow:none}}
```
And add a left TOC column container as the first child of `<div class="wrap">`, before `#bar` is not possible (bar spans all). Instead add the TOC aside between `#bar` and `#doc`:
```html
  <nav id="toc"></nav>
```
Update the wrap so the grid can host it: the script toggles `with-toc` on `.wrap` only when headings exist (Step 4).

- [ ] **Step 3: Replace the `buildToc` stub with TOC + scroll-spy**

Replace `function buildToc(){}` in `assets/review.html` with:
```js
  function buildToc(){
    var toc=document.getElementById('toc'); if(!toc) return;
    var heads=docEl.querySelectorAll('h1,h2,h3'); 
    if(heads.length<2){ toc.style.display='none'; return; }
    document.querySelector('.wrap').classList.add('with-toc');
    var html=''; var seen={};
    heads.forEach(function(h,i){
      var id=h.id || ('h'+i+'-'+h.textContent.trim().toLowerCase().replace(/[^a-zа-я0-9]+/g,'-').replace(/^-|-$/g,''));
      if(seen[id]) id=id+'-'+i; seen[id]=1; h.id=id;
      var lvl=h.tagName==='H3'?'lvl3':'';
      html+='<a href="#'+id+'" class="'+lvl+'" data-id="'+id+'">'+esc(h.textContent)+'</a>';
    });
    toc.innerHTML=html;
    toc.addEventListener('click', function(e){ var a=e.target.closest('a'); if(!a) return; e.preventDefault();
      var el=document.getElementById(a.dataset.id); if(el) el.scrollIntoView({block:'start',behavior:'smooth'}); });
    // scroll-spy
    var links=toc.querySelectorAll('a');
    var spy=function(){ var best=null,bestTop=-1e9; heads.forEach(function(h){ var top=h.getBoundingClientRect().top; if(top<120 && top>bestTop){ bestTop=top; best=h.id; } });
      links.forEach(function(a){ a.classList.toggle('active', a.dataset.id===best); }); };
    window.addEventListener('scroll', spy, {passive:true}); spy();
  }
```

- [ ] **Step 4: Wire counts, next-open, theme, print**

In the `<script>`, find the end of the `render()` function (after `renderHighlights();`) and add a counts update call. Replace:
```js
    threadsEl.innerHTML=html;
    renderHighlights();
  }
```
with:
```js
    threadsEl.innerHTML=html;
    renderHighlights();
    updateBar();
  }
  function updateBar(){
    var open=state.threads.filter(function(t){return t.status!=='resolved';}).length;
    var total=state.threads.length;
    var c=document.getElementById('bar-counts'); if(c) c.textContent=open+' откр. · '+(total-open)+' решено';
    var st=document.getElementById('bar-status'); if(st){ st.textContent = open? ('на ревью · '+open) : (total? 'готово':'черновик'); st.className='pill '+(open?'open':'resolved'); }
  }
```
Then, near the other toolbar listeners (after `document.getElementById('howBtn').addEventListener(...)`), add:
```js
  document.getElementById('themeBtn').addEventListener('click', function(){ document.body.classList.toggle('dark'); try{ localStorage.setItem('docrev-theme', document.body.classList.contains('dark')?'dark':'light'); }catch(e){} });
  if(localStorage.getItem('docrev-theme')==='dark') document.body.classList.add('dark');
  document.getElementById('printBtn').addEventListener('click', function(){ window.print(); });
  document.getElementById('nextOpen').addEventListener('click', function(){
    var marks=docEl.querySelectorAll('mark.hl:not(.hl-resolved)'); if(!marks.length) return;
    var y=window.scrollY+120, next=null;
    for(var i=0;i<marks.length;i++){ var top=marks[i].getBoundingClientRect().top+window.scrollY; if(top>y+1){ next=marks[i]; break; } }
    next=next||marks[0]; next.scrollIntoView({block:'center',behavior:'smooth'}); next.classList.add('flash'); setTimeout(function(){next.classList.remove('flash');},1100);
  });
```

- [ ] **Step 5: Assert navigation + counts + theme in the smoke**

In `test/smoke.mjs`, after the details assertions, add:
```js
  const tocLinks = await page.locator('#toc a').count();
  tocLinks >= 2 ? ok('TOC built from headings') : fail('TOC has <2 links: ' + tocLinks);
  const counts = await page.locator('#bar-counts').textContent();
  /откр\./.test(counts || '') ? ok('status bar shows open/resolved counts') : fail('counts missing: ' + counts);
  await page.click('#themeBtn');
  const dark = await page.evaluate(() => document.body.classList.contains('dark'));
  dark ? ok('theme toggles to dark') : fail('dark theme did not toggle');
```

- [ ] **Step 6: Run the smoke**

Run:
```bash
cd /Users/hubstaff/Desktop/GitLab/claude-doc-review-plugin
node test/smoke.mjs
```
Expected: all `ok:` including TOC, counts, theme; exit 0.

- [ ] **Step 7: Commit**

```bash
git add assets/review.html test/smoke.mjs
git commit -m "feat: TOC/scroll-spy, status header, next-open, dark theme, print"
```

---

## Task 9: The `/doc-review` command

**Files:**
- Create: `commands/doc-review.md`

- [ ] **Step 1: Write the command frontmatter + orchestration body**

Create `commands/doc-review.md`:
````markdown
---
description: Render a markdown document as a human-friendly review page with glossary, collapsible detail, and an inline commenting layer that syncs to Claude
argument-hint: "<path/to/document.md>"
allowed-tools: Bash(node *), Bash(mkdir *), Bash(cp *), Bash(test *), Bash(echo *), Bash(open *), Bash(xdg-open *), Read, Write
---

# /doc-review

Turn a terse technical markdown document into a human-friendly review page and
serve it locally for inline commenting. Run these steps; keep chat output short.

## Step 1 — Resolve the source

`$ARGUMENTS` is the path to a markdown file (the technical doc you wrote for
yourself). If empty, ask the user for the path and stop. Verify it exists:

```bash
test -f "$ARGUMENTS" || echo "MISSING: $ARGUMENTS"
```

If MISSING, tell the user and stop.

## Step 2 — Humanize into human.md (this is the value of the command)

Read the source with the Read tool. Produce a human-facing rewrite. Rules:

- Plain, concrete prose for a reader who is NOT in your head. Expand jargon and
  acronyms on first use. Keep the author's decisions and facts; do not invent.
- Lead with what the thing is and what "done" means before mechanics.
- Wrap genuinely deep/technical asides in a collapsible block so the main read
  stays light:
  `<details>\n<summary>Короткое название детали</summary>\n\n…подробности…\n\n</details>`
- End with a `## Словарь` section: `- **Term** — one-sentence definition.` for
  every term a non-author reader might not know. These power the page tooltips.
- Do NOT add comment threads or page chrome — only the document content.

Hold the rewritten markdown in memory for Step 4 (write it as `human.md`).

## Step 3 — Compute slug and target folder

```bash
SLUG=$(basename "$ARGUMENTS" .md | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\{1,\}/-/g; s/^-//; s/-$//')
DEST=".claude/info/$SLUG"
mkdir -p "$DEST"
echo "DEST=$DEST"
```

## Step 4 — Lay down the artifacts

Copy the three assets from the plugin and write the documents:

```bash
cp "${CLAUDE_PLUGIN_ROOT}/assets/review.html" "$DEST/review.html"
cp "${CLAUDE_PLUGIN_ROOT}/assets/serve.js"     "$DEST/serve.js"
cp "${CLAUDE_PLUGIN_ROOT}/assets/marked.min.js" "$DEST/marked.min.js"
cp "$ARGUMENTS" "$DEST/source.md"
test -f "$DEST/comments.json" || echo '{"version":1,"threads":[]}' > "$DEST/comments.json"
```

Then write the humanized markdown from Step 2 to `$DEST/human.md` with the Write
tool (use the absolute path `<project>/.claude/info/<slug>/human.md`).

## Step 5 — Serve and report

Start the server in the background and report the URL:

```bash
(cd "$DEST" && PORT=${PORT:-4178} node serve.js >/dev/null 2>&1 &) ; sleep 1
echo "http://localhost:${PORT:-4178}/"
```

Tell the user: open the URL, select text to comment, Claude answers in threads.
Output one line with the URL and the folder path. Nothing else.

## Step 6 — Answer comments (rest of the session)

When the user says they left comments (or asks you to check), read
`$DEST/comments.json`, answer each open thread whose latest message is from the
user: append a `{author:"claude", …}` message, set the user message's handled
state, and `resolved` only when the thread is settled. Write the file back. The
browser polls and shows your replies within a few seconds.
````

- [ ] **Step 2: Lint the command for placeholders and required sections**

Run:
```bash
cd /Users/hubstaff/Desktop/GitLab/claude-doc-review-plugin
node -e "const s=require('fs').readFileSync('commands/doc-review.md','utf8'); for(const k of ['CLAUDE_PLUGIN_ROOT','human.md','Словарь','comments.json','argument-hint']){ if(!s.includes(k)) throw new Error('missing '+k); } if(/\bTODO\b|\bTBD\b/.test(s)) throw new Error('placeholder found'); console.log('command OK');"
```
Expected: `command OK`.

- [ ] **Step 3: Verify the slug derivation in isolation**

Run:
```bash
for n in "PLAN.md" "Editor Spec v2.md" "screens_admin.MD"; do
  echo -n "$n -> "; basename "$n" .md | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\{1,\}/-/g; s/^-//; s/-$//'
done
```
Expected:
```
PLAN.md -> plan
Editor Spec v2.md -> editor-spec-v2
screens_admin.MD -> screens-admin.md
```
Note: `.MD` (uppercase) is not stripped by `basename … .md`; that is acceptable (slug `screens-admin-md`). If exact `.MD` handling matters, the implementer may lowercase before `basename` — not required for v1.

- [ ] **Step 4: Commit**

```bash
git add commands/doc-review.md
git commit -m "feat: /doc-review command — humanize, lay down assets, serve, answer comments"
```

---

## Task 10: End-to-end dry run + finalize

**Files:**
- Create: `test/e2e.sh`

- [ ] **Step 1: Write an e2e script that simulates the command's bash steps**

Create `test/e2e.sh` (exercises everything except Claude's humanization, using the fixture as a stand-in `human.md`):
```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
SRC="$ROOT/test/fixtures/sample-technical.md"

SLUG=$(basename "$SRC" .md | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\{1,\}/-/g; s/^-//; s/-$//')
DEST="$WORK/.claude/info/$SLUG"; mkdir -p "$DEST"
cp "$ROOT/assets/review.html" "$DEST/"; cp "$ROOT/assets/serve.js" "$DEST/"; cp "$ROOT/assets/marked.min.js" "$DEST/"
cp "$SRC" "$DEST/source.md"; cp "$SRC" "$DEST/human.md"
echo '{"version":1,"threads":[]}' > "$DEST/comments.json"

PORT=4399; (cd "$DEST" && PORT=$PORT node serve.js >/dev/null 2>&1 &) ; sleep 1
code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/")
md=$(curl -s "http://localhost:$PORT/human.md" | head -1)
pkill -f "node serve.js" || true
[ "$code" = "200" ] || { echo "FAIL http $code"; exit 1; }
echo "$md" | grep -q "split engine" || { echo "FAIL human.md not served"; exit 1; }
echo "e2e OK ($DEST)"
```

- [ ] **Step 2: Run the e2e + the full test suite**

Run:
```bash
cd /Users/hubstaff/Desktop/GitLab/claude-doc-review-plugin
chmod +x test/e2e.sh
node test/serve.test.mjs && node test/smoke.mjs && bash test/e2e.sh
```
Expected: all three exit 0; last line `e2e OK (…)`.

- [ ] **Step 3: Update README with verified usage + the test commands**

Append to `README.md`:
```markdown

## Development

```bash
node test/serve.test.mjs   # server API
node test/smoke.mjs        # browser behaviour (Playwright)
bash test/e2e.sh           # full asset lay-down + serve
```

## How it works

`/doc-review <file.md>` humanizes the file into `human.md` (clear prose +
`## Словарь` + collapsible `<details>`), copies `review.html`, `serve.js`,
`marked.min.js` into `<project>/.claude/info/<slug>/`, writes `source.md` and an
empty `comments.json`, and serves the folder. `review.html` renders `human.md`
and overlays the commenting engine; comments round-trip through `comments.json`.
```

- [ ] **Step 4: Final commit**

```bash
git add test/e2e.sh README.md
git commit -m "test: end-to-end asset lay-down + serve; document dev workflow"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** humanization + glossary + `<details>` (Tasks 2,6,7,9), commenting engine port + async render (Tasks 4,5), serve.js + human.md (Task 3), `.claude/info/<slug>/` lay-down via `CLAUDE_PLUGIN_ROOT` (Task 9), polish/nav/dark/print/status (Task 8), no mode fork (command has none), plugin packaging (Task 1), e2e smoke (Task 10). All spec sections map to a task.
- **Type/name consistency:** `human.md`, `source.md`, `comments.json`, `review.html`, `serve.js`, `marked.min.js`, slug rule, `buildGlossary`/`buildToc`/`updateBar`/`loadDoc`/`renderDoc` are used consistently across tasks; stubs for `buildGlossary`/`buildToc` are introduced in Task 4 before being replaced in Tasks 6/8.
- **Placeholders:** none; every code/step is concrete. The only deliberately deferred niceties (uppercase `.MD` slug, file:// fallback fetch) are called out as acceptable v1 limitations, not TODOs.
```
