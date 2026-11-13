import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { TICK_DT, TICK_RATE } from './constants';
import type { Box } from './course';
import { boxesOverlap, enteredCheckpoint, insideBox, recordState } from './checkpoints';
import { testGround } from './courses/testGround';
import { IDENTITY, quatFromAxisAngle, AXIS_Y, vec3 } from './math';
import { reachedFinish, vehicleLost, elapsedAfter } from './rules';
import { createWorld, type World } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rot = IDENTITY): Box => ({
  center: vec3(cx, cy, cz),
  halfExtents: vec3(hx, hy, hz),
  rot,
});
const quarterTurn = quatFromAxisAngle(AXIS_Y, Math.PI / 2);
const eighthTurn = quatFromAxisAngle(AXIS_Y, Math.PI / 4);

describe('insideBox', () => {
  test('axis-aligned', () => {
    const b = box(10, 2, -5, 2, 1, 3);
    expect(insideBox(vec3(10, 2, -5), b)).toBe(true);
    expect(insideBox(vec3(11.9, 2.9, -7.9), b)).toBe(true);
    expect(insideBox(vec3(12.1, 2, -5), b)).toBe(false);
    expect(insideBox(vec3(10, 3.1, -5), b)).toBe(false);
    expect(insideBox(vec3(10, 2, -8.1), b)).toBe(false);
  });

  test('rotated a quarter turn the long side lies along x', () => {
    const b = box(0, 0, 0, 1, 1, 5, quarterTurn);
    expect(insideBox(vec3(4, 0, 0), b)).toBe(true);
    expect(insideBox(vec3(0, 0, 4), b)).toBe(false);
  });

  test('rotated an eighth turn the corner is cut', () => {
    const b = box(0, 0, 0, 1, 1, 5, eighthTurn);
    expect(insideBox(vec3(2, 0, 2), b)).toBe(true);
    expect(insideBox(vec3(2, 0, -2), b)).toBe(false);
    expect(insideBox(vec3(0, 0, -4), b)).toBe(false);
  });
});

describe('enteredCheckpoint', () => {
  const course = testGround;
  test('none outside every trigger', () => {
    expect(enteredCheckpoint(course, vec3(30, 1, -20), -1)).toBeNull();
  });
  test('one', () => {
    expect(enteredCheckpoint(course, vec3(0, 1, -50), 0)).toBe(1);
  });
  test('skipping to a higher one', () => {
    expect(enteredCheckpoint(course, vec3(0, 1, -50), -1)).toBe(1);
  });
  test('never a lower or equal index', () => {
    expect(enteredCheckpoint(course, vec3(0, 1, 0), 0)).toBeNull();
    expect(enteredCheckpoint(course, vec3(0, 1, 0), 1)).toBeNull();
    expect(enteredCheckpoint(course, vec3(0, 1, -50), 1)).toBeNull();
  });
});

describe('boxesOverlap', () => {
  test('axis-aligned', () => {
    expect(boxesOverlap(box(0, 0, 0, 1, 1, 1), box(1.5, 0, 0, 1, 1, 1))).toBe(true);
    expect(boxesOverlap(box(0, 0, 0, 1, 1, 1), box(3, 0, 0, 1, 1, 1))).toBe(false);
  });
  test('touching is not overlapping', () => {
    expect(boxesOverlap(box(0, 0, 0, 1, 1, 1), box(2, 0, 0, 1, 1, 1))).toBe(false);
  });
  test('rotated', () => {
    // A box turned 45 degrees reaches 1.414 along x: overlaps at 2.3, not at 2.5.
    expect(boxesOverlap(box(0, 0, 0, 1, 1, 1), box(2.3, 0, 0, 1, 1, 1, eighthTurn))).toBe(true);
    expect(boxesOverlap(box(0, 0, 0, 1, 1, 1), box(2.5, 0, 0, 1, 1, 1, eighthTurn))).toBe(false);
  });
  test('separated only on a cross axis', () => {
    // Two long thin boxes crossed at 45 degrees: every face axis overlaps, the cross axis separates them.
    const a = box(0, 0, 0, 5, 0.1, 0.1);
    const b = box(0, 0.5, 0, 0.1, 0.1, 5, quatFromAxisAngle(vec3(0, 0, 1), Math.PI / 4));
    expect(boxesOverlap(a, b)).toBe(false);
    expect(boxesOverlap(a, { ...b, center: vec3(0, 0.1, 0) })).toBe(true);
  });
});

describe('rules', () => {
  test('vehicleLost: health 0 or below the kill plane', () => {
    expect(vehicleLost(vec3(0, 1, 0), 0.5, -20)).toBe(false);
    expect(vehicleLost(vec3(0, 1, 0), 0, -20)).toBe(true);
    expect(vehicleLost(vec3(0, -20.1, 0), 0.5, -20)).toBe(true);
    expect(vehicleLost(vec3(0, -20, 0), 0.5, -20)).toBe(false);
  });
  test('reachedFinish: inside the box and not lost', () => {
    expect(reachedFinish(vec3(0, 2, -100), testGround.finish, false)).toBe(true);
    expect(reachedFinish(vec3(0, 2, -100), testGround.finish, true)).toBe(false);
    expect(reachedFinish(vec3(0, 2, -90), testGround.finish, false)).toBe(false);
  });
  test('elapsedAfter counts whole ticks', () => {
    expect(elapsedAfter(0)).toBe(0);
    expect(elapsedAfter(60)).toBeCloseTo(60 * TICK_DT, 12);
  });
});

