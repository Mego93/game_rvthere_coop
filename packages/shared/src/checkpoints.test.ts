import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { DROP_HEIGHT, ITEM_KINDS, PLAYER_CONTROLLER_OFFSET, PLAYER_RADIUS, TICK_DT, TICK_RATE } from './constants';
import type { Box } from './course';
import { boxesOverlap, enteredCheckpoint, insideBox, recordState } from './checkpoints';
import { testGround } from './courses/testGround';
import { IDENTITY, quatFromAxisAngle, AXIS_X, AXIS_Y, vec3 } from './math';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { reachedFinish, vehicleLost, elapsedAfter } from './rules';
import { withProps } from './testRig';
import { createWorld, type World } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rot = IDENTITY): Box => ({
  center: vec3(cx, cy, cz),
  halfExtents: vec3(hx, hy, hz),
  rot,
});
const quarterTurn = quatFromAxisAngle(AXIS_Y, Math.PI / 2);
const eighthTurn = quatFromAxisAngle(AXIS_Y, Math.PI / 4);

describe('insideBox', () => {
  test('axis-aligned', () => {
    const b = box(10, 2, -5, 2, 1, 3);
    expect(insideBox(vec3(10, 2, -5), b)).toBe(true);
    expect(insideBox(vec3(11.9, 2.9, -7.9), b)).toBe(true);
    expect(insideBox(vec3(12.1, 2, -5), b)).toBe(false);
    expect(insideBox(vec3(10, 3.1, -5), b)).toBe(false);
    expect(insideBox(vec3(10, 2, -8.1), b)).toBe(false);
  });

  test('rotated a quarter turn the long side lies along x', () => {
    const b = box(0, 0, 0, 1, 1, 5, quarterTurn);
    expect(insideBox(vec3(4, 0, 0), b)).toBe(true);
    expect(insideBox(vec3(0, 0, 4), b)).toBe(false);
  });

  test('rotated an eighth turn the corner is cut', () => {
    const b = box(0, 0, 0, 1, 1, 5, eighthTurn);
    expect(insideBox(vec3(2, 0, 2), b)).toBe(true);
    expect(insideBox(vec3(2, 0, -2), b)).toBe(false);
    expect(insideBox(vec3(0, 0, -4), b)).toBe(false);
  });
});

describe('enteredCheckpoint', () => {
  const course = testGround;
  test('none outside every trigger', () => {
    expect(enteredCheckpoint(course, vec3(30, 1, -20), -1)).toBeNull();
  });
  test('one', () => {
    expect(enteredCheckpoint(course, vec3(0, 1, -50), 0)).toBe(1);
  });
  test('skipping to a higher one', () => {
    expect(enteredCheckpoint(course, vec3(0, 1, -50), -1)).toBe(1);
  });
  test('never a lower or equal index', () => {
    expect(enteredCheckpoint(course, vec3(0, 1, 0), 0)).toBeNull();
    expect(enteredCheckpoint(course, vec3(0, 1, 0), 1)).toBeNull();
    expect(enteredCheckpoint(course, vec3(0, 1, -50), 1)).toBeNull();
  });
});

describe('boxesOverlap', () => {
  test('axis-aligned', () => {
    expect(boxesOverlap(box(0, 0, 0, 1, 1, 1), box(1.5, 0, 0, 1, 1, 1))).toBe(true);
    expect(boxesOverlap(box(0, 0, 0, 1, 1, 1), box(3, 0, 0, 1, 1, 1))).toBe(false);
  });
  test('touching is not overlapping', () => {
    expect(boxesOverlap(box(0, 0, 0, 1, 1, 1), box(2, 0, 0, 1, 1, 1))).toBe(false);
  });
  test('rotated', () => {
    // A box turned 45 degrees reaches 1.414 along x: overlaps at 2.3, not at 2.5.
    expect(boxesOverlap(box(0, 0, 0, 1, 1, 1), box(2.3, 0, 0, 1, 1, 1, eighthTurn))).toBe(true);
    expect(boxesOverlap(box(0, 0, 0, 1, 1, 1), box(2.5, 0, 0, 1, 1, 1, eighthTurn))).toBe(false);
  });
  test('separated only on a cross axis', () => {
    // Two thin sticks, each tipped 45 degrees about its own axis: no face axis of either box separates them, the edge-edge cross axis does.
    const a = box(0, 0, 0, 3, 0.2, 0.2, quatFromAxisAngle(AXIS_X, Math.PI / 4));
    const b = box(0, 1, 0, 0.2, 0.2, 3, quatFromAxisAngle(vec3(0, 0, 1), Math.PI / 4));
    expect(boxesOverlap(a, b)).toBe(false);
    expect(boxesOverlap(a, { ...b, center: vec3(0, 0.25, 0) })).toBe(true);
  });
});

