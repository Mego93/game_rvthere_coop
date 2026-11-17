import RAPIER from '@dimforge/rapier3d-compat';
import { HELD_SLOT_TIMEOUT, RAIN_GRIP, VEHICLES, WORLD_REBUILD_COOLDOWN, IDENTITY, NEUTRAL_INPUT, PLAYER_COLOURS, PLAYER_REVIVE_HEALTH, TICK_RATE, getCourse, vec3, type BuiltCourse, type ClientMessage, type ServerMessage } from '@lodgy/shared';
import { beforeAll, expect, test } from 'vitest';
import { createRoom } from './room';
import { createRoomServer } from './server';
import { connectFakeClient, createFakeDeps, startRun, type FakeClient } from './testing';

beforeAll(async () => {
  await RAPIER.init();
});

const token = (n: number) => `token-${n}-abcdefghij`;

// The course with its finish around the start, so the first tick wins; a box wide enough for the RV's spawn on the segment course too.
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

const reasons = (client: FakeClient) => client.ofType('error').map((message) => message.reason);
const ready = (client: FakeClient) => client.send({ type: 'ready', ready: true });
const settings: Extract<ClientMessage, { type: 'configure' }> = {
  type: 'configure',
  courseId: 'segment-demo',
  vehicleId: 'rv',
  timeOfDay: 'night',
  weather: 'rain',
};

// --- L5: phases ---

test('L5: a new room is in the lobby with no world and sends no snapshots', () => {
  const { host, advance, server } = setup();
  const { client, room } = host();
  advance(2);
  expect(client.ofType('snapshot')).toEqual([]);
  expect(client.last('lobby').phase).toBe('lobby');
  expect(server.debugWorld(room)).toBeNull();
});

test('L5: start by the admin alone enters playing, and snapshots follow', () => {
  const { host, advance, server } = setup();
  const { client, room } = host();
  startRun(client);
  expect(reasons(client)).toEqual([]);
  expect(client.last('lobby').phase).toBe('playing');
  expect(server.debugWorld(room)).not.toBeNull();
  advance(1);
  expect(client.ofType('snapshot').length).toBeGreaterThan(0);
  expect(client.ofType('snapshot')[0]!.full).toBe(true);
});

test('L5: reaching the finish enters results: a snapshot, the lobby message, then results once, and the world stops stepping', () => {
  const { host, guest, advance, stall, server } = setup(true);
  const { client, room } = host();
  const badr = guest(room, 2);
  ready(badr);
  startRun(client);
  const before = client.received.length;
  // A stall owes many ticks at once; the room still stops on the winning tick.
  stall(1);
  advance(0.1);
  const tail = client.received.slice(before).map((message) => message.type);
  expect(tail).toEqual(['snapshot', 'lobby', 'results']);
  const snapshot = client.last('snapshot');
  expect(snapshot.won).toBe(true);
  expect(snapshot.tick).toBe(1);
  expect(client.last('lobby').phase).toBe('results');
  expect(client.last('results')).toMatchObject({ courseId: 'test', vehicleId: 'lodgy', timeOfDay: 'midday', weather: 'clear', assisted: false });
  expect(badr.ofType('results')).toHaveLength(1);

  advance(2);
  expect(client.ofType('results')).toHaveLength(1);
  expect(client.ofType('snapshot')).toHaveLength(1);
  expect(server.debugWorld(room)!.snapshot().tick).toBe(1);
});

test('L5: toLobby returns to the lobby with readiness reset, from playing and from results', () => {
  const { host, guest, advance, server } = setup(true);
  const { client, room } = host();
  const badr = guest(room, 2);
  ready(badr);
  expect(client.last('lobby').players.map((player) => player.ready)).toEqual([false, true]);
  startRun(client);
  advance(0.1);
  expect(client.last('lobby').phase).toBe('results');
  client.send({ type: 'toLobby' });
  const lobby = client.last('lobby');
  expect(lobby.phase).toBe('lobby');
  expect(lobby.players.map((player) => player.ready)).toEqual([false, false]);
  expect(server.debugWorld(room)).toBeNull();
  expect(reasons(client)).toEqual([]);

});

test('L5: toLobby from playing disposes the world', () => {
  const { host, server } = setup();
  const { client, room } = host();
  startRun(client);
  expect(server.debugWorld(room)).not.toBeNull();
  client.send({ type: 'toLobby' });
  expect(client.last('lobby').phase).toBe('lobby');
  expect(server.debugWorld(room)).toBeNull();
});

test('L5: a run after the lobby starts its ticks again from zero, with fresh input queues', () => {
  const { host, advance } = setup();
  const { client } = host();
  startRun(client);
  advance(1);
  client.send({ type: 'input', ...NEUTRAL_INPUT, seq: 9 });
  advance(0.2);
  expect(client.last('snapshot').ackSeq).toBe(9);
  client.send({ type: 'toLobby' });
  const sent = client.ofType('snapshot').length;
  startRun(client);
  advance(0.2);
  const [first] = client.ofType('snapshot').slice(sent);
  expect(first!.ackSeq).toBe(0);
  expect(first!.full).toBe(true);
  expect(first!.tick).toBeLessThanOrEqual(TICK_RATE / 2);
});

