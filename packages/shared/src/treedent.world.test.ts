import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { HOLD_DURATION, PLAYER_CONTROLLER_OFFSET, PLAYER_SPRINT_SPEED, PLAYER_WALK_SPEED, TREEDENT_SECONDS, TREEDENT_SPEED, TICK_RATE } from './constants';
import { vec3 } from './math';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { createWorld, type World, type WorldEvent } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const START = vec3(100, PLAYER_CONTROLLER_OFFSET, 20);
const EAT_TICKS = Math.round(HOLD_DURATION * TICK_RATE) + 2;
const input = (fields: Partial<PlayerInput>): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });
const me = (world: World) => world.snapshot().players.find((player) => player.playerId === 'p')!;

function fresh(inventory: ('treedent' | null)[] = ['treedent', null, null], crew = 1): World {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p');
  if (crew > 1) world.addPlayer('q');
  world.teleportPlayer('p', START);
  for (let i = 0; i < 10; i++) world.step(new Map());
  world.debugSetInventory('p', inventory);
  return world;
}

function eat(world: World, extra: Partial<PlayerInput> = {}): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let i = 0; i < EAT_TICKS && !events.some((e) => e.kind === 'eat'); i++) events.push(...world.step(new Map([['p', input({ use: true, ...extra })]])));
  world.step(new Map());
  return events;
}

// The horizontal speed the snapshot reports after 2 s of walking straight; the course has bumps along the way, so the distance covered would not be exact.
function topSpeed(world: World, fields: Partial<PlayerInput>): number {
  world.teleportPlayer('p', START);
  for (let i = 0; i < 10; i++) world.step(new Map());
  for (let i = 0; i < 2 * TICK_RATE; i++) world.step(new Map([['p', input({ moveY: 1, ...fields })]]));
  const { walk } = me(world);
  return Math.hypot(walk.x, walk.z);
}

// A player who has boarded: put beside the vehicle at the spawn slot, then interact.
function seated(inventory: ('treedent' | null)[], eatFirst = false): { world: World } {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p');
  for (let i = 0; i < 10; i++) world.step(new Map());
  world.debugSetInventory('p', inventory);
  if (eatFirst) eat(world);
  world.step(new Map([['p', input({ interact: true })]]));
  world.step(new Map());
  if (me(world).seat === null) throw new Error('could not board');
  return { world };
}

