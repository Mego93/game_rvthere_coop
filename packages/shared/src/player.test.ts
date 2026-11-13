import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  PLAYER_AIR_ACCEL,
  PLAYER_EYE_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_WALK_SPEED,
  SEAT_EXIT_DISTANCE,
  TICK_DT,
  TICK_RATE,
} from './constants';
import { testGround, slopePose } from './courses/testGround';
import type { BuiltCourse } from './course';
import { IDENTITY, quatFromAxisAngle, rotate, vec3, yawOf, AXIS_Y, type Pose, type Quat, type Vec3 } from './math';
import { aimRay, createPlayers, wishVelocity } from './player';
import { NEUTRAL_INPUT, type InputFields } from './protocol';
import { createRig, withBoxes } from './testRig';
import { getVehicleConfig } from './vehicles';

beforeAll(async () => {
  await RAPIER.init();
});

const ORIGIN: Pose = { pos: vec3(0, 0, 0), rot: IDENTITY };

// A settled Lodgy at the origin with players on foot; the harness computes presses as the world does (rule T1).
function harness(course: BuiltCourse = testGround, spawn: Pose = ORIGIN) {
  const rig = createRig(RAPIER, 'lodgy', spawn, course);
  rig.run(1);
  const players = createPlayers(RAPIER, rig.world, rig.vehicle, course);
  const previous = new Map<string, InputFields>();
  const vehicleRun = { controls: { throttle: 0, steer: 0, brake: false }, beforePhysics: () => {} };
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
    rig.vehicle.step(vehicleRun.controls);
    vehicleRun.beforePhysics();
    rig.world.step();
    players.stepOnFoot(map);
  };
  const run = (ticks: number, inputs: Record<string, Partial<InputFields>> = {}) => {
    for (let i = 0; i < ticks; i++) tick(inputs);
  };
  return { rig, players, tick, run, vehicleRun };
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
    let heldApex = base;
    for (let i = 0; i < 3 * TICK_RATE; i++) {
      tick({ p1: { jump: true } });
      heldApex = Math.max(heldApex, player.pos.y);
      if (wasGrounded && !player.grounded) takeoffs += 1;
      wasGrounded = player.grounded;
    }
    expect(takeoffs).toBe(1);
    expect(heldApex - base).toBeGreaterThan(1.1);
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

const LODGY = getVehicleConfig('lodgy');

const conjugate = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
const toLocal = (body: { translation(): Vec3; rotation(): Quat }, p: Vec3): Vec3 =>
  rotate(conjugate(body.rotation()), vec3(p.x - body.translation().x, p.y - body.translation().y, p.z - body.translation().z));
// The capsule axis is sampled; the tolerance covers the overlap lift and the controller's skin gap.
const capsuleHitsChassis = (body: { translation(): Vec3; rotation(): Quat }, feet: Vec3): boolean => {
  const h = LODGY.halfExtents;
  for (let i = 0; i <= 10; i++) {
    const y = feet.y + PLAYER_RADIUS + ((PLAYER_HEIGHT - 2 * PLAYER_RADIUS) * i) / 10;
    const l = toLocal(body, vec3(feet.x, y, feet.z));
    const gap = Math.hypot(
      Math.max(Math.abs(l.x) - h.x, 0),
      Math.max(Math.abs(l.y) - h.y, 0),
      Math.max(Math.abs(l.z) - h.z, 0),
    );
    if (gap < PLAYER_RADIUS - 0.06) return true;
  }
  return false;
};

