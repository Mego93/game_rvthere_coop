import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { HEAL_AIM_ANGLE, HEAL_RANGE, HOLD_DURATION, ITEM_REFUEL, PLAYER_HEIGHT, PLAYER_CONTROLLER_OFFSET, TICK_DT, TICK_RATE, USE_RANGE, type ItemKind } from './constants';
import type { BuiltCourse, Placed } from './course';
import { testGround } from './courses/testGround';
import { holdTargetValid, pressTarget, stepHold, stepOperateHold, useTarget, type Hold, type OperateHold, type UseContext } from './holds';
import { AXIS_Y, IDENTITY, deepFreeze, quatFromAxisAngle, vec3, type Vec3 } from './math';
import { aimRay } from './player';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { createWorld, type World } from './world';

beforeAll(async () => {
  await RAPIER.init();
});
const half = vec3(1, 0.5, 2);
const car = (fuel: number, health: number) => ({ pos: vec3(0, 0.5, 0), rot: IDENTITY, half, fuel, health });
const TICKS = Math.round(HOLD_DURATION / TICK_DT);

const ctxFor = (feet: Vec3, vehicle: UseContext['vehicle'], yaw = 0, pitch = 0, health = 100, players: UseContext['players'] = []): UseContext => {
  const { origin, dir } = aimRay(feet, yaw, pitch);
  return { self: { id: 'me', feet, eye: origin, aim: dir, health }, vehicle, players };
};

describe('useTarget', () => {
  test('a jerrycan targets the vehicle in range with fuel below 1', () => {
    expect(useTarget('jerrycan', ctxFor(vec3(2, 0, 0), car(0.5, 1)))).toBe('vehicle');
    expect(useTarget('jerrycan', ctxFor(vec3(2, 0, 0), car(1, 0.2)))).toBeNull();
  });
  test('a toolbox targets the vehicle in range with health below 1', () => {
    expect(useTarget('toolbox', ctxFor(vec3(2, 0, 0), car(1, 0.5)))).toBe('vehicle');
    expect(useTarget('toolbox', ctxFor(vec3(2, 0, 0), car(0.2, 1)))).toBeNull();
  });
  test('no item, no target', () => {
    expect(useTarget(null, ctxFor(vec3(2, 0, 0), car(0.1, 0.1)))).toBeNull();
  });
  test('a name that is not an item kind, including inherited object keys, has no target', () => {
    for (const name of ['toString', 'constructor', '__proto__', 'crate']) {
      expect(useTarget(name as ItemKind, ctxFor(vec3(2, 0, 0), car(0.1, 0.1)))).toBeNull();
    }
  });
  test('range is feet to the nearest point of the box', () => {
    expect(useTarget('jerrycan', ctxFor(vec3(1 + USE_RANGE - 0.01, 0, 0), car(0.5, 1)))).toBe('vehicle');
    expect(useTarget('jerrycan', ctxFor(vec3(1 + USE_RANGE + 0.01, 0, 0), car(0.5, 1)))).toBeNull();
  });
  test('the box is taken in the vehicle\'s rotation', () => {
    const turned = { ...car(0.5, 1), rot: quatFromAxisAngle(AXIS_Y, Math.PI / 2) };
    // Turned a quarter, the long side lies along x.
    expect(useTarget('jerrycan', ctxFor(vec3(2 + USE_RANGE - 0.01, 0, 0), turned))).toBe('vehicle');
    expect(useTarget('jerrycan', ctxFor(vec3(2 + USE_RANGE + 0.01, 0, 0), turned))).toBeNull();
  });
});

const VEHICLE = { id: 'vehicle', revive: false };
const jerry: (ItemKind | null)[] = ['jerrycan', null, 'toolbox'];
const press = { usePressed: true, useHeld: true, slot: 0 as const };
const held = { usePressed: false, useHeld: true, slot: 0 as const };

