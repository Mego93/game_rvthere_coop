import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { HOLD_DURATION, PLAYER_KILL_RESPAWN_DELAY, PLAYER_MAX_HEALTH, STOP_OPERATE_RANGE, TICK_DT } from './constants';
import { IDENTITY } from './math';
import { testGround } from './courses/testGround';
import { interactCandidates, splitCandidates, resolveInteract } from './interact';
import { stopUsable } from './stops';
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

describe('S12: the freeze after the win', () => {
  test('a player who falls below the kill plane and respawns after the win changes neither respawns nor the final time', () => {
    const world = make('p1');
    world.debugBody('vehicle')!.setTranslation({ x: 0, y: 1, z: -100 }, true);
    world.step(new Map());
    expect(world.snapshot().won).toBe(true);
    const won = world.status();
    world.teleportPlayer('p1', vec3(40, testGround.killPlaneY - 5, 40));
    const events = run(world, Math.ceil(PLAYER_KILL_RESPAWN_DELAY / TICK_DT) + 5);
    expect(kinds(events, 'respawn')).toHaveLength(1);
    expect(world.snapshot().respawns).toBe(won.respawns);
    expect(world.status().respawns).toBe(won.respawns);
    expect(world.status().finalTime).toBe(won.finalTime);
  });

  test('before the win the same fall adds a respawn', () => {
    const world = make('p1');
    world.teleportPlayer('p1', vec3(40, testGround.killPlaneY - 5, 40));
    const events = run(world, Math.ceil(PLAYER_KILL_RESPAWN_DELAY / TICK_DT) + 5);
    expect(kinds(events, 'respawn')).toHaveLength(1);
    expect(world.snapshot().respawns).toBe(1);
  });
});

