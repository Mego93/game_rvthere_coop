import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { HOLD_DURATION, ITEM_REFUEL, PLAYER_CONTROLLER_OFFSET, TICK_DT, TICK_RATE, USE_RANGE, type ItemKind } from './constants';
import type { BuiltCourse, Placed } from './course';
import { testGround } from './courses/testGround';
import { stepHold, useTarget, type Hold } from './holds';
import { AXIS_Y, IDENTITY, deepFreeze, quatFromAxisAngle, vec3, type Vec3 } from './math';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { createWorld, type World } from './world';

beforeAll(async () => {
  await RAPIER.init();
});
const half = vec3(1, 0.5, 2);
const car = (fuel: number, health: number) => ({ pos: vec3(0, 0.5, 0), rot: IDENTITY, half, fuel, health });
const TICKS = Math.round(HOLD_DURATION / TICK_DT);

describe('useTarget', () => {
  test('a jerrycan targets the vehicle in range with fuel below 1', () => {
    expect(useTarget('jerrycan', vec3(2, 0, 0), car(0.5, 1))).toBe('vehicle');
    expect(useTarget('jerrycan', vec3(2, 0, 0), car(1, 0.2))).toBeNull();
  });
  test('a toolbox targets the vehicle in range with health below 1', () => {
    expect(useTarget('toolbox', vec3(2, 0, 0), car(1, 0.5))).toBe('vehicle');
    expect(useTarget('toolbox', vec3(2, 0, 0), car(0.2, 1))).toBeNull();
  });
  test('no item, no target', () => {
    expect(useTarget(null, vec3(2, 0, 0), car(0.1, 0.1))).toBeNull();
  });
  test('a name that is not an item kind, including inherited object keys, has no target', () => {
    for (const name of ['toString', 'constructor', '__proto__', 'crate']) {
      expect(useTarget(name as ItemKind, vec3(2, 0, 0), car(0.1, 0.1))).toBeNull();
    }
  });
  test('range is feet to the nearest point of the box', () => {
    expect(useTarget('jerrycan', vec3(1 + USE_RANGE - 0.01, 0, 0), car(0.5, 1))).toBe('vehicle');
    expect(useTarget('jerrycan', vec3(1 + USE_RANGE + 0.01, 0, 0), car(0.5, 1))).toBeNull();
  });
  test('the box is taken in the vehicle\'s rotation', () => {
    const turned = { ...car(0.5, 1), rot: quatFromAxisAngle(AXIS_Y, Math.PI / 2) };
    // Turned a quarter, the long side lies along x.
    expect(useTarget('jerrycan', vec3(2 + USE_RANGE - 0.01, 0, 0), turned)).toBe('vehicle');
    expect(useTarget('jerrycan', vec3(2 + USE_RANGE + 0.01, 0, 0), turned)).toBeNull();
  });
});

const jerry: (ItemKind | null)[] = ['jerrycan', null, 'toolbox'];
const press = { usePressed: true, useHeld: true, slot: 0 as const };
const held = { usePressed: false, useHeld: true, slot: 0 as const };

describe('stepHold', () => {
  test('a press with a valid target starts a hold on the selected slot\'s item', () => {
    const { hold, completed } = stepHold(null, press, jerry, 'vehicle', false);
    expect(hold).toMatchObject({ action: 'useItem', targetId: 'vehicle', slot: 0, item: 'jerrycan' });
    expect(hold!.progress).toBeCloseTo(TICK_DT / HOLD_DURATION, 9);
    expect(completed).toBeNull();
  });

  test('a press with no target, an empty slot or while seated does nothing', () => {
    expect(stepHold(null, press, jerry, null, false).hold).toBeNull();
    expect(stepHold(null, { ...press, slot: 1 }, jerry, 'vehicle', false).hold).toBeNull();
    expect(stepHold(null, press, jerry, 'vehicle', true).hold).toBeNull();
  });

  test('holding without a fresh press starts nothing', () => {
    expect(stepHold(null, held, jerry, 'vehicle', false).hold).toBeNull();
  });

  test('a hold advances by one tick over the duration each tick and completes on the tick it reaches 1', () => {
    let hold: Hold | null = null;
    let completed: Hold | null = null;
    let ticks = 0;
    for (let i = 0; i < TICKS * 2 && completed === null; i++) {
      ({ hold, completed } = stepHold(hold, i === 0 ? press : held, jerry, 'vehicle', false));
      ticks += 1;
      if (completed === null) expect(hold!.progress).toBeCloseTo(ticks * TICK_DT / HOLD_DURATION, 9);
    }
    expect(ticks).toBe(TICKS);
    expect(completed).toMatchObject({ slot: 0, item: 'jerrycan', progress: 1 });
    expect(hold).toBeNull();
  });

  test('after completion, holding without a press starts nothing', () => {
    expect(stepHold(null, held, jerry, 'vehicle', false)).toEqual({ hold: null, completed: null });
  });

  const running = (): Hold => stepHold(null, press, jerry, 'vehicle', false).hold!;

  test('releasing use resets', () => {
    expect(stepHold(running(), { ...held, useHeld: false }, jerry, 'vehicle', false)).toEqual({ hold: null, completed: null });
  });
  test('a target that stops being valid or leaves range resets', () => {
    expect(stepHold(running(), held, jerry, null, false)).toEqual({ hold: null, completed: null });
  });
  test('changing the selected slot resets, and a press on the new slot does not start it in the same tick', () => {
    expect(stepHold(running(), { ...held, slot: 2 }, jerry, 'vehicle', false)).toEqual({ hold: null, completed: null });
    expect(stepHold(running(), { ...press, slot: 2 }, jerry, 'vehicle', false).hold).toBeNull();
  });
  test('the item in the slot changing resets', () => {
    expect(stepHold(running(), held, ['toolbox', null, null], 'vehicle', false)).toEqual({ hold: null, completed: null });
    expect(stepHold(running(), held, [null, null, null], 'vehicle', false)).toEqual({ hold: null, completed: null });
  });
  test('being seated resets', () => {
    expect(stepHold(running(), held, jerry, 'vehicle', true)).toEqual({ hold: null, completed: null });
  });
  test('does not mutate the hold it is given', () => {
    const before = running();
    const copy = { ...before };
    stepHold(before, held, jerry, 'vehicle', false);
    expect(before).toEqual(copy);
  });
});

