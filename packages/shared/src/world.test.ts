import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
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

// Has an added player press interact at their spawn slot; slot 0 is at the driver door.
function seat(world: World, id: string) {
  world.step(new Map([[id, input({ interact: true })]]));
  world.step(new Map());
}

const seatOf = (world: World, id: string) => world.snapshot().players.find((player) => player.playerId === id)!.seat;

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

test('the driver\'s input drives: moveY is throttle, moveX is steer, jump is brake; a passenger\'s does not', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('a');
  world.addPlayer('b');
  seat(world, 'a');
  seat(world, 'b');
  expect(seatOf(world, 'a')).toBe('driver');
  expect(seatOf(world, 'b')).toBe('seat1');
  run(world, 60, new Map());
  const inputs = new Map([
    ['b', input({ moveY: -1, moveX: -1 })],
    ['a', input({ moveY: 1, moveX: 0.3 })],
  ]);
  run(world, 180, inputs);
  const moving = world.snapshot().vehicle;
  expect(moving.throttle).toBe(1);
  expect(moving.steer).toBe(0.3);
  expect(moving.pos.z).toBeLessThan(-3);
  expect(moving.pos.x).toBeGreaterThan(0.5);

  const driven = world.debug().forwardSpeed;
  expect(driven).toBeGreaterThan(3);
  const coasted = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  coasted.addPlayer('a');
  coasted.addPlayer('b');
  seat(coasted, 'a');
  seat(coasted, 'b');
  run(coasted, 60, new Map());
  run(coasted, 180, inputs);
  run(coasted, 60, new Map());
  run(world, 60, new Map([['a', input({ jump: true })]]));
  // Same speed to start from; the brake must take clearly more of it than coasting does.
  expect(world.debug().forwardSpeed).toBeLessThan(0.5 * coasted.debug().forwardSpeed);
});

test('a passenger who joined first does not drive: only the driver seat does', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p0');
  world.addPlayer('p1');
  run(world, 30, new Map());
  const [slot0, slot1] = [world.snapshot().players[0]!.pos, world.snapshot().players[1]!.pos];
  world.teleportPlayer('p1', slot0);
  world.teleportPlayer('p0', slot1);
  world.step(new Map([['p0', input({ interact: true })]]));
  world.step(new Map([['p1', input({ interact: true })]]));
  expect(seatOf(world, 'p0')).toBe('seat1');
  expect(seatOf(world, 'p1')).toBe('driver');
  run(world, 120, new Map([['p0', input({ moveY: 1, moveX: 1 })]]));
  expect(world.snapshot().vehicle.throttle).toBe(0);
  expect(world.snapshot().vehicle.steer).toBe(0);
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
    world.addPlayer('a');
    world.addPlayer('b');
    seat(world, 'a');
    seat(world, 'b');
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
  world.addPlayer('a');
  seat(world, 'a');
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

// --- seats and driving ---

const players = (world: World) => world.snapshot().players;
const playerOf = (world: World, id: string) => players(world).find((player) => player.playerId === id)!;
const horizontal = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);

test('a player at slot 0 presses interact and sits in the driver seat; one at slot 1 takes seat1', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p1');
  world.addPlayer('p2');
  run(world, 30, new Map());
  world.step(new Map([['p1', input({ interact: true })]]));
  expect(seatOf(world, 'p1')).toBe('driver');
  expect(seatOf(world, 'p2')).toBeNull();
  world.step(new Map([['p2', input({ interact: true })]]));
  expect(seatOf(world, 'p1')).toBe('driver');
  expect(seatOf(world, 'p2')).toBe('seat1');
});

test('holding interact does one action only', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p1');
  run(world, 30, new Map());
  run(world, 120, new Map([['p1', input({ interact: true })]]));
  expect(seatOf(world, 'p1')).toBe('driver');
  run(world, 1, new Map());
  run(world, 1, new Map([['p1', input({ interact: true })]]));
  expect(seatOf(world, 'p1')).toBeNull();
});

test('V3: two players at one spot pressing on one tick: the earlier joiner gets the driver seat, the other the next nearest', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p1');
  world.addPlayer('p2');
  run(world, 30, new Map());
  world.teleportPlayer('p2', playerOf(world, 'p1').pos);
  world.step(
    new Map([
      ['p2', input({ interact: true })],
      ['p1', input({ interact: true })],
    ]),
  );
  expect(seatOf(world, 'p1')).toBe('driver');
  expect(seatOf(world, 'p2')).toBe('seat2');
});

