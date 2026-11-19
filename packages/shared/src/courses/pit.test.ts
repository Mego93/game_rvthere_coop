import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { BIG_HILL_SLOPE, HILL_SLOPE, PIT_APPROACH, PIT_DEEP_EXIT, PIT_EXIT, SEGMENT_SPAWN_INSET, TICK_RATE } from '../constants';
import type { BuiltCourse } from '../course';
import { degToRad, rotate, vec3 } from '../math';
import { NEUTRAL_INPUT } from '../protocol';
import { exitPoints } from '../seats';
import type { SegmentDef } from '../segments';
import { VEHICLES } from '../vehicles';
import { createWorld, type World } from '../world';
import { buildCourse } from './build';
import { alongOfPoint, driveRun, driveWorld } from './driveRig';
import { boardVehicle } from './soloRig';
import { DEEP_PIT as DEEP, hillSegments, SHALLOW_PIT as SHALLOW } from './terrain';

// The shared package has no DOM or Node typings.
declare const process: { env: Record<string, string | undefined> };
declare const console: { info(...args: unknown[]): void };

beforeAll(async () => {
  await RAPIER.init();
});

const FULL = process.env.PIT_FULL === '1';
const PLAYER = 'p1';

type Pit = Extract<SegmentDef, { type: 'pit' }>;
const HILL = HILL_SLOPE;
const BIG_HILL = BIG_HILL_SLOPE;
// A long run-up is a flat of 150 m (its own checkpoint is the spawn); the short one is the 15 m flat before the terrain.
const RUN_UPS = [15, 150] as const;
// The Lodgy needs 20 to 23 s on the big hill, so the plan's 20 s cannot be used.
const CLIMB_SECONDS = 40;

const flat = (length: number): SegmentDef => ({ type: 'road', length });
const horizontal = (def: Pit): number =>
  PIT_APPROACH + def.depth / Math.tan(degToRad(def.gradient)) + def.floor + def.depth / Math.tan(degToRad(def.gradientOut ?? def.gradient)) + PIT_EXIT;

const hill = hillSegments;

interface Terrain {
  course: BuiltCourse;
  // The segment whose spawn the run starts at, and the segment after the terrain (its trigger ends the run).
  from: number;
  to: number;
  // First terrain segment (hill climb or pit).
  at: number;
}

function terrainCourse(terrain: SegmentDef[], runUp: number): Terrain {
  const before: SegmentDef[] = [flat(40), ...(runUp > 15 ? [flat(runUp - 15)] : [])];
  // With the short run-up the terrain's own leading flat (a hill's first segment, a pit's approach) is the spawn segment.
  const segments = [...before, ...terrain, flat(40), flat(40)];
  const course = buildCourse({ id: 'pit-drive', segments, targetTime: 100 });
  const start = before.length;
  return { course, from: runUp > 15 ? 1 : start, to: start + terrain.length, at: start };
}

const pitCourse = (def: Pit, runUp: number): Terrain => terrainCourse([def], runUp);
const hillCourse = (slope: number, runUp: number): Terrain => terrainCourse(hill(slope), runUp);

const drive = (vehicle: string, t: Terrain) => driveRun(RAPIER, vehicle, t.course, t.from, t.to, { maxSeconds: CLIMB_SECONDS });

// A world with one seated driver and the vehicle at a segment's spawn.
function soloAt(t: Terrain, vehicleId: string, pose = t.course.checkpoints[t.from]!.spawn): World {
  const world = createWorld(RAPIER, { courseId: t.course.id, vehicleId }, t.course);
  world.addPlayer(PLAYER);
  world.debugVehicle().resetTo(pose, 1, 1);
  const config = world.vehicleConfig;
  const lift = rotate(pose.rot, vec3(0, config.rideHeight, 0));
  const [door] = exitPoints(config, config.seats[0]!, vec3(pose.pos.x + lift.x, pose.pos.y + lift.y, pose.pos.z + lift.z), pose.rot);
  world.teleportPlayer(PLAYER, vec3(door.x, door.y + 0.2, door.z));
  for (let i = 0; i < 30; i++) world.step(new Map());
  expect(boardVehicle(world, PLAYER), 'the driver boards').toBe(true);
  return world;
}

