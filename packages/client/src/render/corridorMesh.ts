import { CORRIDOR_BLEND_START, corridorHeightAt, corridorOf, routeFrame, type BuiltCourse, type Corridor, type CorridorTile } from '@lodgy/shared';
import * as THREE from 'three';
import { TEXTURE_METRES_PER_REPEAT } from './groundMerge';
import { groundTexture, type SceneOptions } from './groundTextures';
import { terrainShade } from './terrain';

// Metres a tile's edge skirt hangs below its surface, so a crack to a missing neighbour or the far land shows no gap.
export const SKIRT = 2;
const SAND = 0xd9b77a;
const ROCK: readonly [number, number, number] = [0.55, 0.46, 0.4];
const UPDATE_SECONDS = 0.25;
// A loaded tile is kept until it is this much farther than the radius.
const KEEP_MARGIN = 64;
export const MAX_BUILDS = 3;

export interface TileGeometry {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colours: Float32Array;
  indices: Uint16Array;
  vertices: number;
}

const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

// The tile's surface vertices in Rapier's layout (index zi + xi * (rows + 1)), then a skirt ring below its edge. Each cell splits along (x1, z0)-(x0, z1), as Rapier and corridorHeightAt do.
export function buildTileGeometry(course: BuiltCourse, corridor: Corridor, tile: CorridorTile): TileGeometry {
  const frame = routeFrame(course);
  const stride = tile.rows + 1;
  const surface = stride * (tile.cols + 1);
  const ring = 2 * (tile.cols + tile.rows);
  const vertices = surface + ring;
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  const uvs = new Float32Array(vertices * 2);
  const colours = new Float32Array(vertices * 3);
  // Segments that can be the nearest to a point of this tile (fade distance only needs the land within 60 m of the road).
  const size = tile.cols * tile.cell;
  const reach = 60 + size;
  const { minX, maxX, minZ, maxZ, count } = frame.segment;
  const near: number[] = [];
  for (let i = 0; i < count; i++) {
    if (maxX[i]! < tile.x0 - reach || minX[i]! > tile.x0 + size + reach || maxZ[i]! < tile.z0 - reach || minZ[i]! > tile.z0 + size + reach) continue;
    near.push(i);
  }
  const heightOf = (x: number, z: number, own: number): number => corridorHeightAt(corridor, x, z) ?? own;
  for (let xi = 0; xi <= tile.cols; xi++) {
    for (let zi = 0; zi <= tile.rows; zi++) {
      const v = zi + xi * stride;
      const x = tile.x0 + xi * tile.cell;
      const z = tile.z0 + zi * tile.cell;
      const y = tile.heights[v]!;
      const slopeX = (heightOf(x + tile.cell, z, y) - heightOf(x - tile.cell, z, y)) / (2 * tile.cell);
      const slopeZ = (heightOf(x, z + tile.cell, y) - heightOf(x, z - tile.cell, y)) / (2 * tile.cell);
      const length = Math.sqrt(slopeX * slopeX + 1 + slopeZ * slopeZ);
      positions.set([x, y, z], v * 3);
      normals.set([-slopeX / length, 1 / length, -slopeZ / length], v * 3);
      uvs.set([x / TEXTURE_METRES_PER_REPEAT, z / TEXTURE_METRES_PER_REPEAT], v * 2);
      // Plain sand like the shoulders at the road, the slow brightness swing further out; steep ground (berms, the ridge) turns to rock.
      const d = near.length > 0 ? frame.nearestIn(x, z, near).d : Infinity;
      const shade = 1 + (terrainShade(x, z) - 1) * smoothstep((d - CORRIDOR_BLEND_START) / 30);
      const rock = smoothstep((0.9 - length ** -1) / 0.35);
      for (let c = 0; c < 3; c++) colours[v * 3 + c] = shade * (1 + (ROCK[c]! - 1) * rock);
    }
  }
  // Skirt ring: up x-ward along z0, then z-ward along the far x edge, back along z1, then down the near x edge; outward is up x travel.
  const edge: number[] = [];
  for (let xi = 0; xi < tile.cols; xi++) edge.push(0 + xi * stride);
  for (let zi = 0; zi < tile.rows; zi++) edge.push(zi + tile.cols * stride);
  for (let xi = tile.cols; xi > 0; xi--) edge.push(tile.rows + xi * stride);
  for (let zi = tile.rows; zi > 0; zi--) edge.push(zi + 0 * stride);
  for (let k = 0; k < ring; k++) {
    const top = edge[k]!;
    const low = surface + k;
    positions.set([positions[top * 3]!, positions[top * 3 + 1]! - SKIRT, positions[top * 3 + 2]!], low * 3);
    normals.set([normals[top * 3]!, normals[top * 3 + 1]!, normals[top * 3 + 2]!], low * 3);
    uvs.set([uvs[top * 2]!, uvs[top * 2 + 1]!], low * 2);
    colours.set([colours[top * 3]!, colours[top * 3 + 1]!, colours[top * 3 + 2]!], low * 3);
  }
  const indices = new Uint16Array(tile.cols * tile.rows * 6 + ring * 6);
  let n = 0;
  for (let xi = 0; xi < tile.cols; xi++) {
    for (let zi = 0; zi < tile.rows; zi++) {
      const a = zi + xi * stride;
      const b = a + stride;
      const c = a + 1;
      const e = b + 1;
      // Counter-clockwise from above.
      indices.set([a, c, b, b, c, e], n);
      n += 6;
    }
  }
  for (let k = 0; k < ring; k++) {
    const next = (k + 1) % ring;
    const p = edge[k]!;
    const q = edge[next]!;
    const lp = surface + k;
    const lq = surface + next;
    indices.set([p, q, lp, q, lq, lp], n);
    n += 6;
  }
  return { positions, normals, uvs, colours, indices, vertices };
}

