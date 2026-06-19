#!/usr/bin/env node
// Крошечный локальный сервер для review.html: статика + чтение/запись comments.json.
// Запуск:  node serve.js   →   http://localhost:4178/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const COMMENTS = path.join(DIR, 'comments.json');
const PORT = process.env.PORT ? Number(process.env.PORT) : 4178;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function readComments() {
  try { return fs.readFileSync(COMMENTS, 'utf8'); }
  catch (e) { return '{"version":1,"threads":[]}'; }
}
function version() {
  try { return String(fs.statSync(COMMENTS).mtimeMs); }
  catch (e) { return '0'; }
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');

  // ---- API: read comments ----
  if (req.method === 'GET' && u.pathname === '/api/comments') {
    res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store', 'X-Version': version() });
    res.end(readComments());
    return;
  }
  // ---- API: write comments ----
  if (req.method === 'POST' && u.pathname === '/api/comments') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 5e6) req.destroy(); });
    req.on('end', () => {
      try {
        const d = JSON.parse(body);
        if (!d || !Array.isArray(d.threads)) throw new Error('bad shape');
        fs.writeFileSync(COMMENTS, JSON.stringify(d, null, 2));
        res.writeHead(200, { 'Content-Type': TYPES['.json'], 'X-Version': version() });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': TYPES['.json'] });
        res.end('{"ok":false,"error":"' + String(e.message) + '"}');
      }
    });
    return;
  }

  // ---- static files (within DIR only) ----
  let rel = u.pathname === '/' ? '/review.html' : decodeURIComponent(u.pathname);
  const fp = path.normalize(path.join(DIR, rel));
  if (fp !== DIR && !fp.startsWith(DIR + path.sep)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});

server.listen(PORT, () => {
  console.log('Doc-review сервер:  http://localhost:' + PORT + '/');
  console.log('comments.json:', COMMENTS);
  console.log('Останов: Ctrl+C');
});
server.on('error', function (e) {
  if (e && e.code === 'EADDRINUSE') {
    console.error('Порт ' + PORT + ' занят — запустите с другим PORT (напр. PORT=4179 node serve.js).');
    process.exit(1);
  }
  throw e;
});