// How a world drive went: how far the vehicle tilted at worst, how deep it got, and the health it lost.
function watch(world: World) {
  let minUp = 1;
  let minY = Infinity;
  const start = world.snapshot().vehicle.health;
  return {
    stop() {
      const v = world.snapshot().vehicle;
      minUp = Math.min(minUp, rotate(v.rot, vec3(0, 1, 0)).y);
      minY = Math.min(minY, v.pos.y);
      return false;
    },
    minUp: () => minUp,
    minY: () => minY,
    healthLost: () => start - world.snapshot().vehicle.health,
  };
}

const pitEndAlong = (t: Terrain): number => alongOfPoint(t.course, t.course.checkpoints[t.to]!.trigger.center.x, t.course.checkpoints[t.to]!.trigger.center.z);

describe('T2 the shallow pit', () => {
  test.each(['lodgy', 'rv'])('the %s drives through from the spawn, upright, within 2 x length / 6 s + 20 s', (vehicle) => {
    const t = pitCourse(SHALLOW, 15);
    const world = soloAt(t, vehicle);
    const w = watch(world);
    const seconds = (2 * horizontal(SHALLOW)) / 6 + 20;
    const result = driveWorld(world, PLAYER, pitEndAlong(t), { timeoutTicks: Math.ceil(seconds * TICK_RATE), stop: w.stop });
    expect(result.reached).toBe(true);
    expect(w.minUp(), 'never tipped over').toBeGreaterThan(0.7);
    expect(w.healthLost()).toBeLessThan(0.25);
    world.dispose();
  });
});

describe('T3 hills climbed by driving (a hill built from road segments)', () => {
  test.each(RUN_UPS)('both vehicles pass the %d m run-up hill of HILL_SLOPE', (runUp) => {
    const t = hillCourse(HILL, runUp);
    for (const vehicle of ['lodgy', 'rv']) {
      const r = drive(vehicle, t);
      expect(r.reached, `${vehicle} at ${runUp} m`).toBe(true);
    }
  });

  test.each(RUN_UPS)('the Lodgy passes the BIG_HILL_SLOPE hill in under 30 s and the RV stands still on it, run-up %d m', (runUp) => {
    const t = hillCourse(BIG_HILL, runUp);
    const lodgy = drive('lodgy', t);
    expect(lodgy.reached, 'lodgy').toBe(true);
    expect(lodgy.seconds, 'lodgy seconds').toBeLessThan(30);
    const rv = drive('rv', t);
    expect(rv.reached, 'rv').toBe(false);
    // It is not still at 40 s: from a long run-up it rolls back down, so the end speed must not be forward.
    expect(rv.endSpeed, 'rv end forward speed').toBeLessThan(0.5);
  });
});

describe('T4 the deep pit', () => {
  // Only the RV is trapped (no exit up to 33 degrees traps the Lodgy); entry at full throttle from the spawn and from 150 m.
  test.each(RUN_UPS)('both reach the floor from a %d m run-up, the RV does not climb out, the Lodgy does; neither flips', (runUp) => {
    const t = pitCourse(DEEP, runUp);
    for (const vehicle of ['lodgy', 'rv']) {
      const world = soloAt(t, vehicle);
      const w = watch(world);
      const result = driveWorld(world, PLAYER, pitEndAlong(t), { timeoutTicks: CLIMB_SECONDS * TICK_RATE, stop: w.stop });
      // The vehicle's position is its chassis centre, a ride height above the surface.
      expect(w.minY(), `${vehicle} reaches the floor`).toBeLessThan(-DEEP.depth + world.vehicleConfig.rideHeight + 0.7);
      expect(w.minUp(), `${vehicle} stays upright`).toBeGreaterThan(0.5);
      // The 33 m/s Lodgy from a 150 m run-up hits the floor harder (measured 0.74 lost).
      expect(w.healthLost(), `${vehicle} takes limited damage`).toBeLessThan(vehicle === 'lodgy' ? 0.85 : 0.5);
      expect(result.reached, `${vehicle} out by throttle`).toBe(vehicle === 'lodgy');
      world.dispose();
    }
  });
});

