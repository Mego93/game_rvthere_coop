import { ARRIVAL_ROUTES, getCourse, surfaceYAt, terrainHeightAt, type Box, type BuiltCourse } from '@lodgy/shared';
import { describe, expect, it } from 'vitest';
import { CLEAR, CROWD_PER_M2, CLUTTER_PER_M2, MAX_SLOPE_DEG, PROP_BUDGET, dressMap, dressMeasures, walkLines, type PropPlacement } from './dressMap';
import { PROP_THEMES } from './propLibrary';

const arrival = getCourse('arrival');
const desktop = { phone: false };
const phone = { phone: true };
const placements = dressMap(arrival, 'airport', 1, desktop);
const entryOf = (key: string) => PROP_THEMES.airport.find((e) => e.key === key)!;

const distSegment = (x: number, z: number, a: { x: number; z: number }, b: { x: number; z: number }) => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz));
};
const distToRoutes = (x: number, z: number) => Math.min(...ARRIVAL_ROUTES.flatMap((r) => r.points.slice(1).map((p, i) => distSegment(x, z, r.points[i]!, p))));
const distToBox = (box: Box, x: number, z: number) => {
  const yaw = 2 * Math.atan2(box.rot.y, box.rot.w);
  const dx = x - box.center.x;
  const dz = z - box.center.z;
  const lx = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
  const lz = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
  return Math.hypot(Math.max(Math.abs(lx) - box.halfExtents.x, 0), Math.max(Math.abs(lz) - box.halfExtents.z, 0));
};
const height = (course: BuiltCourse, x: number, z: number) => Math.max(surfaceYAt(course, x, z) ?? -Infinity, terrainHeightAt(course, x, z) ?? -Infinity);

describe('dressMap (R1)', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    expect(dressMap(arrival, 'airport', 1, desktop)).toEqual(placements);
    expect(dressMap(arrival, 'airport', 2, desktop)).not.toEqual(placements);
    expect(placements.length).toBeGreaterThan(100);
  });

  it('places only models of the theme, with the role the theme gives them, and never a hand-placed one', () => {
    for (const p of placements) {
      const entry = entryOf(p.key);
      expect(entry, p.key).toBeDefined();
      expect(p.role).toBe(entry.role);
      expect(entry.weight, p.key).toBeGreaterThan(0);
    }
    expect(dressMap(arrival, 'city', 1, desktop)).toEqual([]);
  });

  it('keeps the densities of R1 within 20 percent on the arrival', () => {
    const measures = dressMeasures(arrival, 'airport', desktop);
    const count = (role: string) => placements.filter((p) => p.role === role).length;
    expect(measures.clutterArea).toBeGreaterThan(3000);
    expect(count('clutter')).toBeGreaterThanOrEqual(0.8 * CLUTTER_PER_M2 * measures.clutterArea);
    expect(count('clutter')).toBeLessThanOrEqual(1.2 * CLUTTER_PER_M2 * measures.clutterArea);
    expect(measures.crowdArea).toBeGreaterThan(1500);
    expect(count('crowd')).toBeGreaterThanOrEqual(0.8 * CROWD_PER_M2 * measures.crowdArea);
    expect(count('crowd')).toBeLessThanOrEqual(1.2 * CROWD_PER_M2 * measures.crowdArea);
    // Every 6 to 10 m along the edges: 8 m on average.
    expect(measures.edgeLength).toBeGreaterThan(500);
    expect(count('roadside')).toBeGreaterThanOrEqual(0.8 * (measures.edgeLength / 8));
    expect(count('roadside')).toBeLessThanOrEqual(1.2 * (measures.edgeLength / 8));
    expect(count('wall')).toBeGreaterThan(10);
  });

  it('spaces the roadside props along an edge 6 to 10 m apart: no two of one run are closer than 5 m', () => {
    const roadside = placements.filter((p) => p.role === 'roadside');
    expect(roadside.length).toBeGreaterThan(40);
    const near = roadside.filter((p, i) => roadside.some((q, j) => j > i && Math.hypot(p.x - q.x, p.z - q.z) < 1));
    expect(near).toEqual([]);
  });

  it('holds the budgets: 600 and 90 m on a phone, 1500 and 220 m on a desktop', () => {
    expect(PROP_BUDGET.phone).toEqual({ cap: 600, drawDistance: 90 });
    expect(PROP_BUDGET.desktop).toEqual({ cap: 1500, drawDistance: 220 });
    expect(placements.length).toBeLessThanOrEqual(PROP_BUDGET.desktop.cap);
    for (const seed of [1, 2, 3]) {
      const small = dressMap(arrival, 'airport', seed, phone);
      expect(small.length).toBeLessThanOrEqual(PROP_BUDGET.phone.cap);
      expect(small.length).toBeGreaterThan(100);
      for (const p of small) expect(entryOf(p.key).phone, p.key).toBe(true);
    }
  });

  it('the phone set is thinned down to the cap by a seed, not by a role: every dressed role is still there', () => {
    const small = dressMap(arrival, 'airport', 1, phone);
    for (const role of ['clutter', 'roadside', 'wall', 'crowd']) expect(small.some((p) => p.role === role), role).toBe(true);
  });
});

