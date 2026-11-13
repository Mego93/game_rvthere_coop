import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  GRAVITY,
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
