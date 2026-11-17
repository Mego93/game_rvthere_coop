import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import type { AmbientEvent } from './ambient';
import { ANIMAL_HEALTH_FLOOR, ANIMAL_HIT_DAMAGE, ANIMAL_HIT_LINGER, ROAD_WIDTH, TICK_RATE } from './constants';
import { buildCourse } from './courses/build';
import { NEUTRAL_INPUT, type InputFields } from './protocol';
import { VEHICLES } from './vehicles';
import { createWorld, type World, type WorldEvent } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

// A straight road going -Z; the vehicle starts on it at z = -8 and "right" is +X.
const straight = buildCourse({ id: 'straight', segments: [{ type: 'road', length: 300 }, { type: 'road', length: 300 }], targetTime: 100, ambient: true });
const HALF = ROAD_WIDTH / 2;
const RIDE = VEHICLES.lodgy.rideHeight;

const event = (kind: 'goat' | 'scooter', along: number, side: -1 | 1 = 1): AmbientEvent => ({ id: 0, along, side, kind });
const make = (plan: AmbientEvent[] | undefined, ambient = true) =>
  createWorld(RAPIER, { courseId: 'straight', vehicleId: 'lodgy', ambient, ...(plan ? { ambientPlan: plan } : {}) }, straight);

const run = (world: World, ticks: number, inputs: ReadonlyMap<string, InputFields> = new Map()): WorldEvent[] => {
  const events: WorldEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...world.step(inputs));
  return events;
};
const seconds = (s: number) => Math.round(s * TICK_RATE);

