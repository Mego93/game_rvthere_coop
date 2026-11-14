import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { PLAYER_REVIVE_HEALTH } from './constants';
import { testGround } from './courses/testGround';
import { IDENTITY, vec3 } from './math';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { withBoxes } from './testRig';
import { createWorld, type World } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const fresh = (): World => createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
const input = (fields: Partial<PlayerInput>): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });
const ZERO = vec3(0, 0, 0);
const CP1_SPAWN = vec3(0, 0.95, -50);
const none = new Map<string, PlayerInput>();
const settle = (world: World, ticks = 10) => {
  for (let i = 0; i < ticks; i++) world.step(none);
};
const playerOf = (world: World, id: string) => world.snapshot().players.find((player) => player.playerId === id);
const hasPlayer = (world: World, id: string) => playerOf(world, id) !== undefined;

function recordCp1(world: World) {
  const body = world.debugBody('vehicle')!;
  body.setTranslation(CP1_SPAWN, true);
  body.setLinvel(ZERO, true);
  world.step(none);
  expect(world.snapshot().checkpoint).toBe(1);
}

function win(world: World) {
  world.debugBody('vehicle')!.setTranslation({ x: 0, y: 1, z: -100 }, true);
  world.step(none);
  expect(world.status().state).toBe('won');
}

function seat(world: World, id: string) {
  world.step(new Map([[id, input({ interact: true })]]));
  world.step(none);
}

describe('L1: recordStart', () => {
  test('re-records cp-0 with the players present, so a restart does not heal to 100', () => {
    const world = fresh();
    world.addPlayer('p1');
    world.debugSetInventory('p1', ['jerrycan', null, null]);
    world.debugHurt('p1', 60);
    world.step(none);
    expect(world.debugPlayerHealth('p1')).toBeCloseTo(40, 6);
    world.recordStart();
    world.debugVehicle().repair(-1);
    world.step(none);
    expect(world.status().restarts).toBe(1);
    expect(world.debugPlayerHealth('p1')).toBe(50);
    expect(playerOf(world, 'p1')!.inventory).toEqual(['jerrycan', null, null]);
    world.dispose();
  });

  test('without recordStart the player is not in the creation record and comes back at 100 with nothing', () => {
    const world = fresh();
    world.addPlayer('p1');
    world.debugSetInventory('p1', ['jerrycan', null, null]);
    world.debugHurt('p1', 60);
    world.step(none);
    world.debugVehicle().repair(-1);
    world.step(none);
    expect(world.status().restarts).toBe(1);
    expect(world.debugPlayerHealth('p1')).toBe(100);
    expect(playerOf(world, 'p1')!.inventory).toEqual([null, null, null]);
    world.dispose();
  });

  test('a player added after recordStart gets 100 health and an empty inventory on restart', () => {
    const world = fresh();
    world.recordStart();
    world.addPlayer('p2');
    world.debugSetInventory('p2', ['toolbox', null, null]);
    world.debugHurt('p2', 70);
    world.step(none);
    world.debugVehicle().repair(-1);
    world.step(none);
    expect(world.status().restarts).toBe(1);
    expect(world.debugPlayerHealth('p2')).toBe(100);
    expect(playerOf(world, 'p2')!.inventory).toEqual([null, null, null]);
    world.dispose();
  });
});

