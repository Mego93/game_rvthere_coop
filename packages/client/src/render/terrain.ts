import { CORRIDOR_CELL, CORRIDOR_RELIEF, CORRIDOR_RIDGE_HEIGHT, CORRIDOR_TILE_CELLS, corridorHeightAt, corridorOf, corridorReliefAt, routeFrame, routeHeights, surfaceYAt, type BuiltCourse, type Corridor } from '@lodgy/shared';
import * as THREE from 'three';
import { nearestSegment } from './routeIndex';
import { groundTexture, tinted, type SceneOptions } from './groundTextures';

export { surfaceYAt };

export const TERRAIN_CELL = 40;
export const TERRAIN_MARGIN = 1000;
export const TERRAIN_METRES_PER_REPEAT = 8;
const FLAT_DROP = 0.5;
const FLAT_UNTIL = 28;
const ESCARPMENT_END = 36;
const FAR_DROP = 1.2;
const FALL_PER_METRE = 0.004;
const NEAR_ROUTE = 80;
const RED_EARTH = 0xa65a3a;
// Beyond the tile set the land keeps the ridge-top height and rolls down gently over FAR_RAMP m; it never rises above the ridge top.
export const FAR_RAMP = 100;
export const FAR_ROLL = 10;
// Inside the tiles the far mesh lies under the corridor, hidden by the tile meshes and shown (lower) where they are not loaded: FAR_SUNK_EDGE m under it at the tile set's boundary, deepening to FAR_SUNK_DEEP m under the lowest corridor within FAR_SUNK_REACH m, once that far inside.
export const FAR_SUNK_EDGE = 0.5;
export const FAR_SUNK_DEEP = 2;
export const FAR_SUNK_REACH = 40;
const FAR_SUNK_STEP = 10;
export const FAR_OUTSIDE_SINK = 5;

// Distance to the route's centre line and the route's ground height at the nearest point.
export function routeDistance(course: BuiltCourse, x: number, z: number): { distance: number; y: number; smooth: number } {
  const heights = routeHeights(course);
  const route = course.route;
  let best = Infinity;
  let y = heights[0] ?? 0;
  let tAt = 0;
  if (route.length === 1) return { distance: Math.hypot(x - route[0]![0], z - route[0]![1]), y, smooth: y };
  const along = (i: number) => {
    const x0 = route[i]![0];
    const z0 = route[i]![1];
    const dx = route[i + 1]![0] - x0;
    const dz = route[i + 1]![1] - z0;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / lengthSquared));
    const ex = x - (x0 + dx * t);
    const ez = z - (z0 + dz * t);
    return { squared: ex * ex + ez * ez, t };
  };
  const i = nearestSegment(route, x, z, (k) => along(k).squared, true);
  if (i >= 0) {
    const hit = along(i);
    best = hit.squared;
    y = heights[i]! + (heights[i + 1]! - heights[i]!) * hit.t;
    tAt = hit.t;
  }
  // The smoothed route height is only needed by corridor courses.
  const smooth = course.corridor && i >= 0 ? routeFrame(course).smoothedAt({ i, t: tAt }) : y;
  return { distance: Math.sqrt(best), y, smooth };
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

