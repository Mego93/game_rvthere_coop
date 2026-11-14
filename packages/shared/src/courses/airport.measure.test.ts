import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import type { SnapshotMessage } from '../protocol';
import { getVehicleConfig, VEHICLES, type VehicleId } from '../vehicles';
import { createWorld } from '../world';
import { driveRun } from './driveRig';
import { getCourse } from './index';

// The shared package has no DOM or Node typings.
declare const console: { info(...args: unknown[]): void };
declare const performance: { now(): number };

beforeAll(async () => {
  await RAPIER.init();
});

const course = getCourse('airport');
const FUEL_SEGMENT = 3;
const BANK = 8;
const ROADWORKS = 10;
const LAST = course.checkpoints.length - 1;

type Leg = [from: number, to: number | 'finish'];

// Fuel burned over one leg started with a full tank; the trace is sampled twice a second, so the tail is added from the burn rate (throttle is always full).
function burn(vehicleId: string, [from, to]: Leg): number {
  const result = driveRun(RAPIER, vehicleId, course, from, to);
  const last = result.trace[result.trace.length - 1]!;
  const end = last.fuel - getVehicleConfig(vehicleId as VehicleId).fuelBurn * (result.seconds - last.t);
  expect(result.reached, `${vehicleId} leg ${from}->${to} reached`).toBe(true);
  return 1 - end;
}

// Legs are driven separately and their burns summed; skipped segments (bank for the RV, roadworks for both) are teleported over and burn nothing.
function legsFor(vehicleId: string, finish: 'toStop' | 'toFinish'): Leg[] {
  if (finish === 'toStop') return [[0, FUEL_SEGMENT]];
  const rv = vehicleId === 'rv';
  return rv
    ? [[FUEL_SEGMENT, BANK], [BANK + 1, ROADWORKS], [ROADWORKS + 1, 'finish']]
    : [[FUEL_SEGMENT, ROADWORKS], [ROADWORKS + 1, 'finish']];
}

describe.each(Object.keys(VEHICLES))('C5 fuel margins, %s', (vehicleId) => {
  test('start to the checkpoint trigger of the fuel segment leaves more than 20%', () => {
    const legs = legsFor(vehicleId, 'toStop');
    const burns = legs.map((leg) => burn(vehicleId, leg));
    const total = burns.reduce((a, b) => a + b, 0);
    console.info(`C5 ${vehicleId} start->segment ${FUEL_SEGMENT} trigger: burns ${burns.map((b) => b.toFixed(4)).join(', ')}; fuel left ${(100 * (1 - total)).toFixed(1)}%`);
    expect(1 - total).toBeGreaterThan(0.2);
  }, 240_000);

  test('the fuel segment spawn to the finish leaves more than 5%', () => {
    const legs = legsFor(vehicleId, 'toFinish');
    const burns = legs.map((leg) => burn(vehicleId, leg));
    const total = burns.reduce((a, b) => a + b, 0);
    console.info(`C5 ${vehicleId} segment ${FUEL_SEGMENT}->finish legs ${legs.map((l) => l.join('->')).join(' | ')}: burns ${burns.map((b) => b.toFixed(4)).join(', ')}; fuel left ${(100 * (1 - total)).toFixed(1)}%`);
    expect(1 - total).toBeGreaterThan(0.05);
  }, 480_000);
});

describe('C6 snapshot size and tick cost with 6 players', () => {
  const sixPlayerWorld = () => {
    const world = createWorld(RAPIER, { courseId: 'airport', vehicleId: 'lodgy' });
    for (let i = 0; i < 6; i++) world.addPlayer(`p${i}`);
    return world;
  };

  const messageSize = (props: SnapshotMessage['props'], full: boolean) => {
    const world = sixPlayerWorld();
    for (let i = 0; i < 20; i++) world.step(new Map());
    const snapshot = world.snapshot();
    const message: SnapshotMessage = { type: 'snapshot', ...snapshot, props: props.length ? snapshot.props : props, ackSeq: 0, full };
    return JSON.stringify(message).length; // ASCII only, so characters equal bytes
  };

  test('the steady-state snapshot (no moved props, as the room sends after a first one) is under 4096 bytes', () => {
    const bytes = messageSize([], false);
    console.info(`C6 steady-state snapshot (JSON text, props: [], full: false): ${bytes} bytes`);
    expect(bytes).toBeLessThan(4096);
  });

  test('the full snapshot (all props, as sent on join) is under 12288 bytes', () => {
    const world = sixPlayerWorld();
    for (let i = 0; i < 20; i++) world.step(new Map());
    const bytes = messageSize(world.snapshot().props, true);
    console.info(`C6 full snapshot (JSON text, ${world.snapshot().props.length} props, full: true): ${bytes} bytes`);
    expect(bytes).toBeLessThan(12288);
  });

  test('world.step averages under 4 ms over 300 ticks', () => {
    const world = sixPlayerWorld();
    for (let i = 0; i < 20; i++) world.step(new Map());
    const start = performance.now();
    for (let i = 0; i < 300; i++) world.step(new Map());
    const average = (performance.now() - start) / 300;
    console.info(`C6 world.step with 6 players: ${average.toFixed(3)} ms per tick`);
    expect(average).toBeLessThan(4);
  });
});
