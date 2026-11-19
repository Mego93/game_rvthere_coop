import { describe, expect, it } from 'vitest';
import { GATES_SPACING, HAZARD_END_CLEARANCE, ROCK_CLEAR, SEGMENT_SPAWN_INSET } from '../constants';
import { VEHICLES } from '../vehicles';
import { BUMP_LENGTH, DIRT_RUN_MAX, DIRT_RUN_MIN, DIRT_SHARE, SOULEYMAN_SPACING } from '../constants';
import { getCourse, getCourseDef } from './index';
import { planMarrakech } from './marrakech.plan';
import { buildSegment, hazardSpan, type SegmentDef } from '../segments';
import { hazardRange, MUD_PLAN, planExtras, ROCKS_PLAN, spreadCount, TERRAIN_HAZARD_CLEAR, TERRAIN_DEEP_CLEAR, type Extras } from './marrakech.extras';

const road = (length: number, extra: Partial<Extract<SegmentDef, { type: 'road' }>> = {}): SegmentDef => ({ type: 'road', length, ...extra });
const longCourse = (): SegmentDef[] => Array.from({ length: 60 }, (_, i) => (i % 5 === 3 ? road(60, { curve: 0.2 }) : road(100 + (i % 3) * 20)));
const stopsOf = (segments: SegmentDef[], kind: 'fuel' | 'garage'): number[] => segments.flatMap((def, i) => (def.type === 'road' && def.stop?.kind === kind ? [i] : []));

describe('hazardRange', () => {
  it('keeps the spawn clearance and the end clearance', () => {
    const crate = hazardRange('crateWall', 100)!;
    expect(crate.lo).toBeGreaterThan(8);
    expect(crate.hi).toBeLessThanOrEqual(100 - HAZARD_END_CLEARANCE);
  });

  it('needs 65 m for gates of four and about 23 m for the rest', () => {
    expect(hazardRange('gates', 64)).toBeNull();
    const gates = hazardRange('gates', 65)!;
    expect(gates.lo).toBeCloseTo(12.22, 1);
    expect(gates.hi - gates.lo).toBeGreaterThanOrEqual(0);
    expect(hazardRange('crateWall', 22)).not.toBeNull();
    expect(hazardRange('roadblock', 23)).not.toBeNull();
    expect(hazardRange('roadblock', 21)).toBeNull();
    expect(gates.hi + 3 * GATES_SPACING).toBeLessThan(65);
  });

  it('every range builds', () => {
    for (const [kind, length] of [['crateWall', 22], ['roadblock', 23], ['gates', 65]] as const) {
      const r = hazardRange(kind, length)!;
      const hazard = kind === 'gates' ? { kind, along: (r.lo + r.hi) / 2, count: 4 } : { kind, along: (r.lo + r.hi) / 2 };
      expect(() => buildSegment({ type: 'road', length, hazards: [hazard] })).not.toThrow();
      for (const along of [r.lo, r.hi]) expect(() => buildSegment({ type: 'road', length, hazards: [kind === 'gates' ? { kind, along, count: 4 } : { kind, along }] })).not.toThrow();
    }
  });
});

describe('hazardRange for mud and rocks', () => {
  const spawnClear = SEGMENT_SPAWN_INSET + VEHICLES.rv.halfExtents.z;

  it('mud needs its length plus the spawn clearance at both ends', () => {
    expect(hazardRange('mud', 16 + 2 * spawnClear, 16)).toBeNull();
    const range = hazardRange('mud', 16 + 2 * spawnClear + 2, 16)!;
    expect(range.lo).toBeGreaterThanOrEqual(spawnClear);
    expect(range.hi + 16).toBeLessThanOrEqual(16 + 2 * spawnClear + 2 - spawnClear);
  });

  it('rocks need a segment of about 40 m and every range builds', () => {
    expect(hazardRange('rocks', 21)).toBeNull();
    const range = hazardRange('rocks', 40)!;
    expect(range).not.toBeNull();
    for (const along of [range.lo, range.hi]) expect(() => buildSegment({ type: 'road', length: 40, hazards: [{ kind: 'rocks', along, side: 1 }] })).not.toThrow();
    const mud = hazardRange('mud', 60, 20)!;
    for (const along of [mud.lo, mud.hi]) expect(() => buildSegment({ type: 'road', length: 60, hazards: [{ kind: 'mud', along, length: 20 }] })).not.toThrow();
  });
});

