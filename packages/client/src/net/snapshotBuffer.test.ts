import {
  AXIS_Y,
  INTERPOLATION_DELAY,
  SNAPSHOT_BUFFER_SIZE,
  TICK_DT,
  quatFromAxisAngle,
  vec3,
  yawOf,
  type WorldSnapshot,
} from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createSnapshotBuffer } from './snapshotBuffer';

// A snapshot at `tick` whose vehicle sits at z = -tick, has yaw tick / 100 and throttle tick.
const snapshot = (tick: number): WorldSnapshot => ({
  tick,
  vehicle: {
    pos: vec3(0, 1, -tick),
    rot: quatFromAxisAngle(AXIS_Y, tick / 100),
    linvel: vec3(0, 0, -tick),
    throttle: tick,
    steer: 0,
  },
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
  expect(buffer.sample(18 * TICK_DT)!.pos.z).toBeCloseTo(-12, 6);
  // Half a tick-pair later the view is halfway between ticks 12 and 15.
  const between = buffer.sample(19.5 * TICK_DT)!;
  expect(between.pos.z).toBeCloseTo(-13.5, 6);
  expect(between.linvel.z).toBeCloseTo(-13.5, 6);
  expect(yawOf(between.rot)).toBeCloseTo(0.135, 4);
  expect(between.throttle).toBe(15);
  expect(buffer.latestTick()).toBe(18);
});

test('the same latency on every snapshot does not change what is drawn', () => {
  const buffer = filled([3, 6, 9, 12, 15, 18], 0.25);
  expect(buffer.sample(18 * TICK_DT + 0.25)!.pos.z).toBeCloseTo(-12, 6);
});

test('holds the newest snapshot when none has arrived for a while', () => {
  const buffer = filled([3, 6, 9]);
  expect(buffer.sample(9 * TICK_DT + INTERPOLATION_DELAY + 1)!.pos.z).toBe(-9);
});

test('holds the oldest snapshot when the view is still before it', () => {
  const buffer = filled([30]);
  expect(buffer.sample(30 * TICK_DT)!.pos.z).toBe(-30);
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
  const drawn = buffer.sample(18 * TICK_DT + 0.08)!.pos.z;
  // On time the view would be at tick 16.8 (0.08 s is 4.8 ticks after tick 12).
  expect(drawn).toBeLessThan(-16.3);
  expect(drawn).toBeGreaterThan(-16.8 - 0.001);
});

test('a lasting delay is followed within a few seconds', () => {
  const buffer = filled([3, 6, 9, 12, 15]);
  // From tick 18 on, everything arrives 0.2 s later than before.
  for (let tick = 18; tick <= 18 + 3 * 100; tick += 3) buffer.push(snapshot(tick), tick * TICK_DT + 0.2);
  const lastTick = 18 + 3 * 100;
  const drawn = buffer.sample(lastTick * TICK_DT + 0.2)!.pos.z;
  expect(drawn).toBeCloseTo(-(lastTick - INTERPOLATION_DELAY / TICK_DT), 0);
});

test('keeps only the newest snapshots', () => {
  const ticks = Array.from({ length: SNAPSHOT_BUFFER_SIZE + 10 }, (_, index) => (index + 1) * 3);
  const buffer = filled(ticks);
  // A view from long ago lands on the oldest snapshot still held, which is the 11th pushed.
  expect(buffer.sample(0)!.pos.z).toBe(-33);
});
