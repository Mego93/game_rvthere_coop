import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { HOLD_DURATION, PLAYER_KILL_RESPAWN_DELAY, PLAYER_MAX_HEALTH, SHOP_COUNTER_HALF, SHOP_PRICES, SHOP_RANGE, STOP_OPERATE_RANGE, TICK_DT } from './constants';
import { distanceToBox } from './seats';
import { IDENTITY } from './math';
import { testGround } from './courses/testGround';
import { counterCentre, interactCandidates, splitCandidates, resolveInteract } from './interact';
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
    // Put the vehicle so the seat is on the coin.
    const at = coin(world, 'coin-1');
    const body = world.debugBody('vehicle')!;
    const seat = world.vehicleConfig.seats.find((s) => s.id === player(world, 'p1').seat)!;
    body.setTranslation({ x: at.x - seat.pos.x, y: 0.95, z: at.z - seat.pos.z }, true);
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
  test('two worlds with a coin pickup, an operate hold and a buy give equal snapshots', () => {
    const play = () => {
      const world = make('p1', 'p2');
      touch(world, 'p1', 'coin-1');
      park(world, 'stop-fuel', 2.4);
      world.debugVehicle().addFuel(-0.7);
      world.teleportPlayer('p2', feetAt(coin(world, 'coin-3')));
      standAt(world, 'p1', 'stop-fuel');
      const events = holdInteract(world, 'p1', 40);
      atCounter(world, 'p2');
      const bought = world.buy('p2', 'healthKit');
      expect(bought).toBe('ok');
      const snapshotMid = JSON.stringify(world.snapshot());
      holdInteract(world, 'p1', HOLD_TICKS);
      return JSON.stringify([snapshotMid, world.snapshot(), events, bought]);
    };
    expect(play()).toBe(play());
  });
});

const atCounter = (world: World, id: string, dx = 0, dz = -1) => {
  const at = stopOf(world, 'stop-fuel').shopCounter!;
  world.teleportPlayer(id, vec3(at.x + dx, 0.02, at.z + dz));
  run(world, 3);
};
const earn = (world: World, id: string, coins: number) => {
  for (const coinId of ['coin-1', 'coin-2', 'coin-3', 'coin-4'].slice(0, coins)) touch(world, id, coinId);
  expect(world.snapshot().wallet).toBe(coins);
};

