import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { ITEM_DROP_AHEAD, ITEM_DROP_BEHIND, ITEM_DROP_EDGE_OFFSET, ITEM_KINDS, PLAYER_CONTROLLER_OFFSET, ROAD_WIDTH, TICK_RATE } from './constants';
import { buildCourse } from './courses/build';
import { groundHeightAt } from './groundProbe';
import type { ItemDropEvent } from './itemDrops';
import { vec3 } from './math';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { VEHICLES } from './vehicles';
import { createWorld, type World } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

// A straight road going -Z; "right" is +X.
const straight = buildCourse({ id: 'straight', segments: [{ type: 'road', length: 300 }, { type: 'road', length: 300 }], targetTime: 100, ambient: true });
const hilly = buildCourse({
  id: 'hilly',
  segments: [{ type: 'road', length: 100 }, { type: 'road', length: 100, slope: 14 }, { type: 'road', length: 100, slope: -14 }, { type: 'road', length: 200 }],
  targetTime: 100,
});
const pitted = buildCourse({ id: 'pitted', segments: [{ type: 'road', length: 100 }, { type: 'pit', depth: 3, gradient: 10, floor: 10, anchors: 0 }, { type: 'road', length: 200 }], targetTime: 100 });
const HALF = ROAD_WIDTH / 2;
const RIDE = VEHICLES.lodgy.rideHeight;
const LATERAL = HALF + ITEM_DROP_EDGE_OFFSET;

const event = (id: number, along: number, kind: ItemDropEvent['kind'] = 'jerrycan', side: -1 | 1 = 1): ItemDropEvent => ({ id, along, side, lateral: side * LATERAL, kind });
const make = (plan: ItemDropEvent[] | undefined, course = straight, itemDrops = true) =>
  createWorld(RAPIER, { courseId: course.id, vehicleId: 'lodgy', itemDrops, ...(plan ? { itemPlan: plan } : {}) }, course);
const run = (world: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) world.step(new Map());
};
const dropsOf = (world: World) => world.snapshot().props.filter((prop) => /^item-\d+$/.test(prop.id));
const input = (fields: Partial<PlayerInput>): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });

function place(world: World, x: number, y: number, z: number) {
  const body = world.debugBody('vehicle')!;
  body.setTranslation({ x, y, z }, true);
  body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
}
const placeAlong = (world: World, along: number) => place(world, 0, RIDE, -along);

describe('T3: a drop in the world', () => {
  test('appears 150 m ahead on the shoulder, on the ground, as an item-N prop, and not before', () => {
    const world = make([event(0, 200)]);
    placeAlong(world, 200 - ITEM_DROP_AHEAD - 10);
    run(world, 3);
    expect(dropsOf(world)).toEqual([]);
    placeAlong(world, 200 - ITEM_DROP_AHEAD + 10);
    run(world, 3);
    const [drop, ...rest] = dropsOf(world);
    expect(rest).toEqual([]);
    expect(drop!.id).toBe('item-1');
    expect(drop!.kind).toBe('jerrycan');
    expect(drop!.pos.x).toBeCloseTo(LATERAL, 3);
    expect(drop!.pos.z).toBeCloseTo(-200, 3);
    const half = ITEM_KINDS.jerrycan.halfExtents.y;
    expect(drop!.pos.y).toBeGreaterThan(half - 0.02);
    expect(drop!.pos.y).toBeLessThan(half + 0.1);
    expect(Math.abs(drop!.pos.x)).toBeGreaterThan(HALF);
  });

  test('an item on the left side lies at minus lateral', () => {
    const world = make([event(0, 200, 'toolbox', -1)]);
    placeAlong(world, 100);
    run(world, 3);
    expect(dropsOf(world)[0]!.pos.x).toBeCloseTo(-LATERAL, 3);
  });

  test('a player can pick it up like any item', () => {
    const world = make([event(0, 100)]);
    world.addPlayer('p1');
    run(world, 30);
    expect(dropsOf(world)).toHaveLength(1);
    world.teleportPlayer('p1', vec3(LATERAL, PLAYER_CONTROLLER_OFFSET, -100 + 0.8));
    run(world, 10);
    world.step(new Map([['p1', input({ interact: true })]]));
    world.step(new Map());
    expect(world.snapshot().players[0]!.inventory[0]).toBe('jerrycan');
    expect(dropsOf(world)).toEqual([]);
    run(world, 30);
    expect(dropsOf(world)).toEqual([]);
  });

  test('an unclaimed drop is taken once the vehicle is 100 m past it', () => {
    const world = make([event(0, 100)]);
    run(world, 3);
    expect(dropsOf(world)).toHaveLength(1);
    placeAlong(world, 100 + ITEM_DROP_BEHIND + 10);
    run(world, 2);
    expect(dropsOf(world)).toEqual([]);
  });

  test('a drop beyond a hill crest lands on the ground there, not at the vehicle height', () => {
    const world = make([event(0, 170)], hilly);
    placeAlong(world, 60);
    run(world, 3);
    const [drop] = dropsOf(world);
    expect(drop).toBeDefined();
    const ground = groundHeightAt(hilly.ground, drop!.pos.x, drop!.pos.z)!;
    expect(ground).toBeGreaterThan(10);
    expect(drop!.pos.y).toBeGreaterThan(ground);
    expect(drop!.pos.y).toBeLessThan(ground + 0.5);
  });

  test('a drop in a pit lands on its floor', () => {
    const world = make([event(0, 130)], pitted);
    run(world, 3);
    const [drop] = dropsOf(world);
    expect(drop).toBeDefined();
    const ground = groundHeightAt(pitted.ground, drop!.pos.x, drop!.pos.z)!;
    expect(ground).toBeLessThan(-1.5);
    expect(drop!.pos.y).toBeGreaterThan(ground);
    expect(drop!.pos.y).toBeLessThan(ground + 0.5);
  });

  test('where the ray finds no ground the drop waits, then appears once the vehicle is back near the ground', () => {
    const world = make([event(0, 100)]);
    place(world, 0, 1000, -8);
    run(world, 5);
    expect(dropsOf(world)).toEqual([]);
    run(world, 5);
    expect(dropsOf(world)).toEqual([]);
    placeAlong(world, 8);
    run(world, 3);
    expect(dropsOf(world)).toHaveLength(1);
  });

  test('a plan not sorted by along is refused', () => {
    expect(() => make([event(0, 200), event(1, 100)])).toThrow(/sorted/);
  });

  test('two worlds with the same plan give equal snapshots for 20 s', () => {
    const plan = [event(0, 100), event(1, 160, 'healthKit', -1)];
    const a = make(plan);
    const b = make(plan);
    for (let i = 0; i < 20 * TICK_RATE; i += 30) {
      run(a, 30);
      run(b, 30);
      expect(JSON.stringify(a.snapshot())).toBe(JSON.stringify(b.snapshot()));
    }
    expect(dropsOf(a).length).toBeGreaterThan(0);
  });

  test('off by default, and on with no ambient spans and no plan: no drops, same snapshots', () => {
    const plan = [event(0, 100)];
    const off = make(plan, straight, false);
    const plain = createWorld(RAPIER, { courseId: 'straight', vehicleId: 'lodgy' }, straight);
    run(off, 60);
    run(plain, 60);
    expect(dropsOf(off)).toEqual([]);
    expect(JSON.stringify(off.snapshot())).toBe(JSON.stringify(plain.snapshot()));
    const { ambient: _spans, ...bare } = straight;
    const none = make(undefined, bare);
    run(none, 60);
    expect(dropsOf(none)).toEqual([]);
  });

  test('the course pickups are unchanged with drops on', () => {
    const on = make([event(0, 100)], hilly);
    const off = make(undefined, hilly, false);
    run(on, 3);
    run(off, 3);
    const nonDrop = (w: World) => w.snapshot().props.filter((prop) => !/^item-\d+$/.test(prop.id));
    expect(nonDrop(on)).toEqual(nonDrop(off));
  });
});