export interface CorridorTerrain {
  readonly group: THREE.Group;
  readonly loaded: number;
  loadedTiles(): CorridorTile[];
  // Drops the tiles far from the camera and builds up to MAX_BUILDS of those within the radius, nearest first (all of them when `force`); acts at most every UPDATE_SECONDS unless `force`.
  update(camera: { x: number; z: number }, nowSeconds: number, force?: boolean): void;
  dispose(): void;
}

function sandMaterial({ lite = false, flat = false }: SceneOptions): THREE.MeshStandardMaterial {
  const map = flat ? null : groundTexture('sand', 'diffuse');
  if (map) map.anisotropy = lite ? 1 : 4;
  return new THREE.MeshStandardMaterial({ color: map ? 0xffffff : SAND, map, normalMap: map && !lite ? groundTexture('sand', 'normal') : null, roughness: 1, metalness: 0, vertexColors: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 });
}

// The land beside the road, one mesh per tile, built when the camera comes within `radius` and disposed when it leaves; null for a course without a corridor.
export function createCorridorTerrain(course: BuiltCourse, radius: number, options: SceneOptions = {}): CorridorTerrain | null {
  const corridor = corridorOf(course);
  if (!corridor) return null;
  const material = sandMaterial(options);
  const group = new THREE.Group();
  const loaded = new Map<CorridorTile, THREE.Mesh>();
  let last = -Infinity;
  const distance = (tile: CorridorTile, x: number, z: number) => {
    const size = tile.cols * tile.cell;
    return Math.hypot(Math.max(tile.x0 - x, 0, x - tile.x0 - size), Math.max(tile.z0 - z, 0, z - tile.z0 - size));
  };
  const drop = (tile: CorridorTile) => {
    const mesh = loaded.get(tile)!;
    group.remove(mesh);
    mesh.geometry.dispose();
    loaded.delete(tile);
  };
  return {
    group,
    get loaded() {
      return loaded.size;
    },
    loadedTiles: () => [...loaded.keys()],
    update(camera, nowSeconds, force = false) {
      if (!force && nowSeconds - last < UPDATE_SECONDS) return;
      last = nowSeconds;
      for (const tile of [...loaded.keys()]) if (distance(tile, camera.x, camera.z) > radius + KEEP_MARGIN - 1e-6) drop(tile);
      const wanted = corridor.tiles
        .filter((tile) => !loaded.has(tile))
        .map((tile) => ({ tile, d: distance(tile, camera.x, camera.z) }))
        .filter((entry) => entry.d <= radius)
        .sort((p, q) => p.d - q.d);
      for (const { tile } of wanted.slice(0, force ? wanted.length : MAX_BUILDS)) {
        const data = buildTileGeometry(course, corridor, tile);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
        geometry.setAttribute('color', new THREE.BufferAttribute(data.colours, 3));
        geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = false;
        loaded.set(tile, mesh);
        group.add(mesh);
      }
    },
    dispose() {
      for (const tile of [...loaded.keys()]) drop(tile);
      material.dispose();
    },
  };
}
