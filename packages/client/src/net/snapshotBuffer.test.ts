import {
  AXIS_Y,
  INTERPOLATION_DELAY,
  SNAPSHOT_BUFFER_SIZE,
  TICK_DT,
  quatFromAxisAngle,
  vec3,
  yawOf,
  type PlayerSnapshot,
  type PropSnapshot,
  type SnapshotMessage,
} from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createSnapshotBuffer } from './snapshotBuffer';

// A snapshot at `tick` whose vehicle sits at z = -tick, has yaw tick / 100 and throttle tick.
const snapshot = (
  tick: number,
  players: PlayerSnapshot[] = [],
  props: PropSnapshot[] = [],
  full = false,
): SnapshotMessage => ({
  type: 'snapshot',
  ackSeq: 0,
  full,
  tick,
  vehicle: {
    pos: vec3(0, 1, -tick),
    rot: quatFromAxisAngle(AXIS_Y, tick / 100),
    linvel: vec3(0, 0, -tick),
    throttle: tick,
    steer: 0,
    fuel: 1,
    health: 1,
  },
  players,
  props,
  cable: { state: 'stowed', holderId: null, anchorId: null, hookPos: vec3(0, 1, -tick), length: 0, reel: 0 },
  elapsed: tick / 60,
  checkpoint: 0,
  checkpointCount: 2,
  restarts: 0,
  respawns: 0,
  won: false,
  coinsLeft: ['coin-1', 'coin-2'],
  wallet: 0,
  coinsCollected: 0,
  coinsTotal: 2,
  assisted: false,
});

// Snapshots every 3 ticks, each arriving exactly when the server's clock reads its tick time plus `latency`.
function filled(ticks: number[], latency = 0) {
  const buffer = createSnapshotBuffer();
  for (const tick of ticks) buffer.push(snapshot(tick), tick * TICK_DT + latency);
  return buffer;
}

test('copies the cable into the sample and the latest', () => {
  const buffer = filled([0, 3, 6]);
  expect(buffer.sample(3 * TICK_DT + INTERPOLATION_DELAY)?.cable.state).toBe('stowed');
  expect(buffer.latestCable()?.hookPos).toEqual(vec3(0, 1, -6));
  expect(createSnapshotBuffer().latestCable()).toBeNull();
});

test('blends the hook and the length within one state, and takes the newer across a change', () => {
  const at = (tick: number, state: SnapshotMessage['cable']['state'], length: number): SnapshotMessage => ({
    ...snapshot(tick),
    cable: { state, holderId: null, anchorId: null, hookPos: vec3(0, 1, -tick), length, reel: 0 },
  });
  const same = createSnapshotBuffer();
  same.push(at(3, 'ground', 2), 3 * TICK_DT);
  same.push(at(9, 'ground', 8), 9 * TICK_DT);
  const mid = same.sample(6 * TICK_DT + INTERPOLATION_DELAY)!.cable;
  expect(mid.hookPos.z).toBeCloseTo(-6, 6);
  expect(mid.length).toBeCloseTo(5, 6);
  const changed = createSnapshotBuffer();
  changed.push(at(3, 'held', 2), 3 * TICK_DT);
  changed.push(at(9, 'ground', 8), 9 * TICK_DT);
  const jump = changed.sample(6 * TICK_DT + INTERPOLATION_DELAY)!.cable;
  expect(jump.state).toBe('ground');
  expect(jump.hookPos.z).toBe(-9);
  expect(jump.length).toBe(8);
});

test('gives nothing before the first snapshot', () => {
  const buffer = createSnapshotBuffer();
  expect(buffer.sample(1)).toBeNull();
  expect(buffer.latestTick()).toBe(0);
});

test('draws the past: blends the two snapshots around now minus the delay', () => {
  const buffer = filled([3, 6, 9, 12, 15, 18]);
  // Now is tick 18. The delay of 0.1 s is 6 ticks, so the view is at tick 12.
  expect(buffer.sample(18 * TICK_DT)!.vehicle.pos.z).toBeCloseTo(-12, 6);
  // Half a tick-pair later the view is halfway between ticks 12 and 15.
  const between = buffer.sample(19.5 * TICK_DT)!.vehicle;
  expect(between.pos.z).toBeCloseTo(-13.5, 6);
  expect(between.linvel.z).toBeCloseTo(-13.5, 6);
  expect(yawOf(between.rot)).toBeCloseTo(0.135, 4);
  expect(between.throttle).toBe(15);
  expect(buffer.latestTick()).toBe(18);
});

