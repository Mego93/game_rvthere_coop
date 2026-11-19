import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { hashSeed } from './ambient';
import {
  ANIMAL_HEALTH_FLOOR,
  ENEMY_KNIFE_COOLDOWN,
  ENEMY_KNIFE_DAMAGE,
  ENEMY_MAX_ALIVE,
  ENEMY_REMOVE_AFTER,
  ENEMY_RUN_SPEED,
  ENEMY_SIGHT,
  ENEMY_SLIP_SECONDS,
  ENEMY_SPACING,
  ENEMY_SEED_SALT,
  ENEMY_SPAWN_AHEAD,
  ENEMY_VEHICLE_DAMAGE,
  GUN_COOLDOWN,
  HOLD_DURATION,
  PLAYER_CONTROLLER_OFFSET,
  ROAD_WIDTH,
  SHIELD_HP,
  TICK_RATE,
} from './constants';
import { buildCourse } from './courses/build';
import { planEnemies, type EnemyEvent } from './enemies';
import { mixSeed } from './itemDrops';
import { getCourse } from './courses/index';
import { createRouteIndex } from './routeAlong';
import { IDENTITY, vec3 } from './math';
import { NEUTRAL_INPUT, parseServerMessage, type InputFields, type PlayerInput } from './protocol';
import { withBoxes } from './testRig';
import { VEHICLES } from './vehicles';
import { createWorld, type World, type WorldEvent } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

// A straight road going -Z; "along" is -z and the right edge is at +X.
const straight = buildCourse({ id: 'straight', segments: [{ type: 'road', length: 300 }, { type: 'road', length: 300 }], targetTime: 100 });
const dirt = buildCourse({ id: 'dirt', segments: [{ type: 'road', length: 300, surface: 'dirt' }, { type: 'road', length: 300, surface: 'dirt' }], targetTime: 100 });
const EDGE = ROAD_WIDTH / 2 + 1.5;
const RIDE = VEHICLES.lodgy.rideHeight;
const worlds: World[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

const ev = (id: number, along: number, side: -1 | 1 = 1): EnemyEvent => ({ id, along, side });
const input = (fields: Partial<PlayerInput> = {}): InputFields => ({ ...NEUTRAL_INPUT, ...fields });
const seconds = (s: number) => Math.round(s * TICK_RATE);
const me = (world: World, id = 'p') => world.snapshot().players.find((p) => p.playerId === id)!;

function make(plan: EnemyEvent[], course = straight, enemySeed = 1): World {
  const world = createWorld(RAPIER, { courseId: course.id, vehicleId: 'lodgy', enemies: true, enemyPlan: plan, enemySeed }, course);
  worlds.push(world);
  return world;
}

function place(world: World, x: number, along: number, speed = 0) {
  const body = world.debugBody('vehicle')!;
  body.setTranslation({ x, y: RIDE, z: -along }, true);
  body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  body.setLinvel({ x: 0, y: 0, z: -speed }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
}

// Puts a player on foot at (x, along) and lets them settle.
function stand(world: World, id: string, x: number, along: number) {
  if (!world.snapshot().players.some((p) => p.playerId === id)) world.addPlayer(id);
  world.teleportPlayer(id, vec3(x, PLAYER_CONTROLLER_OFFSET, -along));
  for (let i = 0; i < 20; i++) world.step(new Map());
}

function run(world: World, ticks: number, inputs: ReadonlyMap<string, InputFields> = new Map()): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...world.step(inputs));
  return events;
}

const enemyList = (world: World) => world.snapshot().enemies ?? [];
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('planEnemies', () => {
  test('is seeded, sorted, numbered in order and about ENEMY_SPACING apart', () => {
    const plan = planEnemies(7, 20000, null);
    expect(planEnemies(7, 20000, null)).toEqual(plan);
    expect(planEnemies(8, 20000, null)).not.toEqual(plan);
    expect(plan.map((e) => e.id)).toEqual(plan.map((_, i) => i));
    for (let i = 1; i < plan.length; i++) expect(plan[i]!.along).toBeGreaterThanOrEqual(plan[i - 1]!.along);
    expect(Math.abs(plan.length - 20000 / ENEMY_SPACING)).toBeLessThanOrEqual(1);
    expect(plan.every((e) => e.side === 1 || e.side === -1)).toBe(true);
  });

  test('is twice as dense from the city start on', () => {
    const plan = planEnemies(7, 20000, 14000);
    const inCity = plan.filter((e) => e.along >= 14000).length;
    const before = plan.filter((e) => e.along < 14000).length;
    expect(inCity / 6000).toBeGreaterThan((before / 14000) * 1.7);
    expect(inCity / 6000).toBeLessThan((before / 14000) * 2.3);
  });
});

