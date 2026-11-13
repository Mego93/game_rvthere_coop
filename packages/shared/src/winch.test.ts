import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  ANCHOR_HEIGHT,
  GRAVITY,
  PLAYER_EYE_HEIGHT,
  PLAYER_KILL_RESPAWN_DELAY,
  HOOK_DROP_RAY,
  TICK_DT,
  TICK_RATE,
  WINCH_DAMPING_RATIO,
  WINCH_FORCE_PER_WEIGHT,
  WINCH_MAX_LENGTH,
  WINCH_MIN_LENGTH,
  WINCH_REEL_SPEED,
  WINCH_STIFFNESS_PER_KG,
} from './constants';
import { testGround } from './courses/testGround';
import { IDENTITY, add, deepFreeze, length, rotate, sub, vec3, type Pose, type Vec3 } from './math';
import { createProps } from './props';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { createWorld, type World } from './world';
import { createRig, withProps } from './testRig';
import { anchorPoint, cableTension, createWinch, reelLength, type CableEnd } from './winch';
import type { BuiltCourse } from './course';
import type { VehicleId } from './vehicles';

beforeAll(async () => {
  await RAPIER.init();
});

const rest = (point: Vec3): CableEnd => ({ point, velocity: vec3(0, 0, 0) });
const MASS = 1000;
const K = WINCH_STIFFNESS_PER_KG * MASS;
const C = 2 * WINCH_DAMPING_RATIO * MASS * Math.sqrt(WINCH_STIFFNESS_PER_KG);
const CAP = WINCH_FORCE_PER_WEIGHT * MASS * GRAVITY;

describe('cableTension', () => {
  test('a slack cable gives no tension', () => {
    const r = cableTension(rest(vec3(0, 0, 0)), rest(vec3(0, 0, -5)), 6, MASS);
    expect(r.tension).toBe(0);
    expect(r.stretch).toBeCloseTo(-1, 9);
  });

  test('with both ends at rest the tension is stiffness times stretch, along the cable', () => {
    const r = cableTension(rest(vec3(0, 0, 0)), rest(vec3(0, 0, -5)), 4.99, MASS);
    expect(r.stretch).toBeCloseTo(0.01, 9);
    expect(r.tension).toBeCloseTo(K * 0.01, 6);
    expect(r.dir.z).toBeCloseTo(-1, 9);
  });

  test('is capped at the weight fraction', () => {
    expect(cableTension(rest(vec3(0, 0, 0)), rest(vec3(0, 0, -5)), 2, MASS).tension).toBeCloseTo(CAP, 6);
  });

  test('a closing rate lowers the tension and an opening one raises it', () => {
    const to = rest(vec3(0, 0, -5));
    const at = (vz: number) => cableTension({ point: vec3(0, 0, 0), velocity: vec3(0, 0, vz) }, to, 4.99, MASS).tension;
    expect(at(-0.05)).toBeCloseTo(K * 0.01 - C * 0.05, 6);
    expect(at(0.05)).toBeCloseTo(K * 0.01 + C * 0.05, 6);
  });

  test('the far end moving away from the near end counts as opening', () => {
    const t = cableTension(rest(vec3(0, 0, 0)), { point: vec3(0, 0, -5), velocity: vec3(0, 0, -0.05) }, 4.99, MASS).tension;
    expect(t).toBeCloseTo(K * 0.01 + C * 0.05, 6);
  });

  test('is never negative', () => {
    const r = cableTension({ point: vec3(0, 0, 0), velocity: vec3(0, 0, -50) }, rest(vec3(0, 0, -5)), 4.99, MASS);
    expect(r.tension).toBe(0);
  });
});

describe('reelLength', () => {
  const step = WINCH_REEL_SPEED * TICK_DT;
  test('in shortens, out lengthens, zero holds', () => {
    expect(reelLength(10, 1, false)).toBeCloseTo(10 - step, 9);
    expect(reelLength(10, -1, false)).toBeCloseTo(10 + step, 9);
    expect(reelLength(10, 0, false)).toBe(10);
  });
  test('reeling in does not shorten at the cap, reeling out still lengthens', () => {
    expect(reelLength(10, 1, true)).toBe(10);
    expect(reelLength(10, -1, true)).toBeCloseTo(10 + step, 9);
  });
  test('stays between the minimum and the maximum', () => {
    expect(reelLength(WINCH_MIN_LENGTH + step / 2, 1, false)).toBe(WINCH_MIN_LENGTH);
    expect(reelLength(WINCH_MIN_LENGTH, 1, false)).toBe(WINCH_MIN_LENGTH);
    expect(reelLength(WINCH_MAX_LENGTH - step / 2, -1, false)).toBe(WINCH_MAX_LENGTH);
  });
});

