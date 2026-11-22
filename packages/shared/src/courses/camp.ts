import type { Surface } from '../constants';
import type { Box, BuiltCourse, GroundBox, Spot } from '../course';
import { IDENTITY, deepFreeze, vec3 } from '../math';

// x east, z south: a clearing x -20 to 20 and z -15 to 15. The tent stands in the north (z -13 to -3) with its door in the south wall, the table inside it, and the buggy is parked south of the tent facing it.
const HALF_X = 20;
const NORTH = -15;
const SOUTH = 15;
const WALL_HEIGHT = 3;
const WALL_HALF_THICKNESS = 0.15;
const TENT = { x0: -8, x1: 8, z0: -13, z1: -3 };
const DOOR = { x0: -2, x1: 2 };
const FLOOR = 0.05;

const ground = (x0: number, x1: number, z0: number, z1: number, top: number, bottom: number, surface: Surface): GroundBox => ({
  center: vec3((x0 + x1) / 2, (top + bottom) / 2, (z0 + z1) / 2),
  halfExtents: vec3((x1 - x0) / 2, (top - bottom) / 2, (z1 - z0) / 2),
  rot: IDENTITY,
  surface,
});

// A wall box from one end to the other along x or z, leaving the gap [from, to] open when given.
function wall(along: 'x' | 'z', at: number, from: number, to: number, gap?: readonly [number, number]): Box[] {
  const spans = gap ? [[from, gap[0]], [gap[1], to]] : [[from, to]];
  return spans.map(([a, b]) => {
    const mid = (a! + b!) / 2;
    const half = (b! - a!) / 2;
    return {
      center: along === 'x' ? vec3(mid, WALL_HEIGHT / 2, at) : vec3(at, WALL_HEIGHT / 2, mid),
      halfExtents: along === 'x' ? vec3(half, WALL_HEIGHT / 2, WALL_HALF_THICKNESS) : vec3(WALL_HALF_THICKNESS, WALL_HEIGHT / 2, half),
      rot: IDENTITY,
    };
  });
}

const groundBoxes: GroundBox[] = [ground(-HALF_X, HALF_X, NORTH, SOUTH, 0, -1, 'sand'), ground(TENT.x0, TENT.x1, TENT.z0, TENT.z1, FLOOR, 0, 'dirt')];

const walls: Box[] = [
  // The fence round the clearing.
  ...wall('x', NORTH, -HALF_X, HALF_X),
  ...wall('x', SOUTH, -HALF_X, HALF_X),
  ...wall('z', -HALF_X, NORTH, SOUTH),
  ...wall('z', HALF_X, NORTH, SOUTH),
  // The tent: four walls, the door in the south one.
  ...wall('x', TENT.z0, TENT.x0, TENT.x1),
  ...wall('x', TENT.z1, TENT.x0, TENT.x1, [DOOR.x0, DOOR.x1]),
  ...wall('z', TENT.x0, TENT.z0, TENT.z1),
  ...wall('z', TENT.x1, TENT.z0, TENT.z1),
];

const spots: Spot[] = [{ id: 'camp-table', kind: 'kitchen', pos: vec3(0, FLOOR, -8), radius: 2.2 }];

export const camp: BuiltCourse = deepFreeze({
  id: 'camp',
  label: 'Desert camp',
  ground: groundBoxes,
  walls,
  props: [],
  pickups: [],
  anchors: [],
  stops: [],
  coins: [],
  decor: [],
  ravines: [],
  checkpoints: [
    {
      id: 'cp-0',
      trigger: { center: vec3(0, 2, 8), halfExtents: vec3(6, 2, 6), rot: IDENTITY },
      spawn: { pos: vec3(0, 0, 8), rot: IDENTITY },
    },
  ],
  route: [
    [0, 8],
    [0, -8],
  ],
  // Out of reach, under the kill plane: a story world is never won.
  finish: { center: vec3(0, -50, 0), halfExtents: vec3(1, 1, 1), rot: IDENTITY },
  killPlaneY: -20,
  targetTime: 1,
  spots,
});
