import { ARRIVAL_ROUTES, mulberry32, surfaceYAt, terrainHeightAt, type Box, type BuiltCourse } from '@lodgy/shared';
import type { ModelKey } from './modelManifest';
import { PROP_THEMES, type PropEntry, type PropRole, type PropTheme } from './propLibrary';

export interface PropPlacement {
  key: ModelKey;
  role: PropRole;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

export interface Avoid {
  x: number;
  z: number;
  r: number;
}

export interface DressOptions {
  phone: boolean;
  // Circles the scene fills by hand (a fountain, a flag): the dressing keeps CLEAR clear of them too.
  avoid?: readonly Avoid[];
}

export const PROP_BUDGET = { phone: { cap: 600, drawDistance: 90 }, desktop: { cap: 1500, drawDistance: 220 } } as const;

// Metres clear of a walk line, a spot, a checkpoint, the finish, a stop, a hazard, the vehicle spawn and a wall box.
export const CLEAR = 1.5;
export const MAX_SLOPE_DEG = 30;
export const CLUTTER_PER_M2 = 4 / 100;
export const CROWD_PER_M2 = 1 / 150;
export const ROADSIDE_SPACING = { min: 6, max: 10 };
// Clutter and the crowd stand within this far of a walk line; the crowd keeps further from it.
const BAND = 12;
const CROWD_CLEAR = 4;
const EDGE_OFFSET = 2.5;
const WALL_SPACING = { min: 18, max: 30 };
const WALL_MIN_LENGTH = 6;
const MAX_RADIUS = 1.6;
const SLOPE_STEP = 0.5;
const SLOPE_LIMIT = Math.tan((MAX_SLOPE_DEG * Math.PI) / 180);
const BUCKET = 16;

interface Point {
  x: number;
  z: number;
}

interface Rect {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  cos: number;
  sin: number;
}

const rectOf = (box: Box): Rect => {
  const yaw = 2 * Math.atan2(box.rot.y, box.rot.w);
  return { cx: box.center.x, cz: box.center.z, hx: box.halfExtents.x, hz: box.halfExtents.z, cos: Math.cos(yaw), sin: Math.sin(yaw) };
};

const rectDistance = (r: Rect, x: number, z: number): number => {
  const dx = x - r.cx;
  const dz = z - r.cz;
  const lx = r.cos * dx - r.sin * dz;
  const lz = r.sin * dx + r.cos * dz;
  return Math.hypot(Math.max(Math.abs(lx) - r.hx, 0), Math.max(Math.abs(lz) - r.hz, 0));
};

class Buckets<T> {
  private readonly cells = new Map<string, T[]>();

  add(item: T, minX: number, maxX: number, minZ: number, maxZ: number): void {
    for (let i = Math.floor((minX - BUCKET) / BUCKET); i <= Math.floor((maxX + BUCKET) / BUCKET); i++) {
      for (let j = Math.floor((minZ - BUCKET) / BUCKET); j <= Math.floor((maxZ + BUCKET) / BUCKET); j++) {
        const key = `${i},${j}`;
        const list = this.cells.get(key);
        if (list) list.push(item);
        else this.cells.set(key, [item]);
      }
    }
  }

