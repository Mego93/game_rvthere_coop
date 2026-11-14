import RAPIER from '@dimforge/rapier3d-compat';
import {
  CREATE_PER_MINUTE,
  EMPTY_ROOM_TIMEOUT,
  HELD_SLOT_TIMEOUT,
  MAX_PLAYERS,
  MAX_ROOMS,
  NEUTRAL_INPUT,
  PING_INTERVAL,
  PLAYER_COLOURS,
  RATE_LIMIT_CLOSE_AFTER,
  RATE_LIMIT_PER_SECOND,
  RATE_LIMIT_STRIKES,
  SERVER_MAX_CATCHUP_STEPS,
  SILENCE_TIMEOUT,
  SOLO_ROOM_TIMEOUT,
  STALL_GRACE,
  SNAPSHOT_EVERY_TICKS,
  TICK_RATE,
  type ClientMessage,
  type PlayerInput,
} from '@lodgy/shared';
import { beforeAll, expect, test } from 'vitest';
import { NOUNS } from './nouns';
import { createRoomServer } from './server';
import { connectFakeClient, createFakeDeps, startRun, type FakeClient } from './testing';
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
  const sources: string[] = [];
  const server = createRoomServer(
    {
      ...fake.deps,
      onError: (error, source) => {
        errors.push(error);
        sources.push(source);
      },
    },
    options,
  );
  const connect = (address?: string) => connectFakeClient(server, address);
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
  // Starts the run: the guests ready up, then the host presses Start.
  const begin = (hostClient: FakeClient, ...guests: FakeClient[]) => {
    for (const client of guests) client.send({ type: 'ready', ready: true });
    startRun(hostClient);
  };
  return { ...fake, server, errors, sources, connect, host, guest, begin };
}

// Advances the clock in one-second steps, with the given clients answering pings, so that silence does not drop them.
const wait = (advance: (seconds: number) => void, seconds: number, ...clients: FakeClient[]) => {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1) {
    for (const client of clients) client.send({ type: 'pong' });
    advance(1);
  }
};

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
    phase: 'lobby',
    players: [{ playerId: 'p1', name: 'Amal', colour: PLAYER_COLOURS[0], ready: false, connected: true }],
    adminId: 'p1',
    courseId: 'test',
    vehicleId: 'lodgy',
    timeOfDay: 'midday',
    weather: 'clear',
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

test('a player who disconnects keeps a disconnected slot until the hold expires, then their colour and name become free', () => {
  const { host, guest, advance } = setup();
  const { client: amal, room } = host('Amal');
  const badr = guest(room, 2, 'Badr');
  badr.close();
  expect(amal.last('lobby').players.map((player) => [player.name, player.connected])).toEqual([['Amal', true], ['Badr', false]]);
  expect(reasons(guest(room, 3, 'badr'))).toEqual(['name_taken']);
  wait(advance, HELD_SLOT_TIMEOUT - 1, amal);
  expect(amal.last('lobby').players).toHaveLength(2);
  wait(advance, 1, amal);
  expect(amal.last('lobby').players.map((player) => player.name)).toEqual(['Amal']);
  const again = guest(room, 3, 'Badr');
  expect(again.last('welcome').playerId).toBe('p3');
  expect(again.last('lobby').players[1]!.colour).toBe(PLAYER_COLOURS[1]);
});

test('the admin role passes to the longest-connected player only after the admin slot expires', () => {
  const { host, guest, advance } = setup();
  const { client: amal, room } = host();
  const badr = guest(room, 2);
  const chadi = guest(room, 3);
  amal.close();
  expect(badr.last('lobby').adminId).toBe('p1');
  wait(advance, HELD_SLOT_TIMEOUT, badr, chadi);
  expect(badr.last('lobby').adminId).toBe('p2');
  expect(chadi.last('lobby').adminId).toBe('p2');
});

test('when everyone has left, the next player to join becomes admin once the admin slot has expired', () => {
  const { host, guest, advance } = setup();
  const { client: amal, room } = host();
  // Someone else joined, so the room outlives the hold.
  const badr = guest(room, 2);
  amal.close();
  badr.close();
  wait(advance, HELD_SLOT_TIMEOUT);
  expect(guest(room, 3).last('lobby').adminId).toBe('p3');
});

