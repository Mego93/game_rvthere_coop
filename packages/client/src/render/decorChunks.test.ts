import { getCourse, getCourseDef } from '@lodgy/shared';
import { describe, expect, test } from 'vitest';
import { buildCells, CELL_LENGTH, DESKTOP_DECOR, SOFTWARE_DECOR, TOUCH_DECOR, visibleCells, type DecorCell } from './decorChunks';
import { scatterDecor, seedFromId, type DecorPlacement } from './decorScatter';

const at = (x: number, z: number): DecorPlacement => ({ model: 'decor.scrub', x, y: 0, z, yaw: 0, scale: 1 });

// A cell holding `count` placements at (x, z).
const cell = (id: number, x: number, z: number, count: number): DecorCell => ({ id, minX: x - 10, maxX: x + 10, minZ: z - 10, maxZ: z + 10, placements: Array.from({ length: count }, () => at(x, z)) });

describe('visibleCells', () => {
  const row = Array.from({ length: 10 }, (_, i) => cell(i, i * 100, 0, 50));

  test('returns only cells within the radius, in id order', () => {
    const seen = visibleCells(row, { x: 0, z: 0 }, 250);
    expect(seen.map((c) => c.id)).toEqual([0, 1, 2]);
    expect(visibleCells(row, { x: 450, z: 0 }, 120).map((c) => c.id)).toEqual([4, 5]);
    expect(visibleCells(row, { x: 0, z: 5000 }, 350)).toEqual([]);
  });

  test('uses the nearest edge of a cell, not its centre', () => {
    expect(visibleCells([cell(0, 100, 0, 1)], { x: 0, z: 0 }, 91).length).toBe(1);
    expect(visibleCells([cell(0, 100, 0, 1)], { x: 0, z: 0 }, 89).length).toBe(0);
  });

  test('over the cap the farthest cells go first', () => {
    const seen = visibleCells(row, { x: 450, z: 0 }, 1000, 150);
    expect(seen.map((c) => c.id)).toEqual([3, 4, 5]);
    expect(seen.reduce((sum, c) => sum + c.placements.length, 0)).toBeLessThanOrEqual(150);
  });

  test('the limits: desktop 350 m and 3000, touch 200 m and 1200', () => {
    expect(DESKTOP_DECOR).toEqual({ radius: 350, cap: 3000 });
    expect(TOUCH_DECOR).toEqual({ radius: 200, cap: 1200 });
    expect(SOFTWARE_DECOR.radius).toBeLessThan(TOUCH_DECOR.radius);
    expect(SOFTWARE_DECOR.cap).toBeLessThan(TOUCH_DECOR.cap);
    const dense = Array.from({ length: 12 }, (_, i) => cell(i, i * 10, 0, 400));
    expect(visibleCells(dense, { x: 0, z: 0 }, DESKTOP_DECOR.radius, DESKTOP_DECOR.cap).reduce((sum, c) => sum + c.placements.length, 0)).toBeLessThanOrEqual(3000);
    expect(visibleCells(dense, { x: 0, z: 0 }, TOUCH_DECOR.radius, TOUCH_DECOR.cap).reduce((sum, c) => sum + c.placements.length, 0)).toBeLessThanOrEqual(1200);
  });
});

describe('buildCells', () => {
  test('groups every placement into 100 m cells along the route', () => {
    const course = getCourse('airport');
    const placements = scatterDecor(course, getCourseDef('airport'), seedFromId('airport'));
    const cells = buildCells(placements, course.route);
    expect(cells.reduce((sum, c) => sum + c.placements.length, 0)).toBe(placements.length);
    expect(cells.length).toBeGreaterThan(20);
    expect(cells.length).toBeLessThanOrEqual(Math.ceil(2600 / CELL_LENGTH) + 1);
    expect(cells.map((c) => c.id)).toEqual([...cells.map((c) => c.id)].sort((a, b) => a - b));
    for (const c of cells) for (const p of c.placements) expect(p.x >= c.minX && p.x <= c.maxX && p.z >= c.minZ && p.z <= c.maxZ).toBe(true);
  });
});
