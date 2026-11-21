import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { BuiltCourse } from './course';
import { testGround } from './courses/testGround';
import { vec3 } from './math';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { createWorld, type World, type WorldEvent } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const worlds: World[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

const input = (fields: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });
const spots: NonNullable<BuiltCourse['spots']> = [
  { id: 'laptop-0', kind: 'laptop', pos: vec3(20, 0, 20), radius: 1.5 },
  { id: 'bed-0', kind: 'bed', pos: vec3(22, 0, 20), radius: 1.5 },
];
const spotCourse: BuiltCourse = { ...testGround, spots };
const make = (story: boolean, course: BuiltCourse = spotCourse): World => {
  const world = createWorld(RAPIER, { courseId: course.id, vehicleId: 'lodgy', ...(story ? { story: true } : {}) }, course);
  worlds.push(world);
  world.addPlayer('p1');
  return world;
};
const spotEvents = (events: WorldEvent[]) => events.filter((event) => event.kind === 'spot');
const useAt = (world: World, x: number, z: number): WorldEvent[] => {
  world.teleportPlayer('p1', vec3(x, 0.02, z));
  world.step(new Map());
  return world.step(new Map([['p1', input({ use: true })]]));
};

describe('use at a spot', () => {
  test('emits a spot event with the spot, its kind and the player', () => {
    const world = make(true);
    expect(spotEvents(useAt(world, 20.5, 20))).toEqual([
      { kind: 'spot', tick: world.snapshot().tick, playerId: 'p1', pos: vec3(20, 0, 20), spotId: 'laptop-0', spotKind: 'laptop' },
    ]);
  });

  test('takes the nearest spot when two are in range', () => {
    const world = make(true, { ...testGround, spots: [{ id: 'a', kind: 'laptop', pos: vec3(20, 0, 20), radius: 5 }, { id: 'b', kind: 'bed', pos: vec3(23, 0, 20), radius: 5 }] });
    expect(spotEvents(useAt(world, 22, 20)).map((event) => event.spotId)).toEqual(['b']);
  });

  test('emits nothing outside the radius', () => {
    const world = make(true);
    expect(spotEvents(useAt(world, 18, 20))).toEqual([]);
  });

  test('emits once per press, not while use stays held', () => {
    const world = make(true);
    world.teleportPlayer('p1', vec3(20.5, 0.02, 20));
    world.step(new Map());
    const events: WorldEvent[] = [];
    for (let i = 0; i < 10; i++) events.push(...world.step(new Map([['p1', input({ use: true })]])));
    expect(spotEvents(events)).toHaveLength(1);
  });

  test('emits nothing for a player in a seat', () => {
    const world = make(true);
    world.debugSeat('p1', 'driver');
    world.debugBody('vehicle')!.setTranslation({ x: 20.5, y: 1, z: 20 }, true);
    world.step(new Map());
    expect(spotEvents(world.step(new Map([['p1', input({ use: true })]])))).toEqual([]);
  });

  test('emits nothing in a world without the story option', () => {
    const world = make(false);
    expect(spotEvents(useAt(world, 20.5, 20))).toEqual([]);
  });
});

describe('the story option', () => {
  const drive = (world: World, seconds: number) => {
    world.debugSeat('p1', 'driver');
    for (let i = 0; i < seconds * 60; i++) world.step(new Map([['p1', input({ moveY: 1 })]]));
  };

  test('a race world burns fuel while driving (the control)', () => {
    const world = make(false);
    drive(world, 3);
    expect(world.snapshot().vehicle.fuel).toBeLessThan(1);
  });

  test('a story world burns no fuel', () => {
    const world = make(true);
    drive(world, 3);
    expect(world.snapshot().vehicle.fuel).toBe(1);
  });

  test('a story world is not won at the finish', () => {
    const world = make(true);
    world.debugBody('vehicle')!.setTranslation({ x: 0, y: 1, z: -100 }, true);
    world.step(new Map());
    expect(world.status().state).toBe('running');
    expect(world.snapshot().won).toBe(false);
  });

  test('a race world is won at the finish (the control)', () => {
    const world = make(false);
    world.debugBody('vehicle')!.setTranslation({ x: 0, y: 1, z: -100 }, true);
    world.step(new Map());
    expect(world.status().state).toBe('won');
  });

  test('a story world has no coins to take', () => {
    const world = make(true);
    const coin = testGround.coins[0]!.pose.pos;
    world.teleportPlayer('p1', vec3(coin.x, 0.02, coin.z));
    const events = world.step(new Map());
    expect(events.filter((event) => event.kind === 'coin')).toEqual([]);
    expect(world.snapshot()).toMatchObject({ coinsLeft: [], wallet: 0, coinsCollected: 0 });
  });
});

describe('the holdDowned option', () => {
  const downedWorld = (holdDowned: boolean): World => {
    const world = createWorld(RAPIER, { courseId: spotCourse.id, vehicleId: 'lodgy', ...(holdDowned ? { holdDowned: true } : {}) }, spotCourse);
    worlds.push(world);
    world.addPlayer('p1');
    world.addPlayer('p2');
    world.step(new Map());
    return world;
  };
  const downFor = (world: World, seconds: number, both = false): WorldEvent[] => {
    world.debugHurt('p1', 100);
    if (both) world.debugHurt('p2', 100);
    const events: WorldEvent[] = [];
    for (let i = 0; i < seconds * 60; i++) events.push(...world.step(new Map()));
    return events;
  };

  test('without it a downed player respawns after the timeout', () => {
    const events = downFor(downedWorld(false), 35);
    expect(events.some((event) => event.kind === 'respawn')).toBe(true);
  });

  test('with it a downed player stays down until revived', () => {
    const world = downedWorld(true);
    const events = downFor(world, 90);
    expect(events.some((event) => event.kind === 'downed')).toBe(true);
    expect(events.some((event) => event.kind === 'respawn')).toBe(false);
    expect(world.snapshot().players.find((player) => player.playerId === 'p1')!.downed).not.toBeNull();
  });

  test('with it a world where everyone is downed does not respawn them either', () => {
    const events = downFor(downedWorld(true), 5, true);
    expect(events.some((event) => event.kind === 'respawn')).toBe(false);
  });
});