describe('rules', () => {
  test('vehicleLost: health 0 or below the kill plane', () => {
    expect(vehicleLost(vec3(0, 1, 0), 0.5, -20)).toBe(false);
    expect(vehicleLost(vec3(0, 1, 0), 0, -20)).toBe(true);
    expect(vehicleLost(vec3(0, -20.1, 0), 0.5, -20)).toBe(true);
    expect(vehicleLost(vec3(0, -20, 0), 0.5, -20)).toBe(false);
  });
  test('reachedFinish: inside the box and not lost', () => {
    expect(reachedFinish(vec3(0, 2, -100), testGround.finish, false)).toBe(true);
    expect(reachedFinish(vec3(0, 2, -100), testGround.finish, true)).toBe(false);
    expect(reachedFinish(vec3(0, 2, -90), testGround.finish, false)).toBe(false);
  });
  test('elapsedAfter counts whole ticks', () => {
    expect(elapsedAfter(0)).toBe(0);
    expect(elapsedAfter(60)).toBeCloseTo(60 * TICK_DT, 12);
  });
});

describe('recordState', () => {
  test('a held prop is recorded at its course spawn, others where they are', () => {
    const placed = [
      { id: 'a', kind: 'crate', pose: { pos: vec3(1, 0, 2), rot: quarterTurn } },
      { id: 'b', kind: 'crate', pose: { pos: vec3(3, 0, 4), rot: IDENTITY } },
    ];
    const moved = (id: string, x: number) => ({ id, kind: 'crate', pos: vec3(x, 5, 5), rot: IDENTITY });
    const record = recordState({
      index: 1,
      fuel: 0.4,
      health: 0.9,
      props: [moved('a', 9), moved('b', 8)],
      heldIds: new Set(['a']),
      courseProps: placed,
      items: [{ id: 'item-1', kind: 'jerrycan', pos: vec3(1, 1, 1), rot: IDENTITY }],
      players: [{ id: 'p1', inventory: ['toolbox', null, null], health: 70 }],
    });
    expect(record.props.get('a')!.centre.x).toBe(1);
    expect(record.props.get('a')!.centre.y).toBeGreaterThan(0);
    expect(record.props.get('a')!.rot).toEqual(quarterTurn);
    expect(record.props.get('b')!.centre).toEqual(vec3(8, 5, 5));
    expect(record.items).toEqual([{ id: 'item-1', kind: 'jerrycan', centre: vec3(1, 1, 1), rot: IDENTITY }]);
    expect(record.players.get('p1')!.inventory).toEqual(['toolbox', null, null]);
    expect(record.players.get('p1')!.health).toBe(70);
    expect(record.fuel).toBe(0.4);
  });
});

const fresh = (): World => createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
const checkpointEvents = (events: { kind: string; pos?: unknown }[]) => events.filter((event) => event.kind === 'checkpoint');

