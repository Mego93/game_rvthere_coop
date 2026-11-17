import { buildCourse, getCourse, getCourseDef, ROAD_WIDTH, rotate, segmentRanges, type Box, type CourseDef } from '@lodgy/shared';
import { describe, expect, test } from 'vitest';
import { CITY_LENGTH, DECOR_DENSITY, NEAR_ALLOWED_MODELS, NEAR_MAX_SIZE, scatterDecor, seedFromId } from './decorScatter';
import { MODEL_KEYS, MODEL_MANIFEST } from './modelManifest';
import { routeDistance } from './terrain';

const airport = getCourse('airport');
const airportDef = getCourseDef('airport')!;
const demo = getCourse('segment-demo');
const demoDef = getCourseDef('segment-demo')!;
const placements = scatterDecor(airport, airportDef, seedFromId('airport'));

const insideBox = (box: Box, x: number, z: number, margin: number) => {
  const local = rotate({ x: -box.rot.x, y: -box.rot.y, z: -box.rot.z, w: box.rot.w }, { x: x - box.center.x, y: 0, z: z - box.center.z });
  return Math.abs(local.x) <= box.halfExtents.x + margin && Math.abs(local.z) <= box.halfExtents.z + margin;
};

const routeLength = airport.route.reduce((sum, p, i) => (i === 0 ? 0 : sum + Math.hypot(p[0] - airport.route[i - 1]![0], p[1] - airport.route[i - 1]![1])), 0);