describe('dressMap clearances (R2)', () => {
  const nonWall = (list: readonly PropPlacement[]) => list.filter((p) => p.role !== 'wall');

  it('keeps every prop 1.5 m clear of every walk line, desktop and phone', () => {
    expect(CLEAR).toBe(1.5);
    for (const list of [placements, dressMap(arrival, 'airport', 7, phone)]) for (const p of list) expect(distToRoutes(p.x, p.z), `${p.key} ${p.x} ${p.z}`).toBeGreaterThanOrEqual(1.5);
  });

  it('keeps every prop 1.5 m clear of the finish box, the checkpoints, the vehicle spawn and the player start', () => {
    const spawn = arrival.checkpoints[0]!.spawn.pos;
    const start = arrival.playerStart!.pos;
    for (const p of placements) {
      expect(distToBox(arrival.finish, p.x, p.z), p.key).toBeGreaterThanOrEqual(1.5);
      for (const checkpoint of arrival.checkpoints) expect(distToBox(checkpoint.trigger, p.x, p.z), p.key).toBeGreaterThanOrEqual(1.5);
      expect(Math.hypot(p.x - spawn.x, p.z - spawn.z), p.key).toBeGreaterThanOrEqual(1.5);
      expect(Math.hypot(p.x - start.x, p.z - start.z), p.key).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('keeps every prop 1.5 m clear of the spots, stops, hazards, items and the walk-through props of a course that has them', () => {
    for (const id of ['villa', 'airport', 'segment-demo']) {
      const course = getCourse(id);
      const list = dressMap(course, 'airport', 3, desktop);
      for (const p of list) {
        for (const spot of course.spots ?? []) expect(Math.hypot(p.x - spot.pos.x, p.z - spot.pos.z), `${id} ${p.key}`).toBeGreaterThanOrEqual(spot.radius + 1.5);
        for (const stop of course.stops) expect(distToBox(stop.zone, p.x, p.z), `${id} ${p.key}`).toBeGreaterThanOrEqual(1.5);
        for (const hazard of course.decor.filter((d) => d.kind === 'water' && d.size)) expect(distToBox({ center: hazard.pose.pos, halfExtents: hazard.size!, rot: hazard.pose.rot }, p.x, p.z), `${id} ${p.key}`).toBeGreaterThanOrEqual(1.5);
      }
    }
  });

  it('keeps every prop except a wall sign 1.5 m clear of every wall and cover box', () => {
    for (const p of nonWall(placements)) for (const wall of arrival.walls) expect(distToBox(wall, p.x, p.z), `${p.key} ${p.x} ${p.z}`).toBeGreaterThanOrEqual(1.5);
  });

  it('puts a wall sign against a wall, outside it', () => {
    const signs = placements.filter((p) => p.role === 'wall');
    for (const p of signs) {
      expect(Math.min(...arrival.walls.map((w) => distToBox(w, p.x, p.z))), p.key).toBeLessThan(1.2);
      for (const wall of arrival.walls) expect(distToBox(wall, p.x, p.z), p.key).toBeGreaterThan(0.01);
    }
  });

  it('sets every prop on the ground and on no slope over 30 degrees', () => {
    expect(MAX_SLOPE_DEG).toBe(30);
    const limit = Math.tan((30 * Math.PI) / 180);
    for (const p of [...placements, ...dressMap(arrival, 'airport', 5, phone)]) {
      const h = height(arrival, p.x, p.z);
      expect(Number.isFinite(h), `${p.key} ${p.x} ${p.z}`).toBe(true);
      expect(p.y).toBeCloseTo(h, 6);
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        const around = height(arrival, p.x + 0.5 * Math.cos(a), p.z + 0.5 * Math.sin(a));
        expect(Math.abs(around - h) / 0.5, `${p.key} ${p.x} ${p.z}`).toBeLessThanOrEqual(limit + 1e-6);
      }
    }
  });

  it('keeps clear of a hand-placed landmark it is told about', () => {
    const avoid = [{ x: 20, z: -33, r: 5 }];
    const list = dressMap(arrival, 'airport', 1, { phone: false, avoid });
    for (const p of list) expect(Math.hypot(p.x - 20, p.z + 33), p.key).toBeGreaterThanOrEqual(5 + 1.5);
  });

  it('walks the arrival\'s three routes and the route of any other course', () => {
    expect(walkLines(arrival)).toHaveLength(3);
    const marrakech = getCourse('segment-demo');
    expect(walkLines(marrakech)).toEqual([marrakech.route.map(([x, z]) => ({ x, z }))]);
  });
});
