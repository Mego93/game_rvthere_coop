import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { PIT_APPROACH, PIT_DEEP_EXIT, PIT_EXIT, SEGMENT_SPAWN_INSET, TICK_RATE } from '../constants';
import { routeFrame } from '../corridor';
import { degToRad, rotate, vec3 } from '../math';
import { NEUTRAL_INPUT } from '../protocol';
import { exitPoints } from '../seats';
import { VEHICLES, type VehicleId } from '../vehicles';
import { createWorld, type World } from '../world';
import type { SegmentDef } from '../segments';
import { alongOfPoint, driveRun, driveSegment, driveWorld, timeLimit } from './driveRig';
import { getCourse, getCourseDef, segmentRanges } from './index';
import { boardVehicle } from './soloRig';
import { DEEP_PIT } from './terrain';

beforeAll(async () => {
  await RAPIER.init();
});

const PLAYER = 'p1';

function seated(courseId: string, vehicleId: VehicleId, pose?: { pos: ReturnType<typeof vec3>; rot: { x: number; y: number; z: number; w: number } }): World {
  const course = getCourse(courseId);
  const world = createWorld(RAPIER, { courseId, vehicleId }, course);
  world.addPlayer(PLAYER);
  const at = pose ?? course.checkpoints[0]!.spawn;
  world.debugVehicle().resetTo(at, 1, 1);
  const config = world.vehicleConfig;
  const lift = rotate(at.rot, vec3(0, config.rideHeight, 0));
  const [door] = exitPoints(config, config.seats[0]!, vec3(at.pos.x + lift.x, at.pos.y + lift.y, at.pos.z + lift.z), at.rot);
  world.teleportPlayer(PLAYER, vec3(door.x, door.y + 0.2, door.z));
  for (let i = 0; i < 30; i++) world.step(new Map());
  expect(boardVehicle(world, PLAYER), 'the driver boards').toBe(true);
  return world;
}

function driveWhole(courseId: string, vehicleId: VehicleId): { world: World; reached: boolean; seconds: number } {
  const course = getCourse(courseId);
  const world = seated(courseId, vehicleId);
  const total = course.route.slice(1).reduce((sum, [x, z], i) => sum + Math.hypot(x - course.route[i]![0], z - course.route[i]![1]), 0);
  const seconds = timeLimit(total, VEHICLES[vehicleId].maxSpeed);
  const result = driveWorld(world, PLAYER, total, { timeoutTicks: Math.ceil(seconds * TICK_RATE) });
  return { world, reached: result.reached, seconds };
}

// Gates, crate walls, roadblocks and roadworks need a driver on foot to open them; marrakech.drive.test.ts drives those segments.
const BLOCKING = new Set(['gates', 'crateWall', 'roadblock']);
const blocking = (s: SegmentDef): boolean => s.type === 'roadworks' || (s.type === 'road' && (s.hazards ?? []).some((h) => BLOCKING.has(h.kind)));

describe('desert, driven whole by the Lodgy', () => {
  test('finished within the time bound, with no restart or respawn', () => {
    const { world, reached, seconds } = driveWhole('desert', 'lodgy');
    expect(reached, `within ${seconds.toFixed(0)} s`).toBe(true);
    expect(world.status().state).toBe('won');
    expect(world.status().restarts).toBe(0);
    expect(world.status().respawns).toBe(0);
    world.dispose();
  }, 300_000);
});

describe.each(['desert', 'city', 'airport-road'])('%s, driven by the Lodgy segment by segment', (id) => {
  const course = getCourse(id);
  const def = getCourseDef(id)!;
  const driven = def.segments.map((s, i) => ({ s, i })).filter(({ s }) => !blocking(s));

  test('every segment without a blocking hazard is driven to the next checkpoint within the time bound', () => {
    expect(driven.length).toBeGreaterThan(def.segments.length / 2);
    const failed: string[] = [];
    for (const { i } of driven) {
      const result = driveSegment(RAPIER, 'lodgy', course, i);
      if (!result.reached) failed.push(`${i} (${def.segments[i]!.type}) after ${result.seconds.toFixed(0)} s`);
    }
    expect(failed).toEqual([]);
  }, 600_000);
});

