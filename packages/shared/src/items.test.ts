import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { DROP_HEIGHT, ITEM_KINDS, PLAYER_CONTROLLER_OFFSET, TICK_DT } from './constants';
import type { BuiltCourse, Placed } from './course';
import { testGround } from './courses/testGround';
import { createItems } from './items';
import { IDENTITY, deepFreeze, vec3, type Vec3 } from './math';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { buildStatics } from './statics';
import { createWorld, type World } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const input = (fields: Partial<PlayerInput>): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });
const placed = (id: string, kind: string, x: number, z: number): Placed => ({ id, kind, pose: { pos: vec3(x, 0, z), rot: IDENTITY } });
const courseWith = (pickups: Placed[]): BuiltCourse => deepFreeze({ ...testGround, pickups });
const PLAIN = courseWith([]);

function standalone(course: BuiltCourse = testGround) {
  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  physics.timestep = TICK_DT;
  buildStatics(RAPIER, physics, course);
  const items = createItems(RAPIER, physics, course);
  return { physics, items, run: (ticks: number) => { for (let i = 0; i < ticks; i++) physics.step(); } };
}

describe('createItems', () => {
  test('course pickups rest on the ground in course order, with their kind', () => {
    const { physics, items, run } = standalone();
    run(120);
    const list = items.snapshot();
    expect(list.map((item) => [item.id, item.kind])).toEqual([
      ['jerrycan-1', 'jerrycan'],
      ['jerrycan-2', 'jerrycan'],
      ['toolbox-1', 'toolbox'],
    ]);
    for (const item of list) {
      const half = ITEM_KINDS[item.kind as keyof typeof ITEM_KINDS].halfExtents;
      expect(item.pos.y, item.id).toBeCloseTo(half.y, 2);
    }
    physics.free();
  });

  test('take removes the body and returns the kind; a second take returns null', () => {
    const { physics, items } = standalone();
    expect(items.take('toolbox-1')).toBe('toolbox');
    expect(items.take('toolbox-1')).toBeNull();
    expect(items.get('toolbox-1')).toBeUndefined();
    expect(items.snapshot().map((item) => item.id)).toEqual(['jerrycan-1', 'jerrycan-2']);
    physics.free();
  });

  test('drop counts item-1, item-2 and places the box with its bottom face at the point, after the course pickups', () => {
    const { physics, items } = standalone();
    expect(items.drop('toolbox', vec3(5, 1, 5))).toBe('item-1');
    expect(items.drop('jerrycan', vec3(6, 1, 5))).toBe('item-2');
    items.take('item-1');
    expect(items.drop('jerrycan', vec3(7, 1, 5))).toBe('item-3');
    const list = items.snapshot();
    expect(list.map((item) => item.id)).toEqual(['jerrycan-1', 'jerrycan-2', 'toolbox-1', 'item-2', 'item-3']);
    expect(list[3]!.pos.y).toBeCloseTo(1 + ITEM_KINDS.jerrycan.halfExtents.y, 6);
    physics.free();
  });

  test('below the kill plane a dropped item is removed and a course pickup returns to its spawn', () => {
    const { physics, items, run } = standalone();
    run(60);
    items.get('jerrycan-1')!.body.setTranslation(vec3(-4, testGround.killPlaneY - 5, 14), true);
    items.get('jerrycan-1')!.body.setLinvel(vec3(3, -3, 3), true);
    const dropped = items.drop('toolbox', vec3(0, testGround.killPlaneY - 5, 30));
    expect(items.killPlane(testGround.killPlaneY).sort()).toEqual([dropped, 'jerrycan-1'].sort());
    expect(items.get(dropped)).toBeUndefined();
    const back = items.get('jerrycan-1')!.body;
    expect(back.translation().x).toBeCloseTo(-4, 6);
    expect(back.translation().y).toBeCloseTo(ITEM_KINDS.jerrycan.halfExtents.y, 6);
    expect(back.linvel().y).toBe(0);
    expect(items.killPlane(testGround.killPlaneY)).toEqual([]);
    physics.free();
  });

  test('rejects an unknown kind and an id that is also a prop', () => {
    const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    expect(() => createItems(RAPIER, physics, courseWith([placed('x', 'sofa', 0, 0)]))).toThrow('Unknown item kind: sofa');
    expect(() => createItems(RAPIER, physics, courseWith([placed('crate-1', 'jerrycan', 0, 0)]))).toThrow('also a prop');
    expect(() => createItems(RAPIER, physics, courseWith([placed('item-3', 'jerrycan', 0, 0)]))).toThrow('reserved');
    physics.free();
  });
});