describe('MUD_PLAN and ROCKS_PLAN', () => {
  it('place 10 patches alternating 12, 16, 20 m and 12 rock groups, by fraction', () => {
    expect(MUD_PLAN).toHaveLength(10);
    expect(ROCKS_PLAN).toHaveLength(12);
    MUD_PLAN.forEach((p, i) => {
      expect(p.length).toBe([12, 16, 20][i % 3]);
      expect(p.fraction).toBeCloseTo(0.05 + 0.1 * i, 9);
    });
    expect(ROCKS_PLAN.map((p) => p.fraction)).toEqual([0.042, 0.125, 0.208, 0.292, 0.375, 0.458, 0.542, 0.625, 0.708, 0.792, 0.875, 0.958]);
    for (const p of [...MUD_PLAN, ...ROCKS_PLAN]) {
      expect(p.fraction).toBeGreaterThan(0);
      expect(p.fraction).toBeLessThan(1);
    }
  });
});

describe('spreadCount', () => {
  it('carries the remainder so the total is exact', () => {
    const counts = spreadCount([100, 100, 100, 100, 100, 100, 100], 3);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
    expect(counts.length).toBe(7);
  });
});

describe('planExtras', () => {
  const base = longCourse();
  const out = planExtras(base, [], { garageEvery: 1200 });
  const segs = out.segments;

  it('is deterministic and leaves the input alone', () => {
    expect(planExtras(base, [], { garageEvery: 1200 }).segments).toEqual(segs);
    expect(base.every((d) => d.type !== 'road' || (!d.stop && !d.hazards && !d.coins))).toBe(true);
  });

  it('puts stops only on flat straights of 60 m or more, at the middle, never first or last', () => {
    for (const kind of ['fuel', 'garage'] as const) {
      const idx = stopsOf(segs, kind);
      expect(idx.length).toBeGreaterThan(0);
      for (const i of idx) {
        const d = segs[i]! as Extract<SegmentDef, { type: 'road' }>;
        expect(i).toBeGreaterThan(0);
        expect(i).toBeLessThan(segs.length - 1);
        expect(d.curve).toBeUndefined();
        expect(d.length).toBeGreaterThanOrEqual(60);
        expect(Math.abs(d.stop!.along - d.length / 2)).toBeLessThanOrEqual(0.06);
        expect(d.hazards).toBeUndefined();
      }
    }
  });

  it('alternates fuel stop sides', () => {
    const sides = stopsOf(segs, 'fuel').map((i) => (segs[i] as { stop: { side: number } }).stop.side);
    sides.forEach((s, i) => i > 0 && expect(s).toBe(-sides[i - 1]!));
  });

  it('skips inserted segments', () => {
    const inserted = [3, 4, 5, 6, 7, 8];
    const r = planExtras(base, inserted, { garageEvery: 1200 });
    for (const i of inserted) {
      const d = r.segments[i]! as Extras;
      expect(d.stop).toBeUndefined();
      expect(d.hazards).toBeUndefined();
      expect(d.coins).toBeUndefined();
      expect(d.pickups).toBeUndefined();
    }
  });

  it('puts every segment through buildSegment', () => {
    for (const d of segs) expect(() => buildSegment(d)).not.toThrow();
  });

  it('throws when the fuel gap cannot be kept', () => {
    expect(() => planExtras(Array.from({ length: 30 }, () => road(50)), [])).toThrow(/fuel/i);
  });
});

