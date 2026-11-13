import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  GRAVITY,
  PLAYER_CONTROLLER_OFFSET,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  TICK_DT,
  TICK_RATE,
} from './constants';
import type { BuiltCourse } from './course';
import { testGround } from './courses/testGround';
import { GROUP_PLAYER, GROUP_WORLD, groups } from './groups';
import { AXIS_X, IDENTITY, add, degToRad, quatFromAxisAngle, rotate, vec3, type Vec3 } from './math';
import { wishVelocity } from './player';
import { NEUTRAL_INPUT, type InputFields } from './protocol';
import { buildStatics } from './statics';
import { withBoxes } from './testRig';
import { createWorld } from './world';
import { createWalkController, stepWalk, type WalkState } from './walk';

beforeAll(async () => {
  await RAPIER.init();
});

function walker(course: BuiltCourse, feet: Vec3) {
  const physics = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  physics.timestep = TICK_DT;
  buildStatics(RAPIER, physics, course);
  const controller = createWalkController(RAPIER, physics);
  const collider = physics.createCollider(
    RAPIER.ColliderDesc.capsule(PLAYER_HEIGHT / 2 - PLAYER_RADIUS, PLAYER_RADIUS).setCollisionGroups(
      groups(GROUP_PLAYER, 0),
    ),
  );
  physics.step();
  const env = { controller, collider, groups: groups(GROUP_WORLD, GROUP_WORLD) };
  const state: WalkState = { pos: feet, walk: { x: 0, z: 0 }, carry: { x: 0, z: 0 }, vy: 0, grounded: false };
  let before = NEUTRAL_INPUT;
  const tick = (fields: Partial<InputFields> = {}) => {
    const input = { ...NEUTRAL_INPUT, ...fields };
    const wish = wishVelocity(input.yaw, input.moveX, input.moveY);
    const result = stepWalk(env, state, input.jump && !before.jump, wish);
    before = input;
    return result;
  };
  const run = (ticks: number, fields: Partial<InputFields> = {}) => {
    for (let i = 0; i < ticks; i++) tick(fields);
  };
  return { state, tick, run };
}

const START = vec3(0, PLAYER_CONTROLLER_OFFSET, 0);

describe('createWalkController', () => {
  test('steps up a 0.2 m ledge but not a 0.4 m one', () => {
    const ledge = (height: number) =>
      withBoxes(testGround, {
        ground: [{ center: vec3(0, height / 2, -3), halfExtents: vec3(2, height / 2, 0.5), rot: IDENTITY, surface: 'road' }],
      });
    const low = walker(ledge(0.2), START);
    low.run(30);
    low.run(3 * TICK_RATE, { moveY: 1 });
    expect(low.state.pos.z).toBeLessThan(-5);

    const high = walker(ledge(0.4), START);
    high.run(30);
    high.run(3 * TICK_RATE, { moveY: 1 });
    expect(high.state.pos.z).toBeGreaterThan(-2.5);
    expect(high.state.pos.y).toBeCloseTo(0, 1);
  });

  test('does not climb a ground box tilted 50 degrees', () => {
    const rot = quatFromAxisAngle(AXIS_X, degToRad(50));
    const length = 10;
    const slab = {
      center: add(vec3(0, 0, -3), rotate(rot, vec3(0, -0.25, -length / 2))),
      halfExtents: vec3(4, 0.25, length / 2),
      rot,
      surface: 'road' as const,
    };
    const { state, run } = walker(withBoxes(testGround, { ground: [slab] }), START);
    run(30);
    run(4 * TICK_RATE, { moveY: 1 });
    expect(state.pos.y).toBeLessThan(0.35);
  });
});

describe('stepWalk', () => {
  test('60 ticks of full forward input from rest on flat ground cover 4.1 to 4.5 m', () => {
    const { state, run } = walker(testGround, START);
    run(30);
    const start = { ...state.pos };
    run(60, { moveY: 1 });
    const walked = Math.hypot(state.pos.x - start.x, state.pos.z - start.z);
    expect(walked).toBeGreaterThan(4.1);
    expect(walked).toBeLessThan(4.5);
  });

  test('a jump peaks 1.15 to 1.3 m up and lands with vy 0', () => {
    const { state, tick, run } = walker(testGround, START);
    run(30);
    const base = state.pos.y;
    tick({ jump: true });
    let apex = state.pos.y;
    let ticks = 1;
    while (!state.grounded && ticks < 200) {
      tick({ jump: false });
      apex = Math.max(apex, state.pos.y);
      ticks += 1;
    }
    expect(apex - base).toBeGreaterThan(1.15);
    expect(apex - base).toBeLessThan(1.3);
    expect(state.vy).toBe(0);
  });

  test('agrees with a createWorld player given the same inputs, within 1e-9 m for 300 ticks', () => {
    const feet = vec3(20, 0.02, -100);
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    world.addPlayer('p');
    world.teleportPlayer('p', feet);
    const { state, tick } = walker(testGround, feet);
    for (let i = 0; i < 300; i++) {
      const fields: InputFields = {
        ...NEUTRAL_INPUT,
        moveY: i < 120 ? 1 : 0,
        moveX: i >= 60 && i < 180 ? 0.6 : 0,
        yaw: 0.4 + 0.01 * i,
        jump: i % 70 < 3,
      };
      world.step(new Map([['p', fields]]));
      tick(fields);
      const server = world.snapshot().players.find((player) => player.playerId === 'p')!.pos;
      expect(Math.abs(server.x - state.pos.x)).toBeLessThan(1e-9);
      expect(Math.abs(server.y - state.pos.y)).toBeLessThan(1e-9);
      expect(Math.abs(server.z - state.pos.z)).toBeLessThan(1e-9);
    }
    world.dispose();
  });
});
