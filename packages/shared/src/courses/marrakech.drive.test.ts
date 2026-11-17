import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { BIG_HILL_SLOPE, ROAD_MAX_PIECE_YAW, ROAD_PIECE_LENGTH, TICK_RATE } from '../constants';
import { NEUTRAL_INPUT } from '../protocol';
import { rotate, vec3 } from '../math';
import type { SegmentDef } from '../segments';
import { exitPoints } from '../seats';
import { VEHICLES } from '../vehicles';
import { createWorld, type World } from '../world';
import { alongOf, alongOfPoint, driveWorld, segmentRouteLength, segmentStarts } from './driveRig';
import { getCourse, getCourseDef } from './index';
import { MARRAKECH_INSERTED } from './marrakech.generated';
import { CREST_AND_PULL, PIT_GAUNTLET, RUBBLE_RUN } from './parkour';
import { DEEP_PIT } from './terrain';
import { boardVehicle, exitVehicle, pushAside } from './soloRig';

// The shared package has no DOM or Node typings.
declare const console: { info(...args: unknown[]): void };
declare const process: { env: Record<string, string | undefined> };

beforeAll(async () => {
  await RAPIER.init();
});

const FULL = process.env.MARRAKECH_FULL === '1';
const PLAYER = 'p1';
// A9, and the owner ruling in the ROADMAP decisions log (2026-11-17, step 27 fuel): a stop refills the tank, so every segment starts from a full one; from 50 % the RV cannot meet the gaps.
const START_FUEL = 1;
// A9: twice the target time, shared out by the segment's share of the route, plus 20 s.
export const allowedSeconds = (length: number, targetTime: number, routeLength: number): number => (2 * targetTime * length) / routeLength + 20;
// A vehicle this far from the route, or standing this long, has failed the segment.
const OFF_ROAD = 12;
const STUCK_SECONDS = 6;

const def = getCourseDef('marrakech')!;
const course = getCourse('marrakech');
const starts = segmentStarts(course);
const routeLength = course.route.slice(1).reduce((sum, [x, z], i) => sum + Math.hypot(x - course.route[i]![0], z - course.route[i]![1]), 0);
const segmentCount = def.segments.length;
const ROADWORKS = new Set(def.segments.flatMap((s, i) => (s.type === 'roadworks' ? [i] : [])));
// The hills and pits as groups of segment indexes: a hill is flat, climb, crest, descent, flat.
type Kind = 'hill' | 'bigHill' | 'pit' | 'deepPit';
const groups: { kind: Kind; indexes: number[] }[] = [];
// The parkour sections (28d): their own hills and pits are driven by the section tests, not sampled here.
const sectionIndexes = new Set<number>(
  [RUBBLE_RUN, CREST_AND_PULL, PIT_GAUNTLET].flatMap((defs) => {
    const first = def.segments.findIndex((_, i) => defs.every((d, k) => JSON.stringify(def.segments[i + k]) === JSON.stringify(d)));
    if (first < 0) throw new Error('a parkour section is missing from the marrakech course');
    return defs.map((_, k) => first + k);
  }),
);
def.segments.forEach((s, i) => {
  if (sectionIndexes.has(i)) return;
  if (s.type === 'pit') groups.push({ kind: JSON.stringify(s) === JSON.stringify(DEEP_PIT) ? 'deepPit' : 'pit', indexes: [i] });
  const next = def.segments[i + 2];
  if (s.type === 'road' && s.slope && s.slope > 0 && next?.type === 'road' && next.slope === -s.slope) groups.push({ kind: s.slope === BIG_HILL_SLOPE ? 'bigHill' : 'hill', indexes: [i - 1, i, i + 1, i + 2, i + 3] });
});
const bank = def.segments.findIndex((s) => s.type === 'bank');
// Spec: the RV needs the winch on the bank, the big hill and the deep pits (they have anchors), so its drive skips them; the Lodgy drives them (a deep pit is a jolt for it).
const RV_NEEDS_WINCH: ReadonlySet<string> = new Set(['bank', 'bigHill', 'deepPit']);
const winchSegments = new Set<number>([...(bank >= 0 && RV_NEEDS_WINCH.has('bank') ? [bank] : []), ...groups.filter((g) => RV_NEEDS_WINCH.has(g.kind)).flatMap((g) => g.indexes)]);
const skipsFor = (vehicleId: string): Set<number> => (vehicleId === 'rv' ? winchSegments : new Set());

