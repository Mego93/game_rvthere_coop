import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NEUTRAL_INPUT, SOCKET_PATH, TICK_DT, type ClientMessage, type ServerMessage } from '@lodgy/shared';
import { afterAll, beforeAll, expect, test } from 'vitest';
import WebSocket from 'ws';
import { startServer, type RunningServer } from './listen';
import { contentType, resolveStaticPath } from './static';

let root: string;
let clientDir: string;
let server: RunningServer;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'lodgy-server-test-'));
  clientDir = path.join(root, 'dist');
  await mkdir(path.join(clientDir, 'assets'), { recursive: true });
  await writeFile(path.join(clientDir, 'index.html'), '<!doctype html><title>client</title>');
  await writeFile(path.join(clientDir, 'assets', 'app.js'), 'console.log("app")');
  await writeFile(path.join(root, 'secret.txt'), 'outside the client folder');
  server = await startServer({ port: 0, clientDir });
});

afterAll(async () => {
  await server.close();
  await rm(root, { recursive: true, force: true });
});

const url = (pathname: string) => `http://localhost:${server.port}${pathname}`;

// Sends a request whose path is not normalised first, as fetch would do.
function rawGet(pathname: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = request({ host: 'localhost', port: server.port, path: pathname, method: 'GET' }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

interface TestClient {
  received: ServerMessage[];
  send(message: ClientMessage): void;
  // Resolves with the first message, already received or yet to come, that satisfies the test.
  waitFor<T extends ServerMessage>(test: (message: ServerMessage) => message is T): Promise<T>;
  closed: Promise<void>;
  socket: WebSocket;
}

async function connect(): Promise<TestClient> {
  const socket = new WebSocket(`ws://localhost:${server.port}${SOCKET_PATH}`);
  const received: ServerMessage[] = [];
  const waiting: (() => void)[] = [];
  socket.on('message', (data) => {
    received.push(JSON.parse(data.toString()) as ServerMessage);
    for (const check of waiting.splice(0)) check();
  });
  const closed = new Promise<void>((resolve) => socket.on('close', () => resolve()));
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return {
    received,
    socket,
    closed,
    send: (message) => socket.send(JSON.stringify(message)),
    waitFor<T extends ServerMessage>(test: (message: ServerMessage) => message is T) {
      return new Promise<T>((resolve) => {
        const check = () => {
          const found = received.find(test);
          if (found) resolve(found);
          else waiting.push(check);
        };
        check();
      });
    },
  };
}

const isWelcome = (message: ServerMessage) => message.type === 'welcome';
const isSnapshot = (message: ServerMessage) => message.type === 'snapshot';
type Welcome = Extract<ServerMessage, { type: 'welcome' }>;
type Snapshot = Extract<ServerMessage, { type: 'snapshot' }>;

test('serves the client at the root and at any room address', async () => {
  for (const pathname of ['/', '/camel', '/index.html']) {
    const response = await fetch(url(pathname));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(await response.text()).toContain('<title>client</title>');
  }
});

test('serves built assets with a long cache life', async () => {
  const response = await fetch(url('/assets/app.js'));
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
  expect(response.headers.get('cache-control')).toContain('immutable');
  expect(await response.text()).toBe('console.log("app")');
});

test('answers 404 for a missing file and 405 for a method other than GET or HEAD', async () => {
  expect((await fetch(url('/assets/missing.js'))).status).toBe(404);
  expect((await fetch(url('/'), { method: 'POST' })).status).toBe(405);
});

test('never serves a file outside the client folder', async () => {
  for (const pathname of ['/../secret.txt', '/%2e%2e/secret.txt', '/assets/../../secret.txt', '/..%2fsecret.txt']) {
    const { body } = await rawGet(pathname);
    expect(body).not.toContain('outside the client folder');
  }
  expect(resolveStaticPath('/srv/dist', '/../../etc/passwd')).toBe(path.join('/srv/dist', 'etc/passwd'));
  expect(resolveStaticPath('/srv/dist', '/%E0%A4%A')).toBeNull();
});

test('knows the content types the client needs', () => {
  expect(contentType('a/b/index.html')).toBe('text/html; charset=utf-8');
  expect(contentType('x.wasm')).toBe('application/wasm');
  expect(contentType('x.unknown')).toBe('application/octet-stream');
});

test('two clients share a room, and the first one drives the vehicle both see', async () => {
  const amal = await connect();
  amal.send({ type: 'create', name: 'Amal', token: 'integration-token-amal' });
  const { room } = await amal.waitFor((message): message is Welcome => isWelcome(message));

  const badr = await connect();
  badr.send({ type: 'join', room, name: 'Badr', token: 'integration-token-badr' });
  const welcome = await badr.waitFor((message): message is Welcome => isWelcome(message));
  expect(welcome).toEqual({ type: 'welcome', playerId: 'p2', room });

  // Amal holds the throttle, one input per tick, as the browser client does.
  let seq = 0;
  const driving = setInterval(() => {
    seq += 1;
    amal.send({ type: 'input', ...NEUTRAL_INPUT, moveY: 1, seq });
  }, TICK_DT * 1000);
  const moved = (message: ServerMessage): message is Snapshot => isSnapshot(message) && message.vehicle.pos.z < -1;
  const [seenByAmal, seenByBadr] = await Promise.all([amal.waitFor(moved), badr.waitFor(moved)]);
  clearInterval(driving);

  expect(seenByAmal.ackSeq).toBeGreaterThan(0);
  expect(seenByBadr.ackSeq).toBe(0);
  expect(badr.received.find(isSnapshot)).toMatchObject({ full: true });
  amal.socket.close();
  badr.socket.close();
});

test('a join to a room that does not exist is refused', async () => {
  const client = await connect();
  client.send({ type: 'join', room: 'nowhere', name: 'Amal', token: 'integration-token-amal' });
  const error = await client.waitFor(
    (message): message is Extract<ServerMessage, { type: 'error' }> => message.type === 'error',
  );
  expect(error.reason).toBe('unknown_room');
  client.socket.close();
});

test('a binary message or an oversized message closes the connection', async () => {
  const binary = await connect();
  binary.socket.send(new Uint8Array([1, 2, 3]));
  await binary.closed;

  const oversized = await connect();
  oversized.socket.send('x'.repeat(5000));
  await oversized.closed;
});
