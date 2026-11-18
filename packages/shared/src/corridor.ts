import { hashSeed } from './ambient';
import {
  CORRIDOR_BERM_CREST_END,
  CORRIDOR_BERM_CREST_START,
  CORRIDOR_BERM_FADE,
  CORRIDOR_BERM_HEIGHT,
  CORRIDOR_BERM_MARGIN,
  CORRIDOR_BERM_START,
  CORRIDOR_BLEND_END,
  CORRIDOR_BLEND_START,
  CORRIDOR_CELL,
  CORRIDOR_LAND_END,
  CORRIDOR_NOISE,
  CORRIDOR_NOISE_SCALE,
  CORRIDOR_UNDER_UNTIL,
  CORRIDOR_RELIEF,
  CORRIDOR_RELIEF_FULL,
  CORRIDOR_RIDGE_END,
  CORRIDOR_RIDGE_HEIGHT,
  CORRIDOR_RIDGE_START,
  CORRIDOR_SMOOTH,
  CORRIDOR_TILE_CELLS,
  CORRIDOR_UNDER,
} from './constants';
import type { BuiltCourse } from './course';
import { routeHeights } from './surfaceHeight';

// Heights are stored in Rapier's heightfield layout: (rows + 1) x (cols + 1) values, column-major, index `zi + xi * (rows + 1)`; rows run along Z, columns along X.
export interface CorridorTile {
  x0: number;
  z0: number;
  cols: number;
  rows: number;
  cell: number;
  heights: Float32Array;
}

export interface Corridor {
  tiles: CorridorTile[];
  minY: number;
  // Tiles by grid position; read through corridorHeightAt.
  index: Map<number, CorridorTile>;
}

const TILE_SIZE = CORRIDOR_TILE_CELLS * CORRIDOR_CELL;
const tileKey = (ix: number, iz: number): number => (ix + 32768) * 65536 + (iz + 32768);
const smoothstep = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

export interface RouteHit {
  // The nearest segment, the fraction along it, the horizontal distance to the route and the nearest point.
  i: number;
  t: number;
  d: number;
  px: number;
  pz: number;
  along: number;
}

export interface RouteFrame {
  total: number;
  // Along-route distance of each route point.
  cum: Float64Array;
  // The ground-top height and its mean over CORRIDOR_SMOOTH m each way, per route point.
  r: Float64Array;
  s: Float64Array;
  // Nearest route point to (x, z) over the whole route.
  nearest(x: number, z: number): RouteHit;
  // The same over the listed segments only; `hint` is a segment likely to be near, tried first.
  nearestIn(x: number, z: number, segments: ArrayLike<number>, hint?: number): RouteHit;
  // Route height and smoothed height at a hit.
  heightAt(hit: Pick<RouteHit, 'i' | 't'>): number;
  smoothedAt(hit: Pick<RouteHit, 'i' | 't'>): number;
  // Route height at an along distance, and the lowest route height within `half` m of it.
  heightAtAlong(along: number): number;
  lowestAround(along: number, half: number): number;
  // The route point and unit direction at an along distance.
  pointAt(along: number): { x: number; z: number; tx: number; tz: number };
  // Segment bounding boxes, for a spatial index.
  segment: { minX: Float64Array; maxX: Float64Array; minZ: Float64Array; maxZ: Float64Array; count: number };
}

const frames = new WeakMap<BuiltCourse, RouteFrame>();

export function routeFrame(course: BuiltCourse): RouteFrame {
  let frame = frames.get(course);
  if (!frame) {
    frame = buildFrame(course);
    frames.set(course, frame);
  }
  return frame;
}

