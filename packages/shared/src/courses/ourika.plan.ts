import { MOUNTAIN_ANCHOR_SLOPE, MOUNTAIN_CLIMB_SCALE, MOUNTAIN_FLAT_BELOW, MOUNTAIN_FLAT_LINK, MOUNTAIN_MAX_SLOPE, ROAD_WIDTH, BOULDER_EDGE_INSET, SEGMENT_MIN_LENGTH } from '../constants';
import { degToRad } from '../math';
import { buildSegment, type Placement, type SegmentDef } from '../segments';
import { centreLine, fitRoute } from './fit';
import { planExtras, type ExtrasReport, type MudPlan, type RocksPlan } from './marrakech.extras';
import { OURIKA_ROUTE } from './ourika.route';

type RoadDef = Extract<SegmentDef, { type: 'road' }>;

// The 3.5 km road gets a share of marrakech's mud and rocks.
const MOUNTAIN_MUD: readonly MudPlan[] = [
  { fraction: 0.35, length: 12 },
];
const MOUNTAIN_ROCKS: readonly RocksPlan[] = [
  { fraction: 0.2, side: -1 },
  { fraction: 0.8, side: 1 },
];
const END_ROAD = 80;
// rad, the largest bend taken as noise; m, the longest straight made of merged pieces.
const MOUNTAIN_MERGE_CURVE = 0.05;
const MAX_STRAIGHT = 400;
// rad, the largest bend a fuel stop may straighten.
const MOUNTAIN_STOP_BEND = 0.25;
// m from one fuel site to the next: at least, and at most.
const STOP_REACH_MIN = 600;
const STOP_REACH_MAX = 1450;
const round1 = (v: number): number => Math.round(v * 10) / 10;
const round4 = (v: number): number => Math.round(v * 10000) / 10000;
const boulder = (along: number, side: -1 | 1): Placement => ({ kind: 'boulder', along, lateral: side * (ROAD_WIDTH / 2 - BOULDER_EDGE_INSET) });

export interface OurikaReport {
  // m: the real route, how far the built centre line strays from it, and where it ends against the real end.
  realLength: number;
  maxNearest: number;
  endError: number;
  // m, the sum of every rise, and the net rise from start to end.
  climb: number;
  net: number;
  // Straights per whole-degree slope band, by the lower edge (-14 ... 13).
  histogram: Record<number, number>;
  segmentCount: number;
  total: number;
  fuel: ExtrasReport['fuel'];
  extras: ExtrasReport;
}

