import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  TICK_DT,
  TICK_RATE,
  WINCH_FORCE_PER_WEIGHT,
  WINCH_REEL_SPEED,
  WINCH_STIFFNESS_PER_KG,
  GRAVITY,
  type ReferenceSlope,
} from './constants';
import type { BuiltCourse } from './course';
import { SAND_PATCH_CENTER, slopePose, testGround } from './courses/testGround';
import { AXIS_X, IDENTITY, add, degToRad, dot, length, quatFromAxisAngle, rotate, sub, vec3, type Pose } from './math';
import { createProps } from './props';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { createRig, withBoxes } from './testRig';
import type { VehicleId } from './vehicles';
import { createWorld } from './world';
import { createWinch } from './winch';

beforeAll(async () => {
  await RAPIER.init();
});

// Handling targets. The numbers are the owner's to change, not the implementer's.
const CLIMB_SECONDS = 5;
const CLIMBS_IF_GAIN_ABOVE = 0.5;
const FAILS_IF_GAIN_BELOW = 0;

// Height gained in CLIMB_SECONDS at full throttle, starting at rest 8 m up the slope.
function heightGained(id: VehicleId, slope: ReferenceSlope): number {
  const rig = createRig(RAPIER, id, slopePose(slope, 8));
  rig.run(1, { brake: true });
  const before = rig.vehicle.state().pos.y;
  rig.run(CLIMB_SECONDS, { throttle: 1 });
  return rig.vehicle.state().pos.y - before;
}

test('the Lodgy climbs the gentle slope unaided', () => {
  expect(heightGained('lodgy', 'gentle')).toBeGreaterThan(CLIMBS_IF_GAIN_ABOVE);
});

test('the Lodgy fails the steep slope unaided', () => {
  expect(heightGained('lodgy', 'steep')).toBeLessThan(FAILS_IF_GAIN_BELOW);
});

test('the RV climbs the gentle slope unaided', () => {
  expect(heightGained('rv', 'gentle')).toBeGreaterThan(CLIMBS_IF_GAIN_ABOVE);
});

test('the RV fails the medium slope unaided', () => {
  expect(heightGained('rv', 'medium')).toBeLessThan(FAILS_IF_GAIN_BELOW);
});

// The wheel model lets a braked vehicle creep slowly on a steep slope. This bounds the creep.
test.each(['lodgy', 'rv'] as const)('the %s creeps less than 0.1 m/s on the steep slope with the brake on', (id) => {
  const rig = createRig(RAPIER, id, slopePose('steep', 8));
  rig.run(1, { brake: true });
  const before = rig.vehicle.state().pos;
  rig.run(5, { brake: true });
  const after = rig.vehicle.state().pos;
  expect(Math.hypot(after.y - before.y, after.z - before.z) / 5).toBeLessThan(0.1);
});

const input = (fields: Partial<PlayerInput>): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });

test('two players board, and the driver drives the Lodgy 100 m down the course in under 40 s', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p1');
  world.addPlayer('p2');
  for (let i = 0; i < 30; i++) world.step(new Map());
  world.step(new Map([['p1', input({ interact: true })]]));
  world.step(new Map([['p2', input({ interact: true })]]));
  const seats = world.snapshot().players.map((player) => player.seat);
  expect(seats).toEqual(['driver', 'seat1']);

  let ticks = 0;
  while (world.snapshot().vehicle.pos.z > -100 && ticks < 40 * 60) {
    world.step(new Map([['p1', input({ moveY: 1 })]]));
    ticks += 1;
  }
  expect(world.snapshot().vehicle.pos.z).toBeLessThanOrEqual(-100);
  expect(ticks).toBeLessThan(40 * 60);
  expect(world.snapshot().players.map((player) => player.seat)).toEqual(['driver', 'seat1']);
});

test('four players walking into the roof of a Lodgy on its side right it; one does not', () => {
  const rightedWithin = (pushers: number, seconds: number): boolean => {
    const ids = Array.from({ length: pushers }, (_, i) => `p${i}`);
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    for (const id of ids) world.addPlayer(id);
    for (let i = 0; i < 30; i++) world.step(new Map());
    const body = world.debugBody('vehicle')!;
    body.setRotation(quatFromAxisAngle(vec3(0, 0, 1), Math.PI / 2), true);
    body.setTranslation({ x: 0, y: 1.2, z: 0 }, true);
    for (let i = 0; i < 90; i++) world.step(new Map());
    const side = world.snapshot().vehicle;
    expect(rotate(side.rot, vec3(0, 1, 0)).y).toBeLessThan(0.1);
    // Rolled by +90 degrees about Z, the roof faces -X.
    const roofX = side.pos.x - world.vehicleConfig.halfExtents.y;
    ids.forEach((id, i) => world.teleportPlayer(id, vec3(roofX - 0.6, 0.1, side.pos.z + (i - (pushers - 1) / 2) * 0.6)));
    const inputs = new Map(ids.map((id) => [id, input({ moveY: 1, yaw: -Math.PI / 2 })] as const));
    let righted = false;
    for (let i = 0; i < seconds * 60 && !righted; i++) {
      world.step(inputs);
      righted = rotate(world.snapshot().vehicle.rot, vec3(0, 1, 0)).y > 0.9;
    }
    world.dispose();
    return righted;
  };
  expect(rightedWithin(4, 10)).toBe(true);
  expect(rightedWithin(1, 10)).toBe(false);
});

