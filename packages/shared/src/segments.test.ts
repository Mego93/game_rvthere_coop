import { describe, expect, test } from 'vitest';
import { COIN_HEIGHT, ROAD_JOINT_OVERLAP, ROAD_WIDTH, SEGMENT_MIN_LENGTH, STOP_PAD, STOP_ZONE } from './constants';
import { groundHeightAt } from './groundProbe';
import { degToRad, vec3 } from './math';
import { buildSegment, offsetFrom, type LocalSegment, type SegmentDef } from './segments';

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
    expect(seg.ground.length).toBe(18);
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
    for (const box of seg.ground) {
      expect(box.surface).toBe('road');
      expect(box.halfExtents.x).toBe(ROAD_WIDTH / 2);
      expect(box.halfExtents.z * 2).toBeLessThanOrEqual(10 + 2 * ROAD_JOINT_OVERLAP + 1e-9);
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
  test('crates sit at (n - 0.5)/count of the route, alternating left then right at a quarter of the width', () => {
    const seg = buildSegment(road(40, { debris: 4 }));
    expect(seg.props.map((p) => p.id)).toEqual(['crate-1', 'crate-2', 'crate-3', 'crate-4']);
    expect(seg.props.every((p) => p.kind === 'crate')).toBe(true);
    expect(seg.props.map((p) => p.pose.pos.z)).toEqual([-5, -15, -25, -35]);
    expect(seg.props.map((p) => p.pose.pos.x)).toEqual([-2.5, 2.5, -2.5, 2.5]);
    expect(seg.props.every((p) => p.pose.pos.y === 0)).toBe(true);
  });

  test('crates on a slope stand on the surface', () => {
    const seg = buildSegment(road(40, { slope: 8, debris: 2 }));
    const first = seg.props[0]!;
    expect(first.pose.pos.y).toBeCloseTo(seg.surfaceAt(0.25 * 40 * Math.cos(degToRad(8))).pos.y, 9);
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
    expect(pad.center).toEqual(vec3(ROAD_WIDTH / 2 + STOP_PAD.x, -STOP_PAD.y, -20));
    const stop = seg.stops[0]!;
    expect(stop).toMatchObject({ id: 'stop-1', kind: 'fuel' });
    expect(stop.zone.halfExtents).toEqual(STOP_ZONE);
    expect(stop.zone.center).toEqual(vec3(ROAD_WIDTH / 2 + 0.5 + STOP_ZONE.x, STOP_ZONE.y, -20));
    expect(stop.operatePoint).toEqual(vec3(ROAD_WIDTH / 2 + 0.5 + 2 * STOP_ZONE.x + 1, 0, -20));
    expect(stop.shopCounter).toEqual(vec3(stop.operatePoint.x, 0, -22));
    // The zone rests on the pad and the operate point is on it.
    expect(stop.zone.center.y - STOP_ZONE.y).toBe(pad.center.y + pad.halfExtents.y);
    expect(Math.abs(stop.operatePoint.x - pad.center.x)).toBeLessThanOrEqual(pad.halfExtents.x);
  });

  test('a garage on the left has no counter and mirrors to -X', () => {
    const seg = buildSegment(road(40, { stop: { kind: 'garage', side: -1, along: 15 } }));
    const stop = seg.stops[0]!;
    expect(stop.shopCounter).toBeNull();
    expect(stop.zone.center.x).toBe(-(ROAD_WIDTH / 2 + 0.5 + STOP_ZONE.x));
    expect(stop.operatePoint.x).toBeLessThan(0);
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

  test('a non-positive length throws', () => {
    expect(() => buildSegment(road(0))).toThrow();
  });

  test('segment types that Task 2 adds are not built yet', () => {
    expect(() => buildSegment({ type: 'alley', length: 30, clutter: 0.5 })).toThrow(/not built yet/);
  });
});