function buildFrame(course: BuiltCourse): RouteFrame {
  const route = course.route;
  const n = route.length;
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1]! + Math.hypot(route[i]![0] - route[i - 1]![0], route[i]![1] - route[i - 1]![1]);
  const total = cum[n - 1]!;
  const r = Float64Array.from(routeHeights(course));
  const segments = Math.max(0, n - 1);
  const ax = new Float64Array(segments);
  const az = new Float64Array(segments);
  const dx = new Float64Array(segments);
  const dz = new Float64Array(segments);
  const len2 = new Float64Array(segments);
  const minX = new Float64Array(segments);
  const maxX = new Float64Array(segments);
  const minZ = new Float64Array(segments);
  const maxZ = new Float64Array(segments);
  for (let i = 0; i < segments; i++) {
    ax[i] = route[i]![0];
    az[i] = route[i]![1];
    dx[i] = route[i + 1]![0] - ax[i]!;
    dz[i] = route[i + 1]![1] - az[i]!;
    len2[i] = dx[i]! * dx[i]! + dz[i]! * dz[i]!;
    minX[i] = Math.min(route[i]![0], route[i + 1]![0]);
    maxX[i] = Math.max(route[i]![0], route[i + 1]![0]);
    minZ[i] = Math.min(route[i]![1], route[i + 1]![1]);
    maxZ[i] = Math.max(route[i]![1], route[i + 1]![1]);
  }

  // The index of the segment holding `along`, for 0 <= along <= total.
  const segmentAt = (along: number): number => {
    let lo = 0;
    let hi = Math.max(0, segments - 1);
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cum[mid]! <= along) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const lerpAt = (values: Float64Array, along: number): number => {
    if (segments === 0) return values[0] ?? 0;
    const a = Math.min(total, Math.max(0, along));
    const i = segmentAt(a);
    const length = cum[i + 1]! - cum[i]!;
    const t = length === 0 ? 0 : (a - cum[i]!) / length;
    return values[i]! + (values[i + 1]! - values[i]!) * t;
  };

  // Integral of the route height from 0, at each route point; the window means come from it.
  const integral = new Float64Array(n);
  for (let i = 1; i < n; i++) integral[i] = integral[i - 1]! + ((r[i]! + r[i - 1]!) / 2) * (cum[i]! - cum[i - 1]!);
  const integralAt = (along: number): number => {
    if (segments === 0) return 0;
    const a = Math.min(total, Math.max(0, along));
    const i = segmentAt(a);
    const h = a - cum[i]!;
    const length = cum[i + 1]! - cum[i]!;
    const slope = length === 0 ? 0 : (r[i + 1]! - r[i]!) / length;
    return integral[i]! + r[i]! * h + (slope * h * h) / 2;
  };
  const s = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, cum[i]! - CORRIDOR_SMOOTH);
    const hi = Math.min(total, cum[i]! + CORRIDOR_SMOOTH);
    s[i] = hi > lo ? (integralAt(hi) - integralAt(lo)) / (hi - lo) : r[i]!;
  }

  const nearestIn = (x: number, z: number, list: ArrayLike<number>, hint?: number): RouteHit => {
    let best = Infinity;
    let bi = 0;
    let bt = 0;
    const consider = (i: number) => {
      const l2 = len2[i]!;
      const ox = x - ax[i]!;
      const oz = z - az[i]!;
      let t = l2 === 0 ? 0 : (ox * dx[i]! + oz * dz[i]!) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ox - dx[i]! * t;
      const ez = oz - dz[i]! * t;
      const sq = ex * ex + ez * ez;
      if (sq < best) {
        best = sq;
        bi = i;
        bt = t;
      }
    };
    if (hint !== undefined && hint < segments) consider(hint);
    for (let k = 0; k < list.length; k++) {
      const i = list[k]!;
      // A segment whose bounding box is already farther than the best cannot beat it.
      const bx = Math.max(minX[i]! - x, x - maxX[i]!, 0);
      const bz = Math.max(minZ[i]! - z, z - maxZ[i]!, 0);
      if (bx * bx + bz * bz > best) continue;
      consider(i);
    }
    if (segments === 0) return { i: 0, t: 0, d: Math.hypot(x - route[0]![0], z - route[0]![1]), px: route[0]![0], pz: route[0]![1], along: 0 };
    const px = ax[bi]! + dx[bi]! * bt;
    const pz = az[bi]! + dz[bi]! * bt;
    return { i: bi, t: bt, d: Math.sqrt(best), px, pz, along: cum[bi]! + (cum[bi + 1]! - cum[bi]!) * bt };
  };
  const all = Uint32Array.from({ length: segments }, (_, i) => i);

  return {
    total,
    cum,
    r,
    s,
    nearest: (x, z) => nearestIn(x, z, all),
    nearestIn,
    heightAt: (hit) => (segments === 0 ? r[0]! : r[hit.i]! + (r[hit.i + 1]! - r[hit.i]!) * hit.t),
    smoothedAt: (hit) => (segments === 0 ? s[0]! : s[hit.i]! + (s[hit.i + 1]! - s[hit.i]!) * hit.t),
    heightAtAlong: (along) => lerpAt(r, along),
    lowestAround(along, half) {
      const lo = Math.max(0, along - half);
      const hi = Math.min(total, along + half);
      let low = Math.min(lerpAt(r, lo), lerpAt(r, hi));
      for (let i = segmentAt(lo) + 1; i < n && cum[i]! < hi; i++) low = Math.min(low, r[i]!);
      return low;
    },
    pointAt(along) {
      if (segments === 0) return { x: route[0]![0], z: route[0]![1], tx: 0, tz: -1 };
      const a = Math.min(total, Math.max(0, along));
      const i = segmentAt(a);
      const length = Math.sqrt(len2[i]!);
      const t = length === 0 ? 0 : (a - cum[i]!) / length;
      return { x: ax[i]! + dx[i]! * t, z: az[i]! + dz[i]! * t, tx: length === 0 ? 0 : dx[i]! / length, tz: length === 0 ? -1 : dz[i]! / length };
    },
    segment: { minX, maxX, minZ, maxZ, count: segments },
  };
}

