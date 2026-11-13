import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { PLAYER_WALK_SPEED, PUSH_FORCE, PUSH_FORCE_TIPPED, PUSH_HEIGHT, PUSH_MAX_ACCEL } from './constants';
import { AXIS_Y, IDENTITY, quatFromAxisAngle, vec3, type Vec3 } from './math';
import { NEUTRAL_INPUT, type InputFields } from './protocol';
import { contactPoint, pushForce, requiredPushers } from './push';
import { createWorld, type World } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

describe('requiredPushers', () => {
  test.each([
    [0, 1],
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 3],
    [5, 3],
    [6, 3],
  ])('%i players need %i', (players, needed) => {
    expect(requiredPushers(players)).toBe(needed);
  });
});

describe('contactPoint', () => {
  const half = vec3(1, 0.5, 0.4);

  test('an axis-aligned box: the nearest point on the box', () => {
    const point = contactPoint(vec3(0.3, 2, 5), vec3(0, 0.5, 0), IDENTITY, half);
    expect(point.x).toBeCloseTo(0.3, 9);
    expect(point.y).toBeCloseTo(1, 9);
    expect(point.z).toBeCloseTo(0.4, 9);
  });

  test('a point inside the box is its own contact point', () => {
    const point = contactPoint(vec3(0.2, 0.6, 0.1), vec3(0, 0.5, 0), IDENTITY, half);
    expect(point).toEqual(vec3(0.2, 0.6, 0.1));
  });

  test('a rotated box: the clamp happens in the box frame', () => {
    // Turned 90 degrees about Y, the box's long side (local x) lies along world -z.
    const rot = quatFromAxisAngle(AXIS_Y, Math.PI / 2);
    const point = contactPoint(vec3(0, 0.5, 5), vec3(0, 0.5, 0), rot, half);
    expect(point.x).toBeCloseTo(0, 9);
    expect(point.y).toBeCloseTo(0.5, 9);
    expect(point.z).toBeCloseTo(1, 9);
  });

  test('a box turned 45 degrees: a wrong rotation sign lands on the other side', () => {
    const rot = quatFromAxisAngle(AXIS_Y, Math.PI / 4);
    const point = contactPoint(vec3(3, 0.5, 0), vec3(0, 0.5, 0), rot, half);
    expect(point.x).toBeCloseTo((Math.SQRT2 / 2) * 1.4, 9);
    expect(point.y).toBeCloseTo(0.5, 9);
    expect(point.z).toBeCloseTo(-(Math.SQRT2 / 2) * 0.6, 9);
  });
});

describe('pushForce', () => {
  const pushPoint = vec3(0, PUSH_HEIGHT, 0);
  const ahead = vec3(0, 0.8, -1);
  const full = { x: 0, z: -PLAYER_WALK_SPEED };

  test('along the move direction, at the base force', () => {
    const force = pushForce(full, pushPoint, ahead, 1500, false)!;
    expect(force.x).toBeCloseTo(0, 9);
    expect(force.y).toBe(0);
    expect(force.z).toBeCloseTo(-PUSH_FORCE, 6);
  });

  test('null when moving away from the surface', () => {
    expect(pushForce({ x: 0, z: PLAYER_WALK_SPEED }, pushPoint, ahead, 1500, false)).toBeNull();
  });

  test('null when moving along the surface', () => {
    expect(pushForce({ x: PLAYER_WALK_SPEED, z: 0 }, pushPoint, ahead, 1500, false)).toBeNull();
  });

  test('null when there is no move, or the contact is straight above or below', () => {
    expect(pushForce({ x: 0, z: 0 }, pushPoint, ahead, 1500, false)).toBeNull();
    expect(pushForce(full, pushPoint, vec3(0, 0.2, 0), 1500, false)).toBeNull();
  });

  test('scaled by the input magnitude, at most 1', () => {
    const half = pushForce({ x: 0, z: -PLAYER_WALK_SPEED / 2 }, pushPoint, ahead, 1500, false)!;
    expect(half.z).toBeCloseTo(-PUSH_FORCE / 2, 6);
    const over = pushForce({ x: 0, z: -PLAYER_WALK_SPEED * 3 }, pushPoint, ahead, 1500, false)!;
    expect(over.z).toBeCloseTo(-PUSH_FORCE, 6);
  });

  test('capped by mass times PUSH_MAX_ACCEL', () => {
    const force = pushForce(full, pushPoint, ahead, 15, false)!;
    expect(force.z).toBeCloseTo(-15 * PUSH_MAX_ACCEL, 6);
  });

  test('the tipped base replaces the normal one', () => {
    const force = pushForce(full, pushPoint, ahead, 1500, true)!;
    expect(force.z).toBeCloseTo(-PUSH_FORCE_TIPPED, 6);
  });

  test('only the horizontal part of the direction counts', () => {
    const force = pushForce({ x: PLAYER_WALK_SPEED, z: 0 }, pushPoint, vec3(1, 3, 0), 1500, false)!;
    expect(force.x).toBeCloseTo(PUSH_FORCE, 6);
    expect(force.y).toBe(0);
  });
});

