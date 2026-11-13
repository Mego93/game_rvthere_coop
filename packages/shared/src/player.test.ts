import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  PLAYER_AIR_ACCEL,
  PLAYER_EYE_HEIGHT,
  PLAYER_WALK_SPEED,
  TICK_DT,
  TICK_RATE,
} from './constants';
import { testGround, slopePose } from './courses/testGround';
import type { BuiltCourse } from './course';
import { IDENTITY, vec3, type Pose } from './math';
import { aimRay, createPlayers, wishVelocity } from './player';
import { NEUTRAL_INPUT, type InputFields } from './protocol';
import { createRig, withBoxes } from './testRig';

beforeAll(async () => {
  await RAPIER.init();
});

const ORIGIN: Pose = { pos: vec3(0, 0, 0), rot: IDENTITY };

// A settled Lodgy at the origin with players on foot; the harness computes presses as the world does (rule T1).
function harness(course: BuiltCourse = testGround) {
  const rig = createRig(RAPIER, 'lodgy', ORIGIN, course);
  rig.run(1);
  const players = createPlayers(RAPIER, rig.world, rig.vehicle, course);
  const previous = new Map<string, InputFields>();
  const tick = (inputs: Record<string, Partial<InputFields>> = {}) => {
    const map = new Map<string, { fields: InputFields; pressed: { jump: boolean; interact: boolean; drop: boolean } }>();
    for (const player of players.all()) {
      const fields = { ...NEUTRAL_INPUT, ...inputs[player.id] };
      const before = previous.get(player.id) ?? NEUTRAL_INPUT;
      map.set(player.id, {
        fields,
        pressed: {
          jump: fields.jump && !before.jump,
          interact: fields.interact && !before.interact,
          drop: fields.drop && !before.drop,
        },
      });
      previous.set(player.id, fields);
    }
    rig.vehicle.step({ throttle: 0, steer: 0, brake: false });
    rig.world.step();
    players.stepOnFoot(map);
  };
  const run = (ticks: number, inputs: Record<string, Partial<InputFields>> = {}) => {
    for (let i = 0; i < ticks; i++) tick(inputs);
  };
  return { rig, players, tick, run };
}

describe('wishVelocity', () => {
  test('forward at yaw 0 goes toward -Z', () => {
    const v = wishVelocity(0, 0, 1);
    expect(v.x).toBeCloseTo(0, 9);
    expect(v.z).toBeCloseTo(-PLAYER_WALK_SPEED, 9);
  });

  test('forward at yaw pi/2 goes toward -X', () => {
    const v = wishVelocity(Math.PI / 2, 0, 1);
    expect(v.x).toBeCloseTo(-PLAYER_WALK_SPEED, 9);
    expect(v.z).toBeCloseTo(0, 9);
  });

  test('strafing right at yaw 0 goes toward +X', () => {
    const v = wishVelocity(0, 1, 0);
    expect(v.x).toBeCloseTo(PLAYER_WALK_SPEED, 9);
    expect(v.z).toBeCloseTo(0, 9);
  });

  test('full diagonal input is no faster than walking speed', () => {
    const v = wishVelocity(0.7, 1, 1);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(PLAYER_WALK_SPEED, 9);
  });

  test('partial input is proportionally slower and zero input is zero', () => {
    expect(Math.hypot(wishVelocity(0, 0, 0.5).x, wishVelocity(0, 0, 0.5).z)).toBeCloseTo(PLAYER_WALK_SPEED / 2, 9);
    const zero = wishVelocity(1, 0, 0);
    expect(Math.hypot(zero.x, zero.z)).toBe(0);
  });
});

describe('aimRay', () => {
  test('the origin is the feet plus the eye height', () => {
    expect(aimRay(vec3(1, 2, 3), 0, 0).origin).toEqual(vec3(1, 2 + PLAYER_EYE_HEIGHT, 3));
  });

  test('yaw 0, pitch 0 looks toward -Z', () => {
    const { dir } = aimRay(vec3(0, 0, 0), 0, 0);
    expect(dir.x).toBeCloseTo(0, 9);
    expect(dir.y).toBeCloseTo(0, 9);
    expect(dir.z).toBeCloseTo(-1, 9);
  });

  test('positive pitch looks up, and the direction is a unit vector', () => {
    const { dir } = aimRay(vec3(0, 0, 0), 0.8, Math.PI / 4);
    expect(dir.y).toBeGreaterThan(0);
    expect(Math.hypot(dir.x, dir.y, dir.z)).toBeCloseTo(1, 9);
  });
});

