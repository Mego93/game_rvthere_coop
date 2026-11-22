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
