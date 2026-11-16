import { describe, expect, it } from 'vitest';
import { ROAD_MAX_PIECE_YAW, ROAD_PIECE_LENGTH, SEGMENT_MIN_LENGTH } from '../constants';
import { buildSegment, type SegmentDef } from '../segments';
import { buildCourse } from './build';
import { MARRAKECH_SEGMENTS } from './marrakech.generated';
import { planMarrakech } from './marrakech.plan';
import { MARRAKECH_ROUTE } from './marrakech.route';

const advance = (def: SegmentDef): number => -buildSegment(def).exit.pos.z;
const roadLength = (def: SegmentDef): number => ('length' in def ? def.length : 0);

describe('MARRAKECH_ROUTE (T1)', () => {
  it('starts at the origin and steps 20 m every time', () => {
    expect([...MARRAKECH_ROUTE[0]!]).toEqual([0, 0]);
    expect(MARRAKECH_ROUTE.length).toBeGreaterThanOrEqual(1000);
    for (let i = 1; i < MARRAKECH_ROUTE.length; i++) {
      const [ax, az] = MARRAKECH_ROUTE[i - 1]!;
      const [bx, bz] = MARRAKECH_ROUTE[i]!;
      expect(Math.abs(Math.hypot(bx - ax, bz - az) - 20)).toBeLessThanOrEqual(0.1);
    }
  });

  it('runs the first 60 m along -Z', () => {
    const [x, z] = MARRAKECH_ROUTE[3]!;
    expect(Math.abs(x)).toBeLessThanOrEqual(0.2);
    expect(z).toBeCloseTo(-60, 0);
  });

  it('is about 22.18 km long (the dense route is 22.30 km; chords of 20 m cut the bends)', () => {
    let total = 0;
    for (let i = 1; i < MARRAKECH_ROUTE.length; i++) total += Math.hypot(MARRAKECH_ROUTE[i]![0] - MARRAKECH_ROUTE[i - 1]![0], MARRAKECH_ROUTE[i]![1] - MARRAKECH_ROUTE[i - 1]![1]);
    expect(Math.abs(total - 22180) / 22180).toBeLessThan(0.003);
  });

  it('is rounded to 0.1', () => {
    for (const [x, z] of MARRAKECH_ROUTE) for (const v of [x, z]) expect(Math.abs(v * 10 - Math.round(v * 10))).toBeLessThan(1e-6);
  });
});

describe('MARRAKECH_SEGMENTS (T3 to T5)', () => {
  it('is what the generator produces', () => {
    expect(planMarrakech().segments).toEqual(MARRAKECH_SEGMENTS);
  });

  it('builds, never puts a curved road next to a sloped one, and keeps lengths in range', () => {
    const course = buildCourse({ id: 'marrakech-fit', segments: MARRAKECH_SEGMENTS, targetTime: 1800 });
    expect(course.checkpoints.length).toBeGreaterThan(100);
    MARRAKECH_SEGMENTS.forEach((def) => {
      if (def.type === 'bank' || def.type === 'ford') return;
      if (def.type === 'road' && def.slope) return;
      expect(def.type === 'road' || advance(def) > 0).toBe(true);
      const length = roadLength(def);
      expect(length).toBeGreaterThanOrEqual(SEGMENT_MIN_LENGTH);
      if (def.type === 'road') {
        expect(length).toBeLessThanOrEqual(400);
        if (def.curve) expect(length).toBeGreaterThanOrEqual((Math.abs(def.curve) / ROAD_MAX_PIECE_YAW) * ROAD_PIECE_LENGTH - 1e-6);
      }
    });
  });

  it('keeps the villa lane straight and ends on a straight of at least 120 m', () => {
    const first = MARRAKECH_SEGMENTS[0]!;
    expect(first).toMatchObject({ type: 'road', length: 80 });
    expect((first as { curve?: number }).curve).toBeUndefined();
    const last = MARRAKECH_SEGMENTS[MARRAKECH_SEGMENTS.length - 1]!;
    expect(last.type).toBe('road');
    expect((last as { curve?: number }).curve).toBeUndefined();
    expect(roadLength(last)).toBeGreaterThanOrEqual(120);
  });

  it('stays within the fit limits of the amendments (A2)', () => {
    const { report } = planMarrakech();
    expect(report.maxNearest).toBeLessThanOrEqual(200);
    expect(report.endError).toBeLessThanOrEqual(100);
    expect(Math.abs(report.totalLength - report.realLength) / report.realLength).toBeLessThanOrEqual(0.05);
  });

  it('totals the real length within 5 % and ends near the real end point', () => {
    const { report } = planMarrakech();
    const path = (def: SegmentDef): number => (def.type === 'road' && !def.slope ? def.length : advance(def));
    const total = MARRAKECH_SEGMENTS.reduce((sum, def) => sum + path(def), 0);
    expect(Math.abs(total - report.realLength) / report.realLength).toBeLessThanOrEqual(0.05);
    expect(Math.abs(total - report.totalLength)).toBeLessThan(2);
    const course = buildCourse({ id: 'marrakech-fit', segments: MARRAKECH_SEGMENTS, targetTime: 1800 });
    const end = MARRAKECH_ROUTE[MARRAKECH_ROUTE.length - 1]!;
    // The finish pad is 20 m beyond the last segment, so its middle is 10 m past the end.
    expect(Math.hypot(course.finish.center.x - end[0], course.finish.center.z - end[1])).toBeLessThanOrEqual(report.endError + 15);
  });

  it('puts sand, alley, two roadworks and the ford group near their fractions', () => {
    const total = MARRAKECH_SEGMENTS.reduce((sum, def) => sum + advance(def), 0);
    const want: [string, number][] = [['sand', 0.2], ['alley', 0.38], ['roadworks', 0.52], ['ford', 0.64], ['roadworks', 0.86]];
    const found: [string, number][] = [];
    let at = 0;
    for (const def of MARRAKECH_SEGMENTS) {
      if (['sand', 'alley', 'roadworks', 'ford'].includes(def.type)) found.push([def.type, at / total]);
      at += advance(def);
    }
    expect(MARRAKECH_SEGMENTS.filter((def) => def.type === 'bank')).toHaveLength(1);
    expect(found.map(([type]) => type)).toEqual(want.map(([type]) => type));
    found.forEach(([, fraction], i) => expect(Math.abs(fraction - want[i]![1]) * total).toBeLessThanOrEqual(1300));
    // The ford is followed by its slope road and the bank, and the neighbours are plain flat roads or other terrain.
    const ford = MARRAKECH_SEGMENTS.findIndex((def) => def.type === 'ford');
    expect(MARRAKECH_SEGMENTS[ford + 1]).toMatchObject({ type: 'road', slope: 4 });
    expect(MARRAKECH_SEGMENTS[ford + 2]!.type).toBe('bank');
  });
});