describe('standing on the vehicle', () => {
  test('a player dropped 0.1 m above the roof lands on the vehicle', () => {
    const { rig, players, run } = harness();
    const player = players.add('p1');
    const body = rig.vehicle.body.translation();
    players.teleport('p1', vec3(body.x, body.y + LODGY.halfExtents.y + 0.1, body.z));
    run(30);
    expect(player.grounded).toBe(true);
    expect(player.ground?.bodyId).toBe('vehicle');
    expect(player.carry).toEqual({ x: 0, z: 0 });
  });

  test('walking on the roof moves 1.9 to 2.25 m along the axis in 0.5 s, and walking on drops the player to the ground', () => {
    const { rig, players, run } = harness();
    const player = players.add('p1');
    const body = rig.vehicle.body.translation();
    players.teleport('p1', vec3(body.x, body.y + LODGY.halfExtents.y + 0.1, body.z));
    run(30);
    const start = player.ground!.localPos;
    run(30, { p1: { moveY: 1 } });
    const local = player.ground!.localPos;
    expect(start.z - local.z).toBeGreaterThan(1.9);
    expect(start.z - local.z).toBeLessThan(2.25);
    expect(local.x).toBeCloseTo(start.x, 1);
    run(90, { p1: { moveY: 1 } });
    expect(player.ground).toBeNull();
    expect(player.pos.y).toBeLessThan(0.1);
    expect(player.pos.z).toBeLessThan(body.z - LODGY.halfExtents.z);
  });

  test('a player on the roof is carried along by the vehicle', () => {
    const { rig, players, run, vehicleRun } = harness();
    const player = players.add('p1');
    const body = rig.vehicle.body.translation();
    players.teleport('p1', vec3(body.x, body.y + LODGY.halfExtents.y + 0.1, body.z));
    run(30);
    const before = player.ground!.localPos;
    vehicleRun.beforePhysics = () => rig.vehicle.body.setLinvel({ x: 0, y: 0, z: -10 }, true);
    run(60);
    expect(player.ground).not.toBeNull();
    expect(player.ground!.localPos.z).toBeCloseTo(before.z, 1);
    expect(rig.vehicle.body.translation().z).toBeLessThan(body.z - 8);
    expect(player.pos.z).toBeCloseTo(rig.vehicle.body.translation().z + before.z, 1);
  });

  test('a jump from the moving roof carries the vehicle\'s horizontal velocity until landing', () => {
    const { rig, players, tick, run, vehicleRun } = harness();
    const player = players.add('p1');
    const body = rig.vehicle.body.translation();
    players.teleport('p1', vec3(body.x, body.y + LODGY.halfExtents.y + 0.1, body.z));
    run(30);
    vehicleRun.beforePhysics = () => rig.vehicle.body.setLinvel({ x: 0, y: 0, z: -10 }, true);
    run(5);
    tick({ p1: { jump: true } });
    expect(player.ground).toBeNull();
    expect(Math.abs(player.carry.x)).toBeLessThan(0.2);
    expect(player.carry.z).toBeGreaterThan(-10.2);
    expect(player.carry.z).toBeLessThan(-9.8);
  });

  test('landing back on the roof sets the ground again and zeroes the carry', () => {
    const { rig, players, tick, run, vehicleRun } = harness();
    const player = players.add('p1');
    const body = rig.vehicle.body.translation();
    players.teleport('p1', vec3(body.x, body.y + LODGY.halfExtents.y + 0.1, body.z));
    run(30);
    vehicleRun.beforePhysics = () => rig.vehicle.body.setLinvel({ x: 0, y: 0, z: -10 }, true);
    run(5);
    tick({ p1: { jump: true } });
    let airborne = 1;
    while (player.ground === null && airborne < 200) {
      tick({});
      airborne += 1;
    }
    expect(player.ground?.bodyId).toBe('vehicle');
    expect(player.carry).toEqual({ x: 0, z: 0 });
    expect(player.ground!.localPos.z).toBeCloseTo(0, 0);
  });

  test('landing on static ground after leaving the vehicle clears ground and carry', () => {
    const { rig, players, tick, run, vehicleRun } = harness();
    const player = players.add('p1');
    const body = rig.vehicle.body.translation();
    players.teleport('p1', vec3(body.x, body.y + LODGY.halfExtents.y + 0.1, body.z));
    run(30);
    vehicleRun.beforePhysics = () => rig.vehicle.body.setLinvel({ x: 0, y: 0, z: -10 }, true);
    run(5);
    // Strafe right off the roof while the vehicle drives away.
    tick({ p1: { jump: true, moveX: 1 } });
    for (let i = 0; i < 200 && !(player.grounded && player.ground === null && i > 3); i++) tick({ p1: { moveX: 1 } });
    expect(player.ground).toBeNull();
    expect(player.carry).toEqual({ x: 0, z: 0 });
  });
});

