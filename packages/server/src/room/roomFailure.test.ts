import RAPIER from '@dimforge/rapier3d-compat';
import { EMPTY_ROOM_TIMEOUT, SNAPSHOT_EVERY_TICKS, TICK_RATE } from '@lodgy/shared';
import { beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { createRoomServer } from './server';
import { connectFakeClient, createFakeDeps, startRun, type FakeClient } from './testing';

// The nouns of the rooms whose simulation, or whose disposal, is made to fail, and the nouns of the rooms disposed so far.
const failing = vi.hoisted(() => new Set<string>());
const failingDispose = vi.hoisted(() => new Set<string>());
const disposed = vi.hoisted((): string[] => []);

// No message a client can send makes a room's update or disposal throw, so the failures are injected here.
vi.mock('./room', async (importOriginal) => {
  const original = await importOriginal<typeof import('./room')>();
  const createRoom: typeof original.createRoom = (...args) => {
    const room = original.createRoom(...args);
    return {
      ...room,
      update(now) {
        if (failing.has(room.noun)) throw new Error('simulation failed');
        room.update(now);
      },
      dispose() {
        disposed.push(room.noun);
        room.dispose();
        if (failingDispose.has(room.noun)) throw new Error('dispose failed');
      },
    };
  };
  return { ...original, createRoom };
});

beforeAll(async () => {
  await RAPIER.init();
});

beforeEach(() => {
  failing.clear();
  failingDispose.clear();
  disposed.length = 0;
});

// A server with fake time, the errors it reports, and a way to create a room and get its client and noun.
function setup() {
  const fake = createFakeDeps(RAPIER);
  const errors: unknown[] = [];
  // The 22 km default world costs about 4 to 5 times more per tick (about 1.5 ms vs 0.3 ms for two rooms), so the 60 s disposal wait would time out.
  const server = createRoomServer({ ...fake.deps, onError: (error) => errors.push(error) }, { campaign: ['airport'] });
  const host = (name: string, n: number) => {
    const client = connectFakeClient(server);
    client.send({ type: 'create', name, token: `token-${n}-abcdefghij` });
    return { client, room: client.last('welcome').room };
  };
  // Lets time pass a second at a time while the given clients keep answering, so that they are not dropped as silent.
  const wait = (seconds: number, ...awake: FakeClient[]) => {
    for (let elapsed = 0; elapsed < seconds; elapsed += 1) {
      fake.advance(1);
      for (const client of awake) client.send({ type: 'pong' });
    }
  };
  return { ...fake, server, errors, host, wait };
}

test('a room whose update throws is closed and reported, and the other rooms carry on', () => {
  const fake = createFakeDeps(RAPIER);
  const errors: unknown[] = [];
  const sources: string[] = [];
  const server = createRoomServer({
    ...fake.deps,
    onError: (error, source) => {
      errors.push(error);
      sources.push(source);
    },
  });
  const amal = connectFakeClient(server);
  amal.send({ type: 'create', name: 'Amal', token: 'token-1-abcdefghij' });
  const badr = connectFakeClient(server);
  badr.send({ type: 'create', name: 'Badr', token: 'token-2-abcdefghij' });
  startRun(badr);
  fake.advance(1);
  expect(server.roomCount()).toBe(2);

  // Amal's room was created first, so it is updated before Badr's on every tick.
  failing.add(amal.last('welcome').room);
  const before = badr.ofType('snapshot').length;
  fake.advance(1);

  expect(errors).toHaveLength(1);
  expect(sources).toEqual([`room:${amal.last('welcome').room}`]);
  expect(server.roomCount()).toBe(1);
  expect(amal.closedByServer).toBe(true);
  expect(badr.closedByServer).toBe(false);
  expect(badr.ofType('snapshot').length - before).toBe(TICK_RATE / SNAPSHOT_EVERY_TICKS);

  // The failed room is gone: its name can no longer be joined.
  const late = connectFakeClient(server);
  late.send({ type: 'join', room: amal.last('welcome').room, name: 'Chadi', token: 'token-3-abcdefghij' });
  expect(late.ofType('error').map((message) => message.reason)).toEqual(['unknown_room']);
});

test('an empty room is freed exactly once when it times out, and a failed room exactly once', () => {
  const { server, advance, host, wait } = setup();
  const amal = host('Amal', 1);
  const badr = host('Badr', 2);
  amal.client.close();
  wait(EMPTY_ROOM_TIMEOUT, badr.client);
  expect(disposed).toEqual([amal.room]);

  failing.add(badr.room);
  advance(1);
  expect(disposed).toEqual([amal.room, badr.room]);

  server.stop();
  expect(disposed).toEqual([amal.room, badr.room]);
});

test('a room whose disposal throws is still deleted, and is reported once', () => {
  const { server, advance, errors, host, wait } = setup();
  const amal = host('Amal', 1);
  const badr = host('Badr', 2);
  startRun(badr.client);
  failingDispose.add(amal.room);
  amal.client.close();
  wait(EMPTY_ROOM_TIMEOUT, badr.client);
  expect(server.roomCount()).toBe(1);
  expect(errors).toHaveLength(1);

  // The tick is not stuck on the room that failed: the other room still runs, and nothing more is reported.
  const before = badr.client.ofType('snapshot').length;
  advance(1);
  expect(badr.client.ofType('snapshot').length - before).toBe(TICK_RATE / SNAPSHOT_EVERY_TICKS);
  expect(errors).toHaveLength(1);
  expect(disposed).toEqual([amal.room]);
});

test('stop frees every room even when one disposal throws', () => {
  const { server, errors, host } = setup();
  const amal = host('Amal', 1);
  const badr = host('Badr', 2);
  failingDispose.add(amal.room);
  expect(() => server.stop()).not.toThrow();
  expect(disposed).toEqual([amal.room, badr.room]);
  expect(errors).toHaveLength(1);
  expect(server.roomCount()).toBe(0);
});