test('the driver accelerates the vehicle, a passenger does not, and a seated player\'s walk and jump do nothing', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p1');
  world.addPlayer('p2');
  seat(world, 'p1');
  seat(world, 'p2');
  const before = playerOf(world, 'p2').pos;
  run(world, 120, new Map([['p2', input({ moveY: 1, moveX: 1, jump: true, drop: true })]]));
  expect(world.snapshot().vehicle.throttle).toBe(0);
  expect(Math.abs(world.debug().forwardSpeed)).toBeLessThan(0.01);
  expect(playerOf(world, 'p2').pos.y).toBeCloseTo(before.y, 2);
  expect(playerOf(world, 'p2').seat).toBe('seat1');
  run(world, 120, new Map([['p1', input({ moveY: 1 })]]));
  expect(world.debug().forwardSpeed).toBeGreaterThan(3);
});

test('when the driver leaves the seat the vehicle coasts', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p1');
  seat(world, 'p1');
  for (let i = 0; i < 600 && world.debug().forwardSpeed < 10; i++) world.step(new Map([['p1', input({ moveY: 1 })]]));
  world.step(new Map([['p1', input({ interact: true })]]));
  expect(seatOf(world, 'p1')).toBeNull();
  const atExit = world.debug().forwardSpeed;
  expect(atExit).toBeGreaterThan(9.5);
  run(world, 2 * TICK_RATE, new Map());
  expect(world.snapshot().vehicle.throttle).toBe(0);
  expect(world.debug().forwardSpeed).toBeGreaterThan(0.9 * atExit);
});

test('removing the driver frees the seat and the vehicle coasts', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p1');
  seat(world, 'p1');
  for (let i = 0; i < 600 && world.debug().forwardSpeed < 8; i++) world.step(new Map([['p1', input({ moveY: 1 })]]));
  world.removePlayer('p1');
  const atExit = world.debug().forwardSpeed;
  run(world, 2 * TICK_RATE, new Map());
  expect(world.snapshot().vehicle.throttle).toBe(0);
  expect(world.debug().forwardSpeed).toBeGreaterThan(0.9 * atExit);
  // The seat is free for the next player who reaches the driver door.
  world.addPlayer('p2');
  const body = world.snapshot().vehicle;
  const door = rotate(quatFromAxisAngle(AXIS_Y, yawOf(body.rot)), vec3(-0.88 - 0.5, 0, -0.7));
  world.teleportPlayer('p2', vec3(body.pos.x + door.x, 0.02, body.pos.z + door.z));
  world.step(new Map([['p2', input({ interact: true })]]));
  expect(seatOf(world, 'p2')).toBe('driver');
});

test('a seated player\'s position follows the vehicle while it is driven', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p1');
  seat(world, 'p1');
  run(world, 120, new Map([['p1', input({ moveY: 1 })]]));
  const { vehicle, players: all } = world.snapshot();
  expect(all[0]!.seat).toBe('driver');
  expect(horizontal(all[0]!.pos, vehicle.pos)).toBeLessThan(0.9);
  expect(all[0]!.pos.z).toBeLessThan(-3);
});

describe('leaving a seat', () => {
  const wallAt = (p: Vec3) => ({ center: vec3(p.x, 1, p.z), halfExtents: vec3(0.3, 1, 0.3), rot: IDENTITY });
  const OWN = vec3(-1.78, 0, -0.7);
  const OTHER = vec3(1.78, 0, -0.7);

  // The player stands by the driver door (clear of the walls the tests add), boards and leaves again.
  function boardAndLeave(walls: Vec3[]) {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, withBoxes(testGround, { walls: walls.map(wallAt) }));
    world.addPlayer('p1');
    run(world, 60, new Map());
    world.teleportPlayer('p1', vec3(-1.4, 0.02, 0.1));
    world.step(new Map([['p1', input({ interact: true })]]));
    expect(seatOf(world, 'p1')).toBe('driver');
    world.step(new Map());
    world.step(new Map([['p1', input({ interact: true })]]));
    return world;
  }

  test('interact while seated places the player at the own-side exit point, free of the seat', () => {
    const world = boardAndLeave([]);
    const player = playerOf(world, 'p1');
    expect(player.seat).toBeNull();
    expect(horizontal(player.pos, OWN)).toBeLessThan(0.05);
    expect(Math.abs(player.pos.y)).toBeLessThan(0.05);
  });

  test('with a wall over that point the other side is used', () => {
    const world = boardAndLeave([OWN]);
    expect(horizontal(playerOf(world, 'p1').pos, OTHER)).toBeLessThan(0.05);
  });

  test('with both sides blocked the player goes to a spawn slot', () => {
    const world = boardAndLeave([OWN, OTHER]);
    const player = playerOf(world, 'p1');
    expect(player.seat).toBeNull();
    // Slots 0 and 1 overlap the walls; slot 2 is the first free one.
    expect(horizontal(player.pos, vec3(-2.08, 0, 0.4))).toBeLessThan(0.05);
  });

  test('afterwards the seat is free', () => {
    const world = boardAndLeave([]);
    world.addPlayer('p2');
    world.teleportPlayer('p2', vec3(-1.4, 0.02, 0.1));
    world.step(new Map([['p2', input({ interact: true })]]));
    expect(seatOf(world, 'p2')).toBe('driver');
  });
});

