import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { ROAD_WIDTH, SHOULDER_WIDTH, STOP_PAD, TICK_RATE } from './constants';
import { buildCourse } from './courses/build';
import { groundHeightAt, groundSurfaceAt } from './groundProbe';
import { NEUTRAL_INPUT } from './protocol';
import { buildSegment, offsetFrom, type SegmentDef } from './segments';
import { createWorld } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const OFF = ROAD_WIDTH / 2 + 10;

const SHOULDERED: [string, SegmentDef][] = [
  ['straight road', { type: 'road', length: 60 }],
  ['curved road', { type: 'road', length: 90, curve: Math.PI / 2 }],
  ['curved road, other way', { type: 'road', length: 90, curve: -Math.PI / 2 }],
  ['tight curve', { type: 'road', length: 20, curve: Math.PI }],
  ['climbing road', { type: 'road', length: 60, slope: 8 }],
  ['road with a stop', { type: 'road', length: 60, stop: { kind: 'fuel', side: 1, along: 30 } }],
  ['sand', { type: 'sand', length: 60, palms: 2 }],
  ['bank', { type: 'bank', height: 3, gradient: 15, anchors: 2 }],
  ['roadworks', { type: 'roadworks', length: 60, obstacles: 3 }],
];

describe('SH2 shoulders', () => {
  test('SHOULDER_WIDTH is 25 m', () => {
    expect(SHOULDER_WIDTH).toBe(25);
  });

  test.each(SHOULDERED)('%s: the surface 10 m past the road edge, both sides, equals the road at the same distance along', (_name, def) => {
    const seg = buildSegment(def);
    const lengthAlong = (def as { length?: number }).length ?? 0;
    const end = def.type === 'bank' ? 15 + 10 + def.height / Math.tan((def.gradient * Math.PI) / 180) : lengthAlong;
    for (let along = 0.25; along < end - 1; along += 0.5) {
      const s = seg.surfaceAt(along);
      const centre = groundHeightAt(seg.ground, s.pos.x, s.pos.z);
      expect(centre, `centre at ${along}`).not.toBeNull();
      for (const side of [-1, 1]) {
        const p = offsetFrom(s, side * OFF);
        const h = groundHeightAt(seg.ground, p.x, p.z);
        expect(h, `no ground at along ${along}, side ${side}`).not.toBeNull();
        expect(Math.abs(h! - centre!), `along ${along}, side ${side}`).toBeLessThanOrEqual(0.001);
      }
    }
  });

  test.each(SHOULDERED)('%s: the shoulder reaches SHOULDER_WIDTH past the road edge and no further', (_name, def) => {
    const seg = buildSegment(def);
    const s = seg.surfaceAt(10);
    for (const side of [-1, 1]) {
      const inside = offsetFrom(s, side * (ROAD_WIDTH / 2 + SHOULDER_WIDTH - 0.5));
      const outside = offsetFrom(s, side * (ROAD_WIDTH / 2 + SHOULDER_WIDTH + 0.5));
      expect(groundHeightAt(seg.ground, inside.x, inside.z), `inside, side ${side}`).not.toBeNull();
      expect(groundHeightAt(seg.ground, outside.x, outside.z), `outside, side ${side}`).toBeNull();
    }
  });

  test('gravel beside the road, the apron, the bank and roadworks; sand beside the sand', () => {
    const road = buildSegment({ type: 'road', length: 60 });
    expect(groundSurfaceAt(road.ground, OFF, -30)).toBe('gravel');
    expect(groundSurfaceAt(road.ground, -OFF, -30)).toBe('gravel');
    expect(groundSurfaceAt(road.ground, 0, -30)).toBe('road');
    const sand = buildSegment({ type: 'sand', length: 60, palms: 0 });
    expect(groundSurfaceAt(sand.ground, OFF, -20)).toBe('gravel');
    expect(groundSurfaceAt(sand.ground, OFF, -80)).toBe('sand');
    expect(groundSurfaceAt(sand.ground, -OFF, -80)).toBe('sand');
    const bank = buildSegment({ type: 'bank', height: 3, gradient: 15, anchors: 0 });
    expect(groundSurfaceAt(bank.ground, OFF, -5)).toBe('gravel');
    const works = buildSegment({ type: 'roadworks', length: 60, obstacles: 3 });
    expect(groundSurfaceAt(works.ground, OFF, -30)).toBe('gravel');
  });

  test.each([
    ['alley', { type: 'alley', length: 40, clutter: 0 }],
    ['ford', { type: 'ford', width: 24, rocks: 0 }],
  ] as [string, SegmentDef][])('%s has no shoulders', (_name, def) => {
    const seg = buildSegment(def);
    const half = def.type === 'alley' ? 3 : ROAD_WIDTH / 2;
    const along = def.type === 'alley' ? 20 : 0;
    const x = half + 2;
    expect(groundHeightAt(seg.ground, x, -(along || 10))).toBeNull();
    expect(groundHeightAt(seg.ground, -x, -(along || 10))).toBeNull();
  });

  test('the width, route, exit and surfaceAt of a segment do not change', () => {
    const seg = buildSegment({ type: 'road', length: 60 });
    expect(seg.width).toBe(ROAD_WIDTH);
    expect(seg.exit.pos.z).toBeCloseTo(-60, 9);
    expect(seg.route).toEqual([[0, 0], ...seg.route.slice(1)]);
  });

  test('SH3: a stop pad is 0.01 m above the shoulder it overlaps, and wins the surface probe', () => {
    const seg = buildSegment({ type: 'road', length: 60, stop: { kind: 'fuel', side: 1, along: 30 } });
    const padX = ROAD_WIDTH / 2 + STOP_PAD.x;
    const onPad = groundHeightAt(seg.ground, padX, -30)!;
    const beside = groundHeightAt(seg.ground, padX, -30 - STOP_PAD.z - 1)!;
    expect(onPad - beside).toBeCloseTo(0.01, 9);
    expect(groundSurfaceAt(seg.ground, padX, -30)).toBe('road');
    const stop = seg.stops[0]!;
    expect(stop.zone.center.y - groundHeightAt(seg.ground, stop.zone.center.x, stop.zone.center.z)!).toBeCloseTo(2, 9);
    expect(groundHeightAt(seg.ground, stop.operatePoint.x, stop.operatePoint.z)).toBeCloseTo(stop.operatePoint.y, 9);
  });
});

