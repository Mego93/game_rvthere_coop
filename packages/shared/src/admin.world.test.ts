import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { ADMIN_FLY_SPEED, ADMIN_FLY_VERTICAL, PLAYER_CONTROLLER_OFFSET, TICK_RATE } from './constants';
import { vec3 } from './math';
import { createPredictor, predictedFrom, type PredictedState } from './predictor';
import { NEUTRAL_INPUT, type InputFields, type PlayerInput } from './protocol';
import { withBoxes } from './testRig';
import { testGround } from './courses/testGround';
import { IDENTITY } from './math';
import { VEHICLES } from './vehicles';
import { createWorld, type World } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const worlds: World[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

const FAR = vec3(20, PLAYER_CONTROLLER_OFFSET, -90);
const input = (fields: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });
const make = (course?: Parameters<typeof createWorld>[2]): World => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, course);
  worlds.push(world);
  world.addPlayer('p1');
  world.teleportPlayer('p1', FAR);
  world.step(new Map());
  return world;
};
const me = (world: World) => world.snapshot().players.find((p) => p.playerId === 'p1')!;
const run = (world: World, ticks: number, fields: Partial<PlayerInput> = {}) => {
  for (let i = 0; i < ticks; i++) world.step(new Map([['p1', input(fields)]]));
};

describe('step 38: admin fly', () => {
  test('toggles on and off, flags the snapshot and assists the run', () => {
    const world = make();
    expect(me(world).flying).toBeUndefined();
    expect(world.adminTool('fly', 'p1')).toBe(true);
    run(world, 1);
    expect(me(world).flying).toBe(true);
    expect(world.status().assisted).toBe(true);
    expect(world.adminTool('fly', 'p1')).toBe(true);
    run(world, 1);
    expect(me(world).flying).toBeUndefined();
    expect(world.adminTool('fly')).toBe(false);
    expect(world.adminTool('fly', 'nobody')).toBe(false);
  });

  test('moves horizontally at ADMIN_FLY_SPEED, climbs and descends at ADMIN_FLY_VERTICAL, with no gravity', () => {
    const world = make();
    world.adminTool('fly', 'p1');
    const start = me(world).pos;
    run(world, 60, { moveY: 1 });
    const flown = me(world).pos;
    expect(Math.hypot(flown.x - start.x, flown.z - start.z)).toBeCloseTo(ADMIN_FLY_SPEED, 1);
    expect(flown.y).toBeCloseTo(start.y, 6);
    run(world, 60, { jump: true });
    expect(me(world).pos.y - flown.y).toBeCloseTo(ADMIN_FLY_VERTICAL, 1);
    const high = me(world).pos.y;
    run(world, 30, { crouch: true });
    expect(high - me(world).pos.y).toBeCloseTo(ADMIN_FLY_VERTICAL / 2, 1);
  });

  test('passes through a wall', () => {
    const course = withBoxes(testGround, { walls: [{ center: vec3(FAR.x, 1, FAR.z - 3), halfExtents: vec3(3, 1, 0.5), rot: IDENTITY }] });
    const world = make(course);
    world.adminTool('fly', 'p1');
    run(world, 60, { moveY: 1 });
    expect(me(world).pos.z).toBeLessThan(FAR.z - 5);
  });

  test('toggling off mid-air drops the player, who lands, grounded, with no stuck state', () => {
    const world = make();
    world.adminTool('fly', 'p1');
    run(world, TICK_RATE, { jump: true });
    expect(me(world).pos.y).toBeGreaterThan(5);
    world.adminTool('fly', 'p1');
    run(world, 1);
    expect(me(world).grounded).toBe(false);
    run(world, 3 * TICK_RATE);
    const landed = me(world);
    expect(landed.grounded).toBe(true);
    expect(landed.pos.y).toBeLessThan(1);
    run(world, 30, { moveY: 1 });
    expect(Math.hypot(me(world).walk.x, me(world).walk.z)).toBeGreaterThan(1);
  });

  test('a seated admin cannot fly', () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    worlds.push(world);
    world.addPlayer('p1');
    world.step(new Map([['p1', input({ interact: true })]]));
    world.step(new Map());
    expect(me(world).seat).not.toBeNull();
    expect(world.adminTool('fly', 'p1')).toBe(false);
    expect(me(world).flying).toBeUndefined();
  });

  test('the predictor equals the server while flying and after landing', () => {
    const world = make();
    world.adminTool('fly', 'p1');
    run(world, 1);
    const vehicle = world.snapshot().vehicle;
    const predictor = createPredictor(RAPIER, world.course, VEHICLES.lodgy);
    predictor.setVehicle(vehicle.pos, vehicle.rot);
    let state: PredictedState = predictedFrom(me(world));
    expect(state.flying).toBe(true);
    let before = { jump: false, crouch: false };
    const script: Partial<InputFields>[] = [
      ...Array.from({ length: 40 }, () => ({ moveY: 1, jump: true, yaw: 0.4 })),
      ...Array.from({ length: 20 }, () => ({ moveX: 1, crouch: true })),
    ];
    for (const fields of script) {
      const full = { ...NEUTRAL_INPUT, ...fields };
      world.step(new Map([['p1', { ...full, seq: 0 }]]));
      state = predictor.stepPlayer(state, full, before);
      before = { jump: full.jump, crouch: full.crouch === true };
      const server = me(world);
      expect(Math.abs(server.pos.x - state.pos.x)).toBeLessThan(1e-9);
      expect(Math.abs(server.pos.y - state.pos.y)).toBeLessThan(1e-9);
      expect(Math.abs(server.pos.z - state.pos.z)).toBeLessThan(1e-9);
    }
    predictor.dispose();
  });
});

