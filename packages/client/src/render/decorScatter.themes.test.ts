import { createHash } from 'node:crypto';
import { getCourse, getCourseDef, ROAD_WIDTH, segmentRanges } from '@lodgy/shared';
import { describe, expect, test } from 'vitest';
import { AIRPORT_CITY_SHARE, PARKED_LATERAL, scatterDecor, seedFromId } from './decorScatter';
import { routeDistance } from './terrain';

const place = (id: string) => scatterDecor(getCourse(id), getCourseDef(id), seedFromId(id));
const count = (list: { model: string }[], prefix: string) => list.filter((p) => p.model.startsWith(prefix)).length;
const CITY_MODELS = ['decor.building', 'decor.house', 'decor.light', 'decor.pole', 'decor.fence', 'decor.car'];
const cityCount = (list: { model: string }[]) => CITY_MODELS.reduce((sum, prefix) => sum + count(list, prefix), 0);

function alongOf(course: ReturnType<typeof getCourse>, x: number, z: number): number {
  let best = Infinity;
  let along = 0;
  let walked = 0;
  for (let i = 0; i < course.route.length - 1; i++) {
    const [x0, z0] = course.route[i]!;
    const [x1, z1] = course.route[i + 1]!;
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
const lengthOf = (course: ReturnType<typeof getCourse>) => course.route.reduce((sum, p, i) => (i === 0 ? 0 : sum + Math.hypot(p[0] - course.route[i - 1]![0], p[1] - course.route[i - 1]![1])), 0);

describe('V3 themes', () => {
  test('a course with no theme scatters exactly as before step 40', () => {
    const hash = (id: string) => createHash('sha1').update(JSON.stringify(place(id))).digest('hex');
    expect(hash('airport')).toBe('bf7f18d5a6e65b22557fd85d1a0cf023bf0d5ada');
    expect(hash('segment-demo')).toBe('4508257d90ff8c3b53cf9c486d34717f81e8cdae');
    expect(hash('marrakech')).toBe('57ad3da3311af770a0f1f311602cc62a3d11d899');
  });

  test('desert: no city at all, and the new tree and house models stay out', () => {
    const list = place('desert');
    expect(cityCount(list)).toBe(0);
    expect(count(list, 'decor.palm')).toBeGreaterThan(100);
    expect(count(list, 'decor.cactus')).toBeGreaterThan(20);
    for (const prefix of ['decor.pine', 'decor.broadleaf', 'decor.adobe', 'decor.kasbah.landmark', 'decor.car']) expect(count(list, prefix), prefix).toBe(0);
  });

  test('valley: dense pines and broadleaf trees, no palms, cacti or city', () => {
    const list = place('valley');
    expect(count(list, 'decor.pine')).toBeGreaterThan(200);
    expect(count(list, 'decor.broadleaf')).toBeGreaterThan(200);
    expect(count(list, 'decor.palm') + count(list, 'decor.cactus')).toBe(0);
    expect(cityCount(list)).toBe(0);
    expect(count(list, 'decor.tree.')).toBe(0);
  });

  test('mountain: rock and scrub, adobe houses in clusters, one kasbah on the last flat straight and no city', () => {
    const course = getCourse('mountain');
    const def = getCourseDef('mountain')!;
    const list = place('mountain');
    expect(cityCount(list)).toBe(0);
    expect(count(list, 'decor.rock') + count(list, 'decor.stone')).toBeGreaterThan(count(list, 'decor.palm') * 5);
    expect(count(list, 'decor.crop')).toBe(0);
    const houses = list.filter((p) => p.model === 'decor.adobe');
    expect(houses.length).toBeGreaterThanOrEqual(12);
    // Clusters: most houses have another within 20 m.
    const near = houses.filter((a) => houses.some((b) => b !== a && Math.hypot(a.x - b.x, a.z - b.z) < 20));
    expect(near.length).toBeGreaterThanOrEqual(houses.length * 0.7);
    const kasbah = list.filter((p) => p.model === 'decor.kasbah.landmark');
    expect(kasbah).toHaveLength(1);
    const flats = segmentRanges(def).filter((r, i) => {
      const s = def.segments[i]!;
      return s.type === 'road' && !s.slope && !s.curve && r.to - r.from >= 40;
    });
    const lastFlat = flats[flats.length - 1]!;
    const along = alongOf(course, kasbah[0]!.x, kasbah[0]!.z);
    expect(along).toBeGreaterThanOrEqual(lastFlat.from - 10);
    expect(along).toBeLessThanOrEqual(lastFlat.to + 10);
    expect(routeDistance(course, kasbah[0]!.x, kasbah[0]!.z).distance).toBeGreaterThan(55);
    for (const house of houses) expect(alongOf(course, house.x, house.z) < lastFlat.from - 50 || alongOf(course, house.x, house.z) > lastFlat.to + 50).toBe(true);
  });

  test('city: the city table runs along the whole course, with parked cars outside the lane', () => {
    const course = getCourse('city');
    const total = lengthOf(course);
    const list = place('city');
    const built = list.filter((p) => p.model.startsWith('decor.building') || p.model.startsWith('decor.house'));
    expect(built.length).toBeGreaterThan(150);
    expect(built.some((p) => alongOf(course, p.x, p.z) < total * 0.15)).toBe(true);
    expect(built.some((p) => alongOf(course, p.x, p.z) > total * 0.85)).toBe(true);
    const cars = list.filter((p) => p.model.startsWith('decor.car.'));
    expect(cars.length).toBeGreaterThan(40);
    expect(new Set(cars.map((p) => p.model))).toEqual(new Set(['decor.car.hatchback', 'decor.car.minicab']));
    for (const car of cars) {
      const { distance } = routeDistance(course, car.x, car.z);
      expect(distance, 'outside the lane').toBeGreaterThanOrEqual(ROAD_WIDTH / 2 + 1);
      expect(distance).toBeLessThanOrEqual(PARKED_LATERAL + 1.3);
      expect(car.scale).toBe(1);
    }
    expect(cars.some((p) => Math.sign(Math.sin(p.yaw)) !== Math.sign(Math.sin(cars[0]!.yaw)) || Math.sign(Math.cos(p.yaw)) !== Math.sign(Math.cos(cars[0]!.yaw)))).toBe(true);
  });

  test('parked cars are decor only: the course gains no wall, prop or ground box and no car overlaps another', () => {
    const course = getCourse('city');
    const walls = course.walls.length;
    const props = course.props.length;
    const ground = course.ground.length;
    const cars = place('city').filter((p) => p.model.startsWith('decor.car.'));
    expect([course.walls.length, course.props.length, course.ground.length]).toEqual([walls, props, ground]);
    for (const a of cars) for (const b of cars) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(2.4);
  });

  test('airport road: city for the first 40 %, the road table after it, and no parked cars', () => {
    const course = getCourse('airport-road');
    const total = lengthOf(course);
    const list = place('airport-road');
    const built = list.filter((p) => p.model.startsWith('decor.building') || p.model.startsWith('decor.house') || p.model.startsWith('decor.light') || p.model.startsWith('decor.pole'));
    expect(built.length).toBeGreaterThan(40);
    for (const p of built) expect(alongOf(course, p.x, p.z)).toBeLessThanOrEqual(total * AIRPORT_CITY_SHARE + 60);
    expect(count(list, 'decor.car')).toBe(0);
    expect(count(list, 'decor.palm')).toBeGreaterThan(50);
  });

  test('every themed stage is deterministic', () => {
    for (const id of ['desert', 'valley', 'mountain', 'city', 'airport-road']) expect(place(id)).toEqual(place(id));
  });
});
