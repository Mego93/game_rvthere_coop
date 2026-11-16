import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { getVehicleConfig, VEHICLES, type VehicleId } from '../vehicles';
import { createWorld } from '../world';
import { buildCourse } from './build';
import { driveRun } from './driveRig';
import { getCourse, getCourseDef, segmentRanges } from './index';
import { marrakech } from './marrakech';

// The shared package has no DOM or Node typings.
declare const console: { info(...args: unknown[]): void };
declare const performance: { now(): number };
declare const process: { env: Record<string, string | undefined> };

beforeAll(async () => {
  await RAPIER.init();
});

const def = getCourseDef('marrakech')!;
const FULL = process.env.MARRAKECH_FULL === '1';
const fuelIndexes = def.segments.flatMap((s, i) => (s.type === 'road' && s.stop?.kind === 'fuel' ? [i] : []));
// The RV cannot climb the bank unaided and roadworks need a push: both are teleported over, as in the airport measurements.
const skips = (vehicleId: string): Set<number> => new Set(def.segments.flatMap((s, i) => (s.type === 'roadworks' || (s.type === 'bank' && vehicleId === 'rv') ? [i] : [])));

type Leg = [from: number, to: number];

// From stop segment `a` to the end of the next stop segment `b`, split around the skipped segments.
function legs(vehicleId: string, a: number, b: number): Leg[] {
  const skipped = skips(vehicleId);
  const out: Leg[] = [];
  let from = a;
  for (let i = a + 1; i <= b + 1; i++) {
    if (skipped.has(i)) {
      if (i > from) out.push([from, i]);
      from = i + 1;
    }
  }
  if (from <= b) out.push([from, b + 1]);
  return out;
}

function burn(vehicleId: string, [from, to]: Leg): number {
  const result = driveRun(RAPIER, vehicleId, getCourse('marrakech'), from, to);
  const last = result.trace[result.trace.length - 1]!;
  const end = last.fuel - getVehicleConfig(vehicleId as VehicleId).fuelBurn * (result.seconds - last.t);
  expect(result.reached, `${vehicleId} leg ${from}->${to} reached`).toBe(true);
  return 1 - end;
}

// A stop fills the tank, so a gap starts full. The RV burns about half a tank per km, so a 1 km gap from half a tank cannot leave 20 %.
export const START_FUEL = 1;
const ranges = segmentRanges(def);

// Fuel left at the middle of stop segment `b` after leaving the middle of stop segment `a`. The legs run from `a`'s spawn to the end of `b`, so the burn is scaled to the real distance between the two stops (skipped segments count in neither).
function gapLeft(vehicleId: string, a: number, b: number): number {
  const skipped = skips(vehicleId);
  const span = (from: number, to: number): number => ranges.slice(from, to).reduce((sum, r, i) => sum + (skipped.has(from + i) ? 0 : r.to - r.from), 0);
  const driven = span(a, b + 1) - 8;
  const real = span(a + 1, b) + (ranges[a]!.to - ranges[a]!.from) / 2 + (ranges[b]!.to - ranges[b]!.from) / 2;
  const burned = legs(vehicleId, a, b).reduce((sum, leg) => sum + burn(vehicleId, leg), 0);
  return START_FUEL - (burned * real) / driven;
}

const pairs = fuelIndexes.slice(0, -1).map((a, n) => [a, fuelIndexes[n + 1]!] as const);
// The sampled gaps: the longest, the one holding the ford group, the first and the last.
const sampled = new Set<number>();
{
  const length = (n: number) => def.segments.slice(pairs[n]![0], pairs[n]![1] + 1).reduce((sum, s) => sum + ('length' in s ? s.length : 40), 0);
  let longest = 0;
  pairs.forEach((_, n) => length(n) > length(longest) && (longest = n));
  sampled.add(longest);
  sampled.add(0);
  sampled.add(pairs.length - 1);
  const ford = def.segments.findIndex((s) => s.type === 'ford');
  const holding = pairs.findIndex(([a, b]) => a <= ford && ford <= b);
  if (holding >= 0) sampled.add(holding);
}

describe.each(Object.keys(VEHICLES))('T7 fuel gaps, %s', (vehicleId) => {
  const picks = pairs.map((p, n) => ({ n, p })).filter(({ n }) => FULL || sampled.has(n));
  test.each(picks)('gap $n leaves at least 20 % from a full tank', ({ n, p }) => {
    const left = gapLeft(vehicleId, p[0], p[1]);
    console.info(`T7 ${vehicleId} gap ${n} (segments ${p[0]}->${p[1]}): ${(100 * left).toFixed(1)} % left`);
    expect(left).toBeGreaterThanOrEqual(0.2);
  }, 240_000);
});

describe('T9 size and speed of the built course', () => {
  test('buildCourse is under 3 s and has at most 9000 ground boxes', () => {
    const start = performance.now();
    const built = buildCourse(marrakech);
    const ms = performance.now() - start;
    console.info(`T9 buildCourse(marrakech): ${ms.toFixed(0)} ms, ${built.ground.length} ground boxes, ${built.checkpoints.length} checkpoints, ${built.props.length} props, ${built.coins.length} coins, ${built.decor.length} decor`);
    expect(ms).toBeLessThan(3000);
    expect(built.ground.length).toBeLessThanOrEqual(9000);
  });

  test('a world is created and one step after that takes under 50 ms', () => {
    const t0 = performance.now();
    const world = createWorld(RAPIER, { courseId: 'marrakech', vehicleId: 'lodgy' });
    const created = performance.now() - t0;
    world.addPlayer('p0');
    world.step(new Map());
    const t1 = performance.now();
    world.step(new Map());
    const stepped = performance.now() - t1;
    world.dispose();
    console.info(`T9 createWorld(marrakech): ${created.toFixed(0)} ms; one step: ${stepped.toFixed(1)} ms`);
    expect(stepped).toBeLessThan(50);
  });
});