describe('S11: shop', () => {
  test('with 3 coins at the counter buy is ok, takes the price, fills the first free slot, and the buy event comes first from the next step', () => {
    const world = make('p1');
    earn(world, 'p1', 3);
    atCounter(world, 'p1');
    world.debugSetInventory('p1', [null, 'toolbox', null]);
    const tickAtCall = world.snapshot().tick;
    expect(world.buy('p1', 'jerrycan')).toBe('ok');
    expect(world.snapshot().wallet).toBe(0);
    expect(player(world, 'p1').inventory).toEqual(['jerrycan', 'toolbox', null]);
    expect(world.snapshot().coinsCollected).toBe(3);
    const events = world.step(new Map());
    expect(events[0]).toEqual({ kind: 'buy', tick: world.snapshot().tick, playerId: 'p1', pos: stopOf(world, 'stop-fuel').shopCounter });
    expect(events[0]!.tick).toBe(tickAtCall + 1);
    expect(kinds(events, 'buy')).toHaveLength(1);
    expect(kinds(world.step(new Map()), 'buy')).toHaveLength(0);
  });

  test('a cheaper item leaves the change', () => {
    const world = make('p1');
    earn(world, 'p1', 3);
    atCounter(world, 'p1');
    expect(world.buy('p1', 'healthKit')).toBe('ok');
    expect(world.snapshot().wallet).toBe(3 - SHOP_PRICES.healthKit);
  });

  test('the counter is a box: standing beside it, within SHOP_RANGE of the box, works', () => {
    const world = make('p1');
    earn(world, 'p1', 3);
    atCounter(world, 'p1', SHOP_COUNTER_HALF.x + SHOP_RANGE - 0.2, 0);
    expect(world.buy('p1', 'jerrycan')).toBe('ok');
  });

  // Each refusal returns cannot_buy and leaves the wallet, the inventory and the next step's events alone.
  const refused = (world: World, id: string, item: 'jerrycan' | 'toolbox' | 'healthKit' = 'jerrycan') => {
    const before = JSON.stringify([world.snapshot().wallet, player(world, id).inventory]);
    expect(world.buy(id, item)).toBe('cannot_buy');
    expect(JSON.stringify([world.snapshot().wallet, player(world, id).inventory])).toBe(before);
    expect(kinds(world.step(new Map()), 'buy')).toHaveLength(0);
  };

  test('too few coins', () => {
    const world = make('p1');
    earn(world, 'p1', 2);
    atCounter(world, 'p1');
    refused(world, 'p1');
    expect(world.buy('p1', 'healthKit')).toBe('ok');
  });

  test('a full inventory', () => {
    const world = make('p1');
    earn(world, 'p1', 3);
    atCounter(world, 'p1');
    world.debugSetInventory('p1', ['toolbox', 'toolbox', 'healthKit']);
    refused(world, 'p1');
  });

  test('out of range', () => {
    const world = make('p1');
    earn(world, 'p1', 3);
    atCounter(world, 'p1', 0, SHOP_COUNTER_HALF.z + SHOP_RANGE + 0.3);
    refused(world, 'p1');
  });

  test('an unknown player', () => {
    const world = make('p1');
    earn(world, 'p1', 3);
    expect(world.buy('nobody', 'jerrycan')).toBe('cannot_buy');
    expect(world.snapshot().wallet).toBe(3);
  });

  test('seated', () => {
    const world = make('p1', 'p2');
    world.teleportPlayer('p2', vec3(40, 0.02, 40));
    world.step(new Map([['p1', input({ interact: true })]]));
    world.step(new Map());
    expect(player(world, 'p1').seat).not.toBeNull();
    // The wallet is shared, so the unseated p2 fills it.
    for (const coinId of ['coin-1', 'coin-2', 'coin-3']) touch(world, 'p2', coinId);
    expect(world.snapshot().wallet).toBe(3);
    const at = stopOf(world, 'stop-fuel').shopCounter!;
    world.teleportPlayer('p2', vec3(40, 0.02, 40));
    world.debugBody('vehicle')!.setTranslation({ x: at.x, y: 0.95, z: at.z }, true);
    run(world, 3);
    expect(distanceToBox(player(world, 'p1').pos, SHOP_COUNTER_HALF, counterCentre(at), IDENTITY)).toBeLessThanOrEqual(SHOP_RANGE);
    expect(player(world, 'p1').seat).not.toBeNull();
    refused(world, 'p1');
  });

  test('downed', () => {
    const world = make('p1', 'p2');
    world.teleportPlayer('p2', vec3(40, 0.02, 40));
    earn(world, 'p1', 3);
    atCounter(world, 'p1');
    world.debugHurt('p1', 100);
    run(world, 2);
    expect(player(world, 'p1').downed).not.toBeNull();
    refused(world, 'p1');
  });

  test('won', () => {
    const world = make('p1');
    earn(world, 'p1', 3);
    world.debugBody('vehicle')!.setTranslation({ x: 0, y: 1, z: -100 }, true);
    world.step(new Map());
    expect(world.snapshot().won).toBe(true);
    atCounter(world, 'p1');
    refused(world, 'p1');
  });

  test('a player waiting to respawn below the kill plane is refused', () => {
    // The plane is raised just over the ground so the player is in range and waiting to respawn at once.
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, { ...testGround, killPlaneY: 0.5 });
    worlds.push(world);
    world.addPlayer('p1');
    const at = stopOf(world, 'stop-fuel').shopCounter!;
    world.teleportPlayer('p1', vec3(at.x, 0.02, at.z - 1));
    world.step(new Map());
    for (const coinId of ['coin-1', 'coin-2', 'coin-3']) touch(world, 'p1', coinId);
    world.teleportPlayer('p1', vec3(at.x, 0.02, at.z - 1));
    world.step(new Map());
    expect(world.snapshot().wallet).toBe(3);
    expect(distanceToBox(player(world, 'p1').pos, SHOP_COUNTER_HALF, counterCentre(at), IDENTITY)).toBeLessThanOrEqual(SHOP_RANGE);
    expect(player(world, 'p1').downed).toBeNull();
    refused(world, 'p1');
  });

  test('a garage has no counter', () => {
    const world = make('p1');
    earn(world, 'p1', 3);
    const at = stopOf(world, 'stop-garage').operatePoint;
    world.teleportPlayer('p1', vec3(at.x, 0.02, at.z - 2));
    run(world, 3);
    refused(world, 'p1');
  });
});