describe('walking', () => {
  test('60 ticks of full forward input from rest cover about 4.28 m on flat road, and releasing stops within 0.2 s', () => {
    const { players, run } = harness();
    const player = players.add('p1');
    run(30);
    const start = { ...player.pos };
    run(60, { p1: { moveY: 1 } });
    const walked = Math.hypot(player.pos.x - start.x, player.pos.z - start.z);
    expect(walked).toBeGreaterThan(4.1);
    expect(walked).toBeLessThan(4.5);
    expect(player.pos.y).toBeCloseTo(start.y, 2);

    run(Math.round(0.2 * TICK_RATE), {});
    expect(Math.hypot(player.walk.x, player.walk.z)).toBe(0);
    const stopped = { ...player.pos };
    run(5);
    expect(player.pos.x).toBeCloseTo(stopped.x, 4);
    expect(player.pos.z).toBeCloseTo(stopped.z, 4);
  });

  test.each([
    ['steep', 4],
    ['gentle', 2],
  ] as const)('walks up the %s slope and gains at least %d m in 4 s', (name, minimumGain) => {
    const { players, run } = harness();
    const player = players.add('p1');
    const pose = slopePose(name, 1);
    players.teleport('p1', pose.pos);
    run(4 * TICK_RATE, { p1: { moveY: 1 } });
    expect(player.pos.y - pose.pos.y).toBeGreaterThan(minimumGain);
  });

  test('a wall taller than the step height stops the player', () => {
    const slot = vec3(-2.08, 0, -0.7);
    const course = withBoxes(testGround, {
      walls: [{ center: vec3(slot.x, 1, slot.z - 3), halfExtents: vec3(2, 1, 0.5), rot: IDENTITY }],
    });
    const { players, run } = harness(course);
    const player = players.add('p1');
    run(30);
    run(4 * TICK_RATE, { p1: { moveY: 1 } });
    expect(player.pos.z).toBeGreaterThan(slot.z - 2.5);
  });

  test('a ground box 0.2 m high does not', () => {
    const slot = vec3(-2.08, 0, -0.7);
    const course = withBoxes(testGround, {
      ground: [{ center: vec3(slot.x, 0.1, slot.z - 3), halfExtents: vec3(2, 0.1, 0.5), rot: IDENTITY, surface: 'road' }],
    });
    const { players, run } = harness(course);
    const player = players.add('p1');
    run(30);
    run(3 * TICK_RATE, { p1: { moveY: 1 } });
    expect(player.pos.z).toBeLessThan(slot.z - 5);
    expect(player.pos.y).toBeCloseTo(0, 1);
  });

  test('two players at the same spot do not move each other', () => {
    const { players, run } = harness();
    const a = players.add('p1');
    const b = players.add('p2');
    players.teleport('p2', a.pos);
    run(60);
    const before = { a: { ...a.pos }, b: { ...b.pos } };
    run(60);
    expect(a.pos.x).toBeCloseTo(before.a.x, 4);
    expect(a.pos.z).toBeCloseTo(before.a.z, 4);
    expect(b.pos.x).toBeCloseTo(before.b.x, 4);
    expect(b.pos.z).toBeCloseTo(before.b.z, 4);
    expect(b.pos.x).toBeCloseTo(a.pos.x, 3);
    expect(b.pos.z).toBeCloseTo(a.pos.z, 3);
  });

  test('yaw and pitch are copied from the input every tick', () => {
    const { players, run } = harness();
    const player = players.add('p1');
    run(2, { p1: { yaw: 1.2, pitch: -0.4 } });
    expect(player.yaw).toBe(1.2);
    expect(player.pitch).toBe(-0.4);
  });
});