describe('recordState', () => {
  test('a held prop is recorded at its course spawn, others where they are', () => {
    const placed = [
      { id: 'a', kind: 'crate', pose: { pos: vec3(1, 0, 2), rot: IDENTITY } },
      { id: 'b', kind: 'crate', pose: { pos: vec3(3, 0, 4), rot: IDENTITY } },
    ];
    const moved = (id: string, x: number) => ({ id, kind: 'crate', pos: vec3(x, 5, 5), rot: IDENTITY });
    const record = recordState({
      index: 1,
      fuel: 0.4,
      health: 0.9,
      props: [moved('a', 9), moved('b', 8)],
      heldIds: new Set(['a']),
      courseProps: placed,
      items: [{ id: 'item-1', kind: 'jerrycan', pos: vec3(1, 1, 1), rot: IDENTITY }],
      players: [{ id: 'p1', inventory: ['toolbox', null, null] }],
    });
    expect(record.props.get('a')!.centre.x).toBe(1);
    expect(record.props.get('a')!.centre.y).toBeGreaterThan(0);
    expect(record.props.get('b')!.centre).toEqual(vec3(8, 5, 5));
    expect(record.items).toEqual([{ id: 'item-1', kind: 'jerrycan', centre: vec3(1, 1, 1), rot: IDENTITY }]);
    expect(record.players.get('p1')!.inventory).toEqual(['toolbox', null, null]);
    expect(record.fuel).toBe(0.4);
  });
});

const fresh = (): World => createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
const checkpointEvents = (events: { kind: string }[]) => events.filter((event) => event.kind === 'checkpoint');

describe('world: recording, timer and win', () => {
  test('(1) cp-0 is recorded at creation, with no event', () => {
    const world = fresh();
    expect(world.snapshot().checkpoint).toBe(0);
    expect(world.snapshot().checkpointCount).toBe(2);
    expect(checkpointEvents(world.step(new Map()))).toEqual([]);
    world.dispose();
  });

  test('(2) entering cp-1 records it once, with one event', () => {
    const world = fresh();
    const body = world.debugBody('vehicle')!;
    body.setTranslation({ x: 0, y: 0.95, z: -50 }, true);
    const events = world.step(new Map());
    expect(checkpointEvents(events)).toHaveLength(1);
    expect(world.snapshot().checkpoint).toBe(1);
    body.setTranslation({ x: 0, y: 0.95, z: -30 }, true);
    world.step(new Map());
    body.setTranslation({ x: 0, y: 0.95, z: -50 }, true);
    const again = world.step(new Map());
    expect(checkpointEvents(again)).toEqual([]);
    expect(world.snapshot().checkpoint).toBe(1);
    world.dispose();
  });

  test('(3) elapsed equals ticks times TICK_DT', () => {
    const world = fresh();
    for (let i = 0; i < 123; i++) world.step(new Map());
    expect(Math.abs(world.snapshot().elapsed - 123 * TICK_DT)).toBeLessThan(1e-9);
    expect(world.status().elapsed).toBe(world.snapshot().elapsed);
    world.dispose();
  });

  test('(4) the vehicle centre entering the finish wins and stops the timer', () => {
    const world = fresh();
    expect(world.status().state).toBe('running');
    expect(world.snapshot().won).toBe(false);
    world.debugBody('vehicle')!.setTranslation({ x: 0, y: 1, z: -100 }, true);
    world.step(new Map());
    expect(world.status().state).toBe('won');
    expect(world.snapshot().won).toBe(true);
    const at = world.snapshot().elapsed;
    expect(at).toBeCloseTo(TICK_DT, 12);
    for (let i = 0; i < 30; i++) world.step(new Map());
    expect(world.snapshot().elapsed).toBe(at);
    expect(world.snapshot().tick).toBe(31);
    world.dispose();
  });

  test('(5) a respawn from the kill plane counts one', () => {
    const world = fresh();
    world.addPlayer('p1');
    world.step(new Map());
    world.teleportPlayer('p1', vec3(40, -25, 40));
    for (let i = 0; i < 4 * TICK_RATE; i++) world.step(new Map());
    expect(world.status().respawns).toBe(1);
    expect(world.snapshot().respawns).toBe(1);
    world.dispose();
  });

  test('a checkpoint recorded moves the fallback spawn', () => {
    const world = fresh();
    world.debugBody('vehicle')!.setTranslation({ x: 0, y: 0.95, z: -50 }, true);
    world.step(new Map());
    // Far from any ground, so no spawn slot is valid.
    world.debugBody('vehicle')!.setTranslation({ x: 500, y: 5, z: -50 }, true);
    world.addPlayer('p1');
    const pos = world.snapshot().players[0]!.pos;
    expect(pos.x).toBeCloseTo(0, 6);
    expect(pos.z).toBeCloseTo(-50, 6);
    world.dispose();
  });

  test('a lost vehicle does not win on the finish tick', () => {
    const world = fresh();
    world.debugVehicle().repair(-1);
    world.debugBody('vehicle')!.setTranslation({ x: 0, y: 1, z: -100 }, true);
    world.step(new Map());
    expect(world.status().state).toBe('running');
    world.dispose();
  });
});

