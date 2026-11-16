import { describe, expect, it } from 'vitest';
import { ROAD_MAX_PIECE_YAW, ROAD_PIECE_LENGTH, SEGMENT_MIN_LENGTH } from '../constants';
import type { SegmentDef } from '../segments';
import { centreLine, fitRoute, mergeRuns, planInserts, type InsertSpec, type Route, type TurnRun } from './fit';

type Part = { line: number } | { turn: number; steps: number };

// Points every 20 m; an arc's steps point at the arc's mid heading, as the road builder's pieces do.
function makeRoute(parts: Part[]): Route {
  const pts: [number, number][] = [[0, 0]];
  let h = 0;
  for (const part of parts) {
    const steps = 'line' in part ? part.line : part.steps;
    for (let i = 0; i < steps; i++) {
      const hh = 'line' in part ? h : h + ((i + 0.5) * part.turn) / part.steps;
      const [x, z] = pts[pts.length - 1]!;
      pts.push([x - 20 * Math.sin(hh), z - 20 * Math.cos(hh)]);
    }
    if ('turn' in part) h += part.turn;
  }
  return pts;
}

const roads = (segments: SegmentDef[]) => segments.map((s) => (s.type === 'road' ? s : (() => { throw new Error('not a road'); })()));

describe('fitRoute', () => {
  it('keeps a straight route straight and splits it at 400 m', () => {
    const { segments } = fitRoute(makeRoute([{ line: 20 }]), { edge: 0 });
    expect(roads(segments).map((s) => [s.length, s.curve ?? 0])).toEqual([[400, 0]]);
    const long = fitRoute(makeRoute([{ line: 50 }]), { edge: 0 }).segments;
    expect(long.map((s) => (s as { length: number }).length)).toEqual([333.3, 333.3, 333.4]);
  });

  it('turns a quarter circle into one curve of pi/2 that obeys the length rule', () => {
    for (const sign of [1, -1]) {
      const { segments, report } = fitRoute(makeRoute([{ line: 10 }, { turn: sign * (Math.PI / 2), steps: 16 }, { line: 10 }]), { edge: 0 });
      const r = roads(segments);
      expect(r).toHaveLength(3);
      const curve = r[1]!;
      expect(Math.abs(curve.curve!)).toBeCloseTo(Math.PI / 2, 1);
      expect(Math.sign(curve.curve!)).toBe(sign);
      expect(curve.length).toBeGreaterThanOrEqual((Math.abs(curve.curve!) / ROAD_MAX_PIECE_YAW) * ROAD_PIECE_LENGTH - 1e-6);
      expect(report.maxDeviation).toBeLessThan(5);
      expect(report.endError).toBeLessThan(5);
    }
  });

  it('stretches a sharp corner to the length rule and reports the stretch', () => {
    const { segments, report } = fitRoute(makeRoute([{ line: 15 }, { turn: Math.PI / 2, steps: 1 }, { line: 15 }]), { edge: 0 });
    const curve = roads(segments).find((s) => s.curve)!;
    expect(curve.length).toBeGreaterThanOrEqual((Math.abs(curve.curve!) / ROAD_MAX_PIECE_YAW) * ROAD_PIECE_LENGTH - 1e-6);
    expect(report.maxStretch).toBeGreaterThan(40);
    expect(report.stretches).toBeGreaterThanOrEqual(1);
  });

  it('never leaves a segment under the minimum length, even between two sharp corners', () => {
    const route = makeRoute([{ line: 10 }, { turn: Math.PI / 2, steps: 1 }, { line: 2 }, { turn: -Math.PI / 2, steps: 1 }, { line: 10 }]);
    const { segments } = fitRoute(route, { edge: 0 });
    for (const s of roads(segments)) expect(s.length).toBeGreaterThanOrEqual(SEGMENT_MIN_LENGTH);
  });

  it('never changes the sign of a curve segment', () => {
    const route = makeRoute([{ line: 10 }, { turn: 1, steps: 8 }, { turn: -1, steps: 8 }, { line: 10 }]);
    const { segments } = fitRoute(route, { edge: 0 });
    const curves = roads(segments).filter((s) => s.curve);
    expect(curves.length).toBeGreaterThanOrEqual(2);
    expect(Math.sign(curves[0]!.curve!)).toBe(1);
    expect(Math.sign(curves[curves.length - 1]!.curve!)).toBe(-1);
  });

  it('keeps the lead and the tail straight by default', () => {
    const route = makeRoute([{ line: 5 }, { turn: 0.6, steps: 4 }, { line: 20 }, { turn: -0.6, steps: 4 }, { line: 5 }]);
    const r = roads(fitRoute(route).segments);
    expect(r[0]!.curve).toBeUndefined();
    expect(r[0]!.length).toBeGreaterThanOrEqual(120);
    expect(r[r.length - 1]!.curve).toBeUndefined();
    expect(r[r.length - 1]!.length).toBeGreaterThanOrEqual(120);
  });

  it('is deterministic', () => {
    const route = makeRoute([{ line: 7 }, { turn: 0.8, steps: 6 }, { line: 9 }, { turn: -1.2, steps: 2 }, { line: 12 }]);
    expect(fitRoute(route, { edge: 0 })).toEqual(fitRoute(route, { edge: 0 }));
  });

  it('rebuilds a centre line that ends where the road ends', () => {
    const route = makeRoute([{ line: 10 }, { turn: 1, steps: 8 }, { line: 10 }]);
    const { segments, report } = fitRoute(route, { edge: 0 });
    const line = centreLine(roads(segments));
    expect(Math.hypot(line.at(-1)!.x - route.at(-1)![0], line.at(-1)!.z - route.at(-1)![1])).toBeCloseTo(report.endError, 6);
  });
});

