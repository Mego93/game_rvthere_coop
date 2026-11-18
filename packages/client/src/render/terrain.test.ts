import { getCourse, SHOULDER_WIDTH, type BuiltCourse } from '@lodgy/shared';
import { describe, expect, test } from 'vitest';
import { buildTerrainGrid, routeDistance, terrainGridOf, terrainGridSteps, warmTerrainGrid, surfaceYAt, terrainHeight, terrainShade, TERRAIN_CELL, TERRAIN_MARGIN } from './terrain';

const courses = (['airport', 'segment-demo'] as const).map((id) => getCourse(id));

// A point `lateral` metres to the left of the route at the `index`th sample.
function beside(course: BuiltCourse, index: number, lateral: number): [number, number] {
  const [x0, z0] = course.route[index]!;
  const [x1, z1] = course.route[index + 1]!;
  const length = Math.hypot(x1 - x0, z1 - z0);
  return [x0 + (-(z1 - z0) / length) * lateral, z0 + ((x1 - x0) / length) * lateral];
}

describe('terrainHeight', () => {
  test('is finite, deterministic and below the surface wherever the ground is', () => {
    for (const course of courses) {
      for (let i = 0; i < course.route.length - 1; i += 3) {
        for (const lateral of [-60, -30, -12, 0, 12, 30, 60, 400]) {
          const [x, z] = beside(course, i, lateral);
          const height = terrainHeight(course, x, z);
          expect(Number.isFinite(height)).toBe(true);
          expect(terrainHeight(course, x, z)).toBe(height);
          const ground = surfaceYAt(course, x, z);
          if (ground !== null) expect(height).toBeLessThanOrEqual(ground - 0.05);
        }
      }
    }
  });

  test('is finite far outside the route', () => {
    for (const course of courses) {
      for (const [x, z] of [[1e5, 1e5], [-3000, 500], [0, -9000], [0, 0]] as const) {
        expect(Number.isFinite(terrainHeight(course, x, z))).toBe(true);
      }
    }
  });

  test('is at least 0.5 m below the route surface under the shoulders and lower still beyond them', () => {
    const course = getCourse('airport');
    const index = 20;
    const [x, z] = course.route[index]!;
    const road = surfaceYAt(course, x, z)!;
    expect(terrainHeight(course, x, z)).toBeCloseTo(road - 0.5, 6);
    const far = beside(course, index, 30);
    const surface = surfaceYAt(course, ...beside(course, index, 10))!;
    expect(terrainHeight(course, ...far)).toBeLessThan(surface - 0.5);
    const edge = beside(course, index, 28);
    expect(terrainHeight(course, ...edge)).toBeCloseTo(surface - 0.5, 1);
  });

  test('beyond 36 m it is 1.2 m below and falls 0.004 m per extra metre', () => {
    const course = getCourse('segment-demo');
    const index = 10;
    const [x, z] = course.route[index]!;
    const road = surfaceYAt(course, x, z)!;
    const a = terrainHeight(course, ...beside(course, index, 36));
    const b = terrainHeight(course, ...beside(course, index, 236));
    expect(a).toBeCloseTo(road - 1.2, 1);
    expect(a - b).toBeCloseTo(0.8, 1);
  });

  test('the drop is smooth between 28 and 36 m', () => {
    const course = getCourse('airport');
    let previous = terrainHeight(course, ...beside(course, 20, 27));
    for (let lateral = 27.5; lateral <= 37; lateral += 0.5) {
      const height = terrainHeight(course, ...beside(course, 20, lateral));
      expect(Math.abs(height - previous)).toBeLessThan(0.2);
      previous = height;
    }
  });

  test('the shoulders reach no further than the flat part of the drop', () => {
    expect(SHOULDER_WIDTH + 3).toBeLessThanOrEqual(28 + 1);
  });
});

describe('terrainShade', () => {
  test('is deterministic and stays within a mild brightness range', () => {
    for (let x = -3000; x <= 3000; x += 137) {
      for (let z = -4000; z <= 4000; z += 211) {
        const shade = terrainShade(x, z);
        expect(shade).toBe(terrainShade(x, z));
        expect(shade).toBeGreaterThan(0.7);
        expect(shade).toBeLessThan(1.05);
      }
    }
  });
});

describe('routeDistance', () => {
  test('is zero on a route point and the straight distance beside a straight stretch', () => {
    const course = getCourse('airport');
    const [x, z] = course.route[5]!;
    expect(routeDistance(course, x, z).distance).toBeCloseTo(0, 6);
    expect(routeDistance(course, ...beside(course, 5, 7)).distance).toBeLessThanOrEqual(7 + 1e-6);
  });
});

