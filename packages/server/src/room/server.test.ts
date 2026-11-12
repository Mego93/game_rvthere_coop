import RAPIER from '@dimforge/rapier3d-compat';
import {
  EMPTY_ROOM_TIMEOUT,
  MAX_PLAYERS,
  MAX_ROOMS,
  NEUTRAL_INPUT,
  PING_INTERVAL,
  PLAYER_COLOURS,
  RATE_LIMIT_CLOSE_AFTER,
  RATE_LIMIT_PER_SECOND,
  SERVER_MAX_CATCHUP_STEPS,
  SILENCE_TIMEOUT,
  SNAPSHOT_EVERY_TICKS,
  TICK_RATE,
  type ClientMessage,
  type PlayerInput,
} from '@lodgy/shared';
import { beforeAll, expect, test } from 'vitest';
import { NOUNS } from './nouns';
import { createRoomServer } from './server';
import { connectFakeClient, createFakeDeps, type FakeClient } from './testing';
import type { RoomServerOptions } from './types';

beforeAll(async () => {
  await RAPIER.init();
});

const token = (n: number) => `token-${n}-abcdefghij`;
const input = (seq: number, fields: Partial<PlayerInput> = {}): ClientMessage => ({
  type: 'input',
  ...NEUTRAL_INPUT,
  ...fields,
  seq,
});

function setup(options?: RoomServerOptions) {
  const fake = createFakeDeps(RAPIER);
  // Everything the server reports through onError, oldest first.
  const errors: unknown[] = [];
  const server = createRoomServer({ ...fake.deps, onError: (error) => errors.push(error) }, options);
  const connect = () => connectFakeClient(server);
  // Connects a client and creates a room with it.
  const host = (name = 'Amal') => {
    const client = connect();
    client.send({ type: 'create', name, token: token(1) });
    return { client, room: client.last('welcome').room };
  };
  // Connects a client and joins `room` with it.
  const guest = (room: string, n: number, name = `Guest${n}`) => {
    const client = connect();
    client.send({ type: 'join', room, name, token: token(n) });
    return client;
  };
  return { ...fake, server, errors, connect, host, guest };
}

const reasons = (client: FakeClient) => client.ofType('error').map((message) => message.reason);

// --- rooms ---

test('create makes a room and welcomes its creator, then announces the lobby', () => {
  const { host, server } = setup();
  const { client, room } = host('Amal');
  expect(room).toBe(NOUNS[0]);
  expect(server.roomCount()).toBe(1);
  expect(client.received[0]).toEqual({ type: 'welcome', playerId: 'p1', room });
  expect(client.received[1]).toEqual({
    type: 'lobby',
    room,
    phase: 'playing',
    players: [{ playerId: 'p1', name: 'Amal', colour: PLAYER_COLOURS[0], ready: false, connected: true }],
    adminId: 'p1',
    courseId: 'test',
    vehicleId: 'lodgy',
  });
});

test('each room gets its own noun', () => {
  const { host } = setup();
  expect(host().room).toBe(NOUNS[0]);
  expect(host().room).toBe(NOUNS[1]);
});

test('the random source chooses the noun', () => {
  const { host, randomValues } = setup();
  randomValues.push(0.5);
  expect(host().room).toBe(NOUNS[Math.floor(NOUNS.length / 2)]);
});

test('the room runs the configured vehicle', () => {
  const { host } = setup({ vehicleId: 'rv' });
  expect(host().client.last('lobby').vehicleId).toBe('rv');
});

test('an unknown course or vehicle is refused when the server is created', () => {
  const fake = createFakeDeps(RAPIER);
  expect(() => createRoomServer(fake.deps, { vehicleId: 'bus' })).toThrow('Unknown vehicle: bus');
  expect(() => createRoomServer(fake.deps, { courseId: 'moon' })).toThrow('Unknown course: moon');
});

