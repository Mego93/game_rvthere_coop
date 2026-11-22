import { TICK_DT, TICK_RATE } from '../constants';
import type { Box, BuiltCourse } from '../course';
import { rotate, vec3, type Quat, type Vec3 } from '../math';
import { NEUTRAL_INPUT, type InputFields } from '../protocol';
import type { World, WorldEvent } from '../world';
import type { Rapier } from '../rapier';
import { createRig } from '../testRig';
import { getVehicleConfig, type VehicleId } from '../vehicles';

export interface DriveTrace {
  t: number;
  speed: number;
  fuel: number;
}

export interface DriveResult {
  reached: boolean;
  seconds: number;
  endSpeed: number;
  // The lowest the vehicle's centre went: a run that falls below the course's kill plane would have restarted.
  minY: number;
  // Seconds of each flight: a run of ticks with no wheel on the ground.
  air: number[];
  trace: DriveTrace[];
}

export const LOOKAHEAD = 12;
export const STEER_GAIN = 1.5;
export const STEER_MAX = 1;
const TRACE_EVERY = Math.round(TICK_RATE / 2);

export const timeLimit = (routeLength: number, maxSpeed: number): number => 15 + routeLength / (0.3 * maxSpeed);

const conjugate = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

export function insideBox(box: Box, p: Vec3): boolean {
  const local = rotate(conjugate(box.rot), vec3(p.x - box.center.x, p.y - box.center.y, p.z - box.center.z));
  return Math.abs(local.x) <= box.halfExtents.x && Math.abs(local.y) <= box.halfExtents.y && Math.abs(local.z) <= box.halfExtents.z;
}

// Route vertex index where each segment starts, then the end of the route.
export function segmentStarts(course: BuiltCourse): number[] {
  const starts = course.checkpoints.map((cp) => {
    let best = 0;
    let bestGap = Infinity;
    course.route.forEach(([x, z], i) => {
      const gap = Math.hypot(cp.trigger.center.x - x, cp.trigger.center.z - z);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    });
    return best;
  });
  return [...starts, course.route.length - 1];
}

export function segmentRouteLength(course: BuiltCourse, segmentIndex: number): number {
  const starts = segmentStarts(course);
  let length = 0;
  for (let i = starts[segmentIndex]! + 1; i <= starts[segmentIndex + 1]!; i++) {
    const [x0, z0] = course.route[i - 1]!;
    const [x1, z1] = course.route[i]!;
    length += Math.hypot(x1 - x0, z1 - z0);
  }
  return length;
}

// Where the vehicle is on the route: the leg it is on and the fraction along it. Only moves forward.
export interface Progress {
  leg: number;
  t: number;
}

export function project(route: BuiltCourse['route'], from: Progress, x: number, z: number): Progress {
  let best = from;
  let bestGap = Infinity;
  for (let leg = from.leg; leg < Math.min(route.length - 1, from.leg + 3); leg++) {
    const [x0, z0] = route[leg]!;
    const [x1, z1] = route[leg + 1]!;
    const len2 = (x1 - x0) ** 2 + (z1 - z0) ** 2;
    let t = ((x - x0) * (x1 - x0) + (z - z0) * (z1 - z0)) / len2;
    t = Math.max(leg === from.leg ? from.t : 0, Math.min(1, t));
    const gap = Math.hypot(x0 + (x1 - x0) * t - x, z0 + (z1 - z0) * t - z);
    if (gap < bestGap) {
      bestGap = gap;
      best = { leg, t };
    }
  }
  return best;
}

// The point `distance` metres along the route from a progress.
export function lookaheadPoint(route: BuiltCourse['route'], at: Progress, distance: number): [number, number] {
  let remaining = distance;
  for (let leg = at.leg; leg < route.length - 1; leg++) {
    const [x0, z0] = route[leg]!;
    const [x1, z1] = route[leg + 1]!;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const start = leg === at.leg ? at.t * len : 0;
    if (len - start >= remaining) {
      const u = (start + remaining) / len;
      return [x0 + (x1 - x0) * u, z0 + (z1 - z0) * u];
    }
    remaining -= len - start;
  }
  return route[route.length - 1]!;
}

// Pure pursuit over the course route, full throttle, from a checkpoint's spawn to a later checkpoint's trigger (or the finish).
export function driveRun(
  rapier: Rapier,
  vehicleId: string,
  course: BuiltCourse,
  fromSegment: number,
  toSegment: number | 'finish',
  opts: { fuel?: number; maxSeconds?: number } = {},
): DriveResult {
  const config = getVehicleConfig(vehicleId as VehicleId);
  const spawn = course.checkpoints[fromSegment]!.spawn;
  const target = toSegment === 'finish' ? course.finish : course.checkpoints[toSegment]!.trigger;
  const end = toSegment === 'finish' ? course.checkpoints.length : toSegment;
  let limit = 0;
  for (let s = fromSegment; s < end; s++) limit += timeLimit(segmentRouteLength(course, s), config.maxSpeed);
  const maxSeconds = opts.maxSeconds ?? limit;

  const rig = createRig(rapier, vehicleId as VehicleId, spawn, course);
  rig.vehicle.resetTo(spawn, opts.fuel ?? 1, 1);
  const route = course.route;
  let progress: Progress = { leg: segmentStarts(course)[fromSegment]!, t: 0 };
  const trace: DriveTrace[] = [];
  let minY = Infinity;
  const air: number[] = [];
  let flying = 0;
  const maxTicks = Math.ceil(maxSeconds * TICK_RATE);
  for (let tick = 0; tick <= maxTicks; tick++) {
    const state = rig.vehicle.state();
    minY = Math.min(minY, state.pos.y);
    if (rig.vehicle.wheelSurfaces().every((surface) => surface === null)) flying++;
    else if (flying > 0) {
      air.push(flying * TICK_DT);
      flying = 0;
    }
    if (tick % TRACE_EVERY === 0) trace.push({ t: tick * TICK_DT, speed: rig.vehicle.forwardSpeed(), fuel: state.fuel });
    if (insideBox(target, state.pos)) return { reached: true, seconds: tick * TICK_DT, endSpeed: rig.vehicle.forwardSpeed(), minY, air, trace };
    if (tick === maxTicks) break;
    progress = project(route, progress, state.pos.x, state.pos.z);
    const [tx, tz] = lookaheadPoint(route, progress, LOOKAHEAD);
    const f = rotate(state.rot, vec3(0, 0, -1));
    const dx = tx - state.pos.x;
    const dz = tz - state.pos.z;
    const error = Math.atan2(f.x * dz - f.z * dx, f.x * dx + f.z * dz);
    rig.run(TICK_DT, { throttle: 1, steer: Math.max(-STEER_MAX, Math.min(STEER_MAX, STEER_GAIN * error)) });
  }
  return { reached: false, seconds: maxTicks * TICK_DT, endSpeed: rig.vehicle.forwardSpeed(), minY, air, trace };
}