// How far below the route's surface the far terrain lies at `distance` metres from the centre line.
function drop(distance: number): number {
  if (distance <= FLAT_UNTIL) return FLAT_DROP;
  if (distance < ESCARPMENT_END) return FLAT_DROP + (FAR_DROP - FLAT_DROP) * smoothstep((distance - FLAT_UNTIL) / (ESCARPMENT_END - FLAT_UNTIL));
  return FAR_DROP + FALL_PER_METRE * (distance - ESCARPMENT_END);
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

// The ridge top at (x, z): the smoothed route height plus the relief there plus the ridge.
export function ridgeTopAt(course: BuiltCourse, x: number, z: number, smooth: number): number {
  return smooth + corridorReliefAt(course.id, x, z) + CORRIDOR_RIDGE_HEIGHT;
}

const TILE_SIZE = CORRIDOR_TILE_CELLS * CORRIDOR_CELL;

// Distance from (x, z) to the nearest tile of the corridor, FAR_RAMP and more when none is within a tile's reach.
function tileGap(corridor: Corridor, x: number, z: number): number {
  const ix = Math.floor(x / TILE_SIZE);
  const iz = Math.floor(z / TILE_SIZE);
  let best = FAR_RAMP;
  for (let i = ix - 1; i <= ix + 1; i++) {
    for (let j = iz - 1; j <= iz + 1; j++) {
      const tile = corridor.index.get((i + 32768) * 65536 + (j + 32768));
      if (!tile) continue;
      best = Math.min(best, Math.hypot(Math.max(tile.x0 - x, 0, x - tile.x0 - TILE_SIZE), Math.max(tile.z0 - z, 0, z - tile.z0 - TILE_SIZE)));
    }
  }
  return best;
}

// Corridor courses: the land beyond the tiles, the ridge top rolling lower by up to FAR_ROLL m over the FAR_RAMP m beyond the tile set (never higher).
export function farLandHeight(course: BuiltCourse, corridor: Corridor, x: number, z: number, smooth: number): number {
  const wave = Math.max(-1, Math.min(1, corridorReliefAt(course.id, x * 0.35 + 7000, z * 0.35 - 5000) / CORRIDOR_RELIEF));
  const gap = tileGap(corridor, x, z);
  // Just outside the tile set the land dips by up to FAR_OUTSIDE_SINK m, fading over FAR_SUNK_REACH m, so it stays under the corridor's relief where cells straddle the boundary.
  const dip = FAR_OUTSIDE_SINK * (1 - smoothstep(clamp01(gap / FAR_SUNK_REACH)));
  return ridgeTopAt(course, x, z, smooth) + (FAR_ROLL * (wave - 1)) / 2 * smoothstep(clamp01(gap / FAR_RAMP)) - dip;
}

function sunkHeight(corridor: Corridor, x: number, z: number, base: number): number {
  const seen: { reach: number; h: number }[] = [];
  let inside = FAR_SUNK_REACH;
  for (let dx = -FAR_SUNK_REACH; dx <= FAR_SUNK_REACH; dx += FAR_SUNK_STEP) {
    for (let dz = -FAR_SUNK_REACH; dz <= FAR_SUNK_REACH; dz += FAR_SUNK_STEP) {
      if (dx === 0 && dz === 0) continue;
      const reach = Math.hypot(dx, dz);
      const h = corridorHeightAt(corridor, x + dx, z + dz);
      if (h === null) inside = Math.min(inside, reach);
      else seen.push({ reach, h });
    }
  }
  const t = smoothstep(inside / FAR_SUNK_REACH);
  // The lowest corridor within a window that grows from one step at the boundary to the whole neighbourhood once FAR_SUNK_REACH m inside.
  const window = FAR_SUNK_STEP * 1.5 + (FAR_SUNK_REACH * 1.5 - FAR_SUNK_STEP * 1.5) * t;
  let lowest = base;
  for (const sample of seen) if (sample.reach <= window) lowest = Math.min(lowest, sample.h);
  return lowest - (FAR_SUNK_EDGE + (FAR_SUNK_DEEP - FAR_SUNK_EDGE) * t);
}

// Visual only. Other courses: the terrain hides under the collision shoulders, then falls away as an escarpment. Corridor courses: the far land, sunk under the tiles.
export function terrainHeight(course: BuiltCourse, x: number, z: number): number {
  const { distance, y, smooth } = routeDistance(course, x, z);
  const corridor = corridorOf(course);
  if (!corridor) return y - drop(distance);
  const tile = corridorHeightAt(corridor, x, z);
  return tile !== null ? sunkHeight(corridor, x, z, tile) : farLandHeight(course, corridor, x, z, smooth);
}

interface GridShape {
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
}
const shapes = new WeakMap<BuiltCourse, GridShape>();
const vertexHeights = new WeakMap<BuiltCourse, Map<number, number>>();

function gridShape(course: BuiltCourse): GridShape {
  let shape = shapes.get(course);
  if (!shape) {
    const xs = course.route.map((p) => p[0]);
    const zs = course.route.map((p) => p[1]);
    const minX = Math.min(...xs) - TERRAIN_MARGIN;
    const minZ = Math.min(...zs) - TERRAIN_MARGIN;
    shape = { minX, minZ, cols: Math.ceil((Math.max(...xs) + TERRAIN_MARGIN - minX) / TERRAIN_CELL), rows: Math.ceil((Math.max(...zs) + TERRAIN_MARGIN - minZ) / TERRAIN_CELL) };
    shapes.set(course, shape);
  }
  return shape;
}

// The far mesh's vertex (i, j) of a corridor course, remembered.
function farVertex(course: BuiltCourse, i: number, j: number): number {
  const { minX, minZ, cols } = gridShape(course);
  let cache = vertexHeights.get(course);
  if (!cache) {
    cache = new Map();
    vertexHeights.set(course, cache);
  }
  const key = j * (cols + 1) + i;
  let h = cache.get(key);
  if (h === undefined) {
    h = terrainHeight(course, minX + i * TERRAIN_CELL, minZ + j * TERRAIN_CELL);
    cache.set(key, h);
  }
  return h;
}

// The far mesh's own surface at (x, z) on a corridor course: its cells split along the (0,0)-(1,1) diagonal.
export function farMeshHeight(course: BuiltCourse, x: number, z: number): number {
  const { minX, minZ, cols, rows } = gridShape(course);
  const fx = (x - minX) / TERRAIN_CELL;
  const fz = (z - minZ) / TERRAIN_CELL;
  const i = Math.max(0, Math.min(cols - 1, Math.floor(fx)));
  const j = Math.max(0, Math.min(rows - 1, Math.floor(fz)));
  const u = fx - i;
  const v = fz - j;
  const h00 = farVertex(course, i, j);
  const h11 = farVertex(course, i + 1, j + 1);
  return u >= v ? h00 + (farVertex(course, i + 1, j) - h00) * u + (h11 - farVertex(course, i + 1, j)) * v : h00 + (h11 - farVertex(course, i, j + 1)) * u + (farVertex(course, i, j + 1) - h00) * v;
}

// The ground the decor stands on: the shared corridor where there is one, else the far mesh as drawn.
export function landHeight(course: BuiltCourse, x: number, z: number): number {
  const corridor = corridorOf(course);
  if (!corridor) return terrainHeight(course, x, z);
  return corridorHeightAt(corridor, x, z) ?? farMeshHeight(course, x, z);
}

// A slow, deterministic brightness swing so the 8 m texture does not read as stripes from afar.
export function terrainShade(x: number, z: number): number {
  const wave = Math.sin(x * 0.0113 + z * 0.0071) * 0.5 + Math.sin(x * 0.0037 - z * 0.0089 + 1.3) * 0.3 + Math.sin(x * 0.027 + z * 0.019 + 4.1) * 0.2 + Math.sin(x * 0.083 - z * 0.061 + 2.2) * Math.sin(x * 0.047 + z * 0.097) * 0.35;
  return 0.87 + 0.11 * wave;
}

export const TERRAIN_CHUNK_CELLS = 8;

// A block of cells drawn as one mesh, so the camera can skip the ones it does not face.
export interface TerrainChunk {
  indices: Uint32Array;
  centre: [x: number, y: number, z: number];
  radius: number;
}

export interface TerrainGrid {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  cols: number;
  rows: number;
  positions: Float32Array;
  uvs: Float32Array;
  shades: Float32Array;
  normals: Float32Array;
  chunks: TerrainChunk[];
  cells: number;
}

// The grid as steps: every 8 rows of the heights pass, every 32 rows of the later passes and each row of chunks, so a caller can spread the work over time.
export function* terrainGridSteps(course: BuiltCourse): Generator<void, TerrainGrid> {
  const { minX, minZ, cols, rows } = gridShape(course);
  const positions = new Float32Array((cols + 1) * (rows + 1) * 3);
  const uvs = new Float32Array((cols + 1) * (rows + 1) * 2);
  const shades = new Float32Array((cols + 1) * (rows + 1) * 3);
  const normals = new Float32Array((cols + 1) * (rows + 1) * 3);
  const heights = new Float32Array((cols + 1) * (rows + 1));
  const distances = new Float32Array((cols + 1) * (rows + 1));
  const corridor = corridorOf(course);
  for (let j = 0; j <= rows; j++) {
    if (j % 8 === 0) yield;
    for (let i = 0; i <= cols; i++) {
      const x = minX + i * TERRAIN_CELL;
      const z = minZ + j * TERRAIN_CELL;
      const { distance, y } = routeDistance(course, x, z);
      if (corridor) heights[j * (cols + 1) + i] = farVertex(course, i, j);
      else heights[j * (cols + 1) + i] = y - drop(distance);
      distances[j * (cols + 1) + i] = distance;
    }
  }
  for (let j = 0; j <= rows; j++) {
    if (j % 32 === 0) yield;
    for (let i = 0; i <= cols; i++) {
      const x = minX + i * TERRAIN_CELL;
      const z = minZ + j * TERRAIN_CELL;
      const at = j * (cols + 1) + i;
      // Linear cells over a curved road would poke through it: near the route each vertex takes its neighbours' lowest height.
      let y = heights[at]!;
      if (!corridor && distances[at]! < NEAR_ROUTE) {
        for (let dj = Math.max(0, j - 1); dj <= Math.min(rows, j + 1); dj++) {
          for (let di = Math.max(0, i - 1); di <= Math.min(cols, i + 1); di++) y = Math.min(y, heights[dj * (cols + 1) + di]!);
        }
      }
      positions.set([x, y, z], at * 3);
      shades.fill(terrainShade(x, z), at * 3, at * 3 + 3);
      uvs.set([x / TERRAIN_METRES_PER_REPEAT, z / TERRAIN_METRES_PER_REPEAT], at * 2);
    }
  }
  const heightAt = (i: number, j: number) => positions[(Math.min(rows, Math.max(0, j)) * (cols + 1) + Math.min(cols, Math.max(0, i))) * 3 + 1]!;
  for (let j = 0; j <= rows; j++) {
    if (j % 32 === 0) yield;
    for (let i = 0; i <= cols; i++) {
      const slopeX = (heightAt(i + 1, j) - heightAt(i - 1, j)) / (2 * TERRAIN_CELL);
      const slopeZ = (heightAt(i, j + 1) - heightAt(i, j - 1)) / (2 * TERRAIN_CELL);
      const length = Math.sqrt(slopeX * slopeX + 1 + slopeZ * slopeZ);
      normals.set([-slopeX / length, 1 / length, -slopeZ / length], (j * (cols + 1) + i) * 3);
    }
  }
  // Cells wholly beyond the margin lie past the fog and are left out.
  const chunks: TerrainChunk[] = [];
  let cells = 0;
  for (let cj = 0; cj < rows; cj += TERRAIN_CHUNK_CELLS) {
    yield;
    for (let ci = 0; ci < cols; ci += TERRAIN_CHUNK_CELLS) {
      const indices: number[] = [];
      let lowY = Infinity;
      let highY = -Infinity;
      for (let j = cj; j < Math.min(rows, cj + TERRAIN_CHUNK_CELLS); j++) {
        for (let i = ci; i < Math.min(cols, ci + TERRAIN_CHUNK_CELLS); i++) {
          const a = j * (cols + 1) + i;
          const b = a + 1;
          const c = a + cols + 1;
          const e = c + 1;
          if (Math.min(distances[a]!, distances[b]!, distances[c]!, distances[e]!) >= TERRAIN_MARGIN) continue;
          // Counter-clockwise seen from above, split along a-e.
          indices.push(a, c, e, a, e, b);
          cells++;
          for (const v of [a, b, c, e]) {
            lowY = Math.min(lowY, positions[v * 3 + 1]!);
            highY = Math.max(highY, positions[v * 3 + 1]!);
          }
        }
      }
      if (indices.length === 0) continue;
      const width = Math.min(TERRAIN_CHUNK_CELLS, cols - ci) * TERRAIN_CELL;
      const depth = Math.min(TERRAIN_CHUNK_CELLS, rows - cj) * TERRAIN_CELL;
      chunks.push({
        indices: Uint32Array.from(indices),
        centre: [minX + ci * TERRAIN_CELL + width / 2, (lowY + highY) / 2, minZ + cj * TERRAIN_CELL + depth / 2],
        radius: Math.hypot(width / 2, (highY - lowY) / 2, depth / 2),
      });
    }
  }
  return { minX, maxX: minX + cols * TERRAIN_CELL, minZ, maxZ: minZ + rows * TERRAIN_CELL, cols, rows, positions, uvs, shades, normals, chunks, cells };
}

export function buildTerrainGrid(course: BuiltCourse): TerrainGrid {
  const steps = terrainGridSteps(course);
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}

const grids = new WeakMap<BuiltCourse, TerrainGrid>();

// The grid of a course, built once per page load and shared; nothing writes to it.
export function terrainGridOf(course: BuiltCourse): TerrainGrid {
  let grid = grids.get(course);
  if (!grid) {
    grid = buildTerrainGrid(course);
    grids.set(course, grid);
  }
  return grid;
}

// Builds the grid in steps and stores it where terrainGridOf finds it.
export function* warmTerrainGrid(course: BuiltCourse): Generator<void, void> {
  if (grids.has(course)) return;
  const grid = yield* terrainGridSteps(course);
  if (!grids.has(course)) grids.set(course, grid);
}

export function createTerrainMesh(course: BuiltCourse, { lite = false, flat = false, tint }: SceneOptions = {}): THREE.Group {
  const grid = terrainGridOf(course);
  const attributes = {
    position: new THREE.BufferAttribute(grid.positions, 3),
    uv: new THREE.BufferAttribute(grid.uvs, 2),
    color: new THREE.BufferAttribute(grid.shades, 3),
    normal: new THREE.BufferAttribute(grid.normals, 3),
  };
  const map = flat ? null : groundTexture('red-earth', 'diffuse');
  const normalMap = lite ? null : groundTexture('red-earth', 'normal');
  const material = new THREE.MeshStandardMaterial({ color: tinted(map ? 0xffffff : RED_EARTH, tint), map, normalMap, roughness: 1, metalness: 0, vertexColors: true });
  if (map) map.anisotropy = lite ? 1 : 4;
  const group = new THREE.Group();
  for (const chunk of grid.chunks) {
    // The attributes are shared; only each chunk's index differs.
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(attributes)) geometry.setAttribute(name, attribute);
    geometry.setIndex(new THREE.BufferAttribute(chunk.indices, 1));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(...chunk.centre), chunk.radius);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = false;
    group.add(mesh);
  }
  return group;
}
