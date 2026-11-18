import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { ROAD_WIDTH, STOP_PAD_LIFT, TICK_DT, TICK_RATE } from '../constants';
import { routeFrame } from '../corridor';
import { rotate, vec3 } from '../math';
import { buildSegment, hazardSpan, yawQuat, type Hazard, type SegmentDef } from '../segments';
import { createRig } from '../testRig';
import { surfaceYAt } from '../surfaceHeight';
import { VEHICLES, type VehicleId } from '../vehicles';
import { buildCourse } from './build';
import { segmentStarts } from './driveRig';
import { getCourse, getCourseDef } from './index';

declare const console: { info(...args: unknown[]): void };
beforeAll(async () => {
  await RAPIER.init();
});

const START_SPEED = 12;
const course = getCourse('marrakech');
const def = getCourseDef('marrakech')!;
const frame = routeFrame(course);
const starts = segmentStarts(course);
type RoadDef = Extract<SegmentDef, { type: 'road' }>;

// Every hazard of a kind on marrakech with the along distance of its span on the route.
function placed<K extends Hazard['kind']>(kind: K): { index: number; hazard: Extract<Hazard, { kind: K }>; from: number; to: number }[] {
  return def.segments.flatMap((s, index) =>
    s.type === 'road' ? (s.hazards ?? []).flatMap((hazard) => (hazard.kind === kind ? [{ index, hazard: hazard as Extract<Hazard, { kind: K }>, from: frame.cum[starts[index]!]! + hazardSpan(hazard)[0], to: frame.cum[starts[index]!]! + hazardSpan(hazard)[1] }] : [])) : [],
  );
}

// Drives a vehicle with pure pursuit of the route from `from` m at 12 m/s until `until` m; returns the slowest speed and whether it got there.
function crossing(vehicleId: VehicleId, from: number, until: number, throttle: number): { reached: boolean; slowest: number; seconds: number; mudWheels: number } {
  const c = frame.pointAt(from);
  const y = surfaceYAt(course, c.x, c.z)!;
  const pose = { pos: vec3(c.x, y, c.z), rot: yawQuat(Math.atan2(-c.tx, -c.tz)) };
  const rig = createRig(RAPIER, vehicleId, pose, course);
  rig.vehicle.resetTo(pose, 1, 1);
  rig.vehicle.body.setLinvel(rotate(pose.rot, vec3(0, 0, -START_SPEED)), true);
  let slowest = Infinity;
  let mudWheels = 0;
  let tick = 0;
  let reached = false;
  for (; tick < 30 * TICK_RATE; tick++) {
    const state = rig.vehicle.state();
    const hit = frame.nearest(state.pos.x, state.pos.z);
    if (hit.along >= until) {
      reached = true;
      break;
    }
    if (tick > TICK_RATE) slowest = Math.min(slowest, rig.vehicle.forwardSpeed());
    mudWheels += rig.vehicle.wheelSurfaces().filter((s) => s === 'mud').length;
    const target = frame.pointAt(Math.min(frame.total, hit.along + 12));
    const f = rotate(state.rot, vec3(0, 0, -1));
    const dx = target.x - state.pos.x;
    const dz = target.z - state.pos.z;
    const error = Math.atan2(f.x * dz - f.z * dx, f.x * dx + f.z * dz);
    rig.run(TICK_DT, { throttle, steer: Math.max(-1, Math.min(1, 1.5 * error)) });
  }
  rig.world.free();
  return { reached, slowest, seconds: tick / TICK_RATE, mudWheels };
}

