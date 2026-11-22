import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { TICK_RATE } from '../constants';
import { rotate, vec3 } from '../math';
import { exitPoints } from '../seats';
import { createWorld } from '../world';
import { AGAFAY_SEGMENTS, AGAFAY_TARGET_TIME } from './agafay';
import { driveRun, driveWorld } from './driveRig';
import { courseIds, getCourse, getCourseDef, segmentRanges } from './index';
import { boardVehicle } from './soloRig';

beforeAll(async () => {
  await RAPIER.init();
});

describe('agafay', () => {
  const def = getCourseDef('agafay')!;
  const course = getCourse('agafay');

  test('builds, is story-only and has no fuel stops', () => {
    expect(course.id).toBe('agafay');
    expect(def.theme).toBe('desert');
    expect(def.label).toBe('Agafay');
    expect(courseIds()).not.toContain('agafay');
    expect(course.stops).toEqual([]);
    expect(AGAFAY_SEGMENTS.some((s) => s.stop)).toBe(false);
  });

  test('is 3.5 to 4 km long, with dirt and sand, rocks, mud and two tight turns', () => {
    const ranges = segmentRanges(def);
    const length = ranges[ranges.length - 1]!.to;
    expect(length).toBeGreaterThanOrEqual(3500);
    expect(length).toBeLessThanOrEqual(4000);
    expect(AGAFAY_SEGMENTS.some((s) => s.type === 'road' && s.surface === 'dirt')).toBe(true);
    expect(AGAFAY_SEGMENTS.some((s) => s.type === 'sand')).toBe(true);
    const hazards = AGAFAY_SEGMENTS.flatMap((s) => (s.type === 'road' ? (s.hazards ?? []).map((h) => h.kind) : []));
    expect(hazards).toContain('rocks');
    expect(hazards).toContain('mud');
    // A turn is tight when it bends more than 1 rad inside 100 m.
    const tight = AGAFAY_SEGMENTS.filter((s) => s.type === 'road' && s.curve !== undefined && Math.abs(s.curve) > 1 && s.length <= 100);
    expect(tight).toHaveLength(2);
  });

  describe('driven by the scripted buggy', () => {
    let run: ReturnType<typeof driveRun>;
    beforeAll(() => {
      run = driveRun(RAPIER, 'buggy', course, 0, 'finish', { maxSeconds: 300 });
    }, 120_000);

    test('goes from start to finish with no kill-plane reset', () => {
      expect(run.reached).toBe(true);
      expect(run.minY).toBeGreaterThan(course.killPlaneY);
    });

    test('has a target time of the measured time x 1.3, rounded to 5 s, within 150 to 210 s', () => {
      expect(AGAFAY_TARGET_TIME).toBe(Math.round((run.seconds * 1.3) / 5) * 5);
      expect(course.targetTime).toBe(AGAFAY_TARGET_TIME);
      expect(AGAFAY_TARGET_TIME).toBeGreaterThanOrEqual(150);
      expect(AGAFAY_TARGET_TIME).toBeLessThanOrEqual(210);
    });

    test('has at least three crests where the buggy leaves the ground for over 0.2 s', () => {
      expect(run.air.filter((seconds) => seconds > 0.2).length).toBeGreaterThanOrEqual(3);
    });
  });

  test('a seated driver wins it in a world with no restart or respawn', () => {
    const world = createWorld(RAPIER, { courseId: 'agafay', vehicleId: 'buggy' }, course);
    world.addPlayer('p1');
    const at = course.checkpoints[0]!.spawn;
    world.debugVehicle().resetTo(at, 1, 1);
    const config = world.vehicleConfig;
    const lift = rotate(at.rot, vec3(0, config.rideHeight, 0));
    const [door] = exitPoints(config, config.seats[0]!, vec3(at.pos.x + lift.x, at.pos.y + lift.y, at.pos.z + lift.z), at.rot);
    world.teleportPlayer('p1', vec3(door.x, door.y + 0.2, door.z));
    for (let i = 0; i < 30; i++) world.step(new Map());
    expect(boardVehicle(world, 'p1')).toBe(true);
    const length = course.route.slice(1).reduce((sum, [x, z], i) => sum + Math.hypot(x - course.route[i]![0], z - course.route[i]![1]), 0);
    driveWorld(world, 'p1', length, { timeoutTicks: 200 * TICK_RATE });
    expect(world.status().state).toBe('won');
    expect(world.status().restarts).toBe(0);
    expect(world.status().respawns).toBe(0);
    world.dispose();
  }, 120_000);
});