function ahead(z: number): BuiltCourse {
  const base = withProps(testGround, [{ id: 'barrier-2', kind: 'barrier', pose: { pos: vec3(6, 0, -12), rot: IDENTITY } }]);
  return deepFreeze({ ...base, anchors: [{ id: 'near', kind: 'milestone', pose: { pos: vec3(0, 0, z), rot: IDENTITY } }] });
}

function setup(vehicleId: VehicleId = 'lodgy', course: BuiltCourse = ahead(-12), spawn: Pose = { pos: vec3(0, 0, 0), rot: IDENTITY }) {
  const rig = createRig(RAPIER, vehicleId, spawn, course);
  const props = createProps(RAPIER, rig.world, course);
  rig.world.step();
  const winch = createWinch(RAPIER, rig.world, rig.vehicle, props, course);
  const mount = () => add(rig.vehicle.body.translation(), rotate(rig.vehicle.body.rotation(), rig.vehicle.config.winchMount));
  const tick = (reel: -1 | 0 | 1 = 0, brake = false) => {
    const forces = winch.applyForces(reel);
    rig.vehicle.step({ throttle: 0, steer: 0, brake });
    rig.world.step();
    return forces;
  };
  return { rig, props, winch, mount, tick, course };
}

describe('createWinch', () => {
  test('starts stowed at the mount', () => {
    const { winch, mount } = setup();
    expect(winch.state()).toEqual({ state: 'stowed', holderId: null, anchorId: null, hookPos: mount(), length: 0, reel: 0 });
  });

  test('attach sets the length to the distance from the mount to the attach point', () => {
    const { winch, mount } = setup();
    winch.take('p1');
    expect(winch.state().state).toBe('held');
    expect(winch.state().holderId).toBe('p1');
    expect(winch.attach('near')).toBe(true);
    const snap = winch.state();
    expect(snap.state).toBe('attached');
    expect(snap.anchorId).toBe('near');
    expect(snap.holderId).toBeNull();
    expect(snap.length).toBeCloseTo(length(sub(vec3(0, 0.5, -12), mount())), 6);
    expect(snap.hookPos).toEqual(vec3(0, 0.5, -12));
  });

  test('attach is refused beyond the maximum length, and for an unknown anchor or when not held', () => {
    const { winch } = setup('lodgy', ahead(-40));
    expect(winch.attach('near')).toBe(false);
    winch.take('p1');
    expect(winch.attach('near')).toBe(false);
    expect(winch.attach('nowhere')).toBe(false);
    expect(winch.state().state).toBe('held');
  });

  for (const vehicleId of ['lodgy', 'rv'] as const) {
    test(`${vehicleId}: reeling in for 3 s pulls the vehicle toward the anchor and never above the cap`, () => {
      const { rig, winch, tick } = setup(vehicleId);
      const cap = WINCH_FORCE_PER_WEIGHT * rig.vehicle.config.mass * GRAVITY;
      winch.take('p1');
      winch.attach('near');
      const startZ = rig.vehicle.body.translation().z;
      let max = 0;
      for (let i = 0; i < 3 * TICK_RATE; i++) max = Math.max(max, tick(1).tension);
      expect(startZ - rig.vehicle.body.translation().z).toBeGreaterThan(2);
      expect(max).toBeGreaterThan(0);
      expect(max).toBeLessThanOrEqual(cap + 1e-6);
    });
  }

  test('a taut cable with nothing reeling holds a constant length; a slack one does not pull', () => {
    const { winch, tick, rig } = setup();
    winch.take('p1');
    winch.attach('near');
    const before = winch.state().length;
    const forces = tick(0);
    expect(forces.stretch).toBeLessThan(1e-6);
    expect(forces.tension).toBe(0);
    expect(winch.state().length).toBe(before);
    expect(length(rig.vehicle.body.linvel())).toBeLessThan(0.5);
  });

  test('reel out lengthens up to the maximum and reports the input applied', () => {
    const { winch, tick } = setup();
    winch.take('p1');
    winch.attach('near');
    const before = winch.state().length;
    tick(-1);
    expect(winch.state().length).toBeCloseTo(before + WINCH_REEL_SPEED * TICK_DT, 9);
    expect(winch.state().reel).toBe(-1);
    tick(0);
    expect(winch.state().reel).toBe(0);
  });

  test('the length never exceeds the maximum while reeling out', () => {
    const { winch, tick } = setup('lodgy', ahead(-24));
    winch.take('p1');
    winch.attach('near');
    for (let i = 0; i < 4 * TICK_RATE; i++) tick(-1);
    expect(winch.state().length).toBe(WINCH_MAX_LENGTH);
  });

  test('reel does nothing while stowed or held', () => {
    const { winch, tick } = setup();
    tick(1);
    expect(winch.state()).toMatchObject({ state: 'stowed', reel: 0 });
    winch.take('p1');
    tick(1);
    expect(winch.state()).toMatchObject({ state: 'held', reel: 0 });
  });

  test('tautObstacle names the attached obstacle only while the cable is taut', () => {
    const { winch, props, tick } = setup('lodgy', ahead(-12));
    expect(winch.tautObstacle()).toBeNull();
    winch.take('p1');
    expect(winch.attach('barrier-2')).toBe(true);
    expect(winch.tautObstacle()).toBeNull();
    for (let i = 0; i < 30; i++) tick(1);
    expect(winch.tautObstacle()).toBe('barrier-2');
    winch.stow();
    expect(winch.tautObstacle()).toBeNull();
    winch.take('p1');
    winch.attach('near');
    for (let i = 0; i < 30; i++) tick(1);
    expect(winch.tautObstacle()).toBeNull();
  });

  test('an unlocked obstacle gets the opposite impulse and a static anchor gets none', () => {
    const { winch, props, tick, rig } = setup('lodgy', ahead(-12));
    props.setLocked('barrier-2', false);
    winch.take('p1');
    winch.attach('barrier-2');
    const barrier = props.get('barrier-2')!;
    for (let i = 0; i < 90; i++) tick(1, true);
    expect(barrier.body.linvel().x).toBeLessThan(0);
    expect(rig.vehicle.body.linvel().z).toBeLessThan(0);
    expect(barrier.body.translation().x).toBeLessThan(6);
  });

  test('the cable follows the obstacle it is attached to', () => {
    const { winch, props } = setup();
    winch.take('p1');
    winch.attach('barrier-2');
    props.get('barrier-2')!.body.setTranslation(vec3(7, 0.5, -13), true);
    expect(winch.state().hookPos).toEqual(vec3(7, 1, -13));
  });

  test('drop puts the hook on the ground under the point and the length is its distance', () => {
    const { winch, mount } = setup();
    winch.take('p1');
    winch.drop(vec3(3, 1.2, -4));
    const snap = winch.state();
    expect(snap.state).toBe('ground');
    expect(snap.holderId).toBeNull();
    expect(snap.hookPos.x).toBeCloseTo(3, 6);
    expect(snap.hookPos.y).toBeCloseTo(0, 3);
    expect(snap.hookPos.z).toBeCloseTo(-4, 6);
    expect(snap.length).toBeCloseTo(length(sub(snap.hookPos, mount())), 6);
  });

  test('drop with no ground within the ray stows the hook', () => {
    const { winch } = setup();
    winch.take('p1');
    winch.drop(vec3(0, HOOK_DROP_RAY + 20, 0));
    expect(winch.state().state).toBe('stowed');
    winch.take('p1');
    winch.drop(vec3(500, 1, 0));
    expect(winch.state().state).toBe('stowed');
  });

  test('a ground hook can be taken again; stow works from any state', () => {
    const { winch } = setup();
    winch.take('p1');
    winch.drop(vec3(1, 1, -1));
    winch.take('p2');
    expect(winch.state()).toMatchObject({ state: 'held', holderId: 'p2' });
    winch.attach('near');
    winch.stow();
    expect(winch.state()).toMatchObject({ state: 'stowed', holderId: null, anchorId: null, length: 0 });
  });

  test('detach hands the hook to a player; release stows it', () => {
    const { winch } = setup();
    winch.take('p1');
    winch.attach('near');
    winch.detach('p2');
    expect(winch.state()).toMatchObject({ state: 'held', holderId: 'p2', anchorId: null });
    winch.attach('near');
    winch.release();
    expect(winch.state().state).toBe('stowed');
  });

  test('afterCharacters moves a held hook to the hold pose', () => {
    const { winch } = setup();
    winch.take('p1');
    const pulled = winch.afterCharacters(() => ({ pos: vec3(2, 1, -3), rot: IDENTITY }));
    expect(pulled).toBeNull();
    expect(winch.state().hookPos).toEqual(vec3(2, 1, -3));
  });

  test('a hook carried beyond the maximum is pulled and stowed on the same tick', () => {
    const { winch } = setup();
    winch.take('p1');
    const pulled = winch.afterCharacters(() => ({ pos: vec3(0, 1, -30), rot: IDENTITY }));
    expect(pulled).toBe('p1');
    expect(winch.state().state).toBe('stowed');
  });

  test('a hook whose holder vanished drops where it was', () => {
    const { winch } = setup();
    winch.take('p1');
    winch.afterCharacters(() => ({ pos: vec3(2, 1, -3), rot: IDENTITY }));
    expect(winch.afterCharacters(() => null)).toBe('p1');
    expect(winch.state().state).toBe('ground');
    expect(winch.state().hookPos.x).toBeCloseTo(2, 6);
  });

  test('a ground hook beyond the maximum from the mount is stowed after characters move', () => {
    const { winch, rig } = setup();
    winch.take('p1');
    winch.drop(vec3(0, 1, -10));
    expect(winch.afterCharacters(() => null)).toBeNull();
    expect(winch.state().state).toBe('ground');
    rig.vehicle.body.setTranslation(vec3(0, 1, 30), true);
    winch.afterCharacters(() => null);
    expect(winch.state().state).toBe('stowed');
  });

  test('reeling in with the hook on the ground stows it', () => {
    const { winch, tick } = setup();
    winch.take('p1');
    winch.drop(vec3(0, 1, -5));
    tick(-1);
    expect(winch.state().state).toBe('ground');
    tick(1);
    expect(winch.state().state).toBe('stowed');
  });

  test('onPropReset stows a hook attached to that obstacle only', () => {
    const { winch } = setup();
    winch.take('p1');
    winch.attach('barrier-2');
    winch.onPropReset('crate-1');
    expect(winch.state().state).toBe('attached');
    winch.onPropReset('barrier-2');
    expect(winch.state().state).toBe('stowed');
  });
});