describe('the roof', () => {
  const roofSpot = (world: World): Vec3 => {
    const { pos } = world.snapshot().vehicle;
    return vec3(pos.x, pos.y + world.vehicleConfig.halfExtents.y + 0.1, pos.z);
  };

  test('a player riding the roof of an accelerating Lodgy stays put on it; a jump lands back on it', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    world.addPlayer('p1');
    seat(world, 'p1');
    world.addPlayer('p2');
    run(world, 60, new Map());
    world.teleportPlayer('p2', roofSpot(world));
    run(world, 30, new Map());
    const start = playerOf(world, 'p2').ground!.localPos;
    run(world, 6 * TICK_RATE, new Map([['p1', input({ moveY: 1 })]]));
    const end = playerOf(world, 'p2').ground;
    expect(end).not.toBeNull();
    expect(horizontal(end!.localPos, start)).toBeLessThan(0.05);
    expect(Math.abs(end!.localPos.y - start.y)).toBeLessThan(0.05);
    expect(world.debug().forwardSpeed).toBeGreaterThan(10);
  });

  test('a jump from the roof at about 10 m/s lands on the roof again, near the take-off point', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    world.addPlayer('p1');
    seat(world, 'p1');
    world.addPlayer('p2');
    run(world, 60, new Map());
    world.teleportPlayer('p2', roofSpot(world));
    run(world, 30, new Map());
    for (let i = 0; i < 600 && world.debug().forwardSpeed < 10; i++) world.step(new Map([['p1', input({ moveY: 1 })]]));
    const takeoff = playerOf(world, 'p2').ground!.localPos;
    world.step(new Map([['p2', input({ jump: true })]]));
    expect(playerOf(world, 'p2').ground).toBeNull();
    let airborne = 1;
    while (playerOf(world, 'p2').ground === null && airborne < 200) {
      world.step(new Map());
      airborne += 1;
    }
    const landed = playerOf(world, 'p2').ground;
    expect(landed).not.toBeNull();
    expect(horizontal(landed!.localPos, takeoff)).toBeLessThan(1.5);
  });
});

test('N1: players beside, in the path of, and on the vehicle leave its motion unchanged', () => {
  const drive = (crowd: boolean) => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    world.addPlayer('p1');
    seat(world, 'p1');
    if (crowd) {
      for (const id of ['p2', 'p3', 'p4', 'p5', 'p6']) world.addPlayer(id);
      world.teleportPlayer('p5', vec3(0, 0.02, -2.25 - 4));
      world.teleportPlayer('p6', vec3(0, 0.95 + 0.55 + 0.1, 0));
    }
    run(world, 300, new Map([['p1', input({ moveY: 1 })]]));
    return world.snapshot().vehicle;
  };
  const alone = drive(false);
  const crowded = drive(true);
  const flat = (v: typeof alone) => [...Object.values(v.pos), ...Object.values(v.rot), ...Object.values(v.linvel)];
  flat(alone).forEach((value, index) => expect(flat(crowded)[index]).toBeCloseTo(value, 6));
  expect(alone.pos.z).toBeLessThan(-20);
});

test('determinism: the same inputs, boarding included, give the same snapshot', () => {
  const play = () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    world.addPlayer('p1');
    world.addPlayer('p2');
    run(world, 30, new Map());
    world.step(new Map([['p1', input({ interact: true })]]));
    world.step(new Map([['p2', input({ interact: true, yaw: 0.4 })]]));
    run(world, 240, new Map([['p1', input({ moveY: 1, moveX: 0.2 })]]));
    world.step(new Map([['p1', input({ interact: true })]]));
    run(world, 60, new Map([['p1', input({ moveY: 1, yaw: 1 })]]));
    return JSON.stringify(world.snapshot());
  };
  expect(play()).toBe(play());
});
