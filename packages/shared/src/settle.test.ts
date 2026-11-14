import RAPIER from '@dimforge/rapier3d-compat';
import { describe, expect, test } from 'vitest';
import { vec3 } from './math';
import type { RapierWorld } from './rapier';
import { settleQueries } from './settle';

// A stand-in world whose rays miss until `blindSteps` steps have run.
const fake = (blindSteps: number) => {
  const world = { timestep: 1 / 60, steps: 0, rays: [] as number[], step: () => (world.steps += 1) };
  const castRay = () => {
    world.rays.push(world.timestep);
    return world.steps > blindSteps ? { timeOfImpact: 1 } : null;
  };
  return Object.assign(world, { castRay }) as unknown as RapierWorld & { steps: number; rays: number[] };
};
const run = (world: RapierWorld) => settleQueries(RAPIER, world, () => vec3(0, 1, 0), 1 / 30);

describe('settleQueries', () => {
  test('steps twice with a zero timestep when the probe sees the scene, then restores the tick', () => {
    const world = fake(0);
    run(world);
    expect(world.steps).toBe(2);
    expect(world.rays).toEqual([0]);
    expect(world.timestep).toBe(1 / 30);
  });

  test('steps once more when the probe misses after two steps', () => {
    const world = fake(2);
    run(world);
    expect(world.steps).toBe(3);
  });

  test('gives up after two extra steps and does not throw', () => {
    const world = fake(100);
    run(world);
    expect(world.steps).toBe(4);
    expect(world.timestep).toBe(1 / 30);
  });
});
