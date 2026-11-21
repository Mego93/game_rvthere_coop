import type { Surface } from '../constants';
import type { Box, BuiltCourse, GroundBox, Spot } from '../course';
import { AXIS_Y, IDENTITY, deepFreeze, quatFromAxisAngle, vec3 } from '../math';
import type { SpotKind } from '../story/days';

// x east, z south: the grounds run x -40 to 40 and z -30 to 30, the gate is in the south fence at z = 30, and a verge with the ATM and the shop lies outside it to z = 40.
const HALF_X = 40;
const NORTH = -30;
const GATE_Z = 30;
const SOUTH = 40;
const WALL_HEIGHT = 3;
const WALL_HALF_THICKNESS = 0.15;
const GATE_HALF_WIDTH = 4;
const DOOR = 3;

const HOUSE_FLOOR = 0.05;
const TERRACE_FLOOR = 0.1;
const COURT_FLOOR = 0.02;

// The pool is a hole in the lawn 1 m deep; three steps of 0.25 m, each under PLAYER_STEP_HEIGHT, lead out of it on its west side.
const POOL = { x0: 12, x1: 22, z0: 0, z1: 6, depth: 1 };
const POOL_STEPS = [
  { top: -0.75, width: 2 },
  { top: -0.5, width: 1.5 },
  { top: -0.25, width: 1 },
];

// The house, one storey, three zones split by two walls: the kitchen, the living room and the sleeping-and-working wing.
const HOUSE = { x0: -34, x1: 10, z0: -24, z1: -2 };
const KITCHEN_WALL_X = -20;
const WING_WALL_X = -4;

const ground = (x0: number, x1: number, z0: number, z1: number, top: number, bottom: number, surface: Surface): GroundBox => ({
  center: vec3((x0 + x1) / 2, (top + bottom) / 2, (z0 + z1) / 2),
  halfExtents: vec3((x1 - x0) / 2, (top - bottom) / 2, (z1 - z0) / 2),
  rot: IDENTITY,
  surface,
});

// Wall boxes along a line, leaving the gaps [from, to] open. `along` is 'x' for a wall running east-west, 'z' for one running north-south.
function wall(along: 'x' | 'z', at: number, from: number, to: number, gaps: readonly (readonly [number, number])[] = []): Box[] {
  const edges = [from, ...gaps.flatMap(([a, b]) => [a, b]), to];
  const boxes: Box[] = [];
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i]!;
    const b = edges[i + 1]!;
    if (b <= a) continue;
    const mid = (a + b) / 2;
    const half = (b - a) / 2;
    boxes.push({
      center: along === 'x' ? vec3(mid, WALL_HEIGHT / 2, at) : vec3(at, WALL_HEIGHT / 2, mid),
      halfExtents: along === 'x' ? vec3(half, WALL_HEIGHT / 2, WALL_HALF_THICKNESS) : vec3(WALL_HALF_THICKNESS, WALL_HEIGHT / 2, half),
      rot: IDENTITY,
    });
  }
  return boxes;
}

const door = (centre: number): [number, number] => [centre - DOOR / 2, centre + DOOR / 2];

const groundBoxes: GroundBox[] = [
  // The lawn, in four slabs around the pool hole.
  ground(-HALF_X, HALF_X, NORTH, POOL.z0, 0, -1, 'dirt'),
  ground(-HALF_X, HALF_X, POOL.z1, SOUTH, 0, -1, 'dirt'),
  ground(-HALF_X, POOL.x0, POOL.z0, POOL.z1, 0, -1, 'dirt'),
  ground(POOL.x1, HALF_X, POOL.z0, POOL.z1, 0, -1, 'dirt'),
  ground(POOL.x0, POOL.x1, POOL.z0, POOL.z1, -POOL.depth, -POOL.depth - 1, 'road'),
  ...POOL_STEPS.map((step) => ground(POOL.x0, POOL.x0 + step.width, POOL.z0, POOL.z1, step.top, -POOL.depth, 'road')),
  // The house floor and the terrace south of it.
  ground(HOUSE.x0, HOUSE.x1, HOUSE.z0, HOUSE.z1 + WALL_HALF_THICKNESS, HOUSE_FLOOR, 0, 'road'),
  ground(HOUSE.x0, HOUSE.x1, HOUSE.z1 + WALL_HALF_THICKNESS, 8, TERRACE_FLOOR, 0, 'road'),
  // The pickleball court and the gym pavilion floor.
  ground(20, 32, -24, -6, COURT_FLOOR, 0, 'road'),
  ground(18, 34, 10, 22, HOUSE_FLOOR, 0, 'road'),
];