test('restartCourse puts a fresh world in the same run: ticks keep rising, the next snapshot is full, and the inputs keep their sequence', () => {
  const { host, guest, advance, server } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  ready(badr);
  startRun(client);
  advance(0.5);
  client.send({ type: 'input', ...NEUTRAL_INPUT, seq: 7 });
  advance(0.2);
  const old = server.debugWorld(room)!;
  old.debugBody('vehicle')!.setTranslation({ x: 0, y: 1, z: -20 }, true);
  const lastTick = client.last('snapshot').tick;
  client.received.length = 0;
  badr.received.length = 0;

  advance(0.5);
  client.received.length = 0;
  badr.received.length = 0;
  client.send({ type: 'restartCourse' });
  expect(reasons(client)).toEqual([]);
  const fresh = server.debugWorld(room)!;
  expect(fresh).not.toBe(old);
  expect(client.ofType('lobby')).toEqual([]);
  advance(0.2);
  for (const player of [client, badr]) {
    const first = player.ofType('snapshot')[0]!;
    expect(first.full).toBe(true);
    expect(first.tick).toBeGreaterThan(lastTick);
    expect(first.vehicle.pos.z).toBeGreaterThan(-5);
  }
  expect(client.last('snapshot').ackSeq).toBe(7);
  const ticks = client.ofType('snapshot').map((snapshot) => snapshot.tick);
  expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
  expect(new Set(ticks).size).toBe(ticks.length);
});

// --- L6: refusals ---

test('L6: a non-admin configure, start, restartCourse or toLobby gets not_admin and changes nothing', () => {
  const { host, guest, server } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  badr.send(settings);
  badr.send({ type: 'start' });
  badr.send({ type: 'restartCourse' });
  badr.send({ type: 'toLobby' });
  expect(reasons(badr)).toEqual(['not_admin', 'not_admin', 'not_admin', 'not_admin']);
  expect(reasons(client)).toEqual([]);
  expect(client.last('lobby')).toMatchObject({ phase: 'lobby', courseId: 'test', vehicleId: 'lodgy' });
  expect(server.debugWorld(room)).toBeNull();
});

test('L6: a message in the wrong phase gets bad_phase, and not_admin comes first', () => {
  const { host, guest, advance } = setup(true);
  const { client, room } = host();
  const badr = guest(room, 2);
  // Lobby: the run commands have no run to act on.
  client.send({ type: 'restartCourse' });
  client.send({ type: 'toLobby' });
  expect(reasons(client)).toEqual(['bad_phase', 'bad_phase']);

  ready(badr);
  startRun(client);
  client.send(settings);
  client.send({ type: 'start' });
  client.send({ type: 'ready', ready: true });
  badr.send({ type: 'start' });
  // The winning run is already over: the same refusals apply in results.
  advance(0.1);
  client.send(settings);
  client.send({ type: 'start' });
  client.send({ type: 'restartCourse' });
  expect(reasons(client)).toEqual(['bad_phase', 'bad_phase', 'bad_phase', 'bad_phase', 'bad_phase', 'bad_phase', 'bad_phase', 'bad_phase']);
  expect(reasons(badr)).toEqual(['not_admin']);
});

test('L6: start with a connected player who is not ready gets not_ready; the admin need not be ready', () => {
  const { host, guest, server } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  const chadi = guest(room, 3);
  ready(badr);
  startRun(client);
  expect(reasons(client)).toEqual(['not_ready']);
  expect(server.debugWorld(room)).toBeNull();
  expect(client.last('lobby').phase).toBe('lobby');
  ready(chadi);
  startRun(client);
  expect(reasons(client)).toEqual(['not_ready']);
  expect(client.last('lobby').phase).toBe('playing');
});

test('L6: ready after the lobby phase gets bad_phase', () => {
  const { host, guest } = setup();
  const { client, room } = host();
  startRun(client);
  const badr = guest(room, 2);
  ready(badr);
  expect(reasons(badr)).toEqual(['bad_phase']);
});

test('L6: an unknown configuration value gets bad_message and changes nothing', () => {
  const { host } = setup();
  const { client } = host();
  const bad = [
    { ...settings, courseId: 'moon' },
    { ...settings, vehicleId: 'bus' },
    { ...settings, timeOfDay: 'noon' },
    { ...settings, weather: 'fog' },
    { type: 'configure', courseId: 'test' },
  ];
  for (const message of bad) client.sendRaw(JSON.stringify(message));
  expect(reasons(client)).toEqual(['bad_message', 'bad_message', 'bad_message', 'bad_message', 'bad_message']);
  expect(client.last('lobby')).toMatchObject({ courseId: 'test', vehicleId: 'lodgy', timeOfDay: 'midday', weather: 'clear' });
});

test('L6: a lobby or run message from a connection that is not in a room gets bad_message', () => {
  const { server } = setup();
  const client = connectFakeClient(server);
  for (const message of [{ type: 'ready', ready: true }, settings, { type: 'start' }, { type: 'restartCourse' }, { type: 'toLobby' }] as ClientMessage[]) {
    client.send(message);
  }
  expect(reasons(client)).toEqual(['bad_message', 'bad_message', 'bad_message', 'bad_message', 'bad_message']);
});

// --- L7: configuration ---

test('L7: configure sets all four values, announces them, and keeps ready states', () => {
  const { host, guest } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  ready(badr);
  client.send(settings);
  expect(reasons(client)).toEqual([]);
  for (const player of [client, badr]) {
    expect(player.last('lobby')).toMatchObject({ phase: 'lobby', courseId: 'segment-demo', vehicleId: 'rv', timeOfDay: 'night', weather: 'rain' });
    expect(player.last('lobby').players.map((entry) => entry.ready)).toEqual([false, true]);
  }
});

test('L7: the run uses the configured course and vehicle', () => {
  const { host, advance, server } = setup(true);
  const { client, room } = host();
  client.send(settings);
  startRun(client);
  const world = server.debugWorld(room)!;
  expect(world.course.id).toBe('segment-demo');
  expect(world.vehicleConfig.id).toBe('rv');
  advance(0.1);
  expect(client.last('results')).toMatchObject({ courseId: 'segment-demo', vehicleId: 'rv', timeOfDay: 'night', weather: 'rain' });
});

