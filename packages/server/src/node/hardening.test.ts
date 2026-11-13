import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SOCKET_CLOSE_TIMEOUT, SOCKET_PATH } from '@lodgy/shared';
import { afterAll, beforeAll, expect, test } from 'vitest';
import WebSocket from 'ws';
import { clientAddress, sendOrDrop, startServer, type RunningServer, type ServerOptions } from './listen';
import { serveStatic } from './static';

let root: string;
let clientDir: string;
const running: RunningServer[] = [];

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'lodgy-hardening-test-'));
  clientDir = path.join(root, 'dist');
  await mkdir(clientDir, { recursive: true });
  await writeFile(path.join(clientDir, 'index.html'), '<!doctype html><title>client</title>');
});

afterAll(async () => {
  await Promise.all(running.map((server) => server.close()));
  await rm(root, { recursive: true, force: true });
});

async function start(extra: Partial<ServerOptions> = {}, dir = clientDir) {
  const server = await startServer({ port: 0, clientDir: dir, ...extra });
  running.push(server);
  return server;
}

// Opens a socket; resolves with it once open, or with the HTTP status that refused it.
function open(port: number, pathname = SOCKET_PATH, headers: Record<string, string> = {}) {
  return new Promise<{ socket: WebSocket } | { status: number }>((resolve) => {
    const socket = new WebSocket(`ws://localhost:${port}${pathname}`, { headers });
    socket.once('open', () => resolve({ socket }));
    socket.once('unexpected-response', (_request, response) => {
      resolve({ status: response.statusCode ?? 0 });
      response.resume();
    });
    socket.once('error', () => {});
  });
}

const opened = (result: Awaited<ReturnType<typeof open>>) => {
  if (!('socket' in result)) throw new Error(`refused with ${result.status}`);
  return result.socket;
};

