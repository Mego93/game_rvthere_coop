import { describe, expect, it } from 'vitest';
import { BIG_HILL_SLOPE, HILL_SLOPE, PIT_DEEP_EXIT, WINCH_MAX_LENGTH } from '../constants';
import { degToRad } from '../math';
import { buildSegment, type SegmentDef } from '../segments';
import { buildCourse } from './build';
import { fitRoute } from './fit';
import { TERRAIN_DEEP_CLEAR, TERRAIN_HAZARD_CLEAR } from './marrakech.extras';
import { MARRAKECH_SEGMENTS } from './marrakech.generated';
import { MARRAKECH_TERRAIN, MARRAKECH_TERRAIN_SHIFTS, MAX_TERRAIN_DISTANCE, planMarrakech } from './marrakech.plan';
import { CREST_AND_PULL, PIT_GAUNTLET, RUBBLE_RUN } from './parkour';
import { MARRAKECH_ROUTE } from './marrakech.route';
import { DEEP_PIT, HILL_RUN, hillSegments, SHALLOW_PIT } from './terrain';

type RoadDef = Extract<SegmentDef, { type: 'road' }>;

const segments = MARRAKECH_SEGMENTS;
const advance = segments.map((def) => -buildSegment(def).exit.pos.z);
const start = advance.map((_, i) => advance.slice(0, i).reduce((a, b) => a + b, 0));
const total = advance.reduce((a, b) => a + b, 0);

interface Span {
  kind: 'hill' | 'bigHill' | 'pit' | 'deepPit' | 'parkour' | 'parkourPit';
  first: number;
  last: number;
}

// The parkour sections as spans; the hills and pits inside them are part of a section, not terrain of their own.
const sections: Span[] = [
  { kind: 'parkour', defs: RUBBLE_RUN },
  { kind: 'parkour', defs: CREST_AND_PULL },
  { kind: 'parkourPit', defs: PIT_GAUNTLET },
].map(({ kind, defs }) => {
  const first = segments.findIndex((_, i) => defs.every((d, k) => JSON.stringify(segments[i + k]) === JSON.stringify(d)));
  return { kind: kind as Span['kind'], first, last: first + defs.length - 1 };
});
const inSection = (i: number): boolean => sections.some((s) => i >= s.first && i <= s.last);

// A hill is a climb, a flat crest and a descent between flats; the climb's slope tells the big hill.
const found: Span[] = [];
segments.forEach((def, i) => {
  if (def.type === 'pit') found.push({ kind: def.gradientOut ? 'deepPit' : 'pit', first: i, last: i });
  const next = segments[i + 2];
  if (def.type === 'road' && def.slope && def.slope > 0 && next?.type === 'road' && next.slope === -def.slope) found.push({ kind: def.slope === BIG_HILL_SLOPE ? 'bigHill' : 'hill', first: i - 1, last: i + 3 });
});
const own = found.filter((s) => !inSection(s.first));
// Every terrain span: the standalone hills and pits, then the three sections.
const spans: Span[] = [...own, ...sections];
const of = (kind: Span['kind']): Span[] => own.filter((s) => s.kind === kind);
const gap = (i: number, s: Span): number => Math.max(start[s.first]! - (start[i]! + advance[i]!), start[i]! - (start[s.last]! + advance[s.last]!), 0);

describe('terrain definitions (R4, B4, B8)', () => {
  it('pins the shallow and deep pit and the hill slopes', () => {
    expect(SHALLOW_PIT).toEqual({ type: 'pit', depth: 0.6, gradient: 10, floor: 6, anchors: 0 });
    expect(DEEP_PIT).toEqual({ type: 'pit', depth: 2, gradient: 15, gradientOut: PIT_DEEP_EXIT, floor: 8, anchors: 6 });
    expect(PIT_DEEP_EXIT).toBe(28);
    expect([HILL_SLOPE, BIG_HILL_SLOPE]).toEqual([8, 14]);
  });

  it('builds a hill of flat 15, climb 60 m, crest 15, descent 60 m, flat 15, level at both ends', () => {
    for (const slope of [HILL_SLOPE, BIG_HILL_SLOPE]) {
      const hill = hillSegments(slope);
      expect(hill.map((d) => (d as RoadDef).slope ?? 0)).toEqual([0, slope, 0, -slope, 0]);
      expect(hill.map((d) => -buildSegment(d).exit.pos.z)).toEqual([15, HILL_RUN, 15, HILL_RUN, 15].map((v) => expect.closeTo(v, 2)));
      expect(hill.reduce((sum, d) => sum + buildSegment(d).exit.pos.y, 0)).toBeCloseTo(0, 2);
    }
  });

  it('puts boulders only on the big hill: the climb at 20 m and 45 m and the crest, alternating sides', () => {
    expect(hillSegments(HILL_SLOPE).every((d) => !(d as RoadDef).anchors)).toBe(true);
    const big = hillSegments(BIG_HILL_SLOPE) as RoadDef[];
    expect(big[1]!.anchors!.map((a) => [a.along, Math.sign(a.lateral)])).toEqual([[20, -1], [45, 1]]);
    expect(big[2]!.anchors!.map((a) => Math.sign(a.lateral))).toEqual([-1]);
  });
});

