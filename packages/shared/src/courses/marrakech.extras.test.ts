import { describe, expect, it } from 'vitest';
import { GATES_SPACING, HAZARD_END_CLEARANCE } from '../constants';
import { buildSegment, type SegmentDef } from '../segments';
import { hazardRange, planExtras, spreadCount, type Extras } from './marrakech.extras';

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
