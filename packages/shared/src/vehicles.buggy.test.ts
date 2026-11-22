import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { SURFACES, TICK_RATE, type Surface } from './constants';
import { getCourse } from './courses/index';
import { IDENTITY, vec3 } from './math';
import { createRig, withBoxes } from './testRig';
import { VEHICLES, VEHICLE_IDS, type VehicleId } from './vehicles';

beforeAll(async () => {
  await RAPIER.init();
});

const KMH_100 = 100 / 3.6;

// A rig settled on 4 km of one surface.
function onSurface(id: VehicleId, surface: Surface) {
  const course = withBoxes(getCourse('test'), { ground: [{ center: vec3(0, 0.02, -2000), halfExtents: vec3(10, 0.02, 2000), rot: IDENTITY, surface }] });
  const rig = createRig(RAPIER, id, { pos: vec3(0, 0.04, 0), rot: IDENTITY }, course);
  rig.run(1);
  return rig;
}

// Full throttle from rest; the first time the speed reaches `to`, and the best speed in 45 s.
function launch(id: VehicleId, surface: Surface): { zeroTo100: number; top: number } {
  const rig = onSurface(id, surface);
  let zeroTo100 = -1;
  let top = 0;
  for (let t = 0; t < 45; t += 1 / TICK_RATE) {
    rig.run(1 / TICK_RATE, { throttle: 1 });
    const speed = rig.vehicle.forwardSpeed();
    if (zeroTo100 < 0 && speed >= KMH_100) zeroTo100 = t + 1 / TICK_RATE;
    top = Math.max(top, speed);
  }
  return { zeroTo100, top };
}

describe('the buggy', () => {
  test('has six seats and is not offered in the lobby', () => {
    expect(VEHICLES.buggy.seats).toHaveLength(6);
    expect(VEHICLES.buggy.seats[0]!.id).toBe('driver');
    expect(VEHICLE_IDS).not.toContain('buggy');
    expect(VEHICLE_IDS).toEqual(['lodgy', 'rv']);
  });

  test('reaches 100 km/h on flat dirt in 6 s +- 0.5 s', () => {
    const { zeroTo100 } = launch('buggy', 'dirt');
    expect(zeroTo100).toBeGreaterThanOrEqual(5.5);
    expect(zeroTo100).toBeLessThanOrEqual(6.5);
  });

  test('reaches a top speed within 1 m/s of 33', () => {
    const { top } = launch('buggy', 'dirt');
    expect(top).toBeGreaterThanOrEqual(32);
    expect(top).toBeLessThanOrEqual(34);
  });

  test('grips on sand and dirt at least as well as the Lodgy on the road', () => {
    const roadGrip = VEHICLES.lodgy.grip * SURFACES.road.grip;
    for (const surface of ['sand', 'dirt'] as const) {
      const rig = onSurface('buggy', surface);
      rig.run(0.5, { throttle: 0.2 });
      const slips = rig.vehicle.wheelFrictionSlips();
      for (const slip of slips) expect(slip, surface).toBeGreaterThanOrEqual(roadGrip);
    }
  });

  test('has long suspension travel and a low, wide body', () => {
    expect(VEHICLES.buggy.suspensionTravel).toBeGreaterThan(VEHICLES.lodgy.suspensionTravel);
    expect(VEHICLES.buggy.halfExtents.y).toBeLessThan(VEHICLES.lodgy.halfExtents.y);
    expect(VEHICLES.buggy.halfExtents.x).toBeGreaterThan(VEHICLES.lodgy.halfExtents.x);
  });
});

describe('the Lodgy is unchanged', () => {
  test('flat road full throttle reaches 100 km/h in 10.28 s', () => {
    expect(launch('lodgy', 'road').zeroTo100).toBeCloseTo(10.28, 2);
  });

  test('top speed config is 33 m/s', () => {
    expect(VEHICLES.lodgy.maxSpeed).toBe(33);
  });
});
