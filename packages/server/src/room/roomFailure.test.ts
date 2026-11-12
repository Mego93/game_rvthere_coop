import RAPIER from '@dimforge/rapier3d-compat';
import { SNAPSHOT_EVERY_TICKS, TICK_RATE } from '@lodgy/shared';
import { beforeAll, expect, test, vi } from 'vitest';
import { createRoomServer } from './server';
import { connectFakeClient, createFakeDeps } from './testing';

// The nouns of the rooms whose simulation is made to fail.
const failing = vi.hoisted(() => new Set<string>());

// No message a client can send makes a room's update throw, so the failure is injected here.
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
    };
  };
  return { ...original, createRoom };
});

beforeAll(async () => {
  await RAPIER.init();
});

test('a room whose update throws is closed and reported, and the other rooms carry on', () => {
  const fake = createFakeDeps(RAPIER);
  const errors: unknown[] = [];
  const server = createRoomServer({ ...fake.deps, onError: (error) => errors.push(error) });
  const amal = connectFakeClient(server);
  amal.send({ type: 'create', name: 'Amal', token: 'token-1-abcdefghij' });
  const badr = connectFakeClient(server);
  badr.send({ type: 'create', name: 'Badr', token: 'token-2-abcdefghij' });
  fake.advance(1);
  expect(server.roomCount()).toBe(2);

  // Amal's room was created first, so it is updated before Badr's on every tick.
  failing.add(amal.last('welcome').room);
  const before = badr.ofType('snapshot').length;
  fake.advance(1);

  expect(errors).toHaveLength(1);
  expect(server.roomCount()).toBe(1);
  expect(amal.closedByServer).toBe(true);
  expect(badr.closedByServer).toBe(false);
  expect(badr.ofType('snapshot').length - before).toBe(TICK_RATE / SNAPSHOT_EVERY_TICKS);

  // The failed room is gone: its name can no longer be joined.
  const late = connectFakeClient(server);
  late.send({ type: 'join', room: amal.last('welcome').room, name: 'Chadi', token: 'token-3-abcdefghij' });
  expect(late.ofType('error').map((message) => message.reason)).toEqual(['unknown_room']);
});
