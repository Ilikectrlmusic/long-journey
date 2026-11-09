import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname).replace(/^\/long-journey(?=\/|$)/, '') || '/';
    const file = resolve(root, '.' + pathname);
    if ((file !== root && !file.startsWith(root + sep)) || pathname.split('/').some(part => part.startsWith('.'))) { res.writeHead(403).end(); return; }
    const info = await stat(file);
    if (info.isDirectory() && !url.pathname.endsWith('/')) { res.writeHead(301, { Location: url.pathname + '/' + url.search }).end(); return; }
    const target = info.isDirectory() ? file + sep + 'index.html' : file;
    const content = await readFile(target);
    res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(content);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(Number(process.env.PORT || 4173), '0.0.0.0', () => console.log(`Development server listening on port ${process.env.PORT || 4173}`));
