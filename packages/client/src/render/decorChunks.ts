import type { DecorPlacement } from './decorScatter';

export const CELL_LENGTH = 100;

export interface DecorLimits {
  radius: number;
  cap: number;
}

export const DESKTOP_DECOR: DecorLimits = { radius: 350, cap: 3000 };
export const TOUCH_DECOR: DecorLimits = { radius: 200, cap: 1200 };
// Software GL rasterises on the CPU: with more than about 100 instances a frame is slow enough to break the e2e timing.
export const SOFTWARE_DECOR: DecorLimits = { radius: 120, cap: 100 };

export interface DecorCell {
  id: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  placements: DecorPlacement[];
}

// Distance along the route of the point nearest to (x, z).
function alongRoute(route: readonly (readonly [number, number])[], x: number, z: number): number {
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

// Groups placements into cells of 100 m of route, ordered by their place along it.
export function buildCells(placements: readonly DecorPlacement[], route: readonly (readonly [number, number])[]): DecorCell[] {
  const cells = new Map<number, DecorCell>();
  for (const p of placements) {
    const id = Math.floor(alongRoute(route, p.x, p.z) / CELL_LENGTH);
    let cell = cells.get(id);
    if (!cell) {
      cell = { id, minX: p.x, maxX: p.x, minZ: p.z, maxZ: p.z, placements: [] };
      cells.set(id, cell);
    }
    cell.minX = Math.min(cell.minX, p.x);
    cell.maxX = Math.max(cell.maxX, p.x);
    cell.minZ = Math.min(cell.minZ, p.z);
    cell.maxZ = Math.max(cell.maxZ, p.z);
    cell.placements.push(p);
  }
  return [...cells.values()].sort((a, b) => a.id - b.id);
}

function distanceTo(cell: DecorCell, x: number, z: number): number {
  const dx = Math.max(cell.minX - x, 0, x - cell.maxX);
  const dz = Math.max(cell.minZ - z, 0, z - cell.maxZ);
  return Math.hypot(dx, dz);
}

// The cells within `radius` of the camera, nearest first kept while their placements fit under `cap`; the rest are dropped. Ordered by id.
export function visibleCells(cells: readonly DecorCell[], camera: { x: number; z: number }, radius: number, cap = Infinity): DecorCell[] {
  const near: { cell: DecorCell; distance: number }[] = [];
  for (const cell of cells) {
    const distance = distanceTo(cell, camera.x, camera.z);
    if (distance <= radius) near.push({ cell, distance });
  }
  near.sort((a, b) => a.distance - b.distance || a.cell.id - b.cell.id);
  const kept: DecorCell[] = [];
  let total = 0;
  for (const { cell } of near) {
    if (total + cell.placements.length > cap) break;
    total += cell.placements.length;
    kept.push(cell);
  }
  return kept.sort((a, b) => a.id - b.id);
}
