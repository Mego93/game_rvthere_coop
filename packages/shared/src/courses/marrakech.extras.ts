import { GATES_SPACING, HAZARD_END_CLEARANCE, MUD_MAX_LENGTH, MUD_MIN_LENGTH, PROP_KINDS, ROADBLOCK_FENCE_HALF, ROCK_CLEAR, ROCK_HALF, ROCK_LATERALS, ROCK_SPACING, SEGMENT_SPAWN_INSET, STOP_HAZARD_CLEAR, STOP_PAD } from '../constants';
import { buildSegment, hazardSpan, type Hazard, type Placement, type SegmentDef } from '../segments';
import { VEHICLES } from '../vehicles';

type RoadDef = Extract<SegmentDef, { type: 'road' }>;
export type Extras = Pick<RoadDef, 'stop' | 'hazards' | 'pickups' | 'coins'>;

export const FUEL_TARGET_GAP = 1100;
export const FUEL_MAX_GAP = 1500;
export const FUEL_MIN_GAP = 600;
export const STOP_MIN_LENGTH = 60;
export const GARAGE_EVERY = 4000;
export const GARAGE_FUEL_CLEARANCE = 200;
export const PICKUP_EVERY = 1500;
const PICKUP_MIN_STEP = 800;
const PICKUP_MAX_STEP = 1800;
export const COIN_EVERY = 250;
export const COIN_MIN_SEGMENT = 30;
export const HAZARD_MIN_SEGMENT = 22;
export const GATES_MIN_SEGMENT = 65;

// Where the plan wants each hazard, as a fraction of the course (R5).
export const HAZARD_PLAN: readonly { kind: 'crateWall' | 'gates' | 'roadblock'; fraction: number }[] = [
  { kind: 'crateWall', fraction: 0.12 },
  { kind: 'gates', fraction: 0.3 },
  { kind: 'roadblock', fraction: 0.45 },
  { kind: 'crateWall', fraction: 0.72 },
  { kind: 'roadblock', fraction: 0.93 },
];
export interface MudPlan {
  fraction: number;
  length: number;
}
export interface RocksPlan {
  fraction: number;
  side: -1 | 1;
}

// Ten mud patches (lengths alternating 12, 16, 20 m) and twelve rock groups, by route fraction; the planner picks the nearest fitting straight, after coins and pickups.
export const MUD_PLAN: readonly MudPlan[] = Array.from({ length: 10 }, (_, i) => ({ fraction: Math.round((0.05 + 0.1 * i) * 1000) / 1000, length: [12, 16, 20][i % 3]! }));
export const ROCKS_PLAN: readonly RocksPlan[] = [0.042, 0.125, 0.208, 0.292, 0.375, 0.458, 0.542, 0.625, 0.708, 0.792, 0.875, 0.958].map((fraction, i) => ({ fraction, side: i % 2 === 0 ? -1 : 1 }));
// m a coin keeps from a rocks group sharing its segment, and a pickup from a mud patch or rocks group.
const ROCK_COIN_CLEAR = 5;
const PICKUP_HAZARD_CLEAR = 10;
// A segment with a stop takes mud or rocks only from this length.
const STOP_SEGMENT_MIN_LENGTH = 150;
const GATES_COUNT = 4;
const PICKUP_KINDS = ['jerrycan', 'toolbox', 'healthKit'] as const;

// m kept clear of a hill or pit: 120 m, and 150 m of a deep pit, for stops and hazards.
export const TERRAIN_HAZARD_CLEAR = 120;
export const TERRAIN_DEEP_CLEAR = 150;

// A hill or pit as the segment indexes it spans; `deep` marks the deep pit.
export interface TerrainSpan {
  first: number;
  last: number;
  deep?: boolean;
}

export interface ExtrasOptions {
  garageEvery?: number;
  terrain?: readonly TerrainSpan[];
  // Mud patches and rock groups to place (marrakech only); none when absent.
  mud?: readonly MudPlan[];
  rocks?: readonly RocksPlan[];
}

