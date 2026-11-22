import { getCourse, type Box } from '@lodgy/shared';
import { describe, expect, it } from 'vitest';
import { CAMELS, CAMP, CUSHION, OUTSIDE, RUG, TABLE, cushions } from './campLayout';

const camp = getCourse('camp');
const table = camp.spots!.find((spot) => spot.id === 'camp-table')!;
const inside = (box: Box, x: number, z: number, margin = 0) => Math.abs(x - box.center.x) <= box.halfExtents.x + margin && Math.abs(z - box.center.z) <= box.halfExtents.z + margin;

describe('camp layout', () => {
  it('is dressed on the camp course: the table is on its kitchen spot and the tent on its walls', () => {
    expect(TABLE.x).toBeCloseTo(table.pos.x);
    expect(TABLE.z).toBeCloseTo(table.pos.z);
    expect(RUG.x).toBeCloseTo(TABLE.x);
    const walls = camp.walls;
    // The tent's four walls are in the course at the tent's edges.
    const north = walls.find((box) => Math.abs(box.center.z - CAMP.tent.z0) < 0.01 && box.halfExtents.x > 7);
    expect(north).toBeDefined();
    expect(north!.center.y + north!.halfExtents.y).toBeCloseTo(CAMP.wall);
    // The door gap is where the course leaves it open.
    for (const x of [CAMP.door.x0 + 0.1, CAMP.door.x1 - 0.1]) expect(walls.some((box) => inside(box, x, CAMP.tent.z1, 0)), `door at ${x}`).toBe(false);
  });

  it('puts six cushions round the table, facing it, clear of each other and of the table', () => {
    const list = cushions();
    expect(list).toHaveLength(CUSHION.count);
    for (const cushion of list) {
      const distance = Math.hypot(cushion.x - TABLE.x, cushion.z - TABLE.z);
      expect(distance).toBeCloseTo(CUSHION.radius, 5);
      expect(distance - CUSHION.size / 2).toBeGreaterThan(TABLE.diameter / 2 - 0.2);
      // Inside the table's use radius, so a friend on the spot is next to every cushion.
      expect(distance).toBeLessThan(table.radius);
      // Its front (-z turned by yaw) points at the table.
      const front = { x: -Math.sin(cushion.yaw), z: -Math.cos(cushion.yaw) };
      const toTable = { x: (TABLE.x - cushion.x) / distance, z: (TABLE.z - cushion.z) / distance };
      expect(front.x * toTable.x + front.z * toTable.z).toBeGreaterThan(0.99);
    }
    list.forEach((a, i) => list.slice(i + 1).forEach((b) => expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(CUSHION.size)));
    for (const cushion of list) for (const wall of camp.walls) expect(inside(wall, cushion.x, cushion.z, CUSHION.size / 2), 'cushion in a wall').toBe(false);
  });

  it('keeps the camels inside the fence, outside the tent and off the lane between the door and the buggy', () => {
    expect(CAMELS.length).toBeGreaterThanOrEqual(2);
    for (const camel of CAMELS) {
      expect(Math.abs(camel.x)).toBeLessThan(CAMP.half.x - 2);
      expect(Math.abs(camel.z)).toBeLessThan(CAMP.half.z - 2);
      expect(camel.x > CAMP.tent.x0 - 2 && camel.x < CAMP.tent.x1 + 2 && camel.z > CAMP.tent.z0 - 2 && camel.z < CAMP.tent.z1 + 2).toBe(false);
      // The buggy is parked at (0, 8): the camels are more than 8 m away from it.
      expect(Math.hypot(camel.x, camel.z - 8)).toBeGreaterThan(8);
    }
  });

  it('stands the palms and rocks outside the fence', () => {
    for (const item of OUTSIDE) expect(Math.abs(item.x) > CAMP.half.x + 2 || Math.abs(item.z) > CAMP.half.z + 2, `${item.key} ${item.x},${item.z}`).toBe(true);
  });
});