describe('world: recording, timer and win', () => {
  test('(1) cp-0 is recorded at creation, with no event', () => {
    const world = fresh();
    expect(world.snapshot().checkpoint).toBe(0);
    expect(world.snapshot().checkpointCount).toBe(2);
    expect(checkpointEvents(world.step(new Map()))).toEqual([]);
    world.dispose();
  });

  test('(2) entering cp-1 records it once, with one event', () => {
    const world = fresh();
    const body = world.debugBody('vehicle')!;
    body.setTranslation({ x: 0, y: 0.95, z: -50 }, true);
    const events = world.step(new Map());
    expect(checkpointEvents(events)).toHaveLength(1);
    expect(checkpointEvents(events)[0]!.pos).toEqual(world.snapshot().vehicle.pos);
    expect(world.snapshot().checkpoint).toBe(1);
    body.setTranslation({ x: 0, y: 0.95, z: -30 }, true);
    world.step(new Map());
    body.setTranslation({ x: 0, y: 0.95, z: -50 }, true);
    const again = world.step(new Map());
    expect(checkpointEvents(again)).toEqual([]);
    expect(world.snapshot().checkpoint).toBe(1);
    world.dispose();
  });

  test('(3) elapsed equals ticks times TICK_DT', () => {
    const world = fresh();
    for (let i = 0; i < 123; i++) world.step(new Map());
    expect(Math.abs(world.snapshot().elapsed - 123 * TICK_DT)).toBeLessThan(1e-9);
    expect(world.status().elapsed).toBe(world.snapshot().elapsed);
    world.dispose();
  });

  test('(4) the vehicle centre entering the finish wins and stops the timer', () => {
    const world = fresh();
    expect(world.status().state).toBe('running');
    expect(world.snapshot().won).toBe(false);
    world.debugBody('vehicle')!.setTranslation({ x: 0, y: 1, z: -100 }, true);
    world.step(new Map());
    expect(world.status().state).toBe('won');
    expect(world.snapshot().won).toBe(true);
    const at = world.snapshot().elapsed;
    expect(at).toBeCloseTo(TICK_DT, 12);
    for (let i = 0; i < 30; i++) world.step(new Map());
    expect(world.snapshot().elapsed).toBe(at);
    expect(world.snapshot().tick).toBe(31);
    world.dispose();
  });

  test('(5) a respawn from the kill plane counts one', () => {
    const world = fresh();
    world.addPlayer('p1');
    world.step(new Map());
    world.teleportPlayer('p1', vec3(40, -25, 40));
    for (let i = 0; i < 4 * TICK_RATE; i++) world.step(new Map());
    expect(world.status().respawns).toBe(1);
    expect(world.snapshot().respawns).toBe(1);
    world.dispose();
  });

  test('a checkpoint recorded moves the fallback spawn', () => {
    const world = fresh();
    world.debugBody('vehicle')!.setTranslation({ x: 0, y: 0.95, z: -50 }, true);
    world.step(new Map());
    // Far from any ground, so no spawn slot is valid.
    world.debugBody('vehicle')!.setTranslation({ x: 500, y: 5, z: -50 }, true);
    world.addPlayer('p1');
    const pos = world.snapshot().players[0]!.pos;
    expect(pos.x).toBeCloseTo(0, 6);
    expect(pos.z).toBeCloseTo(-50, 6);
    world.dispose();
  });

  test('a lost vehicle does not win on the finish tick', () => {
    const world = fresh();
    world.debugVehicle().repair(-1);
    world.debugBody('vehicle')!.setTranslation({ x: 0, y: 1, z: -100 }, true);
    world.step(new Map());
    expect(world.status().state).toBe('running');
    world.dispose();
  });
});


const input = (fields: Partial<PlayerInput>): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });
const ZERO = vec3(0, 0, 0);
const CP1_SPAWN = vec3(0, 0.95, -50);
const lostEvents = (events: { kind: string }[]) => events.filter((event) => event.kind === 'vehicleLost');
const playerOf = (world: World, id: string) => world.snapshot().players.find((player) => player.playerId === id)!;
const propOf = (world: World, id: string) => world.snapshot().props.find((prop) => prop.id === id)!;
const settle = (world: World, ticks = 10) => {
  for (let i = 0; i < ticks; i++) world.step(new Map());
};

// Teleports the vehicle into cp-1's trigger so it is recorded with the world's state at that tick.
function recordCp1(world: World, at = CP1_SPAWN) {
  const body = world.debugBody('vehicle')!;
  body.setTranslation(at, true);
  body.setLinvel(ZERO, true);
  world.step(new Map());
  expect(world.snapshot().checkpoint).toBe(1);
}

// Has an added player press interact at their spawn slot; slot 0 is at the driver door.
function seat(world: World, id: string) {
  world.step(new Map([[id, input({ interact: true })]]));
  world.step(new Map());
}

function tap(world: World, id: string, fields: Partial<PlayerInput>) {
  world.step(new Map([[id, input(fields)]]));
  world.step(new Map([[id, input({ slot: fields.slot ?? 0 })]]));
}

// A player 0.8 m south of the point, facing north (-Z).
function standAt(world: World, id: string, x: number, z: number) {
  world.teleportPlayer(id, vec3(x, PLAYER_CONTROLLER_OFFSET, z + 0.8));
  settle(world);
}

function expectAtSpawn(world: World) {
  const { vehicle } = world.snapshot();
  expect(vehicle.pos.x).toBeCloseTo(CP1_SPAWN.x, 6);
  expect(vehicle.pos.y).toBeCloseTo(CP1_SPAWN.y, 6);
  expect(vehicle.pos.z).toBeCloseTo(CP1_SPAWN.z, 6);
  expect(vehicle.rot).toEqual(IDENTITY);
  expect(Math.hypot(vehicle.linvel.x, vehicle.linvel.y, vehicle.linvel.z)).toBeLessThan(1e-9);
  const angular = world.debugBody('vehicle')!.angvel();
  expect(Math.hypot(angular.x, angular.y, angular.z)).toBeLessThan(1e-9);
}

