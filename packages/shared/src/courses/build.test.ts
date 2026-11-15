import { describe, expect, test } from 'vitest';
import { CHECKPOINT_TRIGGER, FINISH_PAD, KILL_PLANE_BELOW, ROAD_WIDTH, SEGMENT_SPAWN_INSET, STOP_PAD, STOP_PAD_LIFT } from '../constants';
import type { BuiltCourse } from '../course';
import { groundHeightAt } from '../groundProbe';
import { degToRad, rotate, vec3 } from '../math';
import { yawPitchQuat, yawQuat, type SegmentDef } from '../segments';
import { buildCourse, type CourseDef } from './build';

const road = (length: number, extra: Partial<Extract<SegmentDef, { type: 'road' }>> = {}): SegmentDef => ({ type: 'road', length, ...extra });
const course = (...segments: SegmentDef[]): CourseDef => ({ id: 'built', segments, targetTime: 100 });

function arcChord(length: number, n: number, curve: number): number {
  return ((length / n) * Math.sin(curve / 2)) / Math.sin(curve / (2 * n));
}

// Samples along the route polyline every `step` metres, with the unit right vector of the edge each lies on.
function* sampleRoute(route: BuiltCourse['route'], step: number) {
  let carried = 0;
  for (let i = 1; i < route.length; i++) {
    const [x0, z0] = route[i - 1]!;
    const [x1, z1] = route[i]!;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const dx = (x1 - x0) / len;
    const dz = (z1 - z0) / len;
    for (let s = carried; s <= len + 1e-9; s += step) {
      yield { x: x0 + dx * Math.min(s, len), z: z0 + dz * Math.min(s, len), rx: -dz, rz: dx };
      carried = s + step - len;
    }
  }
}

function maxStep(built: BuiltCourse, slope: number): number {
  const limit = 0.02 + 0.05 * Math.tan(Math.abs(slope));
  let worst = 0;
  for (const lateral of [-ROAD_WIDTH / 2 + 0.5, 0, ROAD_WIDTH / 2 - 0.5]) {
    let previous: number | null = null;
    for (const s of sampleRoute(built.route, 0.05)) {
      const h = groundHeightAt(built.ground, s.x + s.rx * lateral, s.z + s.rz * lateral);
      expect(h, `no ground at ${s.x}, ${s.z}`).not.toBeNull();
      if (previous !== null) worst = Math.max(worst, Math.abs(h! - previous) - limit);
      previous = h;
    }
  }
  return worst;
}

describe('checkpoints (S3)', () => {
  const built = buildCourse(course(road(40), road(90, { curve: Math.PI / 2 }), road(30)));

  test('one per segment, cp-0 first', () => {
    expect(built.checkpoints.map((c) => c.id)).toEqual(['cp-0', 'cp-1', 'cp-2']);
  });

  test('cp-0 is at the origin: a trigger as wide as the road and a spawn SEGMENT_SPAWN_INSET along', () => {
    const cp = built.checkpoints[0]!;
    expect(cp.trigger.center).toEqual(vec3(0, CHECKPOINT_TRIGGER.y, 0));
    expect(cp.trigger.halfExtents).toEqual(vec3(ROAD_WIDTH / 2, CHECKPOINT_TRIGGER.y, CHECKPOINT_TRIGGER.z));
    expect(cp.spawn.pos).toEqual(vec3(0, 0, -SEGMENT_SPAWN_INSET));
    expect(cp.spawn.rot).toEqual(yawQuat(0));
  });

  test('cp-1 sits at the first segment exit, its spawn eight metres along the route', () => {
    const cp = built.checkpoints[1]!;
    expect(cp.trigger.center.x).toBeCloseTo(0, 9);
    expect(cp.trigger.center.z).toBeCloseTo(-40, 9);
    expect(Math.hypot(cp.spawn.pos.x, cp.spawn.pos.z + 40)).toBeCloseTo(SEGMENT_SPAWN_INSET, 9);
  });

  test('cp-2 is rotated by the quarter turn, trigger and spawn alike', () => {
    const cp = built.checkpoints[2]!;
    const chord = arcChord(90, 9, Math.PI / 2);
    const exit = vec3(-chord * Math.sin(Math.PI / 4), 0, -40 - chord * Math.cos(Math.PI / 4));
    expect(cp.trigger.center.x).toBeCloseTo(exit.x, 9);
    expect(cp.trigger.center.z).toBeCloseTo(exit.z, 9);
    expect(cp.trigger.center.y).toBe(CHECKPOINT_TRIGGER.y);
    const q = yawQuat(Math.PI / 2);
    expect(cp.trigger.rot.y).toBeCloseTo(q.y, 12);
    expect(cp.trigger.rot.w).toBeCloseTo(q.w, 12);
    // Eight metres along the new heading, which is -X.
    expect(cp.spawn.pos.x).toBeCloseTo(exit.x - SEGMENT_SPAWN_INSET, 9);
    expect(cp.spawn.pos.z).toBeCloseTo(exit.z, 9);
  });

  test('a spawn on a slope carries the road pitch', () => {
    const sloped = buildCourse(course(road(40, { slope: 8 })));
    const spawn = sloped.checkpoints[0]!.spawn;
    const q = yawPitchQuat(0, degToRad(8));
    expect(spawn.rot.x).toBeCloseTo(q.x, 12);
    expect(spawn.rot.w).toBeCloseTo(q.w, 12);
    expect(spawn.pos.y).toBeCloseTo(SEGMENT_SPAWN_INSET * Math.tan(degToRad(8)), 9);
  });
});

