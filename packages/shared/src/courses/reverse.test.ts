import { describe, expect, it } from 'vitest';
import { FINISH_PAD, ROAD_PIECE_LENGTH } from '../constants';
import { deepFreeze } from '../math';
import { buildSegment, segmentAlongLength, type Placement, type SegmentDef } from '../segments';
import { buildCourse, type CourseDef } from './build';
import { airport } from './airport';
import { courseIds, getCourse, getCourseDef, segmentRanges } from './index';
import { FUEL_MAX_GAP } from './marrakech.extras';
import { OURIKA_SEGMENTS } from './ourika.generated';
import { reverseSegments } from './reverse';
import { VALLEY_SEGMENTS } from './stages';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
// Numbers to 9 decimals: reversing twice is exact up to the last bits of a float.
const settle = <T>(value: T): T => JSON.parse(JSON.stringify(value), (_key, v: unknown) => (typeof v === 'number' ? Math.round(v * 1e9) / 1e9 + 0 : v)) as T;

const pickups = [{ kind: 'jerrycan', along: 30, lateral: -3 }, { kind: 'toolbox', along: 30, lateral: 3 }];
const coins = (a: number, b: number): Placement[] => [{ along: a, lateral: 2.5 }, { along: b, lateral: -2.5 }];

// Every segment type and every kind of extra and hazard, in a course that builds.
const SINK: SegmentDef[] = [
  { type: 'road', length: 120, pickups, coins: coins(15, 100), anchors: [{ kind: 'boulder', along: 60, lateral: 4 }] },
  { type: 'road', length: 240, curve: 0.5, coins: coins(20, 200), hazards: [{ kind: 'gates', along: 40, count: 3 }, { kind: 'crateWall', along: 150 }] },
  { type: 'road', length: 30 },
  { type: 'road', length: 100, slope: 5, pickups: [{ kind: 'healthKit', along: 20, lateral: 1 }], coins: coins(10, 70) },
  { type: 'road', length: 30 },
  { type: 'road', length: 40, curve: -0.3 },
  { type: 'road', length: 300, stop: { kind: 'fuel', side: 1, along: 150 }, hazards: [{ kind: 'mud', along: 40, length: 14 }, { kind: 'rocks', along: 250, side: -1 }] },
  { type: 'road', length: 200, hazards: [{ kind: 'roadblock', along: 100 }], bumps: 2, debris: 2, surface: 'dirt' },
  { type: 'sand', length: 60, palms: 4, coins: coins(58, 70), pickups: [{ kind: 'jerrycan', along: 20, lateral: -3 }] },
  { type: 'ford', width: 24, rocks: 4, coins: coins(8, 18) },
  { type: 'bank', height: 3, gradient: 15, anchors: 3, coins: coins(10, 30), pickups: [{ kind: 'toolbox', along: 5, lateral: 2 }] },
  { type: 'alley', length: 160, clutter: 0.5, coins: coins(20, 140), pickups: [{ kind: 'healthKit', along: 30, lateral: 1 }] },
  { type: 'roadworks', length: 120, obstacles: 6, pickups: [{ kind: 'toolbox', along: 10, lateral: 3 }] },
  { type: 'pit', depth: 1, gradient: 12, gradientOut: 20, floor: 6, anchors: 2, coins: coins(8, 30) },
  { type: 'pit', depth: 0.6, gradient: 10, floor: 6, anchors: 0 },
  { type: 'bridge', length: 60, coins: coins(10, 50) },
  { type: 'bridge', length: 80, broken: true, pickups: [{ kind: 'jerrycan', along: 6, lateral: 1 }] },
  { type: 'road', length: 150, coins: coins(15, 130) },
];