  // Everything within BUCKET m of (x, z), and possibly more.
  near(x: number, z: number): readonly T[] {
    return this.cells.get(`${Math.floor(x / BUCKET)},${Math.floor(z / BUCKET)}`) ?? [];
  }
}

interface Segment {
  a: Point;
  b: Point;
}

const segmentDistance = (s: Segment, x: number, z: number): number => {
  const dx = s.b.x - s.a.x;
  const dz = s.b.z - s.a.z;
  const t = Math.max(0, Math.min(1, ((x - s.a.x) * dx + (z - s.a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - (s.a.x + t * dx), z - (s.a.z + t * dz));
};

// The lines a player walks: the arrival's three routes, or the course's route.
export function walkLines(course: BuiltCourse): Point[][] {
  if (course.id === 'arrival') return ARRIVAL_ROUTES.map((r) => r.points.map((p) => ({ x: p.x, z: p.z })));
  return course.route.length >= 2 ? [course.route.map(([x, z]) => ({ x, z }))] : [];
}

export function groundYAt(course: BuiltCourse, x: number, z: number): number | null {
  const box = surfaceYAt(course, x, z);
  const patch = terrainHeightAt(course, x, z);
  if (box === null && patch === null) return null;
  return Math.max(box ?? -Infinity, patch ?? -Infinity);
}

// True when the ground at (x, z) is at most MAX_SLOPE_DEG in every direction over SLOPE_STEP m, and exists all round.
export function slopeOk(course: BuiltCourse, x: number, z: number): boolean {
  const here = groundYAt(course, x, z);
  if (here === null) return false;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const around = groundYAt(course, x + SLOPE_STEP * Math.cos(a), z + SLOPE_STEP * Math.sin(a));
    if (around === null || Math.abs(around - here) / SLOPE_STEP > SLOPE_LIMIT) return false;
  }
  return true;
}

// What props keep clear of, for one course.
interface Keepouts {
  lines: Point[][];
  segments: Buckets<Segment>;
  circles: Buckets<Avoid>;
  rects: Buckets<Rect>;
  walls: Buckets<Rect>;
}

function keepoutsOf(course: BuiltCourse, avoid: readonly Avoid[]): Keepouts {
  const lines = walkLines(course);
  const segments = new Buckets<Segment>();
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const s = { a: line[i - 1]!, b: line[i]! };
      segments.add(s, Math.min(s.a.x, s.b.x), Math.max(s.a.x, s.b.x), Math.min(s.a.z, s.b.z), Math.max(s.a.z, s.b.z));
    }
  }
  const circles = new Buckets<Avoid>();
  const circle = (x: number, z: number, r: number) => circles.add({ x, z, r }, x - r, x + r, z - r, z + r);
  const rects = new Buckets<Rect>();
  const rect = (box: Box) => {
    const r = rectOf(box);
    const reach = Math.hypot(r.hx, r.hz);
    rects.add(r, r.cx - reach, r.cx + reach, r.cz - reach, r.cz + reach);
  };
  rect(course.finish);
  for (const checkpoint of course.checkpoints) {
    rect(checkpoint.trigger);
    circle(checkpoint.spawn.pos.x, checkpoint.spawn.pos.z, 3);
  }
  if (course.playerStart) circle(course.playerStart.pos.x, course.playerStart.pos.z, 2);
  for (const spot of course.spots ?? []) circle(spot.pos.x, spot.pos.z, spot.radius);
  for (const stop of course.stops) {
    rect(stop.zone);
    circle(stop.operatePoint.x, stop.operatePoint.z, 1);
    if (stop.shopCounter) circle(stop.shopCounter.x, stop.shopCounter.z, 1);
  }
  for (const d of course.decor) if (d.kind === 'water' && d.size) rect({ center: d.pose.pos, halfExtents: d.size, rot: d.pose.rot });
  for (const placed of [...course.props, ...course.pickups, ...course.anchors]) circle(placed.pose.pos.x, placed.pose.pos.z, 1);
  for (const a of avoid) circle(a.x, a.z, a.r);
  const walls = new Buckets<Rect>();
  for (const box of course.walls) {
    const r = rectOf(box);
    const reach = Math.hypot(r.hx, r.hz);
    walls.add(r, r.cx - reach, r.cx + reach, r.cz - reach, r.cz + reach);
  }
  return { lines, segments, circles, rects, walls };
}

const lineDistance = (k: Keepouts, x: number, z: number): number => {
  let best = Infinity;
  for (const s of k.segments.near(x, z)) best = Math.min(best, segmentDistance(s, x, z));
  return best;
};

// Whether a prop of radius r at (x, z) breaks a clearance; a wall sign (`onWall`) may stand against the wall it hangs on.
function blocked(k: Keepouts, x: number, z: number, r: number, onWall = false): boolean {
  if (lineDistance(k, x, z) < CLEAR + r) return true;
  for (const c of k.circles.near(x, z)) if (Math.hypot(x - c.x, z - c.z) < c.r + CLEAR + r) return true;
  for (const rc of k.rects.near(x, z)) if (rectDistance(rc, x, z) < CLEAR + r) return true;
  for (const w of k.walls.near(x, z)) {
    const d = rectDistance(w, x, z);
    if (onWall ? d < 0.05 : d < CLEAR + r) return true;
  }
  return false;
}

const radiusOf = (entry: PropEntry) => Math.min(entry.size / 2, MAX_RADIUS);

const stringHash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};

interface Layout {
  keepouts: Keepouts;
  // Cells of the near-path band where a point prop may stand, with their distance to the nearest walk line.
  cells: { x: number; z: number; distance: number }[];
  // Valid edge samples, 1 m apart along each side of each line: the run each roadside prop is picked from.
  edges: { x: number; z: number; nx: number; nz: number }[][];
}

const layouts = new WeakMap<BuiltCourse, Map<string, Layout>>();