test('the same latency on every snapshot does not change what is drawn', () => {
  const buffer = filled([3, 6, 9, 12, 15, 18], 0.25);
  expect(buffer.sample(18 * TICK_DT + 0.25)!.vehicle.pos.z).toBeCloseTo(-12, 6);
});

test('holds the newest snapshot when none has arrived for a while', () => {
  const buffer = filled([3, 6, 9]);
  expect(buffer.sample(9 * TICK_DT + INTERPOLATION_DELAY + 1)!.vehicle.pos.z).toBe(-9);
});

test('holds the oldest snapshot when the view is still before it', () => {
  const buffer = filled([30]);
  expect(buffer.sample(30 * TICK_DT)!.vehicle.pos.z).toBe(-30);
});

test('ignores a snapshot that is not newer than the newest', () => {
  const buffer = filled([3, 6, 9]);
  buffer.push(snapshot(6), 9 * TICK_DT);
  buffer.push(snapshot(9), 9 * TICK_DT);
  expect(buffer.latestTick()).toBe(9);
});

test('one late snapshot barely moves the clock', () => {
  const buffer = filled([3, 6, 9, 12, 15]);
  // Tick 18 arrives 80 ms late.
  buffer.push(snapshot(18), 18 * TICK_DT + 0.08);
  const drawn = buffer.sample(18 * TICK_DT + 0.08)!.vehicle.pos.z;
  // On time the view would be at tick 16.8 (0.08 s is 4.8 ticks after tick 12).
  expect(drawn).toBeLessThan(-16.3);
  expect(drawn).toBeGreaterThan(-16.8 - 0.001);
});

test('a lasting delay is followed within a few seconds', () => {
  const buffer = filled([3, 6, 9, 12, 15]);
  // From tick 18 on, everything arrives 0.2 s later than before.
  for (let tick = 18; tick <= 18 + 3 * 100; tick += 3) buffer.push(snapshot(tick), tick * TICK_DT + 0.2);
  const lastTick = 18 + 3 * 100;
  const drawn = buffer.sample(lastTick * TICK_DT + 0.2)!.vehicle.pos.z;
  expect(drawn).toBeCloseTo(-(lastTick - INTERPOLATION_DELAY / TICK_DT), 0);
});

test('keeps only the newest snapshots', () => {
  const ticks = Array.from({ length: SNAPSHOT_BUFFER_SIZE + 10 }, (_, index) => (index + 1) * 3);
  const buffer = filled(ticks);
  // A view from long ago lands on the oldest snapshot still held, which is the 11th pushed.
  expect(buffer.sample(0)!.vehicle.pos.z).toBe(-33);
});

const player = (playerId: string, x: number, yaw: number): PlayerSnapshot => ({
  playerId,
  pos: vec3(x, 0, 0),
  yaw,
  seat: null,
  hands: null,
  ground: null,
  walk: { x: 0, z: 0 },
  carry: { x: 0, z: 0 },
  vy: 0,
  grounded: true,
  inventory: [null, null, null],
  slot: 0,
  hold: null,
  health: 100,
  downed: null,
});

// Two snapshots (ticks 6 and 12) that arrive on time; sampled at `tick` the view is that tick minus the delay.
function pair(older: PlayerSnapshot[], newer: PlayerSnapshot[]) {
  const buffer = createSnapshotBuffer();
  buffer.push(snapshot(6, older), 6 * TICK_DT);
  buffer.push(snapshot(12, newer), 12 * TICK_DT);
  return buffer;
}
const DELAY_TICKS = INTERPOLATION_DELAY / TICK_DT;