const input = (fields: Partial<PlayerInput>): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });
const placed = (id: string, kind: string, x: number): Placed => ({ id, kind, pose: { pos: vec3(x, 0, -10), rot: IDENTITY } });
const COURSE: BuiltCourse = deepFreeze({ ...testGround, pickups: [placed('j', 'jerrycan', 30), placed('t', 'toolbox', 32)] });
const playerOf = (world: World, id: string) => world.snapshot().players.find((player) => player.playerId === id)!;

function tap(world: World, id: string, fields: Partial<PlayerInput>) {
  world.step(new Map([[id, input(fields)]]));
  world.step(new Map([[id, input({ slot: fields.slot ?? 0 })]]));
}

function settle(world: World) {
  for (let i = 0; i < 10; i++) world.step(new Map());
}

// One player who has picked up the jerrycan (slot 0) and the toolbox (slot 1) and stands at spawn slot 0 beside the vehicle.
function armed(): { world: World; beside: Vec3 } {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, COURSE);
  world.addPlayer('p');
  const beside = playerOf(world, 'p').pos;
  for (const x of [30, 32]) {
    world.teleportPlayer('p', vec3(x, PLAYER_CONTROLLER_OFFSET, -9.2));
    settle(world);
    tap(world, 'p', { interact: true });
  }
  expect(playerOf(world, 'p').inventory).toEqual(['jerrycan', 'toolbox', null]);
  world.teleportPlayer('p', beside);
  settle(world);
  return { world, beside };
}

const holdFor = (world: World, ticks: number, fields: Partial<PlayerInput> = {}) => {
  for (let i = 0; i < ticks; i++) world.step(new Map([['p', input({ use: true, ...fields })]]));
};

