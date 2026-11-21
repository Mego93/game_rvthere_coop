import RAPIER from '@dimforge/rapier3d-compat';
import { IDENTITY, SNAPSHOT_EVERY_TICKS, TICK_DT, WORLD_REBUILD_COOLDOWN, getCourse, vec3, type BuiltCourse, type RoomSettings, type ServerMessage } from '@lodgy/shared';
import { beforeAll, expect, test } from 'vitest';
import { createRoom } from './room';

beforeAll(async () => {
  await RAPIER.init();
});

const token = (n: number) => `token-${n}-abcdefghij`;

const IDS = ['a', 'b', 'c', 'd', 'e'];

// Small stand-ins for the five stages; the ones in `finishing` are won on the first tick.
function stages(finishing: readonly string[], targets: readonly number[] = [100, 100, 100, 100, 100]): Record<string, BuiltCourse> {
  const base = getCourse('test');
  const result: Record<string, BuiltCourse> = {};
  IDS.forEach((id, i) => {
    const finish = finishing.includes(id) ? { center: base.checkpoints[0]!.spawn.pos, halfExtents: vec3(20, 20, 20), rot: IDENTITY } : base.finish;
    result[id] = { ...base, id, targetTime: targets[i]!, finish, pickups: [] };
  });
  return result;
}

function setup(finishing: readonly string[], targets?: readonly number[]) {
  const room = createRoom(RAPIER, { noun: 'chain', campaign: IDS, courses: stages(finishing, targets) }, 0);
  let time = 0;
  const messages: ServerMessage[] = [];
  const admin = room.add('P1', token(1), { send: (data) => messages.push(JSON.parse(data) as ServerMessage), close: () => {} });
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      time += TICK_DT;
      room.update(time);
    }
  };
  const settings = (fields: Partial<RoomSettings> = {}): RoomSettings => ({ courseId: 'a', vehicleId: 'lodgy', timeOfDay: 'midday', weather: 'clear', chain: true, mode: 'race', ...fields });
  const ofType = <T extends ServerMessage['type']>(type: T) => messages.filter((message): message is Extract<ServerMessage, { type: T }> => message.type === type);
  const lastLobby = () => ofType('lobby')[ofType('lobby').length - 1]!;
  run(2);
  return { room, admin, messages, run, settings, ofType, lastLobby, now: () => time };
}

test('R1: chain is accepted only for a course in the campaign, and is otherwise forced off', () => {
  const { room, admin, settings, lastLobby } = setup([]);
  expect(room.configure(admin, settings({ courseId: 'c' }))).toBeNull();
  expect(lastLobby().chain).toBe(true);
  expect(room.configure(admin, settings({ courseId: 'test' }))).toBeNull();
  expect(lastLobby().courseId).toBe('test');
  expect(lastLobby().chain).toBe(false);
  room.dispose();
});

test('R1: with chain on, start begins at the first stage whatever course is set, and announces it', () => {
  const { room, admin, settings, lastLobby, ofType } = setup([]);
  room.configure(admin, settings({ courseId: 'c' }));
  expect(room.start(admin)).toBeNull();
  expect(lastLobby().courseId).toBe('a');
  expect(room.debugWorld()!.course.id).toBe('a');
  expect(ofType('stage')).toEqual([{ type: 'stage', courseId: 'a', index: 0, of: 5 }]);
  room.dispose();
});

test('R1: without chain a single stage plays alone and ends in results', () => {
  const { room, admin, settings, run, ofType } = setup(['c']);
  room.configure(admin, settings({ courseId: 'c', chain: false }));
  room.start(admin);
  run(3);
  expect(room.phase()).toBe('results');
  expect(ofType('stage')).toEqual([]);
  expect(ofType('results')[0]!.courseId).toBe('c');
  room.dispose();
});

test('R2: winning a stage that is not the last sends stage, keeps playing and sends a full snapshot', () => {
  const { room, admin, settings, run, ofType, messages } = setup(['a', 'b']);
  room.configure(admin, settings());
  room.start(admin);
  run(1);
  expect(room.phase()).toBe('playing');
  expect(ofType('stage').map(({ courseId, index }) => [courseId, index])).toEqual([['a', 0], ['b', 1]]);
  const stageAt = messages.findIndex((message) => message.type === 'stage' && message.index === 1);
  const after = messages.slice(stageAt).find((message) => message.type === 'snapshot');
  expect(after).toMatchObject({ type: 'snapshot', full: true });
  run(3);
  // b is won on its first tick too, so the room is on c now.
  expect(room.debugWorld()!.course.id).toBe('c');
  expect(room.phase()).toBe('playing');
  expect(ofType('results')).toEqual([]);
  room.dispose();
});

test('R3: fuel and the timer carry into the next stage, and tick numbers keep rising', () => {
  const { room, admin, settings, run, messages } = setup(['a']);
  room.configure(admin, settings());
  room.start(admin);
  room.debugWorld()!.debugVehicle().addFuel(-0.5);
  run(1);
  const world = room.debugWorld()!;
  expect(world.course.id).toBe('b');
  expect(world.debugVehicle().fuel()).toBeCloseTo(0.5, 1);
  expect(world.snapshot().elapsed).toBeGreaterThan(0);
  run(5);
  const ticks = messages.filter((message) => message.type === 'snapshot').map((message) => (message as { tick: number }).tick);
  expect(ticks).toEqual([...ticks].sort((x, y) => x - y));
  room.dispose();
});

