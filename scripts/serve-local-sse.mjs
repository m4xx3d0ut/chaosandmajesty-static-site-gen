import http from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOST = process.env.LOCAL_SERVE_HOST || '0.0.0.0';
const PORT = Number.parseInt(process.env.LOCAL_SERVE_PORT || '8888', 10);
const BASE_DIR = process.env.SITE_OUTPUT_DIR
  ? path.resolve(process.env.SITE_OUTPUT_DIR)
  : path.resolve(__dirname, '..', 'site-output');

const SSE_TARGET = process.env.SSE_PROXY_TARGET || 'http://127.0.0.1:7070';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

function sanitizePath(requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const safePath = decoded.replace(/\\/g, '/');
  const resolved = path.resolve(BASE_DIR, '.' + safePath);
  if (!resolved.startsWith(BASE_DIR)) {
    return null;
  }
  return resolved;
}

function proxyRequest(req, res, targetUrl) {
  const target = new URL(targetUrl);
  const options = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    method: req.method,
    path: target.pathname + target.search,
    headers: {
      ...req.headers,
      host: target.host
    }
  };

  const proxyReq = http.request(options, proxyRes => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
    }
    res.end('Proxy error');
  });

  req.pipe(proxyReq);
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(404);
    res.end();
    return;
  }

  if (req.url.startsWith('/sse/feeds')) {
    proxyRequest(req, res, `${SSE_TARGET}/sse/feeds`);
    return;
  }

  if (req.url.startsWith('/refresh')) {
    proxyRequest(req, res, `${SSE_TARGET}/refresh`);
    return;
  }

  let filePath = sanitizePath(req.url);
  if (!filePath) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad request');
    return;
  }

  try {
    let stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stats = await fs.stat(filePath);
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (_err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('File not found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[serve-local-sse] Serving ${BASE_DIR} on http://${HOST}:${PORT}`);
});