test('join welcomes the newcomer and announces the lobby to everyone', () => {
  const { host, guest } = setup();
  const { client: amal, room } = host('Amal');
  const badr = guest(room, 2, 'Badr');
  expect(badr.received[0]).toEqual({ type: 'welcome', playerId: 'p2', room });
  for (const client of [amal, badr]) {
    const lobby = client.last('lobby');
    expect(lobby.players.map((player) => player.name)).toEqual(['Amal', 'Badr']);
    expect(lobby.players.map((player) => player.colour)).toEqual([PLAYER_COLOURS[0], PLAYER_COLOURS[1]]);
    expect(lobby.adminId).toBe('p1');
  }
});

test('join finds the room whatever the case of the noun', () => {
  const { host, guest } = setup();
  const { room } = host();
  expect(guest(room.toUpperCase(), 2).last('welcome').room).toBe(room);
});

test('join refuses an unknown room', () => {
  const { host, guest } = setup();
  host();
  expect(reasons(guest('nowhere', 2))).toEqual(['unknown_room']);
});

test('join refuses a name already in the room, ignoring case', () => {
  const { host, guest } = setup();
  const { room } = host('Amal');
  expect(reasons(guest(room, 2, 'aMAL'))).toEqual(['name_taken']);
});

test('a refused client can try again on the same connection', () => {
  const { host, guest } = setup();
  const { room } = host('Amal');
  const client = guest(room, 2, 'Amal');
  client.send({ type: 'join', room, name: 'Badr', token: token(2) });
  expect(client.last('welcome').playerId).toBe('p2');
});

test('join refuses a seventh player', () => {
  const { host, guest } = setup();
  const { room } = host();
  for (let n = 2; n <= MAX_PLAYERS; n++) expect(guest(room, n).ofType('welcome')).toHaveLength(1);
  expect(reasons(guest(room, MAX_PLAYERS + 1))).toEqual(['room_full']);
});

test('create and join are refused once the connection is in a room', () => {
  const { host } = setup();
  const { client, room } = host();
  client.send({ type: 'create', name: 'Again', token: token(1) });
  client.send({ type: 'join', room, name: 'Again', token: token(1) });
  expect(reasons(client)).toEqual(['bad_message', 'bad_message']);
});

test('a malformed message gets bad_message and the connection stays usable', () => {
  const { connect } = setup();
  const client = connect();
  client.sendRaw('not json');
  client.sendRaw('{"type":"create","name":"","token":"x"}');
  expect(reasons(client)).toEqual(['bad_message', 'bad_message']);
  client.send({ type: 'create', name: 'Amal', token: token(1) });
  expect(client.ofType('welcome')).toHaveLength(1);
});

// --- leaving ---

test('a player who disconnects leaves the room, and their colour and name become free', () => {
  const { host, guest } = setup();
  const { client: amal, room } = host('Amal');
  const badr = guest(room, 2, 'Badr');
  badr.close();
  expect(amal.last('lobby').players.map((player) => player.name)).toEqual(['Amal']);
  const again = guest(room, 3, 'Badr');
  expect(again.last('welcome').playerId).toBe('p3');
  expect(again.last('lobby').players[1]!.colour).toBe(PLAYER_COLOURS[1]);
});

test('the admin role passes to the longest-connected player', () => {
  const { host, guest } = setup();
  const { client: amal, room } = host();
  const badr = guest(room, 2);
  const chadi = guest(room, 3);
  amal.close();
  expect(badr.last('lobby').adminId).toBe('p2');
  expect(chadi.last('lobby').adminId).toBe('p2');
});

test('when everyone has left, the next player to join becomes admin', () => {
  const { host, guest } = setup();
  const { client: amal, room } = host();
  amal.close();
  expect(guest(room, 2).last('lobby').adminId).toBe('p2');
});

test('an empty room is deleted after the timeout, and not before', () => {
  const { host, guest, advance, server } = setup();
  const { client, room } = host();
  client.close();
  advance(EMPTY_ROOM_TIMEOUT - 1);
  expect(server.roomCount()).toBe(1);
  advance(1);
  expect(server.roomCount()).toBe(0);
  expect(reasons(guest(room, 2))).toEqual(['unknown_room']);
});

