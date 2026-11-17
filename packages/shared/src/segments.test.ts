import { describe, expect, test } from 'vitest';
import {
  ROADBLOCK_LATERAL,
  ALLEY_CLUTTER_SPACING,
  ALLEY_WALL_HEIGHT,
  ALLEY_WIDTH,
  BANK_APPROACH,
  BANK_TOP,
  COIN_HEIGHT,
  CRATE_WALL_LATERALS,
  FENCE_HEIGHT,
  GATES_OFFSET,
  GATES_SPACING,
  ROADBLOCK_FENCE_HALF,
  FORD_ROCK,
  PLAYER_HEIGHT,
  PIT_ANCHOR_FIRST_ALONG,
  PIT_ANCHOR_PAIR_SPACING,
  PIT_APPROACH,
  PIT_EXIT,
  PLAYER_OVERLAP_LIFT,
  PLAYER_RADIUS,
  PROP_KINDS,
  ROADWORKS_ROW_SPACING,
  ROAD_JOINT_OVERLAP,
  ROAD_PIECE_LENGTH,
  ROAD_WIDTH,
  SHOULDER_WIDTH,
  SAND_APRON,
  SEGMENT_MIN_LENGTH,
  SEGMENT_SPAWN_INSET,
  STOP_PAD,
  STOP_PAD_LIFT,
  STOP_ZONE,
  WALL_THICKNESS,
  WINCH_MAX_LENGTH,
} from './constants';
import { buildCourse } from './courses/build';
import type { BuiltCourse, GroundBox } from './course';
import { distanceToBox } from './seats';
import { VEHICLES } from './vehicles';
import { groundHeightAt } from './groundProbe';
import { add, degToRad, rotate, vec3, type Quat, type Vec3 } from './math';
import { buildSegment, offsetFrom, yawQuat, type LocalSegment, type SegmentDef } from './segments';

const LATERALS = [-1, -0.5, 0, 0.5, 1].map((f) => f * (ROAD_WIDTH / 2 - 0.5));

function routeLength(seg: LocalSegment): number {
  let total = 0;
  for (let i = 1; i < seg.route.length; i++) total += Math.hypot(seg.route[i]![0] - seg.route[i - 1]![0], seg.route[i]![1] - seg.route[i - 1]![1]);
  return total;
}

function slopeOf(def: SegmentDef): number {
  return def.type === 'road' ? degToRad(def.slope ?? 0) : 0;
}

const road = (length: number, extra: Partial<Extract<SegmentDef, { type: 'road' }>> = {}): SegmentDef => ({ type: 'road', length, ...extra });

// Chord of a polygonal arc of n pieces of side s turning `curve` in total.
function arcExit(length: number, n: number, curve: number) {
  const chord = ((length / n) * Math.sin(curve / 2)) / Math.sin(curve / (2 * n));
  return vec3(-chord * Math.sin(curve / 2), 0, -chord * Math.cos(curve / 2));
}

const CASES: [string, SegmentDef][] = [
  ['straight', road(40)],
  ['short straight', road(15)],
  ['curved left', road(90, { curve: Math.PI / 2 })],
  ['curved right', road(90, { curve: -Math.PI / 2 })],
  ['climbing', road(40, { slope: 8 })],
  ['descending', road(40, { slope: -8 })],
  ['long odd length', road(33.3, { slope: 5 })],
];

describe('B1 exit pose', () => {
  test('straight road exits straight ahead at yaw 0', () => {
    const seg = buildSegment(road(40));
    expect(seg.exit.pos.x).toBeCloseTo(0, 9);
    expect(seg.exit.pos.y).toBeCloseTo(0, 9);
    expect(seg.exit.pos.z).toBeCloseTo(-40, 9);
    expect(seg.exit.yaw).toBe(0);
  });

  test.each([8, -8])('sloped road (%d degrees) rises along the surface length', (deg) => {
    const seg = buildSegment(road(40, { slope: deg }));
    expect(seg.exit.pos.y).toBeCloseTo(40 * Math.sin(degToRad(deg)), 9);
    expect(seg.exit.pos.z).toBeCloseTo(-40 * Math.cos(degToRad(deg)), 9);
    expect(seg.exit.pos.x).toBeCloseTo(0, 9);
  });

  test('a pi/2 curve to the left ends at yaw pi/2, toward -X', () => {
    const seg = buildSegment(road(90, { curve: Math.PI / 2 }));
    const expected = arcExit(90, 9, Math.PI / 2);
    expect(seg.exit.yaw).toBe(Math.PI / 2);
    expect(seg.exit.pos.x).toBeCloseTo(expected.x, 9);
    expect(seg.exit.pos.z).toBeCloseTo(expected.z, 9);
    expect(seg.exit.pos.x).toBeLessThan(0);
  });

  test('a pi/2 curve to the right mirrors it', () => {
    const seg = buildSegment(road(90, { curve: -Math.PI / 2 }));
    const expected = arcExit(90, 9, Math.PI / 2);
    expect(seg.exit.yaw).toBe(-Math.PI / 2);
    expect(seg.exit.pos.x).toBeCloseTo(-expected.x, 9);
    expect(seg.exit.pos.z).toBeCloseTo(expected.z, 9);
  });

  test('a tight curve gets more pieces so none turns more than the limit', () => {
    const seg = buildSegment(road(20, { curve: Math.PI }));
    expect(seg.ground.filter((b) => b.halfExtents.x === ROAD_WIDTH / 2)).toHaveLength(18);
    expect(seg.ground).toHaveLength(18 * 3);
  });

  test('the route runs from the entry to the exit', () => {
    const seg = buildSegment(road(90, { curve: Math.PI / 2 }));
    expect(seg.route[0]).toEqual([0, 0]);
    const end = seg.route[seg.route.length - 1]!;
    expect(end[0]).toBeCloseTo(seg.exit.pos.x, 9);
    expect(end[1]).toBeCloseTo(seg.exit.pos.z, 9);
  });
});

describe('B2 and B3 within a road', () => {
  test.each(CASES)('%s: ground under the whole route at the expected height', (_name, def) => {
    const seg = buildSegment(def);
    const tolerance = ROAD_JOINT_OVERLAP * Math.sin(Math.abs(slopeOf(def))) + 0.02;
    for (let along = 0; along <= routeLength(seg) + 1e-9; along += 1) {
      const s = seg.surfaceAt(Math.min(along, routeLength(seg)));
      for (const lateral of LATERALS) {
        const p = offsetFrom(s, lateral);
        const h = groundHeightAt(seg.ground, p.x, p.z);
        expect(h, `no ground at along ${along}, lateral ${lateral}`).not.toBeNull();
        expect(Math.abs(h! - s.pos.y)).toBeLessThanOrEqual(tolerance);
      }
    }
  });

  test.each(CASES)('%s: the surface has no steps between pieces', (_name, def) => {
    const seg = buildSegment(def);
    const limit = 0.02 + 0.05 * Math.tan(Math.abs(slopeOf(def)));
    const total = routeLength(seg);
    for (const lateral of [-ROAD_WIDTH / 2 + 0.5, 0, ROAD_WIDTH / 2 - 0.5]) {
      let previous: number | null = null;
      for (let along = 0; along <= total + 1e-9; along += 0.05) {
        const p = offsetFrom(seg.surfaceAt(Math.min(along, total)), lateral);
        const h = groundHeightAt(seg.ground, p.x, p.z);
        expect(h, `no ground at along ${along}, lateral ${lateral}`).not.toBeNull();
        if (previous !== null) expect(Math.abs(h! - previous)).toBeLessThanOrEqual(limit);
        previous = h;
      }
    }
  });

  test('ground boxes are ROAD_WIDTH wide road surface and no piece is longer than the limit plus overlap', () => {
    const seg = buildSegment(road(90, { curve: Math.PI / 2 }));
    const roadBoxes = seg.ground.filter((b) => b.surface === 'road');
    expect(roadBoxes).toHaveLength(seg.ground.length / 3);
    for (const box of roadBoxes) {
      expect(box.halfExtents.x).toBe(ROAD_WIDTH / 2);
      expect(box.halfExtents.z * 2).toBeLessThanOrEqual(ROAD_PIECE_LENGTH + 2 * ROAD_JOINT_OVERLAP + 1e-9);
    }
  });
});

