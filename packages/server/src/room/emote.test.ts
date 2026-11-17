import RAPIER from '@dimforge/rapier3d-compat';
import { EMOTES, EMOTE_COOLDOWN, IDENTITY, NEUTRAL_INPUT, TICK_DT, getCourse, vec3, type BuiltCourse, type Emote } from '@lodgy/shared';
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
  return { ...fake, server, host, guest, tickOnce: () => fake.advance(TICK_DT) };
}

const emotes = (client: FakeClient) => client.ofType('emote');
const send = (client: FakeClient, emote: Emote) => client.send({ type: 'emote', emote });

function playing() {
  const s = setup();
  const { client, room } = s.host();
  const badr = s.guest(room, 2);
  badr.send({ type: 'ready', ready: true });
  startRun(client);
  s.tickOnce();
  s.tickOnce();
  return { ...s, client, badr, room };
}

test('R2: an emote from a player on foot reaches every connected player, the sender included, with the server id', () => {
  const { client, badr, tickOnce } = playing();
  tickOnce();
  send(badr, 'dab');
  for (const player of [client, badr]) expect(emotes(player)).toEqual([{ type: 'emote', playerId: 'p2', emote: 'dab' }]);
});

test.each(EMOTES)('the emote %s is relayed', (emote) => {
  const { client, badr } = playing();
  send(client, emote);
  expect(emotes(badr)).toEqual([{ type: 'emote', playerId: 'p1', emote }]);
});

test('a spoofed playerId in the client message has no effect, and an unknown emote is refused as a bad message', () => {
  const { client, badr } = playing();
  badr.sendRaw(JSON.stringify({ type: 'emote', emote: 'wave', playerId: 'p1' }));
  expect(emotes(client)).toEqual([{ type: 'emote', playerId: 'p2', emote: 'wave' }]);
  badr.send({ type: 'emote', emote: 'nope' as Emote });
  expect(badr.last('error').reason).toBe('bad_message');
  expect(emotes(client)).toHaveLength(1);
});

test('refused silently in the lobby, and before joining', () => {
  const { host, guest, server } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  send(client, 'wave');
  expect(emotes(client)).toEqual([]);
  expect(emotes(badr)).toEqual([]);
  expect(client.ofType('error')).toEqual([]);
  const stranger = connectFakeClient(server);
  send(stranger, 'wave');
  expect(stranger.received).toEqual([]);
});

test('refused silently in the results', () => {
  const { host, tickOnce } = setup(true);
  const { client } = host();
  startRun(client);
  for (let i = 0; i < 10 && client.ofType('results').length === 0; i++) tickOnce();
  expect(client.ofType('results')).toHaveLength(1);
  send(client, 'wave');
  expect(emotes(client)).toEqual([]);
  expect(client.ofType('error')).toEqual([]);
});

test('refused silently while seated', () => {
  const { client, badr, tickOnce, server, room } = playing();
  client.send({ type: 'input', ...NEUTRAL_INPUT, seq: 1, interact: true });
  tickOnce();
  tickOnce();
  expect(server.debugWorld(room)!.snapshot().players[0]!.seat).not.toBeNull();
  send(client, 'wave');
  expect(emotes(badr)).toEqual([]);
  expect(emotes(client)).toEqual([]);
});

test('refused silently while downed', () => {
  const { client, badr, tickOnce, server, room } = playing();
  server.debugWorld(room)!.debugHurt('p1', 100);
  tickOnce();
  expect(server.debugWorld(room)!.snapshot().players[0]!.downed).not.toBeNull();
  send(client, 'wave');
  expect(emotes(badr)).toEqual([]);
});

test('refused silently while respawning from the kill plane', () => {
  const { client, badr, tickOnce, server, room } = playing();
  const world = server.debugWorld(room)!;
  world.teleportPlayer('p1', vec3(0, world.course.killPlaneY - 5, 5));
  for (let i = 0; i < 3 && world.snapshot().players[0]!.pos.y > world.course.killPlaneY; i++) tickOnce();
  tickOnce();
  tickOnce();
  expect(world.canEmote('p1')).toBe(false);
  send(client, 'wave');
  expect(emotes(badr)).toEqual([]);
});

test('one emote per 3 s: a second inside the cooldown is dropped, one at 3 s passes, and the dropped one does not restart the timer', () => {
  const { client, badr, advance } = playing();
  send(client, 'sixSeven');
  expect(emotes(badr)).toHaveLength(1);
  advance(EMOTE_COOLDOWN - 0.5);
  send(client, 'dab');
  expect(emotes(badr)).toHaveLength(1);
  advance(0.5);
  send(client, 'dance');
  expect(emotes(badr).map((m) => m.emote)).toEqual(['sixSeven', 'dance']);
  advance(1);
  send(client, 'wave');
  expect(emotes(badr)).toHaveLength(2);
});

test('the cooldown is per player', () => {
  const { client, badr } = playing();
  send(client, 'wave');
  send(badr, 'wave');
  expect(emotes(client).map((m) => m.playerId)).toEqual(['p1', 'p2']);
});

test('the cooldown survives a reconnect', () => {
  const { client, badr, server, advance } = playing();
  send(badr, 'wave');
  badr.close();
  advance(1);
  const back = connectFakeClient(server);
  back.send({ type: 'join', room: client.last('welcome').room, name: 'Guest2', token: token(2) });
  send(back, 'dab');
  expect(emotes(client).map((m) => m.emote)).toEqual(['wave']);
});

test('an emote does not share the chat bucket', () => {
  const { client, badr } = playing();
  for (let i = 0; i < 4; i++) client.send({ type: 'chat', text: `line ${i}` });
  send(client, 'wave');
  expect(emotes(badr)).toHaveLength(1);
  expect(badr.ofType('chat')).toHaveLength(4);
});