test('a room that someone rejoins is not deleted', () => {
  const { host, guest, advance, server } = setup();
  const { client, room } = host();
  client.close();
  advance(EMPTY_ROOM_TIMEOUT - 1);
  const badr = guest(room, 2);
  advance(5);
  expect(server.roomCount()).toBe(1);
  // The timeout starts again from the moment the room next empties.
  badr.close();
  advance(EMPTY_ROOM_TIMEOUT - 1);
  expect(server.roomCount()).toBe(1);
  advance(1);
  expect(server.roomCount()).toBe(0);
});

test('a join with the token of a connected player takes that player over', () => {
  const { host, connect, advance } = setup();
  const { client: first, room } = host('Amal');
  first.send(input(1, { moveY: 1 }));
  first.send(input(2, { moveY: 1 }));
  advance(0.5);

  const second = connect();
  second.send({ type: 'join', room, name: 'Other name', token: token(1) });
  expect(first.closedByServer).toBe(true);
  expect(second.received[0]).toEqual({ type: 'welcome', playerId: 'p1', room });
  expect(second.last('lobby').players).toHaveLength(1);
  expect(second.last('lobby').players[0]!.name).toBe('Amal');

  // The old connection's close arrives late and must not remove the player.
  first.close();
  // The new connection numbers its inputs from 1 again.
  second.send(input(1, { moveY: 1 }));
  advance(0.5);
  expect(second.last('lobby').players).toHaveLength(1);
  expect(second.last('snapshot').ackSeq).toBe(1);
  expect(second.ofType('snapshot')[0]!.full).toBe(true);
});

// --- simulation and snapshots ---

test('snapshots arrive 20 times a second, the first one full', () => {
  const { host, advance } = setup();
  const { client } = host();
  advance(1);
  const snapshots = client.ofType('snapshot');
  expect(snapshots).toHaveLength(TICK_RATE / SNAPSHOT_EVERY_TICKS);
  expect(snapshots.map((snapshot) => snapshot.tick)).toEqual(
    snapshots.map((_, index) => (index + 1) * SNAPSHOT_EVERY_TICKS),
  );
  expect(snapshots.map((snapshot) => snapshot.full)).toEqual(snapshots.map((_, index) => index === 0));
  expect(snapshots[0]!.vehicle.pos.z).toBeCloseTo(0, 1);
});

test('a player who joins mid-run gets a full snapshot first', () => {
  const { host, guest, advance } = setup();
  const { room } = host();
  advance(1);
  const badr = guest(room, 2);
  advance(0.2);
  const snapshots = badr.ofType('snapshot');
  expect(snapshots[0]!.full).toBe(true);
  expect(snapshots[0]!.tick).toBeGreaterThan(TICK_RATE);
  expect(snapshots[1]!.full).toBe(false);
});

test('the first player drives; the others do not', () => {
  const { host, guest, advance } = setup();
  const { client: amal, room } = host();
  const badr = guest(room, 2);
  advance(1);
  let seq = 0;
  // One input per tick for two seconds: Badr holds full throttle, Amal steers nothing and stays off the pedal.
  for (let i = 0; i < 2 * TICK_RATE; i++) {
    seq += 1;
    badr.send(input(seq, { moveY: 1 }));
    advance(1 / TICK_RATE);
  }
  expect(amal.last('snapshot').vehicle.pos.z).toBeCloseTo(0, 1);

  for (let i = 0; i < 2 * TICK_RATE; i++) {
    seq += 1;
    amal.send(input(seq, { moveY: 1 }));
    advance(1 / TICK_RATE);
  }
  const { vehicle } = badr.last('snapshot');
  expect(vehicle.pos.z).toBeLessThan(-2);
  expect(vehicle.throttle).toBe(1);
});

