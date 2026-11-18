import type { BuiltCourse } from './course';
import type { Box } from './course';
import { vec3, type Quat, type Vec3 } from './math';

const EPS = 1e-9;
const FROM_Y = 10000;
const GROUND_CELL = 64;
const BIG_REACH = 1000;

interface GroundIndex {
  grid: Map<string, Box[]>;
  // Boxes too large to register in every cell they cover; they are tested for every point.
  big: Box[];
}
// The operation order matters: the client's decor placements are pinned to the bits this produces (it matches three.js's applyQuaternion).
function rotate(q: Quat, v: Vec3): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return { x: v.x + q.w * tx + q.y * tz - q.z * ty, y: v.y + q.w * ty + q.z * tx - q.x * tz, z: v.z + q.w * tz + q.x * ty - q.y * tx };
}

const groundGrids = new WeakMap<readonly Box[], GroundIndex>();

// The ground boxes whose bounding square can reach the point's grid cell.
function groundNear(course: BuiltCourse, x: number, z: number): readonly Box[] {
  let index = groundGrids.get(course.ground);
  if (!index) {
    index = { grid: new Map(), big: [] };
    for (const box of course.ground) {
      const h = box.halfExtents;
      const reach = Math.hypot(h.x, h.y, h.z);
      if (reach > BIG_REACH) {
        index.big.push(box);
        continue;
      }
      for (let i = Math.floor((box.center.x - reach) / GROUND_CELL); i <= Math.floor((box.center.x + reach) / GROUND_CELL); i++) {
        for (let j = Math.floor((box.center.z - reach) / GROUND_CELL); j <= Math.floor((box.center.z + reach) / GROUND_CELL); j++) {
          const key = `${i},${j}`;
          const list = index.grid.get(key);
          if (list) list.push(box);
          else index.grid.set(key, [box]);
        }
      }
    }
    groundGrids.set(course.ground, index);
  }
  const near = index.grid.get(`${Math.floor(x / GROUND_CELL)},${Math.floor(z / GROUND_CELL)}`);
  if (index.big.length === 0) return near ?? [];
  return near ? [...near, ...index.big] : index.big;
}

// Height of the top of the highest ground box under (x, z), or null off the ground.
export function surfaceYAt(course: BuiltCourse, x: number, z: number): number | null {
  let best: number | null = null;
  for (const box of groundNear(course, x, z)) {
    const h = box.halfExtents;
    const reach = Math.hypot(h.x, h.y, h.z);
    if (Math.abs(x - box.center.x) > reach || Math.abs(z - box.center.z) > reach) continue;
    const inverse = { x: -box.rot.x, y: -box.rot.y, z: -box.rot.z, w: box.rot.w };
    const o = rotate(inverse, vec3(x - box.center.x, FROM_Y - box.center.y, z - box.center.z));
    const d = rotate(inverse, vec3(0, -1, 0));
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
export function routeHeights(course: BuiltCourse): number[] {
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
