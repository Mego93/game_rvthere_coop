import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { GRAVITY, PLAYER_MAX_SLOPE_DEG, TICK_DT } from './constants';
import { testGround } from './courses/testGround';
import { walkTo } from './courses/soloRig';
import { degToRad, vec3 } from './math';
import { buildStatics } from './statics';
import { makePatch, terrainHeightAt, validateTerrain, withTerrain } from './terrain';
import { createWorld, type World } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const worlds: World[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

// A rolling surface, well under the slope limit.
const rolling = (x: number, z: number): number => 2 + 0.8 * Math.sin(x * 0.4) + 0.6 * Math.cos(z * 0.3 + x * 0.1);

describe('terrain', () => {
  test('a heightfield collider returns the heights terrainHeightAt reports, within 1 cm', () => {
    const patch = makePatch('hill', 100, -200, 1.5, 20, 16, rolling, 'sand');
    const course = withTerrain(testGround, [patch]);
    const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    world.timestep = TICK_DT;
    buildStatics(RAPIER, world, course);
    world.step();
    let checked = 0;
    for (let i = 0; i < 40; i++) {
      for (let j = 0; j < 30; j++) {
        // Includes points on both triangles of a cell and on cell edges.
        const x = 100 + 0.2 + i * 0.73;
        const z = -200 + 0.1 + j * 0.79;
        const expected = terrainHeightAt(course, x, z);
        expect(expected).not.toBeNull();
        const hit = world.castRay(new RAPIER.Ray({ x, y: 50, z }, { x: 0, y: -1, z: 0 }), 100, true);
        expect(hit).not.toBeNull();
        expect(Math.abs(50 - hit!.timeOfImpact - expected!)).toBeLessThan(0.01);
        checked++;
      }
    }
    expect(checked).toBe(1200);
    world.free();
  });

  test('terrainHeightAt is null outside every patch', () => {
    const course = withTerrain(testGround, [makePatch('a', 0, 0, 2, 4, 4, () => 1, 'road')]);
    expect(terrainHeightAt(course, -0.1, 4)).toBeNull();
    expect(terrainHeightAt(course, 4, 8.1)).toBeNull();
    expect(terrainHeightAt(course, 8, 8)).toBe(1);
    expect(terrainHeightAt(testGround, 4, 4)).toBeNull();
  });

  test('a player stands on and walks up a 20 degree slope', () => {
    const rise = Math.tan(degToRad(20));
    const patch = makePatch('ramp', 60, -200, 1, 20, 40, (_x, z) => Math.max(0, -(z + 160)) * rise, 'road');
    const base = withTerrain(testGround, [patch]);
    const course = { ...base, playerStart: { pos: vec3(70, 0, -155), yaw: 0 } };
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' }, course);
    worlds.push(world);
    world.addPlayer('p');
    for (let i = 0; i < 40; i++) world.step(new Map());
    const standing = world.snapshot().players[0]!.pos;
    expect(Math.abs(standing.y - terrainHeightAt(course, standing.x, standing.z)!)).toBeLessThan(0.1);
    expect(walkTo(world, 'p', { x: 70, z: -185 }, 0.5, 30)).toBe(true);
    const top = world.snapshot().players[0]!.pos;
    expect(top.y).toBeGreaterThan(8);
    expect(Math.abs(top.y - terrainHeightAt(course, top.x, top.z)!)).toBeLessThan(0.15);
  });

  test('a 35 degree slope throws; 20 degrees does not', () => {
    const slope = (deg: number) => () => makePatch('s', 0, 0, 1, 10, 10, (x) => x * Math.tan(degToRad(deg)), 'road');
    expect(slope(35)).toThrow(/slope/);
    expect(slope(20)).not.toThrow();
    expect(() => withTerrain(testGround, [slope(35)()])).toThrow(/slope/);
    // A steep diagonal ridge counts too.
    expect(() => makePatch('r', 0, 0, 1, 10, 10, (x, z) => (x + z) * 0.7, 'road')).toThrow(/slope/);
    expect(PLAYER_MAX_SLOPE_DEG).toBeGreaterThan(25);
  });

  test('a cell wider than 2 m throws', () => {
    expect(() => makePatch('big', 0, 0, 2.5, 4, 4, () => 0, 'road')).toThrow(/cell/);
  });

  test('patches never overlap, but may touch', () => {
    const a = makePatch('a', 0, 0, 2, 5, 5, () => 0, 'road');
    const touching = makePatch('b', 10, 0, 2, 5, 5, () => 0, 'road');
    const overlapping = makePatch('c', 9, 4, 2, 5, 5, () => 0, 'road');
    expect(() => validateTerrain([a, touching])).not.toThrow();
    expect(() => validateTerrain([a, overlapping])).toThrow(/overlap/);
    expect(() => withTerrain(testGround, [a, overlapping])).toThrow(/overlap/);
  });

  test('the builder refuses a patch whose heights do not fit its size', () => {
    const patch = makePatch('a', 0, 0, 1, 4, 4, () => 0, 'road');
    expect(() => validateTerrain([{ ...patch, heights: patch.heights.slice(1) }])).toThrow(/heights/);
  });
});
