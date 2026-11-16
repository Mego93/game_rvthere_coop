import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  COIN_RADIUS,
  ITEM_KINDS,
  PLAYER_HEIGHT,
  PLAYER_OVERLAP_LIFT,
  PLAYER_RADIUS,
  PROP_KINDS,
  STOP_ZONE,
  TICK_RATE,
} from '../constants';
import type { BuiltCourse, Box } from '../course';
import { groundHeightAt, groundSurfaceAt } from '../groundProbe';
import { add, degToRad, rotate, vec3, type Quat, type Vec3 } from '../math';
import { distanceToBox } from '../seats';
import { createRig } from '../testRig';
import { VEHICLES } from '../vehicles';
import { createWorld } from '../world';
import { airport } from './airport';
import { buildCourse } from './build';
import { segmentDemo } from './demo';
import { courseIds, getCourse } from './index';

beforeAll(async () => {
  await RAPIER.init();
});

const course = getCourse('segment-demo');

test('courseIds lists every registered course', () => {
  expect(courseIds().sort()).toEqual(['airport', 'marrakech', 'segment-demo', 'test']);
});
const VEHICLE_CONFIGS = Object.values(VEHICLES);

describe('the registry', () => {
  test('returns the demo built once, with a checkpoint per segment', () => {
    expect(getCourse('segment-demo')).toBe(course);
    expect(course.id).toBe('segment-demo');
    expect(course.checkpoints.map((c) => c.id)).toEqual(segmentDemo.segments.map((_, i) => `cp-${i}`));
    expect(course.targetTime).toBe(300);
  });

  test('every segment type appears, and both stops are there', () => {
    expect(new Set(segmentDemo.segments.map((s) => s.type))).toEqual(new Set(['road', 'alley', 'sand', 'ford', 'bank', 'roadworks']));
    expect(course.stops.map((s) => [s.id, s.kind])).toEqual([
      ['s0-stop-1', 'fuel'],
      ['s8-stop-1', 'garage'],
    ]);
  });
});

// marrakech is left out: groundHeightAt is a linear scan and would run for hours over 22 km; it has its own tests in marrakech.course.test.ts.
const DEFS = { 'segment-demo': segmentDemo, airport } as const;

