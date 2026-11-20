import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { BRIDGE_ABUTMENT, BRIDGE_BANK_RUN, PIT_DEEP_EXIT, PIT_EXIT, PLAYER_KILL_RESPAWN_DELAY, TICK_RATE, WATER_DEPTH_BELOW_ROAD } from '../constants';
import { routeFrame } from '../corridor';
import { degToRad, vec3 } from '../math';
import type { SegmentDef } from '../segments';
import type { VehicleId } from '../vehicles';
import { belowWater } from '../water';
import { createWorld, type World } from '../world';
import { buildCourse } from './build';
import { DEEP_PIT } from './terrain';

beforeAll(async () => {
  await RAPIER.init();
});

const road = (length: number): SegmentDef => ({ type: 'road', length });
const course = buildCourse({ id: 'water-test', segments: [road(80), { type: 'bridge', length: 60 }, road(40), { type: 'bridge', length: 80, broken: true }, road(80)], targetTime: 100, corridor: true });
const frame = routeFrame(course);
const [intact, broken] = course.ravines as [{ from: number; to: number }, { from: number; to: number }];
const spawn = course.checkpoints[0]!.spawn;

// A point beside the route at `lateral`, `height` above the route height there.
function beside(along: number, lateral: number, height: number) {
  const c = frame.pointAt(along);
  return vec3(c.x - c.tz * lateral, frame.heightAtAlong(along) + height, c.z + c.tx * lateral);
}

function worldWith(vehicleId: VehicleId): World {
  const world = createWorld(RAPIER, { courseId: course.id, vehicleId }, course);
  world.addPlayer('p1');
  return world;
}

describe('belowWater', () => {
  test('is true only inside a ravine span and below the water surface', () => {
    const mid = (intact.from + intact.to) / 2;
    expect(belowWater(course, beside(mid, 12, -WATER_DEPTH_BELOW_ROAD - 0.1))).toBe(true);
    expect(belowWater(course, beside(mid, 12, -WATER_DEPTH_BELOW_ROAD + 0.1))).toBe(false);
    expect(belowWater(course, beside(intact.from - 20, 12, -WATER_DEPTH_BELOW_ROAD - 3))).toBe(false);
    expect(belowWater(course, beside(intact.to + 10, 0, -50))).toBe(false);
  });

  test('the broken bridge pit floor is above the water', () => {
    const along = broken.from + 50 - 10;
    expect(belowWater(course, beside(along, 0, 0))).toBe(false);
  });
});

describe.each(['lodgy', 'rv'] as VehicleId[])('the %s and the ravine', (vehicleId) => {
  test('dropped into the ravine beside a bridge, it is lost and restarted at the checkpoint', () => {
    const world = worldWith(vehicleId);
    const mid = (intact.from + intact.to) / 2;
    const pose = { pos: beside(mid, 12, 1.5), rot: spawn.rot };
    world.debugVehicle().resetTo(pose, 1, 1);
    expect(world.status().restarts).toBe(0);
    for (let i = 0; i < 8 * TICK_RATE && world.status().restarts === 0; i++) world.step(new Map());
    expect(world.status().restarts).toBe(1);
    world.dispose();
  });

  test('resting on the floor of the broken bridge pit, it is not lost', () => {
    const world = worldWith(vehicleId);
    const gradientOut = DEEP_PIT.gradientOut ?? PIT_DEEP_EXIT;
    const core = DEEP_PIT.depth / Math.tan(degToRad(DEEP_PIT.gradient)) + DEEP_PIT.floor + DEEP_PIT.depth / Math.tan(degToRad(gradientOut));
    const approach = broken.to - broken.from - core - PIT_EXIT;
    const floorMid = broken.from + approach + DEEP_PIT.depth / Math.tan(degToRad(DEEP_PIT.gradient)) + DEEP_PIT.floor / 2;
    const at = beside(floorMid, 0, 0);
    world.debugVehicle().resetTo({ pos: at, rot: course.checkpoints[3]!.spawn.rot }, 1, 1);
    for (let i = 0; i < 6 * TICK_RATE; i++) world.step(new Map());
    expect(world.status().restarts).toBe(0);
    expect(world.snapshot().vehicle.pos.y).toBeLessThan(0);
    world.dispose();
  });
});

describe('a player and the ravine', () => {
  test('dropped into the ravine, is respawned above it', () => {
    const world = worldWith('lodgy');
    const mid = (intact.from + intact.to) / 2;
    const at = beside(mid, 12, 1);
    world.teleportPlayer('p1', at);
    let lowest = Infinity;
    for (let i = 0; i < (PLAYER_KILL_RESPAWN_DELAY + 3) * TICK_RATE; i++) {
      world.step(new Map());
      lowest = Math.min(lowest, world.snapshot().players[0]!.pos.y);
    }
    expect(lowest).toBeLessThan(-WATER_DEPTH_BELOW_ROAD);
    expect(world.snapshot().players[0]!.pos.y).toBeGreaterThan(-1);
    world.dispose();
  });

  test('walking over the bridge deck is not a fall', () => {
    expect(BRIDGE_ABUTMENT + BRIDGE_BANK_RUN).toBeGreaterThan(0);
    const world = worldWith('lodgy');
    world.teleportPlayer('p1', beside((intact.from + intact.to) / 2, 0, 1));
    for (let i = 0; i < 6 * TICK_RATE; i++) world.step(new Map());
    expect(world.snapshot().players[0]!.pos.y).toBeGreaterThan(-1);
    world.dispose();
  });
});
