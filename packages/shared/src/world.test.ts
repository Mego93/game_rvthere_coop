import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, test } from 'vitest';
import { PLAYER_KILL_RESPAWN_DELAY, TICK_RATE } from './constants';
import { IDENTITY, add, quatFromAxisAngle, rotate, vec3, yawOf, AXIS_Y, type Vec3 } from './math';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { testGround } from './courses/testGround';
import { withBoxes } from './testRig';
import { VEHICLES } from './vehicles';
import { createWorld, type World } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const input = (fields: Partial<PlayerInput>): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });

function run(world: World, ticks: number, inputs: Map<string, PlayerInput>) {
  for (let i = 0; i < ticks; i++) world.step(inputs);
}

test('rejects unknown courses and vehicles', () => {
  expect(() => createWorld(RAPIER, { courseId: 'nope', vehicleId: 'lodgy' })).toThrow('Unknown course: nope');
  expect(() => createWorld(RAPIER, { courseId: 'test', vehicleId: 'bus' })).toThrow('Unknown vehicle: bus');
});

test('spawns the chosen vehicle at the first checkpoint', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'rv' });
  expect(world.vehicleConfig).toBe(VEHICLES.rv);
  run(world, 120, new Map());
  const { tick, vehicle } = world.snapshot();
  expect(tick).toBe(120);
  expect(vehicle.pos.x).toBeCloseTo(0, 2);
  expect(vehicle.pos.z).toBeCloseTo(0, 2);
  expect(vehicle.pos.y).toBeCloseTo(VEHICLES.rv.rideHeight, 1);
});

test('with no input the vehicle does not move', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  run(world, 300, new Map());
  expect(Math.abs(world.debug().forwardSpeed)).toBeLessThan(0.01);
});

test('the first input in the map drives: moveY is throttle, moveX is steer, jump is brake', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  run(world, 60, new Map());
  const inputs = new Map([
    ['a', input({ moveY: 1, moveX: 0.3 })],
    ['b', input({ moveY: -1, moveX: -1 })],
  ]);
  run(world, 180, inputs);
  const moving = world.snapshot().vehicle;
  expect(moving.throttle).toBe(1);
  expect(moving.steer).toBe(0.3);
  expect(moving.pos.z).toBeLessThan(-3);
  expect(moving.pos.x).toBeGreaterThan(0.5);

  run(world, 300, new Map([['a', input({ jump: true })]]));
  expect(Math.abs(world.debug().forwardSpeed)).toBeLessThan(0.01);
});

test('step returns an event list and debug reports wheel surfaces', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  expect(world.step(new Map())).toEqual([]);
  run(world, 60, new Map());
  expect(world.debug().wheelSurfaces).toEqual(['road', 'road', 'road', 'road']);
});

test('the same inputs produce the same snapshot', () => {
  const play = () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    run(world, 60, new Map());
    run(world, 240, new Map([['a', input({ moveY: 1, moveX: 0.4 })]]));
    run(world, 120, new Map([['a', input({ moveY: -1, moveX: -1 })]]));
    return JSON.stringify(world.snapshot());
  };
  expect(play()).toBe(play());
});

test('rejects ids that are only inherited object keys', () => {
  expect(() => createWorld(RAPIER, { courseId: 'constructor', vehicleId: 'lodgy' })).toThrow(
    'Unknown course: constructor',
  );
  expect(() => createWorld(RAPIER, { courseId: 'test', vehicleId: 'toString' })).toThrow('Unknown vehicle: toString');
});

test('an input that is not a finite number is treated as no input and does no lasting harm', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  run(world, 60, new Map());
  run(world, 5, new Map([['a', input({ moveY: Number.NaN, moveX: Number.POSITIVE_INFINITY })]]));
  expect(world.snapshot().vehicle.throttle).toBe(0);
  expect(world.snapshot().vehicle.steer).toBe(0);
  run(world, 120, new Map([['a', input({ moveY: 1 })]]));
  expect(world.snapshot().vehicle.pos.z).toBeLessThan(-2);
});

test('shared course and vehicle data cannot be modified', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  expect(() => {
    (world.vehicleConfig as { mass: number }).mass = 1;
  }).toThrow(TypeError);
  expect(() => {
    world.course.checkpoints[0]!.spawn.pos.x = 5;
  }).toThrow(TypeError);
  expect(() => {
    (world.vehicleConfig.seats[0] as { side: number }).side = 1;
  }).toThrow(TypeError);
  expect(() => {
    (world.vehicleConfig.spawnSlots[0] as { x: number }).x = 0;
  }).toThrow(TypeError);
});