describe('step 38: admin infinite items', () => {
  const useCan = (infinite: boolean) => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    worlds.push(world);
    world.addPlayer('p1');
    for (let i = 0; i < 30; i++) world.step(new Map());
    world.debugVehicle().addFuel(-0.7);
    if (infinite) expect(world.adminTool('infinite', 'p1')).toBe(true);
    world.debugSetInventory('p1', ['jerrycan', null, null]);
    let uses = 0;
    for (let i = 0; i < 3 * TICK_RATE; i++) uses += world.step(new Map([['p1', input({ use: true })]])).filter((e) => e.kind === 'use').length;
    return { world, uses };
  };

  test('a used jerrycan stays in the slot while on, is consumed when off, and the toggle assists the run', () => {
    const on = useCan(true);
    expect(on.uses).toBeGreaterThan(0);
    expect(me(on.world).inventory[0]).toBe('jerrycan');
    expect(on.world.status().assisted).toBe(true);
    const off = useCan(false);
    expect(off.uses).toBe(1);
    expect(me(off.world).inventory[0]).toBeNull();
    expect(off.world.status().assisted).toBe(false);
  });

  test('toggling again turns it off, and it needs a known player', () => {
    const world = make();
    expect(world.adminTool('infinite')).toBe(false);
    expect(world.adminTool('infinite', 'p1')).toBe(true);
    expect(world.adminTool('infinite', 'p1')).toBe(true);
    world.debugSetInventory('p1', ['jerrycan', null, null]);
  });
});

describe('step 38: flight end and admin change', () => {
  const fallDamage = (turnOffAt: number) => {
    const world = make();
    world.adminTool('fly', 'p1');
    run(world, 1);
    world.teleportPlayer('p1', vec3(FAR.x, turnOffAt, FAR.z));
    world.adminTool('fly', 'p1');
    run(world, 4 * TICK_RATE);
    return { health: me(world).health, grounded: me(world).grounded };
  };

  test('turning flight off high up costs no health on landing', () => {
    const result = fallDamage(30);
    expect(result.grounded).toBe(true);
    expect(result.health).toBe(100);
  });

  test('an ordinary fall from the same height still hurts, so the exemption is only for flight', () => {
    const world = make();
    world.teleportPlayer('p1', vec3(FAR.x, 30, FAR.z));
    run(world, 4 * TICK_RATE);
    expect(me(world).health).toBeLessThan(100);
  });

  test('the exemption ends on landing: a later fall hurts again', () => {
    const world = make();
    world.adminTool('fly', 'p1');
    run(world, 1);
    world.teleportPlayer('p1', vec3(FAR.x, 10, FAR.z));
    world.adminTool('fly', 'p1');
    run(world, 3 * TICK_RATE);
    expect(me(world).health).toBe(100);
    world.teleportPlayer('p1', vec3(FAR.x, 30, FAR.z));
    run(world, 4 * TICK_RATE);
    expect(me(world).health).toBeLessThan(100);
  });

  test('clearAdminModes ends flight and infinite for everyone but the kept id', () => {
    const world = make();
    world.addPlayer('p2');
    world.teleportPlayer('p2', vec3(FAR.x + 5, PLAYER_CONTROLLER_OFFSET, FAR.z));
    world.adminTool('fly', 'p1');
    world.adminTool('fly', 'p2');
    world.adminTool('infinite', 'p1');
    run(world, 1);
    world.clearAdminModes('p2');
    run(world, 1);
    const flying = (id: string) => world.snapshot().players.find((p) => p.playerId === id)!.flying;
    expect(flying('p1')).toBeUndefined();
    expect(flying('p2')).toBe(true);
    world.debugSetInventory('p1', ['jerrycan', null, null]);
    // infinite for p1 is gone: toggling it now turns it on again (returns true) and the old state did not linger.
    expect(world.adminTool('infinite', 'p1')).toBe(true);
    world.clearAdminModes(null);
    run(world, 1);
    expect(flying('p2')).toBeUndefined();
  });
});
