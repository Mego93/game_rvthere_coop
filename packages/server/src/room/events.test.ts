import RAPIER from '@dimforge/rapier3d-compat';
import { IDENTITY, SNAPSHOT_EVERY_TICKS, TICK_DT, getCourse, vec3, type BuiltCourse, type EventMessage } from '@lodgy/shared';
import { beforeAll, expect, test } from 'vitest';
import { createRoomServer } from './server';
import { connectFakeClient, createFakeDeps, startRun, type FakeClient } from './testing';

beforeAll(async () => {
  await RAPIER.init();
});

const token = (n: number) => `token-${n}-abcdefghij`;

const finishAtStart = (id: string): BuiltCourse => {
  const base = getCourse(id);
  return { ...base, finish: { center: base.checkpoints[0]!.spawn.pos, halfExtents: vec3(20, 20, 20), rot: IDENTITY } };
};

function setup(finishing = false) {
  const fake = createFakeDeps(RAPIER);
  const server = createRoomServer(fake.deps, { campaign: ['test', 'segment-demo'], ...(finishing ? { courses: { test: finishAtStart('test') } } : {}) });
  const host = () => {
    const client = connectFakeClient(server);
    client.send({ type: 'create', name: 'Amal', token: token(1) });
    return { client, room: client.last('welcome').room };
  };
  const guest = (room: string, n: number) => {
    const client = connectFakeClient(server);
    client.send({ type: 'join', room, name: `Guest${n}`, token: token(n) });
    return client;
  };
  const tickOnce = () => fake.advance(TICK_DT);
  return { ...fake, server, host, guest, tickOnce };
}

const events = (client: FakeClient): EventMessage[] => client.ofType('event');

test('E3a: a hurt reaches every connected client once, before the next snapshot, stamped with the tick that ran', () => {
  const { host, guest, server, tickOnce } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  badr.send({ type: 'ready', ready: true });
  startRun(client);
  tickOnce();
  tickOnce();
  const world = server.debugWorld(room)!;
  world.debugHurt('p1', 10);
  for (let i = 0; i < 6 && events(client).length === 0; i++) tickOnce();
  for (const player of [client, badr]) {
    const hurts = events(player).filter((event) => event.kind === 'hurt');
    expect(events(player)).toHaveLength(1);
    expect(hurts[0]).toMatchObject({ type: 'event', kind: 'hurt', playerId: 'p1', tick: world.snapshot().tick });
    const at = player.received.indexOf(hurts[0]!);
    const later = player.received.slice(at + 1).filter((message) => message.type === 'snapshot');
    expect(later.every((snapshot) => snapshot.tick >= hurts[0]!.tick)).toBe(true);
  }
});

test('E3b: a held slot gets no events, and none of the missed ones after it rejoins', () => {
  const { host, guest, server, tickOnce } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  badr.send({ type: 'ready', ready: true });
  startRun(client);
  tickOnce();
  badr.close();
  const before = events(badr).length;
  server.debugWorld(room)!.debugHurt('p1', 10);
  for (let i = 0; i < 4; i++) tickOnce();
  expect(events(client)).toHaveLength(1);
  expect(events(badr)).toHaveLength(before);
  const again = connectFakeClient(server);
  again.send({ type: 'join', room, name: 'Ignored', token: token(2) });
  expect(events(again)).toEqual([]);
  for (let i = 0; i < 4; i++) tickOnce();
  expect(events(again)).toEqual([]);
});

test('E3c: an event of the winning tick comes before the snapshot and results, and none follow, in results or the lobby', () => {
  const { host, advance, server } = setup(true);
  const { client, room } = host();
  startRun(client);
  server.debugWorld(room)!.debugHurt('p1', 10);
  advance(0.2);
  const types = client.received.map((message) => message.type);
  const hurt = client.received.findIndex((message) => message.type === 'event');
  const snapshot = types.indexOf('snapshot');
  const results = types.indexOf('results');
  expect(hurt).toBeGreaterThanOrEqual(0);
  expect(hurt).toBeLessThan(snapshot);
  expect(snapshot).toBeLessThan(results);
  expect(results).toBe(types.length - 1);
  expect(events(client)[0]).toMatchObject({ kind: 'hurt', tick: client.last('snapshot').tick });
  const count = events(client).length;
  server.debugWorld(room)?.debugHurt('p1', 10);
  advance(2);
  expect(events(client)).toHaveLength(count);
  client.send({ type: 'toLobby' });
  advance(2);
  expect(events(client)).toHaveLength(count);
});

test('E3d: after restartCourse an event carries the tick of the world that ran, in step with the snapshots', () => {
  const { host, advance, server, tickOnce } = setup();
  const { client, room } = host();
  startRun(client);
  advance(0.5);
  const lastTick = client.last('snapshot').tick;
  client.send({ type: 'restartCourse' });
  client.received.length = 0;
  const world = server.debugWorld(room)!;
  for (let i = 0; i < 3 * SNAPSHOT_EVERY_TICKS; i++) {
    world.debugHurt('p1', 1);
    tickOnce();
  }
  const sent = events(client);
  const snapshotTicks = client.ofType('snapshot').map((snapshot) => snapshot.tick);
  expect(sent.length).toBeGreaterThan(SNAPSHOT_EVERY_TICKS);
  expect(sent.every((event) => event.tick > lastTick)).toBe(true);
  const eventTicks = sent.map((event) => event.tick);
  expect(eventTicks).toEqual([...eventTicks].sort((a, b) => a - b));
  for (const tick of snapshotTicks) expect(eventTicks).toContain(tick);
});
