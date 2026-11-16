import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { createWorld, type World } from './world';
import type { Placed } from './course';
import { IDENTITY, vec3 } from './math';
import { interactCandidates } from './interact';
import type { PropSnapshot } from './props';
import { buildSegment } from './segments';
import { VEHICLES } from './vehicles';
import type { CableSnapshot } from './winch';
import {
  ANCHOR_HEIGHT,
  BOARD_RANGE,
  CAMERA_DISTANCE,
  CAMERA_MIN_DISTANCE,
  CAMERA_SHOULDER,
  CAMERA_WALL_MARGIN,
  CRATE_WALL_LATERALS,
  GATES_OFFSET,
  ROADBLOCK_LATERAL,
  ROAD_WIDTH,
  CHARACTER_SCALE,
  COIN_HEIGHT,
  COIN_RADIUS,
  DRIVER_DOOR_RANGE,
  DROP_HEIGHT,
  FORD_ROCK,
  GRAVITY,
  HANDS_RANGE,
  HEAL_RANGE,
  HOLD_OFFSET,
  HOOK_RANGE,
  ITEM_KINDS,
  PLAYER_AIR_ACCEL,
  PLAYER_CONTROLLER_OFFSET,
  PLAYER_CROUCH_EYE_HEIGHT,
  PLAYER_CROUCH_HEIGHT,
  PLAYER_CROUCH_SPEED,
  PLAYER_EYE_HEIGHT,
  PLAYER_GROUND_ACCEL,
  PLAYER_HEIGHT,
  PLAYER_JUMP_SPEED,
  PLAYER_KNEESLIDE_SPEED,
  PLAYER_OVERLAP_LIFT,
  PLAYER_RADIUS,
  PLAYER_SNAP_DISTANCE,
  PLAYER_SPRINT_SPEED,
  PLAYER_STEP_HEIGHT,
  PLAYER_WALK_SPEED,
  PROP_KINDS,
  PUSH_FORCE,
  PUSH_FORCE_TIPPED,
  PUSH_HEIGHT,
  PUSH_MAX_ACCEL,
  SEAT_EXIT_DISTANCE,
  SHOP_RANGE,
  SHOVE_MAX_DISTANCE,
  SHOVE_STEP,
  SPAWN_WALL_RAY_HEIGHT,
  STOP_OPERATE_RANGE,
  THROW_HEAD_CLEARANCE,
  THROW_SPEED,
  USE_RANGE,
} from './constants';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe('scale pass (step 27a)', () => {
  test('T1: CHARACTER_SCALE is 0.8', () => {
    expect(CHARACTER_SCALE).toBe(0.8);
  });

  test('T1: scaled constants have the literal new values', () => {
    close(PLAYER_RADIUS, 0.28);
    close(PLAYER_HEIGHT, 1.44);
    close(PLAYER_EYE_HEIGHT, 1.28);
    close(PLAYER_CROUCH_HEIGHT, 0.88);
    close(PLAYER_CROUCH_EYE_HEIGHT, 0.76);
    close(PLAYER_SNAP_DISTANCE, 0.24);
    close(PUSH_HEIGHT, 0.8);
    close(HOOK_RANGE, 1.6);
    close(BOARD_RANGE, 1.6);
    close(HANDS_RANGE, 1.6);
    close(USE_RANGE, 1.6);
    close(STOP_OPERATE_RANGE, 1.6);
    close(SHOP_RANGE, 1.6);
    close(HEAL_RANGE, 1.6);
    close(THROW_HEAD_CLEARANCE, 0.04);
    close(COIN_RADIUS, 0.4);
    close(COIN_HEIGHT, 0.8);
    close(SPAWN_WALL_RAY_HEIGHT, 0.72);
    close(HOLD_OFFSET.x, 0);
    close(HOLD_OFFSET.y, 0.88);
    close(HOLD_OFFSET.z, -0.6);
    close(CAMERA_DISTANCE, 2.56);
    close(CAMERA_SHOULDER, 0.48);
    close(CAMERA_MIN_DISTANCE, 0.32);
    close(CAMERA_WALL_MARGIN, 0.16);
  });

  test('T1: prop and item boxes have the literal new values', () => {
    const half = (k: keyof typeof PROP_KINDS) => Object.values(PROP_KINDS[k].halfExtents);
    half('crate').forEach((v, i) => close(v, [0.24, 0.24, 0.24][i]!));
    half('barrier').forEach((v, i) => close(v, [0.8, 0.4, 0.32][i]!));
    half('cart').forEach((v, i) => close(v, [0.4, 0.32, 0.64][i]!));
    half('scooter').forEach((v, i) => close(v, [0.24, 0.36, 0.48][i]!));
    close(PROP_KINDS.barrier.anchor!.y, 0.4);
    const item = (k: keyof typeof ITEM_KINDS) => Object.values(ITEM_KINDS[k].halfExtents);
    item('jerrycan').forEach((v, i) => close(v, [0.096, 0.2, 0.16][i]!));
    item('toolbox').forEach((v, i) => close(v, [0.2, 0.096, 0.096][i]!));
    item('healthKit').forEach((v, i) => close(v, [0.144, 0.064, 0.112][i]!));
  });

  test('T1: constants kept by decision have their old values', () => {
    expect(PLAYER_STEP_HEIGHT).toBe(0.3);
    expect(DRIVER_DOOR_RANGE).toBe(1.5);
    expect(SEAT_EXIT_DISTANCE).toBe(0.9);
    expect(DROP_HEIGHT).toBe(0.3);
    expect(SHOVE_STEP).toBe(0.1);
    expect(SHOVE_MAX_DISTANCE).toBe(4);
    expect(PLAYER_OVERLAP_LIFT).toBe(0.05);
    expect(PLAYER_CONTROLLER_OFFSET).toBe(0.02);
    expect(ANCHOR_HEIGHT).toBe(0.5);
    expect([FORD_ROCK.x, FORD_ROCK.y, FORD_ROCK.z]).toEqual([0.3, 0.12, 0.3]);
    expect(PLAYER_WALK_SPEED).toBe(4.5);
    expect(PLAYER_SPRINT_SPEED).toBe(7);
    expect(PLAYER_CROUCH_SPEED).toBe(2.2);
    expect(PLAYER_KNEESLIDE_SPEED).toBe(9);
    expect(PLAYER_GROUND_ACCEL).toBe(40);
    expect(PLAYER_AIR_ACCEL).toBe(10);
    expect(PLAYER_JUMP_SPEED).toBe(5);
    expect(THROW_SPEED).toBe(7);
    expect(GRAVITY).toBe(9.81);
    expect(PUSH_FORCE).toBe(1500);
    expect(PUSH_FORCE_TIPPED).toBe(4000);
    expect(PUSH_MAX_ACCEL).toBe(10);
    expect(PROP_KINDS.crate.mass).toBe(15);
    expect(PROP_KINDS.barrier.mass).toBe(150);
    expect(PROP_KINDS.cart.mass).toBe(40);
    expect(PROP_KINDS.scooter.mass).toBe(30);
    expect(ITEM_KINDS.jerrycan.mass).toBe(20);
    expect(ITEM_KINDS.toolbox.mass).toBe(10);
    expect(ITEM_KINDS.healthKit.mass).toBe(2);
  });
});