test('L7: the room defaults to the first campaign course, the Lodgy, midday and clear', () => {
  const { host } = setup();
  expect(host().client.last('lobby')).toMatchObject({ courseId: 'test', vehicleId: 'lodgy', timeOfDay: 'midday', weather: 'clear' });
});

test('T11: a room made with no campaign starts the marrakech course', () => {
  const server = createRoomServer(createFakeDeps(RAPIER).deps);
  const client = connectFakeClient(server);
  client.send({ type: 'create', name: 'Amal', token: token(1) });
  expect(client.last('lobby').courseId).toBe('marrakech');
});

// --- L11: joining by phase ---

test('L11: a joiner in the lobby gets no snapshot and no character', () => {
  const { host, guest, advance, server } = setup();
  const { room } = host();
  const badr = guest(room, 2);
  advance(1);
  expect(badr.ofType('snapshot')).toEqual([]);
  expect(badr.received.map((message) => message.type)).toEqual(['welcome', 'lobby']);
  expect(server.debugWorld(room)).toBeNull();
});

test('L11: a joiner in playing gets a character and a full snapshot', () => {
  const { host, guest, advance, server } = setup();
  const { client, room } = host();
  startRun(client);
  advance(1);
  const badr = guest(room, 2);
  expect(server.debugWorld(room)!.snapshot().players.map((player) => player.playerId)).toEqual(['p1', 'p2']);
  advance(0.2);
  const first = badr.ofType('snapshot')[0]!;
  expect(first.full).toBe(true);
  expect(first.players.map((player) => player.playerId)).toEqual(['p1', 'p2']);
  expect(first.players[1]).toMatchObject({ health: 100, inventory: [null, null, null] });
});

test('L11: a joiner in results gets welcome, the lobby message, then the results, and no character', () => {
  const { host, guest, advance, server } = setup(true);
  const { client, room } = host();
  startRun(client);
  advance(0.1);
  const badr = guest(room, 2);
  expect(badr.received.map((message: ServerMessage) => message.type)).toEqual(['welcome', 'lobby', 'results']);
  expect(badr.last('lobby')).toMatchObject({ phase: 'results' });
  expect(badr.last('results')).toEqual(client.last('results'));
  expect(server.debugWorld(room)!.snapshot().players.map((player) => player.playerId)).toEqual(['p1']);
  advance(1);
  expect(badr.ofType('snapshot')).toEqual([]);
  // Leaving again, though never in the world, is harmless; the slot is held, then freed.
  badr.close();
  expect(client.last('lobby').players.map((player) => player.connected)).toEqual([true, false]);
  for (let elapsed = 0; elapsed < HELD_SLOT_TIMEOUT; elapsed += 1) {
    client.send({ type: 'pong' });
    advance(1);
  }
  expect(client.last('lobby').players.map((player) => player.name)).toEqual(['Amal']);
});

test('L11: a takeover in results gets the results again', () => {
  const { host, server, advance } = setup(true);
  const { client, room } = host();
  startRun(client);
  advance(0.1);
  const again = connectFakeClient(server);
  again.send({ type: 'join', room, name: 'Amal', token: token(1) });
  expect(again.received.map((message) => message.type)).toEqual(['welcome', 'lobby', 'results']);
});

// --- L15: input and buy outside playing ---

test('L15: input in the lobby and in results is ignored, and buy gets cannot_buy', () => {
  const finishing = createRoom(RAPIER, { noun: 'test', campaign: TWO, courses: { test: finishAtStart('test') } }, 0);
  const player = finishing.add('Amal', token(1), { send: () => {}, close: () => {} });
  let seq = 0;
  const push = () => finishing.pushInput(player, { ...NEUTRAL_INPUT, seq: (seq += 1), moveY: 1 });

  push();
  expect(player.queue.next().input.moveY).toBe(0);
  expect(player.queue.ackSeq()).toBe(0);
  expect(finishing.buy(player, 'jerrycan')).toBe('cannot_buy');

  expect(finishing.start(player)).toBeNull();
  finishing.update(1 / TICK_RATE);
  expect(finishing.phase()).toBe('results');
  push();
  const afterWin = player.queue.next();
  expect(afterWin.input.moveY).toBe(0);
  expect(finishing.buy(player, 'jerrycan')).toBe('cannot_buy');
  finishing.dispose();
});

test('L15: buy in the lobby gets cannot_buy and input is ignored through the server', () => {
  const { host, advance } = setup();
  const { client } = host();
  client.send({ type: 'input', ...NEUTRAL_INPUT, seq: 1, moveY: 1 });
  client.send({ type: 'buy', item: 'jerrycan' });
  advance(0.5);
  expect(reasons(client)).toEqual(['cannot_buy']);
  expect(client.ofType('snapshot')).toEqual([]);
});

test('colours and names in the lobby message are unchanged by the phase', () => {
  const { host, guest } = setup();
  const { client, room } = host('Amal');
  guest(room, 2, 'Badr');
  expect(client.last('lobby').players).toEqual([
    { playerId: 'p1', name: 'Amal', colour: PLAYER_COLOURS[0], ready: false, connected: true },
    { playerId: 'p2', name: 'Badr', colour: PLAYER_COLOURS[1], ready: false, connected: true },
  ]);
});

// --- L6 (task 2b): the remaining refusal rows ---

