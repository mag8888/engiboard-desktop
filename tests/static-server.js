// tests/static-server.js — минимальный кросс-платформенный статический сервер
// для dist/ (Playwright webServer). Без зависимостей; node есть и на mac, и на
// Windows-CI, в отличие от python/python3.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.UI_PORT ? Number(process.env.UI_PORT) : 7788;
const ROOT = path.join(__dirname, '..', 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  // браузер сам дёргает /favicon.ico — отдаём пустой 204, чтобы не было
  // 404-шума в консоли (в Tauri-сборке фавикона нет, это артефакт сервера).
  if (urlPath === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const filePath = path.join(ROOT, path.normalize(urlPath));
  // не выпускаем за пределы dist/
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`static-server: dist/ on http://localhost:${PORT}`));
