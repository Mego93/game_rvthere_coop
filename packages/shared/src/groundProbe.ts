import type { GroundBox } from './course';
import { rotate, vec3 } from './math';

const EPS = 1e-9;
const FROM_Y = 10000;

// Test helper: the height where a ray straight down at (x, z) first hits a ground box; where boxes overlap, the highest.
export function groundHeightAt(ground: readonly GroundBox[], x: number, z: number): number | null {
  let best: number | null = null;
  for (const box of ground) {
    const inverse = { x: -box.rot.x, y: -box.rot.y, z: -box.rot.z, w: box.rot.w };
    const o = rotate(inverse, vec3(x - box.center.x, FROM_Y - box.center.y, z - box.center.z));
    const d = rotate(inverse, vec3(0, -1, 0));
    let tmin = 0;
    let tmax = Infinity;
    for (const axis of ['x', 'y', 'z'] as const) {
      const h = box.halfExtents[axis] + (axis === 'y' ? 0 : EPS);
      if (Math.abs(d[axis]) < 1e-12) {
        if (Math.abs(o[axis]) > h) {
          tmax = -1;
          break;
        }
      } else {
        const t1 = (-h - o[axis]) / d[axis];
        const t2 = (h - o[axis]) / d[axis];
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
      }
    }
    if (tmax >= tmin) {
      const y = FROM_Y - tmin;
      if (best === null || y > best) best = y;
    }
  }
  return best;
}
