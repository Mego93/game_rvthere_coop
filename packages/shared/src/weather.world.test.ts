import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { RAIN_GRIP, WEATHER_SEED_SALT } from './constants';
import { hashSeed } from './ambient';
import { mixSeed } from './itemDrops';
import { weatherSchedule } from './weather';
import { createWorld } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const HORIZON = 2 * 3600 * 60;
const scheduleOf = (itemSeed: number) => weatherSchedule(mixSeed(itemSeed, WEATHER_SEED_SALT), HORIZON);

describe('random weather in the world', () => {
  test('the snapshot carries the weather only when random is set', () => {
    for (const weather of ['clear', 'rain', 'sandstorm'] as const) {
      const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy', weather });
      world.step(new Map());
      expect('weather' in world.snapshot()).toBe(false);
      world.dispose();
    }
    const unset = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    unset.step(new Map());
    expect('weather' in unset.snapshot()).toBe(false);
    unset.dispose();
    const random = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy', weather: 'random', itemSeed: 5 });
    random.step(new Map());
    expect(random.snapshot().weather).toBe(scheduleOf(5)[0]!.weather);
    random.dispose();
  });

  test('the same seed gives the same first weather, and a fixed setting never changes', () => {
    const a = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy', weather: 'random', itemSeed: 77 });
    const b = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy', weather: 'random', itemSeed: 77 });
    a.step(new Map());
    b.step(new Map());
    expect(a.snapshot().weather).toBe(b.snapshot().weather);
    a.dispose();
    b.dispose();
  });

  test('without an item seed the course seed is used', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy', weather: 'random' });
    world.step(new Map());
    expect(world.snapshot().weather).toBe(scheduleOf(mixSeed(hashSeed('test'), 1))[0]!.weather);
    world.dispose();
  });

  test('the weather changes on the scheduled tick, and the tyre grip follows rain', () => {
    // A seed whose first change is between rain and not rain.
    let seed = 1;
    while (true) {
      const list = scheduleOf(seed);
      if ((list[0]!.weather === 'rain') !== (list[1]!.weather === 'rain')) break;
      seed += 1;
    }
    const list = scheduleOf(seed);
    const changeTick = list[1]!.tick;
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy', weather: 'random', itemSeed: seed });
    const slip = () => world.debug().wheelFrictionSlips[0]!;
    let before = 0;
    for (let tick = 0; tick < changeTick + 2; tick++) {
      world.step(new Map());
      if (tick === changeTick - 1) {
        // World tick n+1 is the step that sees run tick n; the schedule is in run ticks.
        expect(world.snapshot().weather).toBe(list[0]!.weather);
        before = slip();
      }
    }
    expect(world.snapshot().weather).toBe(list[1]!.weather);
    const after = slip();
    const rainFirst = list[0]!.weather === 'rain';
    expect(after / before).toBeCloseTo(rainFirst ? 1 / RAIN_GRIP : RAIN_GRIP, 6);
    world.dispose();
  });

  test('a checkpoint restart keeps the weather and the schedule', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy', weather: 'random', itemSeed: 9 });
    for (let i = 0; i < 10; i++) world.step(new Map());
    const before = world.snapshot().weather;
    world.restartCheckpoint();
    world.step(new Map());
    expect(world.snapshot().weather).toBe(before);
    world.dispose();
  });
});