test('dispose frees the physics world', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  run(world, 10, new Map());
  world.dispose();
  expect(() => world.step(new Map())).toThrow();
});

// --- players on foot ---

// The vehicle drives from the first entry in the map, so a neutral dummy goes first.
const walking = (id: string, fields: Partial<PlayerInput>) =>
  new Map([
    ['nobody', input({})],
    [id, input(fields)],
  ]);

function slotPositions(world: World): Vec3[] {
  const { pos, rot } = world.snapshot().vehicle;
  const turn = quatFromAxisAngle(AXIS_Y, yawOf(rot));
  return world.vehicleConfig.spawnSlots.map((slot) => {
    const at = add(pos, rotate(turn, slot));
    return vec3(at.x, 0, at.z);
  });
}

test('a player is added at spawn slot 0, on the ground and unseated', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p1');
  const [slot] = slotPositions(world);
  const [player] = world.snapshot().players;
  expect(player!.playerId).toBe('p1');
  expect(player!.pos.x).toBeCloseTo(slot!.x, 2);
  expect(player!.pos.z).toBeCloseTo(slot!.z, 2);
  expect(Math.abs(player!.pos.y)).toBeLessThan(0.05);
  expect(player!.seat).toBeNull();
});

test('six players take six different slots, in order', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  for (let n = 1; n <= 6; n++) world.addPlayer(`p${n}`);
  const slots = slotPositions(world);
  const { players } = world.snapshot();
  expect(players).toHaveLength(6);
  players.forEach((player, index) => {
    expect(player.pos.x).toBeCloseTo(slots[index]!.x, 2);
    expect(player.pos.z).toBeCloseTo(slots[index]!.z, 2);
  });
});

test('a slot blocked by a wall is skipped; with every slot blocked the player goes to the first checkpoint', () => {
  const probe = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  const slots = slotPositions(probe);
  const wallAt = (slot: Vec3) => ({ center: add(slot, vec3(0, 1, 0)), halfExtents: vec3(0.5, 1, 0.5), rot: IDENTITY });

  const one = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, withBoxes(testGround, { walls: [wallAt(slots[0]!)] }));
  one.addPlayer('p1');
  expect(one.snapshot().players[0]!.pos.x).toBeCloseTo(slots[1]!.x, 2);
  expect(one.snapshot().players[0]!.pos.z).toBeCloseTo(slots[1]!.z, 2);

  const all = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, withBoxes(testGround, { walls: slots.map(wallAt) }));
  all.addPlayer('p1');
  const spawn = testGround.checkpoints[0]!.spawn.pos;
  expect(all.snapshot().players[0]!.pos).toEqual(spawn);
});

test('a wall box shaped like a ground box does not remove that ground from the spawn ray', () => {
  const ground = testGround.ground[0]!;
  const course = withBoxes(testGround, { walls: [{ center: ground.center, halfExtents: ground.halfExtents, rot: ground.rot }] });
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, course);
  world.addPlayer('p1');
  const [slot] = slotPositions(world);
  const [player] = world.snapshot().players;
  expect(player!.pos.x).toBeCloseTo(slot!.x, 2);
  expect(player!.pos.z).toBeCloseTo(slot!.z, 2);
});

test('a course passed in is used instead of the id\'s course', () => {
  const course = withBoxes(testGround, { walls: [] });
  expect(createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, course).course).toBe(course);
});

test('snapshot players are listed in join order with no seat or ground, and removePlayer removes the entry', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p2');
  world.addPlayer('p1');
  run(world, 30, new Map());
  const { players } = world.snapshot();
  expect(players.map((player) => player.playerId)).toEqual(['p2', 'p1']);
  expect(players.every((player) => player.seat === null && player.ground === null)).toBe(true);
  world.removePlayer('p2');
  expect(world.snapshot().players.map((player) => player.playerId)).toEqual(['p1']);
});

test('a player no input is sent for stands still, and ids unknown to the world are ignored', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p1');
  run(world, 30, new Map());
  const before = world.snapshot().players[0]!.pos;
  run(world, 30, new Map([['ghost', input({ moveY: 1 })]]));
  const after = world.snapshot().players[0]!.pos;
  expect(after.x).toBeCloseTo(before.x, 4);
  expect(after.z).toBeCloseTo(before.z, 4);
});

