import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../constants';
import { buildSegment, type SegmentDef } from '../segments';
import { courseIds, getCourse, getCourseDef, segmentRanges } from './index';
import { MARRAKECH_INSERTED } from './marrakech.generated';

type RoadDef = Extract<SegmentDef, { type: 'road' }>;

const def = getCourseDef('marrakech')!;
const ranges = segmentRanges(def);
const total = ranges[ranges.length - 1]!.to;
const roads = def.segments.map((s, i) => ({ s: s as RoadDef, i })).filter(({ s }) => s.type === 'road');
const mid = (i: number): number => (ranges[i]!.from + ranges[i]!.to) / 2;
const fuel = roads.filter(({ s }) => s.stop?.kind === 'fuel').map(({ i }) => i);
const garages = roads.filter(({ s }) => s.stop?.kind === 'garage').map(({ i }) => i);
const finish = total + 20;

describe('registration (T11)', () => {
  it('makes marrakech the campaign and registers every course', () => {
    expect(CAMPAIGN).toEqual(['marrakech']);
    expect(courseIds().sort()).toEqual(['airport', 'marrakech', 'segment-demo', 'test']);
    expect(getCourse('marrakech')).toBe(getCourse('marrakech'));
    expect(getCourse('marrakech').id).toBe('marrakech');
    expect(getCourse('marrakech').targetTime).toBe(1800);
    expect(def.id).toBe('marrakech');
    expect(Object.isFrozen(def.segments[0])).toBe(true);
  });
});

describe('stops (T7)', () => {
  it('has fuel stops every 1.5 km at most, from the start to the finish', () => {
    expect(fuel.length).toBeGreaterThanOrEqual(18);
    expect(fuel.length).toBeLessThanOrEqual(22);
    const gaps = [mid(fuel[0]!), ...fuel.slice(1).map((f, n) => mid(f) - mid(fuel[n]!)), finish - mid(fuel[fuel.length - 1]!)];
    for (const gap of gaps) expect(gap).toBeLessThanOrEqual(1500);
  });

  it('alternates the sides of the fuel stops', () => {
    const sides = fuel.map((i) => (def.segments[i] as RoadDef).stop!.side);
    sides.forEach((side, n) => n > 0 && expect(side).toBe(-sides[n - 1]!));
  });

  it('puts garages about 4 km apart and 200 m from every fuel stop', () => {
    expect(garages.length).toBeGreaterThanOrEqual(4);
    const at = garages.map(mid);
    [0, ...at].forEach((a, n) => n > 0 && expect(a - [0, ...at][n - 1]!).toBeLessThanOrEqual(6000));
    for (const g of garages) for (const f of fuel) expect(Math.abs(mid(g) - mid(f))).toBeGreaterThanOrEqual(200);
  });

  it('keeps every stop on a flat straight of 60 m or more at its middle, never on the ends or inserted terrain', () => {
    for (const i of [...fuel, ...garages]) {
      const s = def.segments[i] as RoadDef;
      expect(i).toBeGreaterThan(0);
      expect(i).toBeLessThan(def.segments.length - 1);
      expect(MARRAKECH_INSERTED).not.toContain(i);
      expect(s.curve).toBeUndefined();
      expect(s.slope).toBeUndefined();
      expect(s.length).toBeGreaterThanOrEqual(60);
      expect(Math.abs(s.stop!.along - s.length / 2)).toBeLessThanOrEqual(0.06);
      expect(s.hazards).toBeUndefined();
    }
    expect(getCourse('marrakech').stops).toHaveLength(fuel.length + garages.length);
  });
});

describe('hazards (T6)', () => {
  const hazards = roads.flatMap(({ s, i }) => (s.hazards ?? []).map((h) => ({ kind: h.kind, i, at: mid(i) })));

  it('has the five of the plan near their fractions (A5: up to 1.3 km)', () => {
    expect(hazards.map((h) => h.kind)).toEqual(['crateWall', 'gates', 'roadblock', 'crateWall', 'roadblock']);
    const fractions = [0.12, 0.3, 0.45, 0.72, 0.93];
    hazards.forEach((h, n) => expect(Math.abs(h.at - fractions[n]! * total)).toBeLessThanOrEqual(1300));
  });

  it('never sits on a stop, inserted terrain or either end, and gates get 65 m', () => {
    for (const h of hazards) {
      const s = def.segments[h.i] as RoadDef;
      expect(s.stop).toBeUndefined();
      expect(MARRAKECH_INSERTED).not.toContain(h.i);
      expect(h.i).toBeGreaterThan(0);
      expect(h.i).toBeLessThan(def.segments.length - 1);
      expect(s.length).toBeGreaterThanOrEqual(h.kind === 'gates' ? 65 : 22);
      expect(() => buildSegment(s)).not.toThrow();
    }
  });
});

describe('pickups and coins (T8)', () => {
  const course = getCourse('marrakech');
  const pickupAt = (kind: string): number[] =>
    roads.flatMap(({ s, i }) => (s.pickups ?? []).filter((p) => p.kind === kind).map((p) => ranges[i]!.from + p.along));

  it.each(['jerrycan', 'toolbox', 'healthKit'])('has a %s at least every 1.5 km plus 400 m of slack', (kind) => {
    const at = pickupAt(kind);
    at.forEach((a, n) => n > 0 && expect(a - at[n - 1]!).toBeLessThanOrEqual(1900));
    expect(finish - at[at.length - 1]!).toBeLessThanOrEqual(2400);
  });

  it('keeps the villa lane pickups as at the airport', () => {
    expect((def.segments[0] as RoadDef).pickups).toEqual([
      { kind: 'jerrycan', along: 30, lateral: -3 },
      { kind: 'toolbox', along: 30, lateral: 3 },
      { kind: 'healthKit', along: 40, lateral: 0 },
    ]);
  });

  it('puts about one coin per 250 m on straights of 30 m or more', () => {
    const want = total / 250;
    expect(Math.abs(course.coins.length - want)).toBeLessThanOrEqual(0.1 * want);
    for (const { s, i } of roads) {
      if (!s.coins) continue;
      expect(s.curve).toBeUndefined();
      expect(s.length).toBeGreaterThanOrEqual(30);
      expect(MARRAKECH_INSERTED).not.toContain(i);
    }
  });

  it('has unique ids', () => {
    const ids = [...course.coins, ...course.pickups, ...course.props, ...course.anchors, ...course.stops].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
