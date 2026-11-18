import { CORRIDOR_OUTER, corridorHeightAt, corridorOf, getCourse } from '@lodgy/shared';
import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { buildTileGeometry, createCorridorTerrain, SKIRT } from './corridorMesh';
import { buildTerrainGrid, landHeight, ridgeTopAt, routeDistance, terrainHeight } from './terrain';

const course = getCourse('marrakech');
const corridor = corridorOf(course)!;

function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('tile meshes', () => {
  test('T8: 200 sampled vertices match corridorHeightAt within 0.05 m, and the vertices stay under the Uint16 limit', () => {
    const rng = prng(8);
    for (let n = 0; n < 200; n++) {
      const tile = corridor.tiles[Math.floor(rng() * corridor.tiles.length)]!;
      const data = buildTileGeometry(course, corridor, tile);
      expect(data.vertices).toBeLessThan(65536);
      const xi = Math.floor(rng() * (tile.cols + 1));
      const zi = Math.floor(rng() * (tile.rows + 1));
      const v = zi + xi * (tile.rows + 1);
      const x = tile.x0 + xi * tile.cell;
      const z = tile.z0 + zi * tile.cell;
      expect(data.positions[v * 3]).toBe(x);
      expect(Math.abs(data.positions[v * 3 + 1]! - tile.heights[v]!)).toBeLessThan(0.05);
      const height = corridorHeightAt(corridor, x, z);
      if (height !== null) expect(Math.abs(data.positions[v * 3 + 1]! - height)).toBeLessThan(0.05);
    }
  });

  test('inside a cell the mesh follows Rapier\'s diagonal', () => {
    const rng = prng(9);
    const tile = corridor.tiles[Math.floor(corridor.tiles.length / 2)]!;
    const data = buildTileGeometry(course, corridor, tile);
    const surfaceTriangles = tile.cols * tile.rows * 2;
    const vertex = (i: number) => new THREE.Vector3(data.positions[i * 3], data.positions[i * 3 + 1], data.positions[i * 3 + 2]);
    for (let n = 0; n < 200; n++) {
      const x = tile.x0 + 0.01 + rng() * (tile.cols * tile.cell - 0.02);
      const z = tile.z0 + 0.01 + rng() * (tile.rows * tile.cell - 0.02);
      let found: number | null = null;
      for (let t = 0; t < surfaceTriangles; t++) {
        const [a, b, c] = [vertex(data.indices[t * 3]!), vertex(data.indices[t * 3 + 1]!), vertex(data.indices[t * 3 + 2]!)];
        const triangle = new THREE.Triangle(new THREE.Vector3(a.x, 0, a.z), new THREE.Vector3(b.x, 0, b.z), new THREE.Vector3(c.x, 0, c.z));
        if (!triangle.containsPoint(new THREE.Vector3(x, 0, z))) continue;
        const bary = new THREE.Vector3();
        triangle.getBarycoord(new THREE.Vector3(x, 0, z), bary);
        found = a.y * bary.x + b.y * bary.y + c.y * bary.z;
        break;
      }
      expect(found).not.toBeNull();
      expect(Math.abs(found! - corridorHeightAt(corridor, x, z)!)).toBeLessThan(0.05);
    }
  });

  test('every triangle faces up, skirts face outwards, and indices are in range', () => {
    const tile = corridor.tiles[3]!;
    const data = buildTileGeometry(course, corridor, tile);
    const surfaceTriangles = tile.cols * tile.rows * 2;
    const at = (i: number) => new THREE.Vector3(data.positions[i * 3], data.positions[i * 3 + 1], data.positions[i * 3 + 2]);
    for (let t = 0; t < data.indices.length / 3; t++) {
      const [a, b, c] = [at(data.indices[t * 3]!), at(data.indices[t * 3 + 1]!), at(data.indices[t * 3 + 2]!)];
      const normal = new THREE.Triangle(a, b, c).getNormal(new THREE.Vector3());
      if (t < surfaceTriangles) expect(normal.y).toBeGreaterThan(0);
      else if (normal.y > 0.5) continue; // the flange strip faces up
      else {
        expect(Math.abs(normal.y)).toBeLessThan(1e-6);
        const centre = new THREE.Vector3(tile.x0 + (tile.cols * tile.cell) / 2, 0, tile.z0 + (tile.rows * tile.cell) / 2);
        const mid = a.clone().add(b).add(c).divideScalar(3);
        expect(normal.dot(new THREE.Vector3(mid.x - centre.x, 0, mid.z - centre.z))).toBeGreaterThan(0);
      }
    }
    for (const index of data.indices) expect(index).toBeLessThan(data.vertices);
    expect(SKIRT).toBeGreaterThan(0);
  });

  test('steep ground (the ridge) is tinted towards rock and the road side stays plain sand', () => {
    let darkest = Infinity;
    let brightest = 0;
    for (const tile of corridor.tiles.slice(0, 12)) {
      const data = buildTileGeometry(course, corridor, tile);
      for (let v = 0; v < data.vertices; v++) {
        darkest = Math.min(darkest, data.colours[v * 3 + 2]!);
        brightest = Math.max(brightest, data.colours[v * 3]!);
      }
    }
    expect(darkest).toBeLessThan(0.6);
    expect(brightest).toBeLessThan(1.1);
  });
});

