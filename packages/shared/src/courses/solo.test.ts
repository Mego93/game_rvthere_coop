import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { TICK_RATE } from '../constants';
import { rotate, vec3, type Vec3 } from '../math';
import { exitPoints } from '../seats';
import { VEHICLES } from '../vehicles';
import { createWorld, type World } from '../world';
import { airport } from './airport';
import { alongOfPoint, driveWorld } from './driveRig';
import { getCourse } from './index';
import { boardVehicle, exitVehicle, pushAside } from './soloRig';

beforeAll(async () => {
  await RAPIER.init();
});

const course = getCourse('airport');
const PLAYER = 'p1';
const segmentOf = (type: string) => airport.segments.findIndex((s) => s.type === type);
const prop = (world: World, id: string): Vec3 => world.snapshot().props.find((p) => p.id === id)!.pos;
const propDef = (id: string) => course.props.find((p) => p.id === id)!;
const alongOfProp = (id: string): number => alongOfPoint(course, propDef(id).pose.pos.x, propDef(id).pose.pos.z);

// One player seated in the driver seat of a real world, the vehicle put at a segment's spawn.
function soloAt(vehicleId: string, segment: number, fuel = 1): World {
  const world = createWorld(RAPIER, { courseId: 'airport', vehicleId });
  world.addPlayer(PLAYER);
  const spawn = course.checkpoints[segment]!.spawn;
  world.debugVehicle().resetTo(spawn, fuel, 1);
  const config = world.vehicleConfig;
  const lift = rotate(spawn.rot, vec3(0, config.rideHeight, 0));
  const [door] = exitPoints(config, config.seats[0]!, vec3(spawn.pos.x + lift.x, spawn.pos.y + lift.y, spawn.pos.z + lift.z), spawn.rot);
  world.teleportPlayer(PLAYER, vec3(door.x, door.y + 0.2, door.z));
  for (let i = 0; i < 30; i++) world.step(new Map());
  expect(boardVehicle(world, PLAYER), 'the driver boards').toBe(true);
  return world;
}

// The most any of the props has moved from where it stood when the watch began, sampled every 6 ticks.
function watchProps(world: World, ids: string[]): { stop: () => boolean; moved: () => number } {
  const starts = new Map(ids.map((id) => [id, { ...prop(world, id) }] as const));
  let worst = 0;
  let n = 0;
  return {
    stop() {
      if (n++ % 6 === 0) {
        for (const id of ids) {
          const at = prop(world, id);
          const start = starts.get(id)!;
          worst = Math.max(worst, Math.hypot(at.x - start.x, at.y - start.y, at.z - start.z));
        }
      }
      return false;
    },
    moved: () => worst,
  };
}

const hazardSegment = (kind: string): number => airport.segments.findIndex((s) => s.type === 'road' && s.hazards?.some((h) => h.kind === kind));
const propsOf = (segment: number, kind: string): string[] => course.props.filter((p) => p.id.startsWith(`s${segment}-${kind}-`)).map((p) => p.id);
const GATES = hazardSegment('gates');
const CRATE_WALL = hazardSegment('crateWall');
const ROADBLOCK = hazardSegment('roadblock');
const ROADWORKS = segmentOf('roadworks');
// The crate wall's six crates are placed after the segment's debris crates.
const wallCrates = propsOf(CRATE_WALL, 'crate').slice(-6);
const gateBarriers = propsOf(GATES, 'barrier');
const roadblockBarriers = propsOf(ROADBLOCK, 'barrier');
const roadworksBarriers = propsOf(ROADWORKS, 'barrier');

// Drive stops this far before a barrier row so the walk is short and the braking distance is clear.
const STOP_BEFORE = 50;

const forwardOf = (id: string) => {
  const f = rotate(propDef(id).pose.rot, vec3(0, 0, -1));
  return { x: f.x, z: f.z };
};
const rightOf = (id: string) => {
  const r = rotate(propDef(id).pose.rot, vec3(1, 0, 0));
  return { x: r.x, z: r.z };
};