describe('planExtras terrain exclusion', () => {
  const base = longCourse();
  const advance = (def: SegmentDef): number => -buildSegment(def).exit.pos.z;
  const starts = base.reduce<number[]>((acc, def, i) => [...acc, i === 0 ? 0 : acc[i - 1]! + advance(base[i - 1]!)], []);
  // Distance in metres from segment i to the span of segments first..last.
  const gap = (i: number, first: number, last: number): number => Math.max(starts[first]! - (starts[i]! + advance(base[i]!)), starts[i]! - (starts[last]! + advance(base[last]!)), 0);
  const index = (segments: SegmentDef[], pick: (d: Extract<SegmentDef, { type: 'road' }>) => boolean): number[] => segments.flatMap((d, i) => (d.type === 'road' && pick(d) ? [i] : []));

  it('keeps stops and hazards 120 m (150 m for a deep pit) from a terrain span, and still plans', () => {
    const terrain = [{ first: 20, last: 22 }, { first: 40, last: 40, deep: true }];
    const without = planExtras(base, [20, 21, 22, 40], { garageEvery: 1200 });
    const r = planExtras(base, [20, 21, 22, 40], { garageEvery: 1200, terrain });
    for (const i of index(r.segments, (d) => !!d.stop)) {
      expect(gap(i, 20, 22), `stop ${i}`).toBeGreaterThanOrEqual(TERRAIN_HAZARD_CLEAR);
      expect(gap(i, 40, 40), `stop ${i}`).toBeGreaterThanOrEqual(TERRAIN_DEEP_CLEAR);
    }
    for (const i of index(r.segments, (d) => !!d.hazards)) {
      expect(gap(i, 20, 22), `hazard ${i}`).toBeGreaterThanOrEqual(TERRAIN_HAZARD_CLEAR);
      expect(gap(i, 40, 40), `hazard ${i}`).toBeGreaterThanOrEqual(TERRAIN_DEEP_CLEAR);
    }
    expect(r.segments).not.toEqual(without.segments);
  });

  it('changes nothing without terrain', () => {
    expect(planExtras(base, [], { garageEvery: 1200, terrain: [] }).segments).toEqual(planExtras(base, [], { garageEvery: 1200 }).segments);
  });
});

describe('planExtras mud and rocks', () => {
  const base = longCourse();
  const mud = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85].map((fraction, i) => ({ fraction, length: [12, 16, 20][i % 3]! }));
  const rocks = [0.15, 0.4, 0.65, 0.9].map((fraction, i) => ({ fraction, side: (i % 2 === 0 ? -1 : 1) as -1 | 1 }));
  const options = { garageEvery: 1200, mud, rocks };
  const plain = planExtras(base, [], { garageEvery: 1200 });
  const out = planExtras(base, [], options);
  type Road = Extract<SegmentDef, { type: 'road' }>;
  const kindsIn = (segments: SegmentDef[], kind: string): number[] => segments.flatMap((d, i) => (d.type === 'road' && d.hazards?.some((h) => h.kind === kind) ? [i] : []));
  const advance = (def: SegmentDef): number => -buildSegment(def).exit.pos.z;
  const starts = base.reduce<number[]>((acc, def, i) => [...acc, i === 0 ? 0 : acc[i - 1]! + advance(base[i - 1]!)], []);

  it('places every patch and group, each on its own segment, only when asked', () => {
    expect(kindsIn(out.segments, 'mud')).toHaveLength(mud.length);
    expect(kindsIn(out.segments, 'rocks')).toHaveLength(rocks.length);
    expect(new Set([...kindsIn(out.segments, 'mud'), ...kindsIn(out.segments, 'rocks')]).size).toBe(mud.length + rocks.length);
    expect(kindsIn(plain.segments, 'mud')).toHaveLength(0);
    expect(kindsIn(plain.segments, 'rocks')).toHaveLength(0);
  });

  it('is deterministic and every segment builds', () => {
    expect(planExtras(base, [], options).segments).toEqual(out.segments);
    for (const def of out.segments) expect(() => buildSegment(def)).not.toThrow();
  });

  it('puts them on straights only, never on another hazard, debris or an inserted segment; keep 10 m from a pickup, 30 m from a stop pad (stop segments 150 m or longer) and rocks 5 m from every coin', () => {
    const inserted = [5, 6, 7, 8];
    const r = planExtras(base, inserted, options);
    for (const kind of ['mud', 'rocks']) {
      for (const i of kindsIn(r.segments, kind)) {
        const d = r.segments[i] as Road;
        expect(inserted).not.toContain(i);
        expect(d.curve, `${kind} ${i}`).toBeUndefined();
        expect(d.slope).toBeUndefined();
        expect(d.hazards).toHaveLength(1);
        const [a, b] = hazardSpan(d.hazards![0]!);
        for (const p of d.pickups ?? []) expect(p.along < a - 10 || p.along > b + 10).toBe(true);
        if (d.stop) {
          expect(d.length).toBeGreaterThanOrEqual(150);
          expect(a >= d.stop.along + 8 + 30 - 1e-9 || b <= d.stop.along - 8 - 30 + 1e-9).toBe(true);
        }
        expect(d.debris).toBeUndefined();
        if (kind === 'rocks') {
          const [a, b] = hazardSpan(d.hazards![0]!);
          for (const c of d.coins ?? []) expect(c.along < a - 5 || c.along > b + 5).toBe(true);
        }
      }
    }
  });

  it('keeps stops, coins, pickups and the original hazards where they were', () => {
    const strip = (segments: SegmentDef[]) =>
      segments.map((d) => {
        if (d.type !== 'road') return d;
        const kept = d.hazards?.filter((h) => h.kind !== 'mud' && h.kind !== 'rocks');
        const { hazards: _all, ...rest } = d;
        return kept?.length ? { ...rest, hazards: kept } : rest;
      });
    expect(strip(out.segments)).toEqual(strip(plain.segments));
    expect({ ...out.report, mud: [], rocks: [] }).toEqual(plain.report);
  });

  it('keeps rocks 40 m from every mud patch', () => {
    const spans = (kind: string): [number, number][] =>
      kindsIn(out.segments, kind).map((i) => {
        const h = (out.segments[i] as Road).hazards!.find((x) => x.kind === kind)!;
        const [a, b] = hazardSpan(h);
        return [starts[i]! + a, starts[i]! + b];
      });
    const gap = ([a, b]: [number, number], [c, d]: [number, number]): number => Math.max(c - b, a - d, 0);
    for (const rock of spans('rocks')) {
      for (const m of spans('mud')) expect(gap(rock, m)).toBeGreaterThanOrEqual(ROCK_CLEAR);
    }
  });

  it('keeps a patch 120 m from terrain like the other hazards', () => {
    const r = planExtras(base, [20, 21, 22], { garageEvery: 1200, terrain: [{ first: 20, last: 22 }], mud, rocks });
    for (const i of [...kindsIn(r.segments, 'mud'), ...kindsIn(r.segments, 'rocks')]) {
      const gap = Math.max(starts[20]! - (starts[i]! + advance(base[i]!)), starts[i]! - (starts[22]! + advance(base[22]!)), 0);
      expect(gap, `segment ${i}`).toBeGreaterThanOrEqual(120);
    }
  });
});

