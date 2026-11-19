import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, test } from 'vitest';
import { createDirector, hashSeed, planAmbient, stepDirector, type AmbientEvent } from '../ambient';
import { AMBIENT_MAX_GOATS, AMBIENT_MAX_SCOOTERS, TICK_DT } from '../constants';
import { createWorld } from '../world';
import { getCourse } from './index';

// The shared package has no DOM or Node typings.
declare const console: { info(...args: unknown[]): void };
declare const performance: { now(): number };

beforeAll(async () => {
  await RAPIER.init();
});

const course = getCourse('marrakech');
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

// Six goats and three scooters all within the spawn window of the start line, so the maxima are alive at once.
const dense: AmbientEvent[] = Array.from({ length: AMBIENT_MAX_GOATS + AMBIENT_MAX_SCOOTERS }, (_, i) => ({
  id: i,
  along: 40 + i * 3,
  side: i % 2 === 0 ? 1 : -1,
  kind: i < AMBIENT_MAX_GOATS ? 'goat' : 'scooter',
}));

test('T10: the plan for marrakech builds in under 50 ms', () => {
  const times: number[] = [];
  for (let i = 0; i < 7; i++) {
    const t = performance.now();
    planAmbient(hashSeed(course.id), course.ambient!.blocked.at(-1)!.to, course.ambient!.blocked);
    times.push(performance.now() - t);
  }
  console.info(`T10 plan build: median ${median(times).toFixed(3)} ms`);
  expect(median(times)).toBeLessThan(50);
});

test('T10: the director costs under 0.1 ms per tick (median) with the maxima alive', () => {
  const state = createDirector(dense);
  stepDirector(state, { vehicleAlong: 8, vehicleLateral: 0, dt: TICK_DT });
  expect(state.animals).toHaveLength(AMBIENT_MAX_GOATS + AMBIENT_MAX_SCOOTERS);
  const batches: number[] = [];
  for (let b = 0; b < 21; b++) {
    const t = performance.now();
    for (let i = 0; i < 500; i++) stepDirector(state, { vehicleAlong: 8, vehicleLateral: 0, dt: 0 });
    batches.push((performance.now() - t) / 500);
  }
  console.info(`T10 director: median ${median(batches).toFixed(5)} ms per tick`);
  expect(median(batches)).toBeLessThan(0.1);
});

test('T10: the 22 km world step stays under 3 ms with animals alive', () => {
  const measure = (ambient: boolean) => {
    const world = createWorld(RAPIER, { courseId: 'marrakech', vehicleId: 'lodgy', ambient, ambientPlan: dense });
    for (let i = 0; i < 60; i++) world.step(new Map());
    if (ambient) expect(world.snapshot().animals).toHaveLength(AMBIENT_MAX_GOATS + AMBIENT_MAX_SCOOTERS);
    const times: number[] = [];
    for (let i = 0; i < 300; i++) {
      const t = performance.now();
      world.step(new Map());
      times.push(performance.now() - t);
    }
    world.dispose();
    return median(times);
  };
  const off = measure(false);
  const on = measure(true);
  console.info(`T10 world step: ${off.toFixed(3)} ms off, ${on.toFixed(3)} ms with 9 animals (median)`);
  expect(on).toBeLessThan(3);
});
