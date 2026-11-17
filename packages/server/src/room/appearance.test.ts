import RAPIER from '@dimforge/rapier3d-compat';
import { CHARACTER_IDS, HELD_SLOT_TIMEOUT, IDENTITY, defaultAppearance, getCourse, vec3, type Appearance, type BuiltCourse } from '@lodgy/shared';
import { beforeAll, expect, test } from 'vitest';
import { createRoomServer } from './server';
import { connectFakeClient, createFakeDeps, startRun, type FakeClient } from './testing';

beforeAll(async () => {
  await RAPIER.init();
});

const token = (n: number) => `token-${n}-abcdefghij`;

function setup() {
  const fake = createFakeDeps(RAPIER);
  const server = createRoomServer(fake.deps, { campaign: ['test'] });
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

const reasons = (client: FakeClient) => client.ofType('error').map((message) => message.reason);
const looks = (client: FakeClient) => client.last('lobby').players.map((player) => player.appearance);
const choose = (client: FakeClient, appearance: Appearance) => client.send({ type: 'appearance', ...appearance });

test('the first six joiners get six distinct characters in index order', () => {
  const { host, guest } = setup();
  const { client, room } = host();
  for (let n = 2; n <= 6; n += 1) guest(room, n);
  expect(looks(client)).toEqual(CHARACTER_IDS.map((id) => defaultAppearance(id)));
});

test('a seventh joiner is room_full as before', () => {
  const { host, guest } = setup();
  const { client, room } = host();
  for (let n = 2; n <= 6; n += 1) guest(room, n);
  const late = guest(room, 7);
  expect(reasons(late)).toEqual(['room_full']);
  expect(looks(client)).toHaveLength(6);
});

test('the lobby entry shows the chosen appearance, broadcast to everyone', () => {
  const { host, guest } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  const chosen: Appearance = { characterId: 'luiz', glasses: 'round', top: 'suit', hat: 'fez' };
  choose(badr, chosen);
  for (const watcher of [client, badr]) expect(looks(watcher)).toEqual([defaultAppearance('sounile'), chosen]);
  expect(reasons(badr)).toEqual([]);
});

test('an identical appearance is accepted without a broadcast', () => {
  const { host } = setup();
  const { client } = host();
  const before = client.ofType('lobby').length;
  choose(client, defaultAppearance('sounile'));
  expect(client.ofType('lobby')).toHaveLength(before);
  expect(reasons(client)).toEqual([]);
});

test('character_taken goes to the sender alone when another player has it', () => {
  const { host, guest } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  const before = client.ofType('lobby').length;
  choose(badr, defaultAppearance('sounile'));
  expect(reasons(badr)).toEqual(['character_taken']);
  expect(reasons(client)).toEqual([]);
  expect(client.ofType('lobby')).toHaveLength(before);
  expect(looks(client)[1]).toEqual(defaultAppearance('rafael'));
});

test('character_taken also holds while the owner is disconnected but held', () => {
  const { host, guest } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  badr.close();
  choose(client, defaultAppearance('rafael'));
  expect(reasons(client)).toEqual(['character_taken']);
});

test('a player keeps their own character while changing the add-ons', () => {
  const { host } = setup();
  const { client } = host();
  const next: Appearance = { characterId: 'sounile', glasses: 'none', top: 'sweatshirt', hat: 'cap' };
  choose(client, next);
  expect(reasons(client)).toEqual([]);
  expect(looks(client)).toEqual([next]);
});

test('switching to a free character frees the old one for the next joiner', () => {
  const { host, guest } = setup();
  const { client, room } = host();
  choose(client, defaultAppearance('huu'));
  const badr = guest(room, 2);
  expect(looks(badr)).toEqual([defaultAppearance('huu'), defaultAppearance('sounile')]);
});

test('appearance is refused with bad_phase in playing and in results, and nothing changes', () => {
  const { host, advance } = setup();
  const { client } = host();
  startRun(client);
  advance(0.1);
  choose(client, { characterId: 'luiz', glasses: 'none', top: 'default', hat: 'none' });
  expect(reasons(client)).toEqual(['bad_phase']);
  expect(looks(client)).toEqual([defaultAppearance('sounile')]);
});

test('appearance is refused with bad_phase in results', () => {
  const base = getCourse('test');
  const finishing: BuiltCourse = { ...base, finish: { center: base.checkpoints[0]!.spawn.pos, halfExtents: vec3(20, 20, 20), rot: IDENTITY } };
  const fake = createFakeDeps(RAPIER);
  const server = createRoomServer(fake.deps, { campaign: ['test'], courses: { test: finishing } });
  const client = connectFakeClient(server);
  client.send({ type: 'create', name: 'Amal', token: token(1) });
  startRun(client);
  fake.advance(0.1);
  expect(client.last('lobby').phase).toBe('results');
  choose(client, { characterId: 'luiz', glasses: 'none', top: 'default', hat: 'none' });
  expect(reasons(client)).toEqual(['bad_phase']);
  expect(looks(client)).toEqual([defaultAppearance('sounile')]);
});

test('a joiner during playing gets a default appearance in the lobby message', () => {
  const { host, guest } = setup();
  const { client, room } = host();
  startRun(client);
  const badr = guest(room, 2);
  expect(badr.last('lobby').phase).toBe('playing');
  expect(looks(badr)).toEqual([defaultAppearance('sounile'), defaultAppearance('rafael')]);
});

test('a reconnecting player keeps the look, and a joiner in between takes another character', () => {
  const { host, guest, server } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  const chosen: Appearance = { characterId: 'alexander', glasses: 'round', top: 'suit', hat: 'cap' };
  choose(badr, chosen);
  badr.close();
  const carol = guest(room, 3);
  expect(looks(carol)).toEqual([defaultAppearance('sounile'), chosen, defaultAppearance('rafael')]);
  const again = connectFakeClient(server);
  again.send({ type: 'join', room, name: 'Ignored', token: token(2) });
  const expected = [defaultAppearance('sounile'), chosen, defaultAppearance('rafael')];
  for (const watcher of [again, client, carol]) expect(looks(watcher)).toEqual(expected);
});

test('a malformed appearance gets bad_message and changes nothing', () => {
  const { host } = setup();
  const { client } = host();
  client.send({ type: 'appearance', characterId: 'bob', glasses: 'none', top: 'default', hat: 'none' } as never);
  client.send({ type: 'appearance', characterId: 'luiz' } as never);
  expect(reasons(client)).toEqual(['bad_message', 'bad_message']);
  expect(looks(client)).toEqual([defaultAppearance('sounile')]);
});

test('appearance before joining gets bad_message, like the other lobby commands', () => {
  const { server } = setup();
  const client = connectFakeClient(server);
  choose(client, defaultAppearance('luiz'));
  expect(reasons(client)).toEqual(['bad_message']);
});

test('a joiner during results gets a default appearance in the lobby message', () => {
  const base = getCourse('test');
  const finishing: BuiltCourse = { ...base, finish: { center: base.checkpoints[0]!.spawn.pos, halfExtents: vec3(20, 20, 20), rot: IDENTITY } };
  const fake = createFakeDeps(RAPIER);
  const server = createRoomServer(fake.deps, { campaign: ['test'], courses: { test: finishing } });
  const client = connectFakeClient(server);
  client.send({ type: 'create', name: 'Amal', token: token(1) });
  startRun(client);
  fake.advance(0.1);
  const badr = connectFakeClient(server);
  badr.send({ type: 'join', room: client.last('welcome').room, name: 'Badr', token: token(2) });
  expect(badr.last('lobby').phase).toBe('results');
  expect(looks(badr)).toEqual([defaultAppearance('sounile'), defaultAppearance('rafael')]);
});

test('a kicked player\'s character is free for the next join', () => {
  const { host, guest } = setup();
  const { client, room } = host();
  guest(room, 2);
  client.send({ type: 'kick', playerId: 'p2' });
  const carol = guest(room, 3);
  expect(looks(carol)).toEqual([defaultAppearance('sounile'), defaultAppearance('rafael')]);
});

test('a character freed after the hold times out is free again', () => {
  const { host, guest, advance } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  badr.close();
  for (let elapsed = 0; elapsed < HELD_SLOT_TIMEOUT + 1; elapsed += 1) {
    client.send({ type: 'pong' });
    advance(1);
  }
  const carol = guest(room, 3);
  expect(looks(carol)).toEqual([defaultAppearance('sounile'), defaultAppearance('rafael')]);
});
