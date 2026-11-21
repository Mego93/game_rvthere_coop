import { CHARACTER_IDS, getCourse, type Box } from '@lodgy/shared';
import { describe, expect, it } from 'vitest';
import { COUCH_Z, OLIVES, PALMS, PLACEMENTS, VILLA_COURT, VILLA_POOL, seatFor } from './villaLayout';

const villa = getCourse('villa');
const walls = villa.walls as readonly Box[];
const inside = (box: Box, x: number, z: number, margin = 0) => Math.abs(x - box.center.x) <= box.halfExtents.x + margin && Math.abs(z - box.center.z) <= box.halfExtents.z + margin;

describe('villa layout', () => {
  it('stays inside the grounds and clear of every wall', () => {
    const points = [...PLACEMENTS.map((p) => ({ name: p.key, x: p.x, z: p.z })), ...OLIVES.map((p) => ({ name: 'olive', x: p.x, z: p.z })), ...PALMS.map((p) => ({ name: p.key, x: p.x, z: p.z }))];
    for (const point of points) {
      expect(Math.abs(point.x), `${point.name} ${point.x},${point.z}`).toBeLessThan(40);
      expect(point.z, `${point.name} ${point.x},${point.z}`).toBeGreaterThan(-30);
      expect(point.z, `${point.name} ${point.x},${point.z}`).toBeLessThan(40);
      if (point.z > 30 || point.name.startsWith('villa.atm') || point.name.startsWith('villa.kiosk')) continue;
      for (const wall of walls) expect(inside(wall, point.x, point.z, 0.2), `${point.name} ${point.x},${point.z} in a wall`).toBe(false);
    }
  });

  it('puts a couch piece, a bed and a laptop on every spot of those kinds', () => {
    for (const kind of ['couch', 'bed', 'laptop'] as const) {
      const spots = villa.spots!.filter((spot) => spot.kind === kind);
      expect(spots).toHaveLength(6);
      const key = kind === 'couch' ? 'villa.couch' : kind === 'bed' ? 'villa.bed' : 'villa.laptop';
      const placed = PLACEMENTS.filter((p) => p.key === key);
      expect(placed).toHaveLength(6);
      for (const spot of spots) expect(placed.some((p) => Math.abs(p.x - spot.pos.x) < 0.01), `${spot.id}`).toBe(true);
    }
  });

  it('seats each friend on the couch spot with his index in the cast', () => {
    const couch = villa.spots!.filter((spot) => spot.kind === 'couch');
    CHARACTER_IDS.forEach((id, index) => {
      const seat = seatFor(id, CHARACTER_IDS);
      expect(seat.x).toBeCloseTo(couch[index]!.pos.x);
      expect(Math.abs(seat.z - couch[index]!.pos.z)).toBeLessThan(1);
    });
    expect(COUCH_Z).toBeLessThan(couch[0]!.pos.z + 1);
  });

  it('stretches the court onto the pickleball court box and keeps the pool inside its hole', () => {
    const court = PLACEMENTS.find((p) => p.key === 'villa.court')!;
    expect([court.size.x, court.size.z]).toEqual([VILLA_COURT.x1 - VILLA_COURT.x0, VILLA_COURT.z1 - VILLA_COURT.z0]);
    const hole = villa.ground.find((box) => box.center.y < -1);
    expect(hole).toBeDefined();
    expect(hole!.center.x).toBeCloseTo((VILLA_POOL.x0 + VILLA_POOL.x1) / 2);
  });

  it('adds both olive trees and palms', () => {
    expect(OLIVES.length).toBeGreaterThanOrEqual(8);
    expect(PALMS.length).toBeGreaterThanOrEqual(4);
  });
});