describe('T3: restart and skipCheckpoint with a live drop', () => {
  const plan = [event(0, 100), event(1, 450, 'toolbox', -1)];
  const ids = (world: World) => world.snapshot().props.map((prop) => prop.id);

  function expectOneAt(world: World, ...alongs: number[]) {
    const drops = dropsOf(world);
    expect(drops).toHaveLength(alongs.length);
    for (const along of alongs) expect(drops.filter((d) => Math.abs(d.pos.z + along) < 0.5)).toHaveLength(1);
    expect(new Set(ids(world)).size).toBe(ids(world).length);
  }

  test('restart: the drop is taken and made again, once, with unique ids', () => {
    const world = make(plan);
    run(world, 3);
    expectOneAt(world, 100);
    world.restartCheckpoint();
    run(world, 3);
    expectOneAt(world, 100);
    expect(dropsOf(world)[0]!.id).toBe('item-2');
    world.restartCheckpoint();
    run(world, 3);
    expectOneAt(world, 100);
  });

  test('skipCheckpoint: the live drop is taken; the next ones fire from the new position', () => {
    const world = make(plan);
    run(world, 3);
    expectOneAt(world, 100);
    expect(world.adminTool('skipCheckpoint')).toBe(true);
    run(world, 3);
    // The second checkpoint is at about 300 m: event 0 is 200 m behind, event 1 is 150 m ahead.
    expectOneAt(world, 450);
    world.restartCheckpoint();
    run(world, 3);
    expectOneAt(world, 450);
  });

  test('a checkpoint recorded while a drop is live does not keep it: no untracked copy comes back', () => {
    const world = make([event(0, 350)]);
    const trigger = straight.checkpoints[1]!.trigger.center;
    place(world, trigger.x, RIDE, trigger.z);
    run(world, 3);
    expect(world.snapshot().checkpoint).toBe(1);
    expect(dropsOf(world)).toHaveLength(1);
    world.restartCheckpoint();
    run(world, 3);
    expect(dropsOf(world)).toEqual([]);
    run(world, 60);
    expect(dropsOf(world)).toEqual([]);
  });

  test('a restart through the kill plane does the same', () => {
    const world = make(plan);
    run(world, 3);
    place(world, 0, -500, -50);
    run(world, 5);
    expect(world.snapshot().restarts).toBe(1);
    expectOneAt(world, 100);
  });

  test('a drop that a player picked up and dropped again is an ordinary item and survives a restart record', () => {
    const world = make(plan);
    world.addPlayer('p1');
    run(world, 30);
    world.teleportPlayer('p1', vec3(LATERAL, PLAYER_CONTROLLER_OFFSET, -100 + 0.8));
    run(world, 10);
    world.step(new Map([['p1', input({ interact: true })]]));
    world.step(new Map());
    expect(dropsOf(world)).toEqual([]);
    world.step(new Map([['p1', input({ drop: true })]]));
    const dropped = dropsOf(world);
    expect(dropped).toHaveLength(1);
    const id = dropped[0]!.id;
    // Ordinary: a checkpoint recorded now keeps it, so a restart brings it back.
    const spawn = straight.checkpoints[1]!.trigger.center;
    place(world, spawn.x, RIDE, spawn.z);
    run(world, 3);
    expect(world.snapshot().checkpoint).toBe(1);
    world.restartCheckpoint();
    run(world, 3);
    expect(ids(world)).toContain(id);
  });
});