test('players blend between the same pair as the vehicle', () => {
  const buffer = pair([player('a', 0, 0.2)], [player('a', 10, 0.6)]);
  const view = buffer.sample((9 + DELAY_TICKS) * TICK_DT)!;
  expect(view.vehicle.pos.z).toBeCloseTo(-9, 6);
  expect(view.players).toHaveLength(1);
  expect(view.players[0]!.pos.x).toBeCloseTo(5, 6);
  expect(view.players[0]!.yaw).toBeCloseTo(0.4, 6);
});

test('player yaw crossing +-pi goes the short way round', () => {
  const buffer = pair([player('a', 0, Math.PI - 0.1)], [player('a', 0, -Math.PI + 0.1)]);
  const yaw = buffer.sample((9 + DELAY_TICKS) * TICK_DT)!.players[0]!.yaw;
  expect(Math.abs(Math.abs(yaw) - Math.PI)).toBeLessThan(1e-6);
  const early = buffer.sample((7.5 + DELAY_TICKS) * TICK_DT)!.players[0]!.yaw;
  expect(early).toBeCloseTo(Math.PI - 0.05, 6);
});

test('a player only in the newer snapshot is held at the newer value', () => {
  const buffer = pair([], [player('a', 10, 0.6)]);
  const view = buffer.sample((7 + DELAY_TICKS) * TICK_DT)!;
  expect(view.players).toEqual([player('a', 10, 0.6)]);
});

test('a player only in the older snapshot is dropped', () => {
  const buffer = pair([player('a', 0, 0), player('b', 4, 0)], [player('b', 8, 0)]);
  const view = buffer.sample((9 + DELAY_TICKS) * TICK_DT)!;
  expect(view.players.map((p) => p.playerId)).toEqual(['b']);
  expect(view.players[0]!.pos.x).toBeCloseTo(6, 6);
});

test('seat and ground come from the newer snapshot', () => {
  const seated = { ...player('a', 0, 0), seat: 'driver' };
  const standing = { ...player('a', 0, 0), ground: { bodyId: 'vehicle', localPos: vec3(1, 2, 3) } };
  const view = pair([seated], [standing]).sample((9 + DELAY_TICKS) * TICK_DT)!;
  expect(view.players[0]!.seat).toBeNull();
  expect(view.players[0]!.ground).toEqual({ bodyId: 'vehicle', localPos: vec3(1, 2, 3) });
});

test('hands come from the newer snapshot', () => {
  const holding = { ...player('a', 0, 0), hands: 'crate-1' };
  const view = pair([player('a', 0, 0)], [holding]).sample((9 + DELAY_TICKS) * TICK_DT)!;
  expect(view.players[0]!.hands).toBe('crate-1');
  expect(pair([holding], [player('a', 0, 0)]).sample((9 + DELAY_TICKS) * TICK_DT)!.players[0]!.hands).toBeNull();
});

test('walk, carry, vy and grounded come from the newer snapshot, as new objects', () => {
  const newer = { ...player('a', 10, 0), walk: { x: 1, z: 2 }, carry: { x: 3, z: 4 }, vy: 5, grounded: false };
  const buffer = pair([player('a', 0, 0)], [newer]);
  for (const now of [100, (9 + DELAY_TICKS) * TICK_DT]) {
    const view = buffer.sample(now)!.players[0]!;
    expect(view).toMatchObject({ walk: { x: 1, z: 2 }, carry: { x: 3, z: 4 }, vy: 5, grounded: false });
    view.walk.x = 999;
    view.carry.z = 999;
    expect(buffer.sample(now)!.players[0]).toMatchObject({ walk: { x: 1, z: 2 }, carry: { x: 3, z: 4 } });
  }
});

test('the result does not alias stored snapshots', () => {
  const grounded = { ...player('a', 10, 0), ground: { bodyId: 'vehicle', localPos: vec3(1, 2, 3) } };
  const buffer = pair([player('a', 0, 0)], [grounded]);
  // Held at the newest, held at the oldest, and blended: all three paths.
  for (const now of [100, 0, (9 + DELAY_TICKS) * TICK_DT]) {
    const first = buffer.sample(now)!;
    const before = structuredClone(first);
    first.vehicle.pos.z = 999;
    first.vehicle.rot.w = 999;
    first.players[0]!.pos.x = 999;
    if (first.players[0]!.ground) first.players[0]!.ground.localPos.x = 999;
    first.players[0]!.ground = { bodyId: 'x', localPos: vec3(0, 0, 0) };
    const second = buffer.sample(now)!;
    expect(second).toEqual(before);
    expect(second.players[0]).not.toBe(first.players[0]);
  }
});