describe('surfaceAt', () => {
  test('along is horizontal along the route; yaw and pitch are those of the piece', () => {
    const seg = buildSegment(road(40, { slope: 8 }));
    const s = seg.surfaceAt(10);
    expect(s.pos.z).toBeCloseTo(-10, 9);
    expect(s.pos.y).toBeCloseTo(10 * Math.tan(degToRad(8)), 9);
    expect(s.pitch).toBeCloseTo(degToRad(8), 12);
    expect(s.yaw).toBe(0);
  });

  test('a point outside the segment throws', () => {
    const seg = buildSegment(road(40));
    expect(() => seg.surfaceAt(-1)).toThrow(RangeError);
    expect(() => seg.surfaceAt(41)).toThrow(RangeError);
  });
});

describe('debris', () => {
  test('crates sit at (n - 0.5)/count of the route after the spawn clearance, alternating left then right at a quarter of the width', () => {
    const seg = buildSegment(road(40, { debris: 4 }));
    expect(seg.props.map((p) => p.id)).toEqual(['crate-1', 'crate-2', 'crate-3', 'crate-4']);
    expect(seg.props.every((p) => p.kind === 'crate')).toBe(true);
    const from = SEGMENT_SPAWN_INSET + VEHICLES.rv.halfExtents.z + PROP_KINDS.crate.halfExtents.z;
    seg.props.forEach((p, i) => expect(p.pose.pos.z).toBeCloseTo(-(from + ((i + 0.5) / 4) * (40 - from)), 9));
    expect(seg.props.map((p) => p.pose.pos.x)).toEqual([-2.5, 2.5, -2.5, 2.5]);
    expect(seg.props.every((p) => p.pose.pos.y === 0)).toBe(true);
  });

  test('crates on a slope stand on the surface', () => {
    const seg = buildSegment(road(40, { slope: 8, debris: 2 }));
    const first = seg.props[0]!;
    const from = SEGMENT_SPAWN_INSET + VEHICLES.rv.halfExtents.z + PROP_KINDS.crate.halfExtents.z;
    const horizontal = 40 * Math.cos(degToRad(8));
    expect(first.pose.pos.y).toBeCloseTo(seg.surfaceAt(from + 0.25 * (horizontal - from)).pos.y, 9);
  });
});