describe.each(Object.keys(DEFS) as (keyof typeof DEFS)[])('structure of %s', (id) => {
  const def = DEFS[id];
  const course = getCourse(id);

  // The route as a polyline with its length so far at each point.
  function samples(step: number) {
    const out: { x: number; z: number; dx: number; dz: number; dist: number }[] = [];
    let dist = 0;
    for (let i = 1; i < course.route.length; i++) {
      const [x0, z0] = course.route[i - 1]!;
      const [x1, z1] = course.route[i]!;
      const len = Math.hypot(x1 - x0, z1 - z0);
      for (let d = 0; d < len - 1e-9; d += step) {
        out.push({ x: x0 + ((x1 - x0) * d) / len, z: z0 + ((z1 - z0) * d) / len, dx: (x1 - x0) / len, dz: (z1 - z0) / len, dist: dist + d });
      }
      dist += len;
    }
    return out;
  }

  // Which segment a route sample belongs to: the last checkpoint at or before it.
  function segmentIndexOf(dist: number): number {
    const starts = course.checkpoints.map((cp) => {
      let best = 0;
      let bestGap = Infinity;
      let along = 0;
      for (let i = 1; i < course.route.length; i++) {
        const [x0, z0] = course.route[i - 1]!;
        const [x1, z1] = course.route[i]!;
        const len = Math.hypot(x1 - x0, z1 - z0);
        const gap = Math.hypot(cp.trigger.center.x - x0, cp.trigger.center.z - z0);
        if (gap < bestGap) {
          bestGap = gap;
          best = along;
        }
        along += len;
      }
      return best;
    });
    let index = 0;
    starts.forEach((start, i) => {
      if (dist >= start - 1e-6) index = i;
    });
    return index;
  }

  // Lateral offsets that lie on the surface at that sample: +-4.5 on the road, +-2.5 in the alley; +-15 on a shoulder (SH2).
  function lateralsAt(dist: number): number[] {
    const type = def.segments[segmentIndexOf(dist)]?.type;
    if (type === 'alley') return [-2.5, 0, 2.5];
    return type === 'ford' ? [-4.5, -2.5, 0, 2.5, 4.5] : [-15, -4.5, -2.5, 0, 2.5, 4.5, 15];
  }

  const rightOf = (s: { dx: number; dz: number }) => ({ x: -s.dz, z: s.dx });

  describe('B2 and B3 over the whole course', () => {
    test('ground lies under every route point and the surface has no cross slope', () => {
      for (const s of samples(1)) {
        const centre = groundHeightAt(course.ground, s.x, s.z);
        expect(centre, `no ground at ${s.x}, ${s.z}`).not.toBeNull();
        const r = rightOf(s);
        for (const lateral of lateralsAt(s.dist)) {
          const h = groundHeightAt(course.ground, s.x + r.x * lateral, s.z + r.z * lateral);
          expect(h, `no ground at dist ${s.dist}, lateral ${lateral}`).not.toBeNull();
          expect(Math.abs(h! - centre!), `dist ${s.dist}, lateral ${lateral}`).toBeLessThanOrEqual(0.02);
        }
      }
    }, 60_000);

    test('the surface has no steps, joins included', () => {
      const limit = 0.02 + 0.05 * Math.tan(degToRad(15));
      for (const lateral of [-2.5, 0, 2.5]) {
        let previous: number | null = null;
        for (const s of samples(0.05)) {
          const r = rightOf(s);
          const h = groundHeightAt(course.ground, s.x + r.x * lateral, s.z + r.z * lateral);
          expect(h, `no ground at dist ${s.dist}, lateral ${lateral}`).not.toBeNull();
          if (previous !== null) expect(Math.abs(h! - previous), `dist ${s.dist}, lateral ${lateral}`).toBeLessThanOrEqual(limit);
          previous = h;
        }
      }
    }, 120_000);
  });

  // Horizontal footprint overlap of two oriented boxes (SAT); heights are ignored.
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
  const asFootprint = (b: Box): Footprint => ({ center: b.center, half: b.halfExtents, rot: b.rot });

  describe('B4 over the whole course', () => {
    test('the lane swept along the route meets no wall (ford rocks excepted) and no prop (barriers excepted)', () => {
      const rv = VEHICLES.rv.halfExtents;
      const walls = course.walls.filter((w) => w.halfExtents.y > 0.5).map(asFootprint);
      const props = course.props
        .filter((p) => p.kind !== 'barrier')
        .map((p) => {
          const half = PROP_KINDS[p.kind as keyof typeof PROP_KINDS].halfExtents;
          return { center: add(p.pose.pos, rotate(p.pose.rot, vec3(0, half.y, 0))), half, rot: p.pose.rot };
        });
      const blockers = [...walls, ...props];
      for (const s of samples(0.5)) {
        const yaw = Math.atan2(-s.dx, -s.dz);
        const lane: Footprint = { center: vec3(s.x, 0, s.z), half: vec3(rv.x + 0.5, 100, rv.z), rot: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) } };
        expect(
          blockers.some((b) => footprintsOverlap(lane, b)),
          `blocked at dist ${s.dist}`,
        ).toBe(false);
      }
    });
  });

  function pointBlocked(boxes: { half: Vec3; center: Vec3; rot: Quat }[], feet: Vec3): boolean {
    const lo = feet.y + PLAYER_RADIUS + PLAYER_OVERLAP_LIFT;
    const hi = feet.y + PLAYER_HEIGHT - PLAYER_RADIUS;
    for (let y = lo; y <= hi + 1e-9; y += (hi - lo) / 10) {
      for (const b of boxes) if (distanceToBox(vec3(feet.x, y, feet.z), b.half, b.center, b.rot) < PLAYER_RADIUS) return true;
    }
    return false;
  }

  describe('B5 every checkpoint', () => {
    test.each(VEHICLE_CONFIGS.map((c) => [c.id, c] as const))('%s: wheels and player slots stand on ground, clear of walls and props', (_id, config) => {
      const blockers = [
        ...course.walls.map((w) => ({ half: w.halfExtents, center: w.center, rot: w.rot })),
        ...course.props.map((p) => {
          const half = PROP_KINDS[p.kind as keyof typeof PROP_KINDS].halfExtents;
          return { half, center: add(p.pose.pos, rotate(p.pose.rot, vec3(0, half.y, 0))), rot: p.pose.rot };
        }),
        ...course.coins.map((c) => ({ half: vec3(COIN_RADIUS, COIN_RADIUS, COIN_RADIUS), center: c.pose.pos, rot: c.pose.rot })),
        ...course.pickups.map((p) => {
          const half = ITEM_KINDS[p.kind as keyof typeof ITEM_KINDS].halfExtents;
          return { half, center: add(p.pose.pos, rotate(p.pose.rot, vec3(0, half.y, 0))), rot: p.pose.rot };
        }),
      ];
      for (const cp of course.checkpoints) {
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const p = add(cp.spawn.pos, rotate(cp.spawn.rot, vec3(sx * config.wheelX, 0, sz * config.wheelZ)));
            const h = groundHeightAt(course.ground, p.x, p.z);
            expect(h, `${cp.id} wheel ${sx},${sz}: no ground`).not.toBeNull();
            expect(Math.abs(h! - p.y), `${cp.id} wheel ${sx},${sz}`).toBeLessThanOrEqual(0.1);
          }
        }
        const fwd = rotate(cp.spawn.rot, vec3(0, 0, -1));
        const heading = Math.atan2(-fwd.x, -fwd.z);
        const turn = { x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) };
        config.spawnSlots.forEach((slot, i) => {
          const at = add(add(cp.spawn.pos, rotate(cp.spawn.rot, vec3(0, config.rideHeight, 0))), rotate(turn, vec3(slot.x, 0, slot.z)));
          const h = groundHeightAt(course.ground, at.x, at.z);
          expect(h, `${cp.id} slot ${i}: no ground`).not.toBeNull();
          expect(pointBlocked(blockers, vec3(at.x, h!, at.z)), `${cp.id} slot ${i}: something in the way`).toBe(false);
        });
      }
    });
  });

  describe('B6 stops', () => {
    test('each zone holds the RV footprint, rests on ground, and the operate point is on ground', () => {
      const rv = VEHICLES.rv.halfExtents;
      expect(STOP_ZONE.x).toBeGreaterThanOrEqual(rv.x);
      expect(STOP_ZONE.z).toBeGreaterThanOrEqual(rv.z);
      for (const stop of course.stops) {
        const base = groundHeightAt(course.ground, stop.zone.center.x, stop.zone.center.z);
        expect(base).not.toBeNull();
        expect(stop.zone.center.y - base!).toBeCloseTo(STOP_ZONE.y, 6);
        const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => add(stop.zone.center, rotate(stop.zone.rot, vec3(sx * STOP_ZONE.x, 0, sz * STOP_ZONE.z)))));
        for (const c of corners) expect(groundHeightAt(course.ground, c.x, c.z), `${stop.id} corner`).toBeCloseTo(base!, 6);
        const o = stop.operatePoint;
        expect(groundHeightAt(course.ground, o.x, o.z)).toBeCloseTo(o.y, 6);
      }
    });
  });

  describe('B7 ids', () => {
    test('are unique across everything placed on the ground', () => {
      const ids = [
        ...course.props,
        ...course.pickups,
        ...course.anchors,
        ...course.coins,
        ...course.stops,
        ...course.checkpoints,
      ].map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    test('building it again gives an equal course', () => {
      expect(buildCourse(def)).toEqual(course);
      expect(Object.isFrozen(course)).toBe(true);
    });
  });

  describe('B8 a world', () => {
    test.each(VEHICLE_CONFIGS.map((c) => c.id))('%s rests at cp-0 for 2 s', (vehicleId) => {
      const world = createWorld(RAPIER, { courseId: id, vehicleId });
      const start = world.snapshot().vehicle.pos;
      for (let i = 0; i < 2 * TICK_RATE; i++) world.step(new Map());
      const end = world.snapshot().vehicle.pos;
      expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThan(0.05);
      world.dispose();
    });
  });

  test('T2: no checkpoint spawn is on sand', () => {
    for (const cp of course.checkpoints) {
      const surface = groundSurfaceAt(course.ground, cp.spawn.pos.x, cp.spawn.pos.z);
      expect(surface, cp.id).not.toBeNull();
      expect(surface, cp.id).not.toBe('sand');
    }
  });
});

