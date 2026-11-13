import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, test } from 'vitest';
import { GROUP_GROUND, GROUP_PLAYER, GROUP_WORLD, groups } from './groups';

beforeAll(async () => {
  await RAPIER.init();
});

test('groups packs membership and filter', () => {
  expect(groups(1, 1)).toBe(0x00010001);
  expect(groups(2, 0)).toBe(0x00020000);
  expect(groups(0xffff, 0xffff)).toBe(0xffffffff);
});

function ballAbove(world: RAPIER.World, membership: number, filter: number) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.6, 0));
  world.createCollider(RAPIER.ColliderDesc.ball(0.5).setCollisionGroups(groups(membership, filter)), body);
  return body;
}

function dropOntoGround(membership: number, filter: number): number {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(10, 0.5, 10).setTranslation(0, -0.5, 0).setCollisionGroups(groups(GROUP_WORLD, GROUP_WORLD)),
  );
  const body = ballAbove(world, membership, filter);
  for (let i = 0; i < 60; i++) world.step();
  const y = body.translation().y;
  world.free();
  return y;
}

test('a world-group collider rests on the ground', () => {
  expect(dropOntoGround(GROUP_WORLD, GROUP_WORLD)).toBeGreaterThan(0.4);
});

test('a player-group collider with an empty filter falls through the ground', () => {
  expect(dropOntoGround(GROUP_PLAYER, 0)).toBeLessThan(-1);
});

function groundAndWall() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const ground = world.createCollider(
    RAPIER.ColliderDesc.cuboid(5, 0.5, 5)
      .setTranslation(-10, -0.5, 0)
      .setCollisionGroups(groups(GROUP_WORLD | GROUP_GROUND, GROUP_WORLD)),
  );
  const wall = world.createCollider(
    RAPIER.ColliderDesc.cuboid(5, 1, 5).setTranslation(10, 1, 0).setCollisionGroups(groups(GROUP_WORLD, GROUP_WORLD)),
  );
  world.step();
  return { world, ground, wall };
}

test('a ray with the ground filter hits a ground collider and skips a wall collider', () => {
  const { world, ground } = groundAndWall();
  const down = (x: number) => new RAPIER.Ray({ x, y: 3, z: 0 }, { x: 0, y: -1, z: 0 });
  const filter = groups(GROUP_WORLD, GROUP_GROUND);
  expect(world.castRay(down(-10), 6, true, undefined, filter)?.collider.handle).toBe(ground.handle);
  expect(world.castRay(down(10), 6, true, undefined, filter)).toBeNull();
  expect(world.castRay(down(10), 6, true, undefined, groups(GROUP_WORLD, GROUP_WORLD))).not.toBeNull();
});

test('ground and wall colliders both still collide with a world-group ball', () => {
  const { world } = groundAndWall();
  const drop = (x: number, y: number) => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, 0));
    world.createCollider(RAPIER.ColliderDesc.ball(0.5).setCollisionGroups(groups(GROUP_WORLD, GROUP_WORLD)), body);
    return body;
  };
  const onGround = drop(-10, 2);
  const onWall = drop(10, 4);
  for (let i = 0; i < 120; i++) world.step();
  expect(onGround.translation().y).toBeGreaterThan(0.4);
  expect(onWall.translation().y).toBeGreaterThan(2.4);
});