describe('scale pass: derived rules', () => {
  const lodgy = VEHICLES.lodgy;
  const rv = VEHICLES.rv;
  const edges = (lateral: number) => [lateral - PROP_KINDS.barrier.halfExtents.x, lateral + PROP_KINDS.barrier.halfExtents.x] as const;

  test('T3: a 1.3 m ceiling lets the crouched capsule in and keeps the standing one out', () => {
    expect(PLAYER_CROUCH_HEIGHT).toBeLessThan(1.3);
    expect(PLAYER_HEIGHT).toBeGreaterThan(1.3);
    expect(PLAYER_CROUCH_EYE_HEIGHT).toBeLessThan(PLAYER_CROUCH_HEIGHT);
    expect(PLAYER_EYE_HEIGHT).toBeLessThan(PLAYER_HEIGHT);
    expect(PLAYER_RADIUS * 2).toBeLessThan(PLAYER_CROUCH_HEIGHT);
  });

  test('T4: every roadblock and roadworks gap is narrower than the Lodgy', () => {
    const limit = 2 * lodgy.halfExtents.x;
    const rows = [-ROADBLOCK_LATERAL, 0, ROADBLOCK_LATERAL].map(edges);
    const gaps = [rows[0]![0] - -ROAD_WIDTH / 2, rows[1]![0] - rows[0]![1], rows[2]![0] - rows[1]![1], ROAD_WIDTH / 2 - rows[2]![1]];
    for (const gap of gaps) expect(gap).toBeLessThan(limit);
    expect(gaps[0]).toBeCloseTo(1.2, 9);
    expect(gaps[1]).toBeCloseTo(1.4, 9);
    const works = buildSegment({ type: 'roadworks', length: 60, obstacles: 6 });
    const byRow = [works.props.slice(0, 3), works.props.slice(3, 6)];
    for (const row of byRow) {
      const xs = row.map((p) => p.pose.pos.x).sort((a, b) => a - b);
      const e = xs.map(edges);
      const g = [e[0]![0] - -ROAD_WIDTH / 2, e[1]![0] - e[0]![1], e[2]![0] - e[1]![1], ROAD_WIDTH / 2 - e[2]![1]];
      for (const gap of g) expect(gap).toBeLessThan(limit);
    }
  });

  test('T4: the gates corridor still fits both vehicles with a metre to spare', () => {
    const corridor = 2 * (GATES_OFFSET - PROP_KINDS.barrier.halfExtents.x);
    expect(corridor).toBeGreaterThanOrEqual(2 * rv.halfExtents.x + 1.0);
    expect(corridor).toBeGreaterThanOrEqual(2 * lodgy.halfExtents.x + 1.0);
  });

  test('T4: the crate wall is derived from the crate and its right-hand gap stops the Lodgy', () => {
    const crate = PROP_KINDS.crate.halfExtents;
    expect(CRATE_WALL_LATERALS).toHaveLength(3);
    CRATE_WALL_LATERALS.forEach((lateral, i) => expect(lateral).toBeCloseTo(2.0 + i * (2 * crate.x + 0.02), 9));
    expect(CRATE_WALL_LATERALS.map((l) => Number(l.toFixed(6)))).toEqual([2, 2.5, 3]);
    const wall = buildSegment({ type: 'road', length: 150, hazards: [{ kind: 'crateWall', along: 80 }] });
    const bottom = wall.props.filter((p) => p.pose.pos.y < 2 * crate.y - 1e-6 + wall.surfaceAt(80).pos.y);
    expect(bottom).toHaveLength(3);
    const outer = CRATE_WALL_LATERALS[2]! + crate.x;
    expect(ROAD_WIDTH / 2 - outer).toBeLessThan(2 * lodgy.halfExtents.x);
    const heights = new Set(wall.props.map((p) => Number(p.pose.pos.y.toFixed(6))));
    expect(heights.size).toBe(2);
    expect(Math.max(...heights) - Math.min(...heights)).toBeCloseTo(2 * crate.y, 6);
  });

  test('T5: the jump apex plus the step height stays just above the Lodgy roof, as before the pass', () => {
    const apex = (PLAYER_JUMP_SPEED * PLAYER_JUMP_SPEED) / (2 * GRAVITY);
    const roof = lodgy.rideHeight + lodgy.halfExtents.y;
    expect(apex).toBeCloseTo(1.274, 3);
    expect(roof).toBeCloseTo(1.5, 9);
    expect(apex).toBeLessThan(roof);
    expect(apex + PLAYER_STEP_HEIGHT).toBeCloseTo(1.574, 3);
    expect(apex + PLAYER_STEP_HEIGHT).toBeGreaterThan(roof);
    // The RV's roof is out of reach either way.
    expect(rv.rideHeight + rv.halfExtents.y).toBeGreaterThan(apex + PLAYER_STEP_HEIGHT + 1);
    // A crate (0.48 m) and a barrier (0.8 m) are above the step height, so they are jumped onto, not walked onto.
    expect(2 * PROP_KINDS.crate.halfExtents.y).toBeGreaterThan(PLAYER_STEP_HEIGHT);
    expect(2 * PROP_KINDS.barrier.halfExtents.y).toBeGreaterThan(PLAYER_STEP_HEIGHT);
    expect(2 * PROP_KINDS.crate.halfExtents.y + PLAYER_STEP_HEIGHT).toBeLessThan(apex + 0.5);
  });

  test('T6: pick-up reach follows HANDS_RANGE and boarding follows BOARD_RANGE', () => {
    const base = {
      config: lodgy,
      vehiclePos: vec3(0, lodgy.rideHeight, 0),
      vehicleRot: IDENTITY,
      yaw: 0,
      pitch: 0,
      takenSeats: new Set<string>(),
      heldProps: new Set<string>(),
      seat: null as string | null,
      hands: null as string | null,
      cable: { state: 'stowed', holderId: null, anchorId: null, hookPos: vec3(0, 0, 0), length: 0, reel: 0 } as CableSnapshot,
      anchors: [] as Placed[],
      items: [] as PropSnapshot[],
      freeSlot: true,
      stops: [],
    };
    const crateHalf = PROP_KINDS.crate.halfExtents;
    const crate = { id: 'c', kind: 'crate', pos: vec3(0, crateHalf.y, 30), rot: IDENTITY };
    const pickable = (gap: number) =>
      interactCandidates({ ...base, feet: vec3(0, 0, 30 - crateHalf.z - gap), props: [crate] }).some((c) => c.action.kind === 'pickUp');
    expect(pickable(HANDS_RANGE - 0.02)).toBe(true);
    expect(pickable(HANDS_RANGE + 0.02)).toBe(false);
    const boardable = (gap: number) =>
      interactCandidates({ ...base, feet: vec3(lodgy.halfExtents.x + gap, lodgy.rideHeight, 0), props: [] }).some((c) => c.action.kind === 'board');
    expect(boardable(BOARD_RANGE - 0.05)).toBe(true);
    expect(boardable(BOARD_RANGE + 0.3)).toBe(false);
  });
});