// The solo player drives to a row, gets out, pushes the middle barrier of each row out of the way, and gets back in.
function openRows(world: World, rows: string[][]): void {
  const first = rows[0]![1]!;
  const driven = driveWorld(world, PLAYER, alongOfProp(first) - STOP_BEFORE, { timeoutTicks: 120 * TICK_RATE });
  expect(driven.reached, `drive to the row, at ${driven.along.toFixed(0)} m`).toBe(true);
  exitVehicle(world, PLAYER);
  for (const row of rows) {
    const middle = row[1]!;
    const end = pushAside(world, PLAYER, middle, forwardOf(middle), rightOf(middle), 3, 3.5);
    const start = propDef(middle).pose.pos;
    expect(Math.hypot(end.x - start.x, end.z - start.z), `${middle} pushed out of its row`).toBeGreaterThan(4);
  }
  expect(boardVehicle(world, PLAYER), 'the driver boards again').toBe(true);
}

describe.each(Object.keys(VEHICLES))('A8 the %s alone passes the hazards', (vehicleId) => {
  test('gates: no barrier moves more than 0.05 m', () => {
    const world = soloAt(vehicleId, GATES);
    const watch = watchProps(world, gateBarriers);
    const last = gateBarriers[gateBarriers.length - 1]!;
    const result = driveWorld(world, PLAYER, alongOfProp(last) + 15, { timeoutTicks: 90 * TICK_RATE, stop: watch.stop });
    expect(result.reached, `stopped at ${result.along.toFixed(0)} m`).toBe(true);
    expect(watch.moved()).toBeLessThan(0.05);
    world.dispose();
  }, 120_000);

  test('crate wall: passed on the left without moving a crate', () => {
    const world = soloAt(vehicleId, CRATE_WALL);
    const watch = watchProps(world, wallCrates);
    const result = driveWorld(world, PLAYER, alongOfProp(wallCrates[0]!) + 15, { timeoutTicks: 90 * TICK_RATE, stop: watch.stop });
    expect(result.reached, `stopped at ${result.along.toFixed(0)} m`).toBe(true);
    expect(watch.moved()).toBeLessThan(0.05);
    world.dispose();
  }, 120_000);

  test('roadblock: one player on foot pushes a barrier open, then the vehicle passes', () => {
    const world = soloAt(vehicleId, ROADBLOCK);
    openRows(world, [roadblockBarriers]);
    const result = driveWorld(world, PLAYER, alongOfProp(roadblockBarriers[1]!) + 20, { timeoutTicks: 60 * TICK_RATE });
    expect(result.reached, `stopped at ${result.along.toFixed(0)} m`).toBe(true);
    world.dispose();
  }, 120_000);
});

// A9. The Lodgy, a full tank, one player, the whole airport in one world with real props. Scripts, in the order the route meets them:
//  - road, crate wall, gates, stops, sand, ford, slope: driven straight through with the pursuit controller (the fuel and garage stops are driven past).
//  - bank: climbed by the Lodgy unaided.
//  - roadworks: the driver brakes 50 m before the first row, gets out, pushes the middle barrier of the first row forward 3 m then right 3.5 m,
//    walks to the second row and does the same, walks back to the Lodgy and boards.
//  - roadblock: the same with the roadblock's middle barrier.
//  - then to the finish. The RV is left to the owner's play test (A9).
describe('S1 the Lodgy alone drives the whole airport', () => {
  test('state won with elapsed no more than twice the target time', () => {
    const world = createWorld(RAPIER, { courseId: 'airport', vehicleId: 'lodgy' });
    world.addPlayer(PLAYER);
    for (let i = 0; i < 30; i++) world.step(new Map());
    expect(boardVehicle(world, PLAYER), 'the driver boards').toBe(true);
    const limit = 2 * airport.targetTime * TICK_RATE;

    const leg = (until: number, what: string) => {
      const result = driveWorld(world, PLAYER, until, { timeoutTicks: limit });
      expect(result.reached, `${what}: stopped at ${result.along.toFixed(0)} m, checkpoint ${world.snapshot().checkpoint}, elapsed ${world.status().elapsed.toFixed(0)} s`).toBe(true);
    };
    const rowsOf = (barriers: string[]) => [barriers.slice(0, 3), barriers.slice(3, 6)].filter((row) => row.length === 3);

    openRows(world, rowsOf(roadworksBarriers));
    leg(alongOfProp(roadworksBarriers[roadworksBarriers.length - 1]!) + 20, 'roadworks');
    openRows(world, rowsOf(roadblockBarriers));
    driveWorld(world, PLAYER, Infinity, { timeoutTicks: limit });

    const status = world.status();
    expect(status.state).toBe('won');
    expect(status.elapsed).toBeLessThanOrEqual(2 * airport.targetTime);
    expect(status.restarts).toBe(0);
    world.dispose();
  }, 600_000);
});