describe('buildTerrainGrid', () => {
  test('covers the route box plus the margin in 40 m cells, drops cells past the fog, and never pokes above the ground', () => {
    const course = getCourse('airport');
    const grid = buildTerrainGrid(course);
    const xs = course.route.map((p) => p[0]);
    const zs = course.route.map((p) => p[1]);
    expect(TERRAIN_CELL).toBe(40);
    expect(grid.minX).toBeLessThanOrEqual(Math.min(...xs) - TERRAIN_MARGIN);
    expect(grid.maxX).toBeGreaterThanOrEqual(Math.max(...xs) + TERRAIN_MARGIN);
    expect(grid.minZ).toBeLessThanOrEqual(Math.min(...zs) - TERRAIN_MARGIN);
    expect(grid.maxZ).toBeGreaterThanOrEqual(Math.max(...zs) + TERRAIN_MARGIN);
    expect(grid.positions.length / 3).toBe((grid.cols + 1) * (grid.rows + 1));
    const triangles = grid.chunks.reduce((sum, chunk) => sum + chunk.indices.length / 3, 0);
    expect(triangles).toBe(grid.cells * 2);
    expect(grid.cells).toBeLessThan(grid.cols * grid.rows);
    expect(grid.cells).toBeGreaterThan(grid.cols * grid.rows * 0.3);
    for (const chunk of grid.chunks) {
      expect(chunk.indices.length).toBeGreaterThan(0);
      for (const index of chunk.indices) expect(index).toBeLessThan(grid.positions.length / 3);
    }
    for (let v = 0; v < grid.normals.length; v += 3) {
      expect(Math.hypot(grid.normals[v]!, grid.normals[v + 1]!, grid.normals[v + 2]!)).toBeCloseTo(1, 4);
      expect(grid.normals[v + 1]).toBeGreaterThan(0.9);
    }
    for (const value of grid.positions) expect(Number.isFinite(value)).toBe(true);

    const meshY = (x: number, z: number) => {
      const fx = (x - grid.minX) / TERRAIN_CELL;
      const fz = (z - grid.minZ) / TERRAIN_CELL;
      const i = Math.min(grid.cols - 1, Math.floor(fx));
      const j = Math.min(grid.rows - 1, Math.floor(fz));
      const u = fx - i;
      const v = fz - j;
      const h = (a: number, b: number) => grid.positions[((j + b) * (grid.cols + 1) + i + a) * 3 + 1]!;
      // Cells split along the diagonal from (0,0) to (1,1).
      return u >= v ? h(0, 0) + (h(1, 0) - h(0, 0)) * u + (h(1, 1) - h(1, 0)) * v : h(0, 0) + (h(1, 1) - h(0, 1)) * u + (h(0, 1) - h(0, 0)) * v;
    };
    let checked = 0;
    for (let i = 0; i < course.route.length - 1; i++) {
      for (const lateral of [-26, -15, -6, 0, 6, 15, 26]) {
        const [x, z] = beside(course, i, lateral);
        const ground = surfaceYAt(course, x, z);
        if (ground === null) continue;
        checked++;
        expect(meshY(x, z)).toBeLessThanOrEqual(ground + 1e-6);
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
});

describe('surfaceYAt with one huge ground box', () => {
  const identity = { x: 0, y: 0, z: 0, w: 1 };
  const small = { center: { x: 100, y: 0.5, z: 100 }, halfExtents: { x: 5, y: 0.5, z: 5 }, rot: identity };
  const huge = { center: { x: 0, y: -2, z: 0 }, halfExtents: { x: 4000, y: 1, z: 4000 }, rot: identity };
  const course = { route: [[0, 0], [1, 0]], ground: [small, huge] } as unknown as BuiltCourse;

  test('the huge box counts everywhere it covers, the small one wins where it is higher', () => {
    expect(surfaceYAt(course, 3000, -2500)).toBeCloseTo(-1, 9);
    expect(surfaceYAt(course, 100, 100)).toBeCloseTo(1, 9);
    expect(surfaceYAt(course, 5000, 0)).toBeNull();
  });
});

describe('terrainGridOf', () => {
  test('returns the same grid object each time, equal to an uncached build', () => {
    const course = courses[0]!;
    const grid = terrainGridOf(course);
    expect(terrainGridOf(course)).toBe(grid);
    expect(grid).toEqual(buildTerrainGrid(course));
  });
});

describe('terrainGridSteps and warmTerrainGrid', () => {
  test('the sliced build equals the synchronous one and takes many steps', () => {
    for (const course of [...courses, getCourse('marrakech')]) {
      const steps = terrainGridSteps(course);
      let count = 0;
      let result = steps.next();
      while (!result.done) {
        count += 1;
        result = steps.next();
      }
      expect(count).toBeGreaterThan(10);
      expect(result.value).toEqual(buildTerrainGrid(course));
    }
  });

  test('warming fills terrainGridOf without a second build', () => {
    const copy = { ...courses[1]! };
    for (const _ of warmTerrainGrid(copy));
    const grid = terrainGridOf(copy);
    expect(terrainGridOf(copy)).toBe(grid);
    expect(grid).toEqual(buildTerrainGrid(copy));
  });
});
