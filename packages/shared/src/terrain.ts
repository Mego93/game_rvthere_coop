import { GROUND_PATCH_MAX_CELL, GROUND_PATCH_MAX_SLOPE_DEG, type Surface } from './constants';
import type { BuiltCourse, GroundPatch } from './course';
import { deepFreeze } from './math';

const MAX_SLOPE_TAN = Math.tan((GROUND_PATCH_MAX_SLOPE_DEG * Math.PI) / 180);
const EPS = 1e-9;

// Heights are row-major vertices: (rows + 1) x (cols + 1) values, index `zi * (cols + 1) + xi`.
export function makePatch(
  id: string,
  x0: number,
  z0: number,
  cell: number,
  cols: number,
  rows: number,
  heightFn: (x: number, z: number) => number,
  surface: Surface,
): GroundPatch {
  const heights: number[] = [];
  for (let zi = 0; zi <= rows; zi++) for (let xi = 0; xi <= cols; xi++) heights.push(heightFn(x0 + xi * cell, z0 + zi * cell));
  const patch: GroundPatch = { id, x0, z0, cell, cols, rows, heights, surface };
  validatePatch(patch);
  return patch;
}

function validatePatch(patch: GroundPatch): void {
  const { id, cell, cols, rows, heights } = patch;
  if (!(cell > 0 && cell <= GROUND_PATCH_MAX_CELL)) throw new Error(`Patch ${id}: cell ${cell} m is outside (0, ${GROUND_PATCH_MAX_CELL}]`);
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) throw new Error(`Patch ${id}: cols and rows must be positive integers`);
  if (heights.length !== (cols + 1) * (rows + 1) || heights.some((h) => !Number.isFinite(h))) throw new Error(`Patch ${id}: heights must be ${(cols + 1) * (rows + 1)} finite values`);
  const at = (xi: number, zi: number) => heights[zi * (cols + 1) + xi]!;
  // Each cell is two triangles split along the (x1, z0)-(x0, z1) diagonal, as Rapier does; the slope is the gradient of each.
  for (let zi = 0; zi < rows; zi++) {
    for (let xi = 0; xi < cols; xi++) {
      const h00 = at(xi, zi);
      const h10 = at(xi + 1, zi);
      const h01 = at(xi, zi + 1);
      const h11 = at(xi + 1, zi + 1);
      const low = Math.hypot(h10 - h00, h01 - h00) / cell;
      const high = Math.hypot(h11 - h01, h11 - h10) / cell;
      if (Math.max(low, high) > MAX_SLOPE_TAN + EPS) throw new Error(`Patch ${id}: slope over ${GROUND_PATCH_MAX_SLOPE_DEG} degrees at cell (${xi}, ${zi})`);
    }
  }
}

// Throws if a patch is malformed or too steep to walk, or two patches overlap (touching edges are fine).
export function validateTerrain(patches: readonly GroundPatch[]): void {
  for (const patch of patches) validatePatch(patch);
  for (let i = 0; i < patches.length; i++) {
    const a = patches[i]!;
    for (let j = i + 1; j < patches.length; j++) {
      const b = patches[j]!;
      const apart =
        a.x0 + a.cols * a.cell <= b.x0 + EPS || b.x0 + b.cols * b.cell <= a.x0 + EPS || a.z0 + a.rows * a.cell <= b.z0 + EPS || b.z0 + b.rows * b.cell <= a.z0 + EPS;
      if (!apart) throw new Error(`Patches ${a.id} and ${b.id} overlap`);
    }
  }
}

// A new, frozen course with the patches added to any it has; validates them all.
export function withTerrain(course: BuiltCourse, patches: readonly GroundPatch[]): BuiltCourse {
  const terrain = [...(course.terrain ?? []), ...patches];
  validateTerrain(terrain);
  return deepFreeze({ ...course, terrain });
}

// The height at (x, z) on the triangulation Rapier uses, or null outside every patch.
export function terrainHeightAt(course: BuiltCourse, x: number, z: number): number | null {
  for (const patch of course.terrain ?? []) {
    const { cell, cols, rows } = patch;
    const fx = (x - patch.x0) / cell;
    const fz = (z - patch.z0) / cell;
    if (fx < 0 || fz < 0 || fx > cols || fz > rows) continue;
    const cx = Math.min(cols - 1, Math.floor(fx));
    const cz = Math.min(rows - 1, Math.floor(fz));
    const u = fx - cx;
    const v = fz - cz;
    const stride = cols + 1;
    const at = (i: number, j: number) => patch.heights[j * stride + i]!;
    const h00 = at(cx, cz);
    const h10 = at(cx + 1, cz);
    const h01 = at(cx, cz + 1);
    if (u + v <= 1) return h00 + u * (h10 - h00) + v * (h01 - h00);
    const h11 = at(cx + 1, cz + 1);
    return h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
  }
  return null;
}