describe('shoving a player out of the vehicle\'s way', () => {
  const driveAt = (speed: number) => ({ x: 0, y: 0, z: -speed });

  test('a stationary player in the path ends ahead of the front face and never inside the chassis', () => {
    const { rig, players, run, tick, vehicleRun } = harness();
    const body = rig.vehicle.body;
    const player = players.add('p1');
    const z = body.translation().z - LODGY.halfExtents.z - 1.5;
    players.teleport('p1', vec3(body.translation().x, 0.02, z));
    run(10);
    vehicleRun.beforePhysics = () => body.setLinvel(driveAt(5), true);
    for (let i = 0; i < 4 * TICK_RATE; i++) {
      tick({});
      expect(Number.isFinite(player.pos.x + player.pos.y + player.pos.z)).toBe(true);
      expect(capsuleHitsChassis(body, player.pos)).toBe(false);
    }
    expect(toLocal(body, player.pos).z).toBeLessThan(-LODGY.halfExtents.z);
    expect(body.translation().z).toBeLessThan(z + LODGY.halfExtents.z - 5);
  });

  test('with a wall behind the player there is no room, so the player goes to a spawn slot', () => {
    const probe = harness();
    const zp = probe.rig.vehicle.body.translation().z - LODGY.halfExtents.z - 1.5;
    const course = withBoxes(testGround, {
      walls: [{ center: vec3(0, 1, zp - 3.1), halfExtents: vec3(3, 1, 3), rot: IDENTITY }],
    });
    const { rig, players, run, tick, vehicleRun } = harness(course);
    const body = rig.vehicle.body;
    const player = players.add('p1');
    players.teleport('p1', vec3(body.translation().x, 0.02, zp));
    run(10);
    vehicleRun.beforePhysics = () => body.setLinvel(driveAt(5), true);
    let relocated = false;
    let last = { ...player.pos };
    for (let i = 0; i < 4 * TICK_RATE; i++) {
      tick({});
      expect(Number.isFinite(player.pos.x + player.pos.y + player.pos.z)).toBe(true);
      expect(capsuleHitsChassis(body, player.pos)).toBe(false);
      if (relocated) {
        const gap = Math.hypot(Math.max(Math.abs(player.pos.x) - 3, 0), Math.max(zp - 6.1 - player.pos.z, player.pos.z - (zp - 0.1), 0));
        expect(gap).toBeGreaterThanOrEqual(PLAYER_RADIUS - 0.06);
      }
      if (!relocated && Math.hypot(player.pos.x - last.x, player.pos.z - last.z) > 0.5) {
        relocated = true;
        const turn = quatFromAxisAngle(AXIS_Y, yawOf(body.rotation()));
        const nearest = Math.min(
          ...LODGY.spawnSlots.map((slot) => {
            const at = rotate(turn, slot);
            return Math.hypot(body.translation().x + at.x - player.pos.x, body.translation().z + at.z - player.pos.z);
          }),
        );
        expect(nearest).toBeLessThan(0.05);
      }
      last = { ...player.pos };
    }
    expect(relocated).toBe(true);
  });

  test('a rolled vehicle carries a player on its upward side and not one beside it', () => {
    const rolled: Pose = { pos: vec3(0, 0.98, 0), rot: quatFromAxisAngle(vec3(0, 0, 1), Math.PI / 2) };
    const { rig, players, run } = harness(testGround, rolled);
    const body = rig.vehicle.body;
    const on = players.add('p1');
    const beside = players.add('p2');
    const top = body.translation();
    const up = rotate(body.rotation(), vec3(1, 0, 0));
    expect(up.y).toBeGreaterThan(0.9);
    players.teleport('p1', vec3(top.x, top.y + LODGY.halfExtents.x + 0.1, top.z));
    players.teleport('p2', vec3(top.x + 3, 0.02, top.z));
    run(60);
    expect(on.ground?.bodyId).toBe('vehicle');
    expect(beside.ground).toBeNull();
    for (const p of [on, beside]) expect(Number.isFinite(p.pos.x + p.pos.y + p.pos.z)).toBe(true);
  });
});