// Deterministic value in [-1, 1] at a lattice point.
function lattice(seed: number, ix: number, iz: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

function valueNoise(seed: number, x: number, z: number, spacing: number): number {
  const fx = x / spacing;
  const fz = z / spacing;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const u = smoothstep(fx - ix);
  const v = smoothstep(fz - iz);
  const a = lattice(seed, ix, iz);
  const b = lattice(seed, ix + 1, iz);
  const c = lattice(seed, ix, iz + 1);
  const e = lattice(seed, ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
}

let seeds: { id: string; octaves: number[] } = { id: '', octaves: [] };

// The relief at full amplitude, in m, within +-CORRIDOR_RELIEF (the noise scale keeps it under about half of that); before the ramp from the shoulder edge.
export function corridorReliefAt(courseId: string, x: number, z: number): number {
  if (seeds.id !== courseId) {
    const seed = hashSeed(courseId);
    seeds = { id: courseId, octaves: CORRIDOR_NOISE.map((_, k) => (seed + Math.imul(k + 1, 0x9e3779b9)) | 0) };
  }
  let sum = 0;
  for (let k = 0; k < CORRIDOR_NOISE.length; k++) sum += CORRIDOR_NOISE[k]!.weight * valueNoise(seeds.octaves[k]!, x, z, CORRIDOR_NOISE[k]!.spacing);
  return CORRIDOR_RELIEF * CORRIDOR_NOISE_SCALE * sum;
}

// How far into the berm span (0 to 1) an along distance is: 1 within the margin of a span, fading out over the next CORRIDOR_BERM_FADE m.
export function bermWeight(obstacles: readonly { from: number; to: number }[], along: number): number {
  let lo = 0;
  let hi = obstacles.length;
  // The first span ending at or after the point's reach on the left.
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (obstacles[mid]!.to < along - CORRIDOR_BERM_MARGIN - CORRIDOR_BERM_FADE) lo = mid + 1;
    else hi = mid;
  }
  let best = 0;
  for (let k = lo; k < obstacles.length; k++) {
    const span = obstacles[k]!;
    if (span.from > along + CORRIDOR_BERM_MARGIN + CORRIDOR_BERM_FADE) break;
    const outside = Math.max(span.from - along, along - span.to, 0);
    const w = outside <= CORRIDOR_BERM_MARGIN ? 1 : 1 - smoothstep((outside - CORRIDOR_BERM_MARGIN) / CORRIDOR_BERM_FADE);
    best = Math.max(best, w);
  }
  return best;
}

// The berm's profile across the land: rises from CORRIDOR_BERM_START, stands from the crest start to the crest end, fades by the end of the blend.
function bermProfile(d: number): number {
  if (d <= CORRIDOR_BERM_START || d >= CORRIDOR_BLEND_END) return 0;
  if (d < CORRIDOR_BERM_CREST_START) return smoothstep((d - CORRIDOR_BERM_START) / (CORRIDOR_BERM_CREST_START - CORRIDOR_BERM_START));
  if (d <= CORRIDOR_BERM_CREST_END) return 1;
  return 1 - smoothstep((d - CORRIDOR_BERM_CREST_END) / (CORRIDOR_BLEND_END - CORRIDOR_BERM_CREST_END));
}

export interface HeightInputs {
  // Horizontal distance to the route.
  d: number;
  // corridorReliefAt at the point.
  relief: number;
  // Smoothed route height at the nearest route point.
  smooth: number;
  // Lowest route height within a cell diagonal and a metre of the nearest route point.
  low: number;
  // Berm weight at the nearest route point, 0 to 1.
  berm: number;
}

// Rule 1 with T3, T4, T8, T9 and T10.
export function corridorHeight(input: HeightInputs): number {
  const { d, relief, smooth, low, berm } = input;
  const under = low - CORRIDOR_UNDER;
  let h: number;
  if (d < CORRIDOR_UNDER_UNTIL) h = under;
  else {
    const ramp = smoothstep((d - CORRIDOR_BLEND_START) / (CORRIDOR_RELIEF_FULL - CORRIDOR_BLEND_START));
    if (d < CORRIDOR_BLEND_END) {
      const k = smoothstep((d - CORRIDOR_UNDER_UNTIL) / (CORRIDOR_BLEND_END - CORRIDOR_UNDER_UNTIL));
      h = under + (smooth + relief * ramp - under) * k;
    } else if (d < CORRIDOR_RIDGE_START) h = smooth + relief * ramp;
    else h = smooth + relief + CORRIDOR_RIDGE_HEIGHT * smoothstep((d - CORRIDOR_RIDGE_START) / (CORRIDOR_RIDGE_END - CORRIDOR_RIDGE_START));
  }
  if (berm > 0 && d > CORRIDOR_BERM_START && d < CORRIDOR_BLEND_END) h = Math.max(h, under + CORRIDOR_BERM_HEIGHT * berm * bermProfile(d));
  return h;
}

const BLOCK = 8;
const LOW_HALF = CORRIDOR_CELL * Math.SQRT2 + 1;
const TILE_REACH = CORRIDOR_LAND_END + 8 + Math.SQRT2 * TILE_SIZE;

// The corridor build as steps (one per column of blocks within a tile), so a caller can spread it over time; the result is the same as buildCorridor's.
export function* corridorSteps(course: BuiltCourse): Generator<void, Corridor> {
  const frame = routeFrame(course);
  const obstacles = course.corridor?.obstacles ?? [];
  const { minX, maxX, minZ, maxZ, count } = frame.segment;
  // Which tiles each route segment can matter to: the tiles within the land end for building, within TILE_REACH for the nearest search.
  const near = new Map<number, number[]>();
  const wide = new Map<number, number[]>();
  const spread = (map: Map<number, number[]>, i: number, reach: number) => {
    for (let ix = Math.floor((minX[i]! - reach) / TILE_SIZE); ix <= Math.floor((maxX[i]! + reach) / TILE_SIZE); ix++) {
      for (let iz = Math.floor((minZ[i]! - reach) / TILE_SIZE); iz <= Math.floor((maxZ[i]! + reach) / TILE_SIZE); iz++) {
        const key = tileKey(ix, iz);
        const list = map.get(key);
        if (list) list.push(i);
        else map.set(key, [i]);
      }
    }
  };
  for (let i = 0; i < count; i++) {
    spread(near, i, CORRIDOR_LAND_END);
    spread(wide, i, TILE_REACH);
  }
  const tiles: CorridorTile[] = [];
  const index = new Map<number, CorridorTile>();
  let minY = Infinity;
  const vertices = CORRIDOR_TILE_CELLS + 1;
  for (const key of near.keys()) {
    const ix = Math.floor(key / 65536) - 32768;
    const iz = (key % 65536) - 32768;
    const x0 = ix * TILE_SIZE;
    const z0 = iz * TILE_SIZE;
    const candidates = wide.get(key)!;
    const heights = new Float32Array(vertices * vertices);
    let built = false;
    let hint: number | undefined;
    // Blocks of BLOCK cells: the segments that can be nearest to a point in a block are those within its centre's nearest distance plus the block's half diagonal.
    for (let bx = 0; bx < CORRIDOR_TILE_CELLS; bx += BLOCK) {
      yield;
      for (let bz = 0; bz < CORRIDOR_TILE_CELLS; bz += BLOCK) {
        const x1 = x0 + bx * CORRIDOR_CELL;
        const z1 = z0 + bz * CORRIDOR_CELL;
        const x2 = x1 + BLOCK * CORRIDOR_CELL;
        const z2 = z1 + BLOCK * CORRIDOR_CELL;
        const reach = frame.nearestIn((x1 + x2) / 2, (z1 + z2) / 2, candidates, hint).d + (BLOCK * CORRIDOR_CELL * Math.SQRT2) / 2;
        const local = candidates.filter((i) => {
          const gx = Math.max(minX[i]! - x2, x1 - maxX[i]!, 0);
          const gz = Math.max(minZ[i]! - z2, z1 - maxZ[i]!, 0);
          return gx * gx + gz * gz <= reach * reach;
        });
        for (let xi = bx; xi <= bx + BLOCK; xi++) {
          for (let zi = bz; zi <= bz + BLOCK; zi++) {
            const x = x0 + xi * CORRIDOR_CELL;
            const z = z0 + zi * CORRIDOR_CELL;
            const hit = frame.nearestIn(x, z, local, hint);
            hint = hit.i;
            if (hit.d <= CORRIDOR_LAND_END) built = true;
            const close = hit.d < CORRIDOR_BLEND_END;
            heights[zi + xi * vertices] = corridorHeight({
              d: hit.d,
              relief: hit.d >= CORRIDOR_BLEND_START ? corridorReliefAt(course.id, x, z) : 0,
              smooth: frame.smoothedAt(hit),
              low: close ? frame.lowestAround(hit.along, LOW_HALF) : 0,
              berm: close && obstacles.length > 0 ? bermWeight(obstacles, hit.along) : 0,
            });
          }
        }
      }
    }
    if (!built) continue;
    for (const h of heights) minY = Math.min(minY, h);
    const tile: CorridorTile = { x0, z0, cols: CORRIDOR_TILE_CELLS, rows: CORRIDOR_TILE_CELLS, cell: CORRIDOR_CELL, heights };
    tiles.push(tile);
    index.set(key, tile);
  }
  return { tiles, minY, index };
}

export function buildCorridor(course: BuiltCourse): Corridor {
  const steps = corridorSteps(course);
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}

const corridors = new WeakMap<BuiltCourse, Corridor>();

// The land beside the road of a course that opted in, or null. Built once per course and shared by every world, the predictor and the renderer.
export function corridorOf(course: BuiltCourse): Corridor | null {
  if (!course.corridor) return null;
  let corridor = corridors.get(course);
  if (!corridor) {
    corridor = buildCorridor(course);
    corridors.set(course, corridor);
  }
  return corridor;
}

// Builds a course's corridor in steps and stores it where corridorOf finds it, which stays synchronous. Nothing happens for a course without one or one already built.
export function* warmCorridor(course: BuiltCourse): Generator<void, void> {
  if (!course.corridor || corridors.has(course)) return;
  const built = yield* corridorSteps(course);
  // A synchronous corridorOf call during a pause may have built it first; that one stays.
  if (!corridors.has(course)) corridors.set(course, built);
}

// The height at (x, z) on the triangulation Rapier uses (each cell splits along its (x1, z0)-(x0, z1) diagonal), or null outside every tile.
export function corridorHeightAt(corridor: Corridor, x: number, z: number): number | null {
  const ix = Math.floor(x / TILE_SIZE);
  const iz = Math.floor(z / TILE_SIZE);
  const tile = corridor.index.get(tileKey(ix, iz));
  if (!tile) return null;
  const fx = (x - tile.x0) / tile.cell;
  const fz = (z - tile.z0) / tile.cell;
  const cx = Math.min(tile.cols - 1, Math.floor(fx));
  const cz = Math.min(tile.rows - 1, Math.floor(fz));
  const u = fx - cx;
  const v = fz - cz;
  const stride = tile.rows + 1;
  const at = (i: number, j: number) => tile.heights[j + i * stride]!;
  const h00 = at(cx, cz);
  const h10 = at(cx + 1, cz);
  const h01 = at(cx, cz + 1);
  if (u + v <= 1) return h00 + u * (h10 - h00) + v * (h01 - h00);
  const h11 = at(cx + 1, cz + 1);
  return h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
}
