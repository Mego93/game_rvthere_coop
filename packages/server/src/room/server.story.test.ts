import RAPIER from '@dimforge/rapier3d-compat';
import { defaultAppearance, getCourse, serialiseWeek, newWeek, type BuiltCourse } from '@lodgy/shared';
import { beforeAll, expect, test } from 'vitest';
import { createRoomServer } from './server';
import { connectFakeClient, createFakeDeps } from './testing';
import { createMemoryWeekStore } from './weekStore';

beforeAll(async () => {
  await RAPIER.init();
});

const token = (n: number) => `token-${n}-abcdefghij`;
const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};
const villa: BuiltCourse = { ...getCourse('test'), id: 'villa', pickups: [] };

function setup() {
  const fake = createFakeDeps(RAPIER);
  const store = createMemoryWeekStore();
  const server = createRoomServer(fake.deps, { courses: { villa }, campaign: ['test'], weekStore: store, fixedNoun: 'camel' });
  const admin = connectFakeClient(server);
  admin.send({ type: 'create', name: 'Amal', token: token(1) });
  const guest = connectFakeClient(server, 'other');
  guest.send({ type: 'join', room: 'camel', name: 'Badr', token: token(2) });
  return { fake, server, store, admin, guest };
}

const story = { type: 'configure', courseId: 'test', vehicleId: 'lodgy', timeOfDay: 'midday', weather: 'clear', chain: false, mode: 'story' } as const;

test('story messages are routed: resetWeek is admin-only, phone and complain need a story run, and the room uses the server store', async () => {
  const { fake, server, store, admin, guest } = setup();
  guest.send({ type: 'resetWeek' });
  expect(guest.ofType('error').map((message) => message.reason)).toEqual(['not_admin']);
  guest.send({ type: 'phone', action: { kind: 'withdraw', amount: 100 } });
  expect(guest.ofType('error').map((message) => message.reason)).toEqual(['not_admin', 'bad_phase']);
  guest.send({ type: 'complain' });
  expect(guest.ofType('error')).toHaveLength(2);

  await store.save('camel', serialiseWeek({ ...newWeek(), day: 5, finishedDays: [1, 2, 3, 4] }));
  admin.send(story);
  await flush();
  fake.advance(0.1);
  expect(admin.last('lobby').story).toEqual({ day: 5, finishedDays: [1, 2, 3, 4] });

  guest.send({ type: 'appearance', ...defaultAppearance('luiz') });
  guest.send({ type: 'ready', ready: true });
  admin.send({ type: 'start' });
  fake.advance(0.2);
  expect(admin.last('stage')).toEqual({ type: 'stage', courseId: 'villa', index: 0, of: 1 });
  guest.send({ type: 'phone', action: { kind: 'withdraw', amount: 100 } });
  expect(guest.ofType('error')).toHaveLength(2);
  guest.send({ type: 'phone', action: { kind: 'withdraw', amount: 100000 } });
  expect(guest.last('error').reason).toBe('cannot_buy');
  guest.send({ type: 'complain' });
  expect(admin.last('complain').playerId).toBe('p2');
  fake.advance(0.1);
  expect(admin.last('storyState').friends.luiz?.cash).toBe(100);
  server.stop();
});