function layoutOf(course: BuiltCourse, avoid: readonly Avoid[]): Layout {
  const signature = JSON.stringify(avoid);
  let byAvoid = layouts.get(course);
  if (!byAvoid) layouts.set(course, (byAvoid = new Map()));
  const known = byAvoid.get(signature);
  if (known) return known;

  const keepouts = keepoutsOf(course, avoid);
  const valid = (x: number, z: number) => !blocked(keepouts, x, z, 0) && slopeOk(course, x, z);
  const seen = new Set<string>();
  const cells: Layout['cells'] = [];
  const edges: Layout['edges'] = [];
  const taken = new Buckets<Point>();
  const takenNear = (x: number, z: number) => taken.near(x, z).some((p) => Math.hypot(p.x - x, p.z - z) < 2);
  for (const line of keepouts.lines) {
    // Walk the line in 1 m steps; each step gives the band cells across it and the two edge samples.
    const left: Layout['edges'][number] = [];
    const right: Layout['edges'][number] = [];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]!;
      const b = line[i]!;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length === 0) continue;
      const tx = (b.x - a.x) / length;
      const tz = (b.z - a.z) / length;
      for (let s = 0; s < length; s += 1) {
        const px = a.x + tx * s;
        const pz = a.z + tz * s;
        for (let lateral = -BAND; lateral <= BAND; lateral += 1) {
          const x = Math.floor(px - tz * lateral) + 0.5;
          const z = Math.floor(pz + tx * lateral) + 0.5;
          const key = `${x},${z}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const distance = lineDistance(keepouts, x, z);
          if (distance <= BAND && valid(x, z)) cells.push({ x, z, distance });
        }
        for (const [side, list] of [[1, left], [-1, right]] as const) {
          const nx = -tz * side;
          const nz = tx * side;
          const x = px + nx * EDGE_OFFSET;
          const z = pz + nz * EDGE_OFFSET;
          if (!valid(x, z) || takenNear(x, z)) continue;
          list.push({ x, z, nx, nz });
        }
      }
    }
    // Samples of this line become unavailable to the lines after it.
    for (const sample of [...left, ...right]) taken.add({ x: sample.x, z: sample.z }, sample.x, sample.x, sample.z, sample.z);
    edges.push(left, right);
  }
  const layout = { keepouts, cells, edges };
  byAvoid.set(signature, layout);
  return layout;
}

export interface DressMeasures {
  // Square metres of the near-path band where clutter may stand, and where the crowd may.
  clutterArea: number;
  crowdArea: number;
  // Metres of edge along the walk lines where a roadside prop may stand.
  edgeLength: number;
}

// The sizes R1's densities apply to.
export function dressMeasures(course: BuiltCourse, _theme: PropTheme, opts: DressOptions): DressMeasures {
  const layout = layoutOf(course, opts.avoid ?? []);
  return {
    clutterArea: layout.cells.length,
    crowdArea: layout.cells.filter((c) => c.distance >= CROWD_CLEAR).length,
    edgeLength: layout.edges.reduce((sum, run) => sum + run.length, 0),
  };
}

const pick = (entries: readonly PropEntry[], rand: () => number): PropEntry => {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let at = rand() * total;
  for (const e of entries) {
    at -= e.weight;
    if (at < 0) return e;
  }
  return entries[entries.length - 1]!;
};

// Props placed so far, to keep them from standing on each other.
class Placed {
  private readonly grid = new Buckets<{ x: number; z: number; r: number }>();

  free(x: number, z: number, r: number, extra = 0.1): boolean {
    for (const p of this.grid.near(x, z)) if (Math.hypot(p.x - x, p.z - z) < p.r + r + extra) return false;
    return true;
  }

  add(x: number, z: number, r: number): void {
    this.grid.add({ x, z, r }, x, x, z, z);
  }
}

export function dressMap(course: BuiltCourse, theme: PropTheme, seed: number, opts: DressOptions): PropPlacement[] {
  const entries = PROP_THEMES[theme].filter((e) => e.weight > 0 && (!opts.phone || e.phone));
  const byRole = (role: PropRole) => entries.filter((e) => e.role === role);
  if (entries.length === 0) return [];
  const layout = layoutOf(course, opts.avoid ?? []);
  const { keepouts } = layout;
  const rand = mulberry32((seed ^ stringHash(`${course.id}/${theme}`)) >>> 0);
  const between = (min: number, max: number) => min + rand() * (max - min);
  const placed = new Placed();
  const out: PropPlacement[] = [];
  const put = (entry: PropEntry, x: number, z: number, yaw: number, scale = between(0.94, 1.06)) => {
    out.push({ key: entry.key, role: entry.role, x, y: groundYAt(course, x, z) ?? 0, z, yaw, scale });
    placed.add(x, z, radiusOf(entry) * scale);
  };
  const fits = (entry: PropEntry, x: number, z: number, onWall = false) => {
    const r = radiusOf(entry);
    return !blocked(keepouts, x, z, r, onWall) && slopeOk(course, x, z) && placed.free(x, z, r);
  };

  // Roadside: along both edges of each line, one every 6 to 10 m.
  const roadside = byRole('roadside');
  if (roadside.length > 0) {
    for (const run of layout.edges) {
      let step = between(ROADSIDE_SPACING.min, ROADSIDE_SPACING.max);
      let travelled = 0;
      for (const sample of run) {
        travelled += 1;
        if (travelled < step) continue;
        travelled = 0;
        step = between(ROADSIDE_SPACING.min, ROADSIDE_SPACING.max);
        for (let attempt = 0; attempt < 3; attempt++) {
          const entry = pick(roadside, rand);
          const lateral = Math.max(EDGE_OFFSET, CLEAR + radiusOf(entry) + 0.15) - EDGE_OFFSET;
          const x = sample.x + sample.nx * lateral;
          const z = sample.z + sample.nz * lateral;
          if (!fits(entry, x, z)) continue;
          // Faces the line it stands beside.
          put(entry, x, z, Math.atan2(-sample.nx, -sample.nz));
          break;
        }
      }
    }
  }

  // Wall dressing: signs standing against the long wall boxes, on the side that has ground.
  const wallProps = byRole('wall');
  if (wallProps.length > 0) {
    for (const box of course.walls) {
      const r = rectOf(box);
      const alongX = r.hx >= r.hz;
      const length = 2 * (alongX ? r.hx : r.hz);
      const half = alongX ? r.hz : r.hx;
      if (length < WALL_MIN_LENGTH) continue;
      for (const side of [1, -1]) {
        let at = between(3, 8);
        while (at < length - 3) {
          const entry = pick(wallProps, rand);
          const depth = Math.min(entry.size, 0.8) / 2;
          // Local frame: u along the wall, v out of it; turned into the world by the wall's yaw.
          const u = at - length / 2;
          const v = side * (half + depth + 0.15);
          const x = r.cx + (alongX ? r.cos * u + r.sin * v : r.cos * v + r.sin * u);
          const z = r.cz + (alongX ? -r.sin * u + r.cos * v : -r.sin * v + r.cos * u);
          const nx = alongX ? r.sin * side : r.cos * side;
          const nz = alongX ? r.cos * side : -r.sin * side;
          if (fits(entry, x, z, true)) put(entry, x, z, Math.atan2(nx, nz), 1);
          at += between(WALL_SPACING.min, WALL_SPACING.max);
        }
      }
    }
  }

  // Ground clutter and the crowd: points drawn from the band cells, 4 per 100 m2 and 1 per 150 m2.
  const scatter = (role: PropRole, perM2: number, cells: readonly { x: number; z: number }[], spacing: number) => {
    const pool = byRole(role);
    if (pool.length === 0 || cells.length === 0) return;
    const wanted = Math.round(perM2 * cells.length);
    const order = cells.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    let done = 0;
    for (const index of order) {
      if (done >= wanted) break;
      const cell = cells[index]!;
      const entry = pick(pool, rand);
      const x = cell.x + between(-0.45, 0.45);
      const z = cell.z + between(-0.45, 0.45);
      if (!fits(entry, x, z) || !placed.free(x, z, radiusOf(entry), spacing)) continue;
      put(entry, x, z, rand() * Math.PI * 2);
      done++;
    }
  };
  scatter('clutter', CLUTTER_PER_M2, layout.cells, 0.1);
  scatter('crowd', CROWD_PER_M2, layout.cells.filter((c) => c.distance >= CROWD_CLEAR).map((c) => c), 1);
  return thin(out, opts.phone ? PROP_BUDGET.phone.cap : PROP_BUDGET.desktop.cap, rand);
}

// A seeded sample of at most `cap` placements, in their original order.
function thin(list: PropPlacement[], cap: number, rand: () => number): PropPlacement[] {
  if (list.length <= cap) return list;
  const keep = list.map((_, i) => i);
  for (let i = 0; i < cap; i++) {
    const j = i + Math.floor(rand() * (keep.length - i));
    [keep[i], keep[j]] = [keep[j]!, keep[i]!];
  }
  return keep.slice(0, cap).sort((a, b) => a - b).map((i) => list[i]!);
}
