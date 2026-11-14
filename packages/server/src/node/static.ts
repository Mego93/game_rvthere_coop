import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { pipeline, type Readable } from 'node:stream';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.md': 'text/markdown; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export const contentType = (file: string): string =>
  CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

// The file a request path maps to inside `root`, or null if the path cannot be decoded.
// Normalising against "/" first means no sequence of ".." can climb out of `root`.
export function resolveStaticPath(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  return path.join(root, path.posix.normalize(`/${decoded.replaceAll('\\', '/')}`));
}

const isNotFound = (error: unknown) => {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
};

// A missing file is not an error; any other failure of stat is.
const isFile = async (file: string) => {
  try {
    return (await stat(file)).isFile();
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
};

// Resolves to a readable stream once it has opened, so that a failure can still be answered with a status.
export const defaultOpen = (file: string): Promise<Readable> =>
  new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.once('open', () => resolve(stream));
    stream.once('error', reject);
  });

const plain = (response: ServerResponse, status: number, text: string) => {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(`${text}\n`);
};

// Serves the built client from `root`. Any path that is not a file serves index.html: the client reads the room from the address.
// A failure other than not-found goes to `report` with source `static` and is answered with 500.
export async function serveStatic(
  root: string,
  request: IncomingMessage,
  response: ServerResponse,
  report: (source: string, error: unknown) => void,
  open: (file: string) => Promise<Readable> = defaultOpen,
): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return plain(response, 405, 'Method not allowed');
  let urlPath: string;
  try {
    urlPath = new URL(request.url ?? '/', 'http://localhost').pathname;
  } catch {
    return plain(response, 400, 'Bad request');
  }
  const requested = resolveStaticPath(root, urlPath);
  if (!requested) return plain(response, 400, 'Bad request');

  try {
    let file = requested;
    if (!(await isFile(file))) {
      // A missing file with an extension is a real 404; anything else is a page address.
      if (path.extname(urlPath) !== '') return plain(response, 404, 'Not found');
      file = path.join(root, 'index.html');
      if (!(await isFile(file))) return plain(response, 503, 'The client is not built. Run "npm run build" first.');
    }

    const stream = await open(file);
    const hashed = file.startsWith(path.join(root, 'assets') + path.sep);
    response.writeHead(200, {
      'Content-Type': contentType(file),
      // Vite gives files under assets/ a content hash in their name, so they can be cached for good.
      'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (request.method === 'HEAD') {
      stream.destroy();
      response.end();
      return;
    }
    // pipeline closes the file if the client goes away, and a read error ends the response, not the process.
    pipeline(stream, response, () => {});
  } catch (error) {
    if (isNotFound(error)) return plain(response, 404, 'Not found');
    report('static', error);
    if (response.headersSent) response.destroy();
    else plain(response, 500, 'Internal server error');
  }
}