test('L6: a non-admin restartCheckpoint, adminTool or next gets not_admin, and has no effect', () => {
  const { host, guest, advance, server } = setup(true);
  const { client, room } = host();
  const badr = guest(room, 2);
  ready(badr);
  startRun(client);
  const world = server.debugWorld(room)!;
  badr.send({ type: 'restartCheckpoint' });
  badr.send({ type: 'adminTool', tool: 'refill' });
  badr.send({ type: 'adminTool', tool: 'skipCheckpoint' });
  advance(0.1);
  expect(client.last('lobby').phase).toBe('results');
  badr.send({ type: 'next' });
  expect(reasons(badr)).toEqual(['not_admin', 'not_admin', 'not_admin', 'not_admin']);
  expect(world.status().assisted).toBe(false);
  expect(world.status().restarts).toBe(0);
  expect(client.last('lobby').phase).toBe('results');
  expect(reasons(client)).toEqual([]);
});

test('L6: restartCheckpoint, adminTool and next in the wrong phase get bad_phase', () => {
  const { host, guest, advance } = setup(true);
  const { client, room } = host();
  const badr = guest(room, 2);
  // Lobby: no run to act on, and no results to leave.
  client.send({ type: 'restartCheckpoint' });
  client.send({ type: 'adminTool', tool: 'refill' });
  client.send({ type: 'next' });
  expect(reasons(client)).toEqual(['bad_phase', 'bad_phase', 'bad_phase']);
  ready(badr);
  startRun(client);
  // Playing: next belongs to the results.
  client.send({ type: 'next' });
  // Results: the run commands have nothing left to act on.
  advance(0.1);
  client.send({ type: 'restartCheckpoint' });
  client.send({ type: 'adminTool', tool: 'skipCheckpoint' });
  expect(reasons(client)).toEqual(Array(6).fill('bad_phase'));
  // not_admin still comes first.
  badr.send({ type: 'restartCheckpoint' });
  expect(reasons(badr)).toEqual(['not_admin']);
});

test('L6: malformed restartCheckpoint, adminTool and next messages get bad_message', () => {
  const { host } = setup();
  const { client } = host();
  client.sendRaw(JSON.stringify({ type: 'adminTool', tool: 'teleport' }));
  client.sendRaw(JSON.stringify({ type: 'adminTool' }));
  expect(reasons(client)).toEqual(['bad_message', 'bad_message']);
  const stranger = connectFakeClient(setup().server);
  for (const message of [{ type: 'restartCheckpoint' }, { type: 'adminTool', tool: 'refill' }, { type: 'next' }] as ClientMessage[]) stranger.send(message);
  expect(reasons(stranger)).toEqual(['bad_message', 'bad_message', 'bad_message']);
});

// --- L12: results and the campaign total ---

// Wins the run by carrying the vehicle into the finish box; returns once results are shown.
function finishRun(server: ReturnType<typeof setup>['server'], room: string, advance: (seconds: number) => void) {
  const world = server.debugWorld(room)!;
  const { center } = world.course.finish;
  world.debugBody('vehicle')!.setTranslation({ x: center.x, y: center.y, z: center.z }, true);
  advance(0.1);
}

test('L12: finishing test gives no campaign total; next selects segment-demo; finishing it gives the sum; finishing test again replaces its entry', () => {
  const { host, advance, server } = setup();
  const { client, room } = host();
  startRun(client);
  advance(0.5);
  finishRun(server, room, advance);
  const first = client.last('results');
  expect(first).toMatchObject({ courseId: 'test', assisted: false });
  expect(first.campaignTotal).toBeUndefined();

  client.send({ type: 'next' });
  expect(reasons(client)).toEqual([]);
  expect(client.last('lobby')).toMatchObject({ phase: 'lobby', courseId: 'segment-demo' });
  expect(server.debugWorld(room)).toBeNull();

  advance(1);
  startRun(client);
  advance(1);
  finishRun(server, room, advance);
  const second = client.last('results');
  expect(second.courseId).toBe('segment-demo');
  expect(second.campaignTotal).toBeCloseTo(first.finalTime + second.finalTime, 9);

  // The latest time of a course counts, not the first: test again, slower.
  client.send({ type: 'toLobby' });
  client.send({ ...settings, courseId: 'test', vehicleId: 'lodgy' });
  advance(1);
  startRun(client);
  advance(2);
  finishRun(server, room, advance);
  const third = client.last('results');
  expect(third.courseId).toBe('test');
  expect(third.finalTime).toBeGreaterThan(first.finalTime);
  expect(third.campaignTotal).toBeCloseTo(third.finalTime + second.finalTime, 9);
});

test('L12: an assisted run still counts toward the campaign total', () => {
  const { host, advance, server } = setup();
  const { client, room } = host();
  startRun(client);
  client.send({ type: 'adminTool', tool: 'refill' });
  finishRun(server, room, advance);
  const only = client.last('results');
  expect(only.assisted).toBe(true);
  client.send({ type: 'next' });
  advance(1);
  startRun(client);
  finishRun(server, room, advance);
  const last = client.last('results');
  expect(last.campaignTotal).toBeCloseTo(only.finalTime + last.finalTime, 9);
});

test('L12: next on the last campaign course, or on a course outside the campaign, gets bad_phase', () => {
  const { host, advance, server } = setup(true);
  const { client, room } = host();
  client.send({ ...settings, vehicleId: 'lodgy' });
  startRun(client);
  advance(0.1);
  expect(client.last('lobby').phase).toBe('results');
  client.send({ type: 'next' });
  expect(reasons(client)).toEqual(['bad_phase']);
  expect(client.last('lobby').phase).toBe('results');
  expect(server.debugWorld(room)).not.toBeNull();
});