type RoadDef = Extract<SegmentDef, { type: 'road' }>;
const hazardOf = (i: number): string | undefined => {
  const s = def.segments[i]!;
  return s.type === 'road' ? s.hazards?.[0]?.kind : undefined;
};

// The curves the sample must hold: the sharpest (most yaw per metre) and the most stretched (length beyond the 10 degrees per 10 m rule).
export function curveExtremes(): { sharpest: number; stretched: number; curves: number[] } {
  const curves = def.segments.flatMap((s, i) => (s.type === 'road' && s.curve ? [{ i, s: s as RoadDef }] : []));
  const sharpest = curves.reduce((a, b) => (Math.abs(b.s.curve!) / b.s.length > Math.abs(a.s.curve!) / a.s.length ? b : a));
  const stretch = ({ s }: { s: RoadDef }) => s.length - (Math.abs(s.curve!) / ROAD_MAX_PIECE_YAW) * ROAD_PIECE_LENGTH;
  const stretched = curves.reduce((a, b) => (stretch(b) > stretch(a) ? b : a));
  return { sharpest: sharpest.i, stretched: stretched.i, curves: curves.map((c) => c.i) };
}

// One of each terrain kind: the second hill, the big hill, the second shallow pit and the first deep pit.
const sampledTerrain = (): number[] => (['hill', 'bigHill', 'pit', 'deepPit'] as const).flatMap((kind) => groups.filter((g) => g.kind === kind)[kind === 'hill' || kind === 'pit' ? 1 : 0]!.indexes);
const terrainIndexes = new Set([...groups.flatMap((g) => g.indexes), ...sectionIndexes]);

// Segments of a sample: the first, the last, the sand, alley, roadworks and ford group, one hill, the big hill, one shallow and one deep pit, each hazard segment, a few curves incl. the sharpest and the most stretched.
export function sampleSegments(): number[] {
  const { sharpest, stretched, curves } = curveExtremes();
  const spread = [0.25, 0.5, 0.75].map((f) => curves[Math.floor(f * curves.length)]!);
  const hazards = def.segments.flatMap((_, i) => (hazardOf(i) ? [i] : []));
  const all = [0, segmentCount - 1, ...MARRAKECH_INSERTED.filter((i) => !terrainIndexes.has(i)), ...sampledTerrain(), ...hazards, sharpest, stretched, ...spread];
  return [...new Set(all)].sort((a, b) => a - b);
}

type Failure = 'stuck' | 'flipped' | 'off road' | 'out of fuel' | 'too slow';
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
  const approach = driveWorld(world, PLAYER, alongOfProp(first) - 50, { timeoutTicks: 120 * TICK_RATE });
  if (!approach.reached) throw new Error(`the approach to the barrier rows stopped at ${approach.along.toFixed(0)} m`);
  exitVehicle(world, PLAYER);
  for (const row of rows) {
    const middle = row[1]!;
    const end = pushAside(world, PLAYER, middle, forwardOf(middle), rightOf(middle), 3, 3.5);
    const start = propDef(middle).pose.pos;
    const right = rightOf(middle);
    const pushed = (end.x - start.x) * right.x + (end.z - start.z) * right.z;
    if (pushed < 2.5) throw new Error(`${middle} was pushed only ${pushed.toFixed(1)} m out of its row`);
  }
  if (!boardVehicle(world, PLAYER)) throw new Error('the driver cannot board after opening the rows');
}

// Watches a drive every 6 ticks and names the first failure.
function monitor(world: World, segment: number) {
  let failure: Failure | undefined;
  let tick = 0;
  let standing = 0;
  let worstGap = 0;
  const stop = (): boolean => {
    tick++;
    if (tick % 6 !== 0) return false;
    const { pos, rot, linvel, fuel } = world.snapshot().vehicle;
    const up = rotate(rot, vec3(0, 1, 0));
    if (up.y < 0.1) failure = 'flipped';
    const gap = routeGap(pos.x, pos.z, starts[segment]!);
    worstGap = Math.max(worstGap, gap);
    if (gap > OFF_ROAD) failure = 'off road';
    if (fuel <= 0) failure = 'out of fuel';
    standing = Math.hypot(linvel.x, linvel.y, linvel.z) < 0.3 && tick > 4 * TICK_RATE ? standing + 6 / TICK_RATE : 0;
    if (standing > STUCK_SECONDS) failure = 'stuck';
    return failure !== undefined;
  };
  return { stop, failure: () => failure, worstGap: () => worstGap };
}

const untilOf = (segment: number): number => (segment === segmentCount - 1 ? Infinity : alongOf(course, { leg: starts[segment + 1]!, t: 0 }));
const allowedFor = (segment: number): number => allowedSeconds(segmentRouteLength(course, segment), course.targetTime, routeLength);

