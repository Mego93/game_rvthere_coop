import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import {
  GRAVITY,
  PLAYER_AIR_ACCEL,
  PLAYER_CONTROLLER_OFFSET,
  PLAYER_CROUCH_HEIGHT,
  PLAYER_CROUCH_SPEED,
  PLAYER_HEIGHT,
  PLAYER_KNEESLIDE_COOLDOWN,
  PLAYER_KNEESLIDE_MIN_SPEED,
  PLAYER_KNEESLIDE_SPEED,
  PLAYER_RADIUS,
  PLAYER_SPRINT_SPEED,
  PLAYER_WALK_SPEED,
  TICK_DT,
  TICK_RATE,
} from './constants';
import type { BuiltCourse } from './course';
import { testGround } from './courses/testGround';
import { GROUP_PLAYER, GROUP_WORLD, groups } from './groups';
import { AXIS_X, IDENTITY, add, degToRad, quatFromAxisAngle, rotate, vec3, type Vec3 } from './math';
import { NEUTRAL_INPUT, type InputFields } from './protocol';
import { buildStatics } from './statics';
import { withBoxes } from './testRig';
import { createWorld } from './world';
import { KNEESLIDE_TICKS, createWalkController, stepWalk, type WalkState } from './walk';

beforeAll(async () => {
  await RAPIER.init();
});

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
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
  const standing = new RAPIER.Capsule(PLAYER_HEIGHT / 2 - PLAYER_RADIUS, PLAYER_RADIUS);
  const env = { controller, collider, groups: groups(GROUP_WORLD, GROUP_WORLD), physics, standing };
  const state: WalkState = {
    pos: feet,
    walk: { x: 0, z: 0 },
    carry: { x: 0, z: 0 },
    vy: 0,
    grounded: false,
    crouched: false,
    slideTicks: 0,
    slideCooldown: 0,
    slideAir: 0,
    slideDir: { x: 0, z: 0 },
  };
  let before: InputFields = NEUTRAL_INPUT;
  const tick = (fields: Partial<InputFields> = {}, carry: { carrying?: boolean; holdsProp?: boolean } = {}) => {
    const input = { ...NEUTRAL_INPUT, ...fields };
    const result = stepWalk(env, state, {
      jumpPressed: input.jump && !before.jump,
      crouchPressed: input.crouch === true && before.crouch !== true,
      crouch: input.crouch === true,
      sprint: input.sprint === true,
      carrying: carry.carrying ?? false,
      holdsProp: carry.holdsProp ?? false,
      moveX: input.moveX,
      moveY: input.moveY,
      yaw: input.yaw,
    });
    before = input;
    return result;
  };
  const run = (ticks: number, fields: Partial<InputFields> = {}, carry: { carrying?: boolean; holdsProp?: boolean } = {}) => {
    for (let i = 0; i < ticks; i++) tick(fields, carry);
  };
  const dispose = () => physics.free();
  disposers.push(dispose);
  return { state, tick, run, collider, dispose };
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

  test('the collider sits at the feet plus half the height right after a step', () => {
    const { state, tick, collider } = walker(testGround, START);
    for (let i = 0; i < 40; i++) {
      tick({ moveY: 1, jump: i === 20 });
      const at = collider.translation();
      expect(at.x).toBeCloseTo(state.pos.x, 5);
      expect(at.y).toBeCloseTo(state.pos.y + PLAYER_HEIGHT / 2, 5);
      expect(at.z).toBeCloseTo(state.pos.z, 5);
    }
  });

  test('agrees with a createWorld player through a mid-air reversal of the wish', () => {
    const feet = vec3(20, 0.02, -100);
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    world.addPlayer('p');
    world.teleportPlayer('p', feet);
    const { state, tick } = walker(testGround, feet);
    let airborneAtReversal = false;
    for (let i = 0; i < 150; i++) {
      const fields: InputFields = {
        ...NEUTRAL_INPUT,
        moveY: i < 30 ? 1 : i < 40 ? 1 : -1,
        jump: i >= 30 && i < 33,
      };
      const wasAirborne = !state.grounded;
      const before = { ...state.walk };
      world.step(new Map([['p', fields]]));
      tick(fields);
      // Both sides share stepWalk, so the air limit is checked against the constant itself.
      if (wasAirborne) {
        expect(Math.hypot(state.walk.x - before.x, state.walk.z - before.z)).toBeLessThanOrEqual(
          PLAYER_AIR_ACCEL * TICK_DT + 1e-9,
        );
      }
      const server = world.snapshot().players.find((player) => player.playerId === 'p')!.pos;
      expect(Math.abs(server.x - state.pos.x)).toBeLessThan(1e-9);
      expect(Math.abs(server.y - state.pos.y)).toBeLessThan(1e-9);
      expect(Math.abs(server.z - state.pos.z)).toBeLessThan(1e-9);
      if (i === 39) airborneAtReversal = !state.grounded;
    }
    expect(airborneAtReversal).toBe(true);
    world.dispose();
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

const OPEN = vec3(20, PLAYER_CONTROLLER_OFFSET, -100);
const speedOf = (state: WalkState) => Math.hypot(state.walk.x, state.walk.z);

describe('stances', () => {
  test('(T1) the speed settles at walk, sprint and crouch speed, and a sprint is forward only', () => {
    const settle = (fields: Partial<InputFields>) => {
      const w = walker(testGround, OPEN);
      w.run(30);
      w.run(60, fields);
      return w;
    };
    expect(speedOf(settle({ moveY: 1 }).state)).toBeCloseTo(PLAYER_WALK_SPEED, 9);
    expect(speedOf(settle({ moveY: 1, sprint: true }).state)).toBeCloseTo(PLAYER_SPRINT_SPEED, 9);
    expect(speedOf(settle({ moveY: 1, crouch: true }).state)).toBeCloseTo(PLAYER_CROUCH_SPEED, 9);
    expect(speedOf(settle({ moveY: 1, sprint: true, crouch: true }).state)).toBeCloseTo(PLAYER_CROUCH_SPEED, 9);
    expect(speedOf(settle({ moveX: 1, sprint: true }).state)).toBeCloseTo(PLAYER_WALK_SPEED, 9);
    expect(speedOf(settle({ moveY: -1, sprint: true }).state)).toBeCloseTo(PLAYER_WALK_SPEED, 9);
    // Forward plus a side is still forward.
    expect(speedOf(settle({ moveY: 1, moveX: 1, sprint: true }).state)).toBeCloseTo(PLAYER_SPRINT_SPEED, 9);
  });

  test('(T1) the capsule is 1.1 m tall while crouched and 1.8 m when standing, the feet unmoved', () => {
    const w = walker(testGround, OPEN);
    w.run(30);
    const feet = w.state.pos.y;
    expect(w.collider.halfHeight()).toBeCloseTo(PLAYER_HEIGHT / 2 - PLAYER_RADIUS, 6);
    w.run(5, { crouch: true });
    expect(w.state.crouched).toBe(true);
    expect(w.collider.halfHeight()).toBeCloseTo(PLAYER_CROUCH_HEIGHT / 2 - PLAYER_RADIUS, 6);
    expect(w.collider.translation().y).toBeCloseTo(w.state.pos.y + PLAYER_CROUCH_HEIGHT / 2, 6);
    expect(w.state.pos.y).toBeCloseTo(feet, 3);
    w.run(5);
    expect(w.state.crouched).toBe(false);
    expect(w.collider.halfHeight()).toBeCloseTo(PLAYER_HEIGHT / 2 - PLAYER_RADIUS, 6);
  });

  test('(T2) a sprint is refused while carrying anything, and crouch is refused while holding a prop only', () => {
    const w = walker(testGround, OPEN);
    w.run(30);
    w.run(60, { moveY: 1, sprint: true }, { carrying: true });
    expect(speedOf(w.state)).toBeCloseTo(PLAYER_WALK_SPEED, 9);
    w.run(10, { moveY: 1, crouch: true }, { carrying: true, holdsProp: true });
    expect(w.state.crouched).toBe(false);
    expect(speedOf(w.state)).toBeCloseTo(PLAYER_WALK_SPEED, 9);
    w.run(60, { moveY: 1, crouch: true }, { carrying: true });
    expect(w.state.crouched).toBe(true);
    expect(speedOf(w.state)).toBeCloseTo(PLAYER_CROUCH_SPEED, 9);
  });

  test('(T2) a sprint in the air follows the wish, and crouching does not start in the air', () => {
    const airborne = (sprint: boolean) => {
      const w = walker(testGround, OPEN);
      w.run(30);
      w.state.walk = { x: 0, z: -6 };
      w.tick({ jump: true, moveY: 1, sprint });
      w.run(8, { moveY: 1, sprint });
      expect(w.state.grounded).toBe(false);
      return w;
    };
    expect(speedOf(airborne(true).state)).toBeGreaterThan(6);
    expect(speedOf(airborne(false).state)).toBeLessThan(6);
    const w = airborne(false);
    w.tick({ moveY: 1, crouch: true });
    expect(w.state.crouched).toBe(false);
  });

  // A 1.3 m ceiling over z from -8 to 2.
  const lowCeiling = () =>
    withBoxes(testGround, { walls: [{ center: vec3(OPEN.x, 1.55, OPEN.z - 3), halfExtents: vec3(3, 0.25, 5), rot: IDENTITY }] });

  test('(T3) under a low ceiling the player stays crouched when crouch is released, and stands once out', () => {
    const w = walker(lowCeiling(), OPEN);
    w.state.crouched = true;
    w.run(30, { crouch: true });
    expect(w.state.crouched).toBe(true);
    w.run(60);
    expect(w.state.crouched).toBe(true);
    expect(w.state.pos.z).toBeCloseTo(OPEN.z, 2);
    // Jumping does not work under it either.
    w.tick({ jump: true });
    expect(w.state.vy).toBeLessThanOrEqual(0);
    // Out from under it, crouch ends.
    w.run(360, { moveY: 1 });
    expect(w.state.pos.z).toBeLessThan(OPEN.z - 8.5);
    expect(w.state.crouched).toBe(false);
  });

  test('(T3) the crouched capsule walks into a 1.3 m tunnel it could not enter standing', () => {
    const standing = walker(lowCeiling(), vec3(OPEN.x, PLAYER_CONTROLLER_OFFSET, OPEN.z + 6));
    standing.run(30);
    standing.run(120, { moveY: 1 });
    expect(standing.state.pos.z).toBeGreaterThan(OPEN.z + 2.3);
    const crouching = walker(lowCeiling(), vec3(OPEN.x, PLAYER_CONTROLLER_OFFSET, OPEN.z + 6));
    crouching.run(30);
    crouching.run(420, { moveY: 1, crouch: true });
    expect(crouching.state.pos.z).toBeLessThan(OPEN.z - 8.5);
  });

  const sprintUp = () => {
    const w = walker(testGround, OPEN);
    w.run(30);
    w.run(60, { moveY: 1, sprint: true });
    return w;
  };

  test('(T4) a slide starts from a sprint, holds 9 m/s, falls to the crouch speed, and covers about 5.7 m', () => {
    const w = sprintUp();
    const start = { ...w.state.pos };
    w.tick({ moveY: 1, sprint: true, crouch: true });
    expect(w.state.slideTicks).toBe(KNEESLIDE_TICKS - 1);
    expect(w.state.crouched).toBe(true);
    expect(speedOf(w.state)).toBeCloseTo(PLAYER_KNEESLIDE_SPEED, 9);
    const speeds: number[] = [speedOf(w.state)];
    for (let i = 1; i < KNEESLIDE_TICKS; i++) {
      w.tick({ moveY: 1, sprint: true, crouch: true });
      speeds.push(speedOf(w.state));
    }
    expect(speeds[20]).toBeCloseTo(PLAYER_KNEESLIDE_SPEED, 9);
    for (let i = 22; i < speeds.length; i++) expect(speeds[i]!).toBeLessThan(speeds[i - 1]!);
    expect(speeds[KNEESLIDE_TICKS - 1]!).toBeLessThan(PLAYER_CROUCH_SPEED + 0.3);
    expect(w.state.slideTicks).toBe(0);
    expect(w.state.slideCooldown).toBe(Math.round(PLAYER_KNEESLIDE_COOLDOWN * TICK_RATE));
    expect(Math.hypot(w.state.pos.x - start.x, w.state.pos.z - start.z)).toBeGreaterThan(5.4);
    expect(Math.hypot(w.state.pos.x - start.x, w.state.pos.z - start.z)).toBeLessThan(6);
    // Crouch held: still crouched afterwards.
    expect(w.state.crouched).toBe(true);
  });

  test('(T4) a slide needs a sprint, the speed, and a fresh press', () => {
    const noSprint = walker(testGround, OPEN);
    noSprint.run(90, { moveY: 1 });
    noSprint.tick({ moveY: 1, crouch: true });
    expect(noSprint.state.slideTicks).toBe(0);

    const fromRest = walker(testGround, OPEN);
    fromRest.run(30);
    fromRest.tick({ moveY: 1, sprint: true, crouch: true });
    expect(fromRest.state.slideTicks).toBe(0);

    // Sprinting with crouch already held is not a press.
    const held = walker(testGround, OPEN);
    held.run(30);
    held.tick({ crouch: true });
    held.run(60, { moveY: 1, sprint: true, crouch: true });
    expect(held.state.slideTicks).toBe(0);
    expect(speedOf(held.state)).toBeCloseTo(PLAYER_CROUCH_SPEED, 9);

    // Not while holding anything.
    const carrying = walker(testGround, OPEN);
    carrying.run(30);
    carrying.run(60, { moveY: 1, sprint: true });
    carrying.tick({ moveY: 1, sprint: true, crouch: true }, { carrying: true });
    expect(carrying.state.slideTicks).toBe(0);
  });

  test('(T4) the cooldown refuses a second slide for a second, then allows it', () => {
    const w = sprintUp();
    w.tick({ moveY: 1, sprint: true, crouch: true });
    w.run(KNEESLIDE_TICKS, { moveY: 1, sprint: true, crouch: true });
    expect(w.state.slideCooldown).toBeGreaterThan(0);
    // Back to a sprint speed without the cooldown running out.
    w.run(2, { moveY: 1, sprint: true });
    w.run(40, { moveY: 1, sprint: true });
    expect(w.state.slideCooldown).toBeGreaterThan(0);
    w.tick({ moveY: 1, sprint: true, crouch: true });
    expect(w.state.slideTicks).toBe(0);
    w.run(1, { moveY: 1, sprint: true });
    w.run(30, { moveY: 1, sprint: true });
    expect(w.state.slideCooldown).toBe(0);
    expect(speedOf(w.state)).toBeGreaterThanOrEqual(PLAYER_KNEESLIDE_MIN_SPEED);
    w.tick({ moveY: 1, sprint: true, crouch: true });
    expect(w.state.slideTicks).toBeGreaterThan(0);
  });

  test('(T4) a slide ends early at a wall, and the cooldown runs', () => {
    const course = withBoxes(testGround, { walls: [{ center: vec3(OPEN.x, 1, OPEN.z - 8), halfExtents: vec3(3, 1, 0.5), rot: IDENTITY }] });
    const w = walker(course, OPEN);
    w.run(30);
    w.run(40, { moveY: 1, sprint: true });
    expect(w.state.pos.z).toBeGreaterThan(OPEN.z - 7);
    w.tick({ moveY: 1, sprint: true, crouch: true });
    expect(w.state.slideTicks).toBeGreaterThan(0);
    w.run(30, { moveY: 1, sprint: true, crouch: true });
    expect(w.state.slideTicks).toBe(0);
    expect(w.state.slideCooldown).toBeGreaterThan(0);
    expect(w.state.pos.z).toBeGreaterThan(OPEN.z - 7.5 + PLAYER_RADIUS - 0.1);
  });

  test('(T4) a jump out of a slide keeps the slide velocity for the take-off tick and ends the slide', () => {
    const w = sprintUp();
    w.tick({ moveY: 1, sprint: true, crouch: true });
    w.run(5, { moveY: 1, sprint: true, crouch: true });
    expect(w.state.slideTicks).toBeGreaterThan(0);
    w.tick({ moveY: 1, sprint: true, crouch: true, jump: true });
    expect(w.state.slideTicks).toBe(0);
    expect(w.state.slideCooldown).toBeGreaterThan(0);
    expect(w.state.vy).toBeGreaterThan(4);
    expect(speedOf(w.state)).toBeCloseTo(PLAYER_KNEESLIDE_SPEED, 9);
    expect(w.state.carry).toEqual({ x: 0, z: 0 });
  });

  test('(T4) a slide bends toward the wish direction at 0.6 rad/s and no faster', () => {
    const w = sprintUp();
    w.tick({ moveY: 1, sprint: true, crouch: true });
    w.run(29, { moveX: 1, sprint: true, crouch: true });
    // 29 ticks at 0.6 rad/s, taken from straight ahead (-z) toward +x.
    const turned = Math.atan2(w.state.slideDir.x, -w.state.slideDir.z);
    expect(turned).toBeCloseTo(0.6 * 29 * TICK_DT, 6);
    expect(Math.hypot(w.state.slideDir.x, w.state.slideDir.z)).toBeCloseTo(1, 12);
  });

  test('a slide ends when the player holds a prop', () => {
    const w = sprintUp();
    w.tick({ moveY: 1, sprint: true, crouch: true });
    w.tick({ moveY: 1, sprint: true, crouch: true }, { carrying: true, holdsProp: true });
    expect(w.state.slideTicks).toBe(0);
  });
});
