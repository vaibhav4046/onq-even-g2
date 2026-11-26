import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';

/**
 * The host serves the built glasses client itself at /g/ (same origin as the API, so no cross-origin whitelist).
 * Public static files only, no secrets. The pairing code travels in the query string of the first page load, so
 * these responses never cache the page, never send a Referer, and the server never logs the URL.
 */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const CLIENT_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export const isClientPath = (pathname: string): boolean => pathname === '/g' || pathname.startsWith('/g/');

function baseHeaders(): Record<string, string> {
  return {
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': CLIENT_CSP,
  };
}

/** Maps /g/<rel> to a file inside `dir`, or null for anything that would leave it. */
export function resolveClientFile(dir: string, pathname: string): string | null {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname.slice('/g/'.length));
  } catch {
    return null;
  }
  if (rel === '') rel = 'index.html';
  if (rel.includes('\0') || rel.includes('\\') || rel.split('/').some((s) => s === '..' || s === '')) return null;
  const root = path.resolve(dir);
  const full = path.resolve(root, rel);
  return full.startsWith(root + path.sep) ? full : null;
}

export function serveClient(req: http.IncomingMessage, res: http.ServerResponse, pathname: string, search: string, dir: string): void {
  if (pathname === '/g') {
    // The query (it may hold the pairing code) is carried over to the canonical address.
    res.writeHead(308, { Location: `/g/${search}`, ...baseHeaders() });
    res.end();
    return;
  }
  const full = resolveClientFile(dir, pathname);
  let st: fs.Stats | null = null;
  try {
    st = full ? fs.statSync(full) : null;
  } catch {
    st = null;
  }
  if (!full || !st || !st.isFile()) {
    const built = fs.existsSync(path.join(dir, 'index.html'));
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...baseHeaders() });
    res.end(built ? 'Not found' : 'The glasses client is not built on this computer. Run npm run build, then reload.');
    return;
  }
  const ext = path.extname(full).toLowerCase();
  const isPage = ext === '.html';
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': isPage ? 'no-store' : 'public, max-age=3600',
    ...baseHeaders(),
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(full).pipe(res);
}
