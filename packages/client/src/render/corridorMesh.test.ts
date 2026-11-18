import { CORRIDOR_OUTER, corridorHeightAt, corridorOf, getCourse } from '@lodgy/shared';
import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { buildTileGeometry, createCorridorTerrain, MAX_BUILDS, SKIRT } from './corridorMesh';
import { farMeshHeight, landHeight, ridgeTopAt, routeDistance, terrainHeight } from './terrain';

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

  test('builds at most MAX_BUILDS tiles per update, nearest first, except the forced first call', () => {
    const start = course.route[0]!;
    const camera = { x: start[0], z: start[1] };
    const terrain = createCorridorTerrain(course, 350, { flat: true })!;
    terrain.update(camera, 0, true);
    const all = terrain.loaded;
    expect(all).toBeGreaterThan(MAX_BUILDS);
    terrain.dispose();
    const lazy = createCorridorTerrain(course, 350, { flat: true })!;
    lazy.update(camera, 0);
    expect(lazy.loaded).toBe(MAX_BUILDS);
    const first = lazy.loadedTiles();
    lazy.update(camera, 1);
    expect(lazy.loaded).toBe(Math.min(all, 2 * MAX_BUILDS));
    const nearness = (tile: (typeof first)[number]) => Math.hypot(Math.max(tile.x0 - camera.x, 0, camera.x - tile.x0 - 128), Math.max(tile.z0 - camera.z, 0, camera.z - tile.z0 - 128));
    const second = lazy.loadedTiles().filter((tile) => !first.includes(tile));
    for (const a of first) for (const b of second) expect(nearness(a)).toBeLessThanOrEqual(nearness(b));
    lazy.dispose();
  });

  test('updates are throttled to every 0.25 s unless forced', () => {
    const start = course.route[0]!;
    const terrain = createCorridorTerrain(course, 350, { flat: true })!;
    terrain.update({ x: start[0], z: start[1] }, 10);
    const count = terrain.loaded;
    terrain.update({ x: start[0], z: start[1] }, 10.1);
    expect(terrain.loaded).toBe(count);
    terrain.update({ x: start[0], z: start[1] }, 10.3);
    expect(terrain.loaded).toBeGreaterThan(count);
    terrain.dispose();
  });

  test('hysteresis: a tile stays at radius + 10 m and goes at radius + 64 m', () => {
    const radius = 200;
    const terrain = createCorridorTerrain(course, radius, { flat: true })!;
    const start = course.route[0]!;
    terrain.update({ x: start[0], z: start[1] }, 0, true);
    const tile = terrain.loadedTiles()[0]!;
    const size = tile.cols * tile.cell;
    const midZ = tile.z0 + size / 2;
    const away = (gap: number) => ({ x: tile.x0 - gap, z: midZ });
    terrain.update(away(radius + 10), 1, true);
    expect(terrain.loadedTiles()).toContain(tile);
    terrain.update(away(radius + 64.5), 2, true);
    expect(terrain.loadedTiles()).not.toContain(tile);
    terrain.dispose();
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
      expect(farMeshHeight(course, x, z)).toBeLessThanOrEqual(top + 0.5);
    }
    expect(checked).toBeGreaterThan(50);
  });

  test('inside the tiles the far mesh, on its own diagonal, lies at least 0.2 m under the corridor at random points of random tiles', () => {
    const rng = prng(11);
    let worst = Infinity;
    for (let n = 0; n < 1500; n++) {
      const tile = corridor.tiles[Math.floor(rng() * corridor.tiles.length)]!;
      const x = tile.x0 + rng() * tile.cols * tile.cell;
      const z = tile.z0 + rng() * tile.rows * tile.cell;
      const tileHeight = corridorHeightAt(corridor, x, z)!;
      worst = Math.min(worst, tileHeight - farMeshHeight(course, x, z));
    }
    expect(worst).toBeGreaterThanOrEqual(0.2);
  });

  test('at the tile set\'s edge the far mesh is hidden but meets it: typically within 4 m, at most 0.5 m above', () => {
    const rng = prng(12);
    const gaps: number[] = [];
    for (let n = 0; n < 20000 && gaps.length < 150; n++) {
      const tile = corridor.tiles[Math.floor(rng() * corridor.tiles.length)]!;
      const west = rng() < 0.5;
      const edgeX = west ? tile.x0 + 0.5 : tile.x0 + tile.cols * tile.cell - 0.5;
      const z = tile.z0 + rng() * tile.rows * tile.cell;
      if (corridorHeightAt(corridor, edgeX + (west ? -2 : 2), z) !== null) continue;
      gaps.push(corridorHeightAt(corridor, edgeX, z)! - farMeshHeight(course, edgeX, z));
    }
    expect(gaps.length).toBeGreaterThan(50);
    gaps.sort((a, b) => a - b);
    expect(gaps[0]).toBeGreaterThanOrEqual(-0.5); // the tile material is pulled forward by its polygon offset
    expect(gaps[gaps.length >> 1]).toBeLessThan(4);
  });

  test('decor lands on the drawn far mesh outside the tiles', () => {
    const rng = prng(13);
    const tile = corridor.tiles[0]!;
    for (let n = 0; n < 50; n++) {
      const x = tile.x0 - 300 - rng() * 400;
      const z = tile.z0 + rng() * 400;
      if (corridorHeightAt(corridor, x, z) !== null) continue;
      expect(landHeight(course, x, z)).toBe(farMeshHeight(course, x, z));
    }
  });
});
