import RAPIER from '@dimforge/rapier3d-compat';
import { CHAT_BURST, CHAT_HISTORY, CHAT_REFILL_SECONDS, IDENTITY, getCourse, vec3, type BuiltCourse, type ServerMessage } from '@lodgy/shared';
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

const TWO = ['test', 'segment-demo'];

function setup(finishing = false) {
  const fake = createFakeDeps(RAPIER);
  const server = createRoomServer(fake.deps, finishing ? { campaign: TWO, courses: { test: finishAtStart('test'), 'segment-demo': finishAtStart('segment-demo') } } : { campaign: TWO });
  const host = (name = 'Amal') => {
    const client = connectFakeClient(server);
    client.send({ type: 'create', name, token: token(1) });
    return { client, room: client.last('welcome').room };
  };
  const guest = (room: string, n: number, name = `Guest${n}`) => {
    const client = connectFakeClient(server);
    client.send({ type: 'join', room, name, token: token(n) });
    return client;
  };
  return { ...fake, server, host, guest };
}

const lines = (client: FakeClient) => client.ofType('chat').map(({ id, playerId, name, text }) => ({ id, playerId, name, text }));
const say = (client: FakeClient, text: string) => client.send({ type: 'chat', text });

test('a chat reaches every player, the sender included, with the server id and name', () => {
  const { host, guest, advance } = setup();
  const { client, room } = host();
  const badr = guest(room, 2, 'Badr');
  for (let i = 0; i < 7; i++) {
    advance(1);
    client.send({ type: 'pong' });
    badr.send({ type: 'pong' });
  }
  advance(0.9);
  say(badr, ' Wait for me ');
  expect(lines(client)).toEqual([{ id: 1, playerId: 'p2', name: 'Badr', text: 'Wait for me' }]);
  expect(lines(badr)).toEqual(lines(client));
  expect(client.last('chat').at).toBe(7);
});

test('a spoofed name or playerId in the client message has no effect', () => {
  const { host, guest } = setup();
  const { client, room } = host();
  const badr = guest(room, 2, 'Badr');
  badr.sendRaw(JSON.stringify({ type: 'chat', text: 'hi', name: 'Amal', playerId: 'p1', id: 99, at: 5 }));
  expect(lines(client)).toEqual([{ id: 1, playerId: 'p2', name: 'Badr', text: 'hi' }]);
});

test('an invalid chat gets bad_message and is not relayed', () => {
  const { host } = setup();
  const { client } = host();
  say(client, '   ');
  expect(client.ofType('chat')).toEqual([]);
  expect(client.ofType('error').map((message) => message.reason)).toEqual(['bad_message']);
});

test('chat is relayed in the lobby, while playing and in the results', () => {
  const { host, guest, advance } = setup(true);
  const { client, room } = host();
  const badr = guest(room, 2, 'Badr');
  say(badr, 'lobby');
  badr.send({ type: 'ready', ready: true });
  startRun(client);
  say(client, 'playing');
  advance(0.1);
  expect(client.last('lobby').phase).toBe('results');
  say(badr, 'results');
  expect(lines(client).map((line) => line.text)).toEqual(['lobby', 'playing', 'results']);
  expect(lines(badr)).toEqual(lines(client));
  // The counter is not reset by the phase changes.
  expect(lines(client).map((line) => line.id)).toEqual([1, 2, 3]);
});

test('the id keeps rising across toLobby and next', () => {
  const { host, advance } = setup(true);
  const { client } = host();
  startRun(client);
  advance(0.1);
  say(client, 'one');
  client.send({ type: 'next' });
  say(client, 'two');
  client.send({ type: 'toLobby' });
  say(client, 'three');
  expect(lines(client).map((line) => line.id)).toEqual([1, 2, 3]);
});