describe('players never change the vehicle', () => {
  test('a player standing in the path of a driven vehicle is shoved aside and does not disturb the chassis', () => {
    const { rig, players, run, tick, vehicleRun } = harness();
    const body = rig.vehicle.body;
    const settled = body.translation().y;
    players.add('p1');
    const z = body.translation().z - LODGY.halfExtents.z - 3;
    players.teleport('p1', vec3(body.translation().x, 0.02, z));
    run(10);
    vehicleRun.controls = { throttle: 1, steer: 0, brake: false };
    for (let i = 0; i < 4 * TICK_RATE; i++) {
      tick({});
      expect(Math.abs(body.translation().y - settled)).toBeLessThan(0.02);
    }
    expect(body.translation().z).toBeLessThan(z);
  });

  // No stepOnFoot here: a capsule left under the wheel for the whole run, which the shove-out would otherwise move.
  test('a capsule under a wheel ray does not move the chassis', () => {
    const { rig, players } = harness();
    const body = rig.vehicle.body;
    const settled = body.translation().y;
    players.add('p1');
    const at = body.translation();
    players.teleport('p1', vec3(at.x - LODGY.wheelX, 0.02, at.z - LODGY.wheelZ));
    let worst = 0;
    for (let i = 0; i < 30; i++) {
      rig.vehicle.step({ throttle: 0, steer: 0, brake: false });
      rig.world.step();
      worst = Math.max(worst, Math.abs(body.translation().y - settled));
    }
    expect(worst).toBeLessThan(0.02);
  });
});

const seatWorld = (body: { translation(): Vec3; rotation(): Quat }, seatIndex: number): Vec3 => {
  const at = rotate(body.rotation(), LODGY.seats[seatIndex]!.pos);
  const t = body.translation();
  return vec3(t.x + at.x, t.y + at.y - PLAYER_HEIGHT / 2, t.z + at.z);
};

describe('seats', () => {
  test('sitting puts the player at the seat, with no ground, no velocity and not grounded', () => {
    const { rig, players, run } = harness();
    const player = players.add('p1');
    run(10, { p1: { moveY: 1 } });
    player.vy = -3;
    player.carry = { x: 1, z: 1 };
    players.setSeat('p1', 'driver');
    expect(player.seat).toBe('driver');
    expect(player.ground).toBeNull();
    expect(player.walk).toEqual({ x: 0, z: 0 });
    expect(player.carry).toEqual({ x: 0, z: 0 });
    expect(player.vy).toBe(0);
    expect(player.grounded).toBe(false);
    expect(player.respawnIn).toBeNull();
    const expected = seatWorld(rig.vehicle.body, 0);
    expect(player.pos.x).toBeCloseTo(expected.x, 9);
    expect(player.pos.y).toBeCloseTo(expected.y, 9);
    expect(player.pos.z).toBeCloseTo(expected.z, 9);
  });

  test('a seated player on the vehicle is not on any ground, even after sitting down from the roof', () => {
    const { rig, players, run } = harness();
    const player = players.add('p1');
    const body = rig.vehicle.body.translation();
    players.teleport('p1', vec3(body.x, body.y + LODGY.halfExtents.y + 0.1, body.z));
    run(30);
    expect(player.ground).not.toBeNull();
    players.setSeat('p1', 'seat1');
    run(5);
    expect(player.ground).toBeNull();
    expect(player.grounded).toBe(false);
  });

  test('a seated player\'s pos follows the vehicle while it is driven, and the player is not shoved', () => {
    const { rig, players, tick, vehicleRun } = harness();
    const player = players.add('p1');
    players.setSeat('p1', 'driver');
    vehicleRun.controls = { throttle: 1, steer: 0.3, brake: false };
    for (let i = 0; i < 180; i++) {
      tick({});
      const expected = seatWorld(rig.vehicle.body, 0);
      expect(player.pos.x).toBeCloseTo(expected.x, 6);
      expect(player.pos.y).toBeCloseTo(expected.y, 6);
      expect(player.pos.z).toBeCloseTo(expected.z, 6);
    }
    expect(rig.vehicle.body.translation().z).toBeLessThan(-3);
    expect(player.seat).toBe('driver');
  });

  test('a seated player can look around, but walking, jumping and dropping do nothing', () => {
    const { rig, players, run } = harness();
    const player = players.add('p1');
    players.setSeat('p1', 'seat3');
    run(3, { p1: { yaw: 1.1, pitch: -0.3 } });
    expect(player.yaw).toBe(1.1);
    expect(player.pitch).toBe(-0.3);
    run(60, { p1: { moveY: 1, moveX: 1, jump: true, drop: true } });
    const expected = seatWorld(rig.vehicle.body, 3);
    expect(player.pos.x).toBeCloseTo(expected.x, 6);
    expect(player.pos.y).toBeCloseTo(expected.y, 6);
    expect(player.pos.z).toBeCloseTo(expected.z, 6);
    expect(player.walk).toEqual({ x: 0, z: 0 });
    expect(player.vy).toBe(0);
    expect(player.seat).toBe('seat3');
  });

  test('leaving a seat puts the player at the given point, grounded and at rest', () => {
    const { players, run } = harness();
    const player = players.add('p1');
    players.setSeat('p1', 'driver');
    players.setSeat('p1', null, vec3(-3, 0.02, 2));
    expect(player.seat).toBeNull();
    expect(player.grounded).toBe(true);
    expect(player.pos).toEqual(vec3(-3, 0.02, 2));
    expect(player.walk).toEqual({ x: 0, z: 0 });
    run(30);
    expect(player.pos.x).toBeCloseTo(-3, 3);
    expect(player.pos.z).toBeCloseTo(2, 3);
  });

  test('a capsule under a wheel ray while seated elsewhere does not move the chassis', () => {
    const { rig, players, run } = harness();
    const settled = rig.vehicle.body.translation().y;
    players.add('p1');
    players.setSeat('p1', 'driver');
    let worst = 0;
    for (let i = 0; i < 30; i++) {
      run(1);
      worst = Math.max(worst, Math.abs(rig.vehicle.body.translation().y - settled));
    }
    expect(worst).toBeLessThan(0.02);
  });
});

