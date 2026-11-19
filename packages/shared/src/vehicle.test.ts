import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { DRIVER_DOOR_RANGE, GRAVITY, SURFACES, TICK_RATE, VEHICLE_UPSIDE_DOWN_DRAIN } from './constants';
import { SAND_PATCH_CENTER, testGround } from './courses/testGround';
import { IDENTITY, quatFromAxisAngle, vec3, yawOf, type Pose } from './math';
import { buildStatics } from './statics';
import { createRig, withBoxes } from './testRig';
import { createVehicle } from './vehicle';
import { VEHICLES, getVehicleConfig, type VehicleId } from './vehicles';

beforeAll(async () => {
  await RAPIER.init();
});

const SAND_PATCH_HALF_Z = 15;
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
    expect(rig.vehicle.forwardSpeed()).toBeLessThanOrEqual(config.maxSpeed * 1.02);
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

  test('T2: after 6 s from rest at full throttle it is slower on sand than on road', () => {
    const slab = withBoxes(testGround, {
      ground: [{ center: vec3(0, 0.02, -90), halfExtents: vec3(8, 0.02, 100), rot: IDENTITY, surface: 'sand' }],
    });
    const road = settled(id);
    road.run(6, { throttle: 1 });
    const sand = createRig(RAPIER, id, ORIGIN, slab);
    sand.run(1);
    sand.run(6, { throttle: 1 });
    expect(sand.vehicle.wheelSurfaces()).toEqual(['sand', 'sand', 'sand', 'sand']);
    expect(sand.vehicle.forwardSpeed()).toBeLessThan(road.vehicle.forwardSpeed() * (id === 'rv' ? 0.5 : 0.8));
  });

  test.runIf(id === 'rv')('T1: from rest on sand at full throttle it reaches 2 m/s within 10 s and stays on the patch', () => {
    const rig = settled(id, ON_SAND);
    let reached = false;
    for (let i = 0; i < 10 && !reached; i++) {
      rig.run(1, { throttle: 1 });
      reached = rig.vehicle.forwardSpeed() >= 2;
    }
    expect(reached).toBe(true);
    expect(rig.vehicle.wheelSurfaces()).toEqual(['sand', 'sand', 'sand', 'sand']);
  });

  test.runIf(id === 'rv')('entering the sand at 12 m/s it crosses the far edge within 10 s', () => {
    const edgeFar = SAND_PATCH_CENTER.z + SAND_PATCH_HALF_Z;
    const edgeNear = SAND_PATCH_CENTER.z - SAND_PATCH_HALF_Z;
    const rig = settled(id, { pos: vec3(SAND_PATCH_CENTER.x, 0, edgeFar + 5), rot: IDENTITY });
    rig.vehicle.body.setLinvel({ x: 0, y: 0, z: -12 }, true);
    let crossed = false;
    for (let i = 0; i < 10 && !crossed; i++) {
      rig.run(1, { throttle: 1 });
      crossed = rig.vehicle.state().pos.z < edgeNear;
    }
    expect(crossed).toBe(true);
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
      expect(Math.abs(slot.x) - h.x).toBeGreaterThanOrEqual(1);
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

describe.each(['lodgy', 'rv'] as const)('%s fuel and health', (id) => {
  const config = VEHICLES[id];

  test('(1) fuel drains at fuelBurn times the throttle magnitude, in reverse too, and not at zero throttle', () => {
    const full = settled(id);
    full.run(10, { throttle: 1 });
    expect(full.vehicle.fuel()).toBeCloseTo(1 - 10 * config.fuelBurn, 4);
    const half = settled(id);
    half.run(10, { throttle: 0.5 });
    expect(half.vehicle.fuel()).toBeCloseTo(1 - 5 * config.fuelBurn, 4);
    const reverse = settled(id);
    reverse.run(10, { throttle: -1 });
    expect(reverse.vehicle.fuel()).toBeCloseTo(1 - 10 * config.fuelBurn, 4);
    const idle = settled(id);
    idle.run(10);
    expect(idle.vehicle.fuel()).toBe(1);
    expect(full.vehicle.state().fuel).toBe(full.vehicle.fuel());
  });

  test('(2) with an empty tank full throttle does not move it, and braking and steering still work while coasting', () => {
    const rig = settled(id);
    rig.vehicle.addFuel(-1);
    expect(rig.vehicle.fuel()).toBe(0);
    rig.run(3, { throttle: 1 });
    expect(Math.hypot(rig.vehicle.state().pos.x, rig.vehicle.state().pos.z)).toBeLessThan(0.05);
    expect(rig.vehicle.fuel()).toBe(0);

    const coasting = settled(id);
    coasting.run(4, { throttle: 1 });
    coasting.vehicle.addFuel(-1);
    const v0 = coasting.vehicle.forwardSpeed();
    coasting.run(1, { throttle: 1, steer: 1 });
    expect(coasting.vehicle.forwardSpeed()).toBeLessThan(v0);
    expect(coasting.vehicle.state().steer).toBe(1);
    expect(yawOf(coasting.vehicle.state().rot)).toBeLessThan(0);
    coasting.run(5, { brake: true });
    expect(Math.abs(coasting.vehicle.forwardSpeed())).toBeLessThan(0.01);
  });

  test('(3) addFuel and repair clamp to [0, 1]', () => {
    const rig = settled(id);
    rig.vehicle.addFuel(0.5);
    expect(rig.vehicle.fuel()).toBe(1);
    rig.vehicle.addFuel(-0.25);
    expect(rig.vehicle.fuel()).toBeCloseTo(0.75, 10);
    rig.vehicle.addFuel(-5);
    expect(rig.vehicle.fuel()).toBe(0);
    rig.vehicle.repair(0.5);
    expect(rig.vehicle.health()).toBe(1);
    rig.vehicle.repair(-5);
    expect(rig.vehicle.health()).toBe(0);
    rig.vehicle.repair(0.5);
    expect(rig.vehicle.health()).toBe(0.5);
    expect(rig.vehicle.state().health).toBe(0.5);
  });

  test('(4) health stays 1 at rest for 10 s, and over a 100 m drive and a full stop', () => {
    const rest = createRig(RAPIER, id, ORIGIN);
    rest.run(10);
    expect(rest.vehicle.health()).toBe(1);

    const drive = settled(id);
    while (drive.vehicle.state().pos.z > -100) drive.run(0.1, { throttle: 1 });
    drive.run(10, { brake: true });
    expect(Math.abs(drive.vehicle.forwardSpeed())).toBeLessThan(0.01);
    expect(drive.vehicle.health()).toBe(1);
  });

  test('(6) upside down at rest for 10 s loses 10 times the drain', () => {
    const flipped = quatFromAxisAngle(vec3(0, 0, 1), Math.PI);
    const rig = createRig(RAPIER, id, { pos: vec3(0, config.halfExtents.y + config.rideHeight, 0), rot: flipped });
    rig.run(10);
    expect(rig.vehicle.health()).toBeCloseTo(1 - 10 * VEHICLE_UPSIDE_DOWN_DRAIN, 2);
  });

  test('(7) health never goes below 0', () => {
    const flipped = quatFromAxisAngle(vec3(0, 0, 1), Math.PI);
    const rig = createRig(RAPIER, id, { pos: vec3(0, config.halfExtents.y + config.rideHeight, 0), rot: flipped });
    rig.vehicle.repair(-0.95);
    rig.run(10);
    expect(rig.vehicle.health()).toBe(0);
  });
});

describe('the lodgy against a wall', () => {
  // The bumper reaches the wall's face after about `distance` metres.
  const wallRun = (distance: number, throttle: number, speed?: number) => {
    const half = VEHICLES.lodgy.halfExtents.z;
    const course = withBoxes(testGround, {
      walls: [{ center: vec3(0, 3, -(distance + half + 0.5)), halfExtents: vec3(8, 3, 0.5), rot: IDENTITY }],
    });
    const rig = createRig(RAPIER, 'lodgy', ORIGIN, course);
    rig.run(1);
    if (speed !== undefined) rig.vehicle.body.setLinvel({ x: 0, y: 0, z: -speed }, true);
    rig.run(Math.max(6, (distance / 5) * 2), { throttle });
    return { health: rig.vehicle.health(), z: rig.vehicle.body.translation().z };
  };

  test('(5) full throttle from 15 m costs 0.2 to 0.35, from 60 m costs more, a 2 m/s roll costs nothing', () => {
    const near = wallRun(15, 1).health;
    const far = wallRun(60, 1).health;
    expect(near).toBeGreaterThan(1 - 0.35);
    expect(near).toBeLessThan(1 - 0.2);
    expect(far).toBeLessThan(near);
    const roll = wallRun(5, 0, 2);
    // The centre rests half a length from the face when the bumper touches it.
    expect(roll.z).toBeLessThan(-5 + 0.3);
    expect(roll.z).toBeGreaterThan(-5 - 0.3);
    expect(roll.health).toBe(1);
  });
});

describe('W1: gripScale', () => {
  const config = VEHICLES.lodgy;
  const slips = (surface: keyof typeof SURFACES, gripScale?: number) => {
    const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    world.timestep = 1 / TICK_RATE;
    buildStatics(RAPIER, world, testGround);
    const vehicle = createVehicle(RAPIER, world, config, ORIGIN, () => surface, gripScale === undefined ? undefined : { gripScale });
    // The surface under a wheel is read from the previous step's contacts, so a few steps run first.
    for (let i = 0; i < 10; i++) {
      vehicle.step({ throttle: 0, steer: 0, brake: false });
      world.step();
    }
    return vehicle.wheelFrictionSlips();
  };

  test.each(Object.keys(SURFACES) as (keyof typeof SURFACES)[])('on %s each wheel slips at grip x surface x scale', (surface) => {
    const scaled = slips(surface, 0.75);
    expect(scaled).toHaveLength(4);
    for (const slip of scaled) expect(slip).toBeCloseTo(config.grip * SURFACES[surface].grip * 0.75, 6);
    for (const slip of slips(surface)) expect(slip).toBeCloseTo(config.grip * SURFACES[surface].grip, 6);
  });
});

describe('T6: vehicle.damage(amount, floor)', () => {
  const fresh = () => createRig(RAPIER, 'lodgy', ORIGIN).vehicle;

  test('takes the amount', () => {
    const vehicle = fresh();
    vehicle.damage(0.03, 0.02);
    expect(vehicle.health()).toBeCloseTo(0.97, 10);
    expect(vehicle.state().health).toBeCloseTo(0.97, 10);
  });

  test('stops at the floor', () => {
    const vehicle = fresh();
    vehicle.damage(5, 0.02);
    expect(vehicle.health()).toBe(0.02);
    vehicle.damage(0.03, 0.02);
    expect(vehicle.health()).toBe(0.02);
  });

  test('never raises health that is already below the floor', () => {
    const vehicle = fresh();
    vehicle.repair(-1);
    vehicle.repair(0.01);
    vehicle.damage(0.03, 0.02);
    expect(vehicle.health()).toBe(0.01);
  });

  test('leaves repair, the clamp and the impact paths as they were', () => {
    const vehicle = fresh();
    vehicle.damage(0.5, 0.02);
    vehicle.repair(0.2);
    expect(vehicle.health()).toBeCloseTo(0.7, 10);
    vehicle.repair(5);
    expect(vehicle.health()).toBe(1);
    vehicle.repair(-5);
    expect(vehicle.health()).toBe(0);
  });
});

describe('lodgy acceleration', () => {
  test('flat asphalt full throttle reaches 100 km/h in 10 s +- 1 s', () => {
    const rig = settled('lodgy');
    let reached = -1;
    for (let t = 0; t < 20 && reached < 0; t += 1 / TICK_RATE) {
      rig.run(1 / TICK_RATE, { throttle: 1 });
      if (rig.vehicle.forwardSpeed() >= 27.78) reached = t + 1 / TICK_RATE;
    }
    expect(reached).toBeGreaterThanOrEqual(9);
    expect(reached).toBeLessThanOrEqual(11);
  });

  test('top speed is 33 m/s', () => {
    expect(VEHICLES.lodgy.maxSpeed).toBe(33);
  });
});