// Roads only, with every explicit extra and hazard: where each thing stands can be compared exactly.
const ROADS: SegmentDef[] = [
  { type: 'road', length: 120, pickups, coins: coins(15, 100), anchors: [{ kind: 'boulder', along: 60, lateral: 4 }] },
  { type: 'road', length: 240, curve: 0.5, coins: coins(20, 200), hazards: [{ kind: 'gates', along: 40, count: 3 }, { kind: 'crateWall', along: 150 }] },
  { type: 'road', length: 30 },
  { type: 'road', length: 120, slope: 5, pickups: [{ kind: 'healthKit', along: 20, lateral: 1 }], coins: coins(10, 70) },
  { type: 'road', length: 30 },
  { type: 'road', length: 40, curve: -0.3 },
  { type: 'road', length: 300, stop: { kind: 'fuel', side: 1, along: 150 }, hazards: [{ kind: 'mud', along: 40, length: 14 }, { kind: 'rocks', along: 250, side: -1 }] },
  { type: 'road', length: 200, curve: -0.4, hazards: [{ kind: 'roadblock', along: 100 }], coins: coins(30, 160) },
  { type: 'road', length: 150, curve: 0.6, hazards: [{ kind: 'gates', along: 35, count: 4 }, { kind: 'crateWall', along: 125, side: -1 }] },
  { type: 'road', length: 150, stop: { kind: 'garage', side: -1, along: 80 } },
];

const SETS: [string, SegmentDef[]][] = [
  ['the sink of every type', SINK],
  ['roads', ROADS],
  ['the airport', airport.segments],
  ['the valley', VALLEY_SEGMENTS],
  ['the mountain', OURIKA_SEGMENTS],
  ['the airport road', getCourseDef('airport-road')!.segments as SegmentDef[]],
];

const courseOf = (segments: SegmentDef[]): CourseDef => ({ id: 'reversed', segments, targetTime: 300 });

describe('reverseSegments', () => {
  it.each(SETS)('reversing %s twice gives back the original', (_name, segments) => {
    const frozen = deepFreeze(copy(segments));
    const twice = reverseSegments(reverseSegments(frozen));
    expect(settle(twice)).toEqual(settle(segments));
  });

  it.each(SETS)('reverses the order of %s and leaves its input alone', (_name, segments) => {
    const frozen = deepFreeze(copy(segments));
    const reversed = reverseSegments(frozen);
    expect(reversed.map((s) => s.type)).toEqual(segments.map((s) => s.type).reverse());
    expect(frozen).toEqual(segments);
  });

  it('negates the curve and the slope of a road', () => {
    const [a, b] = reverseSegments([
      { type: 'road', length: 100, curve: 0.5 },
      { type: 'road', length: 100, slope: 4 },
    ]);
    expect(b).toMatchObject({ type: 'road', curve: -0.5 });
    expect(a).toMatchObject({ type: 'road', slope: -4 });
  });

  it('mirrors every explicit extra within its segment, on the other side', () => {
    for (const [name, segments] of SETS) {
      const reversed = reverseSegments(segments);
      segments.forEach((segment, i) => {
        const mirror = reversed[segments.length - 1 - i]!;
        const length = segmentAlongLength(segment);
        for (const key of ['pickups', 'anchors', 'coins'] as const) {
          const list = (segment as { pickups?: Placement[]; anchors?: Placement[]; coins?: Placement[] })[key];
          if (!Array.isArray(list)) continue;
          const other = ((mirror as { pickups?: Placement[]; anchors?: Placement[]; coins?: Placement[] })[key] ?? []) as Placement[];
          expect(other, `${name} ${i} ${key}`).toHaveLength(list.length);
          list.forEach((p, k) => {
            expect(other[k]!.lateral, `${name} ${i} ${key}`).toBeCloseTo(-p.lateral, 9);
            expect(other[k]!.along, `${name} ${i} ${key}`).toBeCloseTo(length - p.along, 2);
            expect(other[k]!.along).toBeGreaterThanOrEqual(0);
            expect(other[k]!.along).toBeLessThanOrEqual(length);
            expect(other[k]!.kind).toBe(p.kind);
            expect(other[k]!.height).toBe(p.height);
          });
        }
        if ('stop' in segment && segment.stop) {
          const stop = (mirror as { stop: NonNullable<typeof segment.stop> }).stop;
          expect(stop.side, `${name} ${i}`).toBe(-segment.stop.side);
          expect(stop.along, `${name} ${i}`).toBeCloseTo(length - segment.stop.along, 2);
          expect(stop.kind).toBe(segment.stop.kind);
        }
      });
    }
  });

  it('measures a segment as the builder does', () => {
    for (const [name, segments] of SETS) {
      segments.forEach((segment, i) => {
        const length = segmentAlongLength(segment);
        const { surfaceAt } = buildSegment(segment);
        expect(() => surfaceAt(length), `${name} ${i}`).not.toThrow();
        expect(() => surfaceAt(length + 0.01), `${name} ${i}`).toThrow(RangeError);
      });
    }
  });

  it('builds the reversed courses', () => {
    for (const [name, segments] of SETS) {
      const reversed = reverseSegments(segments);
      expect(() => buildCourse(courseOf(reversed)), name).not.toThrow();
      expect(() => buildCourse({ ...courseOf(reversed), ambient: true, corridor: true }), `${name} with a corridor`).not.toThrow();
    }
  });
});