describe('mergeRuns', () => {
  const run = (v1: number, v2: number, turn: number): TurnRun => ({ v1, v2, turn });
  const deg = (d: number) => (d * Math.PI) / 180;
  const arc = (v: number) => v * 20;

  it('drops a one-step run that turns under 3 degrees', () => {
    expect(mergeRuns([run(5, 5, deg(2)), run(9, 9, deg(4))], arc)).toEqual([run(9, 9, deg(4))]);
  });

  it('merges two adjacent opposite runs shorter than 40 m into one with the net turn', () => {
    const merged = mergeRuns([run(5, 5, deg(10)), run(6, 6, -deg(6))], arc);
    expect(merged).toHaveLength(1);
    expect([merged[0]!.v1, merged[0]!.v2]).toEqual([5, 6]);
    expect(merged[0]!.turn).toBeCloseTo(deg(4), 9);
  });

  it('drops a merged pair whose net turn is under 3 degrees', () => {
    expect(mergeRuns([run(5, 5, deg(10)), run(6, 6, -deg(9))], arc)).toEqual([]);
  });

  it('leaves long runs and same-sign neighbours alone', () => {
    expect(mergeRuns([run(5, 8, deg(30)), run(9, 9, -deg(8)), run(10, 10, deg(8))], arc)).toEqual([run(5, 8, deg(30))]);
    expect(mergeRuns([run(5, 8, deg(30)), run(9, 9, -deg(8))], arc)).toEqual([run(5, 8, deg(30)), run(9, 9, -deg(8))]);
    expect(mergeRuns([run(5, 5, deg(10)), run(6, 6, deg(10))], arc)).toEqual([run(5, 5, deg(10)), run(6, 6, deg(10))]);
  });
});

describe('planInserts', () => {
  const road = (length: number, curve?: number): SegmentDef => ({ type: 'road', length, ...(curve ? { curve } : {}) });
  const sand: SegmentDef = { type: 'sand', length: 60, palms: 4 };
  const spec = (fraction: number, length: number, def: SegmentDef = sand): InsertSpec => ({ name: 'sand', fraction, length, segments: [def] });
  const total = (segments: SegmentDef[]) => segments.reduce((sum, s) => sum + ('length' in s ? s.length : 0), 0);

  it('replaces the middle of the straight nearest the target and keeps the total length', () => {
    const base = [road(300), road(300, 0.5), road(300), road(300)];
    const { segments, placements } = planInserts(base, [spec(0.5, 110)]);
    expect(placements[0]!.distance).toBeLessThan(80);
    expect(total(segments)).toBeCloseTo(total(base) - 110 + 60, 0);
    expect(segments.filter((s) => s.type === 'sand')).toHaveLength(1);
    const at = segments.findIndex((s) => s.type === 'sand');
    for (const near of [segments[at - 1], segments[at + 1]]) if (near?.type === 'road') expect((near.length) >= SEGMENT_MIN_LENGTH).toBe(true);
  });

  it('leaves each side 0 or at least 15 m and never splits a curve', () => {
    const base = [road(300), road(300, 0.5), road(125), road(300)];
    const { segments } = planInserts(base, [spec(0.55, 110)]);
    for (const s of segments) if (s.type === 'road') expect(s.length).toBeGreaterThanOrEqual(SEGMENT_MIN_LENGTH);
    expect(segments.filter((s) => s.type === 'road' && s.curve)).toHaveLength(1);
  });

  it('uses the whole straight when it is exactly as long as the insert', () => {
    const { segments } = planInserts([road(300), road(110), road(300)], [spec(0.5, 110)]);
    expect(segments.map((s) => s.type)).toEqual(['road', 'sand', 'road']);
  });

  it('reports the distance when the nearest suitable straight is far away', () => {
    const base = [road(300), road(300, 0.5), road(300, -0.5), road(300, 0.5), road(300, -0.5), road(300)];
    const { placements } = planInserts(base, [spec(0.5, 110)]);
    expect(placements[0]!.distance).toBeGreaterThan(300);
  });

  it('places consecutive inserts without overlap and is deterministic', () => {
    const base = [road(400), road(300, 0.4), road(400)];
    const a = planInserts(base, [spec(0.3, 110), spec(0.35, 110)]);
    expect(a.segments.filter((s) => s.type === 'sand')).toHaveLength(2);
    expect(planInserts(base, [spec(0.3, 110), spec(0.35, 110)])).toEqual(a);
  });

  it('throws when no straight is long enough', () => {
    expect(() => planInserts([road(50), road(60, 0.5)], [spec(0.5, 110)])).toThrow();
  });
});