describe('planExtras mud and rocks beside stops and pickups', () => {
  const base = Array.from({ length: 80 }, (_, i) => (i % 5 === 3 ? road(60, { curve: 0.2 }) : road(170)));
  const mud = Array.from({ length: 30 }, (_, i) => ({ fraction: 0.02 + 0.03 * i, length: [12, 16, 20][i % 3]! }));
  const out = planExtras(base, [], { garageEvery: 1200, mud });
  type Road = Extract<SegmentDef, { type: 'road' }>;
  const shared = out.segments.flatMap((d, i) => (d.type === 'road' && d.hazards?.[0]?.kind === 'mud' && (d.stop || d.pickups) ? [i] : []));

  it('shares segments with stops and pickups, clear of them', () => {
    expect(shared.some((i) => (out.segments[i] as Road).stop)).toBe(true);
    expect(shared.some((i) => (out.segments[i] as Road).pickups)).toBe(true);
    for (const i of shared) {
      const d = out.segments[i] as Road;
      const [a, b] = hazardSpan(d.hazards![0]!);
      if (d.stop) expect(a >= d.stop.along + 38 - 1e-6 || b <= d.stop.along - 38 + 1e-6).toBe(true);
      for (const p of d.pickups ?? []) expect(p.along < a - 10 || p.along > b + 10).toBe(true);
      expect(() => buildSegment(d)).not.toThrow();
    }
  });
});

