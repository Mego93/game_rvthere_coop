import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { TICK_RATE } from '../constants';
import { rotate, vec3 } from '../math';
import { exitPoints } from '../seats';
import type { SegmentDef } from '../segments';
import { createWorld, type World } from '../world';
import { alongOf, alongOfPoint, driveWorld, segmentRouteLength, segmentStarts } from './driveRig';
import { getCourse, getCourseDef } from './index';
import { CREST_AND_PULL, PIT_GAUNTLET, RUBBLE_RUN } from './parkour';
import { boardVehicle, exitVehicle, pushAside } from './soloRig';

// The shared package has no DOM or Node typings.
declare const console: { info(...args: unknown[]): void };

beforeAll(async () => {
  await RAPIER.init();
});

const PLAYER = 'p1';
const def = getCourseDef('marrakech')!;
const course = getCourse('marrakech');
const starts = segmentStarts(course);
const routeLength = course.route.slice(1).reduce((sum, [x, z], i) => sum + Math.hypot(x - course.route[i]![0], z - course.route[i]![1]), 0);
const SECTIONS: Record<string, SegmentDef[]> = { RUBBLE_RUN, CREST_AND_PULL, PIT_GAUNTLET };
const firstOf = (defs: SegmentDef[]): number => def.segments.findIndex((_, i) => defs.every((d, k) => JSON.stringify(def.segments[i + k]) === JSON.stringify(d)));
// The same allowance as marrakech.drive.test.ts (A9): twice the target time shared out by length, plus 20 s.
const allowedSeconds = (length: number): number => (2 * course.targetTime * length) / routeLength + 20;

function soloAt(vehicleId: string, segment: number): World {
  const world = createWorld(RAPIER, { courseId: 'marrakech', vehicleId });
  world.addPlayer(PLAYER);
  const spawn = course.checkpoints[segment]!.spawn;
  world.debugVehicle().resetTo(spawn, 1, 1);
  const config = world.vehicleConfig;
  const lift = rotate(spawn.rot, vec3(0, config.rideHeight, 0));
  const [door] = exitPoints(config, config.seats[0]!, vec3(spawn.pos.x + lift.x, spawn.pos.y + lift.y, spawn.pos.z + lift.z), spawn.rot);
  world.teleportPlayer(PLAYER, vec3(door.x, door.y + 0.2, door.z));
  for (let i = 0; i < 30; i++) world.step(new Map());
  if (!boardVehicle(world, PLAYER)) throw new Error(`the driver cannot board at segment ${segment}`);
  return world;
}

const propsOf = (segment: number, kind: string): string[] => course.props.filter((p) => p.id.startsWith(`s${segment}-${kind}-`)).map((p) => p.id);
const propDef = (id: string) => course.props.find((p) => p.id === id)!;
const dirOf = (id: string, local: [number, number, number]) => {
  const v = rotate(propDef(id).pose.rot, vec3(...local));
  return { x: v.x, z: v.z };
};

// As the airport and A9 drives do: the driver brakes before the roadblock, gets out, pushes its middle barrier forward then aside, and boards again.
function openRoadblock(world: World, segment: number): void {
  const middle = propsOf(segment, 'barrier')[1]!;
  const middlePos = propDef(middle).pose.pos;
  const approach = driveWorld(world, PLAYER, alongOfPoint(course, middlePos.x, middlePos.z) - 50, { timeoutTicks: 120 * TICK_RATE });
  if (!approach.reached) throw new Error(`the approach to the roadblock stopped at ${approach.along.toFixed(0)} m`);
  exitVehicle(world, PLAYER);
  pushAside(world, PLAYER, middle, dirOf(middle, [0, 0, -1]), dirOf(middle, [1, 0, 0]), 3, 3.5);
  if (!boardVehicle(world, PLAYER)) throw new Error('the driver cannot board after opening the roadblock');
}

// One drive from the section's first spawn to the start of the segment after it, with a full tank; no restart and no respawn may happen on the way.
function driveSection(vehicleId: string, defs: SegmentDef[]): { reached: boolean; seconds: number; allowed: number; restarts: number; respawns: number; detail: string } {
  const first = firstOf(defs);
  const last = first + defs.length - 1;
  const world = soloAt(vehicleId, first);
  const until = last === def.segments.length - 1 ? Infinity : alongOf(course, { leg: starts[last + 1]!, t: 0 });
  const length = Array.from({ length: defs.length }, (_, k) => segmentRouteLength(course, first + k)).reduce((a, b) => a + b, 0);
  const allowed = allowedSeconds(length);
  const roadblock = defs.findIndex((d) => d.type === 'road' && d.hazards?.[0]?.kind === 'roadblock');
  if (roadblock >= 0) openRoadblock(world, first + roadblock);
  const result = driveWorld(world, PLAYER, until, { timeoutTicks: Math.ceil(allowed * TICK_RATE) });
  const status = world.status();
  const seconds = result.ticks / TICK_RATE;
  const detail = `${vehicleId} ${first}..${last} (${length.toFixed(0)} m): ${seconds.toFixed(1)} s of ${allowed.toFixed(1)} s, restarts ${status.restarts}, respawns ${status.respawns}, along ${result.along.toFixed(0)} of ${until.toFixed(0)}`;
  world.dispose();
  return { reached: result.reached, seconds, allowed, restarts: status.restarts, respawns: status.respawns, detail };
}

// Plan test 3 (P11): the Lodgy drives every section without the winch; the RV drives RUBBLE_RUN, pushing the roadblock's middle barrier aside by hand.
// The RV on the deep pit and the big hill needs the winch; those two RV drives are not run here (see the task report).
const cases: [string, string][] = [
  ['lodgy', 'RUBBLE_RUN'],
  ['lodgy', 'CREST_AND_PULL'],
  ['lodgy', 'PIT_GAUNTLET'],
  ['rv', 'RUBBLE_RUN'],
];

describe('28d the parkour sections are driven start to end', () => {
  test.each(cases)('the %s drives %s within the allowed time with no restart or respawn', (vehicleId, name) => {
    const outcome = driveSection(vehicleId, SECTIONS[name]!);
    console.info(`28d ${outcome.reached ? 'ok' : 'FAIL'}: ${name} ${outcome.detail}`);
    expect(outcome.reached, outcome.detail).toBe(true);
    expect(outcome.restarts, outcome.detail).toBe(0);
    expect(outcome.respawns, outcome.detail).toBe(0);
  }, 300_000);
});
