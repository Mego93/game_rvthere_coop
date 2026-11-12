import RAPIER from '@dimforge/rapier3d-compat';
import { createWorld } from '@lodgy/shared';
import { beforeAll, expect, test } from 'vitest';
import { overlayText } from './overlay';

beforeAll(async () => {
  await RAPIER.init();
});

test('shows the vehicle, course, tick, speed, position and wheel surfaces', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'rv' });
  for (let i = 0; i < 60; i++) world.step(new Map());
  const text = overlayText(world, 59.6);
  expect(text).toContain('vehicle  rv   course test');
  expect(text).toContain('tick     60   fps 60');
  expect(text).toContain('km/h');
  expect(text).toContain('wheels   road road road road');
});

test('shows air for a wheel with no ground under it', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  expect(overlayText(world, 60)).toContain('wheels   air air air air');
});