describe('L2: held players', () => {
  test('hold removes the character and add restores health and inventory', () => {
    const world = fresh();
    world.addPlayer('p1');
    world.debugSetInventory('p1', ['jerrycan', 'toolbox', null]);
    world.debugHurt('p1', 30);
    world.step(none);
    world.removePlayer('p1', 'hold');
    expect(hasPlayer(world, 'p1')).toBe(false);
    const itemsBefore = world.snapshot().props.length;
    world.addPlayer('p1');
    expect(world.snapshot().props.length).toBe(itemsBefore);
    expect(world.debugPlayerHealth('p1')).toBeCloseTo(70, 6);
    expect(playerOf(world, 'p1')!.inventory).toEqual(['jerrycan', 'toolbox', null]);
    expect(world.status().respawns).toBe(0);
    world.dispose();
  });

  test('a hold frees the seat', () => {
    const world = fresh();
    world.addPlayer('p1');
    seat(world, 'p1');
    expect(playerOf(world, 'p1')!.seat).toBe('driver');
    world.removePlayer('p1', 'hold');
    world.addPlayer('p2');
    seat(world, 'p2');
    expect(playerOf(world, 'p2')!.seat).toBe('driver');
    world.dispose();
  });

  test('a downed hold rejoins as a respawn: 50 health, respawns +1 and a queued respawn event', () => {
    const world = fresh();
    world.addPlayer('p1');
    world.addPlayer('p2');
    world.debugHurt('p1', 100);
    world.step(none);
    expect(playerOf(world, 'p1')!.downed).not.toBeNull();
    world.removePlayer('p1', 'hold');
    world.addPlayer('p1');
    expect(world.debugPlayerHealth('p1')).toBe(PLAYER_REVIVE_HEALTH);
    expect(playerOf(world, 'p1')!.downed).toBeNull();
    expect(world.status().respawns).toBe(1);
    const tick = world.snapshot().tick;
    const events = world.step(none).filter((event) => event.kind === 'respawn');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ playerId: 'p1', tick: tick + 1 });
    world.dispose();
  });

  test('a downed rejoin after the win does not count a respawn', () => {
    const world = fresh();
    world.addPlayer('p1');
    world.addPlayer('p2');
    world.debugHurt('p1', 100);
    world.step(none);
    world.removePlayer('p1', 'hold');
    win(world);
    world.addPlayer('p1');
    expect(world.status().respawns).toBe(0);
    expect(world.debugPlayerHealth('p1')).toBe(PLAYER_REVIVE_HEALTH);
    world.dispose();
  });

  test('forgetHeld drops the inventory at a spawn slot, stacked, and forgets the entry', () => {
    const world = fresh();
    world.addPlayer('p1');
    world.debugSetInventory('p1', ['jerrycan', 'toolbox', null]);
    world.removePlayer('p1', 'hold');
    const before = world.snapshot().props.length;
    world.forgetHeld('p1');
    const after = world.snapshot().props;
    expect(after.length).toBe(before + 2);
    const dropped = after.slice(before);
    expect(dropped.map((prop) => prop.kind).sort()).toEqual(['jerrycan', 'toolbox']);
    expect(dropped[0]!.pos.y).toBeLessThan(dropped[1]!.pos.y);
    world.addPlayer('p1');
    expect(world.debugPlayerHealth('p1')).toBe(100);
    expect(playerOf(world, 'p1')!.inventory).toEqual([null, null, null]);
    world.dispose();
  });

  test("removePlayer(id, 'leave') on a held id forgets it and drops the held inventory", () => {
    const world = fresh();
    world.addPlayer('p1');
    world.debugSetInventory('p1', ['jerrycan', 'toolbox', null]);
    world.removePlayer('p1', 'hold');
    const before = world.snapshot().props.length;
    world.removePlayer('p1', 'leave');
    expect(world.snapshot().props.length).toBe(before + 2);
    world.addPlayer('p1');
    expect(playerOf(world, 'p1')!.inventory).toEqual([null, null, null]);
    world.dispose();
  });

  test('forgetHeld of an id with no held entry does nothing', () => {
    const world = fresh();
    world.addPlayer('p1');
    world.debugSetInventory('p1', ['jerrycan', null, null]);
    const before = world.snapshot().props.length;
    world.forgetHeld('p1');
    world.forgetHeld('nobody');
    expect(world.snapshot().props.length).toBe(before);
    expect(playerOf(world, 'p1')!.inventory).toEqual(['jerrycan', null, null]);
    world.dispose();
  });

  test('a restart while held restores from the record: the floor, downed cleared, no drop of the recorded inventory', () => {
    const world = fresh();
    world.addPlayer('p1');
    world.debugSetInventory('p1', ['jerrycan', null, null]);
    world.debugHurt('p1', 60);
    world.step(none);
    recordCp1(world);
    world.addPlayer('p2');
    world.debugSetInventory('p2', ['toolbox', null, null]);
    world.addPlayer('p3');
    world.debugHurt('p3', 100);
    world.step(none);
    world.addPlayer('p4');
    world.removePlayer('p1', 'hold');
    world.removePlayer('p2', 'hold');
    world.removePlayer('p3', 'hold');
    const props = world.snapshot().props.length;
    world.restartCheckpoint();
    world.step(none);
    expect(world.status().restarts).toBe(1);
    expect(world.snapshot().props.length).toBe(props);
    for (const id of ['p1', 'p2', 'p3']) world.addPlayer(id);
    expect(world.debugPlayerHealth('p1')).toBe(50);
    expect(playerOf(world, 'p1')!.inventory).toEqual(['jerrycan', null, null]);
    // Not in the record: 100 health and an empty inventory.
    expect(world.debugPlayerHealth('p2')).toBe(100);
    expect(playerOf(world, 'p2')!.inventory).toEqual([null, null, null]);
    expect(world.debugPlayerHealth('p3')).toBe(100);
    expect(playerOf(world, 'p3')!.downed).toBeNull();
    expect(world.status().respawns).toBe(0);
    world.dispose();
  });

  test('the everyone-downed rule counts present players only', () => {
    const world = fresh();
    world.addPlayer('p1');
    world.addPlayer('p2');
    world.debugHurt('p2', 100);
    world.step(none);
    world.removePlayer('p2', 'hold');
    world.debugHurt('p1', 100);
    world.step(none);
    // The only present player is downed, so everyone present respawns at once; the held one is not counted.
    expect(world.status().respawns).toBe(1);
    expect(playerOf(world, 'p1')!.downed).toBeNull();
    world.dispose();
  });

  test('a held healthy player does not stop the everyone-downed rule from applying to the rest', () => {
    const world = fresh();
    world.addPlayer('p1');
    world.addPlayer('p2');
    world.removePlayer('p2', 'hold');
    world.debugHurt('p1', 100);
    world.step(none);
    expect(world.status().respawns).toBe(1);
    expect(playerOf(world, 'p1')!.downed).toBeNull();
    world.dispose();
  });
});