describe('step 40: enemy density and city share come from the course', () => {
  const road = (n: number) => Array.from({ length: n }, () => ({ type: 'road' as const, length: 400 }));
  const length = (course: ReturnType<typeof buildCourse>) => createRouteIndex(course.route).length;

  // Every enemy id that appears while the vehicle is carried along the whole route.
  function seen(course: ReturnType<typeof buildCourse>): number {
    const world = createWorld(RAPIER, { courseId: course.id, vehicleId: 'lodgy', enemies: true, enemySeed: 1 }, course);
    worlds.push(world);
    const ids = new Set<number>();
    for (let along = 0; along <= length(course); along += 40) {
      place(world, 0, along);
      run(world, 3);
      for (const e of enemyList(world)) ids.add(e.id);
    }
    return ids.size;
  }
  const expected = (course: ReturnType<typeof buildCourse>, denseShare: number | null, density = 1) =>
    planEnemies(mixSeed(mixSeed(hashSeed(course.id), 1), ENEMY_SEED_SALT), length(course), denseShare === null ? null : length(course) * (1 - denseShare), density).length;

  test('a course without the fields has events every ENEMY_SPACING', () => {
    const plain = buildCourse({ id: 'dens-1', segments: road(10), targetTime: 100 });
    expect(plain.enemyDensity).toBeUndefined();
    expect(plain.enemyCityShare).toBeUndefined();
    expect(seen(plain)).toBe(expected(plain, null));
  });

  test('enemyDensity 2 doubles the events', () => {
    const plain = buildCourse({ id: 'dens-1', segments: road(10), targetTime: 100 });
    const dense = buildCourse({ id: 'dens-2', segments: road(10), targetTime: 100, enemyDensity: 2 });
    expect(dense.enemyDensity).toBe(2);
    expect(expected(dense, null, 2)).toBeGreaterThanOrEqual(2 * expected(plain, null) - 1);
    expect(seen(dense)).toBe(expected(dense, null, 2));
  });

  test('enemyCityShare makes the last share twice as dense, as the id test for marrakech did', () => {
    const city = buildCourse({ id: 'dens-3', segments: road(10), targetTime: 100, enemyCityShare: 0.3 });
    expect(city.enemyCityShare).toBe(0.3);
    expect(seen(city)).toBe(expected(city, 0.3));
    expect(expected(city, 0.3)).toBeGreaterThan(expected(city, null));
  });

  test('marrakech carries a city share of 0.3 and no density', () => {
    const marrakech = getCourse('marrakech');
    expect(marrakech.enemyCityShare).toBe(0.3);
    expect(marrakech.enemyDensity).toBeUndefined();
    const total = length(marrakech);
    expect(planEnemies(5, total, total * 0.7, marrakech.enemyDensity).length).toBe(planEnemies(5, total, total * 0.7).length);
  });

  test('the city stage has density 2', () => {
    expect(getCourse('city').enemyDensity).toBe(2);
  });
});