// Puts the vehicle at (x, along) heading down the road at `speed`.
function place(world: World, x: number, along: number, speed: number) {
  const body = world.debugBody('vehicle')!;
  body.setTranslation({ x, y: RIDE, z: -along }, true);
  body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  body.setLinvel({ x: 0, y: 0, z: -speed }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
}

// A goat that has crossed and stands beyond the far edge at along 60, with the vehicle at along 20 (inside the trigger).
function standingGoat(): World {
  const world = make([event('goat', 60)]);
  place(world, 0, 20, 0);
  run(world, seconds(7));
  const goat = world.snapshot().animals![0]!;
  expect(goat.x).toBeCloseTo(-(HALF + 2), 2);
  return world;
}

describe('T4: world with ambient animals', () => {
  test('is off by default: no animals field, and ambient on a course without spans does nothing', () => {
    const plain = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    run(plain, 30);
    expect('animals' in plain.snapshot()).toBe(false);
    const flagged = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy', ambient: true });
    run(flagged, 30);
    expect('animals' in flagged.snapshot()).toBe(false);
    const off = make([event('goat', 60)], false);
    run(off, 30);
    expect('animals' in off.snapshot()).toBe(false);
  });

  test('an animal appears at its edge position on the ground when the vehicle is within the spawn window', () => {
    const world = make([event('goat', 200)]);
    run(world, 5);
    expect('animals' in world.snapshot()).toBe(false);
    place(world, 0, 100, 0);
    run(world, 2);
    const [goat, ...rest] = world.snapshot().animals!;
    expect(rest).toEqual([]);
    expect(goat!.kind).toBe('goat');
    expect(goat!.x).toBeCloseTo(HALF + 1.5, 6);
    expect(goat!.z).toBeCloseTo(-200, 6);
    // Standing on the ground, the box centre at its half height.
    expect(goat!.y).toBeGreaterThan(0.1);
    expect(goat!.y).toBeLessThan(0.6);
    expect(goat!.hit).toBeUndefined();
    // It faces its crossing direction (toward -X).
    expect(Math.sin(goat!.yaw)).toBeCloseTo(1, 6);
  });

  test('a goat crosses and stops beyond the far edge; a scooter keeps going and leaves', () => {
    const goat = standingGoat();
    expect(goat.snapshot().animals![0]!.x).toBeCloseTo(-(HALF + 2), 2);
    const scooter = make([event('scooter', 60)]);
    place(scooter, 0, 20, 0);
    run(scooter, seconds(1));
    expect(scooter.snapshot().animals![0]!.kind).toBe('scooter');
    run(scooter, seconds(8));
    expect('animals' in scooter.snapshot()).toBe(false);
  });

  test('two worlds fed the same inputs give equal snapshots for 20 s', () => {
    const a = make([event('goat', 60), { ...event('scooter', 90, -1), id: 1 }]);
    const b = make([event('goat', 60), { ...event('scooter', 90, -1), id: 1 }]);
    for (const world of [a, b]) place(world, 0, 20, 0);
    for (let i = 0; i < seconds(20); i += 30) {
      run(a, 30);
      run(b, 30);
      expect(JSON.stringify(a.snapshot())).toBe(JSON.stringify(b.snapshot()));
    }
    expect(a.snapshot().tick).toBe(seconds(20));
  });

  test('restart and skipCheckpoint with a live animal do not throw and clear it; ids are never reused', () => {
    const world = make([event('goat', 200)]);
    place(world, 0, 100, 0);
    run(world, 2);
    expect(world.snapshot().animals![0]!.id).toBe(1);
    world.restartCheckpoint();
    run(world, 2);
    expect('animals' in world.snapshot()).toBe(false);
    place(world, 0, 100, 0);
    run(world, 2);
    expect(world.snapshot().animals![0]!.id).toBe(2);
    expect(world.adminTool('skipCheckpoint')).toBe(true);
    run(world, 2);
    expect('animals' in world.snapshot()).toBe(false);
  });

  test('a player walking into an animal is not blocked and not hurt', () => {
    const world = standingGoat();
    world.addPlayer('a');
    const before = world.snapshot().players[0]!;
    // Feet beside the goat, 3 m before it, walking down the road line.
    world.teleportPlayer('a', { x: -(HALF + 2), y: 0.2, z: -57 });
    const walk = new Map([['a', { ...NEUTRAL_INPUT, moveY: 1 }]]);
    run(world, seconds(3), walk);
    const after = world.snapshot().players[0]!;
    expect(after.pos.z).toBeLessThan(-63);
    expect(after.health).toBe(before.health);
    expect(world.snapshot().animals![0]!.hit).toBeUndefined();
  });
});

describe('T5: hit rule', () => {
  // The jolt of the teleport costs a little health once it has settled; `health` is the health after that.
  const drive = (world: World, x: number, speed: number, secondsToRun = 4) => {
    place(world, x, 45, speed);
    run(world, 20);
    const health = world.snapshot().vehicle.health;
    return Object.assign(run(world, seconds(secondsToRun)), { health });
  };
  const hitsOf = (events: WorldEvent[], kind: 'goatHit' | 'scooterHit') => events.filter((e) => e.kind === kind);

  test('a vehicle driven into a goat at 6 m/s loses exactly ANIMAL_HIT_DAMAGE once and emits one goatHit', () => {
    const world = standingGoat();
    const goat = world.snapshot().animals![0]!;
    const events = drive(world, goat.x, 6, 3);
    const hits = hitsOf(events, 'goatHit');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.pos).toBeDefined();
    expect(world.snapshot().vehicle.health).toBeCloseTo(events.health - ANIMAL_HIT_DAMAGE, 10);
    expect(hitsOf(events, 'scooterHit')).toHaveLength(0);
  });

  test('the animal is flagged hit at once and gone 1.5 s later; the same animal costs nothing a second time', () => {
    const world = standingGoat();
    const goat = world.snapshot().animals![0]!;
    place(world, goat.x, 45, 6);
    run(world, 20);
    let ticks = 0;
    let hit: WorldEvent[] = [];
    while (hit.length === 0 && ticks < seconds(6)) {
      hit = hitsOf(world.step(new Map()), 'goatHit');
      ticks += 1;
    }
    expect(hit).toHaveLength(1);
    expect(world.snapshot().animals![0]!.hit).toBe(true);
    const healthAfterHit = world.snapshot().vehicle.health;
    // Park the vehicle on the animal at speed again: nothing more is taken while it lingers.
    run(world, seconds(ANIMAL_HIT_LINGER) - 5);
    expect(world.snapshot().animals).toBeDefined();
    place(world, goat.x, 58, 6);
    run(world, 3);
    expect(hitsOf(run(world, 1), 'goatHit')).toHaveLength(0);
    expect(world.snapshot().vehicle.health).toBeCloseTo(healthAfterHit, 10);
    run(world, 10);
    expect('animals' in world.snapshot()).toBe(false);
  });

  test('contact below ANIMAL_HIT_SPEED costs nothing', () => {
    const world = standingGoat();
    const goat = world.snapshot().animals![0]!;
    const events = drive(world, goat.x, 1, 5);
    expect(hitsOf(events, 'goatHit')).toHaveLength(0);
    expect(world.snapshot().vehicle.health).toBeCloseTo(events.health, 10);
    expect(world.snapshot().animals![0]!.hit).toBeUndefined();
  });

  test('health never falls below ANIMAL_HEALTH_FLOOR', () => {
    const world = standingGoat();
    const goat = world.snapshot().animals![0]!;
    place(world, goat.x, 45, 6);
    run(world, 20);
    world.debugVehicle().damage(world.snapshot().vehicle.health - 0.04, 0);
    expect(hitsOf(run(world, seconds(3)), 'goatHit')).toHaveLength(1);
    expect(world.snapshot().vehicle.health).toBeCloseTo(ANIMAL_HEALTH_FLOOR, 10);
  });

  test('a scooter crossing into the vehicle emits scooterHit', () => {
    const world = make([event('scooter', 25)]);
    run(world, 1);
    // Reaches the middle of the road about 1.4 s after it starts; the vehicle arrives there at the same moment.
    place(world, 0, 16.4, 6);
    run(world, 20);
    const health = world.snapshot().vehicle.health;
    const events = run(world, seconds(3));
    expect(hitsOf(events, 'scooterHit')).toHaveLength(1);
    expect(hitsOf(events, 'goatHit')).toHaveLength(0);
    expect(world.snapshot().vehicle.health).toBeCloseTo(health - ANIMAL_HIT_DAMAGE, 10);
  });

  // Only the chassis box (inflated by a margin) counts; the wheels, which sit inside the chassis footprint, never do.
  test('an animal beside the vehicle, clear of the chassis box, costs nothing at speed', () => {
    const world = standingGoat();
    const goat = world.snapshot().animals![0]!;
    const events = drive(world, goat.x + VEHICLES.lodgy.halfExtents.x + 1.0, 6, 3);
    expect(hitsOf(events, 'goatHit')).toHaveLength(0);
    expect(world.snapshot().vehicle.health).toBeCloseTo(events.health, 10);
  });
});