describe('extras', () => {
  test('pickups, anchors and coins land at along, lateral and height; ids count per kind', () => {
    const seg = buildSegment(
      road(40, {
        pickups: [
          { kind: 'jerrycan', along: 10, lateral: 2 },
          { kind: 'jerrycan', along: 20, lateral: -1, height: 0.5 },
        ],
        anchors: [{ kind: 'milestone', along: 30, lateral: -6 }],
        coins: [{ along: 5, lateral: 0 }, { kind: 'bigcoin', along: 6, lateral: 1, height: 2 }],
      }),
    );
    expect(seg.pickups.map((p) => p.id)).toEqual(['jerrycan-1', 'jerrycan-2']);
    expect(seg.pickups[0]!.pose.pos).toEqual(vec3(2, 0, -10));
    expect(seg.pickups[1]!.pose.pos).toEqual(vec3(-1, 0.5, -20));
    expect(seg.anchors[0]).toMatchObject({ id: 'milestone-1', kind: 'milestone' });
    expect(seg.anchors[0]!.pose.pos).toEqual(vec3(-6, 0, -30));
    expect(seg.coins.map((c) => [c.id, c.kind])).toEqual([['coin-1', 'coin'], ['bigcoin-1', 'bigcoin']]);
    expect(seg.coins[0]!.pose.pos).toEqual(vec3(0, COIN_HEIGHT, -5));
    expect(seg.coins[1]!.pose.pos).toEqual(vec3(1, 2, -6));
  });

  test('ids of different lists never clash within a segment', () => {
    const seg = buildSegment(road(40, { debris: 2, pickups: [{ kind: 'crate', along: 10, lateral: 0 }] }));
    const ids = [...seg.props, ...seg.pickups].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('a pickup or an anchor without a kind throws', () => {
    expect(() => buildSegment(road(40, { pickups: [{ along: 10, lateral: 0 }] }))).toThrow(/kind/);
    expect(() => buildSegment(road(40, { anchors: [{ along: 10, lateral: 0 }] }))).toThrow(/kind/);
  });

  test('a placement outside the segment throws', () => {
    expect(() => buildSegment(road(40, { coins: [{ along: 41, lateral: 0 }] }))).toThrow(RangeError);
  });

  test('a stop lays a pad, a zone, an operate point and a counter beside a flat straight road', () => {
    const seg = buildSegment(road(40, { stop: { kind: 'fuel', side: 1, along: 20 } }));
    const pad = seg.ground[seg.ground.length - 1]!;
    expect(pad.halfExtents).toEqual(STOP_PAD);
    expect(pad.center).toEqual(vec3(ROAD_WIDTH / 2 + STOP_PAD.x, -STOP_PAD.y + STOP_PAD_LIFT, -20));
    const stop = seg.stops[0]!;
    expect(stop).toMatchObject({ id: 'stop-1', kind: 'fuel' });
    expect(stop.zone.halfExtents).toEqual(STOP_ZONE);
    expect(stop.zone.center).toEqual(vec3(ROAD_WIDTH / 2 + 0.5 + STOP_ZONE.x, STOP_ZONE.y + STOP_PAD_LIFT, -20));
    expect(stop.operatePoint).toEqual(vec3(ROAD_WIDTH / 2 + 0.5 + 2 * STOP_ZONE.x + 1, STOP_PAD_LIFT, -20));
    expect(stop.shopCounter).toEqual(vec3(stop.operatePoint.x, STOP_PAD_LIFT, -22));
    // The zone rests on the pad and the operate point is on it.
    expect(stop.zone.center.y - STOP_ZONE.y).toBeCloseTo(pad.center.y + pad.halfExtents.y, 12);
    expect(Math.abs(stop.operatePoint.x - pad.center.x)).toBeLessThanOrEqual(pad.halfExtents.x);
  });

  test('a garage on the left has no counter and mirrors to -X', () => {
    const seg = buildSegment(road(40, { stop: { kind: 'garage', side: -1, along: 15 } }));
    const stop = seg.stops[0]!;
    expect(stop.shopCounter).toBeNull();
    expect(stop.zone.center.x).toBe(-(ROAD_WIDTH / 2 + 0.5 + STOP_ZONE.x));
    expect(stop.operatePoint.x).toBeLessThan(0);
  });

  test('a stop whose pad would leave the segment throws', () => {
    expect(() => buildSegment(road(40, { stop: { kind: 'fuel', side: 1, along: STOP_PAD.z - 0.1 } }))).toThrow(/pad/);
    expect(() => buildSegment(road(40, { stop: { kind: 'fuel', side: 1, along: 40 - STOP_PAD.z + 0.1 } }))).toThrow(/pad/);
    expect(() => buildSegment(road(40, { stop: { kind: 'fuel', side: 1, along: STOP_PAD.z } }))).not.toThrow();
  });

  test('a stop on a curved or sloped road throws', () => {
    const stop = { kind: 'fuel', side: 1, along: 20 } as const;
    expect(() => buildSegment(road(90, { curve: Math.PI / 4, stop }))).toThrow(/flat/);
    expect(() => buildSegment(road(40, { slope: 5, stop }))).toThrow(/flat/);
  });
});

describe('validation', () => {
  test('curve and slope together throw', () => {
    expect(() => buildSegment(road(40, { curve: 0.5, slope: 5 }))).toThrow(/curve and slope/);
  });

  test('a route shorter than the minimum throws, measured horizontally', () => {
    expect(() => buildSegment(road(SEGMENT_MIN_LENGTH - 0.1))).toThrow(/at least/);
    expect(() => buildSegment(road(15, { slope: 20 }))).toThrow(/at least/);
    expect(() => buildSegment(road(SEGMENT_MIN_LENGTH))).not.toThrow();
  });

  test('an alley shorter than the minimum throws even with clutter', () => {
    expect(() => buildSegment(alley(SEGMENT_MIN_LENGTH - 1, 1))).toThrow(/at least/);
  });

  test('a non-positive length throws', () => {
    expect(() => buildSegment(road(0))).toThrow();
  });
});

const alley = (length: number, clutter: number): SegmentDef => ({ type: 'alley', length, clutter });
const sand = (length: number, palms: number): SegmentDef => ({ type: 'sand', length, palms });
const ford = (width: number, rocks: number): SegmentDef => ({ type: 'ford', width, rocks });
const bank = (height: number, gradient: number, anchors: number): SegmentDef => ({ type: 'bank', height, gradient, anchors });
const roadworks = (length: number, obstacles: number): SegmentDef => ({ type: 'roadworks', length, obstacles });
const pit = (depth: number, gradient: number, floor: number, anchors: number, gradientOut?: number): SegmentDef => ({ type: 'pit', depth, gradient, floor, anchors, ...(gradientOut === undefined ? {} : { gradientOut }) });
const outOf = (def: Extract<SegmentDef, { type: 'pit' }>): number => def.gradientOut ?? def.gradient;

const NEW_CASES: [string, SegmentDef][] = [
  ['alley, typical', alley(50, 0.6)],
  ['alley, no clutter', alley(30, 0)],
  ['alley, full clutter', alley(60, 1)],
  ['sand, typical', sand(30, 4)],
  ['sand, no palms', sand(20, 0)],
  ['ford, typical', ford(20, 6)],
  ['ford, no rocks', ford(15, 0)],
  ['bank, typical', bank(3, 15, 2)],
  ['bank, 25 degrees', bank(3, 25, 0)],
  ['bank, tall and gentle', bank(6, 10, 3)],
  ['pit, shallow', pit(0.6, 10, 6, 0)],
  ['pit, deep and asymmetric', pit(2, 15, 8, 2, 33)],
  ['pit, symmetric with anchors', pit(2, 25, 8, 3)],
  ['roadworks, one full row', roadworks(24, 3)],
  ['roadworks, partial row', roadworks(40, 4)],
  ['roadworks, two full rows', roadworks(40, 6)],
  ['roadworks, empty', roadworks(30, 0)],
];

// Where the surface is expected to be for the segment: the route's centre line and its height.
function ceilingOf(def: SegmentDef): number {
  return def.type === 'bank' ? def.height : 0;
}

describe('B1 exit pose of the other types', () => {
  test.each([
    ['alley', alley(50, 0.6), 50, 0],
    ['sand', sand(30, 4), SAND_APRON + 30, 0],
    ['ford', ford(20, 6), 20, 0],
    ['roadworks', roadworks(40, 5), 40, 0],
  ] as const)('%s exits straight ahead at yaw 0', (_name, def, z, y) => {
    const seg = buildSegment(def);
    expect(seg.exit.pos.x).toBeCloseTo(0, 9);
    expect(seg.exit.pos.y).toBeCloseTo(y, 9);
    expect(seg.exit.pos.z).toBeCloseTo(-z, 9);
    expect(seg.exit.yaw).toBe(0);
  });

  test.each([
    [3, 15],
    [3, 25],
    [6, 10],
  ])('a bank of %d m at %d degrees exits at its height after approach, ramp and top', (height, gradient) => {
    const seg = buildSegment(bank(height, gradient, 0));
    expect(seg.exit.pos.y).toBeCloseTo(height, 9);
    expect(seg.exit.pos.z).toBeCloseTo(-(BANK_APPROACH + height / Math.tan(degToRad(gradient)) + BANK_TOP), 9);
    expect(seg.exit.yaw).toBe(0);
  });

  test('alley and sand report their widths for the checkpoint', () => {
    expect(buildSegment(alley(30, 0)).width).toBe(ALLEY_WIDTH);
    expect(buildSegment(sand(30, 0)).width).toBe(ROAD_WIDTH);
  });
});

describe('B2 and B3 within the other types', () => {
  test.each(NEW_CASES)('%s: ground under the whole route, no steps', (_name, def) => {
    const seg = buildSegment(def);
    const total = routeLength(seg);
    const half = (seg.width / 2 - 0.5);
    const maxPitch = def.type === 'bank' ? degToRad(def.gradient) : def.type === 'pit' ? degToRad(Math.max(def.gradient, outOf(def))) : 0;
    const tolerance = ROAD_JOINT_OVERLAP * Math.sin(maxPitch) + 0.02;
    for (let along = 0; along <= total + 1e-9; along += 1) {
      const s = seg.surfaceAt(Math.min(along, total));
      for (const f of [-1, -0.5, 0, 0.5, 1]) {
        const p = offsetFrom(s, f * half);
        const h = groundHeightAt(seg.ground, p.x, p.z);
        expect(h, `no ground at along ${along}`).not.toBeNull();
        expect(Math.abs(h! - s.pos.y)).toBeLessThanOrEqual(tolerance);
      }
    }
    const limit = 0.02 + 0.05 * Math.tan(maxPitch);
    for (const lateral of [-half, 0, half]) {
      let previous: number | null = null;
      for (let along = 0; along <= total + 1e-9; along += 0.05) {
        const p = offsetFrom(seg.surfaceAt(Math.min(along, total)), lateral);
        const h = groundHeightAt(seg.ground, p.x, p.z);
        expect(h, `no ground at along ${along}`).not.toBeNull();
        if (previous !== null) expect(Math.abs(h! - previous)).toBeLessThanOrEqual(limit);
        previous = h;
      }
    }
  });

  test.each(NEW_CASES)('%s: the exit rests on the last piece of ground', (_name, def) => {
    const seg = buildSegment(def);
    expect(seg.exit.pos.y).toBeCloseTo(ceilingOf(def), 9);
    const h = groundHeightAt(seg.ground, seg.exit.pos.x, seg.exit.pos.z + 0.01);
    expect(h).not.toBeNull();
    expect(Math.abs(h! - seg.exit.pos.y)).toBeLessThanOrEqual(0.02);
  });

  test('no ground piece is longer than the limit, apart from one sand box and one riverbed', () => {
    for (const def of [alley(50, 0.5), bank(3, 15, 0), pit(2, 15, 8, 0, 33), roadworks(40, 4)]) {
      for (const box of buildSegment(def).ground.filter((b) => b.surface !== 'gravel' || b.halfExtents.x === ROAD_WIDTH / 2)) expect(box.halfExtents.z * 2).toBeLessThanOrEqual(ROAD_PIECE_LENGTH + 1e-9);
    }
    const s = buildSegment(sand(30, 0));
    expect(s.ground.filter((b) => b.surface === 'sand' && b.halfExtents.x === ROAD_WIDTH / 2)).toHaveLength(1);
    expect(buildSegment(ford(20, 0)).ground).toHaveLength(1);
  });
});

// The surface of the ground box that is highest at a point.
function surfaceNameAt(ground: readonly GroundBox[], x: number, z: number): string | null {
  let best: { h: number; surface: string } | null = null;
  for (const box of ground) {
    const h = groundHeightAt([box], x, z);
    if (h !== null && (best === null || h > best.h + 1e-9)) best = { h, surface: box.surface };
  }
  return best?.surface ?? null;
}

describe('surfaces', () => {
  test('sand lies only on the sand part, after the apron', () => {
    const seg = buildSegment(sand(30, 0));
    for (let along = 0.7; along < SAND_APRON + 30; along += 0.5) {
      const p = seg.surfaceAt(Math.min(along, SAND_APRON + 30)).pos;
      if (Math.abs(along - SAND_APRON) < ROAD_JOINT_OVERLAP) continue;
      expect(surfaceNameAt(seg.ground, p.x + 3, p.z), `along ${along}`).toBe(along < SAND_APRON ? 'road' : 'sand');
    }
  });

  test('the spawn of a sand segment is on road (S6)', () => {
    const seg = buildSegment(sand(30, 0));
    const spawn = seg.surfaceAt(8).pos;
    expect(SAND_APRON).toBeGreaterThan(8);
    expect(surfaceNameAt(seg.ground, spawn.x, spawn.z)).toBe('road');
  });

  test('the ford is all riverbed', () => {
    const seg = buildSegment(ford(20, 0));
    for (let along = 0.5; along < 20; along += 1) expect(surfaceNameAt(seg.ground, 0, -along)).toBe('riverbed');
  });

  test('the bank has road, then gravel on the ramp only, then road', () => {
    const seg = buildSegment(bank(3, 15, 0));
    const rampEnd = BANK_APPROACH + 3 / Math.tan(degToRad(15));
    for (let along = 0.5; along < rampEnd + BANK_TOP; along += 0.5) {
      // Exactly at a join two boxes tie.
      if (Math.abs(along - BANK_APPROACH) < 0.05 || Math.abs(along - rampEnd) < 0.05) continue;
      const p = seg.surfaceAt(along).pos;
      const want = along < BANK_APPROACH ? 'road' : along < rampEnd ? 'gravel' : 'road';
      expect(surfaceNameAt(seg.ground, p.x, p.z), `along ${along}`).toBe(want);
    }
  });
});

// Clutter starts past the RV on the checkpoint spawn, with the largest clutter half length.
const CLUTTER_FROM =
  SEGMENT_SPAWN_INSET + VEHICLES.rv.halfExtents.z + Math.max(...(['crate', 'cart', 'scooter'] as const).map((k) => PROP_KINDS[k].halfExtents.z));

describe('alley', () => {
  test('walls stand on both sides with inner faces at half the alley width', () => {
    const seg = buildSegment(alley(50, 0));
    expect(seg.walls).toHaveLength(2);
    const xs = seg.walls.map((w) => w.center.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-(ALLEY_WIDTH / 2 + WALL_THICKNESS / 2), 9);
    expect(xs[1]).toBeCloseTo(ALLEY_WIDTH / 2 + WALL_THICKNESS / 2, 9);
    for (const w of seg.walls) {
      expect(w.center.y + w.halfExtents.y).toBeCloseTo(ALLEY_WALL_HEIGHT, 9);
      expect(w.center.y - w.halfExtents.y).toBeCloseTo(0, 9);
      expect(w.halfExtents.z * 2).toBeCloseTo(50, 9);
    }
  });

  test('clutter count is floor(clutter * length / spacing)', () => {
    expect(buildSegment(alley(50, 0)).props).toHaveLength(0);
    expect(buildSegment(alley(60, 1)).props).toHaveLength(60 / ALLEY_CLUTTER_SPACING);
    expect(buildSegment(alley(50, 0.6)).props).toHaveLength(Math.floor((0.6 * 50) / ALLEY_CLUTTER_SPACING));
  });

  test('clutter cycles crate, cart, scooter, alternates sides and rests against the wall', () => {
    const seg = buildSegment(alley(60, 1));
    expect(seg.props.map((p) => p.kind).slice(0, 4)).toEqual(['crate', 'cart', 'scooter', 'crate']);
    expect(seg.props.map((p) => p.id).slice(0, 4)).toEqual(['crate-1', 'cart-1', 'scooter-1', 'crate-2']);
    const alongs = new Set<number>();
    seg.props.forEach((p, i) => {
      const half = PROP_KINDS[p.kind as keyof typeof PROP_KINDS].halfExtents;
      const side = i % 2 === 0 ? -1 : 1;
      expect(p.pose.pos.x).toBeCloseTo(side * (ALLEY_WIDTH / 2 - half.x - 0.1), 9);
      expect(p.pose.pos.z).toBeCloseTo(-(CLUTTER_FROM + ((i + 0.5) / seg.props.length) * (60 - CLUTTER_FROM)), 9);
      expect(p.pose.pos.y).toBe(0);
      alongs.add(p.pose.pos.z);
    });
    expect(alongs.size).toBe(seg.props.length);
  });

  test('no clutter stands within the RV and clutter half lengths of the spawn along the route', () => {
    for (const clutter of [0.3, 0.6, 1]) {
      for (const p of buildSegment(alley(40, clutter)).props) {
        const half = PROP_KINDS[p.kind as keyof typeof PROP_KINDS].halfExtents.z;
        expect(-p.pose.pos.z - half).toBeGreaterThanOrEqual(SEGMENT_SPAWN_INSET + VEHICLES.rv.halfExtents.z - 1e-9);
      }
    }
  });

  test('a clutter density outside 0..1 throws', () => {
    expect(() => buildSegment(alley(30, 1.5))).toThrow();
    expect(() => buildSegment(alley(30, -0.1))).toThrow();
  });
});

describe('sand', () => {
  test('palms are anchors outside the road edge, alternating, with no collision', () => {
    const seg = buildSegment(sand(30, 4));
    expect(seg.anchors.map((a) => a.id)).toEqual(['palm-1', 'palm-2', 'palm-3', 'palm-4']);
    expect(seg.anchors.every((a) => a.kind === 'palm')).toBe(true);
    seg.anchors.forEach((a, i) => {
      expect(Math.abs(a.pose.pos.x)).toBeCloseTo(ROAD_WIDTH / 2 + 0.5, 9);
      expect(Math.sign(a.pose.pos.x)).toBe(i % 2 === 0 ? -1 : 1);
      expect(a.pose.pos.z).toBeCloseTo(-((i + 0.5) / 4) * (SAND_APRON + 30), 9);
    });
    expect(seg.walls).toHaveLength(0);
  });

  test('no palms and no props at palms 0', () => {
    const seg = buildSegment(sand(20, 0));
    expect(seg.anchors).toHaveLength(0);
    expect(seg.props).toHaveLength(0);
  });
});

const FORD_ROCKS_FROM = SEGMENT_SPAWN_INSET + VEHICLES.rv.halfExtents.z + FORD_ROCK.z;

describe('ford', () => {
  test('the water decor covers the riverbed at its surface', () => {
    const seg = buildSegment(ford(20, 0));
    expect(seg.decor).toHaveLength(1);
    expect(seg.decor[0]).toMatchObject({ id: 'water-1', kind: 'water' });
    expect(seg.decor[0]!.pose.pos).toEqual(vec3(0, 0, -10));
    expect(seg.decor[0]!.size).toEqual(vec3(ROAD_WIDTH / 2, 0.05, 10));
  });

  test('rocks are walls in the wheel tracks, alternating, resting on the riverbed', () => {
    const seg = buildSegment(ford(20, 6));
    expect(seg.walls).toHaveLength(6);
    seg.walls.forEach((w, i) => {
      expect(w.halfExtents).toEqual(FORD_ROCK);
      expect(w.center.x).toBeCloseTo(i % 2 === 0 ? -1 : 1, 9);
      expect(w.center.y - w.halfExtents.y).toBeCloseTo(0, 9);
      expect(w.center.z).toBeCloseTo(-(FORD_ROCKS_FROM + ((i + 0.5) / 6) * (20 - FORD_ROCK.z - FORD_ROCKS_FROM)), 9);
    });
    expect(seg.props).toHaveLength(0);
  });

  test.each([
    [15, 1],
    [15, 6],
    [20, 6],
    [40, 12],
  ])('a %d m ford with %d rocks keeps them clear of the checkpoint spawn and the RV standing on it', (width, rocks) => {
    const seg = buildSegment(ford(width, rocks));
    expect(seg.walls).toHaveLength(rocks);
    const spawnEnd = SEGMENT_SPAWN_INSET + VEHICLES.rv.halfExtents.z;
    for (const w of seg.walls) {
      expect(-w.center.z - w.halfExtents.z).toBeGreaterThanOrEqual(spawnEnd - 1e-9);
      expect(-w.center.z + w.halfExtents.z).toBeLessThanOrEqual(width + 1e-9);
    }
  });

  test('a ford shorter than the minimum route throws', () => {
    expect(() => buildSegment(ford(SEGMENT_MIN_LENGTH - 1, 0))).toThrow(/at least/);
    expect(() => buildSegment(ford(SEGMENT_MIN_LENGTH - 1, 3))).toThrow(/at least/);
  });
});

describe('bank', () => {
  test('the ramp rises height at the gradient and its surface is as long as height / sin(gradient)', () => {
    const seg = buildSegment(bank(3, 15, 0));
    const ramp = seg.ground.filter((b) => b.surface === 'gravel' && b.halfExtents.x === ROAD_WIDTH / 2);
    const total = ramp.reduce((sum, b) => sum + b.halfExtents.z * 2, 0);
    expect(total).toBeCloseTo(3 / Math.sin(degToRad(15)), 9);
    const top = seg.surfaceAt(BANK_APPROACH + 3 / Math.tan(degToRad(15)) + 1);
    expect(top.pos.y).toBeCloseTo(3, 9);
    expect(top.pitch).toBe(0);
    expect(seg.surfaceAt(BANK_APPROACH + 1).pos.y).toBeGreaterThan(0);
    expect(seg.surfaceAt(BANK_APPROACH + 1).pitch).toBeCloseTo(degToRad(15), 12);
  });

  test('boulders alternate sides near the road edge, 3 m into the top, at the top height', () => {
    const seg = buildSegment(bank(3, 15, 2));
    const topStart = BANK_APPROACH + 3 / Math.tan(degToRad(15));
    expect(seg.anchors.map((a) => [a.id, a.kind])).toEqual([['boulder-1', 'boulder'], ['boulder-2', 'boulder']]);
    expect(seg.anchors[0]!.pose.pos.x).toBeCloseTo(-(ROAD_WIDTH / 2 - 1), 9);
    expect(seg.anchors[1]!.pose.pos.x).toBeCloseTo(ROAD_WIDTH / 2 - 1, 9);
    for (const a of seg.anchors) {
      expect(a.pose.pos.z).toBeCloseTo(-(topStart + 3), 9);
      expect(a.pose.pos.y).toBeCloseTo(3, 9);
    }
  });

  test('more boulders than fit the top throw', () => {
    expect(() => buildSegment(bank(3, 15, 20))).toThrow(/boulders/);
  });

  test('a bad height or gradient throws', () => {
    expect(() => buildSegment(bank(0, 15, 0))).toThrow();
    expect(() => buildSegment(bank(3, 0, 0))).toThrow();
    expect(() => buildSegment(bank(3, 90, 0))).toThrow();
  });
});

describe('pit', () => {
  const deep = pit(2, 15, 8, 2, 33) as Extract<SegmentDef, { type: 'pit' }>;
  const descent = 2 / Math.tan(degToRad(15));
  const climb = 2 / Math.tan(degToRad(33));
  const floorStart = PIT_APPROACH + descent;
  const climbStart = floorStart + 8;
  const exitStart = climbStart + climb;

  test('the surface is at the entry height on the approach, depth below on the floor, back at the entry height on the exit', () => {
    const seg = buildSegment(deep);
    expect(seg.surfaceAt(PIT_APPROACH / 2).pos.y).toBeCloseTo(0, 9);
    expect(seg.surfaceAt(PIT_APPROACH).pos.y).toBeCloseTo(0, 9);
    expect(seg.surfaceAt(floorStart + 4).pos.y).toBeCloseTo(-2, 9);
    expect(seg.surfaceAt(exitStart + 3).pos.y).toBeCloseTo(0, 9);
    expect(seg.exit.pos.y).toBeCloseTo(0, 9);
    expect(seg.exit.pos.z).toBeCloseTo(-(exitStart + PIT_EXIT), 9);
    expect(seg.exit.yaw).toBe(0);
  });

  test('the descent is depth / sin(gradient) long and the climb uses gradientOut; the exit is flat', () => {
    const seg = buildSegment(deep);
    const lengthOf = (from: number, to: number) => seg.ground.filter((b) => b.surface === 'gravel' && b.halfExtents.x === ROAD_WIDTH / 2).filter((b) => b.center.z <= -from && b.center.z >= -to).reduce((sum, b) => sum + b.halfExtents.z * 2, 0);
    expect(lengthOf(PIT_APPROACH, floorStart)).toBeCloseTo(2 / Math.sin(degToRad(15)), 9);
    expect(lengthOf(climbStart, exitStart)).toBeCloseTo(2 / Math.sin(degToRad(33)), 9);
    expect(seg.surfaceAt(PIT_APPROACH + 1).pitch).toBeCloseTo(-degToRad(15), 12);
    expect(seg.surfaceAt(climbStart + 1).pitch).toBeCloseTo(degToRad(33), 12);
    expect(seg.surfaceAt(exitStart + 1).pitch).toBe(0);
    expect(seg.surfaceAt(floorStart + 1).pitch).toBe(0);
  });

  test('without gradientOut the climb mirrors the descent', () => {
    const seg = buildSegment(pit(2, 20, 6, 0));
    expect(seg.exit.pos.z).toBeCloseTo(-(PIT_APPROACH + 2 * (2 / Math.tan(degToRad(20))) + 6 + PIT_EXIT), 9);
  });

  test('surfaceAt is continuous along the whole pit', () => {
    const seg = buildSegment(deep);
    const total = routeLength(seg);
    let previous = seg.surfaceAt(0).pos;
    for (let along = 0.05; along <= total + 1e-9; along += 0.05) {
      const p = seg.surfaceAt(Math.min(along, total)).pos;
      expect(Math.hypot(p.x - previous.x, p.y - previous.y, p.z - previous.z)).toBeLessThanOrEqual(0.05 / Math.cos(degToRad(33)) + 1e-6);
      previous = p;
    }
  });

  test('road on approach, floor and exit; gravel on the two ramps', () => {
    const seg = buildSegment(deep);
    for (let along = 0.5; along < exitStart + PIT_EXIT; along += 0.5) {
      if ([PIT_APPROACH, floorStart, climbStart, exitStart].some((j) => Math.abs(along - j) < 0.3)) continue;
      const p = seg.surfaceAt(along).pos;
      const ramp = (along > PIT_APPROACH && along < floorStart) || (along > climbStart && along < exitStart);
      expect(surfaceNameAt(seg.ground, p.x, p.z), `along ${along}`).toBe(ramp ? 'gravel' : 'road');
    }
  });

  test('boulders alternate sides on the exit flat, 3 m in and 2 m apart per pair, at the entry height, not inside the pit', () => {
    const seg = buildSegment(pit(2, 15, 8, 3, 33));
    expect(seg.anchors.map((a) => [a.id, a.kind])).toEqual([['boulder-1', 'boulder'], ['boulder-2', 'boulder'], ['boulder-3', 'boulder']]);
    expect(seg.anchors.map((a) => a.pose.pos.x)).toEqual([-(ROAD_WIDTH / 2 - 1), ROAD_WIDTH / 2 - 1, -(ROAD_WIDTH / 2 - 1)].map((x) => expect.closeTo(x, 9)));
    expect(seg.anchors.map((a) => -a.pose.pos.z)).toEqual(
      [0, 0, 1].map((pair) => expect.closeTo(exitStart + PIT_ANCHOR_FIRST_ALONG + PIT_ANCHOR_PAIR_SPACING * pair, 9)),
    );
    for (const a of seg.anchors) {
      expect(a.pose.pos.y).toBeCloseTo(0, 9);
      expect(-a.pose.pos.z).toBeGreaterThan(exitStart);
    }
  });

  test('every point from the end of the approach to the exit has a boulder within the winch length', () => {
    const seg = buildSegment(pit(2, 15, 8, 2, 33));
    const total = routeLength(seg);
    for (let along = PIT_APPROACH; along <= total + 1e-9; along += 0.5) {
      const p = seg.surfaceAt(Math.min(along, total)).pos;
      const nearest = Math.min(...seg.anchors.map((a) => Math.hypot(a.pose.pos.x - p.x, a.pose.pos.y - p.y, a.pose.pos.z - p.z)));
      expect(nearest, `along ${along}`).toBeLessThanOrEqual(WINCH_MAX_LENGTH);
    }
  });

  test('a pit with no anchors is allowed; more boulders than fit the exit flat throw', () => {
    expect(buildSegment(pit(0.6, 10, 6, 0)).anchors).toHaveLength(0);
    expect(() => buildSegment(pit(2, 15, 8, 20))).toThrow(/boulders/);
  });

  test('a bad depth, gradient, gradientOut or floor throws; the floor is at least 4 m', () => {
    expect(() => buildSegment(pit(0, 15, 8, 0))).toThrow();
    expect(() => buildSegment(pit(2, 0, 8, 0))).toThrow();
    expect(() => buildSegment(pit(2, 90, 8, 0))).toThrow();
    expect(() => buildSegment(pit(2, 15, 8, 0, 0))).toThrow();
    expect(() => buildSegment(pit(2, 15, 8, 0, 90))).toThrow();
    expect(() => buildSegment(pit(2, 15, 3.9, 0))).toThrow(/floor/);
    expect(() => buildSegment(pit(2, 15, 4, 0))).not.toThrow();
  });

  test('a pit takes no stop', () => {
    expect(() => buildSegment({ ...(pit(2, 15, 8, 0) as object), stop: { kind: 'fuel', side: 1, along: 30 } } as SegmentDef)).toThrow();
  });

  test('the shoulders follow the road, so the pit is a trench the whole width of the ground', () => {
    const seg = buildSegment(deep);
    const s = seg.surfaceAt(floorStart + 4);
    const p = offsetFrom(s, ROAD_WIDTH / 2 + 10);
    expect(groundHeightAt(seg.ground, p.x, p.z)).toBeCloseTo(-2, 3);
  });
});

describe('roadworks', () => {
  test('fences stand on both road edges', () => {
    const seg = buildSegment(roadworks(40, 3));
    expect(seg.walls).toHaveLength(2);
    const xs = seg.walls.map((w) => w.center.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-(ROAD_WIDTH / 2 + WALL_THICKNESS / 2), 9);
    expect(xs[1]).toBeCloseTo(ROAD_WIDTH / 2 + WALL_THICKNESS / 2, 9);
    for (const w of seg.walls) expect(w.center.y + w.halfExtents.y).toBeCloseTo(FENCE_HEIGHT, 9);
  });

  test('barriers carry the barrier kind and sit on the road in rows at -3, 0, 3 from 16 m on', () => {
    const seg = buildSegment(roadworks(40, 6));
    expect(seg.props.map((p) => p.kind)).toEqual(Array(6).fill('barrier'));
    expect(seg.props.map((p) => p.id)).toEqual(['barrier-1', 'barrier-2', 'barrier-3', 'barrier-4', 'barrier-5', 'barrier-6']);
    expect(seg.props.map((p) => p.pose.pos.x)).toEqual([-3, 0, 3, -3, 0, 3]);
    expect(seg.props.map((p) => p.pose.pos.z)).toEqual([-16, -16, -16, -16 - ROADWORKS_ROW_SPACING, -16 - ROADWORKS_ROW_SPACING, -16 - ROADWORKS_ROW_SPACING]);
    for (const p of seg.props) {
      expect(p.pose.pos.y).toBe(0);
      expect(groundHeightAt(seg.ground, p.pose.pos.x, p.pose.pos.z)).toBeCloseTo(0, 9);
    }
  });

  test('a partial row fills from the left', () => {
    const seg = buildSegment(roadworks(40, 4));
    expect(seg.props.map((p) => p.pose.pos.x)).toEqual([-3, 0, 3, -3]);
  });

  test('exactly one full row fits at 16 + 8 m; a shorter road throws', () => {
    expect(() => buildSegment(roadworks(24, 3))).not.toThrow();
    expect(() => buildSegment(roadworks(23.9, 3))).toThrow(/fit/);
    expect(() => buildSegment(roadworks(35.9, 4))).toThrow(/fit/);
    expect(() => buildSegment(roadworks(36, 4))).not.toThrow();
  });
});

describe('counts', () => {
  test.each([
    ['debris', road(40, { debris: 1.5 })],
    ['debris', road(40, { debris: -1 })],
    ['palms', sand(30, 2.5)],
    ['palms', sand(30, -1)],
    ['palms', sand(30, Number.NaN)],
    ['rocks', ford(20, 1.2)],
    ['rocks', ford(20, -2)],
    ['obstacles', roadworks(40, 2.5)],
    ['obstacles', roadworks(40, -3)],
    ['anchors', bank(3, 15, 1.5)],
    ['anchors', bank(3, 15, -1)],
    ['anchors', pit(2, 15, 8, 1.5)],
    ['anchors', pit(2, 15, 8, -1)],
  ])('%s that is not a non-negative whole number throws', (_what, def) => {
    expect(() => buildSegment(def)).toThrow(/whole number/);
  });
});

// Horizontal footprint overlap of two yaw-oriented boxes (SAT); heights are ignored.
interface Footprint {
  center: Vec3;
  half: Vec3;
  rot: Quat;
}
function footprintsOverlap(a: Footprint, b: Footprint): boolean {
  const corners = (f: Footprint) =>
    [-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [-1, 1].map((sy) => add(f.center, rotate(f.rot, vec3(sx * f.half.x, sy * f.half.y, sz * f.half.z))))));
  const axes = [a, b].flatMap((f) => {
    const x = rotate(f.rot, vec3(1, 0, 0));
    const z = rotate(f.rot, vec3(0, 0, 1));
    return [
      [x.x, x.z],
      [z.x, z.z],
    ] as const;
  });
  const ca = corners(a);
  const cb = corners(b);
  for (const [ax, az] of axes) {
    const len = Math.hypot(ax, az);
    const project = (pts: Vec3[]) => pts.map((p) => (p.x * ax + p.z * az) / len);
    const pa = project(ca);
    const pb = project(cb);
    if (Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9) return false;
  }
  return true;
}

const asFootprint = (b: { center: Vec3; halfExtents: Vec3; rot: Quat }): Footprint => ({ center: b.center, half: b.halfExtents, rot: b.rot });

// The RV's width plus 0.5 m each side, swept along the route centre line every 0.5 m.
function laneBlockedBy(seg: LocalSegment, boxes: Footprint[]): boolean {
  const total = routeLength(seg);
  const rv = VEHICLES.rv.halfExtents;
  for (let along = 0; along <= total + 1e-9; along += 0.5) {
    const s = seg.surfaceAt(Math.min(along, total));
    const lane: Footprint = { center: s.pos, half: vec3(rv.x + 0.5, 0.5, rv.z), rot: yawQuat(s.yaw) };
    if (boxes.some((b) => footprintsOverlap(lane, b))) return true;
  }
  return false;
}

describe('B4 the lane stays clear', () => {
  const propBoxes = (seg: LocalSegment, skip?: string): Footprint[] =>
    seg.props
      .filter((p) => p.kind !== skip)
      .map((p) => {
        const half = PROP_KINDS[p.kind as keyof typeof PROP_KINDS].halfExtents;
        return { center: add(p.pose.pos, rotate(p.pose.rot, vec3(0, half.y, 0))), half, rot: p.pose.rot };
      });

  test.each(NEW_CASES.map(([name, def]) => [name, def] as const))('%s: the swept lane meets no wall (ford rocks excepted) and no prop (barriers excepted)', (_name, def) => {
    const seg = buildSegment(def);
    const walls = def.type === 'ford' ? [] : seg.walls.map(asFootprint);
    expect(laneBlockedBy(seg, [...walls, ...propBoxes(seg, 'barrier')])).toBe(false);
  });

  test('the sweep does notice a wall or a prop in the lane', () => {
    const seg = buildSegment(alley(30, 0));
    const inLane = { center: vec3(0.5, 0.5, -15), halfExtents: vec3(0.3, 0.3, 0.3), rot: yawQuat(0) };
    expect(laneBlockedBy(seg, [asFootprint(inLane)])).toBe(true);
    const beside = { ...inLane, center: vec3(2.6, 0.5, -15) };
    expect(laneBlockedBy(seg, [asFootprint(beside)])).toBe(false);
    expect(laneBlockedBy(buildSegment(roadworks(40, 3)), propBoxes(buildSegment(roadworks(40, 3))))).toBe(true);
  });
});

// B5, with a pure box test for walls (T8).
function spotBlocked(course: BuiltCourse, feet: Vec3): boolean {
  const lo = feet.y + PLAYER_RADIUS + PLAYER_OVERLAP_LIFT;
  const hi = feet.y + PLAYER_HEIGHT - PLAYER_RADIUS;
  for (let y = lo; y <= hi + 1e-9; y += (hi - lo) / 10) {
    for (const w of course.walls) {
      if (distanceToBox(vec3(feet.x, y, feet.z), w.halfExtents, w.center, w.rot) < PLAYER_RADIUS) return true;
    }
  }
  return false;
}

// The same capsule samples against prop boxes (a pure box test, no physics).
function propBlocks(course: BuiltCourse, feet: Vec3): boolean {
  const lo = feet.y + PLAYER_RADIUS + PLAYER_OVERLAP_LIFT;
  const hi = feet.y + PLAYER_HEIGHT - PLAYER_RADIUS;
  for (let y = lo; y <= hi + 1e-9; y += (hi - lo) / 10) {
    for (const p of course.props) {
      const half = PROP_KINDS[p.kind as keyof typeof PROP_KINDS].halfExtents;
      if (distanceToBox(vec3(feet.x, y, feet.z), half, add(p.pose.pos, rotate(p.pose.rot, vec3(0, half.y, 0))), p.pose.rot) < PLAYER_RADIUS) return true;
    }
  }
  return false;
}

describe('B5 checkpoint spawns', () => {
  const stopRoad: SegmentDef = road(40, { stop: { kind: 'fuel', side: 1, along: 20 } });
  const debrisRoad: SegmentDef = road(60, { curve: Math.PI / 4, debris: 4 });
  const all: [string, SegmentDef][] = [...CASES, ...NEW_CASES, ['road with stop', stopRoad], ['road with debris', debrisRoad], ['road with full debris', road(30, { debris: 6 })]];

  test.each(all)('%s: wheels and spawn slots of both vehicles stand on ground clear of walls', (_name, def) => {
    const course = buildCourse({ id: 'one', segments: [def], targetTime: 100 });
    for (const cp of course.checkpoints) {
      for (const config of Object.values(VEHICLES)) {
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const p = add(cp.spawn.pos, rotate(cp.spawn.rot, vec3(sx * config.wheelX, 0, sz * config.wheelZ)));
            const h = groundHeightAt(course.ground, p.x, p.z);
            expect(h, `${config.id} wheel ${sx},${sz}: no ground`).not.toBeNull();
            expect(Math.abs(h! - p.y), `${config.id} wheel ${sx},${sz}`).toBeLessThanOrEqual(0.1);
          }
        }
        const yaw = rotate(cp.spawn.rot, vec3(0, 0, -1));
        const heading = Math.atan2(-yaw.x, -yaw.z);
        const turn = { x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) };
        for (const [i, slot] of config.spawnSlots.entries()) {
          const at = add(add(cp.spawn.pos, rotate(cp.spawn.rot, vec3(0, config.rideHeight, 0))), rotate(turn, vec3(slot.x, 0, slot.z)));
          const h = groundHeightAt(course.ground, at.x, at.z);
          expect(h, `${config.id} slot ${i}: no ground`).not.toBeNull();
          expect(spotBlocked(course, vec3(at.x, h!, at.z)), `${config.id} slot ${i}: wall in the way`).toBe(false);
          expect(propBlocks(course, vec3(at.x, h!, at.z)), `${config.id} slot ${i}: a prop in the way`).toBe(false);
        }
      }
    }
  });
});