describe('exit points', () => {
  const wallAt = (p: Vec3) => ({ center: vec3(p.x, 1, p.z), halfExtents: vec3(0.3, 1, 0.3), rot: IDENTITY });

  test('findExit gives the seat\'s own-side exit point, on the ground', () => {
    const { rig, players } = harness();
    const body = rig.vehicle.body.translation();
    const exit = players.findExit(LODGY.seats[0]!)!;
    expect(exit.x).toBeCloseTo(body.x - (LODGY.halfExtents.x + SEAT_EXIT_DISTANCE), 2);
    expect(exit.z).toBeCloseTo(body.z - 0.7, 2);
    expect(exit.y).toBeCloseTo(0, 1);
    const right = players.findExit(LODGY.seats[1]!)!;
    expect(right.x).toBeCloseTo(body.x + LODGY.halfExtents.x + SEAT_EXIT_DISTANCE, 2);
  });

  test('E1: a blocked own side gives the other side, and both blocked give null', () => {
    const probe = harness();
    const body = probe.rig.vehicle.body.translation();
    const own = vec3(body.x - 1.78, 0, body.z - 0.7);
    const other = vec3(body.x + 1.78, 0, body.z - 0.7);

    const one = harness(withBoxes(testGround, { walls: [wallAt(own)] }));
    expect(one.players.findExit(LODGY.seats[0]!)!.x).toBeCloseTo(1.78, 2);

    const both = harness(withBoxes(testGround, { walls: [wallAt(own), wallAt(other)] }));
    expect(both.players.findExit(LODGY.seats[0]!)).toBeNull();
  });

  test('other players do not block an exit', () => {
    const { rig, players } = harness();
    const body = rig.vehicle.body.translation();
    players.add('p1');
    players.add('p2');
    players.teleport('p2', vec3(body.x - 1.78, 0.02, body.z - 0.7));
    expect(players.findExit(LODGY.seats[0]!)!.x).toBeCloseTo(body.x - 1.78, 2);
  });

  test('a rolled vehicle does not tip the exit point', () => {
    const rolled: Pose = { pos: vec3(0, 0.98, 0), rot: quatFromAxisAngle(vec3(0, 0, 1), Math.PI / 2) };
    const { players } = harness(testGround, rolled);
    const exit = players.findExit(LODGY.seats[0]!)!;
    expect(exit.y).toBeCloseTo(0, 1);
    expect(Number.isFinite(exit.x + exit.z)).toBe(true);
  });
});