describe('T7 the terrain in the generated course', () => {
  it('has 3 hills, 1 big hill, 4 shallow pits and 2 deep pits of its own and the three parkour sections, as the plan builds them', () => {
    expect(sections.map((s) => s.kind)).toEqual(['parkour', 'parkour', 'parkourPit']);
    expect(sections.every((s) => s.first > 0)).toBe(true);
    // Counting the sections' own climbs and pits: 8 bigger or smaller hills and pits in all, 6 shallow-or-deep pits by type.
    expect(found.filter((s) => s.kind === 'bigHill')).toHaveLength(2);
    expect(found.filter((s) => s.kind === 'pit')).toHaveLength(5);
    expect(found.filter((s) => s.kind === 'deepPit')).toHaveLength(3);
    expect(of('hill')).toHaveLength(3);
    expect(of('bigHill')).toHaveLength(1);
    expect(of('pit')).toHaveLength(4);
    expect(of('deepPit')).toHaveLength(2);
    for (const s of of('hill')) expect(segments.slice(s.first, s.last + 1)).toEqual(hillSegments(HILL_SLOPE));
    for (const s of of('bigHill')) expect(segments.slice(s.first, s.last + 1)).toEqual(hillSegments(BIG_HILL_SLOPE));
    for (const s of of('pit')) expect(segments[s.first]).toEqual(SHALLOW_PIT);
    for (const s of of('deepPit')) expect(segments[s.first]).toEqual(DEEP_PIT);
  });

  it('puts each feature within 200 m of its target, the exceptions within 1.3 km, and the shifts stay small', () => {
    const { placements } = planMarrakech();
    const terrain = placements.slice(-MARRAKECH_TERRAIN.length);
    expect(terrain.map((p) => p.name)).toEqual(MARRAKECH_TERRAIN.map((e) => e.name));
    // The 0.55 hill: the roadworks insert at 0.52 takes the nearest straight of 165 m (alone it would still be 585 m out), so it goes 1,085 m away.
    // The 0.15 hill and the 0.27 deep pit, and the parkour sections, were moved by the 28d search (the fuel chain and the garages need room around the sections): up to MAX_TERRAIN_DISTANCE.
    const far = (e: (typeof MARRAKECH_TERRAIN)[number]): boolean => e.name.startsWith('parkour') || (e.name === 'hill' && [0.15, 0.55].includes(e.fraction)) || (e.name === 'deepPit' && e.fraction === 0.27);
    terrain.forEach((p, i) => expect(p.distance, `${p.name} ${MARRAKECH_TERRAIN[i]!.fraction}`).toBeLessThanOrEqual(far(MARRAKECH_TERRAIN[i]!) ? MAX_TERRAIN_DISTANCE : 200));
    expect(MARRAKECH_TERRAIN_SHIFTS).toHaveLength(MARRAKECH_TERRAIN.length);
    MARRAKECH_TERRAIN_SHIFTS.forEach((shift, i) => expect(Math.abs(shift), `shift ${i}`).toBeLessThanOrEqual(far(MARRAKECH_TERRAIN[i]!) ? MAX_TERRAIN_DISTANCE : 200));
  });

  it('keeps the new terrain 120 m from the sand, alley, roadworks and ford group', () => {
    const old = segments.flatMap((def, i) => (['sand', 'alley', 'roadworks', 'ford'].includes(def.type) ? [{ first: i, last: def.type === 'ford' ? i + 2 : i }] : []));
    expect(old).toHaveLength(5);
    for (const s of spans) for (const o of old) {
      const between = Math.max(start[o.first]! - (start[s.last]! + advance[s.last]!), start[s.first]! - (start[o.last]! + advance[o.last]!));
      expect(between, `${s.kind} ${s.first} and insert ${o.first}`).toBeGreaterThanOrEqual(TERRAIN_HAZARD_CLEAR - 1e-6);
    }
  });

  it('keeps terrain on straights: never the first or last segment, never next to a curve', () => {
    for (const s of spans) {
      expect(s.first).toBeGreaterThan(0);
      expect(s.last).toBeLessThan(segments.length - 1);
      for (const i of [s.first - 1, s.last + 1]) {
        const near = segments[i]!;
        expect(near.type === 'road' && (near.curve || near.slope), `neighbour ${i}`).toBeFalsy();
      }
    }
  });

  it('keeps every stop and hazard 120 m (150 m of a deep pit) from a hill or pit, and terrain 120 m from other terrain', () => {
    segments.forEach((def, i) => {
      // The sections' own hazards sit inside them.
      if (def.type !== 'road' || !(def.stop || def.hazards) || inSection(i)) return;
      for (const s of spans) expect(gap(i, s), `segment ${i} to ${s.kind} at ${s.first}`).toBeGreaterThanOrEqual(s.kind === 'deepPit' || s.kind === 'parkourPit' ? TERRAIN_DEEP_CLEAR : TERRAIN_HAZARD_CLEAR);
    });
    // The gaps between the pits and hills inside a section are the section's own.
    for (const a of spans) {
      for (const b of spans) {
        if (a === b) continue;
        const between = Math.max(start[b.first]! - (start[a.last]! + advance[a.last]!), start[a.first]! - (start[b.last]! + advance[b.last]!));
        expect(between, `${a.kind} ${a.first} and ${b.kind} ${b.first}`).toBeGreaterThanOrEqual(TERRAIN_HAZARD_CLEAR - 1e-6);
      }
    }
  });

  it('keeps the fuel gaps within 1.5 km', () => {
    const stops = [0, ...segments.flatMap((def, i) => (def.type === 'road' && def.stop?.kind === 'fuel' ? [start[i]! + advance[i]! / 2] : [])), total];
    for (let i = 1; i < stops.length; i++) expect(stops[i]! - stops[i - 1]!).toBeLessThanOrEqual(1500);
  });

  it('gives each added segment its own checkpoint', () => {
    const course = buildCourse({ id: 'marrakech-terrain', segments, targetTime: 1800 });
    expect(course.checkpoints).toHaveLength(segments.length);
    // 52 inserted segments in 18 inserts (the parkour sections add 19 in 3), each split off a straight that leaves up to two remainders: 212 fitted segments grow to 281.
    expect(course.checkpoints.length - fitRoute(MARRAKECH_ROUTE).segments.length).toBe(69);
  });
});