describe('world: restart', () => {
  test('(1) kill plane: the vehicle restarts at the last checkpoint at rest, health unchanged, one vehicleLost event', () => {
    const world = fresh();
    recordCp1(world);
    const body = world.debugBody('vehicle')!;
    body.setTranslation({ x: 20, y: -25, z: -30 }, true);
    body.setLinvel({ x: 3, y: -5, z: 1 }, true);
    body.setAngvel({ x: 1, y: 2, z: 3 }, true);
    expect(world.status().restarts).toBe(0);
    const events = world.step(new Map());
    expect(lostEvents(events)).toEqual([{ kind: 'vehicleLost', tick: world.snapshot().tick }]);
    expect(world.status().restarts).toBe(1);
    expect(world.snapshot().restarts).toBe(1);
    expect(world.snapshot().checkpoint).toBe(1);
    expectAtSpawn(world);
    const health = world.snapshot().vehicle.health;
    settle(world, 10);
    expect(world.snapshot().vehicle.health).toBe(health);
    expect(world.status().restarts).toBe(1);
    const { linvel } = world.snapshot().vehicle;
    expect(Math.hypot(linvel.x, linvel.y, linvel.z)).toBeLessThan(0.1);
    world.dispose();
  });

  test('(1) a vehicle lost below cp-0 only restarts at cp-0', () => {
    const world = fresh();
    world.debugBody('vehicle')!.setTranslation({ x: 20, y: -25, z: -30 }, true);
    world.step(new Map());
    const { pos } = world.snapshot().vehicle;
    expect(pos.x).toBeCloseTo(0, 6);
    expect(pos.z).toBeCloseTo(0, 6);
    expect(world.snapshot().restarts).toBe(1);
    world.dispose();
  });

  test.each([
    [0.3, 0.5],
    [0.8, 0.8],
  ])('(2) health 0: fuel recorded at %f is restored to %f', (recorded, restored) => {
    const world = fresh();
    world.debugVehicle().addFuel(recorded - 1);
    recordCp1(world);
    world.debugVehicle().addFuel(1);
    world.debugVehicle().repair(-1);
    expect(world.snapshot().vehicle.health).toBe(0);
    const events = world.step(new Map());
    expect(lostEvents(events)).toHaveLength(1);
    expect(world.snapshot().restarts).toBe(1);
    expectAtSpawn(world);
    expect(world.snapshot().vehicle.fuel).toBeCloseTo(restored, 9);
    world.dispose();
  });

  test.each([
    [0.3, 0.5],
    [0.8, 0.8],
  ])('(2) health recorded at %f is restored to %f', (recorded, restored) => {
    const world = fresh();
    world.debugVehicle().repair(recorded - 1);
    recordCp1(world);
    expect(world.snapshot().vehicle.health).toBeCloseTo(recorded, 6);
    world.debugVehicle().repair(-1);
    world.step(new Map());
    expect(world.snapshot().restarts).toBe(1);
    expect(world.snapshot().vehicle.health).toBeCloseTo(restored, 6);
    world.dispose();
  });

  test('(3) restartCheckpoint is pending until the next step, which returns the event', () => {
    const world = fresh();
    recordCp1(world);
    world.debugBody('vehicle')!.setTranslation({ x: 30, y: 0.95, z: -20 }, true);
    world.restartCheckpoint();
    expect(world.status().restarts).toBe(0);
    expect(world.snapshot().vehicle.pos.x).toBeCloseTo(30, 6);
    const events = world.step(new Map());
    expect(lostEvents(events)).toHaveLength(1);
    expect(world.status().restarts).toBe(1);
    expectAtSpawn(world);
    expect(lostEvents(world.step(new Map()))).toEqual([]);
    world.dispose();
  });

  test('(3) restartCheckpoint does nothing once the run is won', () => {
    const world = fresh();
    world.debugBody('vehicle')!.setTranslation({ x: 0, y: 1, z: -100 }, true);
    world.step(new Map());
    expect(world.status().state).toBe('won');
    world.restartCheckpoint();
    const events = world.step(new Map());
    expect(lostEvents(events)).toEqual([]);
    expect(world.status().restarts).toBe(0);
    expect(world.snapshot().vehicle.pos.z).toBeCloseTo(-100, 0);
    world.dispose();
  });

  test('(3) a manual restart on the tick the vehicle sits in the finish does not win', () => {
    const world = fresh();
    recordCp1(world);
    world.debugBody('vehicle')!.setTranslation({ x: 0, y: 1, z: -100 }, true);
    world.restartCheckpoint();
    world.step(new Map());
    expect(world.status().state).toBe('running');
    expect(world.status().restarts).toBe(1);
    world.dispose();
  });
});

