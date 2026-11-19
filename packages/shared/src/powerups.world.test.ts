import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { HOLD_DURATION, ITEM_DROP_MIX, ITEM_KINDS, KOKE_SECONDS, PLAYER_CONTROLLER_OFFSET, SHIELD_HP, SHIELD_SECONDS, TAJINE_HEAL, TICK_RATE, type ItemKind } from './constants';
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
const run = (world: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) world.step(new Map());
};

function fresh(inventory: (ItemKind | null)[]): World {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  world.addPlayer('p');
  world.teleportPlayer('p', START);
  run(world, 10);
  world.debugSetInventory('p', inventory);
  return world;
}

function use(world: World, slot: 0 | 1 | 2 = 0): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let i = 0; i < EAT_TICKS && !events.some((e) => e.kind === 'eat'); i++) events.push(...world.step(new Map([['p', input({ use: true, slot })]])));
  world.step(new Map());
  return events;
}

describe('step 39 rule 1: the power-ups', () => {
  test('the tajine heals TAJINE_HEAL, capped at 100, is consumed and says what was eaten', () => {
    const world = fresh(['tajine', 'tajine', null]);
    world.debugHurt('p', 70);
    world.step(new Map());
    expect(me(world).health).toBe(30);
    const events = use(world);
    expect(events.find((e) => e.kind === 'eat')).toMatchObject({ playerId: 'p', item: 'tajine' });
    expect(me(world).health).toBe(30 + TAJINE_HEAL);
    expect(me(world).inventory).toEqual([null, 'tajine', null]);
    expect('treedent' in me(world)).toBe(false);
    use(world, 1);
    expect(me(world).health).toBe(100);
    world.dispose();
  });

  test('fromage blanc gives a shield of SHIELD_HP that lasts SHIELD_SECONDS and refreshes without stacking', () => {
    const world = fresh(['fromageBlanc', 'fromageBlanc', null]);
    const events = use(world);
    expect(events.find((e) => e.kind === 'eat')).toMatchObject({ item: 'fromageBlanc' });
    expect(me(world).shield).toBe(SHIELD_HP);
    run(world, 10 * TICK_RATE);
    world.debugHurt('p', 12);
    run(world, 1);
    expect(me(world).shield).toBe(SHIELD_HP - 12);
    use(world, 1);
    expect(me(world).shield).toBe(SHIELD_HP);
    run(world, SHIELD_SECONDS * TICK_RATE - 5);
    expect(me(world).shield).toBeDefined();
    run(world, 10);
    expect('shield' in me(world)).toBe(false);
    world.dispose();
  });

  test('the shield absorbs damage before health, and the rest goes through', () => {
    const world = fresh(['fromageBlanc', null, null]);
    use(world);
    world.debugHurt('p', 20);
    run(world, 1);
    expect(me(world).health).toBe(100);
    expect(me(world).shield).toBe(10);
    world.debugHurt('p', 25);
    run(world, 1);
    expect(me(world).health).toBe(85);
    expect('shield' in me(world)).toBe(false);
    world.dispose();
  });

  test('a fully absorbed hit raises no hurt event', () => {
    const world = fresh(['fromageBlanc', null, null]);
    use(world);
    world.debugHurt('p', 10);
    expect(world.step(new Map()).some((e) => e.kind === 'hurt')).toBe(false);
    world.debugHurt('p', 30);
    expect(world.step(new Map()).some((e) => e.kind === 'hurt')).toBe(true);
    world.dispose();
  });

  test('Koke Zero runs KOKE_SECONDS, counts down, refreshes and ends', () => {
    const world = fresh(['kokeZero', 'kokeZero', null]);
    const events = use(world);
    expect(events.find((e) => e.kind === 'eat')).toMatchObject({ item: 'kokeZero' });
    expect(me(world).koke).toBeGreaterThan(KOKE_SECONDS - 0.15);
    run(world, 5 * TICK_RATE);
    expect(me(world).koke).toBeLessThan(KOKE_SECONDS - 4.9);
    use(world, 1);
    expect(me(world).koke).toBeGreaterThan(KOKE_SECONDS - 0.15);
    run(world, KOKE_SECONDS * TICK_RATE + 5);
    expect('koke' in me(world)).toBe(false);
    world.dispose();
  });

  test('being downed and respawned ends every power-up', () => {
    const world = fresh(['fromageBlanc', 'kokeZero', 'treedent']);
    use(world);
    use(world, 1);
    use(world, 2);
    expect(me(world)).toMatchObject({ shield: SHIELD_HP });
    expect(me(world).koke).toBeDefined();
    expect(me(world).treedent).toBeDefined();
    world.debugHurt('p', 100 + SHIELD_HP);
    run(world, 2);
    expect(world.snapshot().respawns).toBe(1);
    expect(me(world).shield).toBeUndefined();
    expect(me(world).koke).toBeUndefined();
    expect(me(world).treedent).toBeUndefined();
    world.dispose();
  });

  test('the new items have hit boxes and the drop mix sums to 1 with the jerrycan first', () => {
    for (const kind of ['treedent', 'fromageBlanc', 'kokeZero', 'ammo', 'gun'] as const) expect(ITEM_KINDS[kind].mass).toBeGreaterThan(0);
    const total = Object.values(ITEM_DROP_MIX).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 12);
    expect(ITEM_DROP_MIX).toEqual({ jerrycan: 0.18, toolbox: 0.22, healthKit: 0.15, tajine: 0.12, treedent: 0.08, fromageBlanc: 0.08, kokeZero: 0.07, ammo: 0.1, gun: 0 });
  });
});
