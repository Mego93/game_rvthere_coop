import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { DRIVER_DOOR_RANGE, GRAVITY, SURFACES } from './constants';
import { SAND_PATCH_CENTER } from './courses/testGround';
import { IDENTITY, vec3, yawOf, type Pose } from './math';
import { createRig } from './testRig';
import { VEHICLES, getVehicleConfig, type VehicleId } from './vehicles';

beforeAll(async () => {
  await RAPIER.init();
});

const ORIGIN: Pose = { pos: vec3(0, 0, 0), rot: IDENTITY };
const ON_SAND: Pose = { pos: vec3(SAND_PATCH_CENTER.x, 0, SAND_PATCH_CENTER.z + 10), rot: IDENTITY };

// A rig that has had one second to settle on its suspension.
function settled(id: VehicleId, spawn: Pose = ORIGIN) {
  const rig = createRig(RAPIER, id, spawn);
  rig.run(1);
  return rig;
}

test('getVehicleConfig rejects unknown ids', () => {
  expect(getVehicleConfig('lodgy')).toBe(VEHICLES.lodgy);
  expect(() => getVehicleConfig('bus')).toThrow('Unknown vehicle: bus');
});

describe.each(['lodgy', 'rv'] as const)('%s', (id) => {
  const config = VEHICLES[id];

  test('stays at rest on flat ground for 10 s', () => {
    const rig = createRig(RAPIER, id, ORIGIN);
    rig.run(10);
    const { pos } = rig.vehicle.state();
    expect(Math.hypot(pos.x, pos.z)).toBeLessThan(0.01);
    expect(Math.abs(rig.vehicle.forwardSpeed())).toBeLessThan(0.01);
    expect(pos.y).toBeCloseTo(config.rideHeight, 1);
  });

  test('throttle drives it straight toward -Z', () => {
    const rig = settled(id);
    rig.run(3, { throttle: 1 });
    const { pos } = rig.vehicle.state();
    expect(pos.z).toBeLessThan(-5);
    expect(Math.abs(pos.x)).toBeLessThan(0.1);
    expect(rig.vehicle.forwardSpeed()).toBeGreaterThan(0);
  });

  test('negative throttle reverses, no faster than the reverse speed', () => {
    const rig = settled(id);
    rig.run(4, { throttle: -1 });
    expect(rig.vehicle.state().pos.z).toBeGreaterThan(3);
    expect(rig.vehicle.forwardSpeed()).toBeLessThan(0);
    expect(rig.vehicle.forwardSpeed()).toBeGreaterThanOrEqual(-config.reverseSpeed);
  });

  test('positive steer turns right, negative steer turns left', () => {
    const right = settled(id);
    right.run(3, { throttle: 1, steer: 1 });
    expect(right.vehicle.state().pos.x).toBeGreaterThan(1);
    expect(yawOf(right.vehicle.state().rot)).toBeLessThan(0);

    const left = settled(id);
    left.run(3, { throttle: 1, steer: -1 });
    expect(left.vehicle.state().pos.x).toBeLessThan(-1);
    expect(yawOf(left.vehicle.state().rot)).toBeGreaterThan(0);
  });

  test('approaches but never exceeds its top speed', () => {
    const rig = settled(id);
    rig.run(20, { throttle: 1 });
    expect(rig.vehicle.forwardSpeed()).toBeLessThanOrEqual(config.maxSpeed);
    expect(rig.vehicle.forwardSpeed()).toBeGreaterThan(config.maxSpeed * 0.8);
  });

  test('coasts down at the road rolling resistance, and brakes much harder', () => {
    const rig = settled(id);
    rig.run(5, { throttle: 1 });
    const v0 = rig.vehicle.forwardSpeed();
    rig.run(2);
    const coast = (v0 - rig.vehicle.forwardSpeed()) / 2;
    expect(coast).toBeCloseTo(SURFACES.road.rolling * GRAVITY, 2);

    const v1 = rig.vehicle.forwardSpeed();
    rig.run(0.5, { brake: true });
    const braking = (v1 - rig.vehicle.forwardSpeed()) / 0.5;
    expect(braking).toBeGreaterThan(coast * 10);

    rig.run(5, { brake: true });
    expect(Math.abs(rig.vehicle.forwardSpeed())).toBeLessThan(0.01);
  });

  test('reports the surface under each wheel', () => {
    expect(settled(id).vehicle.wheelSurfaces()).toEqual(['road', 'road', 'road', 'road']);
    expect(settled(id, ON_SAND).vehicle.wheelSurfaces()).toEqual(['sand', 'sand', 'sand', 'sand']);
  });

  test('sand slows it to less than half the distance covered on road', () => {
    const road = settled(id);
    road.run(3, { throttle: 1 });
    const onRoad = -road.vehicle.state().pos.z;

    const sand = settled(id, ON_SAND);
    sand.run(3, { throttle: 1 });
    const onSand = ON_SAND.pos.z - sand.vehicle.state().pos.z;

    expect(onSand).toBeLessThan(onRoad / 2);
  });

  test('state reports clamped throttle and steer', () => {
    const rig = settled(id);
    rig.run(0.1, { throttle: 3, steer: -3 });
    expect(rig.vehicle.state().throttle).toBe(1);
    expect(rig.vehicle.state().steer).toBe(-1);
  });
});

describe.each(['lodgy', 'rv'] as const)('%s seats and spawn slots', (id) => {
  const config = VEHICLES[id];
  const h = config.halfExtents;

  test('has at least six seats, the driver first and on the left, with unique ids', () => {
    expect(config.seats.length).toBeGreaterThanOrEqual(6);
    expect(config.seats[0]!.id).toBe('driver');
    expect(config.seats[0]!.side).toBe(-1);
    expect(config.seats.map((s) => s.id)).toEqual(['driver', 'seat1', 'seat2', 'seat3', 'seat4', 'seat5']);
    expect(new Set(config.seats.map((s) => s.id)).size).toBe(config.seats.length);
  });

  test('every seat is inside the chassis box and on the side its x says', () => {
    for (const seat of config.seats) {
      expect(Math.abs(seat.pos.x)).toBeLessThan(h.x);
      expect(Math.abs(seat.pos.y)).toBeLessThan(h.y);
      expect(Math.abs(seat.pos.z)).toBeLessThan(h.z);
      expect(Math.sign(seat.pos.x)).toBe(seat.side);
    }
  });

  test('has six distinct spawn slots at least 1 m outside the chassis box', () => {
    expect(config.spawnSlots).toHaveLength(6);
    for (const slot of config.spawnSlots) {
      expect(Math.abs(slot.x) - h.x >= 1 || Math.abs(slot.z) - h.z >= 1).toBe(true);
    }
    expect(new Set(config.spawnSlots.map((s) => `${s.x},${s.z}`)).size).toBe(6);
  });

  test('slot 0 is within door range of the driver door and slot 2 is not', () => {
    const driver = config.seats[0]!;
    const door = { x: driver.side * h.x, z: driver.pos.z };
    const distance = (slot: { x: number; z: number }) => Math.hypot(slot.x - door.x, slot.z - door.z);
    expect(distance(config.spawnSlots[0]!)).toBeLessThanOrEqual(DRIVER_DOOR_RANGE);
    expect(distance(config.spawnSlots[2]!)).toBeGreaterThan(DRIVER_DOOR_RANGE);
  });

  test('seats and slots cannot be modified', () => {
    expect(() => {
      (config.seats[0] as { side: number }).side = 1;
    }).toThrow(TypeError);
    expect(() => {
      (config.spawnSlots[0] as { x: number }).x = 0;
    }).toThrow(TypeError);
  });
});
