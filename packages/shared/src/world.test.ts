import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, test } from 'vitest';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { VEHICLES } from './vehicles';
import { createWorld, type World } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const input = (fields: Partial<PlayerInput>): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });

function run(world: World, ticks: number, inputs: Map<string, PlayerInput>) {
  for (let i = 0; i < ticks; i++) world.step(inputs);
}

test('rejects unknown courses and vehicles', () => {
  expect(() => createWorld(RAPIER, { courseId: 'nope', vehicleId: 'lodgy' })).toThrow('Unknown course: nope');
  expect(() => createWorld(RAPIER, { courseId: 'test', vehicleId: 'bus' })).toThrow('Unknown vehicle: bus');
});

test('spawns the chosen vehicle at the first checkpoint', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'rv' });
  expect(world.vehicleConfig).toBe(VEHICLES.rv);
  run(world, 120, new Map());
  const { tick, vehicle } = world.snapshot();
  expect(tick).toBe(120);
  expect(vehicle.pos.x).toBeCloseTo(0, 2);
  expect(vehicle.pos.z).toBeCloseTo(0, 2);
  expect(vehicle.pos.y).toBeCloseTo(VEHICLES.rv.rideHeight, 1);
});

test('with no input the vehicle does not move', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  run(world, 300, new Map());
  expect(Math.abs(world.debug().forwardSpeed)).toBeLessThan(0.01);
});

test('the first input in the map drives: moveY is throttle, moveX is steer, jump is brake', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  run(world, 60, new Map());
  const inputs = new Map([
    ['a', input({ moveY: 1, moveX: 0.3 })],
    ['b', input({ moveY: -1, moveX: -1 })],
  ]);
  run(world, 180, inputs);
  const moving = world.snapshot().vehicle;
  expect(moving.throttle).toBe(1);
  expect(moving.steer).toBe(0.3);
  expect(moving.pos.z).toBeLessThan(-3);
  expect(moving.pos.x).toBeGreaterThan(0.5);

  run(world, 300, new Map([['a', input({ jump: true })]]));
  expect(Math.abs(world.debug().forwardSpeed)).toBeLessThan(0.01);
});

test('step returns an event list and debug reports wheel surfaces', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  expect(world.step(new Map())).toEqual([]);
  run(world, 60, new Map());
  expect(world.debug().wheelSurfaces).toEqual(['road', 'road', 'road', 'road']);
});

test('the same inputs produce the same snapshot', () => {
  const play = () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    run(world, 60, new Map());
    run(world, 240, new Map([['a', input({ moveY: 1, moveX: 0.4 })]]));
    run(world, 120, new Map([['a', input({ moveY: -1, moveX: -1 })]]));
    return JSON.stringify(world.snapshot());
  };
  expect(play()).toBe(play());
});

test('rejects ids that are only inherited object keys', () => {
  expect(() => createWorld(RAPIER, { courseId: 'constructor', vehicleId: 'lodgy' })).toThrow(
    'Unknown course: constructor',
  );
  expect(() => createWorld(RAPIER, { courseId: 'test', vehicleId: 'toString' })).toThrow('Unknown vehicle: toString');
});

test('an input that is not a finite number is treated as no input and does no lasting harm', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  run(world, 60, new Map());
  run(world, 5, new Map([['a', input({ moveY: Number.NaN, moveX: Number.POSITIVE_INFINITY })]]));
  expect(world.snapshot().vehicle.throttle).toBe(0);
  expect(world.snapshot().vehicle.steer).toBe(0);
  run(world, 120, new Map([['a', input({ moveY: 1 })]]));
  expect(world.snapshot().vehicle.pos.z).toBeLessThan(-2);
});

test('shared course and vehicle data cannot be modified', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  expect(() => {
    (world.vehicleConfig as { mass: number }).mass = 1;
  }).toThrow(TypeError);
  expect(() => {
    world.course.checkpoints[0]!.spawn.pos.x = 5;
  }).toThrow(TypeError);
});

test('dispose frees the physics world', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  run(world, 10, new Map());
  world.dispose();
  expect(() => world.step(new Map())).toThrow();
});