describe('plan test 6: mud', () => {
  const patches = placed('mud');

  test('marrakech has ten patches of 12, 16 and 20 m on straights', () => {
    expect(patches).toHaveLength(10);
    expect(patches.map((p) => p.hazard.length).sort((a, b) => a - b)).toEqual([12, 12, 12, 12, 16, 16, 16, 20, 20, 20]);
    for (const p of patches) {
      const s = def.segments[p.index] as RoadDef;
      expect(s.curve).toBeUndefined();
      expect(s.slope).toBeUndefined();
    }
  });

  test('the mud box tops are STOP_PAD_LIFT above the road, road wide, and the wheels report mud on a patch', () => {
    const p = patches[0]!;
    const middle = frame.pointAt((p.from + p.to) / 2);
    const edge = { x: middle.x - middle.tz * (ROAD_WIDTH / 2 - 0.1), z: middle.z + middle.tx * (ROAD_WIDTH / 2 - 0.1) };
    const before = frame.pointAt(p.from - 6);
    expect(surfaceYAt(course, edge.x, edge.z)! - surfaceYAt(course, before.x, before.z)!).toBeCloseTo(STOP_PAD_LIFT, 3);
    // The patch covers the shoulders too.
    const shoulder = { x: middle.x - middle.tz * 25, z: middle.z + middle.tx * 25 };
    const shoulderBefore = { x: before.x - before.tz * 25, z: before.z + before.tx * 25 };
    expect(surfaceYAt(course, shoulder.x, shoulder.z)! - surfaceYAt(course, shoulderBefore.x, shoulderBefore.z)!).toBeCloseTo(STOP_PAD_LIFT, 3);
    const run = crossing('lodgy', p.from - 15, p.to + 6, 0.5);
    expect(run.mudWheels).toBeGreaterThan(0);
  }, 60000);

  test.each(['lodgy', 'rv'] as const)('a straight 16 m patch at 12 m/s costs the %s at least 20 % of its speed (coasting)', (vehicleId) => {
    const road: SegmentDef = { type: 'road', length: 120 };
    const mud: SegmentDef = { type: 'road', length: 120, hazards: [{ kind: 'mud', along: 50, length: 16 }] };
    const speeds = [road, mud].map((segment) => {
      const built = buildCourse({ id: `mud-${vehicleId}`, segments: [segment, { type: 'road', length: 60 }], targetTime: 100 });
      const spawn = { pos: vec3(0, 0, -20), rot: yawQuat(0) };
      const rig = createRig(RAPIER, vehicleId, spawn, built);
      rig.vehicle.resetTo(spawn, 1, 1);
      rig.vehicle.body.setLinvel(vec3(0, 0, -START_SPEED), true);
      let entering = 0;
      let leaving = 0;
      for (let tick = 0; tick < 12 * TICK_RATE; tick++) {
        rig.run(TICK_DT, { throttle: 0 });
        const z = -rig.vehicle.state().pos.z;
        if (entering === 0 && z >= 50) entering = rig.vehicle.forwardSpeed();
        if (leaving === 0 && z >= 66) leaving = rig.vehicle.forwardSpeed();
      }
      rig.world.free();
      return { entering, leaving };
    });
    const lost = 1 - speeds[1]!.leaving / speeds[1]!.entering;
    const lostOnRoad = 1 - speeds[0]!.leaving / speeds[0]!.entering;
    console.info(`mud 16 m ${vehicleId}: entering ${speeds[1]!.entering.toFixed(2)} m/s, leaving ${speeds[1]!.leaving.toFixed(2)} m/s, lost ${(100 * lost).toFixed(1)} % (plain road ${(100 * lostOnRoad).toFixed(1)} %)`);
    expect(lost).toBeGreaterThanOrEqual(0.2);
    expect(lost).toBeGreaterThan(lostOnRoad + 0.1);
  }, 60000);

  describe.each(['lodgy', 'rv'] as const)('the %s from 12 m/s with the throttle open', (vehicleId) => {
    test.each(patches.map((p, n) => [n, p] as const))('patch %i is crossed without stopping', (_n, p) => {
      const run = crossing(vehicleId, p.from - 20, p.to + 10, 1);
      console.info(`mud ${vehicleId} segment ${p.index} (${p.hazard.length} m): slowest ${run.slowest.toFixed(1)} m/s, ${run.seconds.toFixed(1)} s`);
      expect(run.reached, `${vehicleId} segment ${p.index}`).toBe(true);
      expect(run.slowest).toBeGreaterThan(1);
    }, 60000);
  });
});

describe('plan test 7: rocks', () => {
  const groups = placed('rocks');
  const rv = VEHICLES.rv.halfExtents.x;

  test('marrakech has twelve groups, each leaving a lane of at least 2 x the RV half width + 1.2 m', () => {
    expect(groups).toHaveLength(12);
    for (const g of groups) {
      const walls = buildSegment(def.segments[g.index]!).walls;
      expect(walls).toHaveLength(2);
      const free = ROAD_WIDTH / 2 + Math.min(...walls.map((w) => Math.abs(w.center.x) - w.halfExtents.x));
      expect(free, `segment ${g.index}`).toBeGreaterThanOrEqual(2 * rv + 1.2);
      expect(course.anchors.filter((a) => a.id.startsWith(`s${g.index}-boulder-`))).toHaveLength(2);
    }
  });

  test.each(groups.map((g, n) => [n, g] as const))('the RV drives through group %i without stopping', (_n, g) => {
    const run = crossing('rv', g.from - 25, g.to + 10, 1);
    console.info(`rocks rv segment ${g.index}: slowest ${run.slowest.toFixed(1)} m/s, ${run.seconds.toFixed(1)} s`);
    expect(run.reached, `segment ${g.index}`).toBe(true);
    expect(run.slowest).toBeGreaterThan(1);
  }, 60000);
});