describe('scale pass: roof and prop jumps in the world', () => {
  beforeAll(async () => {
    await RAPIER.init();
  });
  const worlds: World[] = [];
  afterEach(() => {
    for (const w of worlds.splice(0)) w.dispose();
  });
  const input = (fields: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });
  const make = (): World => {
    const w = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    worlds.push(w);
    w.addPlayer('p');
    for (let i = 0; i < 30; i++) w.step(new Map());
    return w;
  };
  const me = (w: World) => w.snapshot().players.find((p) => p.playerId === 'p')!;
  const roof = VEHICLES.lodgy.rideHeight + VEHICLES.lodgy.halfExtents.y;

  test('T5: running at the Lodgy flank and jumping does not end on the roof', () => {
    const w = make();
    const side = w.snapshot().vehicle.pos;
    w.teleportPlayer('p', vec3(side.x + VEHICLES.lodgy.halfExtents.x + 4, 0.02, side.z));
    for (let i = 0; i < 20; i++) w.step(new Map([['p', input({ yaw: Math.PI / 2, moveY: 1 })]]));
    for (let i = 0; i < 240; i++) w.step(new Map([['p', input({ yaw: Math.PI / 2, moveY: 1, jump: i % 20 < 2 })]]));
    expect(me(w).pos.y).toBeLessThan(roof - 0.5);
  });

  test('T5: a player teleported onto the roof stays on it', () => {
    const w = make();
    const at = w.snapshot().vehicle.pos;
    w.teleportPlayer('p', vec3(at.x, roof + 0.1, at.z));
    for (let i = 0; i < 60; i++) w.step(new Map());
    expect(me(w).pos.y).toBeGreaterThan(roof - 0.05);
  });

  test('T5: a jump onto a crate (0.48 m) ends standing on it', () => {
    const w = make();
    const crate = w.snapshot().props.find((p) => p.id === 'crate-1')!.pos;
    w.teleportPlayer('p', vec3(crate.x + PROP_KINDS.crate.halfExtents.x + PLAYER_RADIUS + 0.9, 0.02, crate.z));
    for (let i = 0; i < 10; i++) w.step(new Map());
    for (let i = 0; i < 90; i++) w.step(new Map([['p', input({ yaw: Math.PI / 2, moveY: i < 18 ? 1 : 0, jump: i === 0 })]]));
    expect(me(w).pos.y).toBeCloseTo(2 * PROP_KINDS.crate.halfExtents.y, 1);
  });

  test('T5: standing on a barrier (0.8 m) and jumping at the Lodgy reaches the roof', () => {
    const w = make();
    const vehicle = w.snapshot().vehicle.pos;
    const barrier = PROP_KINDS.barrier.halfExtents;
    const body = w.debugBody('barrier-1')!;
    const gap = 0.3;
    body.setTranslation({ x: vehicle.x + VEHICLES.lodgy.halfExtents.x + barrier.z + gap, y: barrier.y, z: vehicle.z }, true);
    body.setRotation({ x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }, true);
    for (let i = 0; i < 10; i++) w.step(new Map());
    const top = 2 * barrier.y;
    w.teleportPlayer('p', vec3(vehicle.x + VEHICLES.lodgy.halfExtents.x + barrier.z + gap, top + 0.1, vehicle.z));
    for (let i = 0; i < 30; i++) w.step(new Map());
    expect(me(w).pos.y).toBeCloseTo(top, 1);
    for (let i = 0; i < 90; i++) w.step(new Map([['p', input({ yaw: Math.PI / 2, moveY: i < 30 ? 1 : 0, jump: i === 0 })]]));
    expect(me(w).pos.y).toBeGreaterThan(roof - 0.05);
  });
});
