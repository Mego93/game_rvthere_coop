import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, test } from 'vitest';
import { ANCHOR_HEIGHT, COIN_HEIGHT, GRAVITY, ITEM_KINDS, PROP_KINDS, REFERENCE_SLOPES_DEG, type ReferenceSlope } from '../constants';
import { degToRad } from '../math';
import { buildStatics } from '../statics';
import { getCourse } from './index';
import { SAND_PATCH_CENTER, slopePose, testGround } from './testGround';

beforeAll(async () => {
  await RAPIER.init();
});

function build() {
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  const statics = buildStatics(RAPIER, world, testGround);
  world.step();
  return { world, statics };
}

// Casts straight down from 1 m above the point; returns the hit distance and surface.
function probe(x: number, y: number, z: number) {
  const { world, statics } = build();
  const hit = world.castRay(new RAPIER.Ray({ x, y: y + 1, z }, { x: 0, y: -1, z: 0 }), 50, true);
  if (!hit) return null;
  return { distance: hit.timeOfImpact, surface: statics.surfaceOf(hit.collider.handle) };
}

test('the registry returns the test ground and rejects unknown ids', () => {
  expect(getCourse('test')).toBe(testGround);
  expect(() => getCourse('nope')).toThrow('Unknown course: nope');
});

test('has at least two checkpoints and a finish', () => {
  expect(testGround.checkpoints.length).toBeGreaterThanOrEqual(2);
  expect(testGround.finish.halfExtents.x).toBeGreaterThan(0);
});

test('every checkpoint spawn pose rests on road', () => {
  for (const cp of testGround.checkpoints) {
    const hit = probe(cp.spawn.pos.x, cp.spawn.pos.y, cp.spawn.pos.z);
    expect(hit, cp.id).not.toBeNull();
    expect(hit!.distance, cp.id).toBeCloseTo(1, 2);
    expect(hit!.surface, cp.id).toBe('road');
  }
});

test('the sand patch reports sand', () => {
  expect(probe(SAND_PATCH_CENTER.x, 0, SAND_PATCH_CENTER.z)!.surface).toBe('sand');
});

test.each(Object.keys(REFERENCE_SLOPES_DEG) as ReferenceSlope[])('the %s slope rises toward -Z at its angle', (slope) => {
  const pose = slopePose(slope, 10);
  expect(pose.pos.y).toBeCloseTo(10 * Math.sin(degToRad(REFERENCE_SLOPES_DEG[slope])));
  const hit = probe(pose.pos.x, pose.pos.y, pose.pos.z);
  expect(hit!.distance).toBeCloseTo(1, 1);
  expect(hit!.surface).toBe('road');
});

test('props are known kinds with unique ids and rest on ground', () => {
  expect(testGround.props).toHaveLength(4);
  const ids = testGround.props.map((prop) => prop.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const prop of testGround.props) {
    expect(Object.hasOwn(PROP_KINDS, prop.kind), prop.id).toBe(true);
    const hit = probe(prop.pose.pos.x, prop.pose.pos.y, prop.pose.pos.z);
    expect(hit, prop.id).not.toBeNull();
    expect(hit!.distance, prop.id).toBeCloseTo(1, 2);
  }
});

test('pickups are item kinds and rest on ground', () => {
  expect(testGround.pickups.map((pickup) => pickup.id)).toEqual(['jerrycan-1', 'jerrycan-2', 'toolbox-1', 'healthKit-1']);
  for (const pickup of testGround.pickups) {
    expect(Object.hasOwn(ITEM_KINDS, pickup.kind), pickup.id).toBe(true);
    const hit = probe(pickup.pose.pos.x, pickup.pose.pos.y, pickup.pose.pos.z);
    expect(hit, pickup.id).not.toBeNull();
    expect(hit!.distance, pickup.id).toBeCloseTo(1, 2);
  }
});

