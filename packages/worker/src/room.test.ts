import RAPIER from '@dimforge/rapier3d-compat';
import { MAX_MESSAGE_BYTES, type Rapier } from '@lodgy/shared';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { createGameRoom, type GameRoomDeps, type ServerSocket } from './room';
import { createWorkerTimer } from './workerTimer';

beforeAll(async () => {
  await RAPIER.init();
});

type Listener = (event: { data?: unknown }) => void;

class FakeSocket implements ServerSocket {
  sent: string[] = [];
  closes: { code?: number }[] = [];
  accepted = false;
  listeners: Record<string, Listener[]> = {};
  accept() {
    this.accepted = true;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closes.push({ code });
  }
  addEventListener(type: string, listener: Listener) {
    (this.listeners[type] ??= []).push(listener);
  }
  emit(type: string, event: { data?: unknown } = {}) {
    for (const listener of this.listeners[type] ?? []) listener(event);
  }
  message(value: unknown) {
    this.emit('message', { data: typeof value === 'string' ? value : JSON.stringify(value) });
  }
  types() {
    return this.sent.map((s) => (JSON.parse(s) as { type: string }).type);
  }
}

function setup(overrides: Partial<GameRoomDeps<FakeSocket>> = {}) {
  vi.useFakeTimers();
  const sockets: FakeSocket[] = [];
  const errors: unknown[] = [];
  const timer = createWorkerTimer((error) => errors.push(error));
  const room = createGameRoom<FakeSocket>({
    rapier: RAPIER as unknown as Rapier,
    clock: () => performance.now() / 1000,
    random: () => 0,
    timer,
    onError: (error) => errors.push(error),
    createPair: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return { client: socket, server: socket };
    },
    ...overrides,
  });
  return { room, sockets, errors, timer };
}

const create = { type: 'create', name: 'Amal', token: 'tokentokentoken0001xx' };
const join = (noun: string, n: number) => ({ type: 'join', room: noun, name: 'P' + n, token: `tokentokentoken000${n}xx` });

afterEach(() => vi.useRealTimers());

test('an upgrade is accepted, handed to the room server, and create makes the pinned room', () => {
  const { room, sockets } = setup();
  const result = room.upgrade('tagine', '1.2.3.4');
  expect(result.accepted).toBe(true);
  expect(sockets[0]!.accepted).toBe(true);
  sockets[0]!.message(create);
  const welcome = JSON.parse(sockets[0]!.sent.find((s) => s.includes('"welcome"'))!) as { room: string };
  expect(welcome.room).toBe('tagine');
  expect(room.roomCount()).toBe(1);
  expect(room.connections()).toBe(1);
});

test('a join of another noun is unknown_room; a bad noun is 400', () => {
  const { room, sockets } = setup();
  expect(room.upgrade('Bad Noun', null)).toEqual({ accepted: false, status: 400 });
  room.upgrade('tagine', null);
  sockets[0]!.message(join('camel', 1));
  expect(sockets[0]!.sent.join()).toContain('unknown_room');
});

test('binary messages close with 1003, oversized (UTF-8 bytes) with 1009', () => {
  const { room, sockets } = setup();
  room.upgrade('tagine', null);
  room.upgrade('tagine', null);
  room.upgrade('tagine', null);
  sockets[0]!.emit('message', { data: new ArrayBuffer(4) });
  expect(sockets[0]!.closes).toEqual([{ code: 1003 }]);
  sockets[1]!.message('a'.repeat(MAX_MESSAGE_BYTES + 1));
  expect(sockets[1]!.closes).toEqual([{ code: 1009 }]);
  const multi = 'é'.repeat(2100);
  expect(multi.length).toBeLessThan(MAX_MESSAGE_BYTES);
  sockets[2]!.message(multi);
  expect(sockets[2]!.closes).toEqual([{ code: 1009 }]);
});

test('limits answer 503 when full and 429 when one address has too many', () => {
  const { room } = setup({ limits: { perRoom: 3, perAddress: 2 } });
  expect(room.upgrade('tagine', '1.1.1.1').accepted).toBe(true);
  expect(room.upgrade('tagine', '1.1.1.1').accepted).toBe(true);
  expect(room.upgrade('tagine', '1.1.1.1')).toEqual({ accepted: false, status: 429 });
  expect(room.upgrade('tagine', '2.2.2.2').accepted).toBe(true);
  expect(room.upgrade('tagine', '3.3.3.3')).toEqual({ accepted: false, status: 503 });
});

test('the count drops exactly once however many close and error events arrive', () => {
  const { room, sockets } = setup({ limits: { perRoom: 2, perAddress: 2 } });
  room.upgrade('tagine', '1.1.1.1');
  room.upgrade('tagine', '1.1.1.1');
  expect(room.connections()).toBe(2);
  sockets[0]!.emit('close');
  sockets[0]!.emit('error');
  sockets[0]!.emit('close');
  expect(room.connections()).toBe(1);
  sockets[1]!.message(new ArrayBuffer(1) as unknown as string);
  sockets[1]!.emit('close');
  expect(room.connections()).toBe(0);
});

test('timers pause when idle and resume on the next connect', () => {
  const { room, sockets, timer } = setup();
  room.upgrade('tagine', null);
  sockets[0]!.message(create);
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  sockets[0]!.emit('close');
  // The room outlives its last connection until its timeout, so timers run on.
  expect(room.roomCount()).toBe(1);
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  vi.advanceTimersByTime(130_000);
  expect(room.roomCount()).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  room.upgrade('tagine', null);
  expect(vi.getTimerCount()).toBeGreaterThan(0);
});

test('a connection that never created a room pauses the timers on close', () => {
  const { room, sockets } = setup();
  room.upgrade('tagine', null);
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  sockets[0]!.emit('close');
  expect(vi.getTimerCount()).toBe(0);
});

test('claim: free, taken while claimed, taken while connected, released by the first connect', () => {
  const { room, sockets } = setup();
  expect(room.claim()).toBe('free');
  expect(room.claim()).toBe('taken');
  room.upgrade('tagine', null, true);
  expect(room.claim()).toBe('taken');
  sockets[0]!.emit('close');
  expect(room.claim()).toBe('free');
});

test('a joiner does not release the claim; only a create does', () => {
  const { room, sockets } = setup();
  expect(room.claim()).toBe('free');
  room.upgrade('tagine', null, false);
  sockets[0]!.emit('close');
  expect(room.claim()).toBe('taken');
  room.upgrade('tagine', null, true);
  sockets[1]!.emit('close');
  expect(room.claim()).toBe('free');
});

test('a bad or reserved noun is refused with 400', () => {
  const { room } = setup();
  expect(room.upgrade('assets', null)).toEqual({ accepted: false, status: 400 });
  expect(room.upgrade('a'.repeat(33), null)).toEqual({ accepted: false, status: 400 });
});

test('a connection the room server closes frees its slot at once, and the idle pause follows', () => {
  const { room, sockets } = setup({ limits: { perRoom: 5, perAddress: 5 } });
  room.upgrade('tagine', '1.1.1.1', true);
  const socket = sockets[0]!;
  expect(room.connections()).toBe(1);
  // Silent peer: no message for SILENCE_TIMEOUT, so the room server drops it, and no close event ever arrives.
  vi.advanceTimersByTime(120_000);
  expect(socket.closes.length).toBeGreaterThan(0);
  expect(room.connections()).toBe(0);
  expect(room.claim()).toBe('free');
  expect(vi.getTimerCount()).toBe(0);
});