describe('anchorPoint', () => {
  test('a static anchor attaches above its pose', () => {
    const { props, course } = setup();
    expect(anchorPoint('near', course, props)).toEqual(vec3(0, 0.5, -12));
  });

  test('a barrier attaches at the centre of its top face and moves with it', () => {
    const { props, course } = setup();
    const body = props.get('barrier-2')!.body;
    const at = body.translation();
    expect(anchorPoint('barrier-2', course, props)).toEqual(vec3(at.x, at.y + 0.5, at.z));
    body.setTranslation(vec3(1, 0.5, 2), true);
    expect(anchorPoint('barrier-2', course, props)).toEqual(vec3(1, 1, 2));
  });

  test('a crate and an unknown id have no anchor point', () => {
    const { props, course } = setup();
    expect(anchorPoint('crate-1', course, props)).toBeNull();
    expect(anchorPoint('nope', course, props)).toBeNull();
  });
});

describe('the hook in the hands (world)', () => {
  const FRONT = vec3(0, 0.02, -3.3);
  const input = (fields: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });

  type Aim = { yaw: number; pitch: number };
  // The aim from a player's eye to a point.
  function aimAt(world: World, target: Vec3, id = 'p1'): Aim {
    const eye = add(me(world, id).pos, vec3(0, PLAYER_EYE_HEIGHT, 0));
    const d = sub(target, eye);
    return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(d.y / length(d)) };
  }
  // Presses and releases interact with the given aim.
  function press(world: World, id: string, aim: Aim = { yaw: 0, pitch: 0 }) {
    world.step(new Map([[id, input({ interact: true, ...aim })]]));
    world.step(new Map([[id, input(aim)]]));
  }
  const run = (world: World, ticks: number) => {
    for (let i = 0; i < ticks; i++) world.step(new Map());
  };
  const me = (world: World, id = 'p1') => world.snapshot().players.find((player) => player.playerId === id)!;
  const mountOf = (world: World) => {
    const body = world.debugBody('vehicle')!;
    return add(body.translation(), rotate(body.rotation(), world.vehicleConfig.winchMount));
  };
  // The Lodgy 50 m up the course, so anchor-1 (z = -70) is about 18 m ahead of the bumper.
  const nearAnchor: BuiltCourse = deepFreeze({
    ...testGround,
    checkpoints: [{ ...testGround.checkpoints[0]!, spawn: { pos: vec3(-40, 0, -50), rot: IDENTITY } }, ...testGround.checkpoints.slice(1)],
  });
  function setup(course: BuiltCourse = testGround) {
    const world = createWorld(RAPIER, { courseId: course.id, vehicleId: 'lodgy' }, course);
    world.addPlayer('p1');
    const spawn = me(world).pos;
    run(world, 30);
    return { world, spawn };
  }
  // Takes the hook at the bumper.
  function takeAtBumper(world: World) {
    const mount = mountOf(world);
    world.teleportPlayer('p1', vec3(mount.x, 0.02, mount.z - 1.1));
    run(world, 20);
    press(world, 'p1', aimAt(world, mount));
  }

  test('a player beside the bumper takes the hook', () => {
    const { world } = setup();
    takeAtBumper(world);
    expect(me(world).hands).toBe('hook');
    const cable = world.snapshot().cable;
    expect(cable.state).toBe('held');
    expect(cable.holderId).toBe('p1');
    world.dispose();
  });

  test('walking away keeps the hook held, at the hold pose', () => {
    const { world } = setup();
    takeAtBumper(world);
    const start = me(world).pos;
    for (let i = 0; i < 400 && length(sub(me(world).pos, start)) < 10; i++) {
      world.step(new Map([['p1', input({ moveY: 1, yaw: 0 })]]));
    }
    expect(length(sub(me(world).pos, start))).toBeGreaterThanOrEqual(10);
    const snapshot = world.snapshot();
    expect(snapshot.cable.state).toBe('held');
    const player = me(world);
    expect(snapshot.cable.hookPos.x).toBeCloseTo(player.pos.x, 6);
    expect(snapshot.cable.hookPos.y).toBeCloseTo(player.pos.y + 1.1, 6);
    expect(snapshot.cable.hookPos.z).toBeCloseTo(player.pos.z - 0.75, 6);
    world.dispose();
  });

  test('interact with no anchor in range drops it on the ground below; interact beside it takes it again', () => {
    const { world } = setup();
    takeAtBumper(world);
    press(world, 'p1');
    expect(me(world).hands).toBeNull();
    const cable = world.snapshot().cable;
    expect(cable.state).toBe('ground');
    expect(cable.holderId).toBeNull();
    expect(cable.hookPos.y).toBeLessThan(0.1);
    expect(cable.hookPos.y).toBeGreaterThan(-0.1);
    const player = me(world);
    expect(cable.hookPos.x).toBeCloseTo(player.pos.x, 2);
    expect(cable.hookPos.z).toBeCloseTo(player.pos.z, 2);
    press(world, 'p1', aimAt(world, cable.hookPos));
    expect(me(world).hands).toBe('hook');
    expect(world.snapshot().cable.state).toBe('held');
    world.dispose();
  });

  // The anchor's attach point, with the hook already taken at the bumper.
  function holdingNearAnchor() {
    const { world } = setup(nearAnchor);
    takeAtBumper(world);
    world.teleportPlayer('p1', vec3(-40, 0.02, -69));
    run(world, 20);
    return world;
  }

  test('beside an anchor interact attaches: the length is the distance to the attach point', () => {
    const world = holdingNearAnchor();
    press(world, 'p1');
    const cable = world.snapshot().cable;
    expect(cable.state).toBe('attached');
    expect(cable.anchorId).toBe('anchor-1');
    expect(me(world).hands).toBeNull();
    const attach = add(nearAnchor.anchors.find((anchor) => anchor.id === 'anchor-1')!.pose.pos, vec3(0, ANCHOR_HEIGHT, 0));
    expect(cable.length).toBeCloseTo(length(sub(attach, mountOf(world))), 3);
    world.dispose();
  });

  test('interact at the attach point detaches into that player\'s hands; at the winch box it releases', () => {
    const world = holdingNearAnchor();
    press(world, 'p1');
    press(world, 'p1');
    expect(me(world).hands).toBe('hook');
    expect(world.snapshot().cable.state).toBe('held');
    press(world, 'p1');
    expect(world.snapshot().cable.state).toBe('attached');
    const mount = mountOf(world);
    world.teleportPlayer('p1', vec3(mount.x, 0.02, mount.z - 1.1));
    run(world, 20);
    press(world, 'p1', aimAt(world, mount));
    expect(world.snapshot().cable.state).toBe('stowed');
    expect(me(world).hands).toBeNull();
    world.dispose();
  });

  test('carried 27 m from the mount the hook leaves the hands and is stowed on that tick', () => {
    const { world } = setup();
    takeAtBumper(world);
    const mount = mountOf(world);
    world.teleportPlayer('p1', vec3(mount.x, 0.02, mount.z - 27));
    world.step(new Map());
    expect(world.snapshot().cable.state).toBe('stowed');
    expect(me(world).hands).toBeNull();
    world.dispose();
  });

  test('a ground hook beyond 25 m of the mount is stowed', () => {
    const { world } = setup();
    takeAtBumper(world);
    const mount = mountOf(world);
    world.teleportPlayer('p1', vec3(mount.x, 0.02, mount.z - 20));
    run(world, 20);
    press(world, 'p1');
    expect(world.snapshot().cable.state).toBe('ground');
    const body = world.debugBody('vehicle')!;
    const at = body.translation();
    body.setTranslation(vec3(at.x, at.y, at.z + 10), true);
    world.step(new Map());
    expect(world.snapshot().cable.state).toBe('stowed');
    world.dispose();
  });

  test('a respawn stows the hook and empties the hands', () => {
    const lowPlane: BuiltCourse = deepFreeze({ ...testGround, killPlaneY: -0.5 });
    const { world } = setup(lowPlane);
    takeAtBumper(world);
    const mount = mountOf(world);
    world.teleportPlayer('p1', vec3(mount.x, -1, mount.z - 3));
    run(world, Math.round(PLAYER_KILL_RESPAWN_DELAY * TICK_RATE) - 5);
    expect(me(world).hands).toBe('hook');
    expect(world.snapshot().cable.state).toBe('held');
    run(world, 10);
    expect(world.snapshot().cable.state).toBe('stowed');
    expect(me(world).hands).toBeNull();
    world.dispose();
  });

  test('removing a player drops the hook at their feet', () => {
    const { world } = setup();
    takeAtBumper(world);
    const feet = me(world).pos;
    world.removePlayer('p1');
    const cable = world.snapshot().cable;
    expect(cable.state).toBe('ground');
    expect(cable.hookPos.x).toBeCloseTo(feet.x, 2);
    expect(cable.hookPos.z).toBeCloseTo(feet.z, 2);
    world.dispose();
  });

  test('beside a door with the hook in the hands, interact drops it instead of boarding', () => {
    const { world, spawn } = setup();
    takeAtBumper(world);
    world.teleportPlayer('p1', spawn);
    run(world, 20);
    press(world, 'p1');
    expect(me(world).seat).toBeNull();
    expect(world.snapshot().cable.state).toBe('ground');
    world.dispose();

    const bare = setup();
    press(bare.world, 'p1');
    expect(me(bare.world).seat).not.toBeNull();
    bare.world.dispose();
  });

  test('two players pressing interact beside the bumper in one tick: the earlier joiner gets the hook', () => {
    const { world } = setup();
    world.addPlayer('p2');
    const mount = mountOf(world);
    world.teleportPlayer('p1', vec3(mount.x - 0.3, 0.02, mount.z - 1.1));
    world.teleportPlayer('p2', vec3(mount.x + 0.3, 0.02, mount.z - 1.1));
    run(world, 20);
    world.step(
      new Map([
        ['p1', input({ interact: true, ...aimAt(world, mount, 'p1') })],
        ['p2', input({ interact: true, ...aimAt(world, mount, 'p2') })],
      ]),
    );
    expect(me(world, 'p1').hands).toBe('hook');
    expect(me(world, 'p2').hands).toBeNull();
    expect(world.snapshot().cable.holderId).toBe('p1');
    world.dispose();
  });

  test('a player holding a crate throws it first and never takes the hook', () => {
    const { world } = setup();
    world.teleportPlayer('p1', vec3(10, 0.02, 9.7));
    run(world, 20);
    press(world, 'p1');
    expect(me(world).hands).toBe('crate-1');
    const mount = mountOf(world);
    world.teleportPlayer('p1', vec3(mount.x, 0.02, mount.z - 1.1));
    run(world, 20);
    world.step(new Map([['p1', input({ interact: true })]]));
    expect(me(world).hands).toBeNull();
    expect(world.snapshot().cable.state).toBe('stowed');
    world.dispose();
  });
});