describe('stepHold', () => {
  test('a press with a valid target starts a hold on the selected slot\'s item', () => {
    const { hold, completed } = stepHold(null, press, jerry, VEHICLE, false);
    expect(hold).toMatchObject({ action: 'useItem', targetId: 'vehicle', slot: 0, item: 'jerrycan' });
    expect(hold!.progress).toBeCloseTo(TICK_DT / HOLD_DURATION, 9);
    expect(completed).toBeNull();
  });

  test('a press with no target, an empty slot or while seated does nothing', () => {
    expect(stepHold(null, press, jerry, null, false).hold).toBeNull();
    expect(stepHold(null, { ...press, slot: 1 }, jerry, VEHICLE, false).hold).toBeNull();
    expect(stepHold(null, press, jerry, VEHICLE, true).hold).toBeNull();
  });

  test('holding without a fresh press starts nothing', () => {
    expect(stepHold(null, held, jerry, VEHICLE, false).hold).toBeNull();
  });

  test('a hold advances by one tick over the duration each tick and completes on the tick it reaches 1', () => {
    let hold: Hold | null = null;
    let completed: Hold | null = null;
    let ticks = 0;
    for (let i = 0; i < TICKS * 2 && completed === null; i++) {
      ({ hold, completed } = stepHold(hold, i === 0 ? press : held, jerry, VEHICLE, false));
      ticks += 1;
      if (completed === null) expect(hold!.progress).toBeCloseTo(ticks * TICK_DT / HOLD_DURATION, 9);
    }
    expect(ticks).toBe(TICKS);
    expect(completed).toMatchObject({ slot: 0, item: 'jerrycan', progress: 1 });
    expect(hold).toBeNull();
  });

  test('after completion, holding without a press starts nothing', () => {
    expect(stepHold(null, held, jerry, VEHICLE, false)).toEqual({ hold: null, completed: null });
  });

  const running = (): Hold => stepHold(null, press, jerry, VEHICLE, false).hold!;

  test('releasing use resets', () => {
    expect(stepHold(running(), { ...held, useHeld: false }, jerry, VEHICLE, false)).toEqual({ hold: null, completed: null });
  });
  test('a target that stops being valid or leaves range resets', () => {
    expect(stepHold(running(), held, jerry, null, false)).toEqual({ hold: null, completed: null });
  });
  test('changing the selected slot resets, and a press on the new slot does not start it in the same tick', () => {
    expect(stepHold(running(), { ...held, slot: 2 }, jerry, VEHICLE, false)).toEqual({ hold: null, completed: null });
    expect(stepHold(running(), { ...press, slot: 2 }, jerry, VEHICLE, false).hold).toBeNull();
  });
  test('the item in the slot changing resets', () => {
    expect(stepHold(running(), held, ['toolbox', null, null], VEHICLE, false)).toEqual({ hold: null, completed: null });
    expect(stepHold(running(), held, [null, null, null], VEHICLE, false)).toEqual({ hold: null, completed: null });
  });
  test('being seated resets', () => {
    expect(stepHold(running(), held, jerry, VEHICLE, true)).toEqual({ hold: null, completed: null });
  });
  test('does not mutate the hold it is given', () => {
    const before = running();
    const copy = { ...before };
    stepHold(before, held, jerry, VEHICLE, false);
    expect(before).toEqual(copy);
  });
});