test('walking moves a player and copies their yaw into the snapshot', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p1');
  run(world, 30, new Map());
  const before = world.snapshot().players[0]!.pos;
  run(world, 60, walking('p1', { moveY: 1, yaw: 0.5 }));
  const after = world.snapshot().players[0]!;
  expect(after.yaw).toBe(0.5);
  expect(Math.hypot(after.pos.x - before.x, after.pos.z - before.z)).toBeGreaterThan(4);
  expect(world.snapshot().vehicle.pos.z).toBeCloseTo(0, 1);
});

function airborneEpisodes(world: World, ticks: number, at: (tick: number) => Partial<PlayerInput>): number {
  let episodes = 0;
  let up = false;
  for (let i = 0; i < ticks; i++) {
    world.step(walking('p1', at(i)));
    const high = world.snapshot().players[0]!.pos.y > 0.1;
    if (high && !up) episodes += 1;
    up = high;
  }
  return episodes;
}

test('a repeated jump input gives one jump; releasing and pressing again gives a second', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p1');
  run(world, 30, new Map());
  expect(airborneEpisodes(world, 10, () => ({ jump: true }))).toBe(1);
  run(world, 90, walking('p1', {}));
  expect(airborneEpisodes(world, 3 * TICK_RATE, () => ({ jump: true }))).toBe(1);
  run(world, 5, walking('p1', {}));
  expect(airborneEpisodes(world, 10, () => ({ jump: true }))).toBe(1);
});

test('holding jump from the first tick is one press', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p1');
  run(world, 30, new Map());
  expect(airborneEpisodes(world, 6 * TICK_RATE, () => ({ jump: true }))).toBe(1);
});

test('a player below the kill plane respawns at a slot after the delay, with one event', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p2');
  world.addPlayer('p1');
  run(world, 30, new Map());
  const slots = slotPositions(world);
  world.teleportPlayer('p1', vec3(30, world.course.killPlaneY - 1, -10));
  const events: ReturnType<World['step']> = [];
  const ticks: number[] = [];
  const advance = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
      const found = world.step(new Map());
      for (const event of found) {
        events.push(event);
        ticks.push(world.snapshot().tick);
      }
    }
  };
  advance(PLAYER_KILL_RESPAWN_DELAY - 0.1);
  expect(events).toEqual([]);
  expect(world.snapshot().players[1]!.pos.y).toBeLessThan(world.course.killPlaneY);
  advance(0.2);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ kind: 'respawn', playerId: 'p1', tick: ticks[0] });
  const player = world.snapshot().players[1]!;
  // p2 stands at slot 0, so p1 is placed at the next free slot.
  expect(player.pos.x).toBeCloseTo(slots[1]!.x, 2);
  expect(player.pos.z).toBeCloseTo(slots[1]!.z, 2);
  advance(2);
  expect(events).toHaveLength(1);
  expect(Math.abs(world.snapshot().players[1]!.pos.y)).toBeLessThan(0.05);
});

test('teleportPlayer clears the velocity and the respawn countdown', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p1');
  run(world, 30, new Map());
  world.teleportPlayer('p1', vec3(30, world.course.killPlaneY - 1, -10));
  run(world, 90, new Map());
  world.teleportPlayer('p1', vec3(30, 0.5, -10));
  const events: unknown[] = [];
  for (let i = 0; i < 5 * TICK_RATE; i++) events.push(...world.step(new Map()));
  expect(events).toEqual([]);
  const { pos } = world.snapshot().players[0]!;
  expect(pos.x).toBeCloseTo(30, 3);
  expect(pos.z).toBeCloseTo(-10, 3);
  expect(Math.abs(pos.y)).toBeLessThan(0.05);
});

test('a non-finite yaw, pitch or axis does no lasting harm to a player', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p1');
  run(world, 30, new Map());
  run(
    world,
    5,
    walking('p1', { yaw: Number.NaN, pitch: Number.POSITIVE_INFINITY, moveX: Number.NaN, moveY: Number.NEGATIVE_INFINITY }),
  );
  const player = world.snapshot().players[0]!;
  expect(Number.isFinite(player.pos.x + player.pos.y + player.pos.z + player.yaw)).toBe(true);
  const before = player.pos.z;
  run(world, 60, walking('p1', { moveY: 1 }));
  expect(world.snapshot().players[0]!.pos.z).toBeLessThan(before - 3);
});