describe('hazards', () => {
  const FROM = SEGMENT_SPAWN_INSET + VEHICLES.rv.halfExtents.z;
  const barrierZ = PROP_KINDS.barrier.halfExtents.z;
  const crateZ = PROP_KINDS.crate.halfExtents.z;

  test('T2: gates place count barriers alternating left then right at GATES_OFFSET, GATES_SPACING apart', () => {
    const seg = buildSegment(road(150, { hazards: [{ kind: 'gates', along: 30, count: 4 }] }));
    expect(seg.props.map((p) => p.id)).toEqual(['barrier-1', 'barrier-2', 'barrier-3', 'barrier-4']);
    expect(seg.props.every((p) => p.kind === 'barrier')).toBe(true);
    expect(seg.props.map((p) => p.pose.pos.x)).toEqual([-GATES_OFFSET, GATES_OFFSET, -GATES_OFFSET, GATES_OFFSET]);
    seg.props.forEach((p, i) => expect(p.pose.pos.z).toBeCloseTo(-(30 + i * GATES_SPACING), 9));
  });

  test('T3: a crate wall is 3 across and 2 high on the right half, with the ids after the debris', () => {
    const seg = buildSegment(road(150, { debris: 2, hazards: [{ kind: 'crateWall', along: 80 }] }));
    const wall = seg.props.slice(2);
    expect(wall.map((p) => p.id)).toEqual(['crate-3', 'crate-4', 'crate-5', 'crate-6', 'crate-7', 'crate-8']);
    expect(wall.map((p) => p.kind)).toEqual(Array(6).fill('crate'));
    expect(wall.map((p) => p.pose.pos.x)).toEqual([...CRATE_WALL_LATERALS, ...CRATE_WALL_LATERALS]);
    expect(wall.slice(0, 3).every((p) => p.pose.pos.y === 0)).toBe(true);
    expect(wall.slice(3).every((p) => Math.abs(p.pose.pos.y - 2 * PROP_KINDS.crate.halfExtents.y) < 1e-9)).toBe(true);
    expect(wall.every((p) => Math.abs(p.pose.pos.z + 80) < 1e-9)).toBe(true);
  });

  test('T3: on a curve the wall follows the surface and the centre line yaw', () => {
    const seg = buildSegment(road(150, { curve: 0.5, hazards: [{ kind: 'crateWall', along: 80 }] }));
    const s = seg.surfaceAt(80);
    const p = seg.props[0]!;
    const want = offsetFrom(s, CRATE_WALL_LATERALS[0]!, 0);
    expect(p.pose.pos.x).toBeCloseTo(want.x, 9);
    expect(p.pose.pos.z).toBeCloseTo(want.z, 9);
  });

  test('T4: a roadblock is 3 barriers across the road with a fence each side along +-ROADBLOCK_FENCE_HALF', () => {
    const seg = buildSegment(road(150, { hazards: [{ kind: 'roadblock', along: 70 }] }));
    expect(seg.props.map((p) => p.pose.pos.x)).toEqual([-3, 0, 3]);
    expect(seg.props.every((p) => p.kind === 'barrier' && Math.abs(p.pose.pos.z + 70) < 1e-9)).toBe(true);
    expect(seg.walls).toHaveLength(4);
    for (const side of [-1, 1]) {
      const w = seg.walls.find((b) => Math.sign(b.center.x) === side && b.halfExtents.z > 1)!;
      expect(Math.abs(w.center.x)).toBeCloseTo(ROAD_WIDTH / 2 + WALL_THICKNESS / 2, 9);
      expect(w.halfExtents.z).toBeCloseTo(ROADBLOCK_FENCE_HALF, 9);
      expect(w.center.z).toBeCloseTo(-70, 9);
      expect(w.halfExtents.y).toBeCloseTo(FENCE_HEIGHT / 2, 9);
    }
  });

  test('T4: a cross-wall at the row covers each shoulder from the road edge to its far edge', () => {
    const seg = buildSegment(road(150, { hazards: [{ kind: 'roadblock', along: 70 }] }));
    for (const side of [-1, 1]) {
      const w = seg.walls.find((b) => Math.sign(b.center.x) === side && b.halfExtents.z < 1)!;
      expect(w.center.z).toBeCloseTo(-70, 9);
      expect(Math.abs(w.center.x) - w.halfExtents.x).toBeCloseTo(ROAD_WIDTH / 2, 9);
      expect(Math.abs(w.center.x) + w.halfExtents.x).toBeCloseTo(ROAD_WIDTH / 2 + SHOULDER_WIDTH, 9);
      expect(w.halfExtents.y).toBeCloseTo(FENCE_HEIGHT / 2, 9);
    }
  });

  test('T4: every roadblock gap is narrower than twice the RV half width', () => {
    const seg = buildSegment(road(150, { hazards: [{ kind: 'roadblock', along: 70 }] }));
    const edges = seg.props.map((p) => [p.pose.pos.x - PROP_KINDS.barrier.halfExtents.x, p.pose.pos.x + PROP_KINDS.barrier.halfExtents.x] as const).sort((a, b) => a[0] - b[0]);
    const gaps = [edges[0]![0] - -ROAD_WIDTH / 2, edges[1]![0] - edges[0]![1], edges[2]![0] - edges[1]![1], ROAD_WIDTH / 2 - edges[2]![1]];
    for (const gap of gaps) expect(gap).toBeLessThan(2 * VEHICLES.rv.halfExtents.x);
    for (const gap of gaps) expect(gap).toBeLessThan(2 * VEHICLES.lodgy.halfExtents.x);
    expect(Math.max(...gaps)).toBeCloseTo(ROADBLOCK_LATERAL - 2 * PROP_KINDS.barrier.halfExtents.x, 9);
  });

  test('T5: the gates corridor fits the RV with a metre to spare', () => {
    const corridor = 2 * (GATES_OFFSET - PROP_KINDS.barrier.halfExtents.x);
    expect(corridor).toBeGreaterThanOrEqual(2 * VEHICLES.rv.halfExtents.x + 1.0);
    expect(corridor).toBeGreaterThanOrEqual(2 * VEHICLES.lodgy.halfExtents.x + 1.0);
  });

  test('hazards are placed in the pitched frame on a slope', () => {
    const seg = buildSegment(road(150, { slope: 5, hazards: [{ kind: 'crateWall', along: 80 }] }));
    expect(seg.props[0]!.pose.pos.y).toBeCloseTo(seg.surfaceAt(80).pos.y, 9);
  });

  describe('T1 validation', () => {
    const earliest = FROM + barrierZ;
    test('the earliest allowed roadblock builds, a hair earlier throws', () => {
      expect(() => buildSegment(road(150, { hazards: [{ kind: 'gates', along: earliest, count: 2 }] }))).not.toThrow();
      expect(() => buildSegment(road(150, { hazards: [{ kind: 'gates', along: earliest - 0.01, count: 2 }] }))).toThrow(/spawn/);
      expect(() => buildSegment(road(150, { hazards: [{ kind: 'crateWall', along: FROM + crateZ - 0.01 }] }))).toThrow(/spawn/);
      expect(() => buildSegment(road(150, { hazards: [{ kind: 'crateWall', along: FROM + crateZ }] }))).not.toThrow();
    });

    test('a hazard ending within 8 m of the segment end throws', () => {
      expect(() => buildSegment(road(100, { hazards: [{ kind: 'crateWall', along: 100 - 8 - crateZ }] }))).not.toThrow();
      expect(() => buildSegment(road(100, { hazards: [{ kind: 'crateWall', along: 100 - 8 - crateZ + 0.01 }] }))).toThrow(/end of the segment/);
      expect(() => buildSegment(road(100, { hazards: [{ kind: 'gates', along: 30, count: 6 }] }))).toThrow(/end of the segment/);
    });

    test('gates count must be a whole number from 2 to 6', () => {
      for (const count of [1, 7, 2.5, Number.NaN]) {
        expect(() => buildSegment(road(300, { hazards: [{ kind: 'gates', along: 30, count }] }))).toThrow(/whole number from 2 to 6/);
      }
      for (const count of [2, 6]) expect(() => buildSegment(road(300, { hazards: [{ kind: 'gates', along: 30, count }] }))).not.toThrow();
    });

    test('two hazards closer than 20 m end to start throw; exactly 20 m builds, in either input order', () => {
      const a = { kind: 'crateWall', along: 40 } as const;
      expect(() => buildSegment(road(200, { hazards: [a, { kind: 'crateWall', along: 40 + 2 * crateZ + 19.99 }] }))).toThrow(/20 m apart/);
      expect(() => buildSegment(road(200, { hazards: [a, { kind: 'crateWall', along: 40 + 2 * crateZ + 20 }] }))).not.toThrow();
      expect(() => buildSegment(road(200, { hazards: [{ kind: 'crateWall', along: 40 + 2 * crateZ + 20 }, a] }))).not.toThrow();
      expect(() => buildSegment(road(300, { hazards: [{ kind: 'gates', along: 40, count: 3 }, { kind: 'crateWall', along: 40 + 28 + barrierZ + crateZ + 19 }] }))).toThrow(/20 m apart/);
    });

    test('a hazard within 10 m of a debris crate throws', () => {
      const probe = buildSegment(road(200, { debris: 2 }));
      const z = -probe.props[0]!.pose.pos.z;
      expect(() => buildSegment(road(200, { debris: 2, hazards: [{ kind: 'crateWall', along: z + crateZ + 9.9 + crateZ }] }))).toThrow(/debris/);
      expect(() => buildSegment(road(200, { debris: 2, hazards: [{ kind: 'crateWall', along: z + crateZ + 10 + crateZ }] }))).not.toThrow();
    });

    test('a segment with a stop takes no hazards', () => {
      expect(() => buildSegment(road(200, { stop: { kind: 'fuel', side: 1, along: 100 }, hazards: [{ kind: 'crateWall', along: 40 }] }))).toThrow(/stop/);
    });

    test('a roadblock whose fences would leave the segment throws', () => {
      expect(() => buildSegment(road(200, { hazards: [{ kind: 'roadblock', along: 200 - ROADBLOCK_FENCE_HALF + 1 }] }))).toThrow(/fences/);
      expect(() => buildSegment(road(200, { hazards: [{ kind: 'roadblock', along: 200 - ROADBLOCK_FENCE_HALF - 8 }] }))).not.toThrow();
    });
  });
});