describe('world: restart restores props', () => {
  const BESIDE = vec3(12, 0.02, 8);
  const AT_CRATE = { yaw: Math.PI / 2, pitch: -Math.atan2(1.0, 1.7) };
  const press = (world: World) => {
    world.step(new Map([['p1', input({ ...AT_CRATE, interact: true })]]));
    world.step(new Map([['p1', input(AT_CRATE)]]));
  };
  const withCrate = () => createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, withProps(testGround, [{ id: 'crate-9', kind: 'crate', pose: { pos: vec3(8, 0, -40), rot: IDENTITY } }]));
  const beside = (world: World) => {
    world.addPlayer('p1');
    settle(world, 30);
    world.teleportPlayer('p1', BESIDE);
    settle(world, 30);
  };
  const linvelOf = (world: World, id: string) => {
    const v = world.debugBody(id)!.linvel();
    return Math.hypot(v.x, v.y, v.z);
  };

  test('(4) a crate moved after the record returns to its recorded pose at rest, a heavy one stays locked', () => {
    const world = fresh();
    settle(world, 30);
    recordCp1(world);
    const before = ['crate-1', 'crate-2', 'barrier-1'].map((id) => propOf(world, id));
    for (const id of ['crate-1', 'barrier-1']) {
      world.debugBody(id)!.setTranslation({ x: 3, y: 5, z: 3 }, true);
      world.debugBody(id)!.setLinvel({ x: 2, y: 0, z: 1 }, true);
    }
    world.restartCheckpoint();
    world.step(new Map());
    for (const prop of before) {
      const now = propOf(world, prop.id);
      expect(now.pos.x).toBeCloseTo(prop.pos.x, 6);
      expect(now.pos.y).toBeCloseTo(prop.pos.y, 6);
      expect(now.pos.z).toBeCloseTo(prop.pos.z, 6);
      expect(now.rot.w).toBeCloseTo(prop.rot.w, 6);
      expect(linvelOf(world, prop.id)).toBeLessThan(1e-9);
    }
    world.dispose();
  });

  test('(4) a heavy prop is locked at the restart tick, not only once the next tick re-locks it', () => {
    const world = fresh();
    settle(world, 30);
    recordCp1(world);
    const barrier = world.debugBody('barrier-1')!;
    const at = propOf(world, 'barrier-1').pos;
    // Unlocked at the physics level, as after a taut cable or a push by enough players.
    barrier.setEnabledTranslations(true, true, true, true);
    world.restartCheckpoint();
    world.step(new Map());
    barrier.applyImpulse({ x: 50, y: 0, z: 0 }, true);
    world.step(new Map());
    expect(propOf(world, 'barrier-1').pos.x).toBeCloseTo(at.x, 3);
    world.dispose();
  });

  test('(4) a crate on the vehicle spawn box at the record returns to its own spawn', () => {
    const world = withCrate();
    settle(world, 30);
    world.debugBody('crate-9')!.setTranslation({ x: 0, y: 0.3, z: -50 }, true);
    recordCp1(world, vec3(5, 0.95, -50));
    expect(propOf(world, 'crate-9').pos.x).toBeCloseTo(0, 1);
    world.restartCheckpoint();
    world.step(new Map());
    const crate = propOf(world, 'crate-9');
    expect(crate.pos.x).toBeCloseTo(8, 6);
    expect(crate.pos.y).toBeCloseTo(0.3, 6);
    expect(crate.pos.z).toBeCloseTo(-40, 6);
    expect(linvelOf(world, 'crate-9')).toBeLessThan(1e-9);
    world.dispose();
  });

  test('(4) a crate held after the record is released and goes back to its recorded pose', () => {
    const world = fresh();
    beside(world);
    recordCp1(world);
    const recorded = propOf(world, 'crate-1');
    press(world);
    expect(playerOf(world, 'p1').hands).toBe('crate-1');
    world.restartCheckpoint();
    world.step(new Map());
    expect(playerOf(world, 'p1').hands).toBeNull();
    const crate = propOf(world, 'crate-1');
    expect(crate.pos.x).toBeCloseTo(recorded.pos.x, 6);
    expect(crate.pos.z).toBeCloseTo(recorded.pos.z, 6);
    settle(world, 30);
    expect(propOf(world, 'crate-1').pos.x).toBeCloseTo(recorded.pos.x, 2);
    world.dispose();
  });

  test('(4) a crate held at the record is restored to its course spawn', () => {
    const world = fresh();
    beside(world);
    press(world);
    expect(playerOf(world, 'p1').hands).toBe('crate-1');
    recordCp1(world);
    world.restartCheckpoint();
    world.step(new Map());
    const crate = propOf(world, 'crate-1');
    expect(crate.pos.x).toBeCloseTo(10, 6);
    expect(crate.pos.y).toBeCloseTo(0.3, 6);
    expect(crate.pos.z).toBeCloseTo(8, 6);
    expect(playerOf(world, 'p1').hands).toBeNull();
    world.dispose();
  });
});

