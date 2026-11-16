import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { PROP_KINDS, ROAD_MAX_PIECE_YAW, ROAD_PIECE_LENGTH, TICK_RATE } from '../constants';
import { rotate, vec3 } from '../math';
import type { SegmentDef } from '../segments';
import { exitPoints } from '../seats';
import { VEHICLES } from '../vehicles';
import { createWorld, type World } from '../world';
import { alongOf, alongOfPoint, driveWorld, segmentRouteLength, segmentStarts } from './driveRig';
import { getCourse, getCourseDef } from './index';
import { MARRAKECH_INSERTED } from './marrakech.generated';
import { boardVehicle, exitVehicle, pushAside } from './soloRig';

// The shared package has no DOM or Node typings.
declare const console: { info(...args: unknown[]): void };
declare const process: { env: Record<string, string | undefined> };

beforeAll(async () => {
  await RAPIER.init();
});

const FULL = process.env.MARRAKECH_FULL === '1';
const PLAYER = 'p1';
// A9: a stop refills the tank, so every segment starts from a full one.
const START_FUEL = 1;
// The allowed time per segment: twice its length at 6 m/s, plus 20 s.
export const allowedSeconds = (length: number): number => (2 * length) / 6 + 20;
// A vehicle this far from the route, or standing this long, has failed the segment.
const OFF_ROAD = 12;
const STUCK_SECONDS = 6;

const def = getCourseDef('marrakech')!;
const course = getCourse('marrakech');
const starts = segmentStarts(course);
const segmentCount = def.segments.length;
const ROADWORKS = new Set(def.segments.flatMap((s, i) => (s.type === 'roadworks' ? [i] : [])));
// Spec: the RV fails the bank unaided (it has winch anchors).
const bank = def.segments.findIndex((s) => s.type === 'bank');
const skipsFor = (vehicleId: string): Set<number> => new Set(vehicleId === 'rv' && bank >= 0 ? [bank] : []);

type RoadDef = Extract<SegmentDef, { type: 'road' }>;
const hazardOf = (i: number): string | undefined => {
  const s = def.segments[i]!;
  return s.type === 'road' ? s.hazards?.[0]?.kind : undefined;
};

// Segments of a sample: the first, the last, every inserted terrain segment, each hazard segment, a few curves incl. the sharpest and the most stretched.
export function sampleSegments(): number[] {
  const curves = def.segments.flatMap((s, i) => (s.type === 'road' && s.curve ? [{ i, s: s as RoadDef }] : []));
  const sharpest = curves.reduce((a, b) => (Math.abs(b.s.curve!) / b.s.length > Math.abs(a.s.curve!) / a.s.length ? b : a));
  const stretch = ({ s }: { s: RoadDef }) => s.length - (Math.abs(s.curve!) / ROAD_MAX_PIECE_YAW) * ROAD_PIECE_LENGTH;
  const stretched = curves.reduce((a, b) => (stretch(b) > stretch(a) ? b : a));
  const spread = [0.25, 0.5, 0.75].map((f) => curves[Math.floor(f * curves.length)]!.i);
  const hazards = def.segments.flatMap((_, i) => (hazardOf(i) ? [i] : []));
  const all = [0, segmentCount - 1, ...MARRAKECH_INSERTED, ...hazards, sharpest.i, stretched.i, ...spread];
  return [...new Set(all)].sort((a, b) => a - b);
}

type Failure = 'stuck' | 'flipped' | 'off road' | 'too slow';
export interface SegmentOutcome {
  reached: boolean;
  failure?: Failure;
  seconds: number;
  allowed: number;
  detail: string;
}

// One player seated in the driver seat, the vehicle put at a segment's spawn with a full tank.
function soloAt(vehicleId: string, segment: number): World {
  const world = createWorld(RAPIER, { courseId: 'marrakech', vehicleId });
  world.addPlayer(PLAYER);
  const spawn = course.checkpoints[segment]!.spawn;
  world.debugVehicle().resetTo(spawn, START_FUEL, 1);
  const config = world.vehicleConfig;
  const lift = rotate(spawn.rot, vec3(0, config.rideHeight, 0));
  const [door] = exitPoints(config, config.seats[0]!, vec3(spawn.pos.x + lift.x, spawn.pos.y + lift.y, spawn.pos.z + lift.z), spawn.rot);
  world.teleportPlayer(PLAYER, vec3(door.x, door.y + 0.2, door.z));
  for (let i = 0; i < 30; i++) world.step(new Map());
  if (!boardVehicle(world, PLAYER)) throw new Error(`the driver cannot board at segment ${segment}`);
  return world;
}

// Distance from a point to the route polyline, searched near a known route leg.
function routeGap(x: number, z: number, near: number): number {
  let best = Infinity;
  const route = course.route;
  for (let leg = Math.max(0, near - 40); leg < Math.min(route.length - 1, near + 40); leg++) {
    const [x0, z0] = route[leg]!;
    const [x1, z1] = route[leg + 1]!;
    const len2 = (x1 - x0) ** 2 + (z1 - z0) ** 2;
    const t = Math.max(0, Math.min(1, ((x - x0) * (x1 - x0) + (z - z0) * (z1 - z0)) / len2));
    best = Math.min(best, Math.hypot(x0 + (x1 - x0) * t - x, z0 + (z1 - z0) * t - z));
  }
  return best;
}