describe('B2 anchors within the winch length', () => {
  it('has a boulder within 30 m of every point of the big hill climb', () => {
    const climb = hillSegments(BIG_HILL_SLOPE)[1] as RoadDef;
    const course = buildCourse({ id: 'big-hill', segments: [{ type: 'road', length: 40 }, ...hillSegments(BIG_HILL_SLOPE), { type: 'road', length: 40 }, { type: 'road', length: 40 }], targetTime: 100 });
    expect(course.anchors).toHaveLength(3);
    const pitch = degToRad(BIG_HILL_SLOPE);
    // The climb starts 40 m + the 15 m flat in.
    for (let t = 0; t <= climb.length + 1e-9; t += 0.5) {
      const p = { x: 0, y: t * Math.sin(pitch), z: -(55 + t * Math.cos(pitch)) };
      const nearest = Math.min(...course.anchors.map((a) => Math.hypot(a.pose.pos.x - p.x, a.pose.pos.y - p.y, a.pose.pos.z - p.z)));
      expect(nearest, `climb ${t} m`).toBeLessThanOrEqual(WINCH_MAX_LENGTH);
    }
  });

  it('has a boulder within 30 m of every point of a deep pit from the end of its approach', () => {
    const seg = buildSegment(DEEP_PIT);
    const end = polylineEnd(seg.route);
    for (let along = 15; along <= end + 1e-9; along += 0.5) {
      const p = seg.surfaceAt(Math.min(along, end)).pos;
      const nearest = Math.min(...seg.anchors.map((a) => Math.hypot(a.pose.pos.x - p.x, a.pose.pos.y - p.y, a.pose.pos.z - p.z)));
      expect(nearest, `along ${along}`).toBeLessThanOrEqual(WINCH_MAX_LENGTH);
    }
  });
});

function polylineEnd(route: readonly (readonly [number, number])[]): number {
  let sum = 0;
  for (let i = 1; i < route.length; i++) sum += Math.hypot(route[i]![0] - route[i - 1]![0], route[i]![1] - route[i - 1]![1]);
  return sum;
}
