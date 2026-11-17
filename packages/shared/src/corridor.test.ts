import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { CORRIDOR_CELL, CORRIDOR_INNER, CORRIDOR_LAND_END, CORRIDOR_OUTER, CORRIDOR_RELIEF, CORRIDOR_RIDGE_HEIGHT, CORRIDOR_TILE_CELLS, ROAD_WIDTH, SHOULDER_WIDTH } from './constants';
import { bermWeight, corridorHeightAt, corridorOf, corridorReliefAt, routeFrame } from './corridor';
import { buildCourse } from './courses/build';
import { getCourse, getCourseDef } from './courses/index';
import { GROUP_GROUND, GROUP_WORLD, groups } from './groups';
import { buildStatics } from './statics';
import { surfaceYAt } from './surfaceHeight';

// The shared package has no DOM or Node typings.
declare const performance: { now(): number };
declare const console: { info(...args: unknown[]): void };

const isHeightfield = (collider: { shape: { type: number } }) => collider.shape.type === RAPIER.ShapeType.HeightField;

beforeAll(async () => {
  await RAPIER.init();
});

const marrakech = getCourse('marrakech');
const corridor = corridorOf(marrakech)!;
const frame = routeFrame(marrakech);
const obstacles = marrakech.corridor!.obstacles;
// Within a cell diagonal of a berm's influence the land beside the shoulder may rise (T10).
const nearBerm = (along: number): boolean => [-8, 0, 8].some((shift) => bermWeight(obstacles, along + shift) > 0);

// A deterministic spread of points with a nearest-route distance in [from, to].
function samples(count: number, from: number, to: number, seed = 1): { x: number; z: number; d: number }[] {
  let a = seed;
  const next = () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 2 ** 32;
  };
  const out: { x: number; z: number; d: number }[] = [];
  while (out.length < count) {
    const [px, pz] = marrakech.route[Math.floor(next() * marrakech.route.length)]!;
    const angle = next() * Math.PI * 2;
    const radius = from + next() * (to - from);
    const x = px + Math.cos(angle) * radius;
    const z = pz + Math.sin(angle) * radius;
    const d = frame.nearest(x, z).d;
    if (d >= from && d <= to) out.push({ x, z, d });
  }
  return out;
}

describe('corridor opt-in (T1, T2)', () => {
  test('only courses that opt in get a corridor; marrakech does', () => {
    expect(getCourse('airport').corridor).toBeUndefined();
    expect(corridorOf(getCourse('airport'))).toBeNull();
    expect(corridorOf(getCourse('test'))).toBeNull();
    expect(corridor).not.toBeNull();
  });

  test('the corridor is built once per course', () => {
    expect(corridorOf(marrakech)).toBe(corridor);
  });

  test('T2: the lowest corridor height is well above the kill plane', () => {
    expect(corridor.minY).toBeGreaterThan(marrakech.killPlaneY + 10);
  });
});

describe('plan test 1: heights', () => {
  test('heights are deterministic', () => {
    const points = samples(300, 29, 130);
    const first = points.map((p) => corridorHeightAt(corridor, p.x, p.z));
    const fresh = corridorOf(buildCourse(getCourseDef('marrakech')!))!;
    expect(points.map((p) => corridorHeightAt(fresh, p.x, p.z))).toEqual(first);
  });

  test('where d < 34 the land lies at least 0.05 m under the route height', () => {
    for (const p of samples(2000, 0, 33.9)) {
      if (p.d > 25 && nearBerm(frame.nearest(p.x, p.z).along)) continue;
      const h = corridorHeightAt(corridor, p.x, p.z);
      expect(h, `d ${p.d}`).not.toBeNull();
      expect(h!, `d ${p.d}`).toBeLessThanOrEqual(frame.heightAt(frame.nearest(p.x, p.z)) - 0.05 + 1e-3);
    }
  });

  test('the relief stays within the relief height of the smoothed route height for 40 <= d < 100', () => {
    for (const p of samples(2000, 40, 99.9)) {
      const h = corridorHeightAt(corridor, p.x, p.z)!;
      expect(Math.abs(h - frame.smoothedAt(frame.nearest(p.x, p.z))), `d ${p.d}`).toBeLessThanOrEqual(CORRIDOR_RELIEF + 1e-3);
    }
  });

  test('T8: the steepest sampled relief slope is at most 20 degrees', () => {
    let steepest = 0;
    for (const p of samples(20000, 0, 200, 7)) {
      const a = corridorReliefAt(marrakech.id, p.x, p.z);
      for (const [dx, dz] of [[1, 0], [0, 1]] as const) {
        const b = corridorReliefAt(marrakech.id, p.x + dx, p.z + dz);
        steepest = Math.max(steepest, (Math.atan(Math.abs(b - a)) * 180) / Math.PI);
      }
    }
    console.info(`steepest relief slope ${steepest.toFixed(1)} deg`);
    expect(steepest).toBeLessThanOrEqual(20);
  });

  test('T9: the ridge steepest sampled slope on the 4 m grid exceeds 55 degrees', () => {
    let steepest = 0;
    for (const p of samples(4000, 100, 117, 3)) {
      const n = frame.nearest(p.x, p.z);
      const ux = (p.x - n.px) / n.d;
      const uz = (p.z - n.pz) / n.d;
      const a = corridorHeightAt(corridor, p.x, p.z)!;
      const b = corridorHeightAt(corridor, p.x + ux * CORRIDOR_CELL, p.z + uz * CORRIDOR_CELL);
      if (b !== null) steepest = Math.max(steepest, (Math.atan(Math.abs(b - a) / CORRIDOR_CELL) * 180) / Math.PI);
    }
    console.info(`steepest ridge slope ${steepest.toFixed(1)} deg`);
    expect(steepest).toBeGreaterThan(55);
  });

  test('every sampled point with 29 <= d <= 124 lies in a tile', () => {
    for (const p of samples(3000, CORRIDOR_INNER, CORRIDOR_OUTER, 5)) expect(corridorHeightAt(corridor, p.x, p.z), `d ${p.d}`).not.toBeNull();
  });

  test('T6: the land goes on to the land end at the ridge-top height', () => {
    for (const p of samples(500, CORRIDOR_OUTER, CORRIDOR_LAND_END - 3, 9)) {
      const h = corridorHeightAt(corridor, p.x, p.z);
      expect(h, `d ${p.d}`).not.toBeNull();
      expect(h! - frame.smoothedAt(frame.nearest(p.x, p.z)), `d ${p.d}`).toBeGreaterThanOrEqual(CORRIDOR_RIDGE_HEIGHT - CORRIDOR_RELIEF - 1e-3);
    }
  });

  test('rule 12: at most 700,000 heights, built in at most 2 s', () => {
    const fresh = buildCourse(getCourseDef('marrakech')!);
    const start = performance.now();
    const built = corridorOf(fresh)!;
    const ms = performance.now() - start;
    const heights = built.tiles.reduce((sum, tile) => sum + tile.heights.length, 0);
    console.info(`corridor: ${built.tiles.length} tiles, ${heights} heights, built in ${ms.toFixed(0)} ms (routeHeights included)`);
    expect(built.tiles.every((t) => t.cols === CORRIDOR_TILE_CELLS && t.rows === CORRIDOR_TILE_CELLS)).toBe(true);
    expect(heights).toBeLessThanOrEqual(700_000);
    expect(ms).toBeLessThan(2000);
  });
});