describe('jumping', () => {
  test('a jump peaks 1.15 to 1.3 m up, lands after 1.0 to 1.1 s, and leaves vy at 0', () => {
    const { players, tick, run } = harness();
    const player = players.add('p1');
    run(30);
    const base = player.pos.y;
    tick({ p1: { jump: true } });
    let apex = player.pos.y;
    let airborneTicks = 1;
    while (!player.grounded && airborneTicks < 200) {
      tick({});
      apex = Math.max(apex, player.pos.y);
      airborneTicks += 1;
    }
    expect(apex - base).toBeGreaterThan(1.15);
    expect(apex - base).toBeLessThan(1.3);
    expect(airborneTicks * TICK_DT).toBeGreaterThanOrEqual(1.0);
    expect(airborneTicks * TICK_DT).toBeLessThan(1.1);
    expect(player.vy).toBe(0);
    run(5);
    expect(player.pos.y).toBeCloseTo(base, 2);
  });

  test('holding jump for 3 s gives one jump, and pressing in the air does nothing', () => {
    const { players, tick, run } = harness();
    const player = players.add('p1');
    run(30);
    const base = player.pos.y;
    let takeoffs = 0;
    let wasGrounded = true;
    for (let i = 0; i < 3 * TICK_RATE; i++) {
      tick({ p1: { jump: true } });
      if (wasGrounded && !player.grounded) takeoffs += 1;
      wasGrounded = player.grounded;
    }
    expect(takeoffs).toBe(1);
    expect(player.pos.y).toBeCloseTo(base, 2);

    // A fresh press while airborne adds nothing: the apex stays that of one jump.
    tick({ p1: { jump: false } });
    tick({ p1: { jump: true } });
    let apex = player.pos.y;
    for (let i = 0; i < 10; i++) {
      tick({ p1: { jump: false } });
      tick({ p1: { jump: true } });
      apex = Math.max(apex, player.pos.y);
    }
    for (let i = 0; i < 60; i++) {
      tick({});
      apex = Math.max(apex, player.pos.y);
    }
    expect(apex - base).toBeLessThan(1.3);
  });

  test('airborne, the walking velocity changes by no more than the air acceleration per tick', () => {
    const { players, tick, run } = harness();
    const player = players.add('p1');
    run(30);
    tick({ p1: { jump: true } });
    let previous = { ...player.walk };
    let moved = false;
    for (let i = 0; i < 30; i++) {
      tick({ p1: { moveY: 1 } });
      expect(Math.hypot(player.walk.x - previous.x, player.walk.z - previous.z)).toBeLessThanOrEqual(
        PLAYER_AIR_ACCEL * TICK_DT + 1e-9,
      );
      if (Math.hypot(player.walk.x, player.walk.z) > 0) moved = true;
      previous = { ...player.walk };
    }
    expect(moved).toBe(true);
  });
});

describe('spawning and teleporting', () => {
  test('teleport clears velocity, seat, ground and the respawn countdown', () => {
    const { players, run } = harness();
    const player = players.add('p1');
    run(10, { p1: { moveY: 1 } });
    player.respawnIn = 2;
    player.vy = -7;
    players.teleport('p1', vec3(5, 3, -5));
    expect(player.pos).toEqual(vec3(5, 3, -5));
    expect(player.walk).toEqual({ x: 0, z: 0 });
    expect(player.carry).toEqual({ x: 0, z: 0 });
    expect(player.vy).toBe(0);
    expect(player.grounded).toBe(false);
    expect(player.ground).toBeNull();
    expect(player.seat).toBeNull();
    expect(player.respawnIn).toBeNull();
  });

  test('all lists players in the order they were added, and remove drops one', () => {
    const { players } = harness();
    players.add('p3');
    players.add('p1');
    players.add('p2');
    expect(players.all().map((p) => p.id)).toEqual(['p3', 'p1', 'p2']);
    players.remove('p1');
    expect(players.all().map((p) => p.id)).toEqual(['p3', 'p2']);
    expect(players.get('p1')).toBeUndefined();
  });
});
