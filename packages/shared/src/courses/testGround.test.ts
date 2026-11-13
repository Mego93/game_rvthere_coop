import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, test } from 'vitest';
import { GRAVITY, PROP_KINDS, REFERENCE_SLOPES_DEG, type ReferenceSlope } from '../constants';
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