describe('a player on the roof during a suspension bounce', () => {
  test('is not shoved off the roof when the chassis rises into the falling capsule', () => {
    const { rig, players, tick, run, vehicleRun } = harness();
    const body = rig.vehicle.body;
    const player = players.add('p1');
    const at = body.translation();
    players.teleport('p1', vec3(at.x, at.y + LODGY.halfExtents.y + 0.1, at.z));
    run(30);
    const takeoff = { ...player.ground!.localPos };
    let bounced = false;
    // The chassis rises 0.08 m into the falling player's feet, as a hard suspension rebound could.
    vehicleRun.beforePhysics = () => {
      const gap = player.pos.y - (body.translation().y + LODGY.halfExtents.y);
      if (bounced || player.ground !== null || player.vy >= 0 || gap > 0.17) return;
      const t = body.translation();
      body.setTranslation({ x: t.x, y: t.y + gap + 0.08, z: t.z }, true);
      bounced = true;
    };
    tick({ p1: { jump: true } });
    for (let i = 0; i < 120; i++) tick({});
    expect(bounced).toBe(true);
    expect(player.ground?.bodyId).toBe('vehicle');
    expect(Math.abs(player.ground!.localPos.x - takeoff.x)).toBeLessThan(0.3);
    expect(Math.abs(player.ground!.localPos.z - takeoff.z)).toBeLessThan(0.3);
  });

  describe('is not lifted onto the roof when it should be shoved', () => {
    const top = (body: { translation(): Vec3 }) => body.translation().y + LODGY.halfExtents.y;

    test('a player at ground level with the vehicle driven into them', () => {
      const { rig, players, run, tick, vehicleRun } = harness();
      const body = rig.vehicle.body;
      const player = players.add('p1');
      players.teleport('p1', vec3(0, 0.02, body.translation().z - LODGY.halfExtents.z - 1.5));
      run(10);
      vehicleRun.beforePhysics = () => body.setLinvel({ x: 0, y: 0, z: -5 }, true);
      for (let i = 0; i < 3 * TICK_RATE; i++) {
        tick({});
        expect(player.ground).toBeNull();
        expect(player.pos.y).toBeLessThan(0.2);
      }
    });

    test('feet 0.5 m below the roof inside the footprint', () => {
      const { rig, players, tick } = harness();
      const body = rig.vehicle.body;
      const player = players.add('p1');
      const at = body.translation();
      players.teleport('p1', vec3(at.x, top(body) - 0.5, at.z));
      tick({});
      expect(player.ground).toBeNull();
      expect(Math.abs(toLocal(body, player.pos).x)).toBeGreaterThan(LODGY.halfExtents.x);
    });

    test('feet at roof height but outside the footprint', () => {
      const { rig, players, tick } = harness();
      const body = rig.vehicle.body;
      const player = players.add('p1');
      const at = body.translation();
      players.teleport('p1', vec3(at.x + LODGY.halfExtents.x + 0.1, top(body) - 0.2, at.z));
      tick({});
      expect(player.ground).toBeNull();
      expect(Math.abs(toLocal(body, player.pos).x)).toBeGreaterThan(LODGY.halfExtents.x + PLAYER_RADIUS - 0.06);
    });

    test('a rolled vehicle: feet beside its local top face, which faces sideways', () => {
      const rolled: Pose = { pos: vec3(0, 0.98, 0), rot: quatFromAxisAngle(vec3(0, 0, 1), Math.PI / 2) };
      const { rig, players, tick } = harness(testGround, rolled);
      const body = rig.vehicle.body;
      expect(rotate(body.rotation(), vec3(0, 1, 0)).y).toBeLessThan(0.1);
      const player = players.add('p1');
      const at = body.translation();
      players.teleport('p1', vec3(at.x - 0.5, at.y - 0.7, at.z));
      tick({});
      expect(player.ground).toBeNull();
      expect(capsuleHitsChassis(body, player.pos)).toBe(false);
    });
  });
});