describe('step 39 rule 3: enemies', () => {
  test('are off by default, and appear ENEMY_SPAWN_AHEAD m ahead of the vehicle at the road edge on the ground', () => {
    const off = createWorld(RAPIER, { courseId: 'straight', vehicleId: 'lodgy' }, straight);
    worlds.push(off);
    run(off, 5);
    expect('enemies' in off.snapshot()).toBe(false);

    const world = make([ev(0, 200)]);
    place(world, 0, 20);
    run(world, 5);
    expect(enemyList(world)).toEqual([]);
    expect('enemies' in world.snapshot()).toBe(false);
    place(world, 0, 200 - ENEMY_SPAWN_AHEAD + 5);
    run(world, 2);
    const [enemy, ...rest] = enemyList(world);
    expect(rest).toEqual([]);
    expect(enemy).toMatchObject({ state: 'idle' });
    expect(enemy!.x).toBeCloseTo(EDGE, 2);
    expect(enemy!.z).toBeCloseTo(-200, 2);
    expect(enemy!.y).toBeGreaterThan(0.3);
    expect(enemy!.y).toBeLessThan(1.2);
  });

  test('at most ENEMY_MAX_ALIVE are alive; the rest wait', () => {
    const plan = Array.from({ length: 12 }, (_, i) => ev(i, 60 + i * 2));
    const world = make(plan);
    place(world, 0, 30);
    run(world, 5);
    expect(enemyList(world)).toHaveLength(ENEMY_MAX_ALIVE);
  });

  test('an enemy runs at the nearest on-foot player within ENEMY_SIGHT and ignores one beyond', () => {
    const world = make([ev(0, 100)]);
    place(world, 0, 20);
    stand(world, 'far', EDGE, 100 - ENEMY_SIGHT - 6);
    run(world, seconds(1));
    expect(enemyList(world)[0]!.state).toBe('idle');
    stand(world, 'near', EDGE, 100 - 25);
    stand(world, 'nearer', EDGE + 1, 100 - 16);
    const before = enemyList(world)[0]!;
    const start = distance(before, me(world, 'nearer').pos);
    run(world, seconds(1));
    const after = enemyList(world)[0]!;
    expect(after.state).toBe('run');
    expect(start - distance(after, me(world, 'nearer').pos)).toBeCloseTo(ENEMY_RUN_SPEED, 0);
  });

  test('stabs on arrival and then every ENEMY_KNIFE_COOLDOWN for ENEMY_KNIFE_DAMAGE', () => {
    const world = make([ev(0, 100)]);
    place(world, 0, 20);
    stand(world, 'p', EDGE, 100 - 8);
    const stabs: number[] = [];
    let health = 100;
    for (let i = 0; i < seconds(5) && stabs.length < 4; i++) {
      const events = world.step(new Map());
      for (const e of events) if (e.kind === 'stab') stabs.push(i);
      if (stabs.length === 1 && health === 100) health = me(world).health;
    }
    expect(stabs).toHaveLength(4);
    expect(health).toBe(100 - ENEMY_KNIFE_DAMAGE);
    for (let i = 1; i < stabs.length; i++) expect(Math.abs(stabs[i]! - stabs[i - 1]! - ENEMY_KNIFE_COOLDOWN * TICK_RATE)).toBeLessThanOrEqual(1);
    run(world, 2);
    expect(me(world).health).toBe(100 - 4 * ENEMY_KNIFE_DAMAGE);
    expect(enemyList(world)[0]!.state).toBe('attack');
  });

  test('the fromage blanc shield takes the stabs first', () => {
    const world = make([ev(0, 100)]);
    place(world, 0, 20);
    stand(world, 'p', EDGE, 100 - ENEMY_SIGHT - 5);
    world.debugSetInventory('p', ['fromageBlanc', null, null]);
    run(world, Math.round(HOLD_DURATION * TICK_RATE) + 3, new Map([['p', input({ use: true })]]));
    expect(me(world).shield).toBe(SHIELD_HP);
    expect(enemyList(world)[0]!.state).toBe('idle');
    world.teleportPlayer('p', vec3(EDGE, PLAYER_CONTROLLER_OFFSET, -(100 - 3)));
    const stabs: number[] = [];
    for (let i = 0; i < seconds(5) && stabs.length < 4; i++) for (const e of world.step(new Map())) if (e.kind === 'stab') stabs.push(i);
    run(world, 2);
    expect(me(world).health).toBe(100 - ENEMY_KNIFE_DAMAGE);
    expect(me(world).shield).toBeUndefined();
  });

  test('a seated player is never a target; leaving the seat makes them one', () => {
    const world = make([ev(0, 50)]);
    place(world, 0, 20);
    world.addPlayer('p');
    for (let i = 0; i < 10; i++) world.step(new Map());
    world.step(new Map([['p', input({ interact: true })]]));
    world.step(new Map());
    expect(me(world).seat).not.toBeNull();
    run(world, seconds(2));
    expect(enemyList(world)[0]!.state).toBe('idle');
    run(world, 1, new Map([['p', input({ interact: true })]]));
    run(world, 1);
    expect(me(world).seat).toBeNull();
    run(world, seconds(1));
    expect(enemyList(world)[0]!.state).toBe('run');
  });

  test('a running enemy slips for ENEMY_SLIP_SECONDS and then gets up; it always slips on dirt, the first time', () => {
    const world = make([ev(0, 100)], dirt);
    place(world, 0, 20);
    stand(world, 'p', 0, 100 - 30);
    const states: string[] = [];
    for (let i = 0; i < seconds(5); i++) {
      world.step(new Map());
      states.push(enemyList(world)[0]!.state);
    }
    const first = states.indexOf('slip');
    expect(first).toBeGreaterThan(0);
    // The enemy starts on the gravel shoulder and slips as it steps onto the dirt road, about 1.3 s after it set off.
    expect(first).toBeLessThanOrEqual(90);
    const last = states.lastIndexOf('slip', first + seconds(ENEMY_SLIP_SECONDS) + 5);
    expect(Math.abs(last - first + 1 - ENEMY_SLIP_SECONDS * TICK_RATE)).toBeLessThanOrEqual(1);
    expect(states[last + 2]).not.toBe('slip');
    // It runs again after it gets up, and the dirt is slipped on only once.
    expect(states.slice(last + 3).includes('run') || states.slice(last + 3).includes('attack')).toBe(true);
  });

  test('on asphalt the slips follow the seed: the same seed gives the same run, and some seed slips', () => {
    const trace = (seed: number) => {
      const world = make([ev(0, 100)], straight, seed);
      place(world, 0, 20);
      stand(world, 'p', EDGE, 100 - 38);
      const states: string[] = [];
      for (let i = 0; i < seconds(7); i++) {
        world.step(new Map());
        states.push(enemyList(world)[0]!.state);
      }
      world.dispose();
      worlds.pop();
      return states;
    };
    const a = trace(3);
    expect(trace(3)).toEqual(a);
    const slips = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((seed) => trace(seed).includes('slip'));
    expect(slips.length).toBeGreaterThan(0);
    expect(slips.length).toBeLessThan(12);
  });

  test('the vehicle above ENEMY_KNOCK_SPEED knocks an enemy down, costs ENEMY_VEHICLE_DAMAGE and removes it after ENEMY_REMOVE_AFTER', () => {
    const world = make([ev(0, 100)]);
    place(world, EDGE, 70, 12);
    run(world, 2);
    const healthBefore = world.snapshot().vehicle.health;
    let downAt = -1;
    for (let i = 0; i < seconds(6) && downAt < 0; i++) {
      world.step(new Map());
      if (enemyList(world)[0]?.state === 'down') downAt = i;
    }
    expect(downAt).toBeGreaterThan(0);
    expect(world.snapshot().vehicle.health).toBeCloseTo(healthBefore - ENEMY_VEHICLE_DAMAGE, 2);
    expect(world.snapshot().vehicle.health).toBeGreaterThan(ANIMAL_HEALTH_FLOOR);
    run(world, seconds(ENEMY_REMOVE_AFTER) - 5);
    expect(enemyList(world)).toHaveLength(1);
    run(world, 10);
    expect(enemyList(world)).toHaveLength(0);
  });

  test('a slow vehicle, or a parked one an enemy runs into, knocks nothing down', () => {
    const slow = make([ev(0, 100)]);
    place(slow, EDGE, 90, 2);
    run(slow, seconds(2));
    expect(enemyList(slow)[0]!.state).toBe('idle');
    const parked = make([ev(0, 100)]);
    place(parked, EDGE, 60, 0);
    stand(parked, 'p', EDGE, 60 - 3);
    run(parked, seconds(3));
    expect(enemyList(parked)[0]!.state).not.toBe('down');
    expect(parked.snapshot().vehicle.health).toBeGreaterThan(0.99);
  });

  test('an enemy is removed ENEMY_DESPAWN_BEHIND m behind the vehicle', () => {
    const world = make([ev(0, 100)]);
    place(world, 0, 40);
    run(world, 3);
    expect(enemyList(world)).toHaveLength(1);
    place(world, 0, 100 + 70);
    run(world, 3);
    expect(enemyList(world)).toHaveLength(1);
    place(world, 0, 100 + 90);
    run(world, 3);
    expect(enemyList(world)).toHaveLength(0);
  });

  test('a restart removes every enemy and re-arms the ones ahead', () => {
    const world = make([ev(0, 100)]);
    place(world, 0, 40);
    run(world, 3);
    const before = enemyList(world)[0]!.id;
    world.restartCheckpoint();
    run(world, 1);
    expect(enemyList(world)).toHaveLength(0);
    run(world, 3);
    const again = enemyList(world);
    expect(again).toHaveLength(1);
    expect(again[0]!.id).not.toBe(before);
  });

  test('the plan follows the run seed: two runs of a course differ, one run repeats', () => {
    const plan = (run: number) => planEnemies(mixSeed(mixSeed(hashSeed('straight'), run), 0xe4e1), 20000, null);
    expect(plan(1)).toEqual(plan(1));
    expect(plan(1)).not.toEqual(plan(2));
  });

  test('the snapshot lists id, position rounded to 0.01, yaw and state, and parses', () => {
    const world = make([ev(0, 100)]);
    place(world, 0, 40);
    stand(world, 'p', EDGE, 100 - 20);
    run(world, 20);
    const list = enemyList(world);
    expect(list).toHaveLength(1);
    for (const key of ['x', 'y', 'z', 'yaw'] as const) expect(Math.abs(list[0]![key] * 100 - Math.round(list[0]![key] * 100))).toBeLessThan(1e-6);
    const message = JSON.stringify({ type: 'snapshot', ackSeq: 0, full: true, ...world.snapshot() });
    expect(parseServerMessage(message)).not.toBeNull();
    expect(parseServerMessage(JSON.stringify({ ...JSON.parse(message), enemies: [{ id: 1, x: 0, y: 0, z: 0, yaw: 0, state: 'dancing' }] }))).toBeNull();
  });
});

