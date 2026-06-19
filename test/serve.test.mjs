import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
function freePort(){ return new Promise(res=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); }); }

const dir = mkdtempSync(join(tmpdir(), 'docrev-'));
cpSync(new URL('../assets/serve.js', import.meta.url), join(dir, 'serve.js'));
writeFileSync(join(dir, 'review.html'), '<!doctype html><title>ok</title>hello');
writeFileSync(join(dir, 'human.md'), '# Title\n\nbody');
writeFileSync(join(dir, 'comments.json'), '{"version":1,"threads":[]}');

const PORT = await freePort();
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
