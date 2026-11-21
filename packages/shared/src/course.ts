import type { Surface } from './constants';
import type { Pose, Quat, Vec3 } from './math';
import type { SpotKind } from './story/days';

export interface Box {
  center: Vec3;
  halfExtents: Vec3;
  rot: Quat;
  // A rock of a rocks hazard: a wall box the client draws as its boulder, not as a wall.
  rock?: true;
  // A road bump: ground that sits on top of the road surface.
  bump?: true;
}

export interface GroundBox extends Box {
  surface: Surface;
}

// Anything placed in the course. `kind` tells the client what to draw.
export interface Placed {
  id: string;
  kind: string;
  pose: Pose;
  // Half extents, for decor drawn as a box (water).
  size?: Vec3;
}

export interface ServiceStop {
  id: string;
  kind: 'fuel' | 'garage';
  zone: Box;
  operatePoint: Vec3;
  shopCounter: Vec3 | null;
}

export interface Checkpoint {
  id: string;
  trigger: Box;
  // A pose on the ground. The vehicle spawns above it by its ride height.
  spawn: Pose;
  // Souleyman stands here and greets the crew; every checkpoint saves, only these have the figure.
  figure?: true;
}

// STUB (step 41a task 3): the story spots; task 2 owns the real definition.
export interface Spot {
  id: string;
  kind: SpotKind;
  pos: Vec3;
  radius: number;
}

export interface BuiltCourse {
  id: string;
  ground: GroundBox[];
  walls: Box[];
  props: Placed[];
  pickups: Placed[];
  anchors: Placed[];
  stops: ServiceStop[];
  coins: Placed[];
  decor: Placed[];
  checkpoints: Checkpoint[];
  // Along-route spans (m) of the bridges; the land under each is sunk (see corridor.ts).
  ravines: { from: number; to: number }[];
  route: [x: number, z: number][];
  finish: Box;
  killPlaneY: number;
  targetTime: number;
  // Enemy plan inputs carried from the course def: the event multiplier, and the last share of the route with double events.
  enemyDensity?: number;
  enemyCityShare?: number;
  // Along-route spans (m) with no ambient animals, sorted and disjoint; only on courses that opt in.
  ambient?: { blocked: { from: number; to: number }[] };
  // Present on courses that opt in to the solid land beside the road: the along-route spans (m) of the obstacles that get a berm, sorted and disjoint, and the index in `walls` where the obstacle walls and caps start (they are not drawn).
  // STUB (task 3): story spots, only on the villa.
  spots?: Spot[];
  corridor?: { obstacles: { from: number; to: number }[]; wallsFrom: number };
}