describe('the reel and obstacles (world)', () => {
  const input = (fields: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });
  const run = (world: World, ticks: number, inputs: ReadonlyMap<string, PlayerInput> = new Map()) => {
    for (let i = 0; i < ticks; i++) world.step(inputs);
  };
  const cable = (world: World) => world.snapshot().cable;
  const FAR_FROM_BOX = 6;
  const mountOf = (world: World) => {
    const body = world.debugBody('vehicle')!;
    return add(body.translation(), rotate(body.rotation(), world.vehicleConfig.winchMount));
  };
  // The Lodgy 10 m from anchor-1's attach point, so the cable is about 10 m.
  const tenAhead: BuiltCourse = deepFreeze({
    ...testGround,
    checkpoints: [{ ...testGround.checkpoints[0]!, spawn: { pos: vec3(-40, 0, -56.7), rot: IDENTITY } }, ...testGround.checkpoints.slice(1)],
  });

  // Players p1..pN are added; the first `seated` of them board, in order (driver, seat1, ...).
  function setup(players: number, seated: number, course: BuiltCourse = testGround) {
    const world = createWorld(RAPIER, { courseId: course.id, vehicleId: 'lodgy' }, course);
    const ids = Array.from({ length: players }, (_, i) => `p${i + 1}`);
    for (const id of ids) world.addPlayer(id);
    run(world, 30);
    for (const id of ids.slice(0, seated)) {
      world.step(new Map([[id, input({ interact: true })]]));
      world.step(new Map([[id, input()]]));
    }
    return { world, ids };
  }
  const attach = (world: World, anchorId: string) => {
    world.debugWinch().take('p1');
    expect(world.debugWinch().attach(anchorId)).toBe(true);
  };
  const standAtBox = (world: World, id: string, dz = 1.1) => {
    const mount = mountOf(world);
    world.teleportPlayer(id, vec3(mount.x, 0.02, mount.z - dz));
  };

  test('the driver reels in', () => {
    const { world } = setup(1, 1, tenAhead);
    attach(world, 'anchor-1');
    const before = cable(world).length;
    run(world, 30, new Map([['p1', input({ reel: 1 })]]));
    expect(cable(world).length).toBeCloseTo(before - 0.5, 2);
    expect(cable(world).reel).toBe(1);
    world.dispose();
  });

  test('a player on foot at the winch box reels when no driver does; out of range does nothing', () => {
    const { world } = setup(1, 0, tenAhead);
    attach(world, 'anchor-1');
    const before = cable(world).length;
    standAtBox(world, 'p1', FAR_FROM_BOX);
    run(world, 30, new Map([['p1', input({ reel: 1 })]]));
    expect(cable(world).length).toBe(before);
    standAtBox(world, 'p1');
    run(world, 30, new Map([['p1', input({ reel: 1 })]]));
    expect(cable(world).length).toBeCloseTo(before - 0.5, 1);
    world.dispose();
  });

  test('the driver wins over a player at the box, but the box player reels when the driver does not', () => {
    const { world } = setup(2, 1, tenAhead);
    attach(world, 'anchor-1');
    standAtBox(world, 'p2');
    run(world, 20);
    const before = cable(world).length;
    run(world, 30, new Map([['p1', input({ reel: -1 })], ['p2', input({ reel: 1 })]]));
    expect(cable(world).length).toBeCloseTo(before + 0.5, 1);
    const out = cable(world).length;
    run(world, 30, new Map([['p2', input({ reel: 1 })]]));
    expect(cable(world).length).toBeLessThan(out);
    world.dispose();
  });

  test('a seated passenger reeling does nothing', () => {
    const { world } = setup(2, 2, tenAhead);
    expect(world.snapshot().players.map((player) => player.seat)).toEqual(['driver', 'seat1']);
    attach(world, 'anchor-1');
    const before = cable(world).length;
    run(world, 30, new Map([['p2', input({ reel: 1 })]]));
    expect(cable(world).length).toBe(before);
    expect(cable(world).reel).toBe(0);
    world.dispose();
  });

  test('of two players at the box the earlier joiner reel applies', () => {
    const { world } = setup(2, 0, tenAhead);
    attach(world, 'anchor-1');
    standAtBox(world, 'p1');
    standAtBox(world, 'p2');
    run(world, 20);
    const before = cable(world).length;
    run(world, 30, new Map([['p1', input({ reel: 1 })], ['p2', input({ reel: -1 })]]));
    expect(cable(world).length).toBeCloseTo(before - 0.5, 1);
    world.dispose();
  });

  test('a seated driver reeling in with the hook on the ground stows it', () => {
    const { world } = setup(1, 1);
    world.debugWinch().take('p1');
    world.debugWinch().drop(add(mountOf(world), vec3(0, 0, -1)));
    expect(cable(world).state).toBe('ground');
    run(world, 2, new Map([['p1', input({ reel: 1 })]]));
    expect(cable(world).state).toBe('stowed');
    world.dispose();
  });

  test('reeling in with the hook on the ground stows it', () => {
    const { world } = setup(1, 0);
    world.debugWinch().take('p1');
    standAtBox(world, 'p1');
    world.debugWinch().drop(add(mountOf(world), vec3(0, 0, -1)));
    expect(cable(world).state).toBe('ground');
    run(world, 2, new Map([['p1', input({ reel: 1 })]]));
    expect(cable(world).state).toBe('stowed');
    world.dispose();
  });

  test('a barrier reeled in by a braked vehicle is dragged toward it; with the cable slack it stays locked', () => {
    const { world } = setup(1, 1);
    const barrier = world.debugBody('barrier-1')!;
    attach(world, 'barrier-1');
    const start = barrier.translation();
    const before = length(sub(start, mountOf(world)));
    run(world, 3 * TICK_RATE, new Map([['p1', input({ jump: true, reel: -1 })]]));
    const slack = barrier.translation();
    expect(length(sub(slack, start))).toBeLessThan(1e-3);
    run(world, 10 * TICK_RATE, new Map([['p1', input({ jump: true, reel: 1 })]]));
    const dragged = length(sub(start, barrier.translation()));
    expect(dragged).toBeGreaterThan(1);
    expect(length(sub(barrier.translation(), mountOf(world)))).toBeLessThan(before);
    world.dispose();
  });

  test('a barrier reset by the kill plane while the hook is on it stows the hook', () => {
    const { world } = setup(1, 1);
    attach(world, 'barrier-1');
    world.debugBody('barrier-1')!.setTranslation(vec3(-10, world.course.killPlaneY - 5, 10), true);
    run(world, 2);
    expect(cable(world).state).toBe('stowed');
    world.dispose();
  });

  test('V4: at the cap the cable does not shorten, and a braked vehicle creeps less than 0.15 m in 2 s', () => {
    const { world } = setup(1, 1, tenAhead);
    attach(world, 'anchor-1');
    const cap = WINCH_FORCE_PER_WEIGHT * world.vehicleConfig.mass * GRAVITY;
    const start = cable(world).length;
    let previous = start;
    let cappedTicks = 0;
    for (let i = 0; i < 2 * TICK_RATE; i++) {
      world.step(new Map([['p1', input({ jump: true, reel: 1 })]]));
      const now = cable(world).length;
      if (Math.abs(world.debug().cableTension - cap) < 1e-6) {
        cappedTicks += 1;
        expect(now).toBe(previous);
      }
      previous = now;
    }
    expect(cappedTicks).toBeGreaterThan(60);
    expect(start - previous).toBeLessThan(0.15);
    world.dispose();
  });

  test('V2: a barrier is unlocked on the tick the cable pulls it, so the first impulse moves it', () => {
    const { world } = setup(1, 1);
    attach(world, 'barrier-1');
    const barrier = world.debugBody('barrier-1')!;
    const start = barrier.translation();
    const input1 = new Map([['p1', input({ jump: true, reel: 1 })]]);
    let ticks = 0;
    while (world.debug().cableTension === 0 && ticks < 120) {
      world.step(input1);
      ticks += 1;
    }
    expect(ticks).toBeLessThan(10);
    const linvel = barrier.linvel();
    expect(length(vec3(linvel.x, linvel.y, linvel.z))).toBeGreaterThan(1e-6);
    run(world, 5, input1);
    expect(length(sub(barrier.translation(), start))).toBeGreaterThan(1e-4);
    world.dispose();
  });
});

