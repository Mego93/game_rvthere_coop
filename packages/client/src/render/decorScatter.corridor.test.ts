import { createHash } from 'node:crypto';
import { buildCourse, CORRIDOR_OUTER, corridorHeightAt, corridorOf, getCourse, getCourseDef, routeFrame, segmentRanges, type CourseDef } from '@lodgy/shared';
import { describe, expect, test } from 'vitest';
import { buildCells, DESKTOP_DECOR, TOUCH_DECOR, visibleCells } from './decorChunks';
import { scatterDecor, seedFromId, type DecorPlacement } from './decorScatter';
import { farMeshHeight, routeDistance } from './terrain';

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

  test('the caps: desktop never needs one; on touch the doubled band can pass 1200 at the densest places, and the cap then drops only cells farther than 30 m', () => {
    const cells = buildCells(placements, course.route);
    let worstDesktop = 0;
    let overTouch = 0;
    for (let i = 0; i < course.route.length; i += 20) {
      const [x, z] = course.route[i]!;
      const all = (radius: number) => visibleCells(cells, { x, z }, radius, Infinity);
      worstDesktop = Math.max(worstDesktop, all(DESKTOP_DECOR.radius).reduce((n, c) => n + c.placements.length, 0));
      const touch = all(TOUCH_DECOR.radius);
      if (touch.reduce((n, c) => n + c.placements.length, 0) <= TOUCH_DECOR.cap) continue;
      overTouch++;
      const kept = new Set(visibleCells(cells, { x, z }, TOUCH_DECOR.radius, TOUCH_DECOR.cap));
      const nearDistance = (cell: (typeof touch)[number]) => Math.hypot(Math.max(cell.minX - x, 0, x - cell.maxX), Math.max(cell.minZ - z, 0, z - cell.maxZ));
      for (const cell of touch) if (nearDistance(cell) <= 30) expect(kept.has(cell)).toBe(true);
    }
    expect(worstDesktop).toBeLessThanOrEqual(DESKTOP_DECOR.cap);
    expect(overTouch).toBeLessThan(course.route.length / 20 / 4);
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

describe('the corridor decor is placed with some sense', () => {
  const frame = routeFrame(course);
  const alongOf = (p: DecorPlacement) => frame.nearest(p.x, p.z).along;

  test('kasbahs and mosques stand on plain road or in the city stretch, never beside sand, pits, the alley, the ford or roadworks', () => {
    const special = segmentRanges(def).filter((r) => r.type !== 'road');
    const cityFrom = frame.total - 600;
    for (const p of [...of('decor.kasbah'), ...of('decor.mosque')]) {
      const along = alongOf(p);
      for (const r of special) if (along < cityFrom) expect(along < r.from - 30 || along > r.to + 30).toBe(true);
    }
  });

  test('kasbahs and mosques never overlap each other', () => {
    const big = [...of('decor.kasbah'), ...of('decor.mosque')];
    for (let i = 0; i < big.length; i++) {
      for (let j = i + 1; j < big.length; j++) expect(Math.hypot(big[i]!.x - big[j]!.x, big[i]!.z - big[j]!.z)).toBeGreaterThan(14);
    }
  });

  test('every kasbah and mosque lies behind the shoulders and its base is on the land (within 4 m of the corridor)', () => {
    for (const p of [...of('decor.kasbah'), ...of('decor.mosque')]) {
      expect(distanceOf(p)).toBeGreaterThanOrEqual(48);
      const land = corridorHeightAt(corridor, p.x, p.z);
      if (land !== null) expect(Math.abs(p.y - land)).toBeLessThan(4);
    }
  });

  test('cliffs and mountains stand on the drawn land, tile or far mesh', () => {
    for (const p of [...of('decor.cliffs'), ...of('decor.mountains')]) {
      const land = corridorHeightAt(corridor, p.x, p.z) ?? farMeshHeight(course, p.x, p.z);
      expect(p.y).toBeLessThanOrEqual(land + 1e-6);
      expect(p.y).toBeGreaterThan(land - 20);
    }
  });

  test('hills clear the ridge by their own half size', () => {
    for (const p of placements.filter((q) => q.model.startsWith('decor.cliff.'))) expect(distanceOf(p)).toBeGreaterThanOrEqual(CORRIDOR_OUTER + 10);
  });
});

// The scatter of the courses without a corridor must not change: these hashes are of the output of 4daded2.
const hash = (list: DecorPlacement[]) => createHash('sha256').update(JSON.stringify(list.map((p) => [p.model, p.x, p.y, p.z, p.yaw, p.scale]))).digest('hex');
describe('courses without a corridor keep their scatter', () => {
  test.each([
    ['airport', 'd5f0c65f2b4d40b9ca62490cff57e9026279f9dac76061860633d27ab8ca88c9'],
    ['segment-demo', '920c8e86ec79d609433d9e2c59fbcfc9407105ac155045f3baf7915a95989f42'],
  ])('%s', (id, expected) => {
    expect(hash(scatterDecor(getCourse(id), getCourseDef(id), seedFromId(id)))).toBe(expected);
  });
});

describe('courses without a corridor', () => {
  test('place none of the step 33 decor', () => {
    const airport = getCourse('airport');
    const list = scatterDecor(airport, getCourseDef('airport')!, seedFromId('airport'));
    expect(list.some((p) => /kasbah|mosque|stall|agave|tyres|cliffs$|mountains/.test(p.model))).toBe(false);
  });
});
