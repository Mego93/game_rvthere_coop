import RAPIER from '@dimforge/rapier3d-compat';
import { expect, test } from 'vitest';
import type { Rapier } from './rapier';

test('Rapier initialises and an empty world steps', async () => {
  await RAPIER.init();
  const rapier: Rapier = RAPIER;
  const world = new rapier.World({ x: 0, y: -9.81, z: 0 });
  world.step();
  expect(world.bodies.len()).toBe(0);
});