test('an empty room is deleted after the timeout, and not before', () => {
  const { host, guest, advance, server } = setup();
  const { client, room } = host();
  // Someone else joined, so this is not a solo room and the long timeout applies.
  const badr = guest(room, 2);
  client.close();
  badr.close();
  advance(EMPTY_ROOM_TIMEOUT - 1);
  expect(server.roomCount()).toBe(1);
  advance(1);
  expect(server.roomCount()).toBe(0);
  expect(reasons(guest(room, 3))).toEqual(['unknown_room']);
});

test('a room that someone rejoins is not deleted', () => {
  const { host, guest, advance, server } = setup();
  const { client, room } = host();
  guest(room, 2).close();
  client.close();
  advance(EMPTY_ROOM_TIMEOUT - 1);
  const badr = guest(room, 3);
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
  startRun(first);
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

test('a takeover finds the session by player, whatever the order of sessions', () => {
  const { host, guest, connect } = setup();
  const { client: amal, room } = host('Amal');
  const badr = guest(room, 2, 'Badr');
  const chadi = guest(room, 3, 'Chadi');
  const badrAgain = connect();
  badrAgain.send({ type: 'join', room, name: 'Badr', token: token(2) });
  expect(badr.closedByServer).toBe(true);
  expect(amal.closedByServer).toBe(false);
  expect(chadi.closedByServer).toBe(false);
  expect(badrAgain.received[0]).toEqual({ type: 'welcome', playerId: 'p2', room });
  expect(badrAgain.last('lobby').players.map((player) => player.name)).toEqual(['Amal', 'Badr', 'Chadi']);
  // The old connection's late close does not remove the player.
  badr.close();
  expect(amal.last('lobby').players).toHaveLength(3);
});

// --- room creation per address and solo rooms ---

test('the sixth create from one address within 60 s is refused; another address can create; after 60 s the first can again', () => {
  const { connect, advance, server } = setup();
  const create = (address: string, n: number) => {
    const client = connect(address);
    client.send({ type: 'create', name: 'Amal', token: token(n) });
    return client;
  };
  for (let n = 0; n < CREATE_PER_MINUTE; n++) {
    expect(reasons(create('one', n))).toEqual([]);
    advance(1);
  }
  const refused = create('one', 10);
  expect(reasons(refused)).toEqual(['server_full']);
  expect(reasons(create('two', 11))).toEqual([]);
  // The refused create did not count; the first create ages out at 60 s, not before.
  advance(60 - CREATE_PER_MINUTE - 1);
  expect(reasons(create('one', 12))).toEqual(['server_full']);
  advance(1);
  expect(reasons(create('one', 13))).toEqual([]);
  expect(server.roomCount()).toBeGreaterThan(0);
});

test('a room nobody else joined is deleted after the solo timeout, and one someone joined lasts the full timeout', () => {
  const { host, guest, advance, server } = setup();
  const { client } = host('Amal');
  client.close();
  advance(SOLO_ROOM_TIMEOUT - 1);
  expect(server.roomCount()).toBe(1);
  advance(1);
  expect(server.roomCount()).toBe(0);

  const { client: amal, room } = host('Amal');
  const badr = guest(room, 2);
  amal.close();
  badr.close();
  advance(SOLO_ROOM_TIMEOUT);
  expect(server.roomCount()).toBe(1);
  advance(EMPTY_ROOM_TIMEOUT - SOLO_ROOM_TIMEOUT);
  expect(server.roomCount()).toBe(0);
});

test('the creator rejoining with its own token does not make a room more than solo', () => {
  const { host, guest, advance, server } = setup();
  const { client, room } = host('Amal');
  client.close();
  guest(room, 1, 'Amal').close();
  advance(SOLO_ROOM_TIMEOUT);
  expect(server.roomCount()).toBe(0);
});

// --- simulation and snapshots ---

test('snapshots arrive 20 times a second, the first one full', () => {
  const { host, advance } = setup();
  const { client } = host();
  startRun(client);
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
  const { client, room } = host();
  startRun(client);
  advance(1);
  const badr = guest(room, 2);
  advance(0.2);
  const snapshots = badr.ofType('snapshot');
  expect(snapshots[0]!.full).toBe(true);
  expect(snapshots[0]!.tick).toBeGreaterThan(TICK_RATE);
  expect(snapshots[1]!.full).toBe(false);
});

test('a joining player appears in the snapshot at a spawn slot, and two players take different slots', () => {
  const { host, guest, advance } = setup();
  const { client: amal, room } = host();
  startRun(amal);
  advance(0.2);
  const [first] = amal.last('snapshot').players;
  expect(amal.last('snapshot').players).toHaveLength(1);
  expect(first!.playerId).toBe('p1');
  expect(first!.pos.x).toBeCloseTo(-2.08, 1);
  expect(first!.pos.z).toBeCloseTo(-0.7, 1);
  expect(Math.abs(first!.pos.y)).toBeLessThan(0.05);

  guest(room, 2);
  advance(0.2);
  const { players } = amal.last('snapshot');
  expect(players.map((player) => player.playerId)).toEqual(['p1', 'p2']);
  expect(players[1]!.pos.x).toBeCloseTo(2.08, 1);
  expect(players[1]!.pos.z).toBeCloseTo(-0.7, 1);
});

test('a player who leaves disappears from the snapshot players', () => {
  const { host, guest, advance, begin } = setup();
  const { client: amal, room } = host();
  const badr = guest(room, 2);
  begin(amal, badr);
  advance(0.2);
  badr.close();
  advance(0.2);
  expect(amal.last('snapshot').players.map((player) => player.playerId)).toEqual(['p1']);
});

test('a player who joins mid-run gets a full snapshot that includes the players', () => {
  const { host, guest, advance } = setup();
  const { client, room } = host();
  startRun(client);
  advance(1);
  const badr = guest(room, 2);
  advance(0.2);
  const first = badr.ofType('snapshot')[0]!;
  expect(first.full).toBe(true);
  expect(first.players.map((player) => player.playerId)).toEqual(['p1', 'p2']);
});

test('the player in the driver seat drives; the others do not', () => {
  const { host, guest, advance, begin } = setup();
  const { client: amal, room } = host();
  const badr = guest(room, 2);
  begin(amal, badr);
  advance(1);
  let seq = 0;
  // One input per tick for two seconds: Badr holds full throttle from his own spot, Amal has not boarded.
  for (let i = 0; i < 2 * TICK_RATE; i++) {
    seq += 1;
    badr.send(input(seq, { moveY: 1 }));
    advance(1 / TICK_RATE);
  }
  expect(amal.last('snapshot').vehicle.pos.z).toBeCloseTo(0, 1);

  // Amal stands at slot 0, at the driver door, and boards.
  amal.send(input(1, { interact: true }));
  advance(0.2);
  const seats = amal.last('snapshot').players.map((player) => player.seat);
  expect(seats).toEqual(['driver', null]);

  seq = 1;
  for (let i = 0; i < 2 * TICK_RATE; i++) {
    seq += 1;
    amal.send(input(seq, { moveY: 1 }));
    badr.send(input(seq + 1000, { moveY: -1 }));
    advance(1 / TICK_RATE);
  }
  const { vehicle } = badr.last('snapshot');
  expect(vehicle.pos.z).toBeLessThan(-2);
  expect(vehicle.throttle).toBe(1);
});

test('when the driver leaves, the vehicle coasts until someone boards', () => {
  const { host, advance } = setup();
  const { client: amal } = host();
  startRun(amal);
  amal.send(input(1, { interact: true }));
  advance(0.1);
  let seq = 1;
  const hold = (seconds: number, fields: Partial<PlayerInput>) => {
    for (let i = 0; i < seconds * TICK_RATE; i++) {
      seq += 1;
      amal.send(input(seq, fields));
      advance(1 / TICK_RATE);
    }
  };
  hold(0.4, { moveY: 1 });
  expect(amal.last('snapshot').vehicle.throttle).toBe(1);

  // Leaving by pressing interact: the vehicle keeps rolling with the pedal released, whatever the player now holds.
  hold(1 / TICK_RATE, { interact: true });
  hold(0.3, { moveY: 1 });
  const afterLeaving = amal.last('snapshot');
  expect(afterLeaving.players[0]!.seat).toBeNull();
  expect(afterLeaving.vehicle.throttle).toBe(0);
  expect(afterLeaving.vehicle.linvel.z).toBeLessThan(-0.5);
  const z = afterLeaving.vehicle.pos.z;
  hold(0.3, {});
  expect(amal.last('snapshot').vehicle.pos.z).toBeLessThan(z - 0.2);

  // Boarding again, from the exit point at the driver door, gives the pedal back.
  hold(1 / TICK_RATE, { interact: true });
  hold(0.2, { moveY: 1 });
  expect(amal.last('snapshot').players[0]!.seat).toBe('driver');
  expect(amal.last('snapshot').vehicle.throttle).toBe(1);
});

test('each client is told the last of its own inputs that was consumed', () => {
  const { host, guest, advance, begin } = setup();
  const { client: amal, room } = host();
  const badr = guest(room, 2);
  begin(amal, badr);
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

test('a silent seated driver stops pressing the pedal after the neutral-input delay', () => {
  const { host, advance } = setup();
  const { client } = host();
  startRun(client);
  client.send(input(1, { interact: true }));
  advance(0.1);
  client.send(input(2, { moveY: 1 }));
  advance(0.1);
  expect(client.last('snapshot').players[0]!.seat).toBe('driver');
  expect(client.last('snapshot').vehicle.throttle).toBe(1);
  advance(0.5);
  expect(client.last('snapshot').vehicle.throttle).toBe(0);
});

test('a tap of interact that is consumed together with the next input still boards', () => {
  const { host, advance } = setup();
  const { client } = host();
  startRun(client);
  // More than INPUT_QUEUE_FAST_ABOVE inputs waiting: the first tick consumes the first two, the press and its release.
  client.send(input(1, { interact: true }));
  client.send(input(2));
  client.send(input(3));
  client.send(input(4));
  client.send(input(5));
  advance(0.2);
  expect(client.last('snapshot').players[0]!.seat).toBe('driver');
});

test('after a stall the room runs only the catch-up limit and drops the rest', () => {
  const { host, advance, stall } = setup();
  const { client } = host();
  startRun(client);
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
  startRun(client);
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
  expect(amal.last('lobby').players.map((player) => [player.name, player.connected])).toEqual([['Amal', true], ['Badr', false]]);
  wait(advance, HELD_SLOT_TIMEOUT, amal);
  expect(amal.last('lobby').players.map((player) => player.name)).toEqual(['Amal']);
});

test('silence of exactly the timeout drops a connection and a hair less does not', () => {
  const { connect, advance } = setup();
  const client = connect();
  advance(SILENCE_TIMEOUT - 0.05);
  expect(client.closedByServer).toBe(false);
  advance(0.1);
  expect(client.closedByServer).toBe(true);
});

test('a stall with every client silent during it drops nobody', () => {
  const { connect, advance, stall } = setup();
  const client = connect();
  advance(3);
  stall(STALL_GRACE + 3);
  advance(0.1);
  // 7.1 s of silence in all, 4.1 s once the stall's excess is credited.
  expect(client.closedByServer).toBe(false);
});

test('a client silent for the full timeout of non-stalled time is still dropped after a stall', () => {
  const { connect, advance, stall } = setup();
  const client = connect();
  stall(STALL_GRACE + 3);
  // The stall's excess (3 s) is forgiven, so the client is dropped at 3 + SILENCE_TIMEOUT s, not before.
  advance(3 + SILENCE_TIMEOUT - (STALL_GRACE + 3) - 0.5);
  expect(client.closedByServer).toBe(false);
  advance(1);
  expect(client.closedByServer).toBe(true);
});

test('a message heard after the previous timer run is not credited the stall excess', () => {
  const { connect, advance, stall } = setup();
  const client = connect();
  stall(0.5);
  client.send({ type: 'pong' });
  stall(4);
  // The message at 0.5 s makes the client due at 6.5 s; credited the excess it would be due at 10 s.
  advance(2.5);
  expect(client.closedByServer).toBe(true);
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
  expect(amal.last('lobby').players.map((player) => [player.name, player.connected])).toEqual([['Amal', true], ['Badr', false]]);
});

test('a connection that floods in alternate seconds is closed on the strike count', () => {
  const { connect, advance } = setup();
  const client = connect();
  for (let n = 0; n < RATE_LIMIT_STRIKES * 2 && !client.closedByServer; n++) {
    if (n % 2 === 0) for (let i = 0; i < RATE_LIMIT_PER_SECOND + 10; i++) client.send({ type: 'pong' });
    else client.send({ type: 'pong' });
    advance(1);
  }
  expect(client.closedByServer).toBe(true);
});

test('create is refused once the server holds the most rooms it allows, until one is deleted', () => {
  const { connect, advance, server } = setup();
  const hosts = Array.from({ length: MAX_ROOMS }, (_, n) => {
    const client = connect(`address-${n}`);
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
  const { host, advance, server, errors, sources } = setup();
  const { client: amal, room } = host();
  startRun(amal);
  let broken = false;
  let closed = false;
  const handle = server.connect({
    send() {
      if (broken) throw new Error('socket failed');
    },
    close() {
      closed = true;
    },
  }, 'test');
  handle.message(JSON.stringify({ type: 'join', room, name: 'Badr', token: token(2) }));
  expect(amal.last('lobby').players).toHaveLength(2);

  broken = true;
  const before = amal.ofType('snapshot').length;
  advance(1);
  expect(errors).toHaveLength(1);
  expect(sources).toEqual([`connection:${room}`]);
  expect(closed).toBe(true);
  expect(amal.last('lobby').players.map((player) => [player.name, player.connected])).toEqual([['Amal', true], ['Badr', false]]);
  // The tick was never interrupted: Amal missed no snapshot.
  expect(amal.ofType('snapshot').length - before).toBe(TICK_RATE / SNAPSHOT_EVERY_TICKS);
  expect(amal.closedByServer).toBe(false);
});

test('a connection that has failed can no longer create a room', () => {
  const { server, advance, errors } = setup();
  const handle = server.connect({
    send() {
      throw new Error('socket failed');
    },
    close() {},
  }, 'test');
  // The reply to this malformed message cannot be sent, which marks the connection as failed.
  handle.message('not json');
  expect(errors).toHaveLength(1);
  handle.message(JSON.stringify({ type: 'create', name: 'Amal', token: token(1) }));
  expect(server.roomCount()).toBe(0);
  advance(0.1);
  expect(server.roomCount()).toBe(0);
  expect(errors).toHaveLength(1);
});

test('a connection whose close throws is still removed from its room', () => {
  const { host, advance, server, errors } = setup();
  const { client: amal, room } = host();
  const handle = server.connect({
    send() {},
    close() {
      throw new Error('close failed');
    },
  }, 'test');
  handle.message(JSON.stringify({ type: 'join', room, name: 'Badr', token: token(2) }));
  expect(amal.last('lobby').players).toHaveLength(2);

  // Badr goes silent; Amal keeps answering.
  for (let elapsed = 0; elapsed < SILENCE_TIMEOUT + 1; elapsed += 1) {
    advance(1);
    amal.send({ type: 'pong' });
  }
  expect(errors).toHaveLength(1);
  expect(amal.last('lobby').players.map((player) => [player.name, player.connected])).toEqual([['Amal', true], ['Badr', false]]);
});

test('stop frees every room', () => {
  const { host, server } = setup();
  host();
  host();
  server.stop();
  expect(server.roomCount()).toBe(0);
});

// --- shop ---

test('S15: a buy sent before join gets cannot_buy', () => {
  const { connect } = setup();
  const client = connect();
  client.send({ type: 'buy', item: 'jerrycan' });
  expect(reasons(client)).toEqual(['cannot_buy']);
});

test('S15: a refused buy sends cannot_buy to that client only', () => {
  const { host, guest, advance, begin } = setup();
  const { client: amal, room } = host();
  const badr = guest(room, 2);
  begin(amal, badr);
  advance(0.2);
  amal.send({ type: 'buy', item: 'jerrycan' });
  expect(reasons(amal)).toEqual(['cannot_buy']);
  expect(reasons(badr)).toEqual([]);
  expect(amal.closedByServer).toBe(false);
});

test('S15: an accepted buy sends no error and puts the item in the inventory', () => {
  const { host, advance } = setup();
  const { client: amal } = host();
  startRun(amal);
  let seq = 0;
  const me = () => amal.last('snapshot').players.find((player) => player.playerId === 'p1')!;
  // Walks toward a point on the ground, steering from the latest snapshot, until within `reach` of it.
  const walkTo = (x: number, z: number, reach: number) => {
    for (let i = 0; i < 20 * TICK_RATE; i++) {
      const { pos } = me();
      if (Math.hypot(x - pos.x, z - pos.z) <= reach) return;
      seq += 1;
      amal.send(input(seq, { moveY: 1, yaw: Math.atan2(-(x - pos.x), -(z - pos.z)) }));
      advance(1 / TICK_RATE);
    }
    throw new Error(`Never reached ${x}, ${z}`);
  };
  advance(0.2);
  // The test ground's coin-1 to coin-3, then the fuel station's counter.
  walkTo(3, -12, 0.5);
  walkTo(-3, -28, 0.5);
  walkTo(6, -36, 0.5);
  expect(amal.last('snapshot').wallet).toBe(3);
  walkTo(11.5, -23, 0.5);
  amal.send({ type: 'buy', item: 'jerrycan' });
  expect(reasons(amal)).toEqual([]);
  advance(0.2);
  expect(amal.last('snapshot').wallet).toBe(0);
  expect(me().inventory).toContain('jerrycan');
});