describe('health kits: useTarget (P5)', () => {
  const away = car(1, 1);
  const feetOf = (x: number, z: number, y = 0) => vec3(x, y, z);
  const mate = (id: string, x: number, z: number, extra: Partial<UseContext['players'][number]> = {}) => ({
    id,
    feet: feetOf(x, z),
    health: 60,
    downed: null,
    seated: false,
    ...extra,
  });
  // A standing teammate 1.5 m away is 25 degrees below the eye, so the default aim looks down a little.
  const target = (players: UseContext['players'], health = 100, yaw = 0, pitch = -0.3) =>
    useTarget('healthKit', ctxFor(vec3(0, 0, 0), away, yaw, pitch, health, players));

  test('a downed teammate is preferred over a hurt one with a smaller angle', () => {
    expect(target([mate('hurt', 0, -1.5), mate('down', 0.4, -1.5, { downed: 20, health: 0 })])).toBe('down');
  });
  test('of two hurt teammates the smaller angle wins, and a tie goes to the earlier', () => {
    expect(target([mate('far', 0.4, -1.5), mate('near', 0.1, -1.5)])).toBe('near');
    expect(target([mate('first', 0, -1.5), mate('second', 0, -1.5)])).toBe('first');
  });
  test('a teammate out of HEAL_RANGE is ignored, feet to feet in 3D', () => {
    expect(target([mate('in', 0, -(HEAL_RANGE - 0.01))])).toBe('in');
    expect(target([mate('out', 0, -(HEAL_RANGE + 0.01))])).toBeNull();
    expect(target([{ ...mate('high', 0, -1), feet: feetOf(0, -1, 1.9) }])).toBeNull();
  });
  test('a teammate outside HEAL_AIM_ANGLE of the crosshair is ignored', () => {
    const z = -1.5;
    const drop = aimRay(vec3(0, 0, 0), 0, 0).origin.y - PLAYER_HEIGHT / 2;
    // Aimed at the centre; a sideways offset x is then an angle of atan(x / distance).
    const pitch = -Math.atan2(drop, -z);
    const x = (angle: number) => Math.tan(angle) * Math.hypot(z, drop);
    expect(target([mate('in', x(HEAL_AIM_ANGLE - 0.02), z)], 100, 0, pitch)).toBe('in');
    expect(target([mate('out', x(HEAL_AIM_ANGLE + 0.02), z)], 100, 0, pitch)).toBeNull();
  });
  test('the aim follows yaw and pitch', () => {
    expect(target([mate('left', -1.5, 0)], 100, Math.PI / 2)).toBe('left');
    expect(target([mate('left', -1.5, 0)], 100, 0)).toBeNull();
  });
  test('a seated teammate is ignored', () => {
    expect(target([mate('seated', 0, -1.5, { seated: true })])).toBeNull();
    expect(target([mate('seated', 0, -1.5, { seated: true, downed: 10, health: 0 })])).toBeNull();
  });
  test('a teammate at full health is not a target', () => {
    expect(target([mate('fine', 0, -1.5, { health: 100 })])).toBeNull();
  });
  test('self when hurt and no teammate qualifies, null at full health', () => {
    expect(target([], 40)).toBe('me');
    expect(target([mate('fine', 0, -1.5, { health: 100 })], 40)).toBe('me');
    expect(target([], 100)).toBeNull();
  });
  test('a hurt teammate in front is preferred over self', () => {
    expect(target([mate('hurt', 0, -1.5)], 40)).toBe('hurt');
  });
  test('the jerrycan and toolbox ignore teammates', () => {
    const ctx = ctxFor(vec3(2, 0, 0), car(0.5, 0.5), 0, 0, 40, [mate('hurt', 2, -1.5)]);
    expect(useTarget('jerrycan', ctx)).toBe('vehicle');
    expect(useTarget('toolbox', ctx)).toBe('vehicle');
    expect(useTarget('jerrycan', ctxFor(vec3(2, 0, 0), car(1, 1), 0, 0, 40, [mate('hurt', 2, -1.5)]))).toBeNull();
  });
  test('a health kit never targets the vehicle', () => {
    expect(useTarget('healthKit', ctxFor(vec3(2, 0, 0), car(0.1, 0.1)))).toBeNull();
  });
  test('pressTarget says whether the press is a revive', () => {
    const players = [mate('down', 0, -1.5, { downed: 20, health: 0 })];
    expect(pressTarget('healthKit', ctxFor(vec3(0, 0, 0), away, 0, -0.3, 100, players))).toEqual({ id: 'down', revive: true });
    expect(pressTarget('healthKit', ctxFor(vec3(0, 0, 0), away, 0, -0.3, 100, [mate('hurt', 0, -1.5)]))).toEqual({ id: 'hurt', revive: false });
    expect(pressTarget('healthKit', ctxFor(vec3(0, 0, 0), away, 0, 0, 40))).toEqual({ id: 'me', revive: false });
    expect(pressTarget('jerrycan', ctxFor(vec3(2, 0, 0), car(0.5, 1)))).toEqual({ id: 'vehicle', revive: false });
    expect(pressTarget('healthKit', ctxFor(vec3(0, 0, 0), away))).toBeNull();
  });
});

