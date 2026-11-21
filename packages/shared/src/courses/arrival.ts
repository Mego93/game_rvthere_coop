import { PROP_KINDS, ROAD_WIDTH, type Surface } from '../constants';
import type { Box, BuiltCourse, GroundBox, Placed } from '../course';
import { AXIS_Y, IDENTITY, deepFreeze, quatFromAxisAngle, vec3 } from '../math';

// Enemy events every ENEMY_SPACING / 6 m of the route, so about 42 m; the cap of 8 alive still holds.
export const ARRIVAL_ENEMY_DENSITY = 6;

// x east, z south and the route runs toward -z, as on a road: the arrival hall (z +6 to -100, 18 m wide), then the plaza with the pedestrian crossing (a fenced lane of gates, z -112 to -178), the car park with its roadblock and debris, and the rental car stop at the far end (z -262) where the Lodgy waits.
const HALL = { x: 9, from: 6, to: -100 };
const PLAZA = { x: 14, to: -268 };
const LANE = { x: 7, from: -112, to: -178 };
const ROADBLOCK_Z = -200;
const STOP_Z = -250;
const WALL_HEIGHT = 3.5;
const FENCE = 1.2;
const WALL_HALF_THICKNESS = 0.15;
const KILL_PLANE = -20;

const ground = (x0: number, x1: number, z0: number, z1: number, surface: Surface): GroundBox => ({
  center: vec3((x0 + x1) / 2, -0.5, (z0 + z1) / 2),
  halfExtents: vec3((x1 - x0) / 2, 0.5, (z1 - z0) / 2),
  rot: IDENTITY,
  surface,
});

// A wall box from corner to corner on the x-z plane.
const wall = (x0: number, z0: number, x1: number, z1: number, height = WALL_HEIGHT): Box => ({
  center: vec3((x0 + x1) / 2, height / 2, (z0 + z1) / 2),
  halfExtents: vec3(Math.max(Math.abs(x1 - x0) / 2, WALL_HALF_THICKNESS), height / 2, Math.max(Math.abs(z1 - z0) / 2, WALL_HALF_THICKNESS)),
  rot: IDENTITY,
});

const props: Placed[] = [];
const counts = new Map<string, number>();
const place = (kind: 'crate' | 'barrier', x: number, z: number, height = 0): void => {
  const n = (counts.get(kind) ?? 0) + 1;
  counts.set(kind, n);
  props.push({ id: `${kind}-${n}`, kind, pose: { pos: vec3(x, height, z), rot: IDENTITY } });
};

// Six crates across and two high, from `x0` on.
const CRATE = 2 * PROP_KINDS.crate.halfExtents.x + 0.02;
function crateWall(x0: number, z: number): void {
  for (const height of [0, 2 * PROP_KINDS.crate.halfExtents.y]) for (let i = 0; i < 6; i++) place('crate', x0 + (i + 0.5) * CRATE, z, height);
}

// Two crate walls in the hall: the first fills the left of the middle, the second the right, so the way winds.
crateWall(-4.5, -30);
crateWall(1, -62);
// Gates down the lane of the pedestrian crossing, 14 m apart, alternating sides.
[-125, -139, -153, -167].forEach((z, i) => place('barrier', (i % 2 === 0 ? -1 : 1) * 2.7, z));
// The roadblock: three barriers in the middle, a 2 m gap each side, fences beyond.
for (const x of [-3, 0, 3]) place('barrier', x, ROADBLOCK_Z);
// Debris scattered over the car park.
for (const [x, z] of [[-6, -185], [-5.5, -192], [-8, -215], [7, -224]] as const) place('crate', x, z);

const walls: Box[] = [
  // The hall: side walls, the rear wall and a front wall with a 10 m door.
  wall(-HALL.x, HALL.from, -HALL.x, HALL.to),
  wall(HALL.x, HALL.from, HALL.x, HALL.to),
  wall(-HALL.x, HALL.from, HALL.x, HALL.from),
  wall(-HALL.x, HALL.to, -5, HALL.to),
  wall(5, HALL.to, HALL.x, HALL.to),
  // The plaza's fences, and the pen of the crossing: its walls close the plaza either side of the lane, so the way is down it.
  wall(-PLAZA.x, HALL.to, -PLAZA.x, PLAZA.to, FENCE),
  wall(PLAZA.x, HALL.to, PLAZA.x, PLAZA.to, FENCE),
  wall(-PLAZA.x, PLAZA.to, PLAZA.x, PLAZA.to, FENCE),
  wall(-LANE.x, LANE.from, -LANE.x, LANE.to, FENCE),
  wall(LANE.x, LANE.from, LANE.x, LANE.to, FENCE),
  wall(-PLAZA.x, LANE.from, -LANE.x, LANE.from, FENCE),
  wall(LANE.x, LANE.from, PLAZA.x, LANE.from, FENCE),
  wall(-PLAZA.x, LANE.to, -LANE.x, LANE.to, FENCE),
  wall(LANE.x, LANE.to, PLAZA.x, LANE.to, FENCE),
  // The roadblock's fences, from the gaps outward.
  wall(-PLAZA.x, ROADBLOCK_Z, -ROAD_WIDTH / 2 - 1, ROADBLOCK_Z, FENCE),
  wall(ROAD_WIDTH / 2 + 1, ROADBLOCK_Z, PLAZA.x, ROADBLOCK_Z, FENCE),
  // The rental booth beside the stop.
  wall(-12.5, STOP_Z - 4, -10.5, STOP_Z + 4),
];

// The Lodgy waits at the rental stop, facing the way out; the finish box is round it.
const lodgySpawn = { pos: vec3(0, 0, STOP_Z), rot: quatFromAxisAngle(AXIS_Y, 0) };
const finish: Box = { center: vec3(0, 3, STOP_Z), halfExtents: vec3(7, 3, 9), rot: IDENTITY };

export const arrival: BuiltCourse = deepFreeze({
  id: 'arrival',
  label: 'Arrival',
  ground: [ground(-HALL.x, HALL.x, HALL.to, HALL.from, 'road'), ground(-PLAZA.x, PLAZA.x, PLAZA.to, HALL.to, 'road')],
  walls,
  props,
  // One ammo box in the lane of the crossing, half way.
  pickups: [{ id: 'ammo-1', kind: 'ammo', pose: { pos: vec3(4.5, 0, -132), rot: IDENTITY } }],
  anchors: [],
  stops: [],
  coins: [],
  decor: [],
  ravines: [],
  checkpoints: [
    {
      id: 'cp-0',
      trigger: { center: vec3(0, 2, STOP_Z), halfExtents: vec3(6, 2, 6), rot: IDENTITY },
      spawn: lodgySpawn,
    },
  ],
  route: [
    [0, 0],
    [0, HALL.to],
    [0, LANE.to],
    [0, STOP_Z],
    [0, -262],
  ],
  finish,
  finishBy: 'players',
  playerStart: { pos: vec3(0, 0, 2), yaw: 0 },
  killPlaneY: KILL_PLANE,
  targetTime: 300,
  enemyDensity: ARRIVAL_ENEMY_DENSITY,
});
