import { describe, expect, it } from 'vitest';
import { getCourse } from './courses/index';
import { createRouteIndex } from './routeAlong';

type Route = [number, number][];

function brute(route: Route, x: number, z: number) {
  let best = { d: Infinity, along: 0, lateral: 0, segment: 0 };
  let cum = 0;
  for (let i = 0; i + 1 < route.length; i++) {
    const [ax, az] = route[i]!;
    const [bx, bz] = route[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    if (len === 0) continue;
    const tx = (bx - ax) / len;
    const tz = (bz - az) / len;
    const t = Math.min(len, Math.max(0, (x - ax) * tx + (z - az) * tz));
    const fx = ax + tx * t;
    const fz = az + tz * t;
    const d = Math.hypot(x - fx, z - fz);
    if (d < best.d) best = { d, along: cum + t, lateral: (x - fx) * -tz + (z - fz) * tx, segment: i };
    cum += len;
  }
  return best;
}

const straight: Route = [[0, 0], [0, -100]];
const curved: Route = Array.from({ length: 41 }, (_, i) => [60 * Math.sin(i / 8), -60 * (1 - Math.cos(i / 8)) - i * 3] as [number, number]);
const doubling: Route = [[0, 0], [0, -100], [3, -100], [3, 0], [20, 0]];
const real = getCourse('marrakech').route as Route;

function samples(route: Route, n: number): [number, number][] {
  const out: [number, number][] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let k = 0; k < n; k++) {
    const p = route[Math.floor(rnd() * route.length)]!;
    out.push([p[0] + (rnd() - 0.5) * 60, p[1] + (rnd() - 0.5) * 60]);
  }
  return out;
}

describe('createRouteIndex (T1)', () => {
  for (const [name, route, n] of [['straight', straight, 50], ['curved', curved, 200], ['doubling back', doubling, 300], ['single segment', straight, 20], ['marrakech', real, 300]] as const) {
    it(`matches a brute-force projection on ${name}`, () => {
      const index = createRouteIndex(route);
      let hint: number | undefined;
      for (const [x, z] of samples(route, n)) {
        const expected = brute(route, x, z);
        const got = index.project(x, z, hint);
        hint = got.segment;
        expect(got.segment).toBe(expected.segment);
        expect(got.along).toBeCloseTo(expected.along, 6);
        expect(got.lateral).toBeCloseTo(expected.lateral, 6);
        expect(index.project(x, z)).toEqual(got);
        expect(index.project(x, z, route.length - 2)).toEqual(got);
      }
    });
  }

  it('has the polyline length', () => {
    expect(createRouteIndex(straight).length).toBeCloseTo(100, 9);
    expect(createRouteIndex(doubling).length).toBeCloseTo(100 + 3 + 100 + 17, 9);
  });

  it('signs lateral positive to the right of the travel direction', () => {
    const index = createRouteIndex(straight);
    expect(index.project(4, -50).lateral).toBeCloseTo(4, 9);
    expect(index.project(-4, -50).lateral).toBeCloseTo(-4, 9);
    expect(index.project(4, -50).along).toBeCloseTo(50, 9);
  });

  it('breaks ties to the lowest segment index', () => {
    const index = createRouteIndex([[0, 0], [10, 0], [10, 10]]);
    expect(index.project(10, 0).segment).toBe(0);
  });

  it('pointAt returns the foot of the perpendicular with the unit tangent', () => {
    const index = createRouteIndex(curved);
    for (const [x, z] of samples(curved, 100)) {
      const p = index.project(x, z);
      const foot = index.pointAt(p.along);
      expect(Math.hypot(foot.tx, foot.tz)).toBeCloseTo(1, 9);
      const dx = x - foot.x;
      const dz = z - foot.z;
      // At the ends and at a vertex the foot is a corner, not a perpendicular.
      if (p.along <= 0 || p.along >= index.length) continue;
      const before = index.pointAt(p.along - 1e-6);
      if (Math.abs(before.tx - foot.tx) > 1e-9 || Math.abs(before.tz - foot.tz) > 1e-9) continue;
      expect(dx * foot.tx + dz * foot.tz).toBeCloseTo(0, 5);
      expect(Math.hypot(dx, dz)).toBeCloseTo(Math.abs(p.lateral), 6);
    }
  });

  it('clamps pointAt to the ends', () => {
    const index = createRouteIndex(straight);
    expect(index.pointAt(-5)).toEqual({ x: 0, z: 0, tx: 0, tz: -1 });
    expect(index.pointAt(500)).toEqual({ x: 0, z: -100, tx: 0, tz: -1 });
  });
});
