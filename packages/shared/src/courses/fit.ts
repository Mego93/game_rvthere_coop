import { ROAD_MAX_PIECE_YAW, ROAD_PIECE_LENGTH, SEGMENT_MIN_LENGTH } from '../constants';
import { degToRad } from '../math';
import type { SegmentDef } from '../segments';

export type Route = readonly (readonly [x: number, z: number])[];
type RoadDef = Extract<SegmentDef, { type: 'road' }>;

// First and last vertex of a run of turning vertices (vertex v joins steps v-1 and v) and its total turn.
export interface TurnRun {
  v1: number;
  v2: number;
  turn: number;
}

export interface FitOptions {
  // Metres that stay straight at the start (the villa lane, default 80) and at the end (default 120); `edge` sets both.
  edge?: number;
  lead?: number;
  tail?: number;
}

export interface FitReport {
  segmentCount: number;
  totalLength: number;
  realLength: number;
  // Distance between the centre lines at the same arc length, and between nearest points.
  maxDeviation: number;
  maxNearest: number;
  endError: number;
  maxStretch: number;
  stretches: number;
}

export interface CentrePoint {
  x: number;
  z: number;
  s: number;
}

const STRAIGHT_TURN = degToRad(1.5);
const WEAK_TURN = degToRad(3);
const SHORT_CURVE = 40;
const MAX_SEGMENT = 400;
const AIM_MIN = 60;
const AIM_LIMIT = degToRad(25);
const EPS = 0.15;

const round1 = (v: number): number => Math.round(v * 10) / 10;
const wrapNear = (a: number, near: number): number => a - Math.round((a - near) / (2 * Math.PI)) * 2 * Math.PI;
// Yaw convention of the road builder: yaw 0 faces -Z, a positive yaw turns toward -X.
const heading = (dx: number, dz: number): number => Math.atan2(-dx, -dz);

const minCurveLength = (curve: number): number => (Math.abs(curve) / ROAD_MAX_PIECE_YAW) * ROAD_PIECE_LENGTH;

interface State {
  x: number;
  z: number;
  h: number;
}

// The builder's pieces: each as long as L/n, pointing at the mid heading of its share of the turn.
function advance(from: State, length: number, curve: number, out?: CentrePoint[]): State {
  const n = Math.max(Math.ceil(length / ROAD_PIECE_LENGTH - 1e-9), Math.ceil(Math.abs(curve) / ROAD_MAX_PIECE_YAW - 1e-9), 1);
  let { x, z } = from;
  for (let i = 0; i < n; i++) {
    const yaw = from.h + ((i + 0.5) * curve) / n;
    x -= (length / n) * Math.sin(yaw);
    z -= (length / n) * Math.cos(yaw);
    if (out) out.push({ x, z, s: (out[out.length - 1]?.s ?? 0) + length / n });
  }
  return { x, z, h: from.h + curve };
}

export function centreLine(segments: readonly RoadDef[], start: { x: number; z: number } = { x: 0, z: 0 }): CentrePoint[] {
  const pts: CentrePoint[] = [{ x: start.x, z: start.z, s: 0 }];
  let state: State = { x: start.x, z: start.z, h: 0 };
  for (const seg of segments) state = advance(state, seg.length, seg.curve ?? 0, pts);
  return pts;
}

// Drops one-step bends under 3 degrees and merges adjacent opposite runs shorter than 40 m into one run.
export function mergeRuns(runs: readonly TurnRun[], arcAt: (vertex: number) => number): TurnRun[] {
  const mid = (j: number): number => (arcAt(j) + arcAt(j + 1)) / 2;
  const length = (r: TurnRun): number => mid(r.v2) - mid(r.v1 - 1);
  const out: TurnRun[] = [];
  for (const run of runs) {
    if (run.v1 === run.v2 && Math.abs(run.turn) < WEAK_TURN) continue;
    const prev = out[out.length - 1];
    if (prev && run.v1 === prev.v2 + 1 && Math.sign(prev.turn) !== Math.sign(run.turn) && length(prev) < SHORT_CURVE && length(run) < SHORT_CURVE) {
      out.pop();
      const net = prev.turn + run.turn;
      if (Math.abs(net) >= WEAK_TURN) out.push({ v1: prev.v1, v2: run.v2, turn: net });
      continue;
    }
    out.push(run);
  }
  return out;
}

