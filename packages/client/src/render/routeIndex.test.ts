import { getCourse, getCourseDef } from '@lodgy/shared';
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { buildCells, CELL_LENGTH } from './decorChunks';
import { scatterDecor, seedFromId } from './decorScatter';
import { routeDistance, surfaceYAt } from './terrain';

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