// Scripted solo drive of one segment from its checkpoint spawn to the next one's start (the finish for the last).
export function driveOne(vehicleId: string, segment: number): SegmentOutcome {
  const world = soloAt(vehicleId, segment);
  const length = segmentRouteLength(course, segment);
  const allowed = allowedFor(segment);
  if (hazardOf(segment) === 'roadblock') openRows(world, [propsOf(segment, 'barrier')]);
  else if (ROADWORKS.has(segment)) {
    const barriers = propsOf(segment, 'barrier');
    openRows(world, [barriers.slice(0, 3), barriers.slice(3, 6)].filter((row) => row.length === 3));
  }
  const watch = monitor(world, segment);
  const result = driveWorld(world, PLAYER, untilOf(segment), { timeoutTicks: Math.ceil(allowed * TICK_RATE), stop: watch.stop });
  const elapsed = result.ticks / TICK_RATE;
  const fuel = world.snapshot().vehicle.fuel;
  world.dispose();
  const detail = `${vehicleId} segment ${segment} (${def.segments[segment]!.type}${hazardOf(segment) ? ` ${hazardOf(segment)}` : ''}, ${length.toFixed(0)} m): ${elapsed.toFixed(1)} s of ${allowed.toFixed(1)} s, worst route gap ${watch.worstGap().toFixed(1)} m, fuel ${(100 * fuel).toFixed(0)} %`;
  if (result.reached && fuel <= 0) return { reached: false, failure: 'out of fuel', seconds: elapsed, allowed, detail };
  if (result.reached) return { reached: true, seconds: elapsed, allowed, detail };
  return { reached: false, failure: watch.failure() ?? 'too slow', seconds: elapsed, allowed, detail };
}

describe('allowed time', () => {
  test('is twice the target time shared out by length, plus 20 s', () => {
    expect(allowedSeconds(0, 1800, 20_000)).toBe(20);
    expect(allowedSeconds(1000, 1800, 20_000)).toBe(200);
    expect(allowedFor(0)).toBeCloseTo((2 * course.targetTime * segmentRouteLength(course, 0)) / routeLength + 20, 9);
  });
});

describe('the sample', () => {
  test('holds the ends, the old inserts, one of each hill and pit kind, the sharpest and most stretched curves and every hazard kind', () => {
    const sample = sampleSegments();
    expect(sample).toContain(0);
    expect(sample).toContain(segmentCount - 1);
    for (const i of MARRAKECH_INSERTED.filter((j) => !terrainIndexes.has(j))) expect(sample).toContain(i);
    for (const kind of ['hill', 'bigHill', 'pit', 'deepPit']) expect(groups.some((g) => g.kind === kind && g.indexes.every((i) => sample.includes(i))), kind).toBe(true);
    expect(groups.map((g) => g.kind).sort()).toEqual(['bigHill', 'deepPit', 'deepPit', 'hill', 'hill', 'hill', 'pit', 'pit', 'pit', 'pit']);
    const { sharpest, stretched } = curveExtremes();
    expect(sample).toContain(sharpest);
    expect(sample).toContain(stretched);
    for (const kind of ['crateWall', 'gates', 'roadblock']) {
      const of = def.segments.flatMap((_, i) => (hazardOf(i) === kind ? [i] : []));
      expect(of.length, kind).toBeGreaterThan(0);
      expect(of.some((i) => sample.includes(i)), kind).toBe(true);
    }
    expect(sample.length).toBeLessThan(40);
  });
});

describe('the failure classes fire', () => {
  test('a drive with no steering on the sharpest curve is reported as off road, stuck or too slow', () => {
    const segment = curveExtremes().sharpest;
    const world = soloAt('lodgy', segment);
    const watch = monitor(world, segment);
    const until = untilOf(segment);
    let along = 0;
    for (let tick = 0; tick < Math.ceil(allowedFor(segment) * TICK_RATE); tick++) {
      world.step(new Map([[PLAYER, { ...NEUTRAL_INPUT, moveY: 1 }]]));
      const { pos } = world.snapshot().vehicle;
      along = alongOfPoint(course, pos.x, pos.z);
      if (watch.stop() || along >= until) break;
    }
    world.dispose();
    const reached = along >= until && watch.failure() === undefined;
    expect(reached, `along ${along.toFixed(0)} of ${until.toFixed(0)}, failure ${watch.failure()}`).toBe(false);
  }, 120_000);
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