const walls: Box[] = [
  // The perimeter, with the gate gap in the south fence.
  ...wall('x', NORTH, -HALF_X, HALF_X),
  ...wall('x', SOUTH, -HALF_X, HALF_X),
  ...wall('z', -HALF_X, NORTH, SOUTH),
  ...wall('z', HALF_X, NORTH, SOUTH),
  ...wall('x', GATE_Z, -HALF_X, HALF_X, [[-GATE_HALF_WIDTH, GATE_HALF_WIDTH]]),
  // The house: doors to the terrace from every zone, one to the east lawn, and one between each pair of zones.
  ...wall('x', HOUSE.z0, HOUSE.x0, HOUSE.x1),
  ...wall('x', HOUSE.z1, HOUSE.x0, HOUSE.x1, [door(-27.5), door(-7.5), door(2.5)]),
  ...wall('z', HOUSE.x0, HOUSE.z0, HOUSE.z1),
  ...wall('z', HOUSE.x1, HOUSE.z0, HOUSE.z1, [door(-7.5)]),
  ...wall('z', KITCHEN_WALL_X, HOUSE.z0, HOUSE.z1, [door(-7.5)]),
  ...wall('z', WING_WALL_X, HOUSE.z0, HOUSE.z1, [door(-7.5)]),
  // The gym pavilion, with a door on its west side.
  ...wall('x', 10, 18, 34),
  ...wall('x', 22, 18, 34),
  ...wall('z', 18, 10, 22, [door(15.5)]),
  ...wall('z', 34, 10, 22),
];

const spot = (id: string, kind: SpotKind, x: number, y: number, z: number, radius: number): Spot => ({ id, kind, pos: vec3(x, y, z), radius });
const row = (kind: SpotKind, count: number, x0: number, dx: number, y: number, z: number, radius: number): Spot[] =>
  Array.from({ length: count }, (_, i) => spot(`${kind}-${i}`, kind, x0 + dx * i, y, z, radius));

const spots: Spot[] = [
  spot('kitchen', 'kitchen', -31, HOUSE_FLOOR, -20, 2.2),
  spot('chef', 'chef', -26, HOUSE_FLOOR, -20, 2.2),
  ...row('couch', 6, -17.5, 2.4, HOUSE_FLOOR, -21, 0.8),
  spot('board', 'board', -12, HOUSE_FLOOR, -4, 2),
  ...row('laptop', 6, -2.5, 1.8, HOUSE_FLOOR, -21.5, 0.8),
  ...row('bed', 6, -2.5, 1.8, HOUSE_FLOOR, -12, 0.8),
  // The Lodgy is parked just inside the gate; the outing starts when it stands here.
  spot('gate', 'gate', 0, 0, 27, 7),
  spot('atm', 'atm', -8, 0, 34, 2),
  spot('shop', 'shop', 8, 0, 34, 2.5),
];

export const villa: BuiltCourse = deepFreeze({
  id: 'villa',
  label: 'Villa',
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
      trigger: { center: vec3(0, 2, 22), halfExtents: vec3(6, 2, 6), rot: IDENTITY },
      spawn: { pos: vec3(0, 0, 22), rot: quatFromAxisAngle(AXIS_Y, Math.PI) },
    },
  ],
  route: [
    [0, 22],
    [0, -22],
  ],
  // Out of reach, under the kill plane: a story world is never won.
  finish: { center: vec3(0, -50, 0), halfExtents: vec3(1, 1, 1), rot: IDENTITY },
  killPlaneY: -20,
  targetTime: 1,
  spots,
});
