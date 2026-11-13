import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { GRAVITY, PROP_KINDS, TICK_DT } from './constants';
import { testGround } from './courses/testGround';
import { GROUP_WORLD, groups } from './groups';
import { IDENTITY, add, rotate, vec3, type Vec3 } from './math';
import { createProps, propCentre } from './props';
import { withProps } from './testRig';
import { buildStatics } from './statics';
import { NEUTRAL_INPUT } from './protocol';
import { createWorld, type World } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

function rig(course = testGround) {
  const physics = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  physics.timestep = TICK_DT;
  buildStatics(RAPIER, physics, course);
  const props = createProps(RAPIER, physics, course);
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) physics.step();
  };
  return { physics, props, run };
}

const pos = (world: World, id: string) => world.snapshot().props.find((prop) => prop.id === id)!.pos;
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('createProps', () => {
  test('spawns every prop at its pose and at rest after 2 s', () => {
    const { props, run } = rig();
    const start = props.snapshot();
    expect(start.map((prop) => prop.id)).toEqual(testGround.props.map((prop) => prop.id));
    run(2);
    for (const [i, prop] of props.snapshot().entries()) {
      const placed = testGround.props[i]!;
      const config = PROP_KINDS[placed.kind as keyof typeof PROP_KINDS];
      expect(prop.kind).toBe(placed.kind);
      expect(dist(prop.pos, propCentre(placed, config))).toBeLessThan(0.01);
      expect(prop.pos.y).toBeCloseTo(config.halfExtents.y, 2);
      const v = props.get(prop.id)!.body.linvel();
      expect(Math.hypot(v.x, v.y, v.z)).toBeLessThan(0.01);
    }
  });

  test('the centre is half a height above the bottom face, rotated with the pose', () => {
    const config = PROP_KINDS.crate;
    expect(propCentre({ id: 'a', kind: 'crate', pose: { pos: vec3(1, 2, 3), rot: IDENTITY } }, config)).toEqual(vec3(1, 2.3, 3));
    const rot = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };
    const centre = propCentre({ id: 'a', kind: 'crate', pose: { pos: vec3(0, 0, 0), rot } }, config);
    expect(centre).toEqual(add(vec3(0, 0, 0), rotate(rot, vec3(0, 0.3, 0))));
  });

  test('throws on an unknown kind', () => {
    const course = withProps({ ...testGround, props: [] }, [{ id: 'x', kind: 'piano', pose: { pos: vec3(0, 0, 0), rot: IDENTITY } }]);
    expect(() => rig(course)).toThrow();
  });

  test('a crate dropped from 3 m lands on the ground', () => {
    const { props, run } = rig();
    props.get('crate-1')!.body.setTranslation({ x: 10, y: 3, z: 8 }, true);
    run(2);
    expect(props.get('crate-1')!.body.translation().y).toBeCloseTo(0.3, 2);
  });

  test('a prop below the kill plane returns to spawn at rest; a heavy one locks', () => {
    const { props, run } = rig();
    props.get('crate-1')!.body.setTranslation({ x: 0, y: -30, z: 0 }, true);
    props.get('barrier-1')!.body.setTranslation({ x: 0, y: -30, z: 0 }, true);
    props.setLocked('barrier-1', false);
    expect(props.killPlane(testGround.killPlaneY).sort()).toEqual(['barrier-1', 'crate-1']);
    run(1);
    expect(props.get('crate-1')!.body.translation().x).toBeCloseTo(10, 2);
    expect(props.get('crate-1')!.body.translation().y).toBeCloseTo(0.3, 2);
    expect(props.get('barrier-1')!.locked).toBe(true);
    expect(props.get('barrier-1')!.body.translation().x).toBeCloseTo(-10, 2);
  });

  test('a held prop collides with nothing and release restores it', () => {
    const { physics, props, run } = rig();
    const crate = props.get('crate-1')!;
    props.hold('crate-1', 'p1');
    expect(crate.heldBy).toBe('p1');
    const drop = (y: number) =>
      physics.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(10, y, 8));
    const box = drop(2);
    physics.createCollider(RAPIER.ColliderDesc.cuboid(0.2, 0.2, 0.2).setCollisionGroups(groups(GROUP_WORLD, GROUP_WORLD)), box);
    crate.body.setTranslation({ x: 10, y: 1, z: 8 }, true);
    run(1);
    expect(box.translation().y).toBeCloseTo(0.2, 2);
    expect(crate.body.translation().y).toBeCloseTo(1, 5);

    props.release('crate-1', vec3(12, 1, 8), IDENTITY, vec3(0, 0, 0));
    expect(crate.heldBy).toBeNull();
    const box2 = physics.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(12, 3, 8));
    physics.createCollider(RAPIER.ColliderDesc.cuboid(0.2, 0.2, 0.2).setCollisionGroups(groups(GROUP_WORLD, GROUP_WORLD)), box2);
    run(2);
    expect(crate.body.translation().y).toBeCloseTo(0.3, 2);
    expect(box2.translation().y).toBeGreaterThan(0.45);
  });

  test('unlocking lets an impulse move the barrier and locking stops it', () => {
    const { props, run } = rig();
    const body = props.get('barrier-1')!.body;
    const push = () => body.applyImpulse({ x: 600, y: 0, z: 0 }, true);
    push();
    run(1);
    expect(body.translation().x).toBeCloseTo(-10, 2);
    props.setLocked('barrier-1', false);
    push();
    run(1);
    expect(body.translation().x).toBeGreaterThan(-9.5);
    props.setLocked('barrier-1', true);
    const x = body.translation().x;
    push();
    run(1);
    expect(Math.abs(body.translation().x - x)).toBeLessThan(0.01);
  });

  test('relocking zeroes the horizontal velocity, so the next unlock starts at rest', () => {
    const { props, run } = rig();
    const body = props.get('barrier-1')!.body;
    props.setLocked('barrier-1', false);
    body.setLinvel({ x: 3, y: 0, z: 2 }, true);
    props.setLocked('barrier-1', true);
    props.setLocked('barrier-1', false);
    const x = body.translation().x;
    const z = body.translation().z;
    run(1);
    expect(Math.hypot(body.translation().x - x, body.translation().z - z)).toBeLessThan(0.01);
  });

  test('a held prop is not reset by the kill plane', () => {
    const { props } = rig();
    props.hold('crate-1', 'p1');
    props.get('crate-1')!.body.setTranslation({ x: 0, y: -30, z: 0 }, true);
    expect(props.killPlane(testGround.killPlaneY)).toEqual([]);
  });

  test('byCollider finds the prop; snapshot is finite', () => {
    const { props } = rig();
    const crate = props.get('crate-2')!;
    expect(props.byCollider(crate.colliderHandle)).toBe(crate);
    expect(props.byCollider(-1)).toBeUndefined();
    for (const prop of props.snapshot()) {
      for (const n of [prop.pos.x, prop.pos.y, prop.pos.z, prop.rot.x, prop.rot.y, prop.rot.z, prop.rot.w]) {
        expect(Number.isFinite(n)).toBe(true);
      }
    }
  });
});