describe('health kits: holdTargetValid and stepHold (P6)', () => {
  const hold = (action: Hold['action'], targetId: string, item: ItemKind = 'healthKit'): Hold => ({ action, targetId, slot: 0, item, progress: 0.3 });
  const mate = (extra: Partial<UseContext['players'][number]> = {}) => ({ id: 'mate', feet: vec3(0, 0, -1.5), health: 60, downed: null, seated: false, ...extra });
  const ctx = (players: UseContext['players'], health = 100, yaw = 0) => ctxFor(vec3(0, 0, 0), car(1, 1), yaw, 0, health, players);

  test('a revive target revived or respawned elsewhere becomes invalid', () => {
    expect(holdTargetValid(hold('revive', 'mate'), ctx([mate({ downed: 20, health: 0 })]))).toBe(true);
    expect(holdTargetValid(hold('revive', 'mate'), ctx([mate({ downed: null, health: 50 })]))).toBe(false);
  });
  test('a heal target healed to 100, or downed, becomes invalid', () => {
    expect(holdTargetValid(hold('useItem', 'mate'), ctx([mate()]))).toBe(true);
    expect(holdTargetValid(hold('useItem', 'mate'), ctx([mate({ health: 100 })]))).toBe(false);
    expect(holdTargetValid(hold('useItem', 'mate'), ctx([mate({ downed: 20, health: 0 })]))).toBe(false);
  });
  test('only range is checked while a hold runs, not the crosshair', () => {
    expect(holdTargetValid(hold('revive', 'mate'), ctx([mate({ downed: 20 })], 100, Math.PI))).toBe(true);
    expect(holdTargetValid(hold('revive', 'mate'), ctx([mate({ downed: 20, feet: vec3(0, 0, -(HEAL_RANGE + 0.01)) })]))).toBe(false);
  });
  test('a target that left or boarded the vehicle is invalid', () => {
    expect(holdTargetValid(hold('useItem', 'mate'), ctx([]))).toBe(false);
    expect(holdTargetValid(hold('useItem', 'mate'), ctx([mate({ seated: true })]))).toBe(false);
  });
  test('self stays valid while hurt and ends at full health', () => {
    expect(holdTargetValid(hold('useItem', 'me'), ctx([], 40))).toBe(true);
    expect(holdTargetValid(hold('useItem', 'me'), ctx([], 100))).toBe(false);
  });
  test('a vehicle hold is valid while the vehicle needs the item and is in range', () => {
    const at = (feet: Vec3, fuel: number) => ctxFor(feet, car(fuel, 1));
    expect(holdTargetValid(hold('useItem', 'vehicle', 'jerrycan'), at(vec3(2, 0, 0), 0.5))).toBe(true);
    expect(holdTargetValid(hold('useItem', 'vehicle', 'jerrycan'), at(vec3(2, 0, 0), 1))).toBe(false);
    expect(holdTargetValid(hold('useItem', 'vehicle', 'jerrycan'), at(vec3(20, 0, 0), 0.5))).toBe(false);
  });

  const kit: (ItemKind | null)[] = ['healthKit', null, null];
  test('a press on a downed target starts a revive hold, on a hurt one a useItem hold', () => {
    expect(stepHold(null, press, kit, { id: 'mate', revive: true }, false).hold).toMatchObject({ action: 'revive', targetId: 'mate', item: 'healthKit' });
    expect(stepHold(null, press, kit, { id: 'mate', revive: false }, false).hold).toMatchObject({ action: 'useItem', targetId: 'mate' });
  });
  test('a running hold keeps its action', () => {
    const first = stepHold(null, press, kit, { id: 'mate', revive: true }, false).hold!;
    expect(stepHold(first, held, kit, { id: 'mate', revive: true }, false).hold).toMatchObject({ action: 'revive', targetId: 'mate' });
  });
  test('blocked ends a running hold and starts none', () => {
    const first = stepHold(null, press, kit, { id: 'mate', revive: true }, false).hold!;
    expect(stepHold(first, held, kit, { id: 'mate', revive: true }, true)).toEqual({ hold: null, completed: null });
    expect(stepHold(null, press, kit, { id: 'mate', revive: true }, true).hold).toBeNull();
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

describe('stepOperateHold (S4)', () => {
  const press = { interactPressed: true, interactHeld: true };
  const held = { interactPressed: false, interactHeld: true };
  const released = { interactPressed: false, interactHeld: false };

  test('a press with a target binds, and counts as the first tick of progress', () => {
    const { hold, completed } = stepOperateHold(null, press, 'stop-fuel', false);
    expect(completed).toBeNull();
    expect(hold).toEqual({ action: 'operate', targetId: 'stop-fuel', progress: TICK_DT / HOLD_DURATION });
  });

  test('no press, no target or blocked starts nothing', () => {
    expect(stepOperateHold(null, held, 'stop-fuel', false).hold).toBeNull();
    expect(stepOperateHold(null, press, null, false).hold).toBeNull();
    expect(stepOperateHold(null, press, 'stop-fuel', true).hold).toBeNull();
  });

  test('it completes after exactly 3 s of ticks', () => {
    let { hold } = stepOperateHold(null, press, 's', false);
    let completed: OperateHold | null = null;
    let ticks = 1;
    while (hold) {
      ({ hold, completed } = stepOperateHold(hold, held, 's', false));
      ticks += 1;
    }
    expect(ticks).toBe(TICKS);
    expect(completed).toEqual({ action: 'operate', targetId: 's', progress: 1 });
  });

  test('releasing interact resets it', () => {
    const { hold } = stepOperateHold(null, press, 's', false);
    expect(stepOperateHold(hold, released, 's', false)).toEqual({ hold: null, completed: null });
  });

  test('a stop that is no longer valid, or another stop, resets it', () => {
    const { hold } = stepOperateHold(null, press, 's', false);
    expect(stepOperateHold(hold, held, null, false).hold).toBeNull();
    expect(stepOperateHold(hold, held, 'other', false).hold).toBeNull();
  });

  test('being blocked resets it', () => {
    const { hold } = stepOperateHold(null, press, 's', false);
    expect(stepOperateHold(hold, held, 's', true)).toEqual({ hold: null, completed: null });
  });

  test('after completion a fresh press is needed', () => {
    let { hold } = stepOperateHold(null, press, 's', false);
    let step = { hold, completed: null as OperateHold | null };
    while (hold) {
      step = stepOperateHold(hold, held, 's', false);
      hold = step.hold;
    }
    expect(step.completed).not.toBeNull();
    expect(stepOperateHold(null, held, 's', false).hold).toBeNull();
    expect(stepOperateHold(null, press, 's', false).hold).not.toBeNull();
  });
});