const input = (fields: Partial<InputFields>): InputFields => ({ ...NEUTRAL_INPUT, ...fields });
const FORWARD = input({ moveY: 1 }); // yaw 0: toward -Z
const BACK = input({ moveY: -1 });

function makeWorld(vehicleId: 'lodgy' | 'rv', players: string[]): World {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId });
  for (const id of players) world.addPlayer(id);
  for (let i = 0; i < 60; i++) world.step(new Map());
  return world;
}

function run(world: World, ticks: number, inputs: Record<string, InputFields>) {
  const map = new Map(Object.entries(inputs));
  for (let i = 0; i < ticks; i++) world.step(map);
}

const vehicleZ = (world: World) => world.snapshot().vehicle.pos.z;
const propOf = (world: World, id: string) => world.snapshot().props.find((prop) => prop.id === id)!;
const horizontal = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);

// Players do not collide with each other, so several can stand at one place.
function pushRearFace(vehicleId: 'lodgy' | 'rv', pushers: number, input_: InputFields, seconds: number): number {
  const ids = Array.from({ length: pushers }, (_, i) => `p${i}`);
  const world = makeWorld(vehicleId, ids);
  const body = world.snapshot().vehicle.pos;
  const rear = world.vehicleConfig.halfExtents.z;
  const before = vehicleZ(world);
  const inputs: Record<string, InputFields> = {};
  ids.forEach((id, i) => {
    world.teleportPlayer(id, vec3(body.x + (i - (pushers - 1) / 2) * 0.3, 0.1, body.z + rear + 0.5));
    inputs[id] = input_;
  });
  run(world, Math.round(seconds * 60), inputs);
  const moved = vehicleZ(world) - before;
  world.dispose();
  return moved;
}

describe('pushing the vehicle', () => {
  test('one player walking into the rear face moves the Lodgy more than 0.5 m; walking away does not', () => {
    const pushed = pushRearFace('lodgy', 1, FORWARD, 2);
    const away = pushRearFace('lodgy', 1, BACK, 2);
    expect(pushed).toBeLessThan(-0.5);
    expect(Math.abs(away)).toBeLessThan(0.01);
  });

  test('a fifth pusher adds nothing to four', () => {
    const spots = [-0.6, -0.2, 0.2, 0.6];
    const displacement = (pushers: number): number => {
      const ids = Array.from({ length: pushers }, (_, i) => `p${i}`);
      const world = makeWorld('lodgy', ids);
      const body = world.snapshot().vehicle.pos;
      const before = body.z;
      const inputs: Record<string, InputFields> = {};
      ids.forEach((id, i) => {
        world.teleportPlayer(id, vec3(body.x + (spots[i] ?? 0), 0.1, body.z + world.vehicleConfig.halfExtents.z + 0.5));
        inputs[id] = FORWARD;
      });
      run(world, 60, inputs);
      const moved = vehicleZ(world) - before;
      world.dispose();
      return moved;
    };
    const four = displacement(4);
    const five = displacement(5);
    expect(four).toBeLessThan(-0.1);
    // Contact flickers, so a fifth pusher fills the odd tick; without the cap the difference would be about 25%.
    expect(Math.abs(five - four) / Math.abs(four)).toBeLessThan(0.05);
  });

  test('two pushers move the RV further than one', () => {
    const one = pushRearFace('rv', 1, FORWARD, 2);
    const two = pushRearFace('rv', 2, FORWARD, 2);
    expect(one).toBeLessThan(-0.05);
    expect(two).toBeLessThan(one);
  });

  test('a player on the roof walking into nothing pushes nothing', () => {
    const world = makeWorld('lodgy', ['p0']);
    const body = world.snapshot().vehicle.pos;
    const before = { ...body };
    world.teleportPlayer('p0', vec3(body.x, body.y + world.vehicleConfig.halfExtents.y + 0.2, body.z));
    run(world, 30, { p0: FORWARD });
    const after = world.snapshot();
    expect(after.players[0]!.ground?.bodyId).toBe('vehicle');
    expect(horizontal(after.vehicle.pos, before)).toBeLessThan(0.01);
    world.dispose();
  });
});

