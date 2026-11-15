import type { BuiltCourse } from '@lodgy/shared';
import * as THREE from 'three';
import { groundTexture, type SceneOptions } from './groundTextures';

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

const EPS = 1e-9;
const FROM_Y = 10000;

// Height of the top of the highest ground box under (x, z), or null off the ground.
export function surfaceYAt(course: BuiltCourse, x: number, z: number): number | null {
  const q = new THREE.Quaternion();
  const o = new THREE.Vector3();
  const d = new THREE.Vector3();
  let best: number | null = null;
  for (const box of course.ground) {
    const h = box.halfExtents;
    const reach = Math.hypot(h.x, h.y, h.z);
    if (Math.abs(x - box.center.x) > reach || Math.abs(z - box.center.z) > reach) continue;
    q.set(-box.rot.x, -box.rot.y, -box.rot.z, box.rot.w);
    o.set(x - box.center.x, FROM_Y - box.center.y, z - box.center.z).applyQuaternion(q);
    d.set(0, -1, 0).applyQuaternion(q);
    let tmin = 0;
    let tmax = Infinity;
    for (const axis of ['x', 'y', 'z'] as const) {
      const half = h[axis] + (axis === 'y' ? 0 : EPS);
      const da = d[axis];
      const oa = o[axis];
      if (Math.abs(da) < 1e-12) {
        if (Math.abs(oa) > half) {
          tmax = -1;
          break;
        }
      } else {
        const t1 = (-half - oa) / da;
        const t2 = (half - oa) / da;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
      }
    }
    if (tmax >= tmin && (best === null || FROM_Y - tmin > best)) best = FROM_Y - tmin;
  }
  return best;
}

const heightCache = new WeakMap<BuiltCourse, number[]>();

// The ground-top height at each route point, computed once; a point off the ground takes its neighbour's.
function routeHeights(course: BuiltCourse): number[] {
  let heights = heightCache.get(course);
  if (heights) return heights;
  const raw = course.route.map(([x, z]) => surfaceYAt(course, x, z));
  heights = raw.map((height, i) => {
    if (height !== null) return height;
    for (let step = 1; step < raw.length; step++) {
      const near = raw[i - step] ?? raw[i + step];
      if (near !== undefined && near !== null) return near;
    }
    return 0;
  });
  heightCache.set(course, heights);
  return heights;
}

// Distance to the route's centre line and the route's ground height at the nearest point.
export function routeDistance(course: BuiltCourse, x: number, z: number): { distance: number; y: number } {
  const heights = routeHeights(course);
  const route = course.route;
  let best = Infinity;
  let y = heights[0] ?? 0;
  if (route.length === 1) return { distance: Math.hypot(x - route[0]![0], z - route[0]![1]), y };
  for (let i = 0; i < route.length - 1; i++) {
    const x0 = route[i]![0];
    const z0 = route[i]![1];
    const dx = route[i + 1]![0] - x0;
    const dz = route[i + 1]![1] - z0;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / lengthSquared));
    const ex = x - (x0 + dx * t);
    const ez = z - (z0 + dz * t);
    const squared = ex * ex + ez * ez;
    if (squared < best) {
      best = squared;
      y = heights[i]! + (heights[i + 1]! - heights[i]!) * t;
    }
  }
  return { distance: Math.sqrt(best), y };
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

// How far below the route's surface the far terrain lies at `distance` metres from the centre line.
function drop(distance: number): number {
  if (distance <= FLAT_UNTIL) return FLAT_DROP;
  if (distance < ESCARPMENT_END) return FLAT_DROP + (FAR_DROP - FLAT_DROP) * smoothstep((distance - FLAT_UNTIL) / (ESCARPMENT_END - FLAT_UNTIL));
  return FAR_DROP + FALL_PER_METRE * (distance - ESCARPMENT_END);
}

// Visual only: the terrain hides under the collision shoulders, then falls away as an escarpment.
export function terrainHeight(course: BuiltCourse, x: number, z: number): number {
  const { distance, y } = routeDistance(course, x, z);
  return y - drop(distance);
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

export function buildTerrainGrid(course: BuiltCourse): TerrainGrid {
  const xs = course.route.map((p) => p[0]);
  const zs = course.route.map((p) => p[1]);
  const minX = Math.min(...xs) - TERRAIN_MARGIN;
  const minZ = Math.min(...zs) - TERRAIN_MARGIN;
  const cols = Math.ceil((Math.max(...xs) + TERRAIN_MARGIN - minX) / TERRAIN_CELL);
  const rows = Math.ceil((Math.max(...zs) + TERRAIN_MARGIN - minZ) / TERRAIN_CELL);
  const positions = new Float32Array((cols + 1) * (rows + 1) * 3);
  const uvs = new Float32Array((cols + 1) * (rows + 1) * 2);
  const shades = new Float32Array((cols + 1) * (rows + 1) * 3);
  const normals = new Float32Array((cols + 1) * (rows + 1) * 3);
  const heights = new Float32Array((cols + 1) * (rows + 1));
  const distances = new Float32Array((cols + 1) * (rows + 1));
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const { distance, y } = routeDistance(course, minX + i * TERRAIN_CELL, minZ + j * TERRAIN_CELL);
      heights[j * (cols + 1) + i] = y - drop(distance);
      distances[j * (cols + 1) + i] = distance;
    }
  }
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const x = minX + i * TERRAIN_CELL;
      const z = minZ + j * TERRAIN_CELL;
      const at = j * (cols + 1) + i;
      // Linear cells over a curved road would poke through it: near the route each vertex takes its neighbours' lowest height.
      let y = heights[at]!;
      if (distances[at]! < NEAR_ROUTE) {
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

export function createTerrainMesh(course: BuiltCourse, { lite = false, flat = false }: SceneOptions = {}): THREE.Group {
  const grid = buildTerrainGrid(course);
  const attributes = {
    position: new THREE.BufferAttribute(grid.positions, 3),
    uv: new THREE.BufferAttribute(grid.uvs, 2),
    color: new THREE.BufferAttribute(grid.shades, 3),
    normal: new THREE.BufferAttribute(grid.normals, 3),
  };
  const map = flat ? null : groundTexture('red-earth', 'diffuse');
  const normalMap = lite ? null : groundTexture('red-earth', 'normal');
  const material = new THREE.MeshStandardMaterial({ color: map ? 0xffffff : RED_EARTH, map, normalMap, roughness: 1, metalness: 0, vertexColors: true });
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