describe('world: restart restores items', () => {
  test('(5) an item taken after the record is back, one taken before stays in the inventory, one dropped after is gone', () => {
    const world = fresh();
    world.addPlayer('p1');
    settle(world, 30);
    standAt(world, 'p1', -4, 14);
    tap(world, 'p1', { interact: true });
    expect(playerOf(world, 'p1').inventory).toEqual(['jerrycan', null, null]);
    recordCp1(world);
    const recorded = world.snapshot().props.filter((prop) => Object.hasOwn(ITEM_KINDS, prop.kind));
    expect(recorded.map((item) => item.id)).toEqual(['jerrycan-2', 'toolbox-1', 'healthKit-1']);
    standAt(world, 'p1', -3, 14);
    tap(world, 'p1', { interact: true });
    tap(world, 'p1', { drop: true, slot: 1 });
    standAt(world, 'p1', -2, 14);
    tap(world, 'p1', { interact: true, slot: 1 });
    expect(playerOf(world, 'p1').inventory).toEqual(['jerrycan', 'toolbox', null]);
    const dropped = world.snapshot().props.filter((prop) => Object.hasOwn(ITEM_KINDS, prop.kind));
    expect(dropped.map((item) => item.id)).toEqual(['healthKit-1', 'item-1']);
    world.restartCheckpoint();
    world.step(new Map());
    expect(playerOf(world, 'p1').inventory).toEqual(['jerrycan', null, null]);
    const items = world.snapshot().props.filter((prop) => Object.hasOwn(ITEM_KINDS, prop.kind));
    expect(items.map((item) => [item.id, item.kind])).toEqual([
      ['jerrycan-2', 'jerrycan'],
      ['toolbox-1', 'toolbox'],
      ['healthKit-1', 'healthKit'],
    ]);
    for (const item of items) {
      const was = recorded.find((candidate) => candidate.id === item.id)!;
      expect(item.pos).toEqual(was.pos);
      expect(item.rot).toEqual(was.rot);
    }
    world.dispose();
  });

  test('(5) the item counter is not rewound: the next drop is item-2', () => {
    const world = fresh();
    world.addPlayer('p1');
    settle(world, 30);
    recordCp1(world);
    standAt(world, 'p1', -4, 14);
    tap(world, 'p1', { interact: true });
    tap(world, 'p1', { drop: true });
    world.restartCheckpoint();
    world.step(new Map());
    standAt(world, 'p1', -3, 14);
    tap(world, 'p1', { interact: true });
    tap(world, 'p1', { drop: true });
    expect(world.snapshot().props.some((prop) => prop.id === 'item-2')).toBe(true);
    expect(world.snapshot().props.some((prop) => prop.id === 'item-1')).toBe(false);
    world.dispose();
  });
});