// The barrier is at (-10, 0, 10); its +Z face is at z = 10.4.
const BARRIER_PUSH_SPOT = vec3(-10, 0.1, 10.4 + 0.5);

describe('pushing props', () => {
  test('with two players in the world one pusher leaves the barrier locked, two move it', () => {
    const one = makeWorld('lodgy', ['p0', 'p1']);
    const start = propOf(one, 'barrier-1').pos;
    one.teleportPlayer('p0', BARRIER_PUSH_SPOT);
    one.teleportPlayer('p1', vec3(30, 0.1, 30));
    run(one, 120, { p0: FORWARD });
    expect(horizontal(propOf(one, 'barrier-1').pos, start)).toBeLessThan(0.01);
    one.dispose();

    const two = makeWorld('lodgy', ['p0', 'p1']);
    two.teleportPlayer('p0', BARRIER_PUSH_SPOT);
    two.teleportPlayer('p1', BARRIER_PUSH_SPOT);
    run(two, 120, { p0: FORWARD, p1: FORWARD });
    const barrier = propOf(two, 'barrier-1');
    expect(start.z - barrier.pos.z).toBeGreaterThan(0.3);
    expect(Math.abs(barrier.rot.x) + Math.abs(barrier.rot.y) + Math.abs(barrier.rot.z)).toBeLessThan(1e-3);
    two.dispose();
  });

  test('alone in the world, one pusher moves the barrier', () => {
    const world = makeWorld('lodgy', ['p0']);
    const start = propOf(world, 'barrier-1').pos;
    world.teleportPlayer('p0', BARRIER_PUSH_SPOT);
    run(world, 120, { p0: FORWARD });
    expect(start.z - propOf(world, 'barrier-1').pos.z).toBeGreaterThan(0.3);
    world.dispose();
  });

  test('a crate is pushed along by one player', () => {
    const world = makeWorld('lodgy', ['p0']);
    const start = propOf(world, 'crate-1').pos;
    world.teleportPlayer('p0', vec3(start.x, 0.1, start.z + 0.3 + 0.5));
    run(world, 120, { p0: FORWARD });
    expect(start.z - propOf(world, 'crate-1').pos.z).toBeGreaterThan(0.5);
    world.dispose();
  });

  test('a crate taken away by the kill plane is not pushed by a stale intent', () => {
    const world = makeWorld('lodgy', ['p0']);
    const start = propOf(world, 'crate-1').pos;
    world.teleportPlayer('p0', vec3(start.x, 0.1, start.z + 0.3 + 0.5));
    run(world, 20, { p0: FORWARD });
    world.debugBody('crate-1')!.setTranslation(vec3(start.x, world.course.killPlaneY - 5, start.z), true);
    world.teleportPlayer('p0', vec3(30, 0.1, 30));
    run(world, 2, {});
    const crate = propOf(world, 'crate-1');
    expect(horizontal(crate.pos, start)).toBeLessThan(0.01);
    world.dispose();
  });
});
