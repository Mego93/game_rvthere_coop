import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { PLAYER_MAX_HEALTH } from './constants';
import { coinTouched } from './coins';
import { vec3, type Vec3 } from './math';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { finalTime } from './rules';
import { createWorld, type World, type WorldEvent } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const worlds: World[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

const input = (fields: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });
const make = (...ids: string[]): World => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  worlds.push(world);
  for (const id of ids) world.addPlayer(id);
  return world;
};
const run = (world: World, ticks: number, inputs: Map<string, PlayerInput> = new Map()): WorldEvent[] => {
  const events: WorldEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...world.step(inputs));
  return events;
};
const coin = (world: World, id: string): Vec3 => world.course.coins.find((candidate) => candidate.id === id)!.pose.pos;
const feetAt = (pos: Vec3): Vec3 => vec3(pos.x, 0.02, pos.z);
const kinds = (events: WorldEvent[], kind: string) => events.filter((event) => event.kind === kind);
// Touches the coin with a teleported player, then steps once and returns that step's events.
const touch = (world: World, id: string, coinId: string): WorldEvent[] => {
  world.teleportPlayer(id, feetAt(coin(world, coinId)));
  return world.step(new Map());
};
const player = (world: World, id: string) => world.snapshot().players.find((p) => p.playerId === id)!;
const CP1 = vec3(0, 0.95, -50);

describe('S5: coins', () => {
  test('the course starts with every coin, an empty wallet and the total', () => {
    const world = make('p1');
    const snap = world.snapshot();
    expect(snap.coinsLeft).toEqual(['coin-1', 'coin-2', 'coin-3', 'coin-4']);
    expect([snap.wallet, snap.coinsCollected, snap.coinsTotal]).toEqual([0, 0, 4]);
  });

  test('walking through coin-1 collects it once, with a coin event stamped with that step\'s tick', () => {
    const world = make('p1');
    world.teleportPlayer('p1', vec3(3, 0.02, -9));
    run(world, 10);
    expect(world.snapshot().wallet).toBe(0);
    const events: WorldEvent[] = [];
    for (let i = 0; i < 90; i++) {
      const step = world.step(new Map([['p1', input({ moveY: 1 })]]));
      events.push(...step);
      if (kinds(step, 'coin').length > 0) {
        expect(kinds(step, 'coin')[0]!.tick).toBe(world.snapshot().tick);
        break;
      }
    }
    expect(kinds(events, 'coin')).toHaveLength(1);
    expect(kinds(events, 'coin')[0]).toMatchObject({ playerId: 'p1', pos: coin(world, 'coin-1') });
    run(world, 120, new Map([['p1', input({ moveY: -1 })]]));
    const snap = world.snapshot();
    expect([snap.wallet, snap.coinsCollected]).toEqual([1, 1]);
    expect(snap.coinsLeft).toEqual(['coin-2', 'coin-3', 'coin-4']);
  });

  test('a coin touched again is not collected twice', () => {
    const world = make('p1');
    touch(world, 'p1', 'coin-1');
    expect(touch(world, 'p1', 'coin-1')).toEqual([]);
    expect(world.snapshot().wallet).toBe(1);
  });

  test('a seated player passing through a coin collects nothing', () => {
    const world = make('p1', 'p2');
    world.step(new Map([['p1', input({ interact: true })]]));
    world.step(new Map());
    expect(player(world, 'p1').seat).not.toBeNull();
    world.teleportPlayer('p2', vec3(40, 0.02, 40));
    // Put the vehicle so the seated player's feet are on the coin.
    const at = coin(world, 'coin-1');
    const body = world.debugBody('vehicle')!;
    body.setTranslation({ x: at.x, y: 0.95, z: at.z }, true);
    const events = run(world, 3);
    expect(coinTouched(player(world, 'p1').pos, at)).toBe(true);
    expect(kinds(events, 'coin')).toHaveLength(0);
    expect(world.snapshot().wallet).toBe(0);
  });

  test('a downed player collects nothing', () => {
    const world = make('p1', 'p2');
    world.teleportPlayer('p2', vec3(40, 0.02, 40));
    world.debugHurt('p1', 100);
    run(world, 2);
    expect(player(world, 'p1').downed).not.toBeNull();
    const events = touch(world, 'p1', 'coin-2');
    expect(kinds(events, 'coin')).toHaveLength(0);
    expect(world.snapshot().wallet).toBe(0);
  });

  test('two players on one coin on the same tick: the first in join order gets it', () => {
    const world = make('p1', 'p2');
    world.teleportPlayer('p1', feetAt(coin(world, 'coin-3')));
    world.teleportPlayer('p2', feetAt(coin(world, 'coin-3')));
    const events = world.step(new Map());
    expect(kinds(events, 'coin')).toHaveLength(1);
    expect(kinds(events, 'coin')[0]!.playerId).toBe('p1');
    expect(world.snapshot().wallet).toBe(1);
  });

  test('nothing is collected once the run is won', () => {
    const world = make('p1');
    world.debugBody('vehicle')!.setTranslation({ x: 0, y: 1, z: -100 }, true);
    world.step(new Map());
    expect(world.snapshot().won).toBe(true);
    const events = touch(world, 'p1', 'coin-4');
    expect(kinds(events, 'coin')).toHaveLength(0);
    expect(world.snapshot().wallet).toBe(0);
  });
});