test('an early snapshot moves the clock at once: the view jumps to the new offset in full', () => {
  const buffer = filled([3, 6, 9, 12, 15]);
  const now = 15 * TICK_DT;
  const before = buffer.sample(now)!.vehicle.pos.z;
  // Tick 18 arrives 3 ticks ahead of its time.
  buffer.push(snapshot(18), 15 * TICK_DT);
  expect(buffer.sample(now)!.vehicle.pos.z).toBeCloseTo(before - 3, 6);
});

test('a duplicate tick is ignored and leaves the clock alone', () => {
  const buffer = filled([3, 6, 9, 12, 15, 18]);
  const now = 18 * TICK_DT;
  const before = buffer.sample(now)!.vehicle.pos.z;
  buffer.push(snapshot(18, [player('dup', 0, 0)]), 18 * TICK_DT - 5);
  expect(buffer.sample(now)!.vehicle.pos.z).toBe(before);
  expect(buffer.sample(now)!.players).toEqual([]);
});

test('a rewind (tick goes backwards) is ignored', () => {
  const buffer = filled([3, 6, 9, 12, 15, 18]);
  const now = 18 * TICK_DT;
  const before = buffer.sample(now)!.vehicle.pos.z;
  buffer.push(snapshot(2), 18 * TICK_DT + 0.5);
  expect(buffer.latestTick()).toBe(18);
  expect(buffer.sample(now)!.vehicle.pos.z).toBe(before);
});

test('after a 3 s gap the view holds, then recovers when snapshots resume', () => {
  const buffer = filled([3, 6, 9, 12, 15, 18]);
  expect(buffer.sample(18 * TICK_DT + 3)!.vehicle.pos.z).toBe(-18);
  const resume = 18 + 3 / TICK_DT;
  for (let tick = resume + 3; tick <= resume + 30; tick += 3) buffer.push(snapshot(tick), tick * TICK_DT);
  const last = resume + 30;
  expect(buffer.sample(last * TICK_DT)!.vehicle.pos.z).toBeCloseTo(-(last - DELAY_TICKS), 0);
});

test('player yaw stays in (-pi, pi] after blending', () => {
  const buffer = pair([player('a', 0, 3.1)], [player('a', 0, -3.1)]);
  for (const tick of [7, 8, 9, 10, 11]) {
    const yaw = buffer.sample((tick + DELAY_TICKS) * TICK_DT)!.players[0]!.yaw;
    expect(yaw).toBeGreaterThan(-Math.PI);
    expect(yaw).toBeLessThanOrEqual(Math.PI);
  }
});

const prop = (id: string, x: number): PropSnapshot => ({ id, kind: 'crate', pos: vec3(x, 0.3, 0), rot: quatFromAxisAngle(AXIS_Y, 0) });

test('a partial snapshot is merged into the props already known', () => {
  const buffer = createSnapshotBuffer();
  buffer.push(snapshot(3, [], [prop('a', 1), prop('b', 2)], true), 3 * TICK_DT);
  buffer.push(snapshot(6, [], [prop('b', 5)]), 6 * TICK_DT);
  const props = buffer.sample(100)!.props;
  expect(props.map((p) => [p.id, p.pos.x])).toEqual([['a', 1], ['b', 5]]);
  expect(buffer.latestProps().map((p) => [p.id, p.pos.x])).toEqual([['a', 1], ['b', 5]]);
});

test('a prop is blended between its two positions', () => {
  const buffer = createSnapshotBuffer();
  buffer.push(snapshot(3, [], [prop('a', 0)], true), 3 * TICK_DT);
  buffer.push(snapshot(6, [], [prop('a', 6)]), 6 * TICK_DT);
  // The view is at tick 4.5, halfway between the two.
  const props = buffer.sample(10.5 * TICK_DT)!.props;
  expect(props).toHaveLength(1);
  expect(props[0]!.pos.x).toBeCloseTo(3, 6);
});