const itemsOf = (world: World) => world.snapshot().props.filter((prop) => Object.hasOwn(ITEM_KINDS, prop.kind));
const playerOf = (world: World, id: string) => world.snapshot().players.find((player) => player.playerId === id)!;
const feetAt = (x: number, z: number): Vec3 => vec3(x, PLAYER_CONTROLLER_OFFSET, z);

// Presses a button for one tick and releases it for the next.
function tap(world: World, id: string, fields: Partial<PlayerInput>) {
  world.step(new Map([[id, input(fields)]]));
  world.step(new Map([[id, input({ slot: fields.slot ?? 0 })]]));
}

// A player standing 0.8 m south of the point, facing north (-Z).
function standAt(world: World, id: string, x: number, z: number) {
  world.teleportPlayer(id, feetAt(x, z + 0.8));
  for (let i = 0; i < 10; i++) world.step(new Map());
}

describe('items in the world', () => {
  test('1: items rest on the ground; a vehicle drives through one without moving it or slowing', () => {
    const speedAfter = (course: BuiltCourse) => {
      const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, course);
      world.addPlayer('d');
      world.step(new Map([['d', input({ interact: true })]]));
      world.step(new Map());
      for (let i = 0; i < 60; i++) world.step(new Map());
      const before = itemsOf(world)[0]?.pos;
      const speeds: number[] = [];
      for (let i = 0; i < 240; i++) {
        world.step(new Map([['d', input({ moveY: 1 })]]));
        speeds.push(world.debug().forwardSpeed);
      }
      const after = itemsOf(world)[0]?.pos;
      const z = world.snapshot().vehicle.pos.z;
      world.dispose();
      return { before, after, speeds, z };
    };
    const withItem = speedAfter(courseWith([placed('jerrycan-x', 'jerrycan', 0, -6)]));
    const without = speedAfter(PLAIN);
    expect(withItem.z).toBeLessThan(-8);
    expect(withItem.before!.y).toBeCloseTo(ITEM_KINDS.jerrycan.halfExtents.y, 2);
    expect(Math.hypot(withItem.after!.x - withItem.before!.x, withItem.after!.y - withItem.before!.y, withItem.after!.z - withItem.before!.z)).toBeLessThan(0.01);
    for (let i = 0; i < without.speeds.length; i++) expect(Math.abs(withItem.speeds[i]! - without.speeds[i]!)).toBeLessThan(0.1);
  });

  test('1: a player walks through an item', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, courseWith([placed('jerrycan-x', 'jerrycan', 30, -10)]));
    world.addPlayer('p');
    world.teleportPlayer('p', feetAt(30, -8));
    for (let i = 0; i < 120; i++) world.step(new Map([['p', input({ moveY: 1 })]]));
    expect(playerOf(world, 'p').pos.z).toBeLessThan(-11);
    expect(itemsOf(world)[0]!.pos.z).toBeCloseTo(-10, 2);
    world.dispose();
  });

  test('2: interact picks up into slot 0, the next into slot 1; with three held a fourth is left', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, courseWith([
      placed('a', 'jerrycan', 30, -10),
      placed('b', 'toolbox', 30.3, -10),
      placed('c', 'jerrycan', 29.7, -10),
      placed('d', 'toolbox', 30, -10.3),
    ]));
    world.addPlayer('p');
    standAt(world, 'p', 30, -10);
    tap(world, 'p', { interact: true });
    expect(playerOf(world, 'p').inventory.filter((kind) => kind !== null)).toHaveLength(1);
    expect(playerOf(world, 'p').inventory[0]).not.toBeNull();
    expect(itemsOf(world)).toHaveLength(3);
    tap(world, 'p', { interact: true });
    expect(playerOf(world, 'p').inventory[1]).not.toBeNull();
    expect(playerOf(world, 'p').inventory[2]).toBeNull();
    tap(world, 'p', { interact: true });
    expect(playerOf(world, 'p').inventory.every((kind) => kind !== null)).toBe(true);
    expect(itemsOf(world)).toHaveLength(1);
    tap(world, 'p', { interact: true });
    expect(itemsOf(world)).toHaveLength(1);
    expect(playerOf(world, 'p').seat).toBeNull();
    world.dispose();
  });

  test('2: the kind picked is the one in the slot, and an item out of reach is left', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, courseWith([placed('a', 'toolbox', 30, -10), placed('far', 'jerrycan', 30, -20)]));
    world.addPlayer('p');
    standAt(world, 'p', 30, -10);
    tap(world, 'p', { interact: true });
    expect(playerOf(world, 'p').inventory).toEqual(['toolbox', null, null]);
    expect(itemsOf(world).map((item) => item.id)).toEqual(['far']);
    tap(world, 'p', { interact: true });
    expect(playerOf(world, 'p').inventory).toEqual(['toolbox', null, null]);
    world.dispose();
  });

  test('3: the slot follows the input every tick', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, PLAIN);
    world.addPlayer('p');
    expect(playerOf(world, 'p').slot).toBe(0);
    world.step(new Map([['p', input({ slot: 2 })]]));
    expect(playerOf(world, 'p').slot).toBe(2);
    world.step(new Map([['p', input({ slot: 1 })]]));
    expect(playerOf(world, 'p').slot).toBe(1);
    world.dispose();
  });

  test('3: a player with no entry in the inputs keeps their slot', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, PLAIN);
    world.addPlayer('p');
    world.step(new Map([['p', input({ slot: 2 })]]));
    world.step(new Map());
    expect(playerOf(world, 'p').slot).toBe(2);
    world.dispose();
  });

  test('4: drop puts the selected item at the feet as item-1, then item-2; an empty slot drops nothing', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, courseWith([placed('a', 'toolbox', 30, -10), placed('b', 'jerrycan', 30.3, -10)]));
    world.addPlayer('p');
    standAt(world, 'p', 30, -10);
    tap(world, 'p', { interact: true });
    tap(world, 'p', { interact: true });
    const inventory = playerOf(world, 'p').inventory;
    expect(inventory.filter((kind) => kind !== null)).toHaveLength(2);
    expect(itemsOf(world)).toEqual([]);
    const feet = playerOf(world, 'p').pos;
    world.step(new Map([['p', input({ drop: true })]]));
    let dropped = itemsOf(world);
    expect(dropped.map((item) => item.id)).toEqual(['item-1']);
    expect(dropped[0]!.kind).toBe(inventory[0]);
    expect(dropped[0]!.pos.x).toBeCloseTo(feet.x, 2);
    expect(dropped[0]!.pos.z).toBeCloseTo(feet.z, 2);
    expect(dropped[0]!.pos.y).toBeGreaterThan(DROP_HEIGHT);
    expect(playerOf(world, 'p').inventory).toEqual([null, inventory[1], null]);
    world.step(new Map());
    world.step(new Map([['p', input({ drop: true })]]));
    expect(itemsOf(world)).toHaveLength(1);
    world.step(new Map());
    world.step(new Map([['p', input({ slot: 1 })]]));
    world.step(new Map([['p', input({ slot: 1, drop: true })]]));
    dropped = itemsOf(world);
    expect(dropped.map((item) => item.id)).toEqual(['item-1', 'item-2']);
    expect(dropped[1]!.kind).toBe(inventory[1]);
    expect(playerOf(world, 'p').inventory).toEqual([null, null, null]);
    world.dispose();
  });

  test('4: a seated player cannot drop', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, courseWith([placed('a', 'toolbox', 30, -10)]));
    world.addPlayer('p');
    standAt(world, 'p', 30, -10);
    tap(world, 'p', { interact: true });
    expect(playerOf(world, 'p').inventory[0]).toBe('toolbox');
    const door = world.vehicleConfig.spawnSlots[0]!;
    world.teleportPlayer('p', feetAt(door.x, door.z));
    for (let i = 0; i < 10; i++) world.step(new Map());
    tap(world, 'p', { interact: true });
    expect(playerOf(world, 'p').seat).toBe('driver');
    tap(world, 'p', { drop: true });
    expect(playerOf(world, 'p').inventory[0]).toBe('toolbox');
    expect(itemsOf(world)).toEqual([]);
    world.dispose();
  });

  test('5: two players pressing for one item on one tick: the earlier in join order gets it', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, courseWith([placed('a', 'jerrycan', 30, -10)]));
    world.addPlayer('first');
    world.addPlayer('second');
    standAt(world, 'second', 30.2, -10);
    standAt(world, 'first', 29.8, -10);
    world.step(new Map([['second', input({ interact: true })], ['first', input({ interact: true })]]));
    expect(playerOf(world, 'first').inventory[0]).toBe('jerrycan');
    expect(playerOf(world, 'second').inventory).toEqual([null, null, null]);
    expect(itemsOf(world)).toEqual([]);
    world.dispose();
  });

  test('6: removePlayer drops their items at a spawn slot, stacked DROP_HEIGHT apart', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, courseWith([placed('a', 'jerrycan', 30, -10), placed('b', 'jerrycan', 30.3, -10)]));
    world.addPlayer('p');
    standAt(world, 'p', 30, -10);
    tap(world, 'p', { interact: true });
    tap(world, 'p', { interact: true });
    world.removePlayer('p');
    const list = itemsOf(world);
    expect(list.map((item) => item.id)).toEqual(['item-1', 'item-2']);
    const slot = world.vehicleConfig.spawnSlots[0]!;
    for (const item of list) {
      expect(item.pos.x).toBeCloseTo(slot.x, 1);
      expect(item.pos.z).toBeCloseTo(slot.z, 1);
    }
    expect(list[1]!.pos.y - list[0]!.pos.y).toBeCloseTo(DROP_HEIGHT, 6);
    world.dispose();
  });

  test('7: a dropped item below the kill plane is removed; a course pickup returns to its spawn', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, courseWith([placed('a', 'toolbox', 30, -10), placed('b', 'jerrycan', 40, -10)]));
    world.addPlayer('p');
    standAt(world, 'p', 30, -10);
    tap(world, 'p', { interact: true });
    world.step(new Map([['p', input({ drop: true })]]));
    expect(itemsOf(world).map((item) => item.id)).toEqual(['b', 'item-1']);
    world.debugBody('item-1')!.setTranslation(vec3(0, world.course.killPlaneY - 1, 0), true);
    world.debugBody('b')!.setTranslation(vec3(0, world.course.killPlaneY - 1, 0), true);
    world.step(new Map());
    const list = itemsOf(world);
    expect(list.map((item) => item.id)).toEqual(['b']);
    expect(list[0]!.pos.x).toBeCloseTo(40, 2);
    expect(list[0]!.pos.z).toBeCloseTo(-10, 2);
    world.dispose();
  });

  test('8: the snapshot lists items in props after the props, and the player inventory and slot', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    world.addPlayer('p');
    world.step(new Map([['p', input({ slot: 2 })]]));
    const snapshot = world.snapshot();
    expect(snapshot.props.map((prop) => prop.id)).toEqual([
      ...testGround.props.map((prop) => prop.id),
      ...testGround.pickups.map((pickup) => pickup.id),
    ]);
    expect(snapshot.props.slice(-1)[0]).toMatchObject({ id: 'toolbox-1', kind: 'toolbox' });
    expect(snapshot.players[0]).toMatchObject({ inventory: [null, null, null], slot: 2 });
    world.dispose();
  });
});