// The Ourika route (x, z, height) as mountain segments: fit, slope each straight, flat links, boulders, extras, a flat 80 m end road.
export function planOurika(data: readonly (readonly [number, number, number])[] = OURIKA_ROUTE): { segments: SegmentDef[]; report: OurikaReport } {
  // The real road ends in a bend, so the flat end road (the square) is a straight run on from its last heading.
  const [px, pz] = data[data.length - 2]!;
  const [lx, lz, ly] = data[data.length - 1]!;
  const norm = Math.hypot(lx - px, lz - pz);
  const route = [...data, ...Array.from({ length: (END_ROAD + 40) / 20 }, (_, i): [number, number, number] => [lx + ((lx - px) / norm) * 20 * (i + 1), lz + ((lz - pz) / norm) * 20 * (i + 1), ly])];
  const fit = fitRoute(
    route.map(([x, z]) => [x, z] as const),
    { tail: END_ROAD },
  );
  // Height at an arc length of the real route; the fitted length differs from it by a stretch.
  const cum = [0];
  for (let i = 1; i < route.length; i++) cum.push(cum[i - 1]! + Math.hypot(route[i]![0] - route[i - 1]![0], route[i]![1] - route[i - 1]![1]));
  const fitted = fit.segments.reduce((sum, s) => sum + ('length' in s ? s.length : 0), 0);
  const heightAt = (s: number): number => {
    const t = Math.min(cum[cum.length - 1]!, Math.max(0, (s * cum[cum.length - 1]!) / fitted));
    let i = 1;
    while (i < cum.length - 1 && cum[i]! < t) i++;
    const u = (t - cum[i - 1]!) / (cum[i]! - cum[i - 1]!);
    return route[i - 1]![2] + (route[i]![2] - route[i - 1]![2]) * u;
  };

  // Bends of a few degrees are the 20 m polyline's noise: they join the straight beside them, so the road keeps straights long enough for stops.
  // The turn taken out of a bend is added to the next bend, so the heading comes back there.
  const input: RoadDef[] = [];
  let carry = 0;
  for (const def of fit.segments as RoadDef[]) {
    const noise = def.curve !== undefined && Math.abs(def.curve) <= MOUNTAIN_MERGE_CURVE;
    if (noise) carry += def.curve!;
    const seg: RoadDef = noise ? { type: 'road', length: def.length } : { ...def };
    if (seg.curve) {
      seg.curve = round4(seg.curve + carry);
      carry = 0;
    }
    const prev = input[input.length - 1];
    if (prev && !prev.curve && !seg.curve && prev.length + seg.length <= MAX_STRAIGHT) prev.length = round1(prev.length + seg.length);
    else input.push(seg);
  }
  // Takes a gentle bend out of the road (its turn goes to the next bend).
  const straighten = (site: RoadDef): void => {
    let turn = site.curve!;
    delete site.curve;
    for (const next of input.slice(input.indexOf(site) + 1)) {
      if (!next.curve) continue;
      next.curve = round4(next.curve + turn);
      turn = 0;
      break;
    }
  };
  // The last straight ends on its own flat 80 m road.
  const last = input[input.length - 1]!;
  if (last.length > END_ROAD) {
    last.length = Math.round((last.length - END_ROAD) * 1000) / 1000;
    input.push({ type: 'road', length: END_ROAD });
  }

  // Slopes from the height change over each straight's span (the start and end roads stay flat). Curves stay flat, so each gives half its climb to the straight on either side.
  let at = 0;
  input.forEach((s, i) => {
    const from = at;
    at += s.length;
    if (s.curve || i === 0 || i === input.length - 1) return;
    const before = input[i - 1]?.curve ? input[i - 1]!.length / 2 : 0;
    const after = input[i + 1]?.curve ? input[i + 1]!.length / 2 : 0;
    const degrees = (Math.atan((MOUNTAIN_CLIMB_SCALE * (heightAt(at + after) - heightAt(from - before))) / s.length) * 180) / Math.PI;
    const slope = Math.abs(degrees) < MOUNTAIN_FLAT_BELOW ? 0 : round1(Math.max(-MOUNTAIN_MAX_SLOPE, Math.min(MOUNTAIN_MAX_SLOPE, degrees)));
    if (slope === 0) return;
    s.slope = slope;
    // The route a sloped straight advances is its horizontal run, which must stay at least SEGMENT_MIN_LENGTH.
    s.length = Math.max(s.length, Math.ceil((SEGMENT_MIN_LENGTH / Math.cos(degToRad(slope))) * 100) / 100);
  });

  // A flat link wherever a curve meets a sloped straight.
  const link = (): RoadDef[] => {
    const out: RoadDef[] = [];
    input.forEach((s, i) => {
      const prev = input[i - 1];
      if (prev && ((prev.curve && s.slope) || (prev.slope && s.curve))) out.push({ type: 'road', length: MOUNTAIN_FLAT_LINK });
      out.push(s);
    });
    return out;
  };
  // Flat sites for the fuel stops: walking on from the last site, the farthest straight of 60 m or more whose middle lies STOP_REACH_MIN to STOP_REACH_MAX m on is flattened. A flattened straight takes its links with it, so the walk is run again.
  const flattened = new Set<RoadDef>();
  for (let pass = 0; pass < 8; pass++) {
    const trial = link();
    const starts: number[] = [];
    let total = 0;
    for (const s of trial) {
      starts.push(total);
      total += s.length;
    }
    let from = 0;
    let added = false;
    while (total - from > STOP_REACH_MAX) {
      // The farthest straight in reach, else the farthest gentle bend.
      let pick = -1;
      for (const bends of [false, true]) {
        trial.forEach((s, i) => {
          const m = starts[i]! + s.length / 2;
          if (Boolean(s.curve) !== bends || (bends && Math.abs(s.curve!) > MOUNTAIN_STOP_BEND)) return;
          if (s.length < 60 || i === 0 || i === trial.length - 1 || m < (from === 0 ? 0 : from + STOP_REACH_MIN) || m > from + STOP_REACH_MAX) return;
          if (pick < 0 || m > starts[pick]! + trial[pick]!.length / 2) pick = i;
        });
        if (pick >= 0) break;
      }
      if (pick < 0 && added) break;
      if (pick < 0) throw new Error(`No straight for a fuel stop after ${Math.round(from)} m`);
      const site = trial[pick]!;
      if ((site.slope || site.curve) && !flattened.has(site)) {
        if (site.curve) straighten(site);
        delete site.slope;
        flattened.add(site);
        added = true;
      }
      from = starts[pick]! + site.length / 2;
    }
    if (!added) break;
  }
  const linked = link();

  // Boulders on the steep straights, as hillSegments places them (the pair moves in on a short one).
  for (const s of linked) {
    if (Math.abs(s.slope ?? 0) < MOUNTAIN_ANCHOR_SLOPE) continue;
    const [a, b] = s.length >= 60 ? [20, 45] : [round1(s.length / 3), round1((2 * s.length) / 3)];
    s.anchors = [boulder(a, -1), boulder(b, 1)];
  }

  const extras = planExtras(linked, [], { mud: MOUNTAIN_MUD, rocks: MOUNTAIN_ROCKS, seed: 'mountain', onBends: true });
  const segments = extras.segments;

  let climb = 0;
  let net = 0;
  let total = 0;
  const histogram: Record<number, number> = {};
  for (const s of segments as RoadDef[]) {
    total += -buildSegment(s).exit.pos.z;
    const rise = s.length * Math.sin(degToRad(s.slope ?? 0));
    net += rise;
    if (rise > 0) climb += rise;
    if (s.slope) {
      const band = Math.floor(s.slope);
      histogram[band] = (histogram[band] ?? 0) + 1;
    }
  }
  return { segments, report: { ...deviation(segments as RoadDef[], route), climb, net, histogram, segmentCount: segments.length, total: extras.report.total, fuel: extras.report.fuel, extras: extras.report } };
}

function deviation(segments: readonly RoadDef[], route: readonly (readonly number[])[]): { realLength: number; maxNearest: number; endError: number } {
  const line = centreLine(segments);
  let realLength = 0;
  for (let i = 1; i < route.length; i++) realLength += Math.hypot(route[i]![0]! - route[i - 1]![0]!, route[i]![1]! - route[i - 1]![1]!);
  let maxNearest = 0;
  for (const p of line) {
    let best = Infinity;
    for (let i = 1; i < route.length; i++) {
      const ax = route[i - 1]![0]!;
      const az = route[i - 1]![1]!;
      const dx = route[i]![0]! - ax;
      const dz = route[i]![1]! - az;
      const t = Math.min(1, Math.max(0, ((p.x - ax) * dx + (p.z - az) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(p.x - ax - dx * t, p.z - az - dz * t));
    }
    maxNearest = Math.max(maxNearest, best);
  }
  const end = route[route.length - 1]!;
  const last = line[line.length - 1]!;
  return { realLength, maxNearest, endError: Math.hypot(last.x - end[0]!, last.z - end[1]!) };
}