test('when the driver leaves, the next player drives', () => {
  const { host, guest, advance } = setup();
  const { client: amal, room } = host();
  const badr = guest(room, 2);
  amal.close();
  for (let seq = 1; seq <= 2 * TICK_RATE; seq++) {
    badr.send(input(seq, { moveY: 1 }));
    advance(1 / TICK_RATE);
  }
  expect(badr.last('snapshot').vehicle.pos.z).toBeLessThan(-2);
});

test('each client is told the last of its own inputs that was consumed', () => {
  const { host, guest, advance } = setup();
  const { client: amal, room } = host();
  const badr = guest(room, 2);
  amal.send(input(1));
  amal.send(input(2));
  badr.send(input(1));
  advance(0.5);
  expect(amal.last('snapshot').ackSeq).toBe(2);
  expect(badr.last('snapshot').ackSeq).toBe(1);
});

test('input from a connection that is not in a room is ignored', () => {
  const { connect, advance } = setup();
  const client = connect();
  client.send(input(1, { moveY: 1 }));
  advance(0.5);
  expect(client.received).toEqual([]);
});

test('a silent driver stops pressing the pedal after the neutral-input delay', () => {
  const { host, advance } = setup();
  const { client } = host();
  client.send(input(1, { moveY: 1 }));
  advance(0.1);
  expect(client.last('snapshot').vehicle.throttle).toBe(1);
  advance(0.5);
  expect(client.last('snapshot').vehicle.throttle).toBe(0);
});

test('after a stall the room runs only the catch-up limit and drops the rest', () => {
  const { host, advance, stall } = setup();
  const { client } = host();
  advance(1);
  const before = client.last('snapshot').tick;
  // Three seconds without a timer callback: 180 ticks are owed.
  stall(3);
  advance(1 / TICK_RATE);
  const after = client.last('snapshot').tick;
  expect(after - before).toBeGreaterThanOrEqual(SERVER_MAX_CATCHUP_STEPS);
  expect(after - before).toBeLessThanOrEqual(SERVER_MAX_CATCHUP_STEPS + SNAPSHOT_EVERY_TICKS);
  // The loop is back in step: one more second gives one more second of ticks.
  advance(1);
  expect(client.last('snapshot').tick - after).toBe(TICK_RATE);
});

test('an empty room is paused and resumes where it was', () => {
  const { host, guest, advance } = setup();
  const { client, room } = host();
  advance(1);
  const before = client.last('snapshot').tick;
  client.close();
  advance(10);
  const badr = guest(room, 2);
  advance(0.1);
  const first = badr.ofType('snapshot')[0]!;
  expect(first.tick).toBeGreaterThan(before);
  expect(first.tick).toBeLessThanOrEqual(before + 2 * SNAPSHOT_EVERY_TICKS);
});

// --- liveness and rate limit ---

test('the server pings every connection at the ping interval', () => {
  const { connect, advance } = setup();
  const client = connect();
  advance(PING_INTERVAL - 0.1);
  expect(client.ofType('ping')).toHaveLength(0);
  advance(0.2);
  expect(client.ofType('ping')).toHaveLength(1);
});

test('a connection that keeps answering stays; one that goes silent is dropped from its room', () => {
  const { host, guest, advance } = setup();
  const { client: amal, room } = host('Amal');
  const badr = guest(room, 2, 'Badr');
  for (let second = 0; second < SILENCE_TIMEOUT + 2; second++) {
    amal.send({ type: 'pong' });
    advance(1);
  }
  expect(amal.closedByServer).toBe(false);
  expect(badr.closedByServer).toBe(true);
  expect(amal.last('lobby').players.map((player) => player.name)).toEqual(['Amal']);
});

test('messages beyond the rate limit within a second are dropped', () => {
  const { connect } = setup();
  const client = connect();
  for (let i = 0; i < RATE_LIMIT_PER_SECOND + 50; i++) client.sendRaw('garbage');
  expect(client.ofType('error')).toHaveLength(RATE_LIMIT_PER_SECOND);
  expect(client.closedByServer).toBe(false);
});