test('L12: next resets readiness and the admin may start the next course', () => {
  const { host, guest, advance, server } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  ready(badr);
  startRun(client);
  finishRun(server, room, advance);
  client.send({ type: 'next' });
  expect(client.last('lobby').players.map((player) => player.ready)).toEqual([false, false]);
  startRun(client);
  expect(reasons(client)).toEqual(['not_ready']);
});

// --- L13: restarts and admin tools through the room ---

test('L13: restartCheckpoint puts the vehicle back, counts the restart and makes the next snapshot full', () => {
  const { host, advance, server } = setup();
  const { client, room } = host();
  startRun(client);
  advance(0.5);
  server.debugWorld(room)!.debugBody('vehicle')!.setTranslation({ x: 0, y: 1, z: -20 }, true);
  advance(0.2);
  expect(client.last('snapshot').vehicle.pos.z).toBeLessThan(-10);
  client.received.length = 0;
  client.send({ type: 'restartCheckpoint' });
  expect(reasons(client)).toEqual([]);
  advance(0.2);
  const [first] = client.ofType('snapshot');
  expect(first!.full).toBe(true);
  expect(first!.restarts).toBe(1);
  expect(first!.vehicle.pos.z).toBeGreaterThan(-5);
});

test('L13: adminTool refill sets assisted and refills; skipCheckpoint moves the crew and the next snapshot is full for everyone', () => {
  const { host, guest, advance, server } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  ready(badr);
  startRun(client);
  advance(0.5);
  const world = server.debugWorld(room)!;
  world.debugVehicle().addFuel(-0.5);
  client.send({ type: 'adminTool', tool: 'refill' });
  expect(world.status().assisted).toBe(true);
  expect(world.debugVehicle().fuel()).toBe(1);

  advance(0.5);
  client.received.length = 0;
  badr.received.length = 0;
  client.send({ type: 'adminTool', tool: 'skipCheckpoint' });
  expect(reasons(client)).toEqual([]);
  advance(0.2);
  for (const player of [client, badr]) {
    const [first] = player.ofType('snapshot');
    expect(first!.full).toBe(true);
    expect(first!.checkpoint).toBe(1);
    expect(first!.assisted).toBe(true);
    expect(first!.vehicle.pos.z).toBeLessThan(-30);
  }
});

test('L13: an admin tool that does nothing is not an error and keeps snapshots partial', () => {
  const { host, advance, server } = setup();
  const { client, room } = host();
  startRun(client);
  advance(0.5);
  // The last checkpoint has nothing after it.
  const world = server.debugWorld(room)!;
  while (world.adminTool('skipCheckpoint'));
  advance(0.3);
  const sent = client.ofType('snapshot').length;
  client.send({ type: 'adminTool', tool: 'skipCheckpoint' });
  advance(0.3);
  expect(reasons(client)).toEqual([]);
  expect(client.ofType('snapshot').slice(sent).every((snapshot) => !snapshot.full)).toBe(true);
});

test('L13: restartCourse resets restarts, respawns, coins and assisted', () => {
  const { host, advance, server } = setup();
  const { client, room } = host();
  startRun(client);
  advance(0.3);
  const world = server.debugWorld(room)!;
  const coin = world.course.coins[0]!;
  client.send({ type: 'restartCheckpoint' });
  client.send({ type: 'adminTool', tool: 'refill' });
  advance(0.1);
  world.teleportPlayer('p1', coin.pose.pos);
  advance(0.2);
  const dirty = client.last('snapshot');
  expect(dirty).toMatchObject({ restarts: 1, assisted: true });
  expect(dirty.coinsCollected).toBe(1);

  advance(1);
  client.send({ type: 'restartCourse' });
  advance(0.3);
  expect(client.last('snapshot')).toMatchObject({ restarts: 0, respawns: 0, wallet: 0, coinsCollected: 0, assisted: false, checkpoint: 0 });
});

// --- Task 2a review: takeover and joiners across a restart ---

test('a takeover during playing after restartCourse gets a full snapshot, and its inputs count from seq 1', () => {
  const { host, advance, server } = setup();
  const { client, room } = host();
  startRun(client);
  advance(0.5);
  client.send({ type: 'input', ...NEUTRAL_INPUT, seq: 40 });
  advance(0.2);
  client.send({ type: 'restartCourse' });
  advance(0.2);

  const again = connectFakeClient(server);
  again.send({ type: 'join', room, name: 'Amal', token: token(1) });
  again.send({ type: 'input', ...NEUTRAL_INPUT, seq: 1 });
  advance(0.2);
  const first = again.ofType('snapshot')[0]!;
  expect(first.full).toBe(true);
  expect(first.players.map((player) => player.playerId)).toEqual(['p1']);
  expect(again.last('snapshot').ackSeq).toBe(1);
  expect(server.debugWorld(room)!.snapshot().players).toHaveLength(1);
});

test('a player who joined in the lobby has a character in the world after start', () => {
  const { host, guest, advance, server } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  ready(badr);
  expect(server.debugWorld(room)).toBeNull();
  startRun(client);
  expect(server.debugWorld(room)!.snapshot().players.map((player) => player.playerId)).toEqual(['p1', 'p2']);
  advance(0.2);
  expect(badr.ofType('snapshot')[0]!.players.map((player) => player.playerId)).toEqual(['p1', 'p2']);
});

// --- held slots, admin handover and kick (task 3) ---

// Advances in one-second steps with the given clients answering pings, so that silence does not drop them.
const wait = (advance: (seconds: number) => void, seconds: number, ...clients: FakeClient[]) => {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1) {
    for (const client of clients) client.send({ type: 'pong' });
    advance(1);
  }
};