function rawRequest(port: number, method: string, pathname: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({ host: 'localhost', port, path: pathname, method }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

// --- T7: caps ---

test('a connection beyond the per-address cap gets 503, and a place frees up when one closes', async () => {
  const server = await start({ limits: { perAddress: 2, total: 100 } });
  const first = opened(await open(server.port));
  opened(await open(server.port));
  expect(await open(server.port)).toEqual({ status: 503 });
  const closed = new Promise<void>((resolve) => first.once('close', () => resolve()));
  first.close();
  await closed;
  expect(await open(server.port)).toHaveProperty('socket');
});

test('a connection beyond the total cap gets 503', async () => {
  const server = await start({ limits: { perAddress: 100, total: 2 } });
  opened(await open(server.port));
  opened(await open(server.port));
  expect(await open(server.port)).toEqual({ status: 503 });
});

// --- T8: proxy trust ---

test('with proxy trust on, CF-Connecting-IP decides the address', async () => {
  const server = await start({ trustProxy: true, limits: { perAddress: 1, total: 100 } });
  opened(await open(server.port, SOCKET_PATH, { 'CF-Connecting-IP': '203.0.113.1' }));
  opened(await open(server.port, SOCKET_PATH, { 'CF-Connecting-IP': '203.0.113.2' }));
  expect(await open(server.port, SOCKET_PATH, { 'CF-Connecting-IP': '203.0.113.1' })).toEqual({ status: 503 });
});

test('with proxy trust off, CF-Connecting-IP is ignored', async () => {
  const server = await start({ limits: { perAddress: 1, total: 100 } });
  opened(await open(server.port, SOCKET_PATH, { 'CF-Connecting-IP': '203.0.113.1' }));
  expect(await open(server.port, SOCKET_PATH, { 'CF-Connecting-IP': '203.0.113.2' })).toEqual({ status: 503 });
});

test('clientAddress trusts the header only from a loopback socket, and strips the IPv4-mapped prefix', () => {
  const headers = { 'cf-connecting-ip': '203.0.113.9, 10.0.0.1' };
  expect(clientAddress('127.0.0.1', headers, true)).toBe('203.0.113.9');
  expect(clientAddress('::1', headers, true)).toBe('203.0.113.9');
  expect(clientAddress('::ffff:127.0.0.1', headers, true)).toBe('203.0.113.9');
  expect(clientAddress('198.51.100.7', headers, true)).toBe('198.51.100.7');
  expect(clientAddress('127.0.0.1', headers, false)).toBe('127.0.0.1');
  expect(clientAddress('127.0.0.1', {}, true)).toBe('127.0.0.1');
  expect(clientAddress('::ffff:198.51.100.7', {}, false)).toBe('198.51.100.7');
  expect(clientAddress(undefined, {}, true)).toBe('unknown');
});

// --- T9: binary frame ---

test('a binary frame terminates the socket', async () => {
  const server = await start();
  const socket = opened(await open(server.port));
  const code = new Promise<number>((resolve) => socket.once('close', (closeCode) => resolve(closeCode)));
  socket.send(new Uint8Array([1, 2, 3]));
  expect(await code).toBe(1006);
});

// --- T10: HTTP answers ---

test('HEAD / is 200 with no body', async () => {
  const server = await start();
  expect(await rawRequest(server.port, 'HEAD', '/')).toEqual({ status: 200, body: '' });
});

test('a plain request to the socket path gets 426, and an upgrade to any other path gets 400', async () => {
  const server = await start();
  expect((await rawRequest(server.port, 'GET', SOCKET_PATH)).status).toBe(426);
  expect(await open(server.port, '/nope')).toEqual({ status: 400 });
});

test('an undecodable path gets 400, and an unbuilt client gets 503', async () => {
  const server = await start();
  expect((await rawRequest(server.port, 'GET', '/%E0%A4%A')).status).toBe(400);
  const unbuilt = await start({}, path.join(root, 'missing'));
  expect((await rawRequest(unbuilt.port, 'GET', '/')).status).toBe(503);
});

test('a static read failure is answered with 500 and reported once', async () => {
  const reports: { source: string; error: unknown }[] = [];
  const failure = Object.assign(new Error('disk failed'), { code: 'EIO' });
  const http = createServer((request, response) => {
    void serveStatic(
      clientDir,
      request,
      response,
      (source, error) => reports.push({ source, error }),
      () => Promise.reject(failure),
    );
  });
  await new Promise<void>((resolve) => http.listen(0, resolve));
  const { port } = http.address() as net.AddressInfo;
  expect((await rawRequest(port, 'GET', '/')).status).toBe(500);
  expect(reports).toEqual([{ source: 'static', error: failure }]);
  http.close();
});

// --- T11: close ---

test('close resolves while a half-sent HTTP request is still open', async () => {
  const server = await startServer({ port: 0, clientDir });
  const client = net.connect(server.port, 'localhost');
  client.on('error', () => {});
  await new Promise<void>((resolve) => client.once('connect', () => resolve()));
  client.write('GET / HTTP/1.1\r\n');
  await new Promise((resolve) => setTimeout(resolve, 50));
  await server.close();
  client.destroy();
});

// --- T12: send buffer ---

test('a socket whose queue is over the cap after a send is terminated', () => {
  const make = (bufferedAmount: number, readyState = 1) => {
    const calls = { sent: 0, terminated: 0 };
    return {
      calls,
      socket: {
        readyState,
        OPEN: 1,
        bufferedAmount,
        send: () => void (calls.sent += 1),
        terminate: () => void (calls.terminated += 1),
      },
    };
  };
  const over = make(101);
  sendOrDrop(over.socket, 'x', 100);
  expect(over.calls).toEqual({ sent: 1, terminated: 1 });
  const at = make(100);
  sendOrDrop(at.socket, 'x', 100);
  expect(at.calls).toEqual({ sent: 1, terminated: 0 });
  const closed = make(1000, 3);
  sendOrDrop(closed.socket, 'x', 100);
  expect(closed.calls).toEqual({ sent: 0, terminated: 0 });
});

// --- dead peers ---

// Completes the upgrade by hand, then ignores every frame, so the server's close frame is never answered.
async function deadPeer(port: number, token: string) {
  const client = net.connect(port, 'localhost');
  client.on('error', () => {});
  await new Promise<void>((resolve) => client.once('connect', () => resolve()));
  client.write(
    `GET ${SOCKET_PATH} HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n',
  );
  await new Promise<void>((resolve) => client.once('data', () => resolve()));
  const payload = Buffer.from(JSON.stringify({ type: 'create', name: 'Dead', token }));
  const mask = Buffer.from([1, 2, 3, 4]);
  const masked = payload.map((byte, index) => byte ^ mask[index % 4]!);
  client.write(Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, masked]));
  return client;
}

test('a peer that never answers the close frame frees its connection slot within the close timeout', async () => {
  const server = await start({ limits: { perAddress: 2, total: 100 } });
  const token = 'dead-peer-token-abcdefghij';
  const dead = await deadPeer(server.port, token);
  const room = await new Promise<string>((resolve) => {
    dead.on('data', (chunk: Buffer) => {
      const match = /"room":"([^"]+)"/.exec(chunk.toString());
      if (match) resolve(match[1]!);
    });
  });
  // The same token joining takes the slot over, which closes the dead peer's connection.
  const joiner = opened(await open(server.port));
  joiner.send(JSON.stringify({ type: 'join', room, name: 'Dead', token }));
  await new Promise((resolve) => joiner.once('message', resolve));
  // Both slots are in use until the close times out.
  expect(await open(server.port)).toEqual({ status: 503 });
  const deadline = Date.now() + (SOCKET_CLOSE_TIMEOUT + 1) * 1000;
  let freed = false;
  while (!freed && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    freed = 'socket' in (await open(server.port));
  }
  dead.destroy();
  expect(freed).toBe(true);
});

// --- static failure through startServer ---

test('a static failure reaches the shared reporter with source static', async () => {
  const reports: string[] = [];
  const looping = path.join(root, 'looping');
  await mkdir(looping, { recursive: true });
  // A symlink to itself makes stat fail with ELOOP, which is neither not-found nor a missing client.
  await symlink(path.join(looping, 'index.html'), path.join(looping, 'index.html'));
  const server = await start({ onError: (_error, source) => reports.push(source) }, looping);
  expect((await rawRequest(server.port, 'GET', '/')).status).toBe(500);
  expect(reports).toEqual(['static']);
});
