import { describe, expect, it } from 'vitest';
import { clampToCircle, clampToMap, clipRouteToWindow, isWindowed, mapViewFor, routeLength, routePath, routePathRuns, toMap, WINDOW_RADIUS, windowViewFor } from './minimap';

const long: [number, number][] = [[0, 0], [200, 10], [400, -10]];

describe('mapViewFor', () => {
  it('T5 fits a long thin route inside size with the margin and keeps aspect', () => {
    const v = mapViewFor(long, 140, 8);
    expect(v.size).toBe(140);
    expect(v.scale).toBeCloseTo(124 / 400);
    for (const [x, z] of long) {
      const p = toMap(v, x, z);
      expect(p.x).toBeGreaterThanOrEqual(8 - 1e-9);
      expect(p.x).toBeLessThanOrEqual(132 + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(8 - 1e-9);
      expect(p.y).toBeLessThanOrEqual(132 + 1e-9);
    }
    const a = toMap(v, 0, 0);
    const b = toMap(v, 400, 0);
    expect(b.x - a.x).toBeCloseTo(124);
    expect(toMap(v, 200, 0).x).toBeCloseTo(70);
  });

  it('T5 a one-point and an empty route give finite scale 1', () => {
    const one = mapViewFor([[30, -20]], 110, 8);
    expect(one.scale).toBe(1);
    expect(one.originX).toBe(30);
    expect(one.originZ).toBe(-20);
    const p = toMap(one, 30, -20);
    expect(p).toEqual({ x: 55, y: 55 });
    const none = mapViewFor([], 110, 8);
    expect(none.scale).toBe(1);
    expect(none.originX).toBe(0);
    expect(none.originZ).toBe(0);
    for (const v of [one, none]) {
      for (const n of [v.scale, v.originX, v.originZ, v.size]) expect(Number.isFinite(n)).toBe(true);
    }
  });

  it('two identical points do not produce NaN', () => {
    const v = mapViewFor([[5, 5], [5, 5]], 100, 8);
    expect(Number.isFinite(v.scale)).toBe(true);
  });
});

describe('toMap', () => {
  it('T6 puts north (-z) up and the first point inside the box', () => {
    const v = mapViewFor([[0, 100], [0, -100]], 140, 8);
    expect(toMap(v, 0, -100).y).toBeLessThan(toMap(v, 0, 100).y);
    const first = toMap(v, 0, 100);
    expect(first.x).toBeGreaterThanOrEqual(0);
    expect(first.x).toBeLessThanOrEqual(140);
    expect(first.y).toBeGreaterThanOrEqual(0);
    expect(first.y).toBeLessThanOrEqual(140);
  });

  it('east (+x) is to the right', () => {
    const v = mapViewFor(long, 140, 8);
    expect(toMap(v, 400, 0).x).toBeGreaterThan(toMap(v, 0, 0).x);
  });
});

describe('routePath', () => {
  it('T7 starts with M and has one L per further point', () => {
    const v = mapViewFor(long, 140, 8);
    const d = routePath(v, long);
    expect(d.startsWith('M')).toBe(true);
    expect(d.match(/L/g)?.length).toBe(2);
    expect(d.match(/M/g)?.length).toBe(1);
  });

  it('T7 is empty for fewer than 2 points', () => {
    expect(routePath(mapViewFor([], 140, 8), [])).toBe('');
    expect(routePath(mapViewFor([[1, 1]], 140, 8), [[1, 1]])).toBe('');
  });
});

describe('clampToMap', () => {
  const v = mapViewFor(long, 140, 8);
  it('R8 clamps an outside point to the border', () => {
    expect(clampToMap(v, { x: -50, y: 70 })).toEqual({ x: 0, y: 70 });
    expect(clampToMap(v, { x: 500, y: 900 })).toEqual({ x: 140, y: 140 });
    expect(clampToMap(v, { x: 20, y: -3 })).toEqual({ x: 20, y: 0 });
  });
  it('leaves an inside point unchanged', () => {
    expect(clampToMap(v, { x: 40, y: 60 })).toEqual({ x: 40, y: 60 });
  });
});

describe('clampToCircle', () => {
  const v = { scale: 1, originX: 0, originZ: 0, size: 140 };
  it('T8 leaves inside points unchanged', () => {
    expect(clampToCircle(v, { x: 70, y: 70 })).toEqual({ x: 70, y: 70 });
    expect(clampToCircle(v, { x: 100, y: 60 })).toEqual({ x: 100, y: 60 });
  });
  it('T8 pulls a corner point onto the radius toward the centre', () => {
    const p = clampToCircle(v, { x: 140, y: 140 });
    expect(Math.hypot(p.x - 70, p.y - 70)).toBeCloseTo(67);
    expect(p.x).toBeCloseTo(p.y);
    expect(p.x).toBeGreaterThan(70);
  });
  it('T8 a point on the centre stays finite', () => {
    expect(clampToCircle(v, { x: 70, y: 70 })).toEqual({ x: 70, y: 70 });
  });
});

describe('window mode (R11)', () => {
  const longRoute: [number, number][] = Array.from({ length: 1101 }, (_, i) => [0, -i * 20]);

  it('T12 routeLength sums segments; windowing starts above 3 km', () => {
    expect(routeLength(longRoute)).toBeCloseTo(22000);
    expect(routeLength([[0, 0]])).toBe(0);
    expect(isWindowed(longRoute)).toBe(true);
    expect(isWindowed([[0, 0], [3000, 0]])).toBe(false);
    expect(isWindowed([[0, 0], [3000.5, 0]])).toBe(true);
    expect(isWindowed([[0, 0], [2600, 0]])).toBe(false);
  });

  it('T12 windowViewFor centres the vehicle and maps 600 m to the circle edge', () => {
    const v = windowViewFor({ x: 100, z: -5000 }, 140);
    expect(toMap(v, 100, -5000)).toEqual({ x: 70, y: 70 });
    expect(toMap(v, 100 + WINDOW_RADIUS, -5000).x - 70).toBeCloseTo(67);
    expect(toMap(v, 100, -5300).y).toBeLessThan(70);
  });

  it('T12 clipRouteToWindow keeps the part near the centre with one neighbour past each edge', () => {
    const runs = clipRouteToWindow(longRoute, { x: 0, z: -10000 }, WINDOW_RADIUS);
    expect(runs).toHaveLength(1);
    const run = runs[0]!;
    expect(run.length).toBeGreaterThan(55);
    expect(run.length).toBeLessThan(70);
    expect(Math.min(...run.map(([, z]) => z))).toBeLessThan(-10000 - WINDOW_RADIUS);
    expect(Math.max(...run.map(([, z]) => z))).toBeGreaterThan(-10000 + WINDOW_RADIUS);
  });

  it('T12 clipRouteToWindow splits when the route leaves and re-enters, and is empty far away', () => {
    const out: [number, number][] = [];
    for (let i = 0; i <= 50; i++) out.push([i * 20, 0]);
    for (let i = 50; i >= 0; i--) out.push([i * 20, 3000]);
    out.push([0, 0]);
    const runs = clipRouteToWindow(out, { x: 0, z: 0 }, 100);
    expect(runs.length).toBe(2);
    expect(clipRouteToWindow(longRoute, { x: 50000, z: 0 }, WINDOW_RADIUS)).toEqual([]);
  });

  it('T12 routePathRuns starts each run with M', () => {
    const v = windowViewFor({ x: 0, z: 0 }, 140);
    const d = routePathRuns(v, [[[0, 0], [0, -10]], [[0, 100], [0, 110]]]);
    expect(d.match(/M/g)?.length).toBe(2);
    expect(d.match(/L/g)?.length).toBe(2);
    expect(routePathRuns(v, [])).toBe('');
  });
});