describe('world: restart places the players', () => {
  const clearOfVehicle = (world: World, id: string) => {
    const { pos } = playerOf(world, id);
    const vehicle = world.snapshot().vehicle.pos;
    const half = world.vehicleConfig.halfExtents;
    const outside = Math.abs(pos.x - vehicle.x) > half.x + PLAYER_RADIUS || Math.abs(pos.z - vehicle.z) > half.z + PLAYER_RADIUS;
    expect(outside, id).toBe(true);
  };

  test('(6) seated players are unseated into spawn slots with empty hands, the hook is stowed and holds are cleared', () => {
    const world = fresh();
    world.addPlayer('p1');
    world.addPlayer('p2');
    settle(world, 30);
    seat(world, 'p1');
    seat(world, 'p2');
    expect(playerOf(world, 'p1').seat).toBe('driver');
    expect(playerOf(world, 'p2').seat).not.toBeNull();
    recordCp1(world);
    world.debugWinch().take('p1');
    expect(world.debugWinch().state().state).toBe('held');
    world.debugWinch().attach('anchor-3');
    expect(world.debugWinch().state().state).toBe('attached');
    world.restartCheckpoint();
    world.step(new Map());
    expect(world.debugWinch().state().state).toBe('stowed');
    expect(world.debugWinch().state().holderId).toBeNull();
    const [a, b] = ['p1', 'p2'].map((id) => playerOf(world, id));
    for (const player of [a!, b!]) {
      expect(player.seat).toBeNull();
      expect(player.hands).toBeNull();
      expect(player.hold).toBeNull();
      expect(player.grounded).toBe(true);
      expect(Math.hypot(player.pos.x - CP1_SPAWN.x, player.pos.z - CP1_SPAWN.z)).toBeLessThan(4);
      clearOfVehicle(world, player.playerId);
    }
    expect(Math.hypot(a!.pos.x - b!.pos.x, a!.pos.z - b!.pos.z)).toBeGreaterThanOrEqual(2 * PLAYER_RADIUS);
    world.dispose();
  });

  test('(6) a held hook in the hands is stowed', () => {
    const world = fresh();
    world.addPlayer('p1');
    settle(world, 30);
    recordCp1(world);
    world.debugWinch().take('p1');
    world.restartCheckpoint();
    world.step(new Map());
    expect(world.debugWinch().state().state).toBe('stowed');
    expect(playerOf(world, 'p1').hands).toBeNull();
    world.dispose();
  });

  test('(6) a late joiner has an empty inventory; a recorded player gets the recorded inventory', () => {
    const world = fresh();
    world.addPlayer('p1');
    settle(world, 30);
    standAt(world, 'p1', -4, 14);
    tap(world, 'p1', { interact: true });
    recordCp1(world);
    world.addPlayer('p2');
    standAt(world, 'p2', -3, 14);
    tap(world, 'p2', { interact: true });
    expect(playerOf(world, 'p2').inventory).toEqual(['jerrycan', null, null]);
    tap(world, 'p1', { interact: true, slot: 1 });
    world.restartCheckpoint();
    world.step(new Map());
    expect(playerOf(world, 'p1').inventory).toEqual(['jerrycan', null, null]);
    expect(playerOf(world, 'p2').inventory).toEqual([null, null, null]);
    world.dispose();
  });

  test('(6) the recorded jerrycan of a departed player appears at the checkpoint spawn pose', () => {
    const world = fresh();
    world.addPlayer('p1');
    world.addPlayer('p2');
    settle(world, 30);
    standAt(world, 'p1', -4, 14);
    tap(world, 'p1', { interact: true });
    standAt(world, 'p1', -3, 14);
    tap(world, 'p1', { interact: true });
    expect(playerOf(world, 'p1').inventory).toEqual(['jerrycan', 'jerrycan', null]);
    recordCp1(world);
    world.removePlayer('p1');
    expect(world.snapshot().props.filter((prop) => prop.id.startsWith('item-'))).toHaveLength(2);
    world.restartCheckpoint();
    world.step(new Map());
    const items = world.snapshot().props.filter((prop) => prop.id.startsWith('item-'));
    expect(items).toHaveLength(2);
    const half = ITEM_KINDS.jerrycan.halfExtents.y;
    items.forEach((item, index) => {
      expect(item.kind).toBe('jerrycan');
      expect(item.pos.x).toBeCloseTo(0, 6);
      expect(item.pos.z).toBeCloseTo(-50, 6);
      expect(item.pos.y).toBeCloseTo((index + 1) * DROP_HEIGHT + half, 6);
    });
    world.dispose();
  });

  test('(6) no player capsule overlaps the vehicle or a restored crate', () => {
    // A crate on the first spawn slot beside cp-1 (outside the vehicle's box, so it stays there).
    const slot = fresh().vehicleConfig.spawnSlots[0]!;
    const course = withProps(testGround, [{ id: 'crate-9', kind: 'crate', pose: { pos: vec3(CP1_SPAWN.x + slot.x, 0, CP1_SPAWN.z + slot.z), rot: IDENTITY } }]);
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, course);
    for (const id of ['p1', 'p2', 'p3']) world.addPlayer(id);
    settle(world, 30);
    recordCp1(world);
    // Both bodies are elsewhere when the restart begins, so only fresh queries see them at the checkpoint.
    world.debugBody('crate-9')!.setTranslation({ x: 30, y: 0.3, z: -20 }, true);
    world.debugBody('vehicle')!.setTranslation({ x: 30, y: 0.95, z: -10 }, true);
    world.restartCheckpoint();
    world.step(new Map());
    const crate = propOf(world, 'crate-9');
    expect(crate.pos.x).toBeCloseTo(CP1_SPAWN.x + slot.x, 4);
    for (const id of ['p1', 'p2', 'p3']) {
      const { pos } = playerOf(world, id);
      clearOfVehicle(world, id);
      expect(Math.max(Math.abs(pos.x - crate.pos.x), Math.abs(pos.z - crate.pos.z)), id).toBeGreaterThan(0.3 + PLAYER_RADIUS - 1e-6);
    }
    world.dispose();
  });

  test('(6) a player mid kill-plane respawn is placed in a slot and no respawn is counted', () => {
    const world = fresh();
    world.addPlayer('p1');
    settle(world, 30);
    recordCp1(world);
    world.teleportPlayer('p1', vec3(40, -25, 40));
    world.step(new Map());
    expect(world.status().respawns).toBe(0);
    world.restartCheckpoint();
    world.step(new Map());
    const player = playerOf(world, 'p1');
    expect(Math.hypot(player.pos.x - CP1_SPAWN.x, player.pos.z - CP1_SPAWN.z)).toBeLessThan(4);
    for (let i = 0; i < 4 * TICK_RATE; i++) world.step(new Map());
    expect(world.status().respawns).toBe(0);
    expect(world.status().restarts).toBe(1);
    world.dispose();
  });
});

