import type { Surface } from './constants';
import type { GroundBox } from './course';
import { rotate, vec3 } from './math';

const EPS = 1e-9;
const FROM_Y = 10000;

// Test helper: the height where a ray straight down at (x, z) first hits a ground box; where boxes overlap, the highest.
export function groundHeightAt(ground: readonly GroundBox[], x: number, z: number): number | null {
  return topHit(ground, x, z)?.y ?? null;
}

// Test helper: the surface of the ground box that groundHeightAt reports.
export function groundSurfaceAt(ground: readonly GroundBox[], x: number, z: number): Surface | null {
  return topHit(ground, x, z)?.surface ?? null;
}

function topHit(ground: readonly GroundBox[], x: number, z: number): { y: number; surface: Surface } | null {
  let best: { y: number; surface: Surface } | null = null;
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
      if (best === null || y > best.y) best = { y, surface: box.surface };
    }
  }
  return best;
}