export function driveSegment(rapier: Rapier, vehicleId: string, course: BuiltCourse, segmentIndex: number, opts: { fuel?: number } = {}): DriveResult {
  const last = segmentIndex === course.checkpoints.length - 1;
  return driveRun(rapier, vehicleId, course, segmentIndex, last ? 'finish' : segmentIndex + 1, opts);
}

const cumulativeCache = new WeakMap<BuiltCourse, number[]>();
const progressOf = new WeakMap<World, Progress>();

function cumulative(course: BuiltCourse): number[] {
  let table = cumulativeCache.get(course);
  if (!table) {
    table = [0];
    for (let i = 1; i < course.route.length; i++) {
      const [x0, z0] = course.route[i - 1]!;
      const [x1, z1] = course.route[i]!;
      table.push(table[i - 1]! + Math.hypot(x1 - x0, z1 - z0));
    }
    cumulativeCache.set(course, table);
  }
  return table;
}

// Metres along the whole route from its start.
export function alongOf(course: BuiltCourse, progress: Progress): number {
  const table = cumulative(course);
  const [x0, z0] = course.route[progress.leg]!;
  const [x1, z1] = course.route[progress.leg + 1]!;
  return table[progress.leg]! + progress.t * Math.hypot(x1 - x0, z1 - z0);
}

function nearestProgress(course: BuiltCourse, x: number, z: number): Progress {
  let best: Progress = { leg: 0, t: 0 };
  let bestGap = Infinity;
  for (let leg = 0; leg < course.route.length - 1; leg++) {
    const [x0, z0] = course.route[leg]!;
    const [x1, z1] = course.route[leg + 1]!;
    const len2 = (x1 - x0) ** 2 + (z1 - z0) ** 2;
    const t = Math.max(0, Math.min(1, ((x - x0) * (x1 - x0) + (z - z0) * (z1 - z0)) / len2));
    const gap = Math.hypot(x0 + (x1 - x0) * t - x, z0 + (z1 - z0) * t - z);
    if (gap < bestGap) {
      bestGap = gap;
      best = { leg, t };
    }
  }
  return best;
}

// Metres along the whole route of the route point nearest to (x, z).
export function alongOfPoint(course: BuiltCourse, x: number, z: number): number {
  return alongOf(course, nearestProgress(course, x, z));
}

export interface WorldDriveResult {
  reached: boolean;
  ticks: number;
  along: number;
}

// A seated driver follows the route with the pursuit controller through a real world until the vehicle is `untilAlong` metres along the whole route.
// `others` is held for every other player each tick. The route progress is kept per world; `restart` finds it afresh (after a teleport).
export function driveWorld(
  world: World,
  playerId: string,
  untilAlong: number,
  opts: { timeoutTicks?: number; others?: ReadonlyMap<string, InputFields>; restart?: boolean; stop?: () => boolean; events?: WorldEvent[] } = {},
): WorldDriveResult {
  const course = world.course;
  const timeoutTicks = opts.timeoutTicks ?? 120 * TICK_RATE;
  let pos = world.snapshot().vehicle.pos;
  let progress = !opts.restart && progressOf.get(world) ? progressOf.get(world)! : nearestProgress(course, pos.x, pos.z);
  for (let tick = 0; ; tick++) {
    const along = alongOf(course, progress);
    if (along >= untilAlong || world.status().state === 'won') return { reached: true, ticks: tick, along };
    if (tick >= timeoutTicks || opts.stop?.()) return { reached: false, ticks: tick, along };
    const { pos: p, rot } = world.snapshot().vehicle;
    pos = p;
    progress = project(course.route, progress, pos.x, pos.z);
    progressOf.set(world, progress);
    const [tx, tz] = lookaheadPoint(course.route, progress, LOOKAHEAD);
    const f = rotate(rot, vec3(0, 0, -1));
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    const error = Math.atan2(f.x * dz - f.z * dx, f.x * dx + f.z * dz);
    const inputs = new Map<string, InputFields>(opts.others);
    inputs.set(playerId, { ...NEUTRAL_INPUT, moveY: 1, moveX: Math.max(-STEER_MAX, Math.min(STEER_MAX, STEER_GAIN * error)) });
    const stepped = world.step(inputs);
    if (opts.events) opts.events.push(...stepped);
  }
}
