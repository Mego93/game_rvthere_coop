import { describe, expect, test } from 'vitest';
import { BRIDGE_ABUTMENT, BRIDGE_BANK_RUN, BRIDGE_RAIL_HEIGHT, BRIDGE_RAIL_THICKNESS, BRIDGE_RAVINE_DEPTH, CORRIDOR_CELL, PLAYER_STEP_HEIGHT, ROAD_WIDTH } from '../constants';
import { buildCorridor, corridorHeightAt, corridorOf, routeFrame } from '../corridor';
import { surfaceYAt } from '../surfaceHeight';
import { buildSegment, type SegmentDef } from '../segments';
import { buildCourse } from './build';
import { getCourse } from './index';
import { DEEP_PIT } from './terrain';

const bridge = (length: number, extra: object = {}): SegmentDef => ({ type: 'bridge', length, ...extra }) as SegmentDef;

describe('the bridge segment', () => {
  test('railings are wall boxes on both sides, taller than the player step, along the whole deck', () => {
    expect(BRIDGE_RAIL_HEIGHT).toBeGreaterThan(PLAYER_STEP_HEIGHT);
    const local = buildSegment(bridge(60));
    expect(local.route[local.route.length - 1]![1]).toBeCloseTo(-60, 6);
    for (const side of [-1, 1]) {
      const rails = local.walls.filter((w) => Math.sign(w.center.x) === side);
      expect(rails.length).toBeGreaterThan(0);
      for (const w of rails) {
        expect(Math.abs(w.center.x)).toBeCloseTo(ROAD_WIDTH / 2 + BRIDGE_RAIL_THICKNESS / 2, 6);
        expect(w.halfExtents.x).toBeCloseTo(BRIDGE_RAIL_THICKNESS / 2, 6);
        expect(w.halfExtents.y).toBeCloseTo(BRIDGE_RAIL_HEIGHT / 2, 6);
        expect(w.center.y).toBeCloseTo(BRIDGE_RAIL_HEIGHT / 2, 6);
      }
      const reach = rails.map((w) => [w.center.z - w.halfExtents.z, w.center.z + w.halfExtents.z]);
      expect(Math.min(...reach.map((r) => r[0]!))).toBeLessThanOrEqual(-60);
      expect(Math.max(...reach.map((r) => r[1]!))).toBeGreaterThanOrEqual(0);
    }
  });

  test('a broken bridge has the deep pit profile, six boulders, and rails over the pit', () => {
    const local = buildSegment(bridge(80, { broken: true }));
    const lowest = Math.min(...local.ground.map((g) => g.center.y + g.halfExtents.y));
    expect(lowest).toBeLessThan(-DEEP_PIT.depth + 0.5);
    expect(local.anchors).toHaveLength(6);
    expect(local.anchors.every((a) => a.kind === 'boulder')).toBe(true);
    expect(local.route[local.route.length - 1]![1]).toBeCloseTo(-80, 3);
    for (const side of [-1, 1]) {
      const rails = local.walls.filter((w) => Math.sign(w.center.x) === side);
      expect(Math.min(...rails.map((w) => w.center.y))).toBeLessThan(-1);
      const reach = rails.map((w) => [w.center.z - w.halfExtents.z, w.center.z + w.halfExtents.z]);
      expect(Math.min(...reach.map((r) => r[0]!))).toBeLessThanOrEqual(-80 + 0.1);
    }
  });

  test('a stop, mud, rocks or bumps on a bridge throw, and so does a bridge that is too short', () => {
    expect(() => buildSegment(bridge(60, { stop: { kind: 'fuel', side: 1, along: 30 } }))).toThrow();
    expect(() => buildSegment(bridge(60, { hazards: [{ kind: 'mud', along: 20, length: 12 }] }))).toThrow();
    expect(() => buildSegment(bridge(60, { hazards: [{ kind: 'rocks', along: 20, side: 1 }] }))).toThrow();
    expect(() => buildSegment(bridge(60, { bumps: 3 }))).toThrow();
    expect(() => buildSegment(bridge(20))).toThrow();
  });

  test('pickups and coins are allowed', () => {
    const local = buildSegment(bridge(60, { coins: [{ along: 30, lateral: 0 }], pickups: [{ kind: 'toolbox', along: 10, lateral: 2 }] }));
    expect(local.coins).toHaveLength(1);
    expect(local.pickups).toHaveLength(1);
  });
});

