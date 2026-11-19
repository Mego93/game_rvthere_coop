import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { BUMP_LENGTH, TICK_DT, TICK_RATE } from '../constants';
import { routeFrame } from '../corridor';
import { rotate, vec3 } from '../math';
import { yawQuat, type SegmentDef } from '../segments';
import { createRig } from '../testRig';
import { surfaceYAt } from '../surfaceHeight';
import type { VehicleId } from '../vehicles';
import { segmentStarts } from './driveRig';
import { getCourse, getCourseDef } from './index';

declare const console: { info(...args: unknown[]): void };
beforeAll(async () => {
  await RAPIER.init();
});

const START_SPEED = 12;
const MAX_AIRBORNE = 0.3;
const course = getCourse('marrakech');
const def = getCourseDef('marrakech')!;
const frame = routeFrame(course);
const starts = segmentStarts(course);
type RoadDef = Extract<SegmentDef, { type: 'road' }>;

// Contiguous dirt runs and every bumped segment, as along spans on the route.
const spans = (() => {
  const dirt: { from: number; to: number }[] = [];
  const bumps: { from: number; to: number }[] = [];
  def.segments.forEach((s, i) => {
    if (s.type !== 'road') return;
    const from = frame.cum[starts[i]!]!;
    const to = frame.cum[starts[i + 1] ?? frame.cum.length - 1]!;
    const last = dirt[dirt.length - 1];
    if ((s as RoadDef).surface === 'dirt') {
      if (last && Math.abs(last.to - from) < 1) last.to = to;
      else dirt.push({ from, to });
    }
    if ((s as RoadDef).bumps) bumps.push({ from, to });
  });
  return { dirt, bumps };
})();

function drive(vehicleId: VehicleId, from: number, until: number): { reached: boolean; slowest: number; airborne: number; dirtWheels: number } {
  const c = frame.pointAt(from);
  const pose = { pos: vec3(c.x, surfaceYAt(course, c.x, c.z)!, c.z), rot: yawQuat(Math.atan2(-c.tx, -c.tz)) };
  const rig = createRig(RAPIER, vehicleId, pose, course);
  rig.vehicle.resetTo(pose, 1, 1);
  rig.vehicle.body.setLinvel(rotate(pose.rot, vec3(0, 0, -START_SPEED)), true);
  let slowest = Infinity;
  let airborne = 0;
  let longest = 0;
  let dirtWheels = 0;
  let reached = false;
  for (let tick = 0; tick < 90 * TICK_RATE; tick++) {
    const state = rig.vehicle.state();
    const hit = frame.nearest(state.pos.x, state.pos.z);
    if (hit.along >= until) {
      reached = true;
      break;
    }
    if (tick > TICK_RATE) slowest = Math.min(slowest, rig.vehicle.forwardSpeed());
    const surfaces = rig.vehicle.wheelSurfaces();
    dirtWheels += surfaces.filter((s) => s === 'dirt').length;
    airborne = surfaces.every((s) => s === null) ? airborne + TICK_DT : 0;
    longest = Math.max(longest, airborne);
    const target = frame.pointAt(Math.min(frame.total, hit.along + 12));
    const f = rotate(state.rot, vec3(0, 0, -1));
    const dx = target.x - state.pos.x;
    const dz = target.z - state.pos.z;
    const error = Math.atan2(f.x * dz - f.z * dx, f.x * dx + f.z * dz);
    // Hold about 12 m/s so a downhill run does not build speed beyond the test's claim.
    const throttle = rig.vehicle.forwardSpeed() < START_SPEED ? 1 : 0;
    rig.run(TICK_DT, { throttle, steer: Math.max(-1, Math.min(1, 1.5 * error)) });
  }
  rig.world.free();
  return { reached, slowest, airborne: longest, dirtWheels };
}

describe('dirt runs and bumps of marrakech', () => {
  test('there are runs and bumps to drive', () => {
    expect(spans.dirt.length).toBeGreaterThan(5);
    expect(spans.bumps.length).toBeGreaterThan(10);
    expect(BUMP_LENGTH).toBeGreaterThan(0);
  });

  describe.each(['lodgy', 'rv'] as const)('the %s at 12 m/s', (vehicleId) => {
    test.each(spans.dirt.map((s, n) => [n, s] as const))('dirt run %i is crossed without stopping or leaving the ground', (_n, s) => {
      const run = drive(vehicleId, Math.max(0, s.from - 15), s.to + 5);
      console.info(`dirt ${vehicleId} ${s.from.toFixed(0)}-${s.to.toFixed(0)} m: slowest ${run.slowest.toFixed(1)}, airborne ${run.airborne.toFixed(2)} s`);
      expect(run.reached).toBe(true);
      expect(run.slowest).toBeGreaterThan(1);
      expect(run.airborne).toBeLessThanOrEqual(MAX_AIRBORNE);
      expect(run.dirtWheels).toBeGreaterThan(0);
    }, 120000);

    test.each(spans.bumps.map((s, n) => [n, s] as const))('bumped segment %i is crossed without stopping or leaving the ground', (_n, s) => {
      // From the segment start: the stretch before it may be a pit climb that stops an RV on its own.
      const run = drive(vehicleId, s.from + 2, s.to + 5);
      expect(run.reached).toBe(true);
      expect(run.slowest).toBeGreaterThan(1);
      expect(run.airborne).toBeLessThanOrEqual(MAX_AIRBORNE);
    }, 120000);
  });
});