describe('step 39 rule 2: shots at enemies', () => {
  // The enemy at the road edge, the shooter 25 m down the road from it, both on the right.
  function duel(course = straight) {
    const world = make([ev(0, 100)], course);
    place(world, 0, 20);
    stand(world, 'p', EDGE, 100 - 25);
    return world;
  }
  const fire = (world: World, ticks: number, fields: Partial<InputFields> = {}) => run(world, ticks, new Map([['p', input({ fire: true, ...fields })]])).filter((e) => e.kind === 'shot');

  test('a shot in line of sight hits; three kill a normal enemy, two with Koke Zero; the dead one is removed after 2 s', () => {
    const world = duel();
    const first = fire(world, 1);
    expect(first[0]!.hit).toBe(true);
    expect(enemyList(world)[0]!.state).not.toBe('dead');
    fire(world, seconds(GUN_COOLDOWN) * 2);
    expect(enemyList(world)[0]!.state).toBe('dead');
    expect(fire(world, seconds(GUN_COOLDOWN) + 1).every((e) => e.hit === false)).toBe(true);
    run(world, seconds(ENEMY_REMOVE_AFTER) + 5);
    expect(enemyList(world)).toHaveLength(0);

    const koke = duel();
    koke.debugSetInventory('p', ['kokeZero', null, null]);
    run(koke, Math.round(HOLD_DURATION * TICK_RATE) + 2, new Map([['p', input({ use: true })]]));
    expect(me(koke).koke).toBeGreaterThan(0);
    expect(fire(koke, 1)[0]!.hit).toBe(true);
    expect(enemyList(koke)[0]!.state).not.toBe('dead');
    fire(koke, seconds(GUN_COOLDOWN));
    expect(enemyList(koke)[0]!.state).toBe('dead');
  });

  test('a wall between shooter and enemy stops the shot', () => {
    const walled = withBoxes(straight, { walls: [{ center: vec3(EDGE, 1.5, -(100 - 12)), halfExtents: vec3(4, 1.5, 0.5), rot: IDENTITY }] });
    const world = duel(walled);
    const shots = fire(world, seconds(1));
    expect(shots.length).toBeGreaterThan(1);
    expect(shots.every((e) => e.hit === false)).toBe(true);
    expect(enemyList(world)[0]!.state).not.toBe('dead');
  });

  test('the vehicle between shooter and enemy stops the shot', () => {
    const world = make([ev(0, 100)]);
    place(world, EDGE, 100 - 12, 0);
    stand(world, 'p', EDGE, 100 - 25);
    const shots = fire(world, seconds(1));
    expect(shots.length).toBeGreaterThan(1);
    expect(shots.every((e) => e.hit === false)).toBe(true);
    expect(enemyList(world)[0]!.state).not.toBe('dead');
  });
});
