import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import type { SnapshotMessage } from '../protocol';
import { getVehicleConfig, VEHICLE_IDS, type VehicleId } from '../vehicles';
import { createWorld } from '../world';
import { airport } from './airport';
import { driveRun } from './driveRig';
import { getCourse } from './index';

// The shared package has no DOM or Node typings.
declare const console: { info(...args: unknown[]): void };
declare const performance: { now(): number };

beforeAll(async () => {
  await RAPIER.init();
});

const course = getCourse('airport');
const FUEL_SEGMENT = airport.segments.findIndex((s) => s.stop?.kind === 'fuel');
const BANK = airport.segments.findIndex((s) => s.type === 'bank');
const ROADWORKS = airport.segments.findIndex((s) => s.type === 'roadworks');
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

describe.each(VEHICLE_IDS)('C5 fuel margins, %s', (vehicleId) => {
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

  const messageSize = (full: boolean) => {
    const world = sixPlayerWorld();
    for (let i = 0; i < 20; i++) world.step(new Map());
    const snapshot = world.snapshot();
    const message: SnapshotMessage = { type: 'snapshot', ...snapshot, props: full ? snapshot.props : [], ackSeq: 0, full };
    world.dispose();
    return { bytes: JSON.stringify(message).length, props: message.props.length }; // ASCII only, so characters equal bytes
  };

  test('the steady-state snapshot (no moved props, as the room sends after a first one) is under 4096 bytes', () => {
    const { bytes } = messageSize(false);
    console.info(`C6 steady-state snapshot (JSON text, props: [], full: false): ${bytes} bytes`);
    expect(bytes).toBeLessThan(4096);
  });

  test('the full snapshot (all props, as sent on join) is under 16384 bytes', () => {
    const { bytes, props } = messageSize(true);
    console.info(`C6 full snapshot (JSON text, ${props} props, full: true): ${bytes} bytes`);
    expect(bytes).toBeLessThan(16384);
  });

  test('world.step averages under 4 ms over 300 ticks', () => {
    const world = sixPlayerWorld();
    for (let i = 0; i < 20; i++) world.step(new Map());
    const start = performance.now();
    for (let i = 0; i < 300; i++) world.step(new Map());
    const average = (performance.now() - start) / 300;
    world.dispose();
    console.info(`C6 world.step with 6 players: ${average.toFixed(3)} ms per tick`);
    expect(average).toBeLessThan(4);
  });
});
