import { SOCKET_PATH, type ServerMessage } from '@lodgy/shared';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import WebSocket from 'ws';
import { startServer, type RunningServer } from './listen';

// What the stand-in room server below is told to do.
const failing = vi.hoisted(() => ({ tick: false }));

// The real room layer does not throw on any message, so failures are injected around it.
vi.mock('../room/server', async (importOriginal) => {
  const original = await importOriginal<typeof import('../room/server')>();
  const createRoomServer: typeof original.createRoomServer = (deps, options) => {
    const server = original.createRoomServer(deps, options);
    const stopFailingTimer = deps.timer.every(0.01, () => {
      if (failing.tick) throw new Error('tick failed');
    });
    return {
      ...server,
      connect(connection) {
        const handle = server.connect(connection);
        return {
          message(data) {
            if (data === 'throw') throw new Error('message failed');
            handle.message(data);
          },
          closed() {
            handle.closed();
            throw new Error('closed failed');
          },
        };
      },
      stop() {
        stopFailingTimer();
        server.stop();
      },
    };
  };
  return { ...original, createRoomServer };
});

const errors: string[] = [];
let server: RunningServer;

beforeAll(async () => {
  server = await startServer({
    port: 0,
    clientDir: '/nonexistent',
    onError: (error) => errors.push(error instanceof Error ? error.message : String(error)),
  });
});

afterAll(async () => {
  await server.close();
});

function open(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${server.port}${SOCKET_PATH}`);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}
const closed = (socket: WebSocket) => new Promise<void>((resolve) => socket.once('close', () => resolve()));

test('a failure while handling a message drops that connection only', async () => {
  const bystander = await open();
  const culprit = await open();
  const culpritClosed = closed(culprit);
  culprit.send('throw');
  await culpritClosed;
  expect(errors).toContain('message failed');
  // The close handler failed too, and that was contained as well.
  await vi.waitFor(() => expect(errors).toContain('closed failed'));

  // The other connection still works: it can create a room.
  const welcome = new Promise<ServerMessage>((resolve) =>
    bystander.once('message', (data) => resolve(JSON.parse(data.toString()) as ServerMessage)),
  );
  bystander.send(JSON.stringify({ type: 'create', name: 'Amal', token: 'failure-token-amal' }));
  expect((await welcome).type).toBe('welcome');
  const bystanderClosed = closed(bystander);
  bystander.close();
  await bystanderClosed;
});

test('a failure inside a timer callback is reported and the server keeps running', async () => {
  failing.tick = true;
  await vi.waitFor(() => expect(errors).toContain('tick failed'));
  failing.tick = false;

  const socket = await open();
  const welcome = new Promise<ServerMessage>((resolve) =>
    socket.once('message', (data) => resolve(JSON.parse(data.toString()) as ServerMessage)),
  );
  socket.send(JSON.stringify({ type: 'create', name: 'Badr', token: 'failure-token-badr' }));
  expect((await welcome).type).toBe('welcome');
  const socketClosed = closed(socket);
  socket.close();
  await socketClosed;
});