const rejoin = (server: ReturnType<typeof setup>['server'], room: string, n: number, name = 'Ignored') => {
  const client = connectFakeClient(server);
  client.send({ type: 'join', room, name, token: token(n) });
  return client;
};

const playerOf = (server: ReturnType<typeof setup>['server'], room: string, id: string) => server.debugWorld(room)!.snapshot().players.find((player) => player.playerId === id);

test('L8: a disconnect marks the slot connected: false and keeps ready, colour and name', () => {
  const { host, guest } = setup();
  const { client, room } = host();
  const badr = guest(room, 2, 'Badr');
  ready(badr);
  badr.close();
  expect(client.last('lobby').players[1]).toMatchObject({ playerId: 'p2', name: 'Badr', ready: true, connected: false, colour: PLAYER_COLOURS[1] });
});

test('L8: a rejoin within the hold keeps playerId, colour, ready state and name, ignoring the join name', () => {
  const { host, guest, server, advance } = setup();
  const { client, room } = host();
  const badr = guest(room, 2, 'Badr');
  ready(badr);
  badr.close();
  wait(advance, HELD_SLOT_TIMEOUT - 1, client);
  const again = rejoin(server, room, 2, 'Someone else');
  expect(again.received.map((message) => message.type)).toEqual(['welcome', 'lobby']);
  expect(again.last('welcome').playerId).toBe('p2');
  expect(again.last('lobby').players[1]).toMatchObject({ playerId: 'p2', name: 'Badr', ready: true, connected: true, colour: PLAYER_COLOURS[1] });
  // The slot is not freed later.
  wait(advance, 5, client, again);
  expect(client.last('lobby').players).toHaveLength(2);
});

test('L8: the admin keeps the role through a hold and a rejoin', () => {
  const { host, guest, server, advance } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  client.close();
  wait(advance, 10, badr);
  const again = rejoin(server, room, 1);
  expect(again.last('welcome').playerId).toBe('p1');
  expect(again.last('lobby').adminId).toBe('p1');
});

test('L8: in playing a rejoin restores health and inventory, and sends a full snapshot', () => {
  const { host, guest, server, advance } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  ready(badr);
  startRun(client);
  advance(0.2);
  const world = server.debugWorld(room)!;
  world.debugSetInventory('p2', ['jerrycan', 'toolbox', null]);
  world.debugHurt('p2', 30);
  advance(0.2);
  badr.close();
  expect(playerOf(server, room, 'p2')).toBeUndefined();
  wait(advance, 5, client);
  const again = rejoin(server, room, 2);
  expect(again.last('welcome').playerId).toBe('p2');
  expect(playerOf(server, room, 'p2')).toMatchObject({ health: 70, inventory: ['jerrycan', 'toolbox', null] });
  advance(0.2);
  expect(again.ofType('snapshot')[0]!.full).toBe(true);
  expect(again.ofType('snapshot')[0]!.players.map((player) => player.playerId)).toEqual(['p1', 'p2']);
});


test('L8: a downed player who rejoins has 50 health and respawns goes up by one', () => {
  const { host, guest, server, advance } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  ready(badr);
  startRun(client);
  advance(0.2);
  const world = server.debugWorld(room)!;
  world.debugHurt('p2', 100);
  advance(0.2);
  badr.close();
  const respawns = world.status().respawns;
  rejoin(server, room, 2);
  expect(playerOf(server, room, 'p2')).toMatchObject({ health: PLAYER_REVIVE_HEALTH, downed: null });
  expect(world.status().respawns).toBe(respawns + 1);
});

test('L8: after the hold the slot is freed, the name can be taken again and the inventory drops in the world', () => {
  const { host, guest, server, advance } = setup();
  const { client, room } = host();
  const badr = guest(room, 2, 'Badr');
  ready(badr);
  startRun(client);
  advance(0.2);
  const world = server.debugWorld(room)!;
  world.debugSetInventory('p2', ['jerrycan', 'toolbox', null]);
  badr.close();
  const props = world.snapshot().props.length;
  wait(advance, HELD_SLOT_TIMEOUT - 1, client);
  expect(world.snapshot().props.length).toBe(props);
  expect(reasons(guest(room, 3, 'badr'))).toEqual(['name_taken']);
  wait(advance, 1, client);
  expect(client.last('lobby').players.map((player) => player.name)).toEqual(['Amal']);
  expect(world.snapshot().props.length).toBe(props + 2);
  // A rejoin with the old token is now a new player.
  const late = rejoin(server, room, 2, 'Badr');
  expect(late.last('welcome').playerId).toBe('p3');
  expect(late.last('lobby').players.map((player) => player.name)).toEqual(['Amal', 'Badr']);
});

test('L8: held slots count toward six and keep their names reserved', () => {
  const { host, guest } = setup();
  const { client, room } = host();
  const others = [2, 3, 4, 5, 6].map((n) => guest(room, n));
  for (const other of others) other.close();
  expect(client.last('lobby').players).toHaveLength(6);
  expect(reasons(guest(room, 7))).toEqual(['room_full']);
  expect(reasons(guest(room, 8, 'guest2'))).toEqual(['room_full']);
});

test('L6: a held player who is not ready does not block start', () => {
  const { host, guest } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  const chadi = guest(room, 3);
  ready(chadi);
  startRun(client);
  expect(reasons(client)).toEqual(['not_ready']);
  badr.close();
  startRun(client);
  expect(reasons(client)).toEqual(['not_ready']);
  expect(client.last('lobby').phase).toBe('playing');
});

