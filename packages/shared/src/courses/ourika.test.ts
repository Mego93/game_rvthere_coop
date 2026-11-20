import { describe, expect, it } from 'vitest';
import { MOUNTAIN_ANCHOR_SLOPE, MOUNTAIN_FLAT_LINK, MOUNTAIN_MAX_SLOPE, STAGE_MAX_LENGTH, STAGE_MIN_LENGTH } from '../constants';
import { buildSegment, type SegmentDef } from '../segments';
import { buildCourse } from './build';
import { getCourse, getCourseDef } from './index';
import { FUEL_MAX_GAP } from './marrakech.extras';
import { OURIKA_SEGMENTS } from './ourika.generated';
import { planOurika } from './ourika.plan';
import { OURIKA_ROUTE } from './ourika.route';

type RoadDef = Extract<SegmentDef, { type: 'road' }>;
const roads = OURIKA_SEGMENTS.filter((s): s is RoadDef => s.type === 'road');
const advance = (s: SegmentDef): number => -buildSegment(s).exit.pos.z;
const length = OURIKA_SEGMENTS.reduce((sum, s) => sum + advance(s), 0);

describe('OURIKA_ROUTE', () => {
  it('starts at the origin with the first 60 m along -Z', () => {
    expect([...OURIKA_ROUTE[0]!]).toEqual([0, 0, 0]);
    expect(Math.abs(OURIKA_ROUTE[3]![0])).toBeLessThanOrEqual(0.2);
    expect(OURIKA_ROUTE[3]![1]).toBeCloseTo(-60, 0);
  });

  it('is 3500 m long within 5 %, a point every 20 m of road (a chord at a hairpin is shorter)', () => {
    let total = 0;
    for (let i = 1; i < OURIKA_ROUTE.length; i++) {
      const step = Math.hypot(OURIKA_ROUTE[i]![0] - OURIKA_ROUTE[i - 1]![0], OURIKA_ROUTE[i]![1] - OURIKA_ROUTE[i - 1]![1]);
      expect(step).toBeLessThanOrEqual(20.5);
      expect(step).toBeGreaterThanOrEqual(10);
      total += step;
    }
    expect(Math.abs(total - 3500) / 3500).toBeLessThan(0.05);
  });

  it('holds only local metres and heights, no coordinates', () => {
    for (const [x, z, y] of OURIKA_ROUTE) {
      expect(Math.abs(x)).toBeLessThan(5000);
      expect(Math.abs(z)).toBeLessThan(5000);
      expect(Math.abs(y)).toBeLessThan(200);
    }
  });
});

describe('mountain course (C4)', () => {
  it('is generated from the route by planOurika', () => {
    expect(planOurika().segments).toEqual(OURIKA_SEGMENTS);
  });

  it('builds with the registered fields, and the length fits a stage', () => {
    const def = getCourseDef('mountain')!;
    expect(def).toMatchObject({ id: 'mountain', label: '3 Mountains', theme: 'mountain', targetTime: 300, ambient: true, corridor: true });
    expect(() => buildCourse(def)).not.toThrow();
    expect(getCourse('mountain').id).toBe('mountain');
    expect(length).toBeGreaterThanOrEqual(STAGE_MIN_LENGTH);
    expect(length).toBeLessThanOrEqual(STAGE_MAX_LENGTH);
  });

  it('has no curve next to a slope, and curves are flat', () => {
    roads.forEach((s, i) => {
      if (s.curve) expect(s.slope ?? 0).toBe(0);
      const next = roads[i + 1];
      if (next) expect(Boolean(s.curve && next.slope) || Boolean(s.slope && next.curve)).toBe(false);
    });
  });

  it('puts a flat link between a curve and a sloped straight', () => {
    expect(roads.some((s) => s.length === MOUNTAIN_FLAT_LINK && !s.slope && !s.curve)).toBe(true);
  });

  it('keeps every slope within 14 degrees, in tenths', () => {
    for (const s of roads) {
      expect(Math.abs(s.slope ?? 0)).toBeLessThanOrEqual(MOUNTAIN_MAX_SLOPE);
      expect(Math.abs((s.slope ?? 0) * 10 - Math.round((s.slope ?? 0) * 10))).toBeLessThan(1e-6);
    }
  });

  it('gives straights of 10 degrees or more two boulders, and others none', () => {
    const steep = roads.filter((s) => Math.abs(s.slope ?? 0) >= MOUNTAIN_ANCHOR_SLOPE);
    expect(steep.length).toBeGreaterThan(0);
    for (const s of steep) expect((s.anchors ?? []).filter((a) => a.kind === 'boulder')).toHaveLength(2);
    for (const s of roads) if (Math.abs(s.slope ?? 0) < MOUNTAIN_ANCHOR_SLOPE) expect(s.anchors ?? []).toHaveLength(0);
  });

  it("climbs 40 to 260 m in total (the plan said 120; the road climbs in its bends, which stay flat)", () => {
    const { report } = planOurika();
    expect(report.climb).toBeGreaterThanOrEqual(40);
    expect(report.climb).toBeLessThanOrEqual(260);
  });

  it('ends on a flat 80 m road before the finish pad', () => {
    const last = OURIKA_SEGMENTS[OURIKA_SEGMENTS.length - 1] as RoadDef;
    expect(last).toMatchObject({ type: 'road', length: 80 });
    expect(last.slope ?? 0).toBe(0);
    expect(last.curve ?? 0).toBe(0);
  });

  it('has fuel stops with gaps of at most the fuel maximum, ends included', () => {
    const { report } = planOurika();
    expect(report.fuel.length).toBeGreaterThanOrEqual(1);
    const at = [0, ...report.fuel.map((f) => f.at), report.total];
    for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!).toBeLessThanOrEqual(FUEL_MAX_GAP);
  });

  it('starts with the three start pickups', () => {
    expect((OURIKA_SEGMENTS[0] as RoadDef).pickups).toHaveLength(3);
  });
});