test('a burst of four passes, the fifth is dropped without an error, and one passes after 1.5 s', () => {
  const { host, advance } = setup();
  const { client } = host();
  for (let i = 1; i <= CHAT_BURST + 1; i++) say(client, `m${i}`);
  expect(lines(client).map((line) => line.text)).toEqual(['m1', 'm2', 'm3', 'm4']);
  expect(client.ofType('error')).toEqual([]);
  advance(CHAT_REFILL_SECONDS - 0.1);
  client.send({ type: 'pong' });
  say(client, 'early');
  expect(lines(client)).toHaveLength(4);
  advance(0.1);
  client.send({ type: 'pong' });
  say(client, 'm6');
  say(client, 'm7');
  expect(lines(client).map((line) => line.text)).toEqual(['m1', 'm2', 'm3', 'm4', 'm6']);
});

test('the bucket is per player', () => {
  const { host, guest } = setup();
  const { client, room } = host();
  const badr = guest(room, 2, 'Badr');
  for (let i = 0; i < CHAT_BURST + 2; i++) say(client, `a${i}`);
  say(badr, 'b');
  expect(lines(badr).filter((line) => line.playerId === 'p2')).toHaveLength(1);
});

test('a reconnect does not refill the bucket', () => {
  const { host, server } = setup();
  const { client, room } = host();
  for (let i = 0; i < CHAT_BURST; i++) say(client, `a${i}`);
  const again = connectFakeClient(server);
  again.send({ type: 'join', room, name: 'Amal', token: token(1) });
  say(again, 'blocked');
  expect(lines(again).map((line) => line.text)).toEqual(['a0', 'a1', 'a2', 'a3']);
});

test('the history keeps the last 30 lines in order and goes to a joiner after welcome and lobby', () => {
  const { host, guest, advance } = setup();
  const { client, room } = host();
  for (let i = 1; i <= CHAT_HISTORY + 1; i++) {
    say(client, `m${i}`);
    advance(CHAT_REFILL_SECONDS);
    client.send({ type: 'pong' });
  }
  const badr = guest(room, 2);
  expect(badr.received.map((message: ServerMessage) => message.type)).toEqual(['welcome', 'lobby', ...Array<string>(CHAT_HISTORY).fill('chat')]);
  expect(badr.ofType('chat').map((line) => line.text)).toEqual(Array.from({ length: CHAT_HISTORY }, (_, i) => `m${i + 2}`));
  expect(badr.ofType('chat').map((line) => line.id)).toEqual(Array.from({ length: CHAT_HISTORY }, (_, i) => i + 2));
  // The others are not sent it again.
  expect(client.ofType('chat')).toHaveLength(CHAT_HISTORY + 1);
});

test('a joiner in the results gets welcome, lobby, results, then the history', () => {
  const { host, guest, advance } = setup(true);
  const { client, room } = host();
  say(client, 'before');
  startRun(client);
  advance(0.1);
  const badr = guest(room, 2);
  expect(badr.received.map((message: ServerMessage) => message.type)).toEqual(['welcome', 'lobby', 'results', 'chat']);
});

test('a reconnecting player gets the history once, and history outlives the run', () => {
  const { host, advance, server } = setup(true);
  const { client, room } = host();
  say(client, 'one');
  startRun(client);
  advance(0.1);
  say(client, 'two');
  client.send({ type: 'toLobby' });
  client.close();
  const again = connectFakeClient(server);
  again.send({ type: 'join', room, name: 'Amal', token: token(1) });
  expect(lines(again).map((line) => line.text)).toEqual(['one', 'two']);
});

test('a player who was away does not see lines relayed meanwhile live, only in the history', () => {
  const { host, guest, server } = setup();
  const { client, room } = host();
  const badr = guest(room, 2, 'Badr');
  badr.close();
  say(client, 'while away');
  expect(lines(badr)).toEqual([]);
  const again = connectFakeClient(server);
  again.send({ type: 'join', room, name: 'Badr', token: token(2) });
  expect(lines(again).map((line) => line.text)).toEqual(['while away']);
});

test('a chat from a connection that has not joined is ignored without an error', () => {
  const { server } = setup();
  const lone = connectFakeClient(server);
  lone.send({ type: 'chat', text: 'hello' });
  expect(lone.received).toEqual([]);
});

test('an empty history sends nothing extra', () => {
  const { host, guest } = setup();
  const { room } = host();
  expect(guest(room, 2).received.map((message) => message.type)).toEqual(['welcome', 'lobby']);
});
