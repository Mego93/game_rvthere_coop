import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { HOLD_DURATION, PLAYER_EYE_HEIGHT, TICK_RATE } from './constants';
import { add, length, rotate, sub, vec3 } from './math';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
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
const me = (world: World, id: string) => world.snapshot().players.find((player) => player.playerId === id)!;
const run = (world: World, ticks: number, inputs: Map<string, PlayerInput> = new Map()): WorldEvent[] => {
  const events: WorldEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...world.step(inputs));
  return events;
};
const one = (world: World, id: string, fields: Partial<PlayerInput>): WorldEvent[] => {
  const events = run(world, 1, new Map([[id, input(fields)]]));
  return [...events, ...run(world, 1, new Map([[id, input({ yaw: fields.yaw, pitch: fields.pitch })]]))];
};
const of = (events: WorldEvent[], kind: string) => events.filter((event) => event.kind === kind);

describe('impact (R2)', () => {
  test('a 6 m drop gives exactly one impact, on the tick the health first drops, stamped with that tick', () => {
    const world = make();
    run(world, 60);
    const body = world.debugBody('vehicle')!;
    const at = body.translation();
    body.setTranslation(vec3(at.x, at.y + 6, at.z), true);
    body.setLinvel(vec3(0, 0, 0), true);
    const impacts: WorldEvent[] = [];
    let dropTick = -1;
    let health = world.snapshot().vehicle.health;
    for (let i = 0; i < 300; i++) {
      const events = world.step(new Map());
      impacts.push(...of(events, 'impact'));
      const now = world.snapshot();
      if (dropTick < 0 && now.vehicle.health < health) dropTick = now.tick;
      health = Math.min(health, now.vehicle.health);
      for (const event of events) expect(event.tick).toBe(now.tick);
    }
    expect(dropTick).toBeGreaterThan(0);
    expect(impacts).toHaveLength(1);
    expect(impacts[0]!.tick).toBe(dropTick);
    expect(impacts[0]!.playerId).toBeUndefined();
    expect(length(sub(impacts[0]!.pos!, world.snapshot().vehicle.pos))).toBeLessThan(3);
  });

  test('a vehicle at rest for 10 s gives no impact', () => {
    const world = make();
    expect(of(run(world, 10 * TICK_RATE), 'impact')).toHaveLength(0);
  });
});

describe('use (R2)', () => {
  const HOLD_TICKS = Math.round(HOLD_DURATION * TICK_RATE) + 5;
  // Steps until the use event arrives and records the snapshot tick of that very step, then runs on to the end of the hold.
  const runUntilUse = (world: World, inputs: Map<string, PlayerInput>) => {
    const events: WorldEvent[] = [];
    let tickOfUse = -1;
    for (let i = 0; i < HOLD_TICKS; i++) {
      const stepped = world.step(inputs);
      if (tickOfUse < 0 && of(stepped, 'use').length > 0) tickOfUse = world.snapshot().tick;
      events.push(...stepped);
    }
    return { events, tickOfUse };
  };

  test('a jerrycan used on the vehicle gives one use', () => {
    const world = make('p1');
    run(world, 30);
    world.debugVehicle().addFuel(-0.7);
    world.debugSetInventory('p1', ['jerrycan', null, null]);
    const { events, tickOfUse } = runUntilUse(world, new Map([['p1', input({ use: true })]]));
    expect(me(world, 'p1').inventory[0]).toBeNull();
    const uses = of(events, 'use');
    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatchObject({ playerId: 'p1', tick: tickOfUse });
    expect(length(sub(uses[0]!.pos!, world.snapshot().vehicle.pos))).toBeLessThan(0.01);
  });

  test('a health kit used on a hurt teammate gives one use at the patient, and no revive', () => {
    const world = make('p1', 'p2');
    world.teleportPlayer('p2', vec3(30, 0.02, 30));
    world.teleportPlayer('p1', vec3(30, 0.02, 31.5));
    run(world, 30);
    world.debugSetInventory('p1', ['healthKit', null, null]);
    world.debugHurt('p2', 30);
    run(world, 2);
    const { events, tickOfUse } = runUntilUse(world, new Map([['p1', input({ use: true, yaw: 0, pitch: -0.45 })]]));
    expect(me(world, 'p1').inventory[0]).toBeNull();
    expect(of(events, 'use')).toHaveLength(1);
    expect(of(events, 'use')[0]).toMatchObject({ playerId: 'p1', tick: tickOfUse });
    expect(of(events, 'revive')).toHaveLength(0);
  });
});