describe('L4: the crew lands beside the vehicle at any tick', () => {
  const nearVehicle = (world: World) => {
    const vehicle = world.snapshot().vehicle.pos;
    const player = playerOf(world, 'p1')!;
    return Math.hypot(player.pos.x - vehicle.x, player.pos.z - vehicle.z);
  };
  // A spawn slot is about 2 m to the side; the fallback is the spawn point itself, under the chassis.
  const inSlot = (world: World) => nearVehicle(world) > 1.5 && nearVehicle(world) < 5;
  const skipAt = (tickCount: number): boolean => {
    const world = fresh();
    world.addPlayer('p1');
    settle(world, tickCount);
    expect(world.adminTool('skipCheckpoint')).toBe(true);
    const ok = inSlot(world);
    world.dispose();
    return ok;
  };

  test('a skip at tick 61 places the player beside the vehicle', () => {
    expect(skipAt(61)).toBe(true);
  });

  test('a skip at tick 69 places the player beside the vehicle', () => {
    expect(skipAt(69)).toBe(true);
  });

  test('a skip at every tick from 60 to 160 places the player beside the vehicle', () => {
    const bad: number[] = [];
    for (let t = 60; t <= 160; t++) if (!skipAt(t)) bad.push(t);
    expect(bad).toEqual([]);
  });

  test('with every slot blocked a skip falls back to the new checkpoint spawn, not the previous one', () => {
    const blocked = withBoxes(testGround, { walls: [{ center: vec3(0, 2, -50), halfExtents: vec3(8, 3, 8), rot: IDENTITY }] });
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, blocked);
    world.addPlayer('p1');
    settle(world, 10);
    expect(world.adminTool('skipCheckpoint')).toBe(true);
    const player = playerOf(world, 'p1')!;
    expect(Math.hypot(player.pos.x - CP1_SPAWN.x, player.pos.z - CP1_SPAWN.z)).toBeLessThan(1);
    world.dispose();
  });

  test('a restart after driving off, at every tick from 60 to 160, places the player beside the vehicle', () => {
    const bad: number[] = [];
    for (let t = 60; t <= 160; t++) {
      const world = fresh();
      world.addPlayer('p1');
      settle(world, t);
      world.debugBody('vehicle')!.setTranslation({ x: 0, y: 1, z: -20 }, true);
      world.step(none);
      world.restartCheckpoint();
      world.step(none);
      if (!inSlot(world)) bad.push(t);
      world.dispose();
    }
    expect(bad).toEqual([]);
  });

  test('a skip then a restart after driving off, at every tick from 60 to 160, places the player beside the vehicle at cp-1', () => {
    const bad: number[] = [];
    for (let t = 60; t <= 160; t++) {
      const world = fresh();
      world.addPlayer('p1');
      settle(world, t);
      world.adminTool('skipCheckpoint');
      settle(world, 3);
      world.restartCheckpoint();
      world.step(none);
      if (!inSlot(world)) bad.push(t);
      world.dispose();
    }
    expect(bad).toEqual([]);
  });
});

