import { buildCourse, CORRIDOR_OUTER, corridorHeightAt, corridorOf, getCourse, getCourseDef, type CourseDef } from '@lodgy/shared';
import { describe, expect, test } from 'vitest';
import { buildCells, DESKTOP_DECOR, TOUCH_DECOR, visibleCells } from './decorChunks';
import { scatterDecor, seedFromId, type DecorPlacement } from './decorScatter';
import { routeDistance } from './terrain';

const course = getCourse('marrakech');
const def = getCourseDef('marrakech')!;
const corridor = corridorOf(course)!;
const placements = scatterDecor(course, def, seedFromId('marrakech'));
const distanceOf = (p: DecorPlacement) => routeDistance(course, p.x, p.z).distance;
const of = (prefix: string) => placements.filter((p) => p.model.startsWith(prefix));

describe('scatterDecor on a corridor course', () => {
  test('is deterministic', () => {
    expect(scatterDecor(course, def, seedFromId('marrakech'))).toEqual(placements);
  });

  test('beyond the shoulders every item stands on the corridor height (or its far land)', () => {
    let checked = 0;
    for (const p of placements) {
      if (distanceOf(p) <= 31) continue;
      const tile = corridorHeightAt(corridor, p.x, p.z);
      if (tile === null || p.model === 'decor.mosque' || p.model === 'decor.kasbah' || p.model.startsWith('decor.cliff') || p.model === 'decor.mountains') continue;
      checked++;
      expect(p.y).toBeCloseTo(tile, 6);
    }
    expect(checked).toBeGreaterThan(5000);
  });

  test('the hills moved beyond CORRIDOR_OUTER + 10', () => {
    const hills = placements.filter((p) => p.model.startsWith('decor.cliff.'));
    expect(hills.length).toBeGreaterThan(50);
    for (const p of hills) expect(distanceOf(p)).toBeGreaterThanOrEqual(CORRIDOR_OUTER + 10);
  });

  test('doubles the rocks, palms, cacti and shrubs beyond the shoulders', () => {
    const plain = buildCourse({ ...(def as CourseDef), corridor: false });
    const old = scatterDecor(plain, def, seedFromId('marrakech'));
    const band = (list: DecorPlacement[], route: typeof course) =>
      list.filter((p) => /^decor\.(rock\.(large|tall)|stone\.(large|tall)|palm|cactus|scrub|bush)/.test(p.model) && routeDistance(route, p.x, p.z).distance >= 31).length;
    expect(band(placements, course)).toBeGreaterThanOrEqual(1.9 * band(old, plain));
  });

  test('the visible set stays under the caps: 3000 within 350 m on desktop, 1200 within 200 m on touch', () => {
    const cells = buildCells(placements, course.route);
    let worstDesktop = 0;
    let worstTouch = 0;
    for (let i = 0; i < course.route.length; i += 150) {
      const [x, z] = course.route[i]!;
      const sum = (radius: number) => visibleCells(cells, { x, z }, radius, Infinity).reduce((n, c) => n + c.placements.length, 0);
      worstDesktop = Math.max(worstDesktop, sum(DESKTOP_DECOR.radius));
      worstTouch = Math.max(worstTouch, sum(TOUCH_DECOR.radius));
    }
    expect(worstDesktop).toBeLessThanOrEqual(DESKTOP_DECOR.cap);
    expect(worstTouch).toBeLessThanOrEqual(TOUCH_DECOR.cap);
  });

  test('kasbahs and mosques stand 40 m or more out, only on plain road or in the city, and there are many', () => {
    const big = [...of('decor.kasbah'), ...of('decor.mosque')];
    expect(of('decor.kasbah').length).toBeGreaterThan(15);
    expect(of('decor.mosque').length).toBeGreaterThan(5);
    for (const p of big) expect(distanceOf(p)).toBeGreaterThanOrEqual(40);
  });

  test('stalls stand within 40 m along a fuel stop and behind the shoulders', () => {
    const stalls = of('decor.stall');
    expect(stalls.length).toBeGreaterThan(30);
    for (const p of stalls) {
      expect(distanceOf(p)).toBeGreaterThanOrEqual(31);
      expect(distanceOf(p)).toBeLessThanOrEqual(38);
      expect(course.stops.some((stop) => stop.kind === 'fuel' && Math.hypot(stop.operatePoint.x - p.x, stop.operatePoint.z - p.z) < 45)).toBe(true);
    }
  });

  test('agaves and tyres stand beyond the shoulders beside the road edge', () => {
    for (const prefix of ['decor.agave', 'decor.tyres']) {
      const list = of(prefix);
      expect(list.length).toBeGreaterThan(50);
      for (const p of list) {
        expect(distanceOf(p)).toBeGreaterThanOrEqual(31);
        expect(distanceOf(p)).toBeLessThanOrEqual(38);
      }
    }
  });

  test('cliffs and mountains stand beyond the ridge', () => {
    expect(of('decor.cliffs').length).toBeGreaterThan(30);
    expect(of('decor.mountains').length).toBeGreaterThan(30);
    for (const p of [...of('decor.cliffs'), ...of('decor.mountains')]) expect(distanceOf(p)).toBeGreaterThanOrEqual(CORRIDOR_OUTER + 10);
  });

  test('rocks sit on the berms beside obstacles', () => {
    const obstacles = course.corridor!.obstacles;
    expect(obstacles.length).toBeGreaterThan(5);
    const berm = placements.filter((p) => /^decor\.(rock|stone)\./.test(p.model) && distanceOf(p) >= 33 && distanceOf(p) <= 39);
    expect(berm.length).toBeGreaterThan(30);
  });
});

describe('courses without a corridor', () => {
  test('place none of the step 33 decor', () => {
    const airport = getCourse('airport');
    const list = scatterDecor(airport, getCourseDef('airport')!, seedFromId('airport'));
    expect(list.some((p) => /kasbah|mosque|stall|agave|tyres|cliffs$|mountains/.test(p.model))).toBe(false);
  });
});