describe('the reversed segments are built the other way round', () => {
  it('a bank is driven down, and ends where it began', () => {
    const up = buildSegment({ type: 'bank', height: 3, gradient: 15, anchors: 3 });
    const down = buildSegment(reverseSegments([{ type: 'bank', height: 3, gradient: 15, anchors: 3 }])[0]!);
    expect(up.exit.pos.y).toBeCloseTo(3, 6);
    expect(down.exit.pos.y).toBeCloseTo(-3, 6);
    expect(down.exit.pos.z).toBeCloseTo(up.exit.pos.z, 6);
    expect(down.anchors).toHaveLength(3);
  });

  it('a sand stretch has the sand first and the apron last', () => {
    const def: SegmentDef = { type: 'sand', length: 60, palms: 2 };
    const forward = buildSegment(def);
    const back = buildSegment(reverseSegments([def])[0]!);
    expect(forward.ground[0]!.surface).toBe('road');
    expect(back.ground[0]!.surface).toBe('sand');
    expect(back.ground[back.ground.length - 1]!.surface).not.toBe('sand');
    expect(back.exit.pos.z).toBeCloseTo(forward.exit.pos.z, 6);
  });

  it('a pit climbs out at the gradient it went down, and the other way', () => {
    const def: SegmentDef = { type: 'pit', depth: 1, gradient: 12, gradientOut: 20, floor: 6, anchors: 2 };
    const [back] = reverseSegments([def]);
    expect(back).toMatchObject({ gradient: 20, gradientOut: 12, anchors: 2 });
    expect(segmentAlongLength(back!)).toBeCloseTo(segmentAlongLength(def), 9);
  });

  it('a broken bridge goes down at the old climb and climbs at the old descent', () => {
    const def: SegmentDef = { type: 'bridge', length: 80, broken: true };
    const lowest = (segment: SegmentDef) => buildSegment(segment).ground.map((g) => g.center.y).reduce((a, b) => Math.min(a, b));
    const [back] = reverseSegments([def]);
    expect(back).toMatchObject({ reversed: true });
    // The deep pit is steeper going out: the floor of the reversed bridge lies nearer the start.
    const floorAt = (segment: SegmentDef) => buildSegment(segment).ground.find((g) => g.center.y === lowest(segment))!.center.z;
    expect(floorAt(back!)).toBeGreaterThan(floorAt(def));
    expect(buildSegment(back!).exit.pos.z).toBeCloseTo(buildSegment(def).exit.pos.z, 6);
  });

  it('a bridge without a break needs no flag', () => {
    expect(reverseSegments([{ type: 'bridge', length: 60 }])[0]).toEqual({ type: 'bridge', length: 60 });
  });
});

type P2 = [x: number, z: number];

// The route without its finish pad.
const withoutPad = (route: readonly P2[]): P2[] => route.slice(0, route.length - Math.ceil(FINISH_PAD / ROAD_PIECE_LENGTH));

// Moves the reversed course onto the original: its start onto the original's last point, its first leg onto the original's last leg run backwards (a rotation, a half turn when the road is straight there).
function alignment(original: readonly P2[], reversed: readonly P2[]): (p: readonly [number, number]) => P2 {
  const route = withoutPad(original);
  const end = route[route.length - 1]!;
  const before = route[route.length - 2]!;
  const wanted = Math.atan2(before[1] - end[1], before[0] - end[0]);
  const have = Math.atan2(reversed[1]![1] - reversed[0]![1], reversed[1]![0] - reversed[0]![0]);
  const turn = wanted - have;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const [x0, z0] = reversed[0]!;
  return ([x, z]) => [end[0] + c * (x - x0) - s * (z - z0), end[1] + s * (x - x0) + c * (z - z0)];
}

