import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, test } from 'vitest';
import { NEUTRAL_INPUT } from './protocol';
import { createWorld } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const burned = (freeFuel: boolean): number => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'buggy', ...(freeFuel ? { freeFuel: true } : {}) });
  world.addPlayer('p1');
  world.debugSeat('p1', 'driver');
  for (let i = 0; i < 600; i += 1) world.step(new Map([['p1', { ...NEUTRAL_INPUT, moveY: 1 }]]));
  const fuel = world.debugVehicle().fuel();
  world.dispose();
  return 1 - fuel;
};

test('freeFuel: a non-story world burns no fuel, and without it fuel burns', () => {
  expect(burned(false)).toBeGreaterThan(0);
  expect(burned(true)).toBe(0);
});

test('startOnMove: the run time starts when the vehicle first moves more than 2 m from its spawn', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'buggy', startOnMove: true });
  world.addPlayer('p1');
  world.debugSeat('p1', 'driver');
  for (let i = 0; i < 180; i += 1) world.step(new Map());
  expect(world.status().elapsed).toBe(0);
  let steps = 0;
  while (world.status().elapsed === 0 && steps < 1200) {
    world.step(new Map([['p1', { ...NEUTRAL_INPUT, moveY: 1 }]]));
    steps += 1;
  }
  expect(world.status().elapsed).toBeGreaterThan(0);
  expect(steps).toBeGreaterThan(30);
  const after = world.status().elapsed;
  for (let i = 0; i < 60; i += 1) world.step(new Map());
  expect(world.status().elapsed).toBeGreaterThan(after);
  world.dispose();
});

test('without startOnMove the run time counts from the first tick', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'buggy' });
  for (let i = 0; i < 60; i += 1) world.step(new Map());
  expect(world.status().elapsed).toBeGreaterThan(0.9);
  world.dispose();
});
