import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  PLAYER_CONTROLLER_OFFSET,
  PLAYER_RADIUS,
  PREDICTION_IGNORE_DISTANCE,
  PREDICTION_MAX_PENDING,
  PREDICTION_SMOOTH_RATE,
  PREDICTION_TELEPORT_DISTANCE,
} from './constants';
import { testGround } from './courses/testGround';
import { IDENTITY, quatFromAxisAngle, vec3, AXIS_Y, type Quat, type Vec3 } from './math';
import { createPredictor, predictedFrom, type PredictedState, type Predictor } from './predictor';
import { NEUTRAL_INPUT, type InputFields, type PlayerSnapshot } from './protocol';
import { withBoxes } from './testRig';
import { VEHICLES } from './vehicles';
import { createWorld } from './world';
import type { BuiltCourse } from './course';

beforeAll(async () => {
  await RAPIER.init();
});

const FAR = vec3(20, PLAYER_CONTROLLER_OFFSET, -100);
const lodgy = VEHICLES.lodgy;
const rest = (pos: Vec3): PredictedState => ({
  pos,
  walk: { x: 0, z: 0 },
  carry: { x: 0, z: 0 },
  vy: 0,
  grounded: false,
});

function driver(predictor: Predictor, start: PredictedState) {
  let state = start;
  let before = false;
  return {
    get state() {
      return state;
    },
    tick(fields: Partial<InputFields> = {}) {
      const input = { ...NEUTRAL_INPUT, ...fields };
      state = predictor.stepPlayer(state, input, before);
      before = input.jump;
    },
    run(ticks: number, fields: Partial<InputFields> = {}) {
      for (let i = 0; i < ticks; i++) this.tick(fields);
    },
  };
}

const wall = (course: BuiltCourse) =>
  withBoxes(course, { walls: [{ center: vec3(FAR.x, 1, FAR.z - 3), halfExtents: vec3(3, 1, 0.5), rot: IDENTITY }] });

const SCRIPT: Partial<InputFields>[] = [
  ...Array.from({ length: 120 }, () => ({ moveY: 1, yaw: 0.3 })),
  ...Array.from({ length: 100 }, () => ({ moveX: 1, yaw: 0.3 })),
  ...Array.from({ length: 5 }, () => ({ moveY: 1, jump: true, yaw: 1 })),
  ...Array.from({ length: 80 }, () => ({ moveY: 1, yaw: 1 })),
  ...Array.from({ length: 30 }, () => ({ moveY: 1, jump: true })),
  ...Array.from({ length: 100 }, () => ({ moveY: -0.5, moveX: -1, yaw: -2 })),
  ...Array.from({ length: 165 }, () => ({})),
];