describe('the valley', () => {
  const course = getCourse('valley');
  const def = getCourseDef('valley')!;
  const ranges = segmentRanges(def);
  const broken = def.segments.findIndex((s) => s.type === 'bridge' && s.broken);
  const frame = routeFrame(course);

  test('the Lodgy drives it from start to finish with no restart (it climbs the deep pit of the broken bridge by throttle, as in T4)', () => {
    const { world, reached } = driveWhole('valley', 'lodgy');
    expect(reached).toBe(true);
    expect(world.status().state).toBe('won');
    expect(world.status().restarts).toBe(0);
    expect(world.status().respawns).toBe(0);
    world.dispose();
  }, 300_000);

  test('the RV crosses the first bridge, and is stopped by the broken one without the winch', () => {
    const first = def.segments.findIndex((s) => s.type === 'bridge');
    const across = driveRun(RAPIER, 'rv', course, first - 1, first + 2);
    expect(across.reached, 'the RV crosses the first bridge').toBe(true);
    const stuck = driveRun(RAPIER, 'rv', course, broken - 1, broken + 1, { maxSeconds: 60 });
    expect(stuck.reached, 'the RV does not climb out of the broken bridge').toBe(false);
  }, 300_000);

  // The vehicle rests on the pit floor; reel and full throttle on the furthest boulder.
  function climbOut(vehicle: VehicleId, winch: boolean): { seconds: number; attached: boolean } {
    const from = ranges[broken]!.from;
    const gradient = DEEP_PIT.gradient;
    const gradientOut = DEEP_PIT.gradientOut ?? PIT_DEEP_EXIT;
    const descent = DEEP_PIT.depth / Math.tan(degToRad(gradient));
    const core = descent + DEEP_PIT.floor + DEEP_PIT.depth / Math.tan(degToRad(gradientOut));
    const approach = ranges[broken]!.to - from - core - PIT_EXIT;
    expect(approach).toBeGreaterThanOrEqual(PIT_APPROACH);
    const floorMid = from + approach + descent + DEEP_PIT.floor / 2;
    const climbTop = from + approach + core;
    const c = frame.pointAt(floorMid);
    const entry = course.checkpoints[broken]!.spawn;
    const world = seated('valley', vehicle, { pos: vec3(c.x, frame.heightAtAlong(from) - DEEP_PIT.depth, c.z), rot: entry.rot });
    if (winch) {
      const anchor = course.anchors.filter((a) => a.id.startsWith(`s${broken}-`)).pop()!.id;
      world.debugWinch().take(PLAYER);
      expect(world.debugWinch().attach(anchor)).toBe(true);
    }
    const rear = VEHICLES[vehicle].halfExtents.z;
    let seconds = Infinity;
    for (let tick = 0; tick < 30 * TICK_RATE; tick++) {
      world.step(new Map([[PLAYER, { ...NEUTRAL_INPUT, seq: tick, reel: winch ? 1 : 0, moveY: 1 }]]));
      const p = world.snapshot().vehicle.pos;
      if (alongOfPoint(course, p.x, p.z) - rear > climbTop) {
        seconds = tick / TICK_RATE;
        break;
      }
    }
    const attached = world.debugWinch().state().state === 'attached';
    world.dispose();
    return { seconds, attached };
  }

  test('the Lodgy is reeled out of the broken bridge by the winch within 30 s', () => {
    const winched = climbOut('lodgy', true);
    expect(winched.seconds).toBeLessThan(30);
    expect(winched.attached).toBe(true);
  }, 120_000);

  test('the RV, resting on the pit floor, is reeled out within 30 s and is stuck without the winch', () => {
    expect(climbOut('rv', false).seconds, 'no winch').toBe(Infinity);
    const winched = climbOut('rv', true);
    expect(winched.seconds, 'with the winch').toBeLessThan(30);
    expect(winched.attached).toBe(true);
  }, 120_000);
});