describe('world: restart and the tick order', () => {
  test('(7) a finish below the kill plane: the vehicle entering it is lost, not won', () => {
    const course = { ...testGround, finish: { center: vec3(0, -30, -100), halfExtents: vec3(10, 5, 2), rot: IDENTITY } };
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, course);
    world.debugBody('vehicle')!.setTranslation({ x: 0, y: -30, z: -100 }, true);
    const events = world.step(new Map());
    expect(lostEvents(events)).toHaveLength(1);
    expect(world.status().state).toBe('running');
    expect(world.status().restarts).toBe(1);
    world.dispose();
  });

  test('(7) health 0 on the tick the vehicle enters the finish: lost, not won', () => {
    const world = fresh();
    recordCp1(world);
    world.debugVehicle().repair(-1);
    world.debugBody('vehicle')!.setTranslation({ x: 0, y: 1, z: -100 }, true);
    const events = world.step(new Map());
    expect(lostEvents(events)).toHaveLength(1);
    expect(world.status().state).toBe('running');
    expect(world.snapshot().won).toBe(false);
    expectAtSpawn(world);
    world.dispose();
  });

  test('(7) entering a trigger on the tick health reaches 0 records it, then restarts there at the floor', () => {
    const world = fresh();
    world.debugVehicle().repair(-1);
    world.debugBody('vehicle')!.setTranslation({ x: 0, y: 0.95, z: -50 }, true);
    const events = world.step(new Map());
    expect(world.snapshot().checkpoint).toBe(1);
    expect(events.map((event) => event.kind)).toEqual(['checkpoint', 'vehicleLost']);
    expect(world.snapshot().vehicle.health).toBe(0.5);
    world.dispose();
  });

  test('(8) determinism: two worlds with the same inputs through restarts give equal snapshots', () => {
    const play = () => {
      const world = fresh();
      world.addPlayer('p1');
      world.addPlayer('p2');
      settle(world, 30);
      seat(world, 'p1');
      seat(world, 'p2');
      for (let i = 0; i < 200; i++) world.step(new Map([['p1', input({ moveY: 1, moveX: 0.1 })]]));
      recordCp1(world, vec3(0, 0.95, -50));
      world.debugBody('crate-1')!.setTranslation({ x: 3, y: 5, z: 3 }, true);
      for (let i = 0; i < 40; i++) world.step(new Map([['p1', input({ moveY: 1 })]]));
      world.restartCheckpoint();
      for (let i = 0; i < 60; i++) world.step(new Map([['p1', input({ interact: i === 5 })]]));
      world.debugBody('vehicle')!.setTranslation({ x: 0, y: -30, z: -60 }, true);
      for (let i = 0; i < 60; i++) world.step(new Map());
      return JSON.stringify(world.snapshot());
    };
    const first = play();
    expect(first).toBe(play());
    expect(JSON.parse(first).restarts).toBe(2);
  });
});

describe('world: restart drops transient state', () => {
  test('a push intent queued on the restart tick does not move the restored vehicle', () => {
    const world = fresh();
    world.addPlayer('p1');
    settle(world, 60);
    const rear = world.snapshot().vehicle.pos;
    world.teleportPlayer('p1', vec3(rear.x, 0.1, rear.z + world.vehicleConfig.halfExtents.z + 0.5));
    const walk = new Map([['p1', input({ moveY: 1 })]]);
    for (let i = 0; i < 120; i++) world.step(walk);
    expect(world.snapshot().vehicle.pos.z).toBeLessThan(rear.z - 0.3);
    world.restartCheckpoint();
    world.step(walk);
    expect(world.status().restarts).toBe(1);
    world.step(new Map());
    const { linvel } = world.snapshot().vehicle;
    expect(Math.hypot(linvel.x, linvel.z)).toBeLessThan(1e-3);
    world.dispose();
  });

  test('the cable tension is 0 after a restart while the winch was taut', () => {
    const tenAhead = {
      ...testGround,
      checkpoints: [{ ...testGround.checkpoints[0]!, spawn: { pos: vec3(-40, 0, -56.7), rot: IDENTITY } }, ...testGround.checkpoints.slice(1)],
    };
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, tenAhead);
    world.addPlayer('p1');
    settle(world, 30);
    seat(world, 'p1');
    world.debugWinch().take('p1');
    expect(world.debugWinch().attach('anchor-1')).toBe(true);
    const reel = new Map([['p1', input({ reel: 1, jump: true })]]);
    for (let i = 0; i < 120 && world.debug().cableTension === 0; i++) world.step(reel);
    expect(world.debug().cableTension).toBeGreaterThan(0);
    world.restartCheckpoint();
    world.step(reel);
    expect(world.status().restarts).toBe(1);
    expect(world.debug().cableTension).toBe(0);
    world.dispose();
  });
});