test('a prop that did not move is drawn where it was told', () => {
  const buffer = createSnapshotBuffer();
  buffer.push(snapshot(3, [], [prop('a', 1), prop('b', 2)], true), 3 * TICK_DT);
  buffer.push(snapshot(6, [], [prop('b', 4)]), 6 * TICK_DT);
  const props = buffer.sample(10.5 * TICK_DT)!.props;
  expect(props.find((p) => p.id === 'a')!.pos.x).toBe(1);
  expect(props.find((p) => p.id === 'b')!.pos.x).toBeCloseTo(3, 6);
});

test('a full snapshot replaces the props: one missing from it is gone', () => {
  const buffer = createSnapshotBuffer();
  buffer.push(snapshot(3, [], [prop('a', 1), prop('b', 2)], true), 3 * TICK_DT);
  buffer.push(snapshot(6, [], [prop('b', 3)], true), 6 * TICK_DT);
  expect(buffer.latestProps().map((p) => p.id)).toEqual(['b']);
  expect(buffer.sample(100)!.props.map((p) => p.id)).toEqual(['b']);
});

test('copies the health and the downed timer of a player', () => {
  const hurt: PlayerSnapshot = { ...player('a', 0, 0), health: 37, downed: 12.5 };
  const buffer = pair([player('a', 0, 0)], [hurt]);
  const view = buffer.sample((9 + DELAY_TICKS) * TICK_DT)!;
  expect(view.players[0]!.health).toBe(37);
  expect(view.players[0]!.downed).toBe(12.5);
});

test('before any snapshot there are no props', () => {
  expect(createSnapshotBuffer().latestProps()).toEqual([]);
});

test('copies the inventory, slot and hold of a player and the fuel and health of the vehicle', () => {
  const holding: PlayerSnapshot = {
    ...player('a', 0, 0),
    inventory: ['jerrycan', null, 'toolbox'],
    slot: 2,
    hold: { action: 'useItem', targetId: 'vehicle', progress: 0.5 },
  };
  const buffer = pair([player('a', 0, 0)], [holding]);
  const view = buffer.sample((9 + DELAY_TICKS) * TICK_DT)!;
  expect(view.players[0]!.inventory).toEqual(['jerrycan', null, 'toolbox']);
  expect(view.players[0]!.slot).toBe(2);
  expect(view.players[0]!.hold).toEqual({ action: 'useItem', targetId: 'vehicle', progress: 0.5 });
  expect(view.players[0]!.inventory).not.toBe(holding.inventory);
  expect(view.players[0]!.hold).not.toBe(holding.hold);
  expect(view.vehicle.fuel).toBe(1);
  expect(view.vehicle.health).toBe(1);
});

test('latestStatus is null before any snapshot and then the newest snapshot\'s fields', () => {
  expect(createSnapshotBuffer().latestStatus()).toBeNull();
  const buffer = createSnapshotBuffer();
  buffer.push(snapshot(3), 0);
  buffer.push({ ...snapshot(6), checkpoint: 1, restarts: 2, respawns: 3, won: true, wallet: 1, coinsCollected: 2, coinsTotal: 2, assisted: true }, 0.05);
  expect(buffer.latestStatus()).toEqual({ elapsed: 6 / 60, checkpoint: 1, checkpointCount: 2, restarts: 2, respawns: 3, won: true, wallet: 1, coinsCollected: 2, coinsTotal: 2, assisted: true });
  buffer.push(snapshot(4), 0.06);
  expect(buffer.latestStatus()?.elapsed).toBe(6 / 60);
});

test('latestCoinsLeft is empty before any snapshot, then the newest snapshot\'s ids as a copy', () => {
  const buffer = createSnapshotBuffer();
  expect(buffer.latestCoinsLeft()).toEqual([]);
  buffer.push(snapshot(3), 0);
  buffer.push({ ...snapshot(6), coinsLeft: ['coin-2'] }, 0.05);
  const left = buffer.latestCoinsLeft();
  expect(left).toEqual(['coin-2']);
  left.push('x');
  expect(buffer.latestCoinsLeft()).toEqual(['coin-2']);
});
