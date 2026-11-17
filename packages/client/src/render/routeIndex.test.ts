import { getCourse, getCourseDef } from '@lodgy/shared';
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { buildCells, CELL_LENGTH } from './decorChunks';
import { scatterDecor, seedFromId } from './decorScatter';
import { buildTerrainGrid, routeDistance, surfaceYAt } from './terrain';

const airport = getCourse('airport');
const route = airport.route;

function bruteDistance(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const x0 = route[i]![0];
    const z0 = route[i]![1];
    const dx = route[i + 1]![0] - x0;
    const dz = route[i + 1]![1] - z0;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / lengthSquared));
    const ex = x - (x0 + dx * t);
    const ez = z - (z0 + dz * t);
    best = Math.min(best, ex * ex + ez * ez);
  }
  return Math.sqrt(best);
}

function bruteAlong(x: number, z: number): number {
  let best = Infinity;
  let along = 0;
  let walked = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const [x0, z0] = route[i]!;
    const [x1, z1] = route[i + 1]!;
    const length = Math.hypot(x1 - x0, z1 - z0);
    const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((x - x0) * (x1 - x0) + (z - z0) * (z1 - z0)) / (length * length)));
    const d = Math.hypot(x - (x0 + (x1 - x0) * t), z - (z0 + (z1 - z0) * t));
    if (d < best) {
      best = d;
      along = walked + t * length;
    }
    walked += length;
  }
  return along;
}

// A scan over every box: each box alone, the highest top wins.
function bruteSurface(x: number, z: number): number | null {
  let best: number | null = null;
  for (const box of airport.ground) {
    const y = surfaceYAt({ ...airport, ground: [box] }, x, z);
    if (y !== null && (best === null || y > best)) best = y;
  }
  return best;
}

const samples: [number, number][] = [];
for (let i = 0; i < 600; i++) {
  const [x, z] = route[(i * 7919) % route.length]!;
  const spread = [0, 3, 12, 40, 150, 600, 3000][i % 7]!;
  samples.push([x + Math.sin(i * 1.7) * spread, z + Math.cos(i * 2.3) * spread]);
}

// Recorded from the brute-force scans before the route index and ground grid existed.
const GOLDEN_COUNT = 2328;
const GOLDEN_HASH = 'e6fd33253b3ccefc6bb8ac9bce050437acf84215293e1cdda6b58a07c9d95099';

describe('route index equals a scan over every segment', () => {
  test('1: routeDistance matches the brute-force distance exactly', () => {
    for (const [x, z] of samples) expect(routeDistance(airport, x, z).distance).toBe(bruteDistance(x, z));
  });

  test('2: the along-route cell of every placement and sample matches the brute-force scan', () => {
    const placements = scatterDecor(airport, getCourseDef('airport'), seedFromId('airport'));
    const expected = new Map<number, number>();
    for (const p of placements) {
      const id = Math.floor(bruteAlong(p.x, p.z) / CELL_LENGTH);
      expected.set(id, (expected.get(id) ?? 0) + 1);
    }
    expect(new Map(buildCells(placements, route).map((c) => [c.id, c.placements.length]))).toEqual(expected);
    for (const [x, z] of samples) {
      const [cell] = buildCells([{ model: 'decor.scrub', x, y: 0, z, yaw: 0, scale: 1 }], route);
      expect(cell!.id).toBe(Math.floor(bruteAlong(x, z) / CELL_LENGTH));
    }
  });

  test('3: surfaceYAt through the ground grid matches a scan of every box', () => {
    for (const [x, z] of samples) expect(surfaceYAt(airport, x, z)).toBe(bruteSurface(x, z));
  });

  test('4: the airport placements are exactly those the brute-force scans produced', () => {
    const placements = scatterDecor(airport, getCourseDef('airport'), seedFromId('airport'));
    expect(placements.length).toBe(GOLDEN_COUNT);
    expect(createHash('sha256').update(JSON.stringify(placements)).digest('hex')).toBe(GOLDEN_HASH);
  });
});

const gridHash = (name: string) => {
  const grid = buildTerrainGrid(getCourse(name));
  return createHash('sha256').update(Buffer.from(grid.positions.buffer)).update(Buffer.from(grid.normals.buffer)).update(JSON.stringify(grid.chunks.map((c) => [c.centre, c.radius, c.indices.length]))).digest('hex');
};
// Recorded with the grid-based route index, which matched the brute-force scan exactly.
const GRID_HASHES: Record<string, string> = {
  airport: 'dd24dd50bea0cbc261eff27b9c1a247a70b2a97c3751f4876f10364fae59c82d',
  test: 'c448a9c34197e1a7d0ac67c7d072671d7857cf5ca8ebc02e6a2d3c4c3ceac45e',
  'segment-demo': '07ef425777293ca1fadef6e7030fe01ba1a2ca7c85b80f71957c935bb0dc6fd2',
};

describe('terrain grid', () => {
  for (const name of Object.keys(GRID_HASHES)) {
    test(`5: the ${name} grid is unchanged`, () => {
      const hash = gridHash(name);
      expect(hash).toBe(GRID_HASHES[name]);
    });
  }

  test('6: grid vertex distances match the brute-force scan on every course', () => {
    for (const name of ['airport', 'test', 'segment-demo', 'marrakech']) {
      const course = getCourse(name);
      const grid = buildTerrainGrid(course);
      const step = name === 'marrakech' ? 997 : 61;
      const r = course.route;
      for (let v = 0; v < grid.positions.length / 3; v += step) {
        const x = grid.positions[v * 3]!;
        const z = grid.positions[v * 3 + 2]!;
        let best = Infinity;
        for (let i = 0; i < r.length - 1; i++) {
          const dx = r[i + 1]![0] - r[i]![0];
          const dz = r[i + 1]![1] - r[i]![1];
          const l2 = dx * dx + dz * dz;
          const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - r[i]![0]) * dx + (z - r[i]![1]) * dz) / l2));
          const ex = x - (r[i]![0] + dx * t);
          const ez = z - (r[i]![1] + dz * t);
          best = Math.min(best, ex * ex + ez * ez);
        }
        expect(routeDistance(course, x, z).distance).toBe(Math.sqrt(best));
      }
    }
  }, 60_000);

  test('7: the 22 km marrakech grid builds in under 1.5 s', () => {
    const course = getCourse('marrakech');
    const start = performance.now();
    buildTerrainGrid(course);
    const ms = performance.now() - start;
    console.info(`buildTerrainGrid(marrakech): ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(1500);
  }, 120_000);
});