describe('airport', () => {
  const airportCourse = getCourse('airport');

  test('T1: all six segment types, one fuel stop with its shop, one garage, coins, every pickup kind', () => {
    expect(new Set(airport.segments.map((s) => s.type))).toEqual(new Set(['road', 'alley', 'sand', 'ford', 'bank', 'roadworks']));
    expect(airportCourse.stops.map((s) => s.kind).sort()).toEqual(['fuel', 'garage']);
    expect(airportCourse.stops.find((s) => s.kind === 'fuel')!.shopCounter).toBeDefined();
    expect(airportCourse.coins.length).toBeGreaterThan(0);
    expect(new Set(airportCourse.pickups.map((p) => p.kind))).toEqual(new Set(Object.keys(ITEM_KINDS)));
  });

  test('T2: the sand segment\'s checkpoint spawn is on a non-sand surface', () => {
    const sandIndex = airport.segments.findIndex((s) => s.type === 'sand');
    const cp = airportCourse.checkpoints.find((c) => c.id === `cp-${sandIndex}`)!;
    expect(cp).toBeDefined();
    const surface = groundSurfaceAt(airportCourse.ground, cp.spawn.pos.x, cp.spawn.pos.z);
    expect(surface).not.toBeNull();
    expect(surface).not.toBe('sand');
  });
});

