import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { vec3, type Vec3 } from './math';
import type { VehicleId } from './vehicles';
import { createWorld, type World, type WorldEvent } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const worlds: World[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

const input = (fields: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });
const make = (vehicleId: VehicleId = 'lodgy'): World => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId });
  worlds.push(world);
  world.addPlayer('p1');
  return world;
};
const coin = (world: World): Vec3 => world.course.coins.find((candidate) => candidate.id === 'coin-1')!.pose.pos;
const coinEvents = (events: WorldEvent[]) => events.filter((event) => event.kind === 'coin');

// Parks the vehicle so the coin lies at its centre, at rest.
function parkOnCoin(world: World) {
  const body = world.debugBody('vehicle')!;
  const c = coin(world);
  body.setTranslation({ x: c.x, y: c.y, z: c.z }, true);
  body.setLinvel(vec3(0, 0, 0), true);
  body.setAngvel(vec3(0, 0, 0), true);
}

describe('step 38: coins only on foot', () => {
  test('a player on foot beside the vehicle collects the coin', () => {
    const world = make();
    const c = coin(world);
    world.teleportPlayer('p1', vec3(c.x, 0.02, c.z));
    expect(coinEvents(world.step(new Map()))).toHaveLength(1);
  });

  test('a player inside the vehicle bounds does not collect, even with the coin at the centre', () => {
    for (const id of ['lodgy', 'rv'] as const) {
      const world = make(id);
      parkOnCoin(world);
      const c = coin(world);
      world.teleportPlayer('p1', vec3(c.x, c.y - 0.2, c.z));
      const events: WorldEvent[] = [];
      for (let i = 0; i < 20; i++) events.push(...world.step(new Map()));
      expect(coinEvents(events)).toEqual([]);
      expect(world.snapshot().wallet).toBe(0);
    }
  });

  test('a seated player does not collect while the vehicle drives through the coin', () => {
    const world = make();
    world.step(new Map([['p1', input({ interact: true })]]));
    world.step(new Map());
    expect(world.snapshot().players[0]!.seat).not.toBeNull();
    parkOnCoin(world);
    const events: WorldEvent[] = [];
    for (let i = 0; i < 10; i++) events.push(...world.step(new Map()));
    expect(coinEvents(events)).toEqual([]);
  });

  test('a downed player does not collect', () => {
    const world = make();
    const c = coin(world);
    world.addPlayer('p2');
    world.debugHurt('p1', 100);
    world.step(new Map());
    expect(world.snapshot().players.find((p) => p.playerId === 'p1')!.downed).not.toBeNull();
    world.teleportPlayer('p1', vec3(c.x, 0.02, c.z));
    expect(coinEvents(world.step(new Map()))).toEqual([]);
  });
});