describe('marrakech dirt, bumps and figure checkpoints', () => {
  const defs = getCourseDef('marrakech')!.segments;
  const roads = defs.flatMap((d, i) => (d.type === 'road' ? [{ d, i }] : []));
  const roadTotal = roads.reduce((sum, r) => sum + r.d.length, 0);
  const runs = (() => {
    const out: number[] = [];
    let current = 0;
    for (const d of defs) {
      if (d.type === 'road' && d.surface === 'dirt') current += d.length;
      else if (current > 0) {
        out.push(current);
        current = 0;
      }
    }
    if (current > 0) out.push(current);
    return out;
  })();

  it('about DIRT_SHARE of the road length is dirt (0.30 to 0.40) and every run is 150 to 600 m', () => {
    const share = roads.filter((r) => r.d.surface === 'dirt').reduce((sum, r) => sum + r.d.length, 0) / roadTotal;
    expect(share).toBeGreaterThanOrEqual(0.3);
    expect(share).toBeLessThanOrEqual(0.4);
    expect(Math.abs(share - DIRT_SHARE)).toBeLessThan(0.05);
    expect(runs.length).toBeGreaterThan(5);
    for (const run of runs) {
      expect(run).toBeGreaterThanOrEqual(DIRT_RUN_MIN);
      expect(run).toBeLessThanOrEqual(DIRT_RUN_MAX);
    }
  });

  it('dirt is on flat road segments only: no slope, no first or last', () => {
    for (const { d, i } of roads) {
      if (d.surface !== 'dirt') continue;
      expect(d.slope).toBeUndefined();
      expect(i).toBeGreaterThan(0);
      expect(i).toBeLessThan(defs.length - 1);
    }
  });

  it('bumps sit on straights of 60 m or more, 1 to 3 each, never with a stop, hazard, debris, slope or curve', () => {
    const bumped = roads.filter((r) => r.d.bumps !== undefined);
    expect(bumped.length).toBeGreaterThan(10);
    for (const { d, i } of bumped) {
      expect(d.bumps).toBeGreaterThanOrEqual(1);
      expect(d.bumps).toBeLessThanOrEqual(3);
      expect(d.length).toBeGreaterThanOrEqual(60);
      expect(d.curve ?? 0).toBe(0);
      expect(d.slope ?? 0).toBe(0);
      expect(d.stop).toBeUndefined();
      expect(d.hazards).toBeUndefined();
      expect(d.debris).toBeUndefined();
      expect(i).toBeGreaterThan(0);
      expect(i).toBeLessThan(defs.length - 1);
    }
  });

  it('the built course holds those bumps as ground boxes, BUMP_LENGTH long', () => {
    const planned = roads.reduce((sum, r) => sum + (r.d.bumps ?? 0), 0);
    const boxes = getCourse('marrakech').ground.filter((g) => g.halfExtents.z === BUMP_LENGTH / 2);
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.length).toBeLessThanOrEqual(planned);
    expect(boxes.length).toBeGreaterThanOrEqual(planned - 10);
  });

  it('the generated course is what the planner makes (regenerate with scripts/route/buildMarrakech.ts)', () => {
    expect(JSON.parse(JSON.stringify(planMarrakech().segments))).toEqual(JSON.parse(JSON.stringify(defs)));
  }, 60000);

  it('figure checkpoints: the first, then one about every 2000 m, one segment either way', () => {
    const course = getCourse('marrakech');
    expect(course.checkpoints[0]!.figure).toBe(true);
    const figures = course.checkpoints.flatMap((c, i) => (c.figure ? [i] : []));
    expect(figures.length).toBeGreaterThan(8);
    const routeAt = (index: number): number => {
      const spawn = course.checkpoints[index]!.spawn.pos;
      let bestGap = Infinity;
      let cum = 0;
      let at = 0;
      course.route.forEach(([x, z], k) => {
        if (k > 0) cum += Math.hypot(x - course.route[k - 1]![0], z - course.route[k - 1]![1]);
        const gap = Math.hypot(spawn.x - x, spawn.z - z);
        if (gap < bestGap) {
          bestGap = gap;
          at = cum;
        }
      });
      return at;
    };
    const longest = Math.max(...roads.map((r) => r.d.length));
    figures.slice(1).forEach((index, n) => {
      expect(Math.abs(routeAt(index) - routeAt(figures[n]!) - SOULEYMAN_SPACING)).toBeLessThanOrEqual(longest);
    });
    expect(course.checkpoints.filter((c) => !c.figure).length).toBeGreaterThan(figures.length);
  });
});