describe('T5: the triangulation and layout match the collider', () => {
  test('corridorHeightAt equals a ray cast against the heightfield colliders at points either side of the diagonal', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    buildStatics(RAPIER, world, marrakech);
    world.timestep = 0;
    world.step();
    let worst = 0;
    for (const p of samples(1500, 31, 129, 11)) {
      const h = corridorHeightAt(corridor, p.x, p.z)!;
      const hit = world.castRay(new RAPIER.Ray({ x: p.x, y: 1000, z: p.z }, { x: 0, y: -1, z: 0 }), 2000, true, undefined, groups(GROUP_WORLD, GROUP_GROUND), undefined, undefined, isHeightfield);
      expect(hit, `d ${p.d}`).not.toBeNull();
      worst = Math.max(worst, Math.abs(1000 - hit!.timeOfImpact - h));
    }
    world.free();
    expect(worst).toBeLessThan(0.01);
  });
});

describe('T3: under the road at sags', () => {
  test('at 1 m steps along the whole route, the collider is under the road top and the shoulder tops on both sides', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    buildStatics(RAPIER, world, marrakech);
    world.timestep = 0;
    world.step();
    let checked = 0;
    let worst = -Infinity;
    for (let along = 0; along < frame.total; along += 1) {
      const c = frame.pointAt(along);
      for (const lateral of [0, ROAD_WIDTH / 2 + 0.2, ROAD_WIDTH / 2 + SHOULDER_WIDTH - 0.3, -(ROAD_WIDTH / 2 + 0.2), -(ROAD_WIDTH / 2 + SHOULDER_WIDTH - 0.3)]) {
        const x = c.x - c.tz * lateral;
        const z = c.z + c.tx * lateral;
        const top = surfaceYAt(marrakech, x, z);
        if (top === null) continue;
        // The collider the way the physics sees it.
        const hit = world.castRay(new RAPIER.Ray({ x, y: top + 0.5, z }, { x: 0, y: -1, z: 0 }), 50, true, undefined, groups(GROUP_WORLD, GROUP_GROUND), undefined, undefined, isHeightfield);
        const h = corridorHeightAt(corridor, x, z);
        if (h === null) continue;
        checked++;
        const bermed = nearBerm(along) && Math.abs(lateral) > ROAD_WIDTH / 2 + 15;
        if (bermed) continue;
        worst = Math.max(worst, h - top);
        expect(h, `along ${along} lateral ${lateral}`).toBeLessThanOrEqual(top - 0.04);
        expect(hit, `along ${along} lateral ${lateral}`).not.toBeNull();
        expect(top + 0.5 - hit!.timeOfImpact, `along ${along} lateral ${lateral}`).toBeLessThanOrEqual(top - 0.04 + 1e-3);
      }
    }
    world.free();
    console.info(`T3: ${checked} points, the collider is at least ${(-worst).toFixed(3)} m under the surface top at its closest`);
    expect(checked).toBeGreaterThan(80000);
  }, 60000);
});
