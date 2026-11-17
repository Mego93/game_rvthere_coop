import type { BuiltCourse } from '@lodgy/shared';
import { describe, expect, test } from 'vitest';
import { nearestSegment } from './routeIndex';
import { routeDistance } from './terrain';

type Route = readonly (readonly [number, number])[];

function segmentSquared(route: Route, i: number, x: number, z: number): number {
  const [x0, z0] = route[i]!;
  const dx = route[i + 1]![0] - x0;
  const dz = route[i + 1]![1] - z0;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / lengthSquared));
  const ex = x - (x0 + dx * t);
  const ez = z - (z0 + dz * t);
  return ex * ex + ez * ez;
}

// The scan over every segment, the lowest index among equals.
function brute(route: Route, x: number, z: number): number {
  let best = Infinity;
  let index = -1;
  for (let i = 0; i < route.length - 1; i++) {
    const value = segmentSquared(route, i, x, z);
    if (value < best) {
      best = value;
      index = i;
    }
  }
  return index;
}

const nearest = (route: Route, x: number, z: number) => nearestSegment(route, x, z, (i) => segmentSquared(route, i, x, z), true);

// A course whose ground top at route point i is `i` (the highest of the points sharing a place), so `y` shows which segment was chosen.
function course(route: Route): BuiltCourse {
  const ground = route.map(([x, z], i) => ({ center: { x, y: i - 0.5, z }, halfExtents: { x: 0.4, y: 0.5, z: 0.4 }, rot: { x: 0, y: 0, z: 0, w: 1 } }));
  return { route, ground } as unknown as BuiltCourse;
}

const heightAt = (route: Route, k: number): number => Math.max(...route.map(([x, z], j) => (x === route[k]![0] && z === route[k]![1] ? j : -1)));

const queries: [number, number][] = [[0, 0], [10, 0], [-5, 3], [50, 50], [100, 0], [20, 1], [0, 10], [3500, 4000], [-4000, -3200], [10, -0.0001]];

const routes: Record<string, Route> = {
  'duplicate points': [[0, 0], [0, 0], [10, 0], [10, 0], [10, 0], [20, 0]],
  'back and forth': [[0, 0], [30, 0], [0, 0], [30, 0], [0, 0], [30, 0], [0, 10], [30, 10]],
  'a zero-length segment between others': [[0, 0], [10, 0], [10, 0], [10, 10]],
  'a long zigzag': Array.from({ length: 60 }, (_, i) => [i * 7, i % 2 ? 15 : -15] as [number, number]),
};

describe('nearestSegment on synthetic routes', () => {
  for (const [name, route] of Object.entries(routes)) {
    test(`${name}: the same segment as a scan over every segment`, () => {
      for (const [x, z] of queries) expect(nearest(route, x, z), `(${x}, ${z})`).toBe(brute(route, x, z));
    });
  }

  test('an empty route has no nearest segment', () => {
    expect(nearest([], 1, 2)).toBe(-1);
  });

  test('a single point has no segment', () => {
    expect(nearest([[5, 5]], 1, 2)).toBe(-1);
  });

  test('a query more than 3 km away still finds the segment', () => {
    const route = routes['a long zigzag']!;
    expect(nearest(route, 9000, 12000)).toBe(brute(route, 9000, 12000));
    expect(nearest(route, -9000, 3000)).toBe(brute(route, -9000, 3000));
  });

  test('equal distances give the lowest index (a point equidistant from two parallel runs)', () => {
    const route: Route = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 20], [10, 20]];
    expect(nearest(route, 5, 5)).toBe(brute(route, 5, 5));
    expect(nearest(route, 5, 5)).toBe(0);
  });
});

describe('routeDistance on synthetic routes', () => {
  for (const [name, route] of Object.entries(routes)) {
    test(`${name}: distance and height match a scan`, () => {
      const c = course(route);
      for (const [x, z] of queries) {
        const i = brute(route, x, z);
        const [x0, z0] = route[i]!;
        const dx = route[i + 1]![0] - x0;
        const dz = route[i + 1]![1] - z0;
        const lengthSquared = dx * dx + dz * dz;
        const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / lengthSquared));
        const got = routeDistance(c, x, z);
        expect(got.distance, `(${x}, ${z})`).toBeCloseTo(Math.sqrt(segmentSquared(route, i, x, z)), 9);
        expect(got.y, `(${x}, ${z})`).toBeCloseTo(heightAt(route, i) + (heightAt(route, i + 1) - heightAt(route, i)) * t, 6);
      }
    });
  }

  test('a single-point route gives the distance to the point and its height', () => {
    const got = routeDistance(course([[3, 4]]), 0, 0);
    expect(got.distance).toBe(5);
    expect(got.y).toBe(0);
  });
});
