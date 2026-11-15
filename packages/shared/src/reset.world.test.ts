import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { RESET_HOLD, STUCK_WINDOW, TICK_RATE } from './constants';
import { AXIS_X, quatFromAxisAngle } from './math';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { createWorld, type World } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const input = (fields: Partial<PlayerInput>): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });
const HOLD_TICKS = Math.round(RESET_HOLD * TICK_RATE);

function seated(): World {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('a');
  world.step(new Map([['a', input({ interact: true })]]));
  world.step(new Map());
  expect(world.snapshot().players[0]!.seat).toBe('driver');
  return world;
}

const flip = (world: World, held: Partial<PlayerInput> = {}) => {
  world.debugBody('vehicle')!.setRotation(quatFromAxisAngle(AXIS_X, Math.PI), true);
  world.debugBody('vehicle')!.setTranslation({ x: 20, y: 1.2, z: -20 }, true);
  for (let i = 0; i < 120; i++) world.step(new Map([['a', input(held)]]));
};

const hold = (world: World, ticks: number, fields: Partial<PlayerInput> = {}) => {
  for (let i = 0; i < ticks; i++) world.step(new Map([['a', input({ reset: true, ...fields })]]));
};

describe('player reset (A10)', () => {
  test('(T8) an upturned, slow vehicle resets after the hold and costs one restart', () => {
    const world = seated();
    flip(world);
    expect(world.snapshot().vehicle.resetReady).toBe(true);
    hold(world, HOLD_TICKS - 1);
    expect(world.status().restarts).toBe(0);
    hold(world, 1);
    expect(world.status().restarts).toBe(1);
    const { vehicle, players } = world.snapshot();
    expect(vehicle.pos.x).toBeCloseTo(0, 0);
    expect(players[0]!.seat).toBeNull();
    world.dispose();
  });

  test('(T8) ignored when upright and moving', () => {
    const world = seated();
    hold(world, 3 * TICK_RATE, { moveY: 1 });
    expect(world.status().restarts).toBe(0);
    expect(world.snapshot().vehicle.resetReady).toBeUndefined();
    world.dispose();
  });

  test('(T8) a button held across many ticks fires once until released', () => {
    const world = seated();
    flip(world);
    hold(world, 5 * TICK_RATE);
    expect(world.status().restarts).toBe(1);
    // Seated again with the button still down: no new reset without a fresh press.
    world.step(new Map([['a', input({ interact: true, reset: true })]]));
    world.step(new Map([['a', input({ reset: true })]]));
    expect(world.snapshot().players[0]!.seat).toBe('driver');
    flip(world, { reset: true });
    hold(world, 5 * TICK_RATE);
    expect(world.status().restarts).toBe(1);
    world.step(new Map());
    flip(world);
    hold(world, HOLD_TICKS);
    expect(world.status().restarts).toBe(2);
    world.dispose();
  });

  test('(T8) a release resets the hold', () => {
    const world = seated();
    flip(world);
    hold(world, HOLD_TICKS - 10);
    world.step(new Map());
    hold(world, HOLD_TICKS - 10);
    expect(world.status().restarts).toBe(0);
    world.dispose();
  });

  test('(T8) a player on foot cannot reset', () => {
    const world = seated();
    world.step(new Map([['a', input({ interact: true })]]));
    world.step(new Map());
    expect(world.snapshot().players[0]!.seat).toBeNull();
    flip(world);
    hold(world, 2 * HOLD_TICKS);
    expect(world.status().restarts).toBe(0);
    expect(world.snapshot().vehicle.resetReady).toBeUndefined();
    world.dispose();
  });

  test('(T8) an empty tank counts as stuck', () => {
    const world = seated();
    world.debugVehicle().addFuel(-1);
    hold(world, HOLD_TICKS);
    expect(world.status().restarts).toBe(1);
    world.dispose();
  });

  test('(T8) throttle held for the stuck window without moving counts as stuck', () => {
    const world = seated();
    const braked = { moveY: 1, jump: true };
    hold(world, 0);
    for (let i = 0; i < STUCK_WINDOW * TICK_RATE - 5; i++) world.step(new Map([['a', input(braked)]]));
    expect(world.snapshot().vehicle.resetReady).toBeUndefined();
    for (let i = 0; i < 10; i++) world.step(new Map([['a', input(braked)]]));
    expect(world.snapshot().vehicle.resetReady).toBe(true);
    hold(world, HOLD_TICKS, braked);
    expect(world.status().restarts).toBe(1);
    world.dispose();
  });
});