describe('S5: a player waiting to respawn below the kill plane', () => {
  test('collects no coin while falling through one', () => {
    const deep = { id: 'coin-deep', kind: 'coin', pose: { pos: vec3(40, testGround.killPlaneY - 2, 40), rot: IDENTITY } };
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, { ...testGround, coins: [deep] });
    worlds.push(world);
    world.addPlayer('p1');
    world.teleportPlayer('p1', vec3(40, testGround.killPlaneY - 0.001, 40));
    let passed = false;
    const events: WorldEvent[] = [];
    for (let i = 0; i < 120; i++) {
      events.push(...world.step(new Map()));
      passed ||= coinTouched(player(world, 'p1').pos, deep.pose.pos);
    }
    // The player did fall through the coin's reach before the respawn delay ran out.
    expect(passed).toBe(true);
    expect(kinds(events, 'respawn')).toHaveLength(0);
    expect(kinds(events, 'coin')).toHaveLength(0);
    expect(world.snapshot().wallet).toBe(0);
    expect(world.snapshot().coinsLeft).toEqual(['coin-deep']);
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

const HOLD_TICKS = Math.round(HOLD_DURATION / TICK_DT);
const stopOf = (world: World, id: string) => world.course.stops.find((stop) => stop.id === id)!;
// Parks the vehicle at rest with its centre `dx` from the zone's centre.
const park = (world: World, stopId: string, dx = 0, dz = 0) => {
  const zone = stopOf(world, stopId).zone.center;
  const body = world.debugBody('vehicle')!;
  body.setTranslation({ x: zone.x + dx, y: world.vehicleConfig.rideHeight, z: zone.z + dz }, true);
  body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
};
const standAt = (world: World, id: string, stopId: string) => {
  const at = stopOf(world, stopId).operatePoint;
  world.teleportPlayer(id, vec3(at.x, 0.02, at.z));
  run(world, 3);
};
// Straight down: the operate point is at the player's feet, and the counter 2 m on would win by angle when aiming ahead.
const AIM_AT_PUMP = -Math.PI / 2;
const holdInteract = (world: World, id: string, ticks: number, fields: Partial<PlayerInput> = {}): WorldEvent[] => {
  const events: WorldEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...world.step(new Map([[id, input({ interact: true, pitch: AIM_AT_PUMP, ...fields })]])));
  return events;
};

describe('S8: fuel stop', () => {
  test('holding interact at the operate point for 3 s with the vehicle in the zone fills the tank and sends a use event', () => {
    const world = make('p1');
    park(world, 'stop-fuel');
    world.debugVehicle().addFuel(-0.7);
    standAt(world, 'p1', 'stop-fuel');
    expect(world.snapshot().vehicle.fuel).toBeCloseTo(0.3, 6);
    const events = holdInteract(world, 'p1', HOLD_TICKS - 1);
    expect(player(world, 'p1').hold).toMatchObject({ action: 'operate', targetId: 'stop-fuel' });
    expect(world.snapshot().vehicle.fuel).toBeCloseTo(0.3, 6);
    const last = holdInteract(world, 'p1', 1);
    expect(kinds(events, 'use')).toHaveLength(0);
    expect(kinds(last, 'use')).toEqual([{ kind: 'use', tick: world.snapshot().tick, playerId: 'p1', pos: stopOf(world, 'stop-fuel').operatePoint }]);
    expect(world.snapshot().vehicle.fuel).toBe(1);
    expect(player(world, 'p1').hold).toBeNull();
  });

  test('a completed hold needs a fresh press', () => {
    const world = make('p1');
    park(world, 'stop-fuel');
    world.debugVehicle().addFuel(-0.7);
    standAt(world, 'p1', 'stop-fuel');
    holdInteract(world, 'p1', HOLD_TICKS);
    expect(world.snapshot().vehicle.fuel).toBe(1);
    world.debugVehicle().addFuel(-0.5);
    holdInteract(world, 'p1', 10);
    expect(player(world, 'p1').hold).toBeNull();
    run(world, 1);
    holdInteract(world, 'p1', 1);
    expect(player(world, 'p1').hold).toMatchObject({ action: 'operate' });
  });

  test('releasing interact resets the progress', () => {
    const world = make('p1');
    park(world, 'stop-fuel');
    world.debugVehicle().addFuel(-0.7);
    standAt(world, 'p1', 'stop-fuel');
    holdInteract(world, 'p1', HOLD_TICKS - 5);
    run(world, 1);
    expect(player(world, 'p1').hold).toBeNull();
    holdInteract(world, 'p1', 10);
    expect(world.snapshot().vehicle.fuel).toBeCloseTo(0.3, 6);
  });

  test.each([
    ['at the zone centre', 0],
    ['near the zone\'s outer edge', 2.4],
  ])('the player at the operate point gets operate, not board, with the vehicle %s', (_name, dx) => {
    const world = make('p1');
    park(world, 'stop-fuel', dx);
    world.debugVehicle().addFuel(-0.7);
    standAt(world, 'p1', 'stop-fuel');
    const snap = world.snapshot();
    const stop = stopOf(world, 'stop-fuel');
    expect(stopUsable(stop, snap.vehicle.pos, snap.vehicle.fuel, snap.vehicle.health)).toBe(true);
    holdInteract(world, 'p1', 1);
    expect(player(world, 'p1').seat).toBeNull();
    expect(player(world, 'p1').hold).toMatchObject({ action: 'operate', targetId: 'stop-fuel' });
    holdInteract(world, 'p1', HOLD_TICKS - 1);
    expect(world.snapshot().vehicle.fuel).toBe(1);
  });

  test('at the outer edge the board candidate exists, so the operate tier is what wins', () => {
    const world = make('p1');
    park(world, 'stop-fuel', 2.4);
    world.debugVehicle().addFuel(-0.7);
    standAt(world, 'p1', 'stop-fuel');
    const snap = world.snapshot();
    const me = player(world, 'p1');
    const stop = stopOf(world, 'stop-fuel');
    const found = interactCandidates({
      config: world.vehicleConfig,
      vehiclePos: snap.vehicle.pos,
      vehicleRot: snap.vehicle.rot,
      feet: me.pos,
      yaw: me.yaw,
      pitch: AIM_AT_PUMP,
      seat: null,
      hands: null,
      takenSeats: new Set(),
      props: [],
      items: [],
      freeSlot: true,
      heldProps: new Set(),
      cable: snap.cable,
      anchors: [],
      stops: world.course.stops.map((s) => ({ ...s, usable: true })),
    });
    expect(found.map((c) => c.action.kind)).toEqual(expect.arrayContaining(['board', 'operate']));
    expect(resolveInteract({ seat: null, hands: null, holdsHook: false, ...splitCandidates(found) })).toEqual({ kind: 'operate', stopId: stop.id });
  });

  test('with the vehicle outside the zone nothing happens', () => {
    const world = make('p1');
    park(world, 'stop-fuel', 0, 6);
    world.debugVehicle().addFuel(-0.7);
    standAt(world, 'p1', 'stop-fuel');
    const events = holdInteract(world, 'p1', HOLD_TICKS + 5);
    expect(player(world, 'p1').hold).toBeNull();
    expect(kinds(events, 'use')).toHaveLength(0);
    expect(world.snapshot().vehicle.fuel).toBeCloseTo(0.3, 6);
  });

  test('the vehicle leaving the zone mid-hold ends it', () => {
    const world = make('p1');
    park(world, 'stop-fuel');
    world.debugVehicle().addFuel(-0.7);
    standAt(world, 'p1', 'stop-fuel');
    holdInteract(world, 'p1', 30);
    expect(player(world, 'p1').hold).not.toBeNull();
    park(world, 'stop-fuel', 0, 6);
    holdInteract(world, 'p1', 1);
    expect(player(world, 'p1').hold).toBeNull();
  });

  test('at fuel 1 there is no operate candidate and no hold', () => {
    const world = make('p1');
    park(world, 'stop-fuel');
    standAt(world, 'p1', 'stop-fuel');
    holdInteract(world, 'p1', 5);
    expect(player(world, 'p1').hold).toBeNull();
  });

  test('out of STOP_OPERATE_RANGE there is no hold', () => {
    const world = make('p1');
    park(world, 'stop-fuel');
    world.debugVehicle().addFuel(-0.7);
    const at = stopOf(world, 'stop-fuel').operatePoint;
    world.teleportPlayer('p1', vec3(at.x + STOP_OPERATE_RANGE + 0.5, 0.02, at.z));
    run(world, 3);
    holdInteract(world, 'p1', 5);
    expect(player(world, 'p1').hold).toBeNull();
  });

  test('being downed ends the hold', () => {
    const world = make('p1', 'p2');
    world.teleportPlayer('p2', vec3(40, 0.02, 40));
    park(world, 'stop-fuel');
    world.debugVehicle().addFuel(-0.7);
    standAt(world, 'p1', 'stop-fuel');
    holdInteract(world, 'p1', 20);
    expect(player(world, 'p1').hold).not.toBeNull();
    world.debugHurt('p1', 100);
    holdInteract(world, 'p1', 1);
    expect(player(world, 'p1').hold).toBeNull();
  });
});

describe('S9: garage', () => {
  test('holding interact at the garage for 3 s repairs the vehicle to full health', () => {
    const world = make('p1');
    park(world, 'stop-garage');
    world.debugVehicle().repair(-0.6);
    standAt(world, 'p1', 'stop-garage');
    expect(world.snapshot().vehicle.health).toBeCloseTo(0.4, 6);
    holdInteract(world, 'p1', HOLD_TICKS - 1);
    expect(player(world, 'p1').hold).toMatchObject({ action: 'operate', targetId: 'stop-garage' });
    const last = holdInteract(world, 'p1', 1);
    expect(kinds(last, 'use')).toEqual([{ kind: 'use', tick: world.snapshot().tick, playerId: 'p1', pos: stopOf(world, 'stop-garage').operatePoint }]);
    expect(world.snapshot().vehicle.health).toBe(1);
  });

  test.each([
    ['at the zone centre', 0],
    ['near the zone\'s outer edge', -2.4],
  ])('the player at the operate point gets operate, not board, with the vehicle %s', (_name, dx) => {
    const world = make('p1');
    park(world, 'stop-garage', dx);
    world.debugVehicle().repair(-0.6);
    standAt(world, 'p1', 'stop-garage');
    holdInteract(world, 'p1', 1);
    expect(player(world, 'p1').seat).toBeNull();
    expect(player(world, 'p1').hold).toMatchObject({ action: 'operate', targetId: 'stop-garage' });
  });

  test('a full-health vehicle gives no hold, and fuel does not matter to a garage', () => {
    const world = make('p1');
    park(world, 'stop-garage');
    world.debugVehicle().addFuel(-0.7);
    standAt(world, 'p1', 'stop-garage');
    holdInteract(world, 'p1', 5);
    expect(player(world, 'p1').hold).toBeNull();
  });

  test('with the vehicle outside the zone nothing happens', () => {
    const world = make('p1');
    park(world, 'stop-garage', 0, 6);
    world.debugVehicle().repair(-0.6);
    standAt(world, 'p1', 'stop-garage');
    holdInteract(world, 'p1', HOLD_TICKS + 5);
    expect(world.snapshot().vehicle.health).toBeCloseTo(0.4, 6);
  });
});

describe('S10: operate and item holds', () => {
  test('an interact press resolving to operate while an item hold runs starts no operate hold', () => {
    const world = make('p1');
    park(world, 'stop-fuel', 2.4);
    world.debugVehicle().addFuel(-0.7);
    world.debugSetInventory('p1', ['jerrycan', null, null]);
    standAt(world, 'p1', 'stop-fuel');
    for (let i = 0; i < 10; i++) world.step(new Map([['p1', input({ use: true })]]));
    expect(player(world, 'p1').hold).toMatchObject({ action: 'useItem' });
    for (let i = 0; i < 5; i++) world.step(new Map([['p1', input({ use: true, interact: true, pitch: AIM_AT_PUMP })]]));
    expect(player(world, 'p1').hold).toMatchObject({ action: 'useItem' });
    expect(player(world, 'p1').seat).toBeNull();
  });

  test('a use press while an operate hold runs starts no item hold', () => {
    const world = make('p1');
    park(world, 'stop-fuel', 2.4);
    world.debugVehicle().addFuel(-0.7);
    world.debugSetInventory('p1', ['jerrycan', null, null]);
    standAt(world, 'p1', 'stop-fuel');
    holdInteract(world, 'p1', 10);
    expect(player(world, 'p1').hold).toMatchObject({ action: 'operate' });
    holdInteract(world, 'p1', 5, { use: true });
    expect(player(world, 'p1').hold).toMatchObject({ action: 'operate' });
    expect(player(world, 'p1').inventory[0]).toBe('jerrycan');
    holdInteract(world, 'p1', HOLD_TICKS, { use: true });
    expect(world.snapshot().vehicle.fuel).toBe(1);
    expect(player(world, 'p1').inventory[0]).toBe('jerrycan');
  });
});

describe('S13: determinism with an operate hold', () => {
  test('two worlds with a coin pickup and an operate hold give equal snapshots', () => {
    const play = () => {
      const world = make('p1', 'p2');
      touch(world, 'p1', 'coin-1');
      park(world, 'stop-fuel', 2.4);
      world.debugVehicle().addFuel(-0.7);
      world.teleportPlayer('p2', feetAt(coin(world, 'coin-3')));
      standAt(world, 'p1', 'stop-fuel');
      const events = holdInteract(world, 'p1', 40);
      const snapshotMid = JSON.stringify(world.snapshot());
      holdInteract(world, 'p1', HOLD_TICKS);
      return JSON.stringify([snapshotMid, world.snapshot(), events]);
    };
    expect(play()).toBe(play());
  });
});