export interface ExtrasReport {
  total: number;
  fuel: { index: number; at: number }[];
  garages: { index: number; at: number }[];
  hazards: { kind: Hazard['kind']; index: number; at: number; target: number; distance: number }[];
  mud: { index: number; at: number; length: number; target: number; distance: number }[];
  rocks: { index: number; at: number; side: -1 | 1; target: number; distance: number }[];
  pickups: { kind: string; index: number; at: number }[];
  coins: number;
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

// The along range a hazard may take on a straight of this length (`size` is a mud patch's length), or null when it does not fit (A5).
export function hazardRange(kind: Hazard['kind'], length: number, size = MUD_MAX_LENGTH): { lo: number; hi: number } | null {
  if (length < (kind === 'gates' ? GATES_MIN_SEGMENT : HAZARD_MIN_SEGMENT)) return null;
  if (kind === 'mud' && !(size >= MUD_MIN_LENGTH && size <= MUD_MAX_LENGTH)) return null;
  const spawnClear = SEGMENT_SPAWN_INSET + VEHICLES.rv.halfExtents.z;
  const barrierZ = PROP_KINDS.barrier.halfExtents.z;
  const crateZ = PROP_KINDS.crate.halfExtents.z;
  let lo: number;
  let hi: number;
  if (kind === 'crateWall') {
    lo = spawnClear + crateZ;
    hi = length - HAZARD_END_CLEARANCE - crateZ;
  } else if (kind === 'mud') {
    lo = spawnClear;
    hi = length - spawnClear - size;
  } else if (kind === 'rocks') {
    lo = spawnClear + ROCK_HALF.z;
    hi = length - HAZARD_END_CLEARANCE - (ROCK_LATERALS.length - 1) * ROCK_SPACING - ROCK_HALF.z;
  } else if (kind === 'roadblock') {
    lo = Math.max(spawnClear + barrierZ, ROADBLOCK_FENCE_HALF);
    hi = Math.min(length - HAZARD_END_CLEARANCE - barrierZ, length - ROADBLOCK_FENCE_HALF);
  } else {
    lo = spawnClear + barrierZ;
    hi = length - HAZARD_END_CLEARANCE - barrierZ - (GATES_COUNT - 1) * GATES_SPACING;
  }
  // A metre of margin: a curve's route is a little shorter than its length.
  return hi - lo >= 1 ? { lo: lo + 0.5, hi: hi - 0.5 } : null;
}

// Whole counts per length that add up to `total`, carrying the fraction from one to the next.
export function spreadCount(lengths: readonly number[], total: number): number[] {
  const sum = lengths.reduce((a, b) => a + b, 0);
  let carry = 0;
  return lengths.map((length) => {
    carry += sum > 0 ? (length * total) / sum : 0;
    const n = Math.floor(carry + 1e-9);
    carry -= n;
    return n;
  });
}

const coinsAlong = (count: number, length: number, side: { next: -1 | 1 }): Placement[] =>
  Array.from({ length: count }, (_, i) => {
    const along = count === 1 ? length / 2 : 15 + ((length - 30) * i) / (count - 1);
    side.next = side.next === -1 ? 1 : -1;
    return { along: round1(along), lateral: side.next === 1 ? -2.5 : 2.5 };
  });

function layout(segments: readonly SegmentDef[], inserted: readonly number[], terrain: readonly TerrainSpan[]) {
  const last = segments.length - 1;
  const skip = new Set(inserted);
  const advance = segments.map((def) => -buildSegment(def).exit.pos.z);
  const start: number[] = [];
  let total = 0;
  for (const a of advance) {
    start.push(total);
    total += a;
  }
  const mid = (i: number): number => start[i]! + advance[i]! / 2;
  const straight = (i: number): boolean => {
    const def = segments[i]!;
    return def.type === 'road' && !def.curve && !def.slope && !skip.has(i);
  };
  const inner = (i: number): boolean => i > 0 && i < last;
  // Whether segment i is closer than `clear(span)` to a terrain span.
  const nearTerrain = (i: number, clear: (span: TerrainSpan) => number): boolean =>
    terrain.some((span) => {
      const from = start[span.first]!;
      const to = start[span.last]! + advance[span.last]!;
      return Math.max(from - (start[i]! + advance[i]!), start[i]! - to, 0) < clear(span);
    });
  const stopCandidates = segments
    .map((_, i) => i)
    .filter((i) => inner(i) && straight(i) && (segments[i] as RoadDef).length >= STOP_MIN_LENGTH && !nearTerrain(i, (span) => (span.deep ? TERRAIN_DEEP_CLEAR : TERRAIN_HAZARD_CLEAR)));
  return { skip, advance, start, total, mid, straight, inner, nearTerrain, stopCandidates };
}

// The largest gap between neighbouring stop candidates, the start and the end: a fuel chain needs at most FUEL_MAX_GAP.
export function largestStopGap(input: readonly SegmentDef[], inserted: readonly number[], terrain: readonly TerrainSpan[]): number {
  const { total, mid, stopCandidates } = layout(input, inserted, terrain);
  const points = [0, ...stopCandidates.map(mid), total];
  return Math.max(...points.slice(1).map((p, i) => p - points[i]!));
}

export function planExtras(input: readonly SegmentDef[], inserted: readonly number[], options: ExtrasOptions = {}): { segments: SegmentDef[]; report: ExtrasReport } {
  const segments: SegmentDef[] = input.map((def) => ({ ...def }));
  const { skip, advance, start, total, mid, straight, inner, nearTerrain, stopCandidates } = layout(segments, inserted, options.terrain ?? []);
  const roadAt = (i: number): RoadDef | null => {
    const def = segments[i]!;
    return def.type === 'road' ? def : null;
  };
  const report: ExtrasReport = { total, fuel: [], garages: [], hazards: [], mud: [], rocks: [], pickups: [], coins: 0 };

  // Fuel stops: the chain of stop segments whose gaps stay nearest the target and never pass the maximum.
  const best = new Map<number, { cost: number; prev: number }>();
  const gapCost = (g: number): number => (g - FUEL_TARGET_GAP) ** 2;
  for (const i of stopCandidates) {
    if (mid(i) <= FUEL_MAX_GAP) best.set(i, { cost: gapCost(mid(i)), prev: -1 });
    for (const j of stopCandidates) {
      if (j >= i) break;
      const gap = mid(i) - mid(j);
      const from = best.get(j);
      if (!from || gap > FUEL_MAX_GAP || gap < FUEL_MIN_GAP) continue;
      const cost = from.cost + gapCost(gap);
      if (!best.has(i) || cost < best.get(i)!.cost) best.set(i, { cost, prev: j });
    }
  }
  let tail = -1;
  let tailCost = Infinity;
  for (const [i, v] of best) {
    if (total - mid(i) > FUEL_MAX_GAP) continue;
    const cost = v.cost + gapCost(total - mid(i));
    if (cost < tailCost) {
      tailCost = cost;
      tail = i;
    }
  }
  if (tail < 0) throw new Error('No fuel stop chain keeps every gap within 1.5 km');
  const fuel: number[] = [];
  for (let i = tail; i >= 0; i = best.get(i)!.prev) fuel.unshift(i);
  fuel.forEach((i, n) => {
    roadAt(i)!.stop = { kind: 'fuel', side: n % 2 === 0 ? 1 : -1, along: round1(roadAt(i)!.length / 2) };
    report.fuel.push({ index: i, at: mid(i) });
  });

  // Garages: the nearest free stop segment to each target, at least 200 m from every fuel stop.
  const taken = new Set(fuel);
  const every = options.garageEvery ?? GARAGE_EVERY;
  for (let target = every, n = 0; target < total - every / 5; target += every, n++) {
    const pool = stopCandidates.filter((i) => !taken.has(i) && fuel.every((f) => Math.abs(mid(i) - mid(f)) >= GARAGE_FUEL_CLEARANCE));
    let pick = -1;
    for (const i of pool) if (pick < 0 || Math.abs(mid(i) - target) < Math.abs(mid(pick) - target)) pick = i;
    if (pick < 0) throw new Error(`No segment for the garage near ${target} m`);
    taken.add(pick);
    roadAt(pick)!.stop = { kind: 'garage', side: n % 2 === 0 ? -1 : 1, along: round1(roadAt(pick)!.length / 2) };
    report.garages.push({ index: pick, at: mid(pick) });
  }

  // Hazards: the nearest segment each kind fits on; none on a stop, an inserted segment or the ends.
  const hazardSegments = new Set<number>();
  for (const plan of HAZARD_PLAN) {
    const target = plan.fraction * total;
    let pick = -1;
    for (let i = 0; i < segments.length; i++) {
      const def = roadAt(i);
      if (!def || !inner(i) || skip.has(i) || def.stop || def.slope || hazardSegments.has(i) || !hazardRange(plan.kind, def.length)) continue;
      if (nearTerrain(i, (span) => (span.deep ? TERRAIN_DEEP_CLEAR : TERRAIN_HAZARD_CLEAR))) continue;
      if (pick < 0 || Math.abs(mid(i) - target) < Math.abs(mid(pick) - target)) pick = i;
    }
    if (pick < 0) throw new Error(`No segment for the ${plan.kind} near ${Math.round(target)} m`);
    hazardSegments.add(pick);
    const def = roadAt(pick)!;
    const range = hazardRange(plan.kind, def.length)!;
    const along = round1((range.lo + range.hi) / 2);
    def.hazards = [plan.kind === 'gates' ? { kind: 'gates', along, count: GATES_COUNT } : { kind: plan.kind, along }];
    report.hazards.push({ kind: plan.kind, index: pick, at: mid(pick), target, distance: Math.abs(mid(pick) - target) });
  }

  // Pickups: the villa lane's three, then a jerrycan, a toolbox and a health kit every 1.5 km, staggered 500 m apart.
  const first = roadAt(0)!;
  first.pickups = [
    { kind: 'jerrycan', along: 30, lateral: -3 },
    { kind: 'toolbox', along: 30, lateral: 3 },
    { kind: 'healthKit', along: 40, lateral: 0 },
  ];
  const pickupSegments = new Set<number>([0]);
  const pickupPool = segments.map((_, i) => i).filter((i) => inner(i) && straight(i) && !hazardSegments.has(i) && roadAt(i)!.length >= 40);
  const pickupAt = (i: number): number => start[i]! + advance[i]! / 4;
  // Each kind steps about 1.5 km from its last pickup (never more than 1.8 km), the kinds starting 250 to 500 m apart.
  const lastAt: Record<string, number> = { jerrycan: 35, toolbox: -500, healthKit: -250 };
  const queue = PICKUP_KINDS.map((kind) => ({ kind, next: lastAt[kind]! + PICKUP_EVERY }));
  for (;;) {
    queue.sort((x, y) => x.next - y.next);
    const entry = queue[0]!;
    if (entry.next > total - 300) break;
    const prev = lastAt[entry.kind]!;
    let pick = -1;
    for (const i of pickupPool) {
      const at = pickupAt(i);
      if (pickupSegments.has(i) || at > prev + PICKUP_MAX_STEP || at < prev + PICKUP_MIN_STEP) continue;
      if (pick < 0 || Math.abs(at - entry.next) < Math.abs(pickupAt(pick) - entry.next)) pick = i;
    }
    if (pick < 0) throw new Error(`No segment for a ${entry.kind} after ${Math.round(prev)} m`);
    pickupSegments.add(pick);
    const def = roadAt(pick)!;
    def.pickups = [{ kind: entry.kind, along: round1(def.length / 4), lateral: pickupSegments.size % 2 === 0 ? -3 : 3 }];
    report.pickups.push({ kind: entry.kind, index: pick, at: pickupAt(pick) });
    lastAt[entry.kind] = pickupAt(pick);
    entry.next = lastAt[entry.kind]! + PICKUP_EVERY;
  }
  for (const kind of PICKUP_KINDS) report.pickups.unshift({ kind, index: 0, at: kind === 'healthKit' ? 40 : 30 });

  // Coins: on straights of 30 m or more (not on hazard segments), about one per 250 m of course; the villa lane gets two.
  first.coins = coinsAlong(2, first.length, { next: 1 });
  const coinPool = segments.map((_, i) => i).filter((i) => i > 0 && straight(i) && !hazardSegments.has(i) && roadAt(i)!.length >= COIN_MIN_SEGMENT);
  const wanted = Math.round(total / COIN_EVERY) - 2;
  const counts = spreadCount(coinPool.map((i) => roadAt(i)!.length), wanted);
  const side = { next: -1 as -1 | 1 };
  coinPool.forEach((i, n) => {
    if (counts[n]! > 0) roadAt(i)!.coins = coinsAlong(counts[n]!, roadAt(i)!.length, side);
  });
  report.coins = 2 + counts.reduce((a, b) => a + b, 0);

  // Mud patches, then rock groups: after everything else so nothing above moves. Straights only, never on another hazard or debris; a pickup must be PICKUP_HAZARD_CLEAR m from the span and a stop segment (150 m or longer) STOP_HAZARD_CLEAR m from the pad; rocks also keep clear of coins and mud.
  // Mud may share a segment with coins (a coin over mud is harmless).
  const used = new Set<number>();
  const mudSpans: { from: number; to: number }[] = [];
  const plainStraight = (i: number): RoadDef | null => {
    const def = roadAt(i);
    if (!def || !inner(i) || !straight(i) || used.has(i) || def.hazards || def.debris) return null;
    if (def.stop && def.length < STOP_SEGMENT_MIN_LENGTH) return null;
    return nearTerrain(i, (span) => (span.deep ? TERRAIN_DEEP_CLEAR : TERRAIN_HAZARD_CLEAR)) ? null : def;
  };
  const nearest = (target: number, fits: (i: number) => boolean): number => {
    let pick = -1;
    for (let i = 0; i < segments.length; i++) if (fits(i) && (pick < 0 || Math.abs(mid(i) - target) < Math.abs(mid(pick) - target))) pick = i;
    return pick;
  };
  // The along nearest the middle of the allowed range where `hazardAt(along)` keeps clear of pickups, the stop pad, coins (rocks) and mud (rocks); null when none.
  const findAlong = (i: number, kind: 'mud' | 'rocks', hazardAt: (along: number) => Hazard): number | null => {
    const def = plainStraight(i);
    const range = def && hazardRange(kind, def.length, kind === 'mud' ? (hazardAt(0) as { length: number }).length : undefined);
    if (!def || !range) return null;
    const centre = (range.lo + range.hi) / 2;
    for (let step = 0; centre - step >= range.lo - 1e-9 || centre + step <= range.hi + 1e-9; step += 1) {
      for (const along of step === 0 ? [centre] : [centre - step, centre + step]) {
        if (along < range.lo - 1e-9 || along > range.hi + 1e-9) continue;
        const at = round1(along);
        const [a, b] = hazardSpan(hazardAt(at));
        if (!(def.pickups ?? []).every((p) => p.along < a - PICKUP_HAZARD_CLEAR || p.along > b + PICKUP_HAZARD_CLEAR)) continue;
        if (def.stop && a < def.stop.along + STOP_PAD.z + STOP_HAZARD_CLEAR && b > def.stop.along - STOP_PAD.z - STOP_HAZARD_CLEAR) continue;
        if (kind === 'rocks') {
          if (!(def.coins ?? []).every((c) => c.along < a - ROCK_COIN_CLEAR || c.along > b + ROCK_COIN_CLEAR)) continue;
          if (!mudSpans.every((m) => Math.max(m.from - (start[i]! + b), start[i]! + a - m.to, 0) >= ROCK_CLEAR)) continue;
        }
        return at;
      }
    }
    return null;
  };
  for (const plan of options.mud ?? []) {
    const target = plan.fraction * total;
    const hazardAt = (along: number): Hazard => ({ kind: 'mud', along, length: plan.length });
    const pick = nearest(target, (i) => findAlong(i, 'mud', hazardAt) !== null);
    if (pick < 0) throw new Error(`No segment for the mud near ${Math.round(target)} m`);
    const along = findAlong(pick, 'mud', hazardAt)!;
    roadAt(pick)!.hazards = [hazardAt(along)];
    used.add(pick);
    mudSpans.push({ from: start[pick]! + along, to: start[pick]! + along + plan.length });
    report.mud.push({ index: pick, at: mid(pick), length: plan.length, target, distance: Math.abs(mid(pick) - target) });
  }
  for (const plan of options.rocks ?? []) {
    const target = plan.fraction * total;
    const hazardAt = (along: number): Hazard => ({ kind: 'rocks', along, side: plan.side });
    const pick = nearest(target, (i) => findAlong(i, 'rocks', hazardAt) !== null);
    if (pick < 0) throw new Error(`No segment for the rocks near ${Math.round(target)} m`);
    roadAt(pick)!.hazards = [hazardAt(findAlong(pick, 'rocks', hazardAt)!)];
    used.add(pick);
    report.rocks.push({ index: pick, at: mid(pick), side: plan.side, target, distance: Math.abs(mid(pick) - target) });
  }

  for (const def of segments) buildSegment(def);
  return { segments, report };
}