test('R5: the final results come only after the last stage, with one summed time recorded as campaignTotal', () => {
  // The last stage has a tiny target: the single stage would miss its time star, the summed target does not.
  const { room, admin, settings, run, ofType } = setup(IDS, [100, 100, 100, 100, 0.01]);
  room.configure(admin, settings());
  room.start(admin);
  run(1);
  expect(ofType('results')).toEqual([]);
  run(10);
  const results = ofType('results');
  expect(results).toHaveLength(1);
  expect(room.phase()).toBe('results');
  const final = results[0]!;
  expect(final.courseId).toBe('run');
  expect(final.campaignTotal).toBe(final.finalTime);
  expect(final.stars[1]).toBe(true);
  expect(final.elapsed).toBeGreaterThan(4 * TICK_DT);
  room.dispose();
});

test('R4: restart course in a chain restarts the current stage with the carry it began with and counts a restart', () => {
  const { room, admin, settings, run } = setup(['a']);
  room.configure(admin, settings());
  room.start(admin);
  room.debugWorld()!.debugVehicle().addFuel(-0.5);
  run(1);
  const begun = room.debugWorld()!.snapshot().elapsed;
  room.debugWorld()!.debugVehicle().addFuel(-0.3);
  run(Math.ceil((WORLD_REBUILD_COOLDOWN + 1) / TICK_DT));
  expect(room.restartCourse(admin)).toBeNull();
  const world = room.debugWorld()!;
  expect(world.course.id).toBe('b');
  expect(world.debugVehicle().fuel()).toBeCloseTo(0.5, 1);
  expect(world.snapshot().elapsed).toBeCloseTo(begun, 6);
  expect(world.snapshot().restarts).toBe(1);
  run(Math.ceil((WORLD_REBUILD_COOLDOWN + 1) / TICK_DT));
  expect(room.restartCourse(admin)).toBeNull();
  expect(room.debugWorld()!.snapshot().restarts).toBe(2);
  room.dispose();
});

test('R4: restart course on the first stage of a chain also counts, and keeps a fresh start', () => {
  const { room, admin, settings, run } = setup([]);
  room.configure(admin, settings());
  room.start(admin);
  run(Math.ceil((WORLD_REBUILD_COOLDOWN + 1) / TICK_DT));
  expect(room.restartCourse(admin)).toBeNull();
  const snapshot = room.debugWorld()!.snapshot();
  expect(snapshot.restarts).toBe(1);
  expect(snapshot.elapsed).toBe(0);
  room.dispose();
});

test('R6: a player who rejoins mid-chain gets the lobby state, the stage message and a full snapshot', () => {
  const { room, admin, settings, run, now } = setup(['a']);
  room.configure(admin, settings());
  room.start(admin);
  run(2);
  expect(room.debugWorld()!.course.id).toBe('b');
  const second: ServerMessage[] = [];
  const guest = room.add('P2', token(2), { send: (data) => second.push(JSON.parse(data) as ServerMessage), close: () => {} });
  room.announce();
  room.catchUp(guest);
  room.hold(guest, now());
  const third: ServerMessage[] = [];
  room.rejoin(guest, { send: (data) => third.push(JSON.parse(data) as ServerMessage), close: () => {} }, now());
  room.announce();
  room.catchUp(guest);
  run(SNAPSHOT_EVERY_TICKS * 2);
  expect(third.find((message) => message.type === 'snapshot')).toMatchObject({ full: true });
  for (const received of [second, third]) {
    expect(received.find((message) => message.type === 'lobby')).toMatchObject({ phase: 'playing', courseId: 'b', chain: true });
    expect(received.find((message) => message.type === 'stage')).toEqual({ type: 'stage', courseId: 'b', index: 1, of: 5 });
  }
  room.dispose();
});

test('leaving to the lobby ends the chain: a later single start plays one stage', () => {
  const { room, admin, settings, run, ofType } = setup(['c']);
  room.configure(admin, settings());
  room.start(admin);
  run(2);
  expect(room.toLobby(admin)).toBeNull();
  run(Math.ceil((WORLD_REBUILD_COOLDOWN + 1) / TICK_DT));
  room.configure(admin, settings({ courseId: 'c', chain: false }));
  expect(room.start(admin)).toBeNull();
  run(3);
  expect(room.phase()).toBe('results');
  expect(ofType('results')[0]!.courseId).toBe('c');
  room.dispose();
});

test('a player seated when the stage ends sits in the same seat of the new vehicle', () => {
  const { room, admin, settings, run } = setup(['a']);
  room.configure(admin, settings());
  room.start(admin);
  room.debugWorld()!.debugSeat('p1', 'driver');
  run(1);
  const world = room.debugWorld()!;
  expect(world.course.id).toBe('b');
  expect(world.snapshot().players.map((player) => [player.playerId, player.seat])).toEqual([['p1', 'driver']]);
  room.dispose();
});
