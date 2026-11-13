import {
  AXIS_Y,
  INTERPOLATION_DELAY,
  SNAPSHOT_BUFFER_SIZE,
  TICK_DT,
  quatFromAxisAngle,
  vec3,
  yawOf,
  type PlayerSnapshot,
  type WorldSnapshot,
} from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createSnapshotBuffer } from './snapshotBuffer';

// A snapshot at `tick` whose vehicle sits at z = -tick, has yaw tick / 100 and throttle tick.
const snapshot = (tick: number, players: PlayerSnapshot[] = []): WorldSnapshot => ({
  tick,
  vehicle: {
    pos: vec3(0, 1, -tick),
    rot: quatFromAxisAngle(AXIS_Y, tick / 100),
    linvel: vec3(0, 0, -tick),
    throttle: tick,
    steer: 0,
  },
  players,
});

// Snapshots every 3 ticks, each arriving exactly when the server's clock reads its tick time plus `latency`.
function filled(ticks: number[], latency = 0) {
  const buffer = createSnapshotBuffer();
  for (const tick of ticks) buffer.push(snapshot(tick), tick * TICK_DT + latency);
  return buffer;
}

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
  ground: null,
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
