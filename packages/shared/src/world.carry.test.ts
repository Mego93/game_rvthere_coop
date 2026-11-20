import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { AMMO_MAX, PLAYER_MAX_HEALTH, TICK_RATE } from './constants';
import { vec3 } from './math';
import { createWorld, type World, type WorldCarry } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const worlds: World[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

const make = (): World => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  worlds.push(world);
  world.addPlayer('p1');
  world.recordStart();
  return world;
};

const carry = (fields: Partial<WorldCarry> = {}): WorldCarry => ({
  fuel: 0.4,
  health: 0.6,
  players: [{ id: 'p1', health: 55, ammo: 10, gun: true }],
  coinsCollected: 3,
  coinsTotal: 5,
  wallet: 2,
  respawns: 1,
  assisted: false,
  elapsed: 12.5,
  restarts: 2,
  ...fields,
});

describe('step 40: carry between stages', () => {
  test('applyCarry then carryOut round-trips fuel, health, ammo, coins, elapsed time and restarts', () => {
    const world = make();
    world.applyCarry(carry());
    const out = world.carryOut();
    expect(out.fuel).toBeCloseTo(0.4, 6);
    expect(out.health).toBeCloseTo(0.6, 6);
    expect(out.players).toEqual([{ id: 'p1', health: 55, ammo: 10, gun: true }]);
    expect(out.wallet).toBe(2);
    expect(out.respawns).toBe(1);
    expect(out.elapsed).toBeCloseTo(12.5, 6);
    expect(out.restarts).toBe(2);
    // The new course has its own coins on top of the carried ones.
    expect(out.coinsCollected).toBe(3);
    expect(out.coinsTotal).toBe(5 + world.course.coins.length);
  });

  test('the timer and the restart count continue in the snapshot and the status', () => {
    const world = make();
    world.applyCarry(carry());
    world.step(new Map());
    const snapshot = world.snapshot();
    expect(snapshot.elapsed).toBeCloseTo(12.5 + 1 / TICK_RATE, 6);
    expect(snapshot.restarts).toBe(2);
    expect(world.status().coinsCollected).toBe(3);
    expect(snapshot.coinsTotal).toBe(5 + world.course.coins.length);
    expect(snapshot.coinsCollected).toBeLessThanOrEqual(snapshot.coinsTotal);
  });

  test('collected coins add to the carried count', () => {
    const world = make();
    world.applyCarry(carry());
    const coin = world.course.coins[0]!.pose.pos;
    world.teleportPlayer('p1', vec3(coin.x, 0.02, coin.z));
    world.step(new Map());
    expect(world.status().coinsCollected).toBe(4);
    expect(world.status().wallet).toBe(3);
  });

  test('fuel, health and ammo are clamped to their maximums', () => {
    const world = make();
    world.applyCarry(carry({ fuel: 7, health: 9, players: [{ id: 'p1', health: 5000, ammo: 5000, gun: true }] }));
    const out = world.carryOut();
    expect(out.fuel).toBe(1);
    expect(out.health).toBe(1);
    expect(out.players[0]).toEqual({ id: 'p1', health: PLAYER_MAX_HEALTH, ammo: AMMO_MAX, gun: true });
    world.applyCarry(carry({ fuel: -1, health: -1, players: [{ id: 'p1', health: -4, ammo: -4, gun: true }] }));
    const low = world.carryOut();
    expect(low.fuel).toBe(0);
    expect(low.players[0]!.ammo).toBe(0);
  });

  test('a carried player who is not in the new world is ignored, and a present one with no entry keeps its own values', () => {
    const world = make();
    world.addPlayer('p2');
    world.applyCarry(carry({ players: [{ id: 'gone', health: 10, ammo: 1, gun: true }] }));
    expect(world.carryOut().players.map((player) => player.id)).toEqual(['p1', 'p2']);
    expect(world.carryOut().players[0]!.health).toBe(PLAYER_MAX_HEALTH);
  });

  test('a checkpoint restart after the carry keeps the carried time, count and coins and does not refill the vehicle', () => {
    const world = make();
    world.applyCarry(carry({ fuel: 0.5 }));
    world.restartCheckpoint();
    world.step(new Map());
    const out = world.carryOut();
    expect(out.restarts).toBe(3);
    expect(out.coinsCollected).toBe(3);
    expect(out.fuel).toBeCloseTo(0.5, 2);
  });

  test('props, items and power-ups do not carry', () => {
    const fresh = make();
    const before = JSON.stringify(fresh.snapshot().props);
    const other = make();
    other.applyCarry(carry());
    expect(JSON.stringify(other.snapshot().props)).toBe(before);
    expect(other.snapshot().players[0]!.inventory).toEqual([null, null, null]);
  });

  test('assisted carries, so a run that used an admin tool earns no stars', () => {
    const world = make();
    world.applyCarry(carry({ assisted: true }));
    expect(world.status().assisted).toBe(true);
  });
});