describe('createPredictor', () => {
  test('X2: agrees with the server on open ground for 600 ticks', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    world.addPlayer('p');
    world.teleportPlayer('p', FAR);
    const vehicle = world.snapshot().vehicle;
    const predictor = createPredictor(RAPIER, world.course, lodgy);
    predictor.setVehicle(vehicle.pos, vehicle.rot);
    const me = driver(predictor, rest(FAR));
    let before = false;
    expect(SCRIPT).toHaveLength(600);
    for (const fields of SCRIPT) {
      const input = { ...NEUTRAL_INPUT, seq: 0, ...fields };
      world.step(new Map([['p', input]]));
      me.tick(fields);
      before = input.jump;
      const server = world.snapshot().players[0]!;
      expect(Math.abs(server.pos.x - me.state.pos.x)).toBeLessThan(1e-12);
      expect(Math.abs(server.pos.y - me.state.pos.y)).toBeLessThan(1e-12);
      expect(Math.abs(server.pos.z - me.state.pos.z)).toBeLessThan(1e-12);
    }
    expect(before).toBe(false);
    expect(Math.hypot(me.state.pos.x - FAR.x, me.state.pos.z - FAR.z)).toBeGreaterThan(1);
    predictor.dispose();
    world.dispose();
  });

  test('a wall stops the predicted player as it stops the server', () => {
    const course = wall(testGround);
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, course);
    world.addPlayer('p');
    const start = vec3(FAR.x, PLAYER_CONTROLLER_OFFSET, FAR.z + 6);
    world.teleportPlayer('p', start);
    const predictor = createPredictor(RAPIER, course, lodgy);
    const me = driver(predictor, rest(start));
    for (let i = 0; i < 240; i++) {
      world.step(new Map([['p', { ...NEUTRAL_INPUT, seq: 0, moveY: 1 }]]));
      me.tick({ moveY: 1 });
    }
    const server = world.snapshot().players[0]!;
    const gap = me.state.pos.z - (FAR.z - 2.5);
    expect(gap).toBeGreaterThanOrEqual(PLAYER_RADIUS - 1e-3);
    expect(gap).toBeLessThanOrEqual(PLAYER_RADIUS + 0.05);
    expect(Math.abs(server.pos.z - me.state.pos.z)).toBeLessThan(1e-12);
    predictor.dispose();
    world.dispose();
  });

  describe('prop stand-ins', () => {
    const BARRIER = vec3(-10, 0.5, 10);
    const barrier = (z = BARRIER.z, id = 'barrier-1', kind = 'barrier') => ({ id, kind, pos: vec3(BARRIER.x, 0.5, z), rot: IDENTITY });
    const START = vec3(BARRIER.x, PLAYER_CONTROLLER_OFFSET, BARRIER.z + 6);

    test('Y1: a barrier stand-in stops the player where the server stops them', () => {
      const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
      world.addPlayer('p');
      // An idle second player makes the barrier need two pushers, so one leaves it locked.
      world.addPlayer('idle');
      world.teleportPlayer('idle', vec3(100, PLAYER_CONTROLLER_OFFSET, -300));
      world.teleportPlayer('p', START);
      const predictor = createPredictor(RAPIER, world.course, lodgy);
      predictor.setVehicle(world.snapshot().vehicle.pos, world.snapshot().vehicle.rot);
      predictor.setProps(world.snapshot().props);
      const me = driver(predictor, rest(START));
      for (let i = 0; i < 240; i++) {
        world.step(new Map([['p', { ...NEUTRAL_INPUT, seq: 0, moveY: 1 }]]));
        // As on the client: the stand-ins follow every snapshot.
        predictor.setProps(world.snapshot().props);
        me.tick({ moveY: 1 });
      }
      const server = world.snapshot().players.find((player) => player.playerId === 'p')!;
      expect(Math.abs(server.pos.x - me.state.pos.x)).toBeLessThan(1e-6);
      expect(Math.abs(server.pos.z - me.state.pos.z)).toBeLessThan(1e-6);
      expect(me.state.pos.z).toBeGreaterThan(BARRIER.z + 0.4);
      predictor.dispose();
      world.dispose();
    });

    test('Y2: a moved stand-in blocks at its new place', () => {
      const predictor = createPredictor(RAPIER, testGround, lodgy);
      predictor.setProps([barrier(BARRIER.z - 10)]);
      const me = driver(predictor, rest(START));
      me.run(240, { moveY: 1 });
      expect(me.state.pos.z).toBeGreaterThan(BARRIER.z - 10 + 0.4);
      expect(me.state.pos.z).toBeLessThan(BARRIER.z - 10 + 0.4 + PLAYER_RADIUS + 0.05);
      predictor.setProps([barrier(BARRIER.z + 20)]);
      me.run(120, { moveY: 1 });
      expect(me.state.pos.z).toBeLessThan(BARRIER.z - 10);
      predictor.dispose();
    });

    test('Y3: a stand-in absent from the list is removed, and the player passes', () => {
      const predictor = createPredictor(RAPIER, testGround, lodgy);
      predictor.setProps([barrier()]);
      const me = driver(predictor, rest(START));
      me.run(240, { moveY: 1 });
      expect(me.state.pos.z).toBeGreaterThan(BARRIER.z);
      predictor.setProps([]);
      me.run(120, { moveY: 1 });
      expect(me.state.pos.z).toBeLessThan(BARRIER.z - 1);
      predictor.dispose();
    });

    test('Y4: a prop of an unknown kind is skipped', () => {
      const predictor = createPredictor(RAPIER, testGround, lodgy);
      predictor.setProps([barrier(BARRIER.z, 'x-1', 'sofa'), barrier(BARRIER.z, 'x-2', '__proto__')]);
      const me = driver(predictor, rest(START));
      me.run(240, { moveY: 1 });
      expect(me.state.pos.z).toBeLessThan(BARRIER.z - 1);
      predictor.dispose();
    });

    test('Y5: an item is skipped, so the player walks through it', () => {
      const predictor = createPredictor(RAPIER, testGround, lodgy);
      predictor.setProps([barrier(BARRIER.z, 'jerrycan-1', 'jerrycan'), barrier(BARRIER.z, 'toolbox-1', 'toolbox')]);
      const me = driver(predictor, rest(START));
      me.run(240, { moveY: 1 });
      expect(me.state.pos.z).toBeLessThan(BARRIER.z - 1);
      predictor.dispose();
    });
  });

  describe('vehicle stand-in', () => {
    const pose = (z: number, rot: Quat = IDENTITY) => ({ pos: vec3(FAR.x, lodgy.halfExtents.y + 0.02, z), rot });

    test('X3: blocks the player, and moving it then walking again works', () => {
      const predictor = createPredictor(RAPIER, testGround, lodgy);
      const front = pose(FAR.z - 4);
      predictor.setVehicle(front.pos, front.rot);
      const me = driver(predictor, rest(FAR));
      me.run(240, { moveY: 1 });
      const face = front.pos.z + lodgy.halfExtents.z;
      const gap = me.state.pos.z - face;
      expect(gap).toBeGreaterThanOrEqual(PLAYER_RADIUS - 1e-3);
      expect(gap).toBeLessThanOrEqual(PLAYER_RADIUS + 0.05);

      const moved = pose(FAR.z - 40);
      predictor.setVehicle(moved.pos, moved.rot);
      const z = me.state.pos.z;
      me.run(60, { moveY: 1 });
      expect(z - me.state.pos.z).toBeGreaterThan(3);
      predictor.dispose();
    });

    test('a rotated stand-in blocks along its rotated face', () => {
      const predictor = createPredictor(RAPIER, testGround, lodgy);
      const turned = pose(FAR.z - 4, quatFromAxisAngle(AXIS_Y, Math.PI / 2));
      predictor.setVehicle(turned.pos, turned.rot);
      const me = driver(predictor, rest(FAR));
      me.run(240, { moveY: 1 });
      const gap = me.state.pos.z - (turned.pos.z + lodgy.halfExtents.x);
      expect(gap).toBeGreaterThanOrEqual(PLAYER_RADIUS - 1e-3);
      expect(gap).toBeLessThanOrEqual(PLAYER_RADIUS + 0.05);
      predictor.dispose();
    });

    test('the stand-in does not move across repeated steps and zero steps', () => {
      const predictor = createPredictor(RAPIER, testGround, lodgy);
      // Sunk 0.02 m into the ground, so the box starts penetrating it.
      const turned = pose(FAR.z - 4, quatFromAxisAngle(AXIS_Y, 0.4));
      turned.pos.y = lodgy.halfExtents.y - 0.02;
      predictor.setVehicle(turned.pos, turned.rot);
      predictor.setVehicle(turned.pos, turned.rot);
      const me = driver(predictor, rest(FAR));
      // A walk into the box's face at the same place must end at the same spot, however often it is placed again.
      me.run(120, { moveY: 1 });
      const first = me.state.pos;
      predictor.setVehicle(turned.pos, turned.rot);
      const again = driver(predictor, rest(FAR));
      again.run(120, { moveY: 1 });
      expect(again.state.pos.x).toBeCloseTo(first.x, 9);
      expect(again.state.pos.y).toBeCloseTo(first.y, 9);
      expect(again.state.pos.z).toBeCloseTo(first.z, 9);
      predictor.dispose();
    });

    test('a running jump at its side ends beside it, matching the server', () => {
      const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
      world.addPlayer('p');
      for (let i = 0; i < 300; i++) world.step(new Map());
      // The server now pushes the vehicle; the stand-in does not move.
      const pinned = world.debugBody('vehicle')!;
      pinned.setLinvel({ x: 0, y: 0, z: 0 }, true);
      pinned.setAngvel({ x: 0, y: 0, z: 0 }, true);
      pinned.setEnabledTranslations(false, false, false, true);
      pinned.lockRotations(true, true);
      const vehicle = world.snapshot().vehicle;
      // Parked at the course start: walk at it from the side, jumping about a metre before.
      const start = vec3(vehicle.pos.x + 6, PLAYER_CONTROLLER_OFFSET, vehicle.pos.z);
      world.teleportPlayer('p', start);
      const predictor = createPredictor(RAPIER, world.course, lodgy);
      predictor.setVehicle(vehicle.pos, vehicle.rot);
      const me = driver(predictor, rest(start));
      const roof = vehicle.pos.y + lodgy.halfExtents.y;
      let before = false;
      let top = 0;
      for (let i = 0; i < 300; i++) {
        const fields = { moveX: -1, yaw: 0, jump: i >= 60 && i < 62 };
        const input = { ...NEUTRAL_INPUT, seq: 0, ...fields };
        world.step(new Map([['p', input]]));
        me.tick(fields);
        before = input.jump;
        const server = world.snapshot().players[0]!;
        top = Math.max(top, me.state.pos.y);
        expect(Math.abs(server.pos.x - me.state.pos.x)).toBeLessThan(1e-12);
        expect(Math.abs(server.pos.y - me.state.pos.y)).toBeLessThan(1e-12);
        expect(Math.abs(server.pos.z - me.state.pos.z)).toBeLessThan(1e-12);
      }
      expect(before).toBe(false);
      expect(me.state.pos.y).toBeLessThan(roof - 0.5);
      expect(me.state.pos.x - vehicle.pos.x).toBeGreaterThan(lodgy.halfExtents.x);
      expect(top).toBeGreaterThan(0.5);
      predictor.dispose();
      world.dispose();
    });
  });

  test('stepPlayer does not change its argument and returns a new object', () => {
    const predictor = createPredictor(RAPIER, testGround, lodgy);
    const state = { ...rest(FAR), walk: { x: 1, z: 2 }, carry: { x: 3, z: 4 }, vy: 2 };
    const frozen = JSON.parse(JSON.stringify(state)) as PredictedState;
    const next = predictor.stepPlayer(state, { ...NEUTRAL_INPUT, moveY: 1, jump: true }, false);
    expect(state).toEqual(frozen);
    expect(next).not.toBe(state);
    expect(next.pos).not.toBe(state.pos);
    expect(next.walk).not.toBe(state.walk);
    expect(next.carry).not.toBe(state.carry);
    predictor.dispose();
  });

  test('sanitises the input like the server', () => {
    const predictor = createPredictor(RAPIER, testGround, lodgy);
    const a = predictor.stepPlayer(rest(FAR), { ...NEUTRAL_INPUT, moveX: 50, moveY: 1 }, false);
    const b = predictor.stepPlayer(rest(FAR), { ...NEUTRAL_INPUT, moveX: 1, moveY: 1 }, false);
    expect(a).toEqual(b);
    predictor.dispose();
  });

  test('a held jump does not re-jump without a release', () => {
    const predictor = createPredictor(RAPIER, testGround, lodgy);
    const grounded = { ...rest(FAR), grounded: true };
    const held = predictor.stepPlayer(grounded, { ...NEUTRAL_INPUT, jump: true }, true);
    const pressed = predictor.stepPlayer(grounded, { ...NEUTRAL_INPUT, jump: true }, false);
    expect(held.vy).toBeLessThan(0.5);
    expect(pressed.vy).toBeGreaterThan(4);
    predictor.dispose();
  });

  test('predictedFrom copies', () => {
    const snapshot: PlayerSnapshot = {
      playerId: 'p',
      pos: vec3(1, 2, 3),
      yaw: 0,
      seat: null,
      hands: null,
      ground: null,
      walk: { x: 1, z: 2 },
      carry: { x: 3, z: 4 },
      vy: 5,
      grounded: true,
      inventory: [null, null, null],
      slot: 0,
    };
    const copy = predictedFrom(snapshot);
    expect(copy).toEqual({ pos: { x: 1, y: 2, z: 3 }, walk: { x: 1, z: 2 }, carry: { x: 3, z: 4 }, vy: 5, grounded: true });
    copy.pos.x = 99;
    copy.walk.x = 99;
    copy.carry.x = 99;
    expect(snapshot.pos.x).toBe(1);
    expect(snapshot.walk.x).toBe(1);
    expect(snapshot.carry.x).toBe(3);
  });

  test('throws after dispose', () => {
    const predictor = createPredictor(RAPIER, testGround, lodgy);
    predictor.dispose();
    expect(() => predictor.stepPlayer(rest(FAR), NEUTRAL_INPUT, false)).toThrow();
    expect(() => predictor.setVehicle(vec3(0, 0, 0), IDENTITY)).toThrow();
    expect(() => predictor.dispose()).not.toThrow();
  });
});

test('the prediction constants', () => {
  expect([PREDICTION_TELEPORT_DISTANCE, PREDICTION_SMOOTH_RATE, PREDICTION_IGNORE_DISTANCE, PREDICTION_MAX_PENDING]).toEqual([1, 12, 0.002, 120]);
});