describe('pickup (R2)', () => {
  test('a prop pickup gives pickup, stamped with the tick, at the prop', () => {
    const world = make('p1', 'p2');
    world.teleportPlayer('p2', vec3(30, 0.02, 30));
    world.teleportPlayer('p1', vec3(10, 0.02, 9));
    run(world, 20);
    const events = run(world, 1, new Map([['p1', input({ interact: true, yaw: 0, pitch: -0.2 })]]));
    const held = me(world, 'p1').hands;
    expect(held).not.toBeNull();
    const pickups = of(events, 'pickup');
    expect(pickups).toHaveLength(1);
    expect(pickups[0]).toMatchObject({ playerId: 'p1', tick: world.snapshot().tick });
    expect(length(sub(pickups[0]!.pos!, world.debugBody(held!)!.translation()))).toBeLessThan(1);
  });

  test('an item pickup gives pickup', () => {
    const world = make('p1');
    world.teleportPlayer('p1', vec3(-2, 0.02, 15.2));
    run(world, 30);
    const events = run(world, 1, new Map([['p1', input({ interact: true, yaw: 0, pitch: -0.45 })]]));
    expect(me(world, 'p1').inventory[0]).not.toBeNull();
    const pickups = of(events, 'pickup');
    expect(pickups).toHaveLength(1);
    expect(pickups[0]).toMatchObject({ playerId: 'p1', tick: world.snapshot().tick });
    expect(pickups[0]!.pos).toBeDefined();
  });
});

describe('hook (R2)', () => {
  test('an attach gives hookAttach at the hook, and a detach gives hookDetach', () => {
    const world = make('p1');
    const body = world.debugBody('vehicle')!;
    body.setTranslation(vec3(-40, 1, -60), true);
    body.setLinvel(vec3(0, 0, 0), true);
    run(world, 60);
    const mount = add(body.translation(), rotate(body.rotation(), world.vehicleConfig.winchMount));
    world.teleportPlayer('p1', vec3(mount.x, 0.02, mount.z - 1.1));
    run(world, 20);
    const take = one(world, 'p1', { interact: true, yaw: 0, pitch: -0.2 });
    expect(of(take, 'hookAttach')).toHaveLength(0);
    expect(me(world, 'p1').hands).toBe('hook');
    world.teleportPlayer('p1', vec3(-40, 0.02, -68.5));
    run(world, 20);
    const aim = { yaw: 0, pitch: -0.63 };
    const attach = run(world, 1, new Map([['p1', input({ interact: true, ...aim })]]));
    expect(world.snapshot().cable.state).toBe('attached');
    const attached = of(attach, 'hookAttach');
    expect(attached).toHaveLength(1);
    expect(attached[0]).toMatchObject({ playerId: 'p1', tick: world.snapshot().tick });
    expect(attached[0]!.pos).toEqual(world.snapshot().cable.hookPos);
    run(world, 1, new Map([['p1', input(aim)]]));
    const hookAt = { ...world.snapshot().cable.hookPos };
    const detach = run(world, 1, new Map([['p1', input({ interact: true, ...aim })]]));
    expect(world.snapshot().cable.state).not.toBe('attached');
    const detached = of(detach, 'hookDetach');
    expect(detached).toHaveLength(1);
    expect(detached[0]).toMatchObject({ playerId: 'p1', tick: world.snapshot().tick, pos: hookAt });
  });

  test('releasing the cable at the winch box gives hookDetach at the hook', () => {
    const world = make('p1');
    const body = world.debugBody('vehicle')!;
    body.setTranslation(vec3(-40, 1, -60), true);
    body.setLinvel(vec3(0, 0, 0), true);
    run(world, 60);
    const mount = add(body.translation(), rotate(body.rotation(), world.vehicleConfig.winchMount));
    world.teleportPlayer('p1', vec3(mount.x, 0.02, mount.z - 1.1));
    run(world, 20);
    one(world, 'p1', { interact: true, yaw: 0, pitch: -0.2 });
    world.teleportPlayer('p1', vec3(-40, 0.02, -68.5));
    run(world, 20);
    const aim = { yaw: 0, pitch: -0.63 };
    run(world, 1, new Map([['p1', input({ interact: true, ...aim })]]));
    expect(world.snapshot().cable.state).toBe('attached');
    run(world, 1, new Map([['p1', input(aim)]]));
    const hookAt = { ...world.snapshot().cable.hookPos };
    const feet = vec3(mount.x, 0.02, mount.z - 1.1);
    world.teleportPlayer('p1', feet);
    run(world, 20);
    const d = sub(mount, add(feet, vec3(0, PLAYER_EYE_HEIGHT, 0)));
    const toMount = { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(d.y / length(d)) };
    const release = run(world, 1, new Map([['p1', input({ interact: true, ...toMount })]]));
    expect(world.snapshot().cable.state).not.toBe('attached');
    const detached = of(release, 'hookDetach');
    expect(detached).toHaveLength(1);
    expect(detached[0]).toMatchObject({ playerId: 'p1', tick: world.snapshot().tick, pos: hookAt });
  });
});