test('a connection that stays over the rate limit is closed and removed', () => {
  const { host, guest, advance } = setup();
  const { client: amal, room } = host('Amal');
  const badr = guest(room, 2, 'Badr');
  for (let tenth = 0; tenth < (RATE_LIMIT_CLOSE_AFTER + 2) * 10 && !badr.closedByServer; tenth++) {
    for (let i = 0; i < RATE_LIMIT_PER_SECOND; i++) badr.send({ type: 'pong' });
    amal.send({ type: 'pong' });
    advance(0.1);
  }
  expect(badr.closedByServer).toBe(true);
  expect(amal.last('lobby').players.map((player) => player.name)).toEqual(['Amal']);
});

test('create is refused once the server holds the most rooms it allows, until one is deleted', () => {
  const { connect, advance, server } = setup();
  const hosts = Array.from({ length: MAX_ROOMS }, (_, n) => {
    const client = connect();
    client.send({ type: 'create', name: 'Amal', token: token(n) });
    return client;
  });
  expect(server.roomCount()).toBe(MAX_ROOMS);

  const late = connect();
  late.send({ type: 'create', name: 'Badr', token: token(MAX_ROOMS) });
  expect(reasons(late)).toEqual(['server_full']);
  expect(server.roomCount()).toBe(MAX_ROOMS);

  // Joining an existing room is still possible.
  const joiner = connect();
  joiner.send({ type: 'join', room: hosts[0]!.last('welcome').room, name: 'Chadi', token: token(MAX_ROOMS + 1) });
  expect(reasons(joiner)).toEqual([]);

  // Once the rooms have emptied and timed out, a room can be created again.
  joiner.close();
  for (const client of hosts) client.close();
  advance(EMPTY_ROOM_TIMEOUT);
  expect(server.roomCount()).toBe(0);
  const next = connect();
  next.send({ type: 'create', name: 'Badr', token: token(MAX_ROOMS) });
  expect(reasons(next)).toEqual([]);
  expect(server.roomCount()).toBe(1);
});

test('a connection whose send throws is reported and dropped, and the others carry on', () => {
  const { host, advance, server, errors } = setup();
  const { client: amal, room } = host();
  let broken = false;
  let closed = false;
  const handle = server.connect({
    send() {
      if (broken) throw new Error('socket failed');
    },
    close() {
      closed = true;
    },
  });
  handle.message(JSON.stringify({ type: 'join', room, name: 'Badr', token: token(2) }));
  expect(amal.last('lobby').players).toHaveLength(2);

  broken = true;
  const before = amal.ofType('snapshot').length;
  advance(1);
  expect(errors).toHaveLength(1);
  expect(closed).toBe(true);
  expect(amal.last('lobby').players.map((player) => player.name)).toEqual(['Amal']);
  // The tick was never interrupted: Amal missed no snapshot.
  expect(amal.ofType('snapshot').length - before).toBe(TICK_RATE / SNAPSHOT_EVERY_TICKS);
  expect(amal.closedByServer).toBe(false);
});

test('a connection whose close throws is still removed from its room', () => {
  const { host, advance, server, errors } = setup();
  const { client: amal, room } = host();
  const handle = server.connect({
    send() {},
    close() {
      throw new Error('close failed');
    },
  });
  handle.message(JSON.stringify({ type: 'join', room, name: 'Badr', token: token(2) }));
  expect(amal.last('lobby').players).toHaveLength(2);

  // Badr goes silent; Amal keeps answering.
  for (let elapsed = 0; elapsed < SILENCE_TIMEOUT + 1; elapsed += 1) {
    advance(1);
    amal.send({ type: 'pong' });
  }
  expect(errors).toHaveLength(1);
  expect(amal.last('lobby').players.map((player) => player.name)).toEqual(['Amal']);
});

test('stop frees every room', () => {
  const { host, server } = setup();
  host();
  host();
  server.stop();
  expect(server.roomCount()).toBe(0);
});