describe('airport hazards', () => {
  const airportCourse = getCourse('airport');
  const hazardProps = (index: number) => {
    const debris = (airport.segments[index] as { debris?: number }).debris ?? 0;
    const ofSegment = airportCourse.props.filter((p) => p.id.startsWith(`s${index}-`));
    return ofSegment.slice(debris);
  };

  test('T6: hazards sit on segments 1, 2 and 12 only, with 6, 4 and 3 props', () => {
    airport.segments.forEach((seg, i) => expect(seg.type === 'road' && seg.hazards !== undefined, `segment ${i}`).toBe([1, 2, 12].includes(i)));
    expect(hazardProps(1)).toHaveLength(6);
    expect(hazardProps(2)).toHaveLength(4);
    expect(hazardProps(12)).toHaveLength(3);
  });

  test('T6: no hazard prop lies within COIN_RADIUS + 1 m of a coin', () => {
    for (const index of [1, 2, 12]) {
      for (const p of hazardProps(index)) {
        const half = PROP_KINDS[p.kind as keyof typeof PROP_KINDS].halfExtents;
        const center = add(p.pose.pos, rotate(p.pose.rot, vec3(0, half.y, 0)));
        for (const coin of airportCourse.coins) {
          expect(distanceToBox(coin.pose.pos, half, center, p.pose.rot), `${p.id} and ${coin.id}`).toBeGreaterThanOrEqual(COIN_RADIUS + 1);
        }
      }
    }
  });
});

describe('the demo', () => {
  test.each(VEHICLE_CONFIGS.map((c) => c.id))('%s: the world lists the first road\'s jerrycan and toolbox as pickups', (vehicleId) => {
    const world = createWorld(RAPIER, { courseId: 'segment-demo', vehicleId });
    const ids = world.snapshot().props.map((prop) => prop.id);
    expect(course.pickups.map((p) => p.kind).sort()).toEqual(['jerrycan', 'toolbox']);
    for (const pickup of course.pickups) expect(ids).toContain(pickup.id);
    world.dispose();
  });
});

describe('the sand', () => {
  test('the RV from the sand checkpoint at full throttle crosses the sand within 30 s', () => {
    const sandIndex = segmentDemo.segments.findIndex((s) => s.type === 'sand');
    const cp = course.checkpoints[sandIndex]!;
    const sand = course.ground.find((g) => g.surface === 'sand')!;
    const forward = rotate(sand.rot, vec3(0, 0, -1));
    const rig = createRig(RAPIER, 'rv', cp.spawn, course);
    let crossedAt: number | null = null;
    for (let second = 1; second <= 30 && crossedAt === null; second++) {
      rig.run(1, { throttle: 1 });
      const pos = rig.vehicle.state().pos;
      const along = (pos.x - sand.center.x) * forward.x + (pos.z - sand.center.z) * forward.z;
      if (along > sand.halfExtents.z) crossedAt = second;
    }
    rig.world.free();
    expect(crossedAt).not.toBeNull();
  });
});