describe('lazy tiles', () => {
  test('loads the tiles within the radius, none far away, and disposes them when the camera leaves', () => {
    const terrain = createCorridorTerrain(course, 350, { flat: true })!;
    const start = course.route[0]!;
    terrain.update({ x: start[0], z: start[1] }, 0, true);
    const first = terrain.loaded;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(corridor.tiles.length / 10);
    const geometries = terrain.group.children.map((mesh) => (mesh as THREE.Mesh).geometry);
    let disposed = 0;
    for (const g of geometries) g.addEventListener('dispose', () => disposed++);
    const far = course.route[Math.floor(course.route.length / 2)]!;
    terrain.update({ x: far[0], z: far[1] }, 10);
    expect(disposed).toBe(geometries.length);
    expect(terrain.loaded).toBeGreaterThan(0);
    for (const mesh of terrain.group.children as THREE.Mesh[]) expect(mesh.geometry.index!.array).toBeInstanceOf(Uint16Array);
    terrain.dispose();
    expect(terrain.loaded).toBe(0);
  });

  test('a smaller radius loads fewer tiles; a course without a corridor has none', () => {
    const start = course.route[0]!;
    const small = createCorridorTerrain(course, 120, { flat: true })!;
    const large = createCorridorTerrain(course, 350, { flat: true })!;
    small.update({ x: start[0], z: start[1] }, 0, true);
    large.update({ x: start[0], z: start[1] }, 0, true);
    expect(small.loaded).toBeLessThanOrEqual(large.loaded);
    small.dispose();
    large.dispose();
    expect(createCorridorTerrain(getCourse('airport'), 350)).toBeNull();
  });
});

describe('far terrain', () => {
  test('T8: never above the ridge top within 8 m of CORRIDOR_OUTER', () => {
    const rng = prng(10);
    let checked = 0;
    for (let n = 0; n < 4000 && checked < 300; n++) {
      const tile = corridor.tiles[Math.floor(rng() * corridor.tiles.length)]!;
      const x = tile.x0 + rng() * tile.cols * tile.cell;
      const z = tile.z0 + rng() * tile.rows * tile.cell;
      const { distance, smooth } = routeDistance(course, x, z);
      if (distance < CORRIDOR_OUTER || distance > CORRIDOR_OUTER + 8) continue;
      checked++;
      const top = ridgeTopAt(course, x, z, smooth);
      expect(terrainHeight(course, x, z)).toBeLessThanOrEqual(top + 1e-6);
      expect(landHeight(course, x, z)).toBeLessThanOrEqual(top + 0.3);
    }
    expect(checked).toBeGreaterThan(50);
  });

  test('every far vertex beyond the corridor is at or below its ridge top and the grid is finite', () => {
    const grid = buildTerrainGrid(course);
    expect(grid.cells).toBeGreaterThan(1000);
    for (const value of grid.positions) expect(Number.isFinite(value)).toBe(true);
    for (let v = 0; v < grid.positions.length; v += 3 * 97) {
      const x = grid.positions[v]!;
      const z = grid.positions[v + 2]!;
      const { distance, smooth } = routeDistance(course, x, z);
      if (distance < CORRIDOR_OUTER || corridorHeightAt(corridor, x, z) !== null) continue;
      expect(grid.positions[v + 1]!).toBeLessThanOrEqual(ridgeTopAt(course, x, z, smooth) + 1e-4);
    }
  });

  test('inside the tiles the far mesh lies under the corridor', () => {
    const rng = prng(11);
    for (let n = 0; n < 100; n++) {
      const tile = corridor.tiles[Math.floor(rng() * corridor.tiles.length)]!;
      const x = tile.x0 + rng() * tile.cols * tile.cell;
      const z = tile.z0 + rng() * tile.rows * tile.cell;
      expect(terrainHeight(course, x, z)).toBeLessThan(corridorHeightAt(corridor, x, z)! - 1);
    }
  });
});