// Winch scenarios: the vehicle on a rig, the cable attached by hand, the reel held on every tick.
function winchRun(
  id: VehicleId,
  course: BuiltCourse,
  spawn: Pose,
  anchorId: string,
  options: { throttle?: number; brakeSeconds?: number; maxSeconds: number; done: (pos: { x: number; y: number; z: number }) => boolean },
) {
  const rig = createRig(RAPIER, id, spawn, course);
  const props = createProps(RAPIER, rig.world, course);
  rig.world.step();
  const winch = createWinch(RAPIER, rig.world, rig.vehicle, props, course);
  winch.take('p1');
  expect(winch.attach(anchorId)).toBe(true);
  const initialLength = winch.state().length;
  let maxSpeed = 0;
  let maxSpin = 0;
  let ticks = 0;
  const limit = Math.round(options.maxSeconds * TICK_RATE);
  while (ticks < limit) {
    winch.applyForces(1);
    rig.vehicle.step({ throttle: options.throttle ?? 0, steer: 0, brake: ticks < (options.brakeSeconds ?? 0) * TICK_RATE });
    rig.world.step();
    ticks += 1;
    maxSpeed = Math.max(maxSpeed, length(rig.vehicle.body.linvel()));
    maxSpin = Math.max(maxSpin, length(rig.vehicle.body.angvel()));
    if (options.done(rig.vehicle.body.translation())) break;
  }
  return { rig, seconds: ticks / TICK_RATE, maxSpeed, maxSpin, initialLength, finished: ticks < limit || options.done(rig.vehicle.body.translation()) };
}

describe.each(['lodgy', 'rv'] as const)('the %s on the winch', (id) => {
  const from = slopePose('steep', 13);
  const target = slopePose('steep', 30).pos.y - from.pos.y;
  const climb = (brakeSeconds: number) =>
    winchRun(id, testGround, from, 'anchor-2', {
      brakeSeconds,
      maxSeconds: 30 + brakeSeconds,
      done: (pos) => pos.y - from.pos.y >= target,
    });

  test('(6) reaches 30 m along the steep slope within 30 s, reel held, no throttle', () => {
    const run = climb(0);
    expect(run.finished).toBe(true);
    expect(run.seconds).toBeLessThan(30);
  });

  test('(7) speed stays under 1.5 m/s and spin under 0.5 rad/s, also after a 5 s braked stall', () => {
    for (const stall of [0, 5]) {
      const run = climb(stall);
      expect(run.finished).toBe(true);
      expect(run.maxSpeed).toBeLessThan(1.5);
      expect(run.maxSpin).toBeLessThan(0.5);
    }
  });

  // V7: a ramp of the given angle with an anchor 22 m up it, the vehicle 8 m up (clear of the ramp foot); the reel pulls an unpowered vehicle uphill or not.
  function stallAngle(deg: number) {
    const rot = quatFromAxisAngle(AXIS_X, degToRad(deg));
    const start = vec3(60, 0, -20);
    const along = (m: number) => add(start, rotate(rot, vec3(0, 0, -m)));
    const course = withBoxes(
      { ...testGround, anchors: [{ id: 'stall', kind: 'milestone', pose: { pos: along(22), rot: IDENTITY } }] },
      { ground: [{ center: add(start, rotate(rot, vec3(0, -0.25, -20))), halfExtents: vec3(4, 0.25, 20), rot, surface: 'road' }] },
    );
    const spawn: Pose = { pos: along(8), rot };
    const uphill = rotate(rot, vec3(0, 0, -1));
    const run = winchRun(id, course, spawn, 'stall', { maxSeconds: 20, done: () => false });
    const gain = dot(sub(run.rig.vehicle.body.translation(), spawn.pos), uphill);
    return { ...run, gain };
  }

  test('V7: climbs a 33 degree ramp and does not climb a 36 degree one', () => {
    const a = stallAngle(33);
    const b = stallAngle(36);
    expect(a.gain).toBeGreaterThan(0);
    expect(b.gain).toBeLessThanOrEqual(0);
    for (const run of [a, b]) {
      expect(run.maxSpeed).toBeLessThan(1.5);
      expect(run.maxSpin).toBeLessThan(0.5);
    }
  });
});

test('(8) at the planned constants the spring reaches the cap beyond two ticks of reel travel', () => {
  expect((WINCH_FORCE_PER_WEIGHT * GRAVITY) / WINCH_STIFFNESS_PER_KG).toBeGreaterThan(2 * WINCH_REEL_SPEED * TICK_DT);
});

test('(10) the RV from rest on the sand patch, hook on anchor-3, reel in and full throttle, leaves the patch within 40 s', () => {
  const spawn: Pose = { pos: SAND_PATCH_CENTER, rot: IDENTITY };
  const run = winchRun('rv', testGround, spawn, 'anchor-3', { throttle: 1, maxSeconds: 40, done: (pos) => pos.z < -45 });
  expect(run.finished).toBe(true);
  expect(run.rig.vehicle.body.translation().z).toBeLessThan(-45);
});