function pointAt(route: readonly P2[], distance: number): P2 {
  let left = distance;
  for (let i = 1; i < route.length; i++) {
    const len = Math.hypot(route[i]![0] - route[i - 1]![0], route[i]![1] - route[i - 1]![1]);
    if (left <= len || i === route.length - 1) {
      const t = len === 0 ? 0 : Math.min(1, left / len);
      return [route[i - 1]![0] + (route[i]![0] - route[i - 1]![0]) * t, route[i - 1]![1] + (route[i]![1] - route[i - 1]![1]) * t];
    }
    left -= len;
  }
  return route[route.length - 1]!;
}

const lengthOf = (route: readonly P2[]): number => route.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - route[i]![0], p[1] - route[i]![1]), 0);

// The largest gap between the reversed route and the original run backwards, sampled every half metre.
function routeError(segments: SegmentDef[]): number {
  const original = buildCourse(courseOf(segments)).route as P2[];
  const reversed = buildCourse(courseOf(reverseSegments(segments))).route as P2[];
  const back = [...withoutPad(original)].reverse();
  const mine = withoutPad(reversed);
  const length = lengthOf(back);
  expect(lengthOf(mine)).toBeCloseTo(length, 6);
  const place = alignment(original, reversed);
  let worst = 0;
  for (let d = 0; d <= length; d += 0.5) {
    const a = pointAt(back, d);
    const b = place(pointAt(mine, d));
    worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  return worst;
}

describe('the reversed route', () => {
  it.each(SETS.filter(([name]) => name !== 'roads' && name !== 'the sink of every type'))('is the original route run backwards for %s, within 0.5 m', (_name, segments) => {
    expect(routeError(segments)).toBeLessThan(0.5);
  });

  it('is the original route run backwards on a curved, sloped road with every extra', () => {
    expect(routeError(ROADS)).toBeLessThan(0.5);
  });

  it('is the original route run backwards through every segment type', () => {
    expect(routeError(SINK)).toBeLessThan(0.5);
  });
});

interface Mark {
  kind: string;
  x: number;
  z: number;
}

const marks = (list: readonly { kind: string; pose: { pos: { x: number; z: number } } }[], place: (p: P2) => P2): Mark[] =>
  list.map((o) => {
    const [x, z] = place([o.pose.pos.x, o.pose.pos.z]);
    return { kind: o.kind, x, z };
  });

describe('the reversed road has everything where it was', () => {
  const original = buildCourse(courseOf(ROADS));
  const reversed = buildCourse(courseOf(reverseSegments(ROADS)));
  const place = alignment(original.route as P2[], reversed.route as P2[]);
  const here = (p: P2): P2 => p;
  // Every mark of one list has a mark of the same kind within 10 cm in the other, one for one (on the joint of two pieces of a curve the sideways direction is that of one piece or the other, up to 5 cm apart).
  const same = (a: Mark[], b: Mark[]) => {
    expect(b).toHaveLength(a.length);
    const left = [...b];
    for (const m of a) {
      const at = left.findIndex((o) => o.kind === m.kind && Math.hypot(o.x - m.x, o.z - m.z) < 0.1);
      expect(at, `${m.kind} at ${m.x.toFixed(2)}, ${m.z.toFixed(2)}`).toBeGreaterThanOrEqual(0);
      left.splice(at, 1);
    }
  };

  it('pickups and coins', () => {
    expect(original.pickups.length).toBeGreaterThan(0);
    expect(original.coins.length).toBeGreaterThan(0);
    same(marks(original.pickups, here), marks(reversed.pickups, place));
    same(marks(original.coins, here), marks(reversed.coins, place));
  });

  it('the barriers, crates and boulders of the hazards', () => {
    for (const kind of ['barrier', 'crate'] as const) {
      const before = original.props.filter((p) => p.kind === kind);
      expect(before.length).toBeGreaterThan(0);
      same(marks(before, here), marks(reversed.props.filter((p) => p.kind === kind), place));
    }
    // The boulders of the rocks form a diagonal pair, tested below; this one is an explicit anchor of the first road.
    const first = original.anchors.filter((a) => a.id.startsWith('s0-'));
    expect(first).toHaveLength(1);
    same(marks(first, here), marks(reversed.anchors.filter((a) => a.id.startsWith(`s${ROADS.length - 1}-`)), place));
  });

  it('the stops, on the same side of the road', () => {
    const stops = (course: typeof original, at: (p: P2) => P2) => marks(course.stops.map((s) => ({ kind: s.kind, pose: { pos: s.zone.center } })), at);
    expect(original.stops).toHaveLength(2);
    same(stops(original, here), stops(reversed, place));
  });

  it('the mud, and the rocks within a metre', () => {
    const mud = (course: typeof original, at: (p: P2) => P2) => marks(course.ground.filter((g) => g.surface === 'mud').map((g) => ({ kind: 'mud', pose: { pos: g.center } })), at);
    expect(mud(original, here)).toHaveLength(1);
    same(mud(original, here), mud(reversed, place));
    const rocks = (course: typeof original, at: (p: P2) => P2) => marks(course.walls.filter((w) => w.rock).map((w) => ({ kind: 'rock', pose: { pos: w.center } })), at);
    const before = rocks(original, here);
    const after = rocks(reversed, place);
    expect(after).toHaveLength(before.length);
    // The two rocks are a diagonal pair: it keeps its side and its place, with the outer rock now first.
    for (const m of before) expect(after.some((o) => Math.hypot(o.x - m.x, o.z - m.z) < 1.8)).toBe(true);
  });
});

describe('airport-home', () => {
  const def = getCourseDef('airport-home')!;
  const ranges = segmentRanges(def);
  const total = ranges[ranges.length - 1]!.to;
  const stage = getCourseDef('airport-road')!;
  const stageRanges = segmentRanges(stage);

  it('is a story-only course, kept out of the lobby list', () => {
    expect(courseIds()).not.toContain('airport-home');
    expect(getCourse('airport-home').id).toBe('airport-home');
    expect(def.id).toBe('airport-home');
    expect(def.theme).toBe('airport');
    expect(def.ambient).toBe(true);
    expect(def.corridor).toBe(true);
    expect(def.targetTime).toBe(300);
  });

  it('starts with a flat 80 m road carrying the three start pickups', () => {
    const first = def.segments[0] as Extract<SegmentDef, { type: 'road' }>;
    expect(first.type).toBe('road');
    expect(first.length).toBe(80);
    expect(first.curve).toBeUndefined();
    expect(first.slope).toBeUndefined();
    expect(first.pickups!.map((p) => p.kind).sort()).toEqual(['healthKit', 'jerrycan', 'toolbox']);
  });

  it('is the airport road reversed, behind a start road that takes the place of the old finish pad and last road', () => {
    const forward = stage.segments as SegmentDef[];
    expect(def.segments.slice(2)).toEqual(reverseSegments(forward).slice(1));
    expect(def.segments).toHaveLength(forward.length + 1);
    expect(total).toBeCloseTo(stageRanges[forward.length - 1]!.to + FINISH_PAD, 6);
  });

  it('runs the old route backwards, from the old finish pad to the old start, within 0.5 m', () => {
    const original = getCourse('airport-road').route as P2[];
    const home = getCourse('airport-home').route as P2[];
    const back = [...original].reverse();
    // The old route ends with its pad; the new route starts there.
    const place = alignment([...original, [0, 0], [0, 0]], [...home]);
    const length = lengthOf(original);
    let worst = 0;
    for (let d = 0; d <= length; d += 0.5) {
      const a = pointAt(back, d);
      const b = place(pointAt(home, d));
      worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1]));
    }
    expect(worst).toBeLessThan(0.5);
  });

  it('has a fuel stop, and no fuel gap above the maximum counting both ends', () => {
    const stops = def.segments.flatMap((s, i) => (s.type === 'road' && s.stop?.kind === 'fuel' ? [ranges[i]!.from + s.stop.along] : []));
    expect(stops.length).toBeGreaterThan(0);
    const points = [0, ...stops, total + FINISH_PAD];
    for (let i = 1; i < points.length; i++) expect(points[i]! - points[i - 1]!).toBeLessThanOrEqual(FUEL_MAX_GAP);
  });
});