describe('eating a treedent', () => {
  test('a hold of HOLD_DURATION consumes the item, sets 15 s and emits eat', () => {
    const world = fresh();
    const events = eat(world);
    expect(events.filter((e) => e.kind === 'eat')).toHaveLength(1);
    expect(events.find((e) => e.kind === 'eat')!.playerId).toBe('p');
    expect(me(world).inventory).toEqual([null, null, null]);
    expect(me(world).treedent).toBeGreaterThan(TREEDENT_SECONDS - 0.15);
    expect(me(world).hold).toBeNull();
    world.dispose();
  });

  test('releasing early eats nothing', () => {
    const world = fresh();
    for (let i = 0; i < EAT_TICKS / 2; i++) world.step(new Map([['p', input({ use: true })]]));
    expect(me(world).hold).not.toBeNull();
    world.step(new Map([['p', input({})]]));
    expect(me(world).inventory[0]).toBe('treedent');
    expect(me(world).treedent).toBeUndefined();
    world.dispose();
  });

  test('walk and sprint speed rise by TREEDENT_SPEED, measured after 2 s on flat ground', () => {
    const world = fresh();
    const walk = topSpeed(world, {});
    const sprint = topSpeed(world, { sprint: true });
        expect(walk).toBeCloseTo(PLAYER_WALK_SPEED, 6);
    expect(sprint).toBeCloseTo(PLAYER_SPRINT_SPEED, 6);
    world.debugSetInventory('p', ['treedent', null, null]);
    eat(world);
    const fastWalk = topSpeed(world, {});
    const fastSprint = topSpeed(world, { sprint: true });
    expect(fastWalk).toBeCloseTo(PLAYER_WALK_SPEED * TREEDENT_SPEED, 6);
    expect(fastSprint).toBeCloseTo(PLAYER_SPRINT_SPEED * TREEDENT_SPEED, 6);
    world.dispose();
  });

  test('crouch speed is not boosted', () => {
    const world = fresh();
    const slow = topSpeed(world, { crouch: true });
    world.debugSetInventory('p', ['treedent', null, null]);
    eat(world);
    expect(topSpeed(world, { crouch: true })).toBeCloseTo(slow, 6);
    world.dispose();
  });

  test('it runs out after 15 s', () => {
    const world = fresh();
    eat(world);
    for (let i = 0; i < 14 * TICK_RATE; i++) world.step(new Map());
    expect(me(world).treedent).toBeGreaterThan(0);
    for (let i = 0; i < 2 * TICK_RATE; i++) world.step(new Map());
    expect(me(world).treedent).toBeUndefined();
    world.dispose();
  });

  test('a second treedent refreshes the timer to 15 s without stacking', () => {
    const world = fresh(['treedent', 'treedent', null]);
    eat(world);
    for (let i = 0; i < 10 * TICK_RATE; i++) world.step(new Map());
    expect(me(world).treedent).toBeLessThan(5.5);
    eat(world, { slot: 1 });
    expect(me(world).treedent).toBeGreaterThan(TREEDENT_SECONDS - 0.15);
    expect(me(world).inventory).toEqual([null, null, null]);
    world.dispose();
  });

  test('a restart at the checkpoint clears it', () => {
    const world = fresh();
    eat(world);
    expect(me(world).treedent).toBeDefined();
    world.restartCheckpoint();
    world.step(new Map());
    expect(me(world).treedent).toBeUndefined();
    world.dispose();
  });

  test('skipping a checkpoint clears it', () => {
    const world = fresh();
    eat(world);
    expect(world.adminTool('skipCheckpoint')).toBe(true);
    expect(me(world).treedent).toBeUndefined();
    world.dispose();
  });

  test('being downed clears it', () => {
    const world = fresh(['treedent', null, null], 2);
    eat(world);
    world.debugHurt('p', 100);
    world.step(new Map());
    expect(me(world).downed).not.toBeNull();
    expect(me(world).treedent).toBeUndefined();
    world.dispose();
  });

  test('a kill-plane respawn clears it', () => {
    const world = fresh();
    eat(world);
    world.teleportPlayer('p', vec3(START.x, world.course.killPlaneY - 5, START.z));
    for (let i = 0; i < 4 * TICK_RATE && me(world).pos.y < 0; i++) world.step(new Map());
    expect(me(world).pos.y).toBeGreaterThan(world.course.killPlaneY);
    expect(me(world).treedent).toBeUndefined();
    world.dispose();
  });

  test('while the kill-plane respawn runs nothing is eaten and a running timer is already cleared', () => {
    const world = fresh();
    world.teleportPlayer('p', vec3(START.x, world.course.killPlaneY - 5, START.z));
    for (let i = 0; i < 3; i++) world.step(new Map([['p', input({ use: true })]]));
    expect(me(world).pos.y).toBeLessThan(world.course.killPlaneY);
    expect(world.canEmote('p')).toBe(false);
    for (let i = 0; i < 5; i++) world.step(new Map([['p', input({ use: true })]]));
    expect(me(world).inventory[0]).toBe('treedent');
    expect(me(world).hold).toBeNull();
    world.dispose();
  });

  test('the timer is cleared on the tick the fall begins, not at the respawn', () => {
    const world = fresh();
    eat(world);
    world.teleportPlayer('p', vec3(START.x, world.course.killPlaneY - 5, START.z));
    world.step(new Map());
    world.step(new Map());
    expect(me(world).treedent).toBeUndefined();
    world.dispose();
  });

  test('the snapshot rounds the timer up to 0.1 and never above 15', () => {
    const world = fresh();
    eat(world);
    for (let i = 0; i < 100; i++) {
      world.step(new Map());
      const t = me(world).treedent!;
      expect(t).toBeLessThanOrEqual(TREEDENT_SECONDS);
      expect(Math.abs(t * 10 - Math.round(t * 10))).toBeLessThan(1e-6);
    }
    world.dispose();
  });

  test('a teleport (the out-of-bounds move) keeps it', () => {
    const world = fresh();
    eat(world);
    world.teleportPlayer('p', START);
    expect(me(world).treedent).toBeGreaterThan(TREEDENT_SECONDS - 0.15);
    world.dispose();
  });

  test('seated, the item stays and nothing is eaten', () => {
    const { world } = seated(['treedent', null, null]);
    for (let i = 0; i < EAT_TICKS * 2; i++) world.step(new Map([['p', input({ use: true })]]));
    expect(me(world).inventory[0]).toBe('treedent');
    expect(me(world).treedent).toBeUndefined();
    world.dispose();
  });

  test('a timer that runs while seated counts down', () => {
    const { world } = seated(['treedent', null, null], true);
    const before = me(world).treedent!;
    expect(before).toBeGreaterThan(14);
    for (let i = 0; i < 5 * TICK_RATE; i++) world.step(new Map());
    expect(me(world).treedent!).toBeLessThan(before - 4.9);
    world.dispose();
  });

  test('canEmote: true on foot, false for an unknown id, a downed player and a seated one', () => {
    const world = fresh(['treedent', null, null], 2);
    expect(world.canEmote('p')).toBe(true);
    expect(world.canEmote('nobody')).toBe(false);
    world.debugHurt('p', 100);
    world.step(new Map());
    expect(world.canEmote('p')).toBe(false);
    expect(world.canEmote('q')).toBe(true);
    world.dispose();
  });

  test('canEmote is false seated', () => {
    const { world } = seated(['treedent', null, null]);
    expect(world.canEmote('p')).toBe(false);
    world.dispose();
  });
});
