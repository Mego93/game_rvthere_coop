export interface RouteProjection {
  along: number;
  lateral: number;
  segment: number;
}

export interface RoutePoint {
  x: number;
  z: number;
  tx: number;
  tz: number;
}

export interface RouteIndex {
  length: number;
  project(x: number, z: number, hint?: number): RouteProjection;
  pointAt(along: number): RoutePoint;
}

const WINDOW = 4;
const BLOCK = 16;

export function createRouteIndex(route: readonly (readonly [number, number])[]): RouteIndex {
  // Zero-length segments are dropped so every kept segment has a direction.
  const ax: number[] = [];
  const az: number[] = [];
  const tx: number[] = [];
  const tz: number[] = [];
  const len: number[] = [];
  const start: number[] = [];
  let total = 0;
  for (let i = 0; i + 1 < route.length; i++) {
    const [x0, z0] = route[i]!;
    const [x1, z1] = route[i + 1]!;
    const l = Math.hypot(x1 - x0, z1 - z0);
    if (l === 0) continue;
    ax.push(x0);
    az.push(z0);
    tx.push((x1 - x0) / l);
    tz.push((z1 - z0) / l);
    len.push(l);
    start.push(total);
    total += l;
  }
  const count = len.length;
  if (count === 0) throw new Error('A route needs at least one segment of nonzero length');

  const blocks = Math.ceil(count / BLOCK);
  const box = new Float64Array(blocks * 4);
  for (let b = 0; b < blocks; b++) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = b * BLOCK; i < Math.min(count, (b + 1) * BLOCK); i++) {
      const ex = ax[i]! + tx[i]! * len[i]!;
      const ez = az[i]! + tz[i]! * len[i]!;
      minX = Math.min(minX, ax[i]!, ex);
      maxX = Math.max(maxX, ax[i]!, ex);
      minZ = Math.min(minZ, az[i]!, ez);
      maxZ = Math.max(maxZ, az[i]!, ez);
    }
    box.set([minX, maxX, minZ, maxZ], b * 4);
  }

  let bestD = 0;
  let bestI = 0;
  const consider = (i: number, x: number, z: number): void => {
    const t = Math.min(len[i]!, Math.max(0, (x - ax[i]!) * tx[i]! + (z - az[i]!) * tz[i]!));
    const d = Math.hypot(x - (ax[i]! + tx[i]! * t), z - (az[i]! + tz[i]! * t));
    if (d < bestD || (d === bestD && i < bestI)) {
      bestD = d;
      bestI = i;
    }
  };

  const project = (x: number, z: number, hint?: number): RouteProjection => {
    bestD = Infinity;
    bestI = count;
    const h = hint === undefined ? -1 : Math.min(count - 1, Math.max(0, Math.floor(hint)));
    if (h >= 0) for (let i = Math.max(0, h - WINDOW); i <= Math.min(count - 1, h + WINDOW); i++) consider(i, x, z);
    // Exact full search; blocks whose box is farther than the best so far cannot hold a nearer or equal segment.
    for (let b = 0; b < blocks; b++) {
      const dx = Math.max(box[b * 4]! - x, 0, x - box[b * 4 + 1]!);
      const dz = Math.max(box[b * 4 + 2]! - z, 0, z - box[b * 4 + 3]!);
      if (Math.hypot(dx, dz) > bestD) continue;
      for (let i = b * BLOCK; i < Math.min(count, (b + 1) * BLOCK); i++) consider(i, x, z);
    }
    const i = bestI;
    const t = Math.min(len[i]!, Math.max(0, (x - ax[i]!) * tx[i]! + (z - az[i]!) * tz[i]!));
    return {
      along: start[i]! + t,
      lateral: (x - (ax[i]! + tx[i]! * t)) * -tz[i]! + (z - (az[i]! + tz[i]! * t)) * tx[i]!,
      segment: i,
    };
  };

  const pointAt = (along: number): RoutePoint => {
    const a = Math.min(total, Math.max(0, along));
    let lo = 0;
    let hi = count - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (start[mid]! <= a) lo = mid;
      else hi = mid - 1;
    }
    const t = a - start[lo]!;
    return { x: ax[lo]! + tx[lo]! * t, z: az[lo]! + tz[lo]! * t, tx: tx[lo]!, tz: tz[lo]! };
  };

  return { length: total, project, pointAt };
}