const road = (length: number): SegmentDef => ({ type: 'road', length });
const small = () => buildCourse({ id: 'bridge-test', segments: [road(80), bridge(60), road(40), bridge(80, { broken: true }), road(80)], targetTime: 100, corridor: true });

describe('ravines on the built course', () => {
  test('each bridge marks its along range', () => {
    const course = small();
    expect(course.ravines).toHaveLength(2);
    expect(course.ravines[0]!.from).toBeCloseTo(80, 3);
    expect(course.ravines[0]!.to).toBeCloseTo(140, 3);
    expect(course.ravines[1]!.from).toBeCloseTo(180, 3);
    expect(course.ravines[1]!.to).toBeCloseTo(260, 3);
    expect(buildCourse({ id: 'none', segments: [road(80), road(40)], targetTime: 1 }).ravines).toEqual([]);
  });
});

describe('the land under a bridge', () => {
  const course = small();
  const corridor = corridorOf(course)!;
  const frame = routeFrame(course);
  const at = (along: number, lateral: number) => {
    const c = frame.pointAt(along);
    return { x: c.x - c.tz * lateral, z: c.z + c.tx * lateral, y: frame.heightAtAlong(along) };
  };

  test('is at least the ravine depth minus 0.5 m under the route, across the whole width, except at the abutments', () => {
    for (const r of course.ravines) {
      for (let along = r.from + BRIDGE_ABUTMENT + BRIDGE_BANK_RUN + CORRIDOR_CELL; along <= r.to - BRIDGE_ABUTMENT - BRIDGE_BANK_RUN - CORRIDOR_CELL; along += 2) {
        for (const lateral of [0, 4, -4, 12, -12, 25, -25]) {
          const p = at(along, lateral);
          const h = corridorHeightAt(corridor, p.x, p.z);
          if (h === null) continue;
          expect(h, `along ${along} lateral ${lateral}`).toBeLessThanOrEqual(p.y - (BRIDGE_RAVINE_DEPTH - 0.5));
        }
      }
    }
  });

  test('is not sunk at the abutments, and the banks are at most 35 degrees', () => {
    const r = course.ravines[0]!;
    for (const along of [r.from + 1, r.from + BRIDGE_ABUTMENT - 1, r.to - BRIDGE_ABUTMENT + 1, r.to - 1]) {
      const p = at(along, 0);
      const top = surfaceYAt(course, p.x, p.z)!;
      const h = corridorHeightAt(corridor, p.x, p.z)!;
      expect(h, `along ${along}`).toBeGreaterThan(top - 0.5);
      expect(h).toBeLessThanOrEqual(top - 0.04 + 1e-3);
    }
    let steepest = 0;
    for (let along = r.from; along < r.to - 0.5; along += 0.5) {
      const a = at(along, 30);
      const b = at(along + 0.5, 30);
      steepest = Math.max(steepest, Math.abs(corridorHeightAt(corridor, b.x, b.z)! - corridorHeightAt(corridor, a.x, a.z)!) / 0.5);
    }
    expect(Math.atan(steepest) * (180 / Math.PI)).toBeLessThanOrEqual(35);
  });

  test('stays under the road everywhere on the deck (the T3 margin)', () => {
    for (const r of course.ravines) {
      for (let along = r.from; along <= r.to; along += 1) {
        for (const lateral of [0, ROAD_WIDTH / 2 - 0.5, -(ROAD_WIDTH / 2 - 0.5)]) {
          const p = at(along, lateral);
          const top = surfaceYAt(course, p.x, p.z);
          const h = corridorHeightAt(corridor, p.x, p.z);
          if (top === null || h === null) continue;
          expect(h, `along ${along} lateral ${lateral}`).toBeLessThanOrEqual(top - 0.04 + 1e-3);
        }
      }
    }
  });

  test('buildCorridor matches the cached corridor', () => {
    expect(buildCorridor(course).tiles).toHaveLength(corridor.tiles.length);
  });
});

describe('the kill plane under a ravine', () => {
  test('sits under the ravine floor of the valley', () => {
    const valley = getCourse('valley');
    const corridor = corridorOf(valley)!;
    expect(valley.ravines.length).toBeGreaterThan(0);
    expect(valley.killPlaneY).toBeLessThan(corridor.minY - 5);
  });
});