describe('SH4 worlds', () => {
  test('the Lodgy parked 12 m off the road stays on the ground for 2 s', () => {
    const course = buildCourse({ id: 'shoulder-road', segments: [{ type: 'road', length: 120 }], targetTime: 60 });
    const world = createWorld(RAPIER, { courseId: 'shoulder-road', vehicleId: 'lodgy' }, course);
    const body = world.debugBody('vehicle')!;
    const rest = body.translation();
    body.setTranslation({ x: 12, y: rest.y, z: -50 }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    for (let i = 0; i < 2 * TICK_RATE; i++) world.step(new Map());
    const end = world.snapshot().vehicle.pos;
    expect(Math.abs(end.y - rest.y)).toBeLessThan(0.1);
    expect(Math.abs(end.x - 12)).toBeLessThan(0.5);
    expect(world.status().restarts).toBe(0);
    world.dispose();
  });

  test('a player 15 m off the road on a sand segment stays up', () => {
    const course = buildCourse({ id: 'shoulder-sand', segments: [{ type: 'road', length: 60 }, { type: 'sand', length: 80, palms: 0 }], targetTime: 60 });
    const world = createWorld(RAPIER, { courseId: 'shoulder-sand', vehicleId: 'lodgy' }, course);
    world.addPlayer('p1');
    world.teleportPlayer('p1', { x: 15, y: 0.5, z: -60 - 50 - 40 });
    for (let i = 0; i < 2 * TICK_RATE; i++) world.step(new Map([['p1', { ...NEUTRAL_INPUT, seq: i }]]));
    const player = world.snapshot().players.find((p) => p.playerId === 'p1')!;
    expect(Math.abs(player.pos.y)).toBeLessThan(0.1);
    expect(Math.abs(player.pos.x - 15)).toBeLessThan(1);
    world.dispose();
  });
});