describe('item use in the world', () => {
  test('1: holding use for 3 s beside the vehicle with a jerrycan refuels it by ITEM_REFUEL, consumes the jerrycan and ends the hold', () => {
    const { world } = armed();
    world.debugVehicle().addFuel(-0.7);
    holdFor(world, TICKS);
    expect(world.snapshot().vehicle.fuel).toBeCloseTo(0.3 + ITEM_REFUEL, 6);
    expect(playerOf(world, 'p').inventory).toEqual([null, 'toolbox', null]);
    expect(playerOf(world, 'p').hold).toBeNull();
    world.dispose();
  });

  test('2: releasing use at 2 s does nothing', () => {
    const { world } = armed();
    world.debugVehicle().addFuel(-0.7);
    holdFor(world, 2 * TICK_RATE);
    expect(playerOf(world, 'p').hold).not.toBeNull();
    world.step(new Map());
    expect(playerOf(world, 'p').hold).toBeNull();
    expect(world.snapshot().vehicle.fuel).toBeCloseTo(0.3, 6);
    expect(playerOf(world, 'p').inventory[0]).toBe('jerrycan');
    world.dispose();
  });

  test('3: walking out of range resets the hold', () => {
    const { world, beside } = armed();
    world.debugVehicle().addFuel(-0.7);
    holdFor(world, TICK_RATE);
    expect(playerOf(world, 'p').hold).not.toBeNull();
    // Yaw 0, so moveX moves along +X.
    holdFor(world, 3 * TICK_RATE, { moveX: Math.sign(beside.x) });
    expect(playerOf(world, 'p').hold).toBeNull();
    expect(world.snapshot().vehicle.fuel).toBeCloseTo(0.3, 6);
    expect(playerOf(world, 'p').inventory[0]).toBe('jerrycan');
    world.dispose();
  });

  test('4: with a full tank the press does nothing', () => {
    const { world } = armed();
    holdFor(world, 10);
    expect(playerOf(world, 'p').hold).toBeNull();
    holdFor(world, TICKS);
    expect(playerOf(world, 'p').inventory[0]).toBe('jerrycan');
    expect(world.snapshot().vehicle.fuel).toBe(1);
    world.dispose();
  });

  test('5: a toolbox repairs by ITEM_REPAIR', () => {
    const { world } = armed();
    world.debugVehicle().repair(-0.6);
    holdFor(world, TICKS, { slot: 1 });
    expect(world.snapshot().vehicle.health).toBeCloseTo(0.9, 6);
    expect(playerOf(world, 'p').inventory).toEqual(['jerrycan', null, null]);
    world.dispose();
  });

  test('6: switching slots mid-hold resets it', () => {
    const { world } = armed();
    world.debugVehicle().addFuel(-0.7);
    world.debugVehicle().repair(-0.6);
    holdFor(world, TICK_RATE, { slot: 0 });
    expect(playerOf(world, 'p').hold).not.toBeNull();
    holdFor(world, 1, { slot: 1 });
    expect(playerOf(world, 'p').hold).toBeNull();
    world.dispose();
  });

  test('7: boarding mid-hold resets it, and a seated player holding use starts nothing', () => {
    const { world } = armed();
    world.debugVehicle().addFuel(-0.7);
    holdFor(world, TICK_RATE);
    expect(playerOf(world, 'p').hold).not.toBeNull();
    holdFor(world, 1, { interact: true });
    expect(playerOf(world, 'p').seat).not.toBeNull();
    expect(playerOf(world, 'p').hold).toBeNull();
    // Release use for a tick, then press it again while seated.
    world.step(new Map([['p', input({})]]));
    holdFor(world, 1);
    expect(playerOf(world, 'p').hold).toBeNull();
    holdFor(world, TICK_RATE);
    expect(playerOf(world, 'p').hold).toBeNull();
    world.dispose();
  });

  test('7b: a teleport mid-hold resets it', () => {
    const { world, beside } = armed();
    world.debugVehicle().addFuel(-0.7);
    holdFor(world, TICK_RATE);
    world.teleportPlayer('p', beside);
    expect(playerOf(world, 'p').hold).toBeNull();
    world.dispose();
  });

  test('7c: dropping the held item mid-hold resets it and the item is not used', () => {
    const { world } = armed();
    world.debugVehicle().addFuel(-0.7);
    holdFor(world, TICK_RATE);
    expect(playerOf(world, 'p').hold).not.toBeNull();
    holdFor(world, 1, { drop: true });
    expect(playerOf(world, 'p').hold).toBeNull();
    expect(playerOf(world, 'p').inventory[0]).toBeNull();
    expect(world.snapshot().vehicle.fuel).toBeCloseTo(0.3, 6);
    world.dispose();
  });

  test('7d: respawning from the kill plane mid-hold resets it', () => {
    const { world, beside } = armed();
    world.debugVehicle().addFuel(-0.7);
    holdFor(world, TICK_RATE);
    expect(playerOf(world, 'p').hold).not.toBeNull();
    world.teleportPlayer('p', vec3(beside.x, COURSE.killPlaneY - 5, beside.z));
    for (let i = 0; i < 4 * TICK_RATE && playerOf(world, 'p').pos.y < 0; i++) world.step(new Map());
    expect(playerOf(world, 'p').pos.y).toBeGreaterThan(COURSE.killPlaneY);
    expect(playerOf(world, 'p').hold).toBeNull();
    world.dispose();
  });

  test('8: after completion, holding use does not start another hold; a fresh press does', () => {
    const { world } = armed();
    world.debugVehicle().addFuel(-0.7);
    world.debugVehicle().repair(-0.6);
    holdFor(world, TICKS + TICK_RATE, { slot: 1 });
    expect(playerOf(world, 'p').inventory[1]).toBeNull();
    expect(world.snapshot().vehicle.health).toBeCloseTo(0.9, 6);
    // Slot 0 holds a jerrycan and the tank needs fuel, but use has been held since before the switch.
    holdFor(world, TICK_RATE, { slot: 0 });
    expect(playerOf(world, 'p').hold).toBeNull();
    world.step(new Map([['p', input({ slot: 0 })]]));
    holdFor(world, 1);
    expect(playerOf(world, 'p').hold).not.toBeNull();
    world.dispose();
  });

  test('9: the snapshot shows hold progress rising from the press', () => {
    const { world } = armed();
    world.debugVehicle().addFuel(-0.7);
    expect(playerOf(world, 'p').hold).toBeNull();
    const seen: number[] = [];
    for (let i = 0; i < TICK_RATE; i++) {
      holdFor(world, 1);
      seen.push(playerOf(world, 'p').hold!.progress);
    }
    expect(playerOf(world, 'p').hold).toMatchObject({ action: 'useItem', targetId: 'vehicle' });
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThan(seen[i - 1]!);
    expect(seen[TICK_RATE - 1]!).toBeCloseTo(TICK_RATE * TICK_DT / HOLD_DURATION, 6);
    world.dispose();
  });
});