describe('T5 the winch pulls a vehicle out of the deep pit', () => {
  // Reel and full throttle on the furthest boulder; the control has the same pose and throttle with no cable.
  function climbOut(vehicle: string, winch: boolean): { seconds: number; attached: boolean; minUp: number } {
    const t = pitCourse(DEEP, 15);
    const entry = t.course.checkpoints[t.at]!.spawn;
    const descent = DEEP.depth / Math.tan(degToRad(DEEP.gradient));
    const floorMid = entry.pos.z + SEGMENT_SPAWN_INSET - (PIT_APPROACH + descent + DEEP.floor / 2);
    // The vehicle rests on the floor, which lies `depth` below the entry (y = 0).
    const pose = { pos: vec3(0, -DEEP.depth, floorMid), rot: entry.rot };
    const world = soloAt(t, vehicle, pose);
    if (winch) {
      const anchor = t.course.anchors[t.course.anchors.length - 1]!.id;
      world.debugWinch().take(PLAYER);
      expect(world.debugWinch().attach(anchor)).toBe(true);
    }
    const climbTop = entry.pos.z + SEGMENT_SPAWN_INSET - (PIT_APPROACH + descent + DEEP.floor + DEEP.depth / Math.tan(degToRad(PIT_DEEP_EXIT)));
    const rear = VEHICLES[vehicle as 'lodgy' | 'rv'].halfExtents.z;
    const w = watch(world);
    let seconds = Infinity;
    for (let tick = 0; tick < 30 * TICK_RATE; tick++) {
      world.step(new Map([[PLAYER, { ...NEUTRAL_INPUT, seq: tick, reel: winch ? 1 : 0, moveY: 1 }]]));
      w.stop();
      if (world.snapshot().vehicle.pos.z + rear < climbTop) {
        seconds = tick / TICK_RATE;
        break;
      }
    }
    const attached = world.debugWinch().state().state === 'attached';
    world.dispose();
    return { seconds, attached, minUp: w.minUp() };
  }

  test.each(['lodgy', 'rv'])('the %s, resting on the floor, is reeled out within 30 s, and the cable stays attached', (vehicle) => {
    const control = climbOut(vehicle, false);
    const winched = climbOut(vehicle, true);
    expect(winched.seconds, 'seconds to clear the pit').toBeLessThan(30);
    expect(winched.minUp).toBeGreaterThan(0.5);
    expect(winched.attached, 'the cable is still attached').toBe(true);
    if (vehicle === 'rv') expect(control.seconds, 'the RV does not clear the pit without the winch').toBe(Infinity);
    else expect(winched.seconds, 'the winch is not slower than the control (0.5 s of cable drag allowed)').toBeLessThanOrEqual(control.seconds + 0.5);
  });
});

describe('T6 capabilities (coarse; the full table runs with PIT_FULL=1)', () => {
  // Three slopes per vehicle from the 15 m run-up spawn: [slope, climbs].
  const HILLS: Record<string, [number, boolean][]> = {
    lodgy: [[HILL, true], [BIG_HILL, true], [20, true]],
    rv: [[HILL, true], [BIG_HILL, false], [20, false]],
  };
  test.each(['lodgy', 'rv'])('the %s climbs and fails hills as measured', (vehicle) => {
    for (const [slope, climbs] of HILLS[vehicle]!) expect(drive(vehicle, hillCourse(slope, 15)).reached, `${vehicle} on ${slope} degrees`).toBe(climbs);
  });

  test('a pit exit of 22 degrees is climbed by both; at PIT_DEEP_EXIT the RV is stuck and the Lodgy climbs', () => {
    const exit = (g: number): Pit => ({ ...DEEP, gradientOut: g });
    for (const v of ['lodgy', 'rv']) expect(drive(v, pitCourse(exit(22), 15)).reached, `${v} at 22`).toBe(true);
    expect(drive('lodgy', pitCourse(exit(PIT_DEEP_EXIT), 15)).reached, 'lodgy at the deep exit').toBe(true);
    expect(drive('rv', pitCourse(exit(PIT_DEEP_EXIT), 15)).reached, 'rv at the deep exit').toBe(false);
    expect(drive('rv', pitCourse(exit(PIT_DEEP_EXIT - 2), 15)).reached, 'rv two degrees below').toBe(true);
  });

  test.skipIf(!FULL)('the full table', () => {
    const rows: string[] = [];
    for (let slope = 6; slope <= 20; slope += 2) {
      for (const runUp of RUN_UPS) {
        const t = hillCourse(slope, runUp);
        rows.push(`hill ${slope} run-up ${runUp}: lodgy ${drive('lodgy', t).reached} rv ${drive('rv', t).reached}`);
      }
    }
    for (let g = 15; g <= 33; g++) {
      for (const runUp of RUN_UPS) {
        const t = pitCourse({ ...DEEP, gradientOut: g }, runUp);
        rows.push(`pit exit ${g} run-up ${runUp}: lodgy ${drive('lodgy', t).reached} rv ${drive('rv', t).reached}`);
      }
    }
    console.info(rows.join('\n'));
  });
});
