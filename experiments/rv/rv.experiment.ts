import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, test } from 'vitest';
import { getCourse } from '../../packages/shared/src/courses';
import { airport } from '../../packages/shared/src/courses/airport';
import { driveRun, driveSegment, type DriveTrace } from '../../packages/shared/src/courses/driveRig';

// Measures the Lodgy and the RV on course 1 with the one drive controller; nothing is tuned per vehicle.

beforeAll(async () => {
  await RAPIER.init();
});

const course = getCourse('airport');
const SAND = airport.segments.findIndex((s) => s.type === 'sand');
const FORD = airport.segments.findIndex((s) => s.type === 'ford');
const BANK = airport.segments.findIndex((s) => s.type === 'bank');
const VEHICLES = ['lodgy', 'rv'] as const;
const fmt = (n: number, unit: string) => `${n.toFixed(1)} ${unit}`;

// The trace is sampled every 0.5 s, so the crossing is interpolated linearly between samples.
function timeToSpeed(trace: DriveTrace[], target: number): number | null {
  for (let i = 1; i < trace.length; i++) {
    const a = trace[i - 1]!;
    const b = trace[i]!;
    if (b.speed >= target) return a.speed >= target ? a.t : a.t + ((target - a.speed) / (b.speed - a.speed)) * (b.t - a.t);
  }
  return null;
}

function measure(vehicle: string): string[] {
  // Segments 0 and 1 as one run: checkpoint 0's spawn to checkpoint 2's trigger.
  const road = driveRun(RAPIER, vehicle, course, 0, 2);
  const topSpeed = Math.max(...road.trace.map((p) => p.speed), road.endSpeed);
  const to10 = timeToSpeed(road.trace, 10);
  // The sand segment ends at the next checkpoint's trigger; the speed is read on the tick the centre enters it.
  const sand = driveRun(RAPIER, vehicle, course, SAND - 1, SAND + 1);
  const ford = driveSegment(RAPIER, vehicle, course, FORD);
  const bank = driveSegment(RAPIER, vehicle, course, BANK);
  return [
    fmt(topSpeed, 'm/s'),
    to10 === null ? 'never' : fmt(to10, 's'),
    sand.reached ? fmt(sand.endSpeed, 'm/s') : 'fails',
    ford.reached ? fmt(ford.seconds, 's') : 'fails',
    bank.reached ? fmt(bank.seconds, 's') : 'fails',
  ];
}

test('RV and Lodgy on the airport', () => {
  const header = ['vehicle', 'top speed (seg 0-1)', 'time to 10 m/s', 'sand exit speed', `ford time (seg ${FORD})`, `bank time (seg ${BANK})`];
  const rows = VEHICLES.map((v) => [v, ...measure(v)]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (r: string[]) => r.map((c, i) => c.padEnd(widths[i]!)).join(' | ');
  console.log(['', line(header), widths.map((w) => '-'.repeat(w)).join('-+-'), ...rows.map(line)].join('\n'));
}, 600_000);