describe('L3: adminTool', () => {
  test('starts unassisted', () => {
    const world = fresh();
    expect(world.status().assisted).toBe(false);
    expect(world.snapshot().assisted).toBe(false);
    world.dispose();
  });

  test('refill sets fuel and health to 1, assists and returns true', () => {
    const world = fresh();
    world.debugVehicle().repair(-0.5);
    world.debugVehicle().addFuel(-0.7);
    expect(world.adminTool('refill')).toBe(true);
    expect(world.debugVehicle().fuel()).toBe(1);
    expect(world.debugVehicle().health()).toBe(1);
    expect(world.status().assisted).toBe(true);
    expect(world.snapshot().assisted).toBe(true);
    world.dispose();
  });

  test('refill returns true even when full', () => {
    const world = fresh();
    expect(world.adminTool('refill')).toBe(true);
    expect(world.status().assisted).toBe(true);
    world.dispose();
  });

  test('skipCheckpoint moves to cp-1, records it, queues the event at tick + 1 and assists', () => {
    const world = fresh();
    expect(world.adminTool('skipCheckpoint')).toBe(true);
    const snapshot = world.snapshot();
    expect(snapshot.checkpoint).toBe(1);
    expect(snapshot.vehicle.pos.x).toBeCloseTo(CP1_SPAWN.x, 6);
    expect(snapshot.vehicle.pos.y).toBeCloseTo(CP1_SPAWN.y, 6);
    expect(snapshot.vehicle.pos.z).toBeCloseTo(CP1_SPAWN.z, 6);
    expect(snapshot.assisted).toBe(true);
    const events = world.step(none).filter((event) => event.kind === 'checkpoint');
    expect(events).toHaveLength(1);
    expect(events[0]!.tick).toBe(snapshot.tick + 1);
    // Recorded: a restart returns to cp-1.
    world.debugVehicle().repair(-1);
    world.step(none);
    expect(world.status().restarts).toBe(1);
    expect(world.snapshot().vehicle.pos.z).toBeCloseTo(CP1_SPAWN.z, 3);
    world.dispose();
  });

  test('skipCheckpoint unseats everyone into spawn slots with empty hands and keeps state', () => {
    const world = fresh();
    world.addPlayer('p1');
    world.addPlayer('p2');
    settle(world, 20);
    seat(world, 'p1');
    expect(playerOf(world, 'p1')!.seat).toBe('driver');
    world.debugSetInventory('p1', ['jerrycan', null, null]);
    world.debugVehicle().addFuel(-0.5);
    world.debugVehicle().repair(-0.25);
    const fuel = world.debugVehicle().fuel();
    const health = world.debugVehicle().health();
    const { coinsLeft, wallet } = world.snapshot();
    expect(world.adminTool('skipCheckpoint')).toBe(true);
    const after = world.snapshot();
    expect(world.debugVehicle().fuel()).toBe(fuel);
    expect(world.debugVehicle().health()).toBe(health);
    expect(after.coinsLeft).toEqual(coinsLeft);
    expect(after.wallet).toBe(wallet);
    for (const id of ['p1', 'p2']) {
      const player = playerOf(world, id)!;
      expect(player.seat).toBeNull();
      expect(player.hands).toBeNull();
      expect(Math.hypot(player.pos.x - CP1_SPAWN.x, player.pos.z - CP1_SPAWN.z)).toBeLessThan(5);
    }
    expect(playerOf(world, 'p1')!.inventory).toEqual(['jerrycan', null, null]);
    world.dispose();
  });

  test('skipCheckpoint keeps a downed player downed with their timer', () => {
    const world = fresh();
    world.addPlayer('p1');
    world.addPlayer('p2');
    world.debugHurt('p2', 100);
    world.step(none);
    const timer = playerOf(world, 'p2')!.downed;
    expect(timer).not.toBeNull();
    expect(world.adminTool('skipCheckpoint')).toBe(true);
    expect(playerOf(world, 'p2')!.downed).toBe(timer);
    world.dispose();
  });

  test('skipCheckpoint sends a prop that overlaps the new spawn to its own spawn and leaves the others', () => {
    const world = fresh();
    settle(world, 60);
    const props = world.snapshot().props.filter((prop) => world.course.props.some((placed) => placed.id === prop.id));
    const moved = props[0]!;
    const other = props[1]!;
    const otherAt = { ...other.pos };
    const body = world.debugBody(moved.id)!;
    body.setTranslation(CP1_SPAWN, true);
    body.setLinvel(ZERO, true);
    expect(world.adminTool('skipCheckpoint')).toBe(true);
    const after = world.snapshot().props;
    const spawn = world.course.props.find((placed) => placed.id === moved.id)!.pose.pos;
    expect(Math.hypot(after.find((prop) => prop.id === moved.id)!.pos.x - spawn.x, after.find((prop) => prop.id === moved.id)!.pos.z - spawn.z)).toBeLessThan(1);
    expect(after.find((prop) => prop.id === other.id)!.pos).toEqual(otherAt);
    world.dispose();
  });

  test('skipCheckpoint while a player carries a crate empties the hands and resets the crate to its spawn, free to be picked up again', () => {
    const world = fresh();
    world.addPlayer('p1');
    settle(world, 30);
    const beside = vec3(12, 0.02, 8);
    const aim = { yaw: Math.PI / 2, pitch: -Math.atan2(1.0, 1.7) };
    const press = () => {
      world.step(new Map([['p1', input({ ...aim, interact: true })]]));
      world.step(new Map([['p1', input(aim)]]));
    };
    world.teleportPlayer('p1', beside);
    settle(world, 30);
    press();
    expect(playerOf(world, 'p1')!.hands).toBe('crate-1');
    expect(world.adminTool('skipCheckpoint')).toBe(true);
    expect(playerOf(world, 'p1')!.hands).toBeNull();
    const spawn = world.course.props.find((placed) => placed.id === 'crate-1')!.pose.pos;
    const crate = world.snapshot().props.find((prop) => prop.id === 'crate-1')!;
    expect(Math.hypot(crate.pos.x - spawn.x, crate.pos.z - spawn.z)).toBeLessThan(0.5);
    // Nobody holds it any more: a player beside it can pick it up.
    settle(world, 30);
    world.teleportPlayer('p1', beside);
    settle(world, 30);
    press();
    expect(playerOf(world, 'p1')!.hands).toBe('crate-1');
    world.dispose();
  });

  test('skipCheckpoint on the last checkpoint returns false and leaves assisted false', () => {
    const world = fresh();
    recordCp1(world);
    expect(world.adminTool('skipCheckpoint')).toBe(false);
    expect(world.status().assisted).toBe(false);
    expect(world.snapshot().assisted).toBe(false);
    world.dispose();
  });

  test('nothing happens after the win', () => {
    const world = fresh();
    world.debugVehicle().addFuel(-0.5);
    win(world);
    expect(world.adminTool('refill')).toBe(false);
    expect(world.adminTool('skipCheckpoint')).toBe(false);
    expect(world.debugVehicle().fuel()).toBeLessThan(1);
    expect(world.snapshot().checkpoint).toBe(0);
    expect(world.status().assisted).toBe(false);
    world.dispose();
  });
});