function splitStraight(length: number): RoadDef[] {
  const n = Math.max(1, Math.ceil(length / MAX_SEGMENT - 1e-9));
  const each = round1(length / n);
  const out: RoadDef[] = [];
  let left = length;
  for (let i = 0; i < n; i++) {
    const l = i === n - 1 ? round1(left) : each;
    out.push({ type: 'road', length: l });
    left -= l;
  }
  return out;
}

export function fitRoute(route: Route, options: FitOptions = {}): { segments: SegmentDef[]; report: FitReport } {
  const lead = options.lead ?? options.edge ?? 80;
  const tail = options.tail ?? options.edge ?? 120;
  const cum = [0];
  for (let i = 1; i < route.length; i++) cum.push(cum[i - 1]! + Math.hypot(route[i]![0] - route[i - 1]![0], route[i]![1] - route[i - 1]![1]));
  const realLength = cum[cum.length - 1]!;
  const arcAt = (v: number): number => cum[v]!;
  const mid = (j: number): number => (cum[j]! + cum[j + 1]!) / 2;
  const pointAt = (s: number): [number, number] => {
    let i = 1;
    while (i < cum.length - 1 && cum[i]! < s) i++;
    const t = Math.min(1, Math.max(0, (s - cum[i - 1]!) / (cum[i]! - cum[i - 1]!)));
    return [route[i - 1]![0] + (route[i]![0] - route[i - 1]![0]) * t, route[i - 1]![1] + (route[i]![1] - route[i - 1]![1]) * t];
  };

  const steps = route.length - 1;
  const h: number[] = [];
  for (let j = 0; j < steps; j++) h.push(heading(route[j + 1]![0] - route[j]![0], route[j + 1]![1] - route[j]![1]));
  const turn = (v: number): number => wrapNear(h[v]! - h[v - 1]!, 0);

  const runs: TurnRun[] = [];
  for (let v = 1; v < steps; v++) {
    const d = turn(v);
    if (Math.abs(d) < STRAIGHT_TURN || mid(v - 1) < lead || mid(v) > realLength - tail) continue;
    const last = runs[runs.length - 1];
    if (last && last.v2 === v - 1 && Math.sign(last.turn) === Math.sign(d)) {
      last.v2 = v;
      last.turn += d;
    } else runs.push({ v1: v, v2: v, turn: d });
  }
  const merged = mergeRuns(runs, arcAt);
  if (lead > 0) {
    // Turns inside the straight lead are dropped, so one catch-up curve right after it takes the heading to the real one.
    let j = 1;
    while (j < steps - 1 && mid(j - 1) < lead) j++;
    const catchUp = wrapNear(h[j]!, 0);
    if (Math.abs(catchUp) >= STRAIGHT_TURN && (merged.length === 0 || merged[0]!.v1 > j)) merged.unshift({ v1: j, v2: j, turn: catchUp });
  }

  const out: RoadDef[] = [];
  let state: State = { x: route[0]![0], z: route[0]![1], h: 0 };
  let maxStretch = 0;
  let stretches = 0;
  const straightTo = (endArc: number): void => {
    const [qx, qz] = pointAt(endArc);
    let length = (qx - state.x) * -Math.sin(state.h) + (qz - state.z) * -Math.cos(state.h);
    if (length < 1e-6) return;
    if (length < SEGMENT_MIN_LENGTH) length = SEGMENT_MIN_LENGTH;
    for (const seg of splitStraight(length)) {
      out.push(seg);
      state = advance(state, seg.length, 0);
    }
  };

  if (lead > 0) {
    for (const seg of splitStraight(lead)) {
      out.push(seg);
      state = advance(state, seg.length, 0);
    }
  }
  merged.forEach((run, k) => {
    const s = mid(run.v1 - 1);
    const e = mid(run.v2);
    straightTo(s);
    const realCurve = e - s;
    const next = merged[k + 1];
    const nextStart = next ? mid(next.v1 - 1) : realLength;
    const aim = nextStart - e >= AIM_MIN ? pointAt(nextStart) : undefined;
    const lengthFor = (c: number): number => Math.ceil(Math.max(realCurve, minCurveLength(c)) * 10 - 1e-9) / 10;
    // The turn is re-based to the real heading at the curve's end, so earlier drift does not carry on.
    let base = wrapNear(h[run.v2]! - state.h, run.turn);
    if (Math.sign(base) !== Math.sign(run.turn) || Math.abs(base) < STRAIGHT_TURN) base = Math.sign(run.turn) * STRAIGHT_TURN;
    let c = base;
    if (aim) {
      // Re-aim the turn so the next straight leaves the curve end pointing at the real junction.
      for (let it = 0; it < 40; it++) {
        const end = advance(state, lengthFor(c), c);
        const want = wrapNear(heading(aim[0] - end.x, aim[1] - end.z) - state.h, base);
        let c2 = Math.min(base + AIM_LIMIT, Math.max(base - AIM_LIMIT, want));
        if (Math.sign(c2) !== Math.sign(run.turn) || Math.abs(c2) < STRAIGHT_TURN) c2 = Math.sign(run.turn) * STRAIGHT_TURN;
        if (Math.abs(c2 - c) < 1e-5) break;
        c = c + 0.7 * (c2 - c);
      }
    }
    c = Number(c.toFixed(4));
    const length = lengthFor(c);
    const stretch = length - realCurve;
    if (stretch > 0.5) stretches++;
    maxStretch = Math.max(maxStretch, stretch);
    out.push({ type: 'road', length, curve: c });
    state = advance(state, length, c);
  });
  straightTo(realLength);

  const lastSeg = out[out.length - 1];
  if (tail > 0 && (!lastSeg || lastSeg.curve || lastSeg.length < tail)) throw new Error(`The fit cannot end on a straight of ${tail} m`);

  const line = centreLine(out, { x: route[0]![0], z: route[0]![1] });
  let maxDeviation = 0;
  let maxNearest = 0;
  for (const p of line) {
    const [rx, rz] = pointAt(Math.min(p.s, realLength));
    maxDeviation = Math.max(maxDeviation, Math.hypot(p.x - rx, p.z - rz));
    let best = Infinity;
    for (let i = 1; i < route.length; i++) {
      const [ax, az] = route[i - 1]!;
      const [bx, bz] = route[i]!;
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.min(1, Math.max(0, ((p.x - ax) * dx + (p.z - az) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(p.x - (ax + dx * t), p.z - (az + dz * t)));
    }
    maxNearest = Math.max(maxNearest, best);
  }
  const last = line[line.length - 1]!;
  const end = route[route.length - 1]!;
  const report: FitReport = {
    segmentCount: out.length,
    totalLength: last.s,
    realLength,
    maxDeviation,
    maxNearest,
    endError: Math.hypot(last.x - end[0], last.z - end[1]),
    maxStretch,
    stretches,
  };
  return { segments: out, report };
}

export interface InsertSpec {
  name: string;
  fraction: number;
  // The straight run, in metres, that the built segments replace.
  length: number;
  segments: SegmentDef[];
  // Metres kept clear of every insert placed before this one (default 0).
  clearance?: number;
}

export interface InsertGroup {
  name: string;
  first: number;
  last: number;
}

export interface InsertPlacement {
  name: string;
  target: number;
  // Distance from the start to the middle of the insert.
  at: number;
  distance: number;
}

interface Item {
  defs: SegmentDef[];
  length: number;
  free: boolean;
  inserted?: boolean;
  name?: string;
}

const freeStraight = (def: SegmentDef): boolean => def.type === 'road' && !def.curve && !def.slope && !def.stop && !def.hazards;

// Replaces a stretch of the straight nearest each target; each side that stays is 0 or at least 15 m. Net length is unchanged.
// A spec's length is the horizontal advance of its segments, so a group may hold sloped members (a hill).
export function planInserts(segments: readonly SegmentDef[], specs: readonly InsertSpec[]): { segments: SegmentDef[]; placements: InsertPlacement[]; inserted: number[]; groups: InsertGroup[] } {
  let items: Item[] = segments.map((def) => ({ defs: [def], length: 'length' in def ? def.length : 0, free: freeStraight(def) }));
  const total = items.reduce((sum, item) => sum + item.length, 0);
  const placements: InsertPlacement[] = [];
  for (const spec of specs) {
    const target = spec.fraction * total;
    let best: { index: number; a: number; distance: number; at: number } | undefined;
    let start = 0;
    const clearance = spec.clearance ?? 0;
    const spans: [number, number][] = [];
    if (clearance > 0) {
      let at = 0;
      for (const item of items) {
        if (item.inserted) spans.push([at, at + item.length]);
        at += item.length;
      }
    }
    const clear = (from: number): boolean => spans.every(([s0, s1]) => from - s1 >= clearance - 1e-6 || s0 - (from + spec.length) >= clearance - 1e-6);
    items.forEach((item, index) => {
      const begin = start;
      start += item.length;
      const r = item.length - spec.length;
      if (!item.free || r < -EPS || index === 0 || index === items.length - 1) return;
      const isCurve = (it: Item | undefined): boolean => it?.defs[0]?.type === 'road' && !!it.defs[0].curve;
      const sideOk = (a: number): boolean => (a < EPS ? !isCurve(items[index - 1]) : true) && (r - a < EPS ? !isCurve(items[index + 1]) : true);
      const wanted = target - begin - spec.length / 2;
      // Interior offsets are rounded inward, so both sides stay at 15 m or more.
      const lo = Math.ceil(SEGMENT_MIN_LENGTH * 10) / 10;
      const hi = Math.floor((r - SEGMENT_MIN_LENGTH) * 10) / 10;
      const choices: number[] = r < EPS ? [0] : r < SEGMENT_MIN_LENGTH ? [] : r < 2 * SEGMENT_MIN_LENGTH ? [0, r] : [0, r, Math.min(hi, Math.max(lo, round1(wanted)))];
      // Just clear of each earlier insert, where the target's own offset is not.
      if (r >= 2 * SEGMENT_MIN_LENGTH) for (const [s0, s1] of spans) { choices.push(Math.min(hi, Math.max(lo, Math.ceil((s1 + clearance - begin) * 10) / 10))); choices.push(Math.min(hi, Math.max(lo, Math.floor((s0 - clearance - spec.length - begin) * 10) / 10))); }
      let a: number | undefined;
      for (const choice of choices) if (sideOk(choice) && clear(begin + choice) && (a === undefined || Math.abs(choice - wanted) < Math.abs(a - wanted))) a = choice;
      if (a === undefined) return;
      const at = begin + a + spec.length / 2;
      const distance = Math.abs(at - target);
      if (!best || distance < best.distance) best = { index, a, distance, at };
    });
    if (!best) throw new Error(`No straight of ${spec.length} m for ${spec.name}`);
    const item = items[best.index]!;
    const pre = best.a;
    const post = item.length - spec.length - pre;
    const road = (length: number): Item => ({ defs: [{ type: 'road', length: round1(length) }], length: round1(length), free: true });
    const replacement: Item[] = [];
    if (pre >= EPS) replacement.push(road(pre));
    replacement.push({ defs: spec.segments, length: spec.length, free: false, inserted: true, name: spec.name });
    if (post >= EPS) replacement.push(road(post));
    items = [...items.slice(0, best.index), ...replacement, ...items.slice(best.index + 1)];
    placements.push({ name: spec.name, target, at: best.at, distance: best.distance });
  }
  const inserted: number[] = [];
  const groups: InsertGroup[] = [];
  let count = 0;
  for (const item of items) {
    if (item.inserted) {
      for (let i = 0; i < item.defs.length; i++) inserted.push(count + i);
      groups.push({ name: item.name!, first: count, last: count + item.defs.length - 1 });
    }
    count += item.defs.length;
  }
  return { segments: items.flatMap((item) => item.defs), placements, inserted, groups };
}