describe('ids (S4) and determinism (B7)', () => {
  const def = course(
    road(40, { debris: 2, pickups: [{ kind: 'jerrycan', along: 5, lateral: 0 }], coins: [{ along: 8, lateral: 1 }], stop: { kind: 'fuel', side: 1, along: 20 } }),
    road(40, { debris: 2, pickups: [{ kind: 'jerrycan', along: 5, lateral: 0 }], anchors: [{ kind: 'milestone', along: 9, lateral: 6 }], coins: [{ along: 8, lateral: 1 }] }),
  );

  test('things a segment places are s<index>-<kind>-<n>', () => {
    const built = buildCourse(def);
    expect(built.props.map((p) => p.id)).toEqual(['s0-crate-1', 's0-crate-2', 's1-crate-1', 's1-crate-2']);
    expect(built.pickups.map((p) => p.id)).toEqual(['s0-jerrycan-1', 's1-jerrycan-1']);
    expect(built.coins.map((p) => p.id)).toEqual(['s0-coin-1', 's1-coin-1']);
    expect(built.anchors.map((p) => p.id)).toEqual(['s1-milestone-1']);
    expect(built.stops.map((p) => p.id)).toEqual(['s0-stop-1']);
  });

  test('ids are unique across everything placed on the ground', () => {
    const built = buildCourse(def);
    const ids = [...built.props, ...built.pickups, ...built.anchors, ...built.coins, ...built.stops, ...built.checkpoints].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('building twice gives deep-equal results', () => {
    expect(buildCourse(def)).toEqual(buildCourse(def));
  });

  test('the result is deep-frozen', () => {
    const built = buildCourse(def);
    expect(Object.isFrozen(built)).toBe(true);
    expect(Object.isFrozen(built.ground[0])).toBe(true);
    expect(Object.isFrozen(built.ground[0]!.center)).toBe(true);
    expect(Object.isFrozen(built.props[0]!.pose.rot)).toBe(true);
    expect(Object.isFrozen(built.route[0])).toBe(true);
  });

  test('it carries the id and the target time', () => {
    const built = buildCourse(def);
    expect(built.id).toBe('built');
    expect(built.targetTime).toBe(100);
  });

  test('an empty course throws', () => {
    expect(() => buildCourse(course())).toThrow();
  });

  test('a bad segment is reported by the segment builder', () => {
    expect(() => buildCourse(course(road(5)))).toThrow(/at least/);
  });
});

describe('finish and kill plane (S8, T15)', () => {
  test('a flat pad follows the last segment and carries the finish volume', () => {
    const built = buildCourse(course(road(40)));
    expect(built.finish.halfExtents).toEqual(vec3(ROAD_WIDTH / 2, 2, 2));
    expect(built.finish.center).toEqual(vec3(0, 2, -40 - FINISH_PAD / 2));
    expect(built.route[built.route.length - 1]).toEqual([0, -40 - FINISH_PAD]);
    expect(groundHeightAt(built.ground, 0, -40 - FINISH_PAD + 0.5)).toBeCloseTo(0, 9);
    expect(groundHeightAt(built.ground, 0, -40 - FINISH_PAD - 1)).toBeNull();
  });

  test('after a climb the pad is flat at the exit height and the finish is 2 m above it', () => {
    const built = buildCourse(course(road(40, { slope: 8 })));
    const top = 40 * Math.sin(degToRad(8));
    expect(built.finish.center.y).toBeCloseTo(top + 2, 9);
    expect(groundHeightAt(built.ground, 0, -40 * Math.cos(degToRad(8)) - 10)).toBeCloseTo(top, 9);
  });

  test('the finish after a quarter turn faces along the new heading', () => {
    const built = buildCourse(course(road(90, { curve: Math.PI / 2 })));
    const chord = arcChord(90, 9, Math.PI / 2);
    expect(built.finish.center.x).toBeCloseTo(-chord * Math.sin(Math.PI / 4) - FINISH_PAD / 2, 9);
    expect(built.finish.center.z).toBeCloseTo(-chord * Math.cos(Math.PI / 4), 9);
    expect(rotate(built.finish.rot, vec3(0, 0, -1)).x).toBeCloseTo(-1, 9);
  });

  test('the kill plane is KILL_PLANE_BELOW under the lowest ground top', () => {
    expect(buildCourse(course(road(40))).killPlaneY).toBe(-KILL_PLANE_BELOW);
    const down = buildCourse(course(road(40, { slope: -8 })));
    expect(down.killPlaneY).toBeCloseTo(-40 * Math.sin(degToRad(8)) - KILL_PLANE_BELOW, 9);
    const up = buildCourse(course(road(40, { slope: 8 })));
    expect(up.killPlaneY).toBeCloseTo(-KILL_PLANE_BELOW, 9);
  });

  test('a stop pad flush with the road does not move the kill plane', () => {
    const built = buildCourse(course(road(40, { stop: { kind: 'garage', side: -1, along: 20 } })));
    expect(built.killPlaneY).toBe(-KILL_PLANE_BELOW);
  });
});

describe('chaining', () => {
  test('a road then a curved road: ground under the join and no steps across it (B2, B3)', () => {
    const built = buildCourse(course(road(40), road(90, { curve: Math.PI / 2 }), road(30)));
    for (const s of sampleRoute(built.route, 1)) {
      for (const lateral of [-4.5, -2.25, 0, 2.25, 4.5]) {
        const h = groundHeightAt(built.ground, s.x + s.rx * lateral, s.z + s.rz * lateral);
        expect(h, `no ground at ${s.x}, ${s.z}`).not.toBeNull();
        expect(Math.abs(h!)).toBeLessThanOrEqual(0.02);
      }
    }
    expect(maxStep(built, 0)).toBeLessThanOrEqual(0);
  });

  test('a climb then a descent: the top surface is continuous at the join', () => {
    const built = buildCourse(course(road(40, { slope: 8 }), road(40, { slope: -8 })));
    expect(maxStep(built, degToRad(8))).toBeLessThanOrEqual(0);
  });

  test('a flat road onto a climb and off it again stays continuous', () => {
    const built = buildCourse(course(road(30), road(40, { slope: 8 }), road(30)));
    expect(maxStep(built, degToRad(8))).toBeLessThanOrEqual(0);
  });

  test('the route chains without repeating the joins', () => {
    const built = buildCourse(course(road(40), road(40)));
    expect(built.route).toEqual([
      [0, 0],
      [0, -10],
      [0, -20],
      [0, -30],
      [0, -40],
      [0, -50],
      [0, -60],
      [0, -70],
      [0, -80],
      [0, -90],
      [0, -100],
    ]);
  });

  test('the second segment starts at the first one’s exit height', () => {
    const built = buildCourse(course(road(40, { slope: 8 }), road(40)));
    const top = 40 * Math.sin(degToRad(8));
    expect(built.checkpoints[1]!.spawn.pos.y).toBeCloseTo(top, 9);
  });
});

describe('extras after chaining', () => {
  test('10 m along and 2 m right in a segment that starts after a quarter turn left', () => {
    const built = buildCourse(
      course(road(90, { curve: Math.PI / 2 }), road(40, { pickups: [{ kind: 'jerrycan', along: 10, lateral: 2 }], anchors: [{ kind: 'milestone', along: 10, lateral: 2 }], coins: [{ along: 10, lateral: 2 }] })),
    );
    const chord = arcChord(90, 9, Math.PI / 2);
    const exit = vec3(-chord * Math.sin(Math.PI / 4), 0, -chord * Math.cos(Math.PI / 4));
    // Heading is -X, so the right-hand side is -Z.
    const expected = vec3(exit.x - 10, 0, exit.z - 2);
    for (const [placed, y] of [
      [built.pickups[0]!, 0],
      [built.anchors[0]!, 0],
      [built.coins[0]!, 1],
    ] as const) {
      expect(placed.pose.pos.x).toBeCloseTo(expected.x, 9);
      expect(placed.pose.pos.y).toBeCloseTo(y, 9);
      expect(placed.pose.pos.z).toBeCloseTo(expected.z, 9);
      expect(rotate(placed.pose.rot, vec3(0, 0, -1)).x).toBeCloseTo(-1, 9);
    }
  });

  test('a stop after a quarter turn left puts its pad and zone on the right-hand side', () => {
    const built = buildCourse(course(road(90, { curve: Math.PI / 2 }), road(40, { stop: { kind: 'fuel', side: 1, along: 20 } })));
    const chord = arcChord(90, 9, Math.PI / 2);
    const exit = vec3(-chord * Math.sin(Math.PI / 4), 0, -chord * Math.cos(Math.PI / 4));
    const stop = built.stops[0]!;
    expect(stop.zone.center.x).toBeCloseTo(exit.x - 20, 9);
    expect(stop.zone.center.z).toBeCloseTo(exit.z - (ROAD_WIDTH / 2 + 0.5 + 2.5), 9);
    expect(stop.operatePoint.x).toBeCloseTo(exit.x - 20, 9);
    expect(stop.shopCounter!.x).toBeCloseTo(exit.x - 22, 9);
    expect(stop.shopCounter!.z).toBeCloseTo(stop.operatePoint.z, 9);
    const pad = built.ground.find((g) => g.halfExtents.x === STOP_PAD.x && g.halfExtents.z === STOP_PAD.z);
    expect(pad).toBeDefined();
    expect(pad!.center.x).toBeCloseTo(exit.x - 20, 9);
    expect(pad!.center.z).toBeCloseTo(exit.z - (ROAD_WIDTH / 2 + STOP_PAD.x), 9);
    expect(pad!.center.y).toBeCloseTo(-STOP_PAD.y + STOP_PAD_LIFT, 12);
    const q = yawQuat(Math.PI / 2);
    expect(pad!.rot.y).toBeCloseTo(q.y, 12);
  });

  test('props on a climb after a quarter turn stand on the surface', () => {
    const built = buildCourse(course(road(90, { curve: Math.PI / 2 }), road(20), road(40, { slope: 8, debris: 2 })));
    const crate = built.props[0]!;
    expect(groundHeightAt(built.ground, crate.pose.pos.x, crate.pose.pos.z)).toBeCloseTo(crate.pose.pos.y, 2);
  });
});

describe('curve next to slope', () => {
  const curved = road(90, { curve: Math.PI / 2 });
  const sloped = road(40, { slope: 5 });

  test.each([
    ['a curve then a slope', [curved, sloped]],
    ['a slope then a curve', [sloped, curved]],
    ['a curve between flat roads then a slope after the curve', [road(30), curved, sloped, road(30)]],
  ] as const)('%s throws', (_name, segments) => {
    expect(() => buildCourse(course(...segments))).toThrow(/curved road next to a sloped one/);
  });

  test('a flat road between them is allowed', () => {
    expect(() => buildCourse(course(curved, road(30), sloped))).not.toThrow();
    expect(() => buildCourse(course(sloped, road(30), curved))).not.toThrow();
  });

  test('a curve next to a flat road, and a slope next to a flat road, are allowed', () => {
    expect(() => buildCourse(course(road(30), curved, road(30), sloped, road(30)))).not.toThrow();
  });
});