const propsOf = (segment: number, kind: string): string[] => course.props.filter((p) => p.id.startsWith(`s${segment}-${kind}-`)).map((p) => p.id);
const propDef = (id: string) => course.props.find((p) => p.id === id)!;
const alongOfProp = (id: string): number => alongOfPoint(course, propDef(id).pose.pos.x, propDef(id).pose.pos.z);
const forwardOf = (id: string) => {
  const f = rotate(propDef(id).pose.rot, vec3(0, 0, -1));
  return { x: f.x, z: f.z };
};
const rightOf = (id: string) => {
  const r = rotate(propDef(id).pose.rot, vec3(1, 0, 0));
  return { x: r.x, z: r.z };
};

// The driver brakes before a barrier row, gets out, pushes the middle barrier of each row forward then aside, and boards again.
function openRows(world: World, rows: string[][]): void {
  const first = rows[0]![1]!;
  driveWorld(world, PLAYER, alongOfProp(first) - 50, { timeoutTicks: 120 * TICK_RATE });
  exitVehicle(world, PLAYER);
  for (const row of rows) {
    const middle = row[1]!;
    pushAside(world, PLAYER, middle, forwardOf(middle), rightOf(middle), 3, 3.5);
  }
  if (!boardVehicle(world, PLAYER)) throw new Error('the driver cannot board after opening the rows');
}

// Scripted solo drive of one segment from its checkpoint spawn to the next one's start (the finish for the last).
export function driveOne(vehicleId: string, segment: number): SegmentOutcome {
  const world = soloAt(vehicleId, segment);
  const length = segmentRouteLength(course, segment);
  const allowed = allowedSeconds(length);
  if (hazardOf(segment) === 'roadblock') openRows(world, [propsOf(segment, 'barrier')]);
  else if (ROADWORKS.has(segment)) {
    const barriers = propsOf(segment, 'barrier');
    openRows(world, [barriers.slice(0, 3), barriers.slice(3, 6)].filter((row) => row.length === 3));
  }
  const last = segment === segmentCount - 1;
  const until = last ? Infinity : alongOf(course, { leg: starts[segment + 1]!, t: 0 });
  let failure: Failure | undefined;
  let tick = 0;
  let standing = 0;
  let worstGap = 0;
  const stop = (): boolean => {
    tick++;
    if (tick % 6 !== 0) return false;
    const { pos, rot, linvel } = world.snapshot().vehicle;
    const up = rotate(rot, vec3(0, 1, 0));
    if (up.y < 0.1) failure = 'flipped';
    const gap = routeGap(pos.x, pos.z, starts[segment]!);
    worstGap = Math.max(worstGap, gap);
    if (gap > OFF_ROAD && !last) failure = 'off road';
    standing = Math.hypot(linvel.x, linvel.y, linvel.z) < 0.3 && tick > 4 * TICK_RATE ? standing + 6 / TICK_RATE : 0;
    if (standing > STUCK_SECONDS) failure = 'stuck';
    return failure !== undefined;
  };
  const result = driveWorld(world, PLAYER, until, { timeoutTicks: Math.ceil(allowed * TICK_RATE), stop });
  const elapsed = result.ticks / TICK_RATE;
  const fuel = world.snapshot().vehicle.fuel;
  world.dispose();
  const detail = `${vehicleId} segment ${segment} (${def.segments[segment]!.type}${hazardOf(segment) ? ` ${hazardOf(segment)}` : ''}, ${length.toFixed(0)} m): ${elapsed.toFixed(1)} s of ${allowed.toFixed(1)} s, worst route gap ${worstGap.toFixed(1)} m, fuel ${(100 * fuel).toFixed(0)} %`;
  if (result.reached) return { reached: true, seconds: elapsed, allowed, detail };
  return { reached: false, failure: failure ?? 'too slow', seconds: elapsed, allowed, detail };
}

describe('allowed time', () => {
  test('is twice the length at 6 m/s plus 20 s', () => {
    expect(allowedSeconds(0)).toBe(20);
    expect(allowedSeconds(300)).toBe(120);
  });
});

describe('the sample', () => {
  test('holds the first and last segments, all inserted terrain and all hazards', () => {
    const sample = sampleSegments();
    expect(sample).toContain(0);
    expect(sample).toContain(segmentCount - 1);
    for (const i of MARRAKECH_INSERTED) expect(sample).toContain(i);
    expect(sample.length).toBeLessThan(40);
    expect(PROP_KINDS.barrier).toBeDefined();
  });
});

const picked = FULL ? Array.from({ length: segmentCount }, (_, i) => i) : sampleSegments();

describe.each(Object.keys(VEHICLES))('A9 the %s drives marrakech per segment from a full tank', (vehicleId) => {
  const segments = picked.filter((i) => !skipsFor(vehicleId).has(i));
  test.each(segments)('segment %i is driven within the allowed time', (i) => {
    const outcome = driveOne(vehicleId, i);
    console.info(`A9 ${outcome.reached ? 'ok' : `FAIL ${outcome.failure}`}: ${outcome.detail}`);
    expect(outcome.reached, `${outcome.failure}: ${outcome.detail}`).toBe(true);
  }, 300_000);
});