test('a held slot is not added to the world at start, and is added when it rejoins', () => {
  const { host, guest, server, advance } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  badr.close();
  startRun(client);
  expect(server.debugWorld(room)!.snapshot().players.map((player) => player.playerId)).toEqual(['p1']);
  advance(0.2);
  expect(badr.ofType('snapshot')).toEqual([]);
  rejoin(server, room, 2);
  expect(playerOf(server, room, 'p2')).toMatchObject({ health: 100, inventory: [null, null, null] });
});

test('a room whose players are all held is paused and not deleted before the empty timeout', () => {
  const { host, guest, server, advance } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  ready(badr);
  startRun(client);
  advance(0.5);
  const tick = server.debugWorld(room)!.snapshot().tick;
  client.close();
  badr.close();
  advance(10);
  expect(server.debugWorld(room)!.snapshot().tick).toBe(tick);
  expect(server.roomCount()).toBe(1);
});

// --- L9: admin handover ---

test('L9: the admin hold expires and the longest-connected player becomes admin, not the earliest joiner', () => {
  const { host, guest, server, advance } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  const chadi = guest(room, 3);
  wait(advance, 2, client, badr, chadi);
  // Badr drops and comes back later than Chadi joined.
  badr.close();
  wait(advance, 2, client, chadi);
  const badrAgain = rejoin(server, room, 2);
  wait(advance, 2, client, chadi, badrAgain);
  client.close();
  wait(advance, HELD_SLOT_TIMEOUT - 1, chadi, badrAgain);
  expect(chadi.last('lobby').adminId).toBe('p1');
  wait(advance, 1, chadi, badrAgain);
  expect(chadi.last('lobby').adminId).toBe('p3');
  expect(badrAgain.last('lobby').adminId).toBe('p3');
});

test('L9: with nobody connected the role waits for the next joiner, who may be a held player rejoining', () => {
  const { host, guest, server, advance } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  client.close();
  wait(advance, 10, badr);
  badr.close();
  // The admin slot expires while nobody is connected.
  advance(HELD_SLOT_TIMEOUT - 10);
  const again = rejoin(server, room, 2);
  expect(again.last('lobby').players.map((player) => player.name)).toEqual(['Guest2']);
  expect(again.last('lobby').adminId).toBe('p2');
});

// --- L10: kick ---

test('L10: the target gets error kicked and is closed, and the slot is freed at once', () => {
  const { host, guest } = setup();
  const { client, room } = host();
  const badr = guest(room, 2, 'Badr');
  const chadi = guest(room, 3);
  client.send({ type: 'kick', playerId: 'p2' });
  expect(reasons(client)).toEqual([]);
  expect(reasons(badr)).toEqual(['kicked']);
  expect(badr.closedByServer).toBe(true);
  for (const player of [client, chadi]) expect(player.last('lobby').players.map((entry) => entry.name)).toEqual(['Amal', 'Guest3']);
  expect(chadi.closedByServer).toBe(false);
  // The closed connection's late close changes nothing, and the name is free.
  badr.close();
  expect(guest(room, 4, 'Badr').last('welcome').playerId).toBe('p4');
});

test('L10: a kicked player in playing drops their items at a spawn slot', () => {
  const { host, guest, server, advance } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  ready(badr);
  startRun(client);
  advance(0.2);
  const world = server.debugWorld(room)!;
  world.debugSetInventory('p2', ['jerrycan', 'toolbox', null]);
  const props = world.snapshot().props.length;
  client.send({ type: 'kick', playerId: 'p2' });
  expect(world.snapshot().props.length).toBe(props + 2);
  expect(playerOf(server, room, 'p2')).toBeUndefined();
});

test('L10: kicking a held slot frees it with no message, and drops its items', () => {
  const { host, guest, server, advance } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  ready(badr);
  startRun(client);
  advance(0.2);
  const world = server.debugWorld(room)!;
  world.debugSetInventory('p2', ['jerrycan', null, null]);
  badr.close();
  const props = world.snapshot().props.length;
  const before = badr.received.length;
  client.send({ type: 'kick', playerId: 'p2' });
  expect(reasons(client)).toEqual([]);
  expect(badr.received.length).toBe(before);
  expect(client.last('lobby').players.map((player) => player.name)).toEqual(['Amal']);
  expect(world.snapshot().props.length).toBe(props + 1);
});

test('L10: kicking oneself or an unknown id gets bad_message, and a non-admin gets not_admin', () => {
  const { host, guest } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  client.send({ type: 'kick', playerId: 'p1' });
  client.send({ type: 'kick', playerId: 'p9' });
  badr.send({ type: 'kick', playerId: 'p1' });
  expect(reasons(client)).toEqual(['bad_message', 'bad_message']);
  expect(reasons(badr)).toEqual(['not_admin']);
  expect(client.last('lobby').players).toHaveLength(2);
});

test('L10: a kick works in every phase', () => {
  const { host, guest, advance } = setup(true);
  const { client, room } = host();
  const names = (c: FakeClient) => c.last('lobby').players.map((player) => player.name);
  guest(room, 2);
  client.send({ type: 'kick', playerId: 'p2' });
  expect(names(client)).toEqual(['Amal']);
  const chadi = guest(room, 3, 'Chadi');
  ready(chadi);
  startRun(client);
  expect(client.last('lobby').phase).toBe('playing');
  guest(room, 4, 'Dina');
  client.send({ type: 'kick', playerId: 'p4' });
  expect(reasons(client)).toEqual([]);
  expect(names(client)).toEqual(['Amal', 'Chadi']);
  advance(0.1);
  expect(client.last('lobby').phase).toBe('results');
  client.send({ type: 'kick', playerId: 'p3' });
  expect(reasons(client)).toEqual([]);
  expect(chadi.closedByServer).toBe(true);
  expect(names(client)).toEqual(['Amal']);
});