describe('props in the world', () => {
  test('the snapshot lists every prop in course order with finite poses', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    for (let i = 0; i < 30; i++) world.step(new Map());
    const { props } = world.snapshot();
    expect(props.map((prop) => prop.id)).toEqual(['crate-1', 'crate-2', 'crate-3', 'barrier-1']);
    for (const prop of props) {
      for (const n of [prop.pos.x, prop.pos.y, prop.pos.z, prop.rot.x, prop.rot.y, prop.rot.z, prop.rot.w]) {
        expect(Number.isFinite(n)).toBe(true);
      }
    }
  });

  test('a prop teleported below the kill plane is back at spawn and at rest after the next step', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    for (let i = 0; i < 30; i++) world.step(new Map());
    world.debugBody('barrier-1')!.setTranslation({ x: 0, y: -30, z: 0 }, true);
    world.debugBody('crate-3')!.setTranslation({ x: 0, y: -30, z: 0 }, true);
    world.step(new Map());
    expect(dist(pos(world, 'barrier-1'), vec3(-10, 0.5, 10))).toBeLessThan(0.01);
    expect(dist(pos(world, 'crate-3'), vec3(10, 0.3, 11))).toBeLessThan(0.01);
    const body = world.debugBody('crate-3')!;
    expect(Math.hypot(body.linvel().x, body.linvel().y, body.linvel().z)).toBeLessThan(0.01);
    for (let i = 0; i < 60; i++) world.step(new Map());
    expect(dist(pos(world, 'crate-3'), vec3(10, 0.3, 11))).toBeLessThan(0.01);
  });

  test('debugBody finds the vehicle and props, and nothing else', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    expect(world.debugBody('vehicle')).toBeDefined();
    expect(world.debugBody('crate-1')).toBeDefined();
    expect(world.debugBody('nope')).toBeUndefined();
  });

  test('a locked barrier driven into by the Lodgy at full throttle does not move (J2)', () => {
    const lodgyHalfZ = 2.25;
    // The barrier's near (+Z) face is 8 m from the Lodgy's front (-Z) face at the spawn on x = 0.
    const barrierZ = -(lodgyHalfZ + 8 + PROP_KINDS.barrier.halfExtents.z);
    const course = withProps({ ...testGround, props: [] }, [
      { id: 'barrier-1', kind: 'barrier', pose: { pos: vec3(0, 0, barrierZ), rot: IDENTITY } },
    ]);
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, course);
    world.addPlayer('d');
    // Slot 0 is at the driver door.
    world.step(new Map([['d', { ...NEUTRAL_INPUT, seq: 0, interact: true }]]));
    world.step(new Map());
    expect(world.snapshot().players[0]!.seat).toBe('driver');
    for (let i = 0; i < 60; i++) world.step(new Map());
    const before = pos(world, 'barrier-1');
    const drive = new Map([['d', { ...NEUTRAL_INPUT, seq: 0, moveY: 1 }]]);
    let closest = Infinity;
    for (let i = 0; i < 600; i++) {
      world.step(drive);
      closest = Math.min(closest, world.snapshot().vehicle.pos.z - (barrierZ + PROP_KINDS.barrier.halfExtents.z + lodgyHalfZ));
    }
    const after = pos(world, 'barrier-1');
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.01);
    // The vehicle did reach the barrier.
    expect(world.snapshot().vehicle.pos.z).toBeLessThan(barrierZ + PROP_KINDS.barrier.halfExtents.z + lodgyHalfZ + 0.5);
    expect(closest).toBeLessThan(0.5);
  });
});
