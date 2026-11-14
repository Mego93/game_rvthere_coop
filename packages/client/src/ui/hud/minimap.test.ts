import { describe, expect, it } from 'vitest';
import { clampToMap, mapViewFor, routePath, toMap } from './minimap';

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