describe('S7: restart', () => {
  test('coins taken after cp-1 return and the wallet goes back; earlier coins stay taken', () => {
    const world = make('p1');
    touch(world, 'p1', 'coin-1');
    world.debugBody('vehicle')!.setTranslation(CP1, true);
    world.step(new Map());
    expect(world.snapshot().checkpoint).toBe(1);
    touch(world, 'p1', 'coin-2');
    touch(world, 'p1', 'coin-3');
    expect(world.snapshot().wallet).toBe(3);
    world.restartCheckpoint();
    world.step(new Map());
    const snap = world.snapshot();
    expect(snap.restarts).toBe(1);
    expect([snap.wallet, snap.coinsCollected]).toEqual([1, 1]);
    expect(snap.coinsLeft).toEqual(['coin-2', 'coin-3', 'coin-4']);
  });

  test('a restart before cp-1 restores the full course', () => {
    const world = make('p1');
    touch(world, 'p1', 'coin-1');
    world.restartCheckpoint();
    world.step(new Map());
    const snap = world.snapshot();
    expect([snap.wallet, snap.coinsCollected, snap.coinsLeft.length]).toEqual([0, 0, 4]);
  });
});

describe('S12: status and final time', () => {
  test('status().finalTime matches the formula and stops changing after the win, even through a respawn', () => {
    const world = make('p1');
    touch(world, 'p1', 'coin-1');
    world.restartCheckpoint();
    run(world, 30);
    touch(world, 'p1', 'coin-2');
    const before = world.status();
    expect(before.finalTime).toBe(finalTime({ elapsed: before.elapsed, restarts: before.restarts, respawns: before.respawns, wallet: before.wallet }));
    expect([before.wallet, before.coinsCollected, before.coinsTotal, before.restarts]).toEqual([1, 1, 4, 1]);
    world.debugBody('vehicle')!.setTranslation({ x: 0, y: 1, z: -100 }, true);
    world.step(new Map());
    expect(world.status().state).toBe('won');
    const won = world.status();
    // A solo player who is downed respawns at once; that no longer counts.
    world.debugHurt('p1', PLAYER_MAX_HEALTH * 2);
    const events = run(world, 5);
    expect(kinds(events, 'respawn')).toHaveLength(1);
    const after = world.status();
    expect(after.respawns).toBe(won.respawns);
    expect(world.snapshot().respawns).toBe(won.respawns);
    expect(after.finalTime).toBe(won.finalTime);
    expect(after.elapsed).toBe(won.elapsed);
  });

  test('before the win a respawn adds its penalty', () => {
    const world = make('p1');
    const before = world.status().finalTime;
    world.debugHurt('p1', PLAYER_MAX_HEALTH * 2);
    world.step(new Map());
    expect(world.status().respawns).toBe(1);
    expect(world.status().finalTime).toBeGreaterThan(before + 29);
  });
});

describe('S13: determinism', () => {
  test('two worlds with the same coin pickups give equal snapshots', () => {
    const play = () => {
      const world = make('p1', 'p2');
      touch(world, 'p1', 'coin-1');
      world.teleportPlayer('p2', feetAt(coin(world, 'coin-3')));
      run(world, 5);
      world.debugBody('vehicle')!.setTranslation(CP1, true);
      run(world, 3);
      touch(world, 'p1', 'coin-2');
      world.restartCheckpoint();
      run(world, 5);
      return JSON.stringify(world.snapshot());
    };
    expect(play()).toBe(play());
  });
});