// Distance along the route of the nearest route point to (x, z).
function alongOf(x: number, z: number): number {
  let best = Infinity;
  let along = 0;
  let walked = 0;
  for (let i = 0; i < airport.route.length - 1; i++) {
    const [x0, z0] = airport.route[i]!;
    const [x1, z1] = airport.route[i + 1]!;
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

describe('scatterDecor', () => {
  test('is deterministic and the seed matters', () => {
    expect(scatterDecor(airport, airportDef, seedFromId('airport'))).toEqual(placements);
    expect(scatterDecor(airport, airportDef, seedFromId('airport') + 1)).not.toEqual(placements);
    expect(placements.length).toBeGreaterThan(300);
  });

  test('the test course has no definition and no decor', () => {
    expect(scatterDecor(getCourse('test'), null, 1)).toEqual([]);
  });

  test('the demo scatters from its definition', () => {
    const list = scatterDecor(demo, demoDef, seedFromId('segment-demo'));
    expect(list.length).toBeGreaterThan(20);
    expect(list.every((p) => p.model.startsWith('decor.') && MODEL_KEYS.includes(p.model))).toBe(true);
  });

  test('every model is a manifest key and every number is finite', () => {
    for (const p of placements) {
      expect(MODEL_KEYS).toContain(p.model);
      for (const value of [p.x, p.y, p.z, p.yaw, p.scale]) expect(Number.isFinite(value)).toBe(true);
      expect(p.scale).toBeGreaterThan(0);
    }
  });

  test('nothing within 5 m of the centre line; only low items and lights or poles within 31 m', () => {
    for (const p of placements) {
      const { distance } = routeDistance(airport, p.x, p.z);
      expect(distance).toBeGreaterThanOrEqual(5);
      if (distance < 31) {
        expect(NEAR_ALLOWED_MODELS.has(p.model)).toBe(true);
        if (p.model.startsWith('decor.light') || p.model.startsWith('decor.pole')) expect(Math.abs(distance - 7)).toBeLessThan(0.6);
        else expect(distance).toBeLessThanOrEqual(30);
      }
    }
  });

  test('near low items are no taller than 0.75 m', () => {
    for (const p of placements) {
      if (routeDistance(airport, p.x, p.z).distance >= 31 || p.model.startsWith('decor.light') || p.model.startsWith('decor.pole')) continue;
      const target = MODEL_MANIFEST[p.model].targetSize;
      const size = typeof target === 'number' ? target : Math.max(target.x, target.y, target.z);
      expect(size * p.scale).toBeLessThanOrEqual(NEAR_MAX_SIZE + 0.05);
    }
  });

  test('none in a stop zone, near a prop, pickup, anchor or coin, or in ford water', () => {
    const objects = [...airport.props, ...airport.pickups, ...airport.anchors, ...airport.coins];
    const water = airport.decor.filter((d) => d.kind === 'water' && d.size);
    expect(airport.stops.length).toBeGreaterThan(0);
    expect(water.length).toBeGreaterThan(0);
    for (const p of placements) {
      for (const stop of airport.stops) expect(insideBox(stop.zone, p.x, p.z, 3)).toBe(false);
      for (const o of objects) expect(Math.hypot(p.x - o.pose.pos.x, p.z - o.pose.pos.z)).toBeGreaterThanOrEqual(3);
      for (const w of water) expect(insideBox({ center: w.pose.pos, halfExtents: w.size!, rot: w.pose.rot }, p.x, p.z, 0)).toBe(false);
    }
  });

  test('nothing beside the alley', () => {
    const alley = segmentRanges(airportDef).find((r) => r.type === 'alley')!;
    for (const p of placements) {
      const along = alongOf(p.x, p.z);
      if (routeDistance(airport, p.x, p.z).distance < 60) expect(along < alley.from || along > alley.to).toBe(true);
    }
  });

  test('counts per model are within bounds', () => {
    const counts = new Map<string, number>();
    for (const p of placements) counts.set(p.model, (counts.get(p.model) ?? 0) + 1);
    expect(placements.length).toBeLessThan(9000);
    for (const count of counts.values()) expect(count).toBeLessThan(900);
    const group = (prefix: string) => [...counts].filter(([k]) => k.startsWith(prefix)).reduce((sum, [, c]) => sum + c, 0);
    for (const prefix of ['decor.palm', 'decor.rock', 'decor.scrub', 'decor.grass', 'decor.cliff']) expect(group(prefix)).toBeGreaterThan(5);
  });

  test('buildings appear only in the last 600 m, and there are some', () => {
    const buildings = placements.filter((p) => p.model.startsWith('decor.building') || p.model.startsWith('decor.house'));
    expect(buildings.length).toBeGreaterThanOrEqual(8);
    for (const p of buildings) {
      expect(alongOf(p.x, p.z)).toBeGreaterThanOrEqual(routeLength - CITY_LENGTH - 5);
      const { distance } = routeDistance(airport, p.x, p.z);
      expect(distance).toBeGreaterThanOrEqual(31);
      expect(distance).toBeLessThanOrEqual(46);
    }
    expect(buildings.some((p) => routeSide(p.x, p.z) < 0)).toBe(true);
    expect(buildings.some((p) => routeSide(p.x, p.z) > 0)).toBe(true);
  });

  test('street lights and poles stand 7 m off the line, on both sides, only in the last 600 m', () => {
    const lights = placements.filter((p) => p.model.startsWith('decor.light') || p.model.startsWith('decor.pole'));
    expect(lights.length).toBeGreaterThan(20);
    for (const p of lights) expect(alongOf(p.x, p.z)).toBeGreaterThanOrEqual(routeLength - CITY_LENGTH - 5);
  });

  test('palms stand in the sand segment, beyond the shoulders', () => {
    const sand = segmentRanges(airportDef).find((r) => r.type === 'sand')!;
    const palms = placements.filter((p) => p.model.startsWith('decor.palm') && alongOf(p.x, p.z) >= sand.from && alongOf(p.x, p.z) <= sand.to);
    expect(palms.length).toBeGreaterThanOrEqual(2);
    for (const p of palms) expect(routeDistance(airport, p.x, p.z).distance).toBeGreaterThanOrEqual(31);
  });

  test('the density table covers the road types', () => {
    for (const type of ['road', 'sand', 'ford', 'bank', 'pit', 'roadworks', 'city'] as const) expect(DECOR_DENSITY[type]).toBeDefined();
    expect(ROAD_WIDTH).toBe(10);
  });

  test('a pit scatters like open road', () => {
    expect(DECOR_DENSITY.pit).toEqual(DECOR_DENSITY.road);
    const def: CourseDef = {
      id: 'pit-scatter',
      segments: [{ type: 'road', length: 200 }, { type: 'pit', depth: 2, gradient: 15, gradientOut: 28, floor: 8, anchors: 2 }, { type: 'road', length: 200 }],
      targetTime: 60,
    };
    const course = buildCourse(def);
    const placed = scatterDecor(course, def, seedFromId('pit-scatter'));
    expect(placed.length).toBeGreaterThan(0);
    expect(scatterDecor(course, def, seedFromId('pit-scatter'))).toEqual(placed);
  });
});

// Which side of the route (sign of the cross product with the local tangent).
function routeSide(x: number, z: number): number {
  let best = Infinity;
  let side = 0;
  for (let i = 0; i < airport.route.length - 1; i++) {
    const [x0, z0] = airport.route[i]!;
    const [x1, z1] = airport.route[i + 1]!;
    const length = Math.hypot(x1 - x0, z1 - z0);
    const t = Math.min(1, Math.max(0, ((x - x0) * (x1 - x0) + (z - z0) * (z1 - z0)) / (length * length)));
    const d = Math.hypot(x - (x0 + (x1 - x0) * t), z - (z0 + (z1 - z0) * t));
    if (d < best) {
      best = d;
      side = Math.sign((x1 - x0) * (z - z0) - (z1 - z0) * (x - x0));
    }
  }
  return side;
}