test('ids are unique across anchors, props and pickups', () => {
  const ids = [...testGround.anchors, ...testGround.props, ...testGround.pickups].map((placed) => placed.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test('the three anchors exist; anchor-2 lies on the steep slope and anchor-3 is 10 m beyond the sand patch', () => {
  const byId = new Map(testGround.anchors.map((anchor) => [anchor.id, anchor.pose.pos]));
  expect([...byId.keys()]).toEqual(['anchor-1', 'anchor-2', 'anchor-3']);
  const two = byId.get('anchor-2')!;
  const hit = probe(two.x, two.y, two.z);
  expect(Math.abs(hit!.distance - 1)).toBeLessThan(0.05);
  expect(hit!.surface).toBe('road');
  const three = byId.get('anchor-3')!;
  expect(three.x).toBe(SAND_PATCH_CENTER.x);
  expect(three.z).toBe(SAND_PATCH_CENTER.z - 15 - 10);
  expect(ANCHOR_HEIGHT).toBe(0.5);
});

test('four coins, coin-1 to coin-4, float at the planned positions', () => {
  expect(testGround.coins.map((coin) => [coin.id, coin.kind, coin.pose.pos.x, coin.pose.pos.y, coin.pose.pos.z])).toEqual([
    ['coin-1', 'coin', 3, COIN_HEIGHT, -12],
    ['coin-2', 'coin', -3, COIN_HEIGHT, -28],
    ['coin-3', 'coin', 6, COIN_HEIGHT, -36],
    ['coin-4', 'coin', -6, COIN_HEIGHT, -44],
  ]);
});

test('two stops, stop-fuel on the right and stop-garage on the left at z = -20, at the planned places', () => {
  expect(testGround.stops.map((stop) => stop.id)).toEqual(['stop-fuel', 'stop-garage']);
  const [fuel, garage] = testGround.stops;
  expect([fuel!.kind, garage!.kind]).toEqual(['fuel', 'garage']);
  expect(fuel!.operatePoint).toEqual({ x: 11.5, y: 0, z: -20 });
  expect(fuel!.shopCounter).toEqual({ x: 11.5, y: 0, z: -22 });
  expect(garage!.operatePoint).toEqual({ x: -11.5, y: 0, z: -20 });
  expect(garage!.shopCounter).toBeNull();
  expect(fuel!.zone.center).toEqual({ x: 8, y: 2, z: -20 });
  expect(garage!.zone.center).toEqual({ x: -8, y: 2, z: -20 });
});

test('the pads are appended after the existing ground pieces, so the main slab stays first, and rest on the road', () => {
  const ground = testGround.ground;
  expect(ground[0]!.halfExtents.x).toBe(150);
  expect(ground).toHaveLength(8);
  const [fuelPad, garagePad] = ground.slice(-2);
  expect([fuelPad!.center.x, fuelPad!.center.z]).toEqual([9, -20]);
  expect([garagePad!.center.x, garagePad!.center.z]).toEqual([-9, -20]);
  for (const stop of testGround.stops) {
    const hit = probe(stop.operatePoint.x, stop.operatePoint.y, stop.operatePoint.z);
    expect(hit!.distance, stop.id).toBeCloseTo(1, 2);
  }
});

test('the stop zones and operate points keep clear of the spawn, the checkpoint triggers, the ramp, the props and the pickups', () => {
  const clear = (zone: { center: { x: number; z: number }; halfExtents: { x: number; z: number } }, x: number, z: number, hx: number, hz: number) =>
    Math.abs(zone.center.x - x) > zone.halfExtents.x + hx || Math.abs(zone.center.z - z) > zone.halfExtents.z + hz;
  for (const stop of testGround.stops) {
    for (const cp of testGround.checkpoints) {
      expect(clear(stop.zone, cp.trigger.center.x, cp.trigger.center.z, cp.trigger.halfExtents.x, cp.trigger.halfExtents.z), `${stop.id} ${cp.id}`).toBe(true);
    }
    // The ramp at x = 8 from z = -60, 6 wide and 6 long.
    expect(clear(stop.zone, 8, -57, 3, 3), `${stop.id} ramp`).toBe(true);
    for (const placed of [...testGround.props, ...testGround.pickups, ...testGround.coins, ...testGround.anchors]) {
      expect(clear(stop.zone, placed.pose.pos.x, placed.pose.pos.z, 1, 1), `${stop.id} ${placed.id}`).toBe(true);
    }
  }
});