describe('M13: aiming at the drawn post', () => {
  const candidatesAt = (world: World, feet: Vec3, yaw: number) => {
    const snap = world.snapshot();
    return interactCandidates({
      config: world.vehicleConfig,
      vehiclePos: snap.vehicle.pos,
      vehicleRot: snap.vehicle.rot,
      feet,
      yaw,
      pitch: 0,
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
  };
  const resolved = (found: ReturnType<typeof candidatesAt>) => resolveInteract({ seat: null, hands: null, holdsHook: false, ...splitCandidates(found) });
  // Level yaw from `from` toward `to` (yaw 0 faces -z).
  const yawToward = (from: Vec3, to: Vec3) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

  test('a player 0.6 m from the operate point aiming level at the post gets operate; aiming level at the counter gets shop', () => {
    const world = make('p1');
    park(world, 'stop-fuel');
    world.debugVehicle().addFuel(-0.7);
    const stop = stopOf(world, 'stop-fuel');
    // Toward the counter (-z), so both are in range; aiming level at the post gives operate the smaller angle.
    const feet = vec3(stop.operatePoint.x + 0.55, 0.02, stop.operatePoint.z - 0.4);
    world.teleportPlayer('p1', feet);
    run(world, 3);
    const atPost = candidatesAt(world, feet, yawToward(feet, stop.operatePoint));
    expect(resolved(atPost)).toEqual({ kind: 'operate', stopId: stop.id });
    const angle = (list: typeof atPost, kind: string) => list.find((c) => c.action.kind === kind)!.angle;
    expect(angle(atPost, 'operate')).toBeLessThan(angle(atPost, 'shop'));
    // Beside the pump, away from the counter's line, aiming level at the counter gives shop.
    const side = vec3(stop.operatePoint.x - 1, 0.02, stop.operatePoint.z - 0.6);
    const atCounterAim = candidatesAt(world, side, yawToward(side, stop.shopCounter!));
    expect(resolved(atCounterAim)).toEqual({ kind: 'shop', stopId: stop.id });
    expect(angle(atCounterAim, 'shop')).toBeLessThan(angle(atCounterAim, 'operate'));
  });

  test('in the world the same player aiming level at the post starts the hold; aiming level at the counter does nothing', () => {
    const world = make('p1');
    park(world, 'stop-fuel');
    world.debugVehicle().addFuel(-0.7);
    const stop = stopOf(world, 'stop-fuel');
    // Toward the counter (-z), so both are in range; aiming level at the post gives operate the smaller angle.
    const feet = vec3(stop.operatePoint.x + 0.55, 0.02, stop.operatePoint.z - 0.4);
    world.teleportPlayer('p1', feet);
    run(world, 3);
    holdInteract(world, 'p1', 1, { pitch: 0, yaw: yawToward(feet, stop.operatePoint) });
    expect(player(world, 'p1').hold).toMatchObject({ action: 'operate', targetId: stop.id });
    run(world, 1);
    expect(player(world, 'p1').hold).toBeNull();
    const side = vec3(stop.operatePoint.x - 1, 0.02, stop.operatePoint.z - 0.6);
    world.teleportPlayer('p1', side);
    run(world, 3);
    holdInteract(world, 'p1', 1, { pitch: 0, yaw: yawToward(side, stop.shopCounter!) });
    expect(player(world, 'p1').hold).toBeNull();
    expect(player(world, 'p1').seat).toBeNull();
  });

  test('at the zone\'s outer edge board is nearer than operate when aiming level at the post, and operate still wins', () => {
    const world = make('p1');
    park(world, 'stop-fuel', 2.4);
    world.debugVehicle().addFuel(-0.7);
    const stop = stopOf(world, 'stop-fuel');
    const feet = vec3(stop.operatePoint.x + 1, 0.02, stop.operatePoint.z - 0.2);
    world.teleportPlayer('p1', feet);
    run(world, 3);
    const found = candidatesAt(world, feet, yawToward(feet, stop.operatePoint));
    const angle = (kind: string) => found.find((c) => c.action.kind === kind)!.angle;
    expect(angle('board')).toBeLessThan(angle('operate'));
    expect(angle('operate')).toBeLessThan(angle('shop'));
    expect(resolved(found)).toEqual({ kind: 'operate', stopId: stop.id });
    // Smallest angle overall would have boarded.
    const overall = found.reduce((best, c) => (c.angle < best.angle ? c : best));
    expect(overall.action.kind).toBe('board');
    holdInteract(world, 'p1', 1, { pitch: 0, yaw: yawToward(feet, stop.operatePoint) });
    expect(player(world, 'p1').seat).toBeNull();
    expect(player(world, 'p1').hold).toMatchObject({ action: 'operate', targetId: stop.id });
  });
});

describe('S10: more operate cases', () => {
  test('an operate press and a use press on the same tick: operate wins and no item hold starts', () => {
    const world = make('p1');
    park(world, 'stop-fuel');
    world.debugVehicle().addFuel(-0.7);
    world.debugSetInventory('p1', ['jerrycan', null, null]);
    standAt(world, 'p1', 'stop-fuel');
    holdInteract(world, 'p1', 1, { use: true });
    expect(player(world, 'p1').hold).toMatchObject({ action: 'operate', targetId: 'stop-fuel' });
    holdInteract(world, 'p1', HOLD_TICKS - 1, { use: true });
    expect(world.snapshot().vehicle.fuel).toBe(1);
    expect(player(world, 'p1').inventory[0]).toBe('jerrycan');
  });

  test('two players on one pump: the first completes, the second\'s hold ends with no event and no extra refill', () => {
    const world = make('p1', 'p2');
    park(world, 'stop-fuel');
    world.debugVehicle().addFuel(-0.7);
    const at = stopOf(world, 'stop-fuel').operatePoint;
    world.teleportPlayer('p1', vec3(at.x, 0.02, at.z));
    world.teleportPlayer('p2', vec3(at.x, 0.02, at.z + 0.5));
    run(world, 3);
    const both = (ticks: number, p2Interact = true): WorldEvent[] => {
      const events: WorldEvent[] = [];
      for (let i = 0; i < ticks; i++) {
        events.push(...world.step(new Map([
          ['p1', input({ interact: true, pitch: AIM_AT_PUMP })],
          ['p2', input({ interact: p2Interact, pitch: AIM_AT_PUMP })],
        ])));
      }
      return events;
    };
    // p1 presses first and p2 five ticks later, so both holds run when p1 completes.
    holdInteract(world, 'p1', 5);
    const early = both(HOLD_TICKS - 6);
    expect(player(world, 'p1').hold).toMatchObject({ action: 'operate' });
    expect(player(world, 'p2').hold).toMatchObject({ action: 'operate' });
    expect(kinds(early, 'use')).toHaveLength(0);
    expect(world.snapshot().vehicle.fuel).toBeCloseTo(0.3, 6);
    const events = both(1);
    expect(world.snapshot().vehicle.fuel).toBe(1);
    expect(kinds(events, 'use')).toEqual([{ kind: 'use', tick: world.snapshot().tick, playerId: 'p1', pos: at }]);
    expect(player(world, 'p1').hold).toBeNull();
    expect(player(world, 'p2').hold).toBeNull();
    // The tank is full, so p2 gets no new hold and no event while holding on.
    expect(kinds(both(HOLD_TICKS), 'use')).toHaveLength(0);
    expect(player(world, 'p2').hold).toBeNull();
  });
});

describe('a purchase rolled back by a restart', () => {
  test('a buy queued before a restart in the same step emits no event and leaves the checkpoint wallet', () => {
    const world = make('p1');
    earn(world, 'p1', 3);
    atCounter(world, 'p1');
    expect(world.buy('p1', 'jerrycan')).toBe('ok');
    world.restartCheckpoint();
    const events = world.step(new Map());
    expect(kinds(events, 'vehicleLost')).toHaveLength(1);
    expect(kinds(events, 'buy')).toHaveLength(0);
    expect(world.snapshot().wallet).toBe(0);
    expect(kinds(world.step(new Map()), 'buy')).toHaveLength(0);
  });
});
