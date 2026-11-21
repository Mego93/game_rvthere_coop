import type { Surface } from '../constants';
import type { Box, BuiltCourse, GroundBox } from '../course';
import { AXIS_Y, IDENTITY, deepFreeze, quatFromAxisAngle, vec3 } from '../math';

// The tee is the origin and the field runs toward -z (the field coordinates of GOLF_RINGS): 240 m long and 80 m wide, with the bay and the waiting area behind the tee at z > 0.
const FIELD_HALF_X = 40;
const FIELD_FAR = -240;
const BAY_BACK = 30;
const BAY_HALF_X = 20;
const MAT_FLOOR = 0.02;
const WALL_HEIGHT = 3;
const RAIL_HEIGHT = 1.1;
const HALF_THICKNESS = 0.15;
// The bay's open front: players on foot stay behind it.
const RAIL_Z = -3;

const ground = (x0: number, x1: number, z0: number, z1: number, top: number, bottom: number, surface: Surface): GroundBox => ({
  center: vec3((x0 + x1) / 2, (top + bottom) / 2, (z0 + z1) / 2),
  halfExtents: vec3((x1 - x0) / 2, (top - bottom) / 2, (z1 - z0) / 2),
  rot: IDENTITY,
  surface,
});

const wall = (along: 'x' | 'z', at: number, from: number, to: number, height = WALL_HEIGHT): Box => {
  const mid = (from + to) / 2;
  const half = (to - from) / 2;
  return {
    center: along === 'x' ? vec3(mid, height / 2, at) : vec3(at, height / 2, mid),
    halfExtents: along === 'x' ? vec3(half, height / 2, HALF_THICKNESS) : vec3(HALF_THICKNESS, height / 2, half),
    rot: IDENTITY,
  };
};

const groundBoxes: GroundBox[] = [
  ground(-FIELD_HALF_X, FIELD_HALF_X, FIELD_FAR, RAIL_Z, 0, -1, 'dirt'),
  // The bay: the mat at the tee and the floor of the waiting area behind it.
  ground(-FIELD_HALF_X, FIELD_HALF_X, RAIL_Z, BAY_BACK, 0, -1, 'dirt'),
  ground(-BAY_HALF_X, BAY_HALF_X, RAIL_Z, BAY_BACK, MAT_FLOOR / 2, 0, 'road'),
  ground(-2, 2, -2, 2, MAT_FLOOR, MAT_FLOOR / 2, 'road'),
];

const walls: Box[] = [
  // The perimeter.
  wall('x', FIELD_FAR, -FIELD_HALF_X, FIELD_HALF_X),
  wall('x', BAY_BACK, -FIELD_HALF_X, FIELD_HALF_X),
  wall('z', -FIELD_HALF_X, FIELD_FAR, BAY_BACK),
  wall('z', FIELD_HALF_X, FIELD_FAR, BAY_BACK),
  // The bay: its open front rail, which the ball passes over (the ball touches only ground), and the sides of the waiting area.
  wall('x', RAIL_Z, -BAY_HALF_X, BAY_HALF_X, RAIL_HEIGHT),
  wall('z', -BAY_HALF_X, RAIL_Z, BAY_BACK),
  wall('z', BAY_HALF_X, RAIL_Z, BAY_BACK),
];

export const primegolf: BuiltCourse = deepFreeze({
  id: 'primegolf',
  label: 'PrimeGolf',
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
      // The Lodgy stands parked at the back of the waiting area; nobody drives it here.
      spawn: { pos: vec3(0, 0, 24), rot: quatFromAxisAngle(AXIS_Y, Math.PI) },
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
  golf: { tee: vec3(0, MAT_FLOOR, 0) },
});