// --- L14: the name rule through create and join ---

test('L14: names with control or invisible characters are refused on create and join; plain and accented names pass', () => {
  const { server, host } = setup();
  for (const name of ['a\u0000b', 'a\nb', 'a\u200bb', 'a\u2028b', ' ']) {
    const creator = connectFakeClient(server);
    creator.send({ type: 'create', name, token: token(1) });
    expect(reasons(creator)).toEqual(['bad_message']);
    expect(creator.ofType('welcome')).toEqual([]);
  }
  expect(server.roomCount()).toBe(0);
  const { room } = host('Amal');
  for (const [n, name] of ['a\u0000b', 'a\nb', 'a\u200bb', 'a\u2028b', ' '].entries()) {
    const joiner = connectFakeClient(server);
    joiner.send({ type: 'join', room, name, token: token(10 + n) });
    expect(reasons(joiner)).toEqual(['bad_message']);
  }
  const unal = connectFakeClient(server);
  unal.send({ type: 'join', room, name: 'Ünal', token: token(20) });
  expect(unal.last('welcome').playerId).toBe('p2');
});

// --- N19: world rebuild cooldown, and no broadcast for unchanged settings ---

test('N19: start and restartCourse within the cooldown of a build get bad_phase, and succeed after it', () => {
  const { host, advance, server } = setup();
  const { client, room } = host();
  startRun(client);
  const first = server.debugWorld(room)!;
  advance(WORLD_REBUILD_COOLDOWN / 2);
  client.send({ type: 'restartCourse' });
  expect(reasons(client)).toEqual(['bad_phase']);
  expect(server.debugWorld(room)).toBe(first);

  advance(WORLD_REBUILD_COOLDOWN);
  client.send({ type: 'restartCourse' });
  expect(reasons(client)).toEqual(['bad_phase']);
  expect(server.debugWorld(room)).not.toBe(first);

  client.send({ type: 'toLobby' });
  client.send({ type: 'start' });
  expect(reasons(client)).toEqual(['bad_phase', 'bad_phase']);
  expect(client.last('lobby').phase).toBe('lobby');
  advance(WORLD_REBUILD_COOLDOWN);
  client.send({ type: 'start' });
  expect(client.last('lobby').phase).toBe('playing');
});

test('N19: configure with unchanged settings and ready with an unchanged value do not broadcast lobby', () => {
  const { host, guest } = setup();
  const { client, room } = host();
  const badr = guest(room, 2);
  client.send(settings);
  ready(badr);
  client.received.length = 0;
  client.send(settings);
  ready(badr);
  expect(client.ofType('lobby')).toEqual([]);
  expect(reasons(client)).toEqual([]);
  client.send({ ...settings, weather: 'sandstorm' });
  expect(client.ofType('lobby')).toHaveLength(1);
});

// --- W3: weather reaches the world ---

test('W3: a rain room builds its world with rain grip, at start and after restartCourse; the default is clear', () => {
  const { host, advance, server } = setup();
  const { client, room } = host();
  startRun(client);
  advance(0.1);
  const clear = VEHICLES.lodgy.grip;
  for (const slip of server.debugWorld(room)!.debug().wheelFrictionSlips) expect(slip).toBeCloseTo(clear, 6);

  client.send({ type: 'toLobby' });
  advance(WORLD_REBUILD_COOLDOWN + 0.1);
  client.send({ type: 'configure', courseId: 'test', vehicleId: 'lodgy', timeOfDay: 'midday', weather: 'rain' });
  startRun(client);
  advance(0.1);
  const wet = () => server.debugWorld(room)!.debug().wheelFrictionSlips;
  expect(wet()).toHaveLength(4);
  for (const slip of wet()) expect(slip).toBeCloseTo(clear * RAIN_GRIP, 6);

  const before = server.debugWorld(room);
  advance(WORLD_REBUILD_COOLDOWN + 0.1);
  client.send({ type: 'restartCourse' });
  expect(server.debugWorld(room)).not.toBe(before);
  advance(0.1);
  for (const slip of wet()) expect(slip).toBeCloseTo(clear * RAIN_GRIP, 6);
});

test('C9: a one-course campaign: finishing gives campaignTotal equal to the final time, next is bad_phase, and the room starts on it', () => {
  const fake = createFakeDeps(RAPIER);
  const server = createRoomServer(fake.deps, { campaign: ['test'], courses: { test: finishAtStart('test') } });
  const client = connectFakeClient(server);
  client.send({ type: 'create', name: 'Amal', token: token(1) });
  expect(client.last('lobby').courseId).toBe('test');
  startRun(client);
  fake.advance(0.1);
  const result = client.last('results');
  expect(result.campaignTotal).toBeCloseTo(result.finalTime, 9);
  client.send({ type: 'next' });
  expect(client.last('error').reason).toBe('bad_phase');
  expect(client.last('lobby').phase).toBe('results');
});

test('C9: a two-course campaign passed explicitly starts on its first course and next selects the second', () => {
  const fake = createFakeDeps(RAPIER);
  const server = createRoomServer(fake.deps, {
    campaign: ['segment-demo', 'test'],
    courses: { test: finishAtStart('test'), 'segment-demo': finishAtStart('segment-demo') },
  });
  const client = connectFakeClient(server);
  client.send({ type: 'create', name: 'Amal', token: token(1) });
  expect(client.last('lobby').courseId).toBe('segment-demo');
  startRun(client);
  fake.advance(0.1);
  expect(client.last('results').campaignTotal).toBeUndefined();
  client.send({ type: 'next' });
  expect(client.last('lobby').courseId).toBe('test');
});
