import RAPIER from '@dimforge/rapier3d-compat';
import { IDENTITY, NEUTRAL_INPUT, PLAYER_COLOURS, TICK_RATE, getCourse, vec3, type BuiltCourse, type ClientMessage, type ServerMessage } from '@lodgy/shared';
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

function setup(finishing = false) {
  const fake = createFakeDeps(RAPIER);
  const server = createRoomServer(fake.deps, finishing ? { courses: { test: finishAtStart('test'), 'segment-demo': finishAtStart('segment-demo') } } : {});
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
  // Leaving again, though never in the world, is harmless.
  badr.close();
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
  const finishing = createRoom(RAPIER, { noun: 'test', courses: { test: finishAtStart('test') } }, 0);
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

  startRun(client);
  advance(1);
  finishRun(server, room, advance);
  const second = client.last('results');
  expect(second.courseId).toBe('segment-demo');
  expect(second.campaignTotal).toBeCloseTo(first.finalTime + second.finalTime, 9);

  // The latest time of a course counts, not the first: test again, slower.
  client.send({ type: 'toLobby' });
  client.send({ ...settings, courseId: 'test', vehicleId: 'lodgy' });
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
