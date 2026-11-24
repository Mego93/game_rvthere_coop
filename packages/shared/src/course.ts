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

// A walkable heightfield. Heights are row-major vertices, (rows + 1) x (cols + 1) values at index `zi * (cols + 1) + xi`, over the square from (x0, z0) to (x0 + cols * cell, z0 + rows * cell). Patches never overlap.
export interface GroundPatch {
  id: string;
  x0: number;
  z0: number;
  cell: number;
  cols: number;
  rows: number;
  heights: number[];
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

// A place where `use` does something in a story world; `pos` is on the ground.
export interface Spot {
  id: string;
  kind: SpotKind;
  pos: Vec3;
  radius: number;
}

export interface BuiltCourse {
  id: string;
  // The name the lobby shows, for a course with no def.
  label?: string;
  ground: GroundBox[];
  // Uneven walkable ground, validated by withTerrain (terrain.ts).
  terrain?: GroundPatch[];
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
  // 'players': the world is won when every alive present player stands in `finish`, not when the vehicle does (an on-foot course, whose vehicle is parked in the finish; no fuel is used).
  finishBy?: 'players';
  // Where players start and respawn, instead of beside the vehicle; `yaw` turns the vehicle's spawn slots (an on-foot course).
  playerStart?: { pos: Vec3; yaw: number };
  killPlaneY: number;
  targetTime: number;
  // Enemy plan inputs carried from the course def: the event multiplier, and the last share of the route with double events.
  enemyDensity?: number;
  enemyCityShare?: number;
  // Along-route spans (m) with no ambient animals, sorted and disjoint; only on courses that opt in.
  ambient?: { blocked: { from: number; to: number }[] };
  // Present on courses that opt in to the solid land beside the road: the along-route spans (m) of the obstacles that get a berm, sorted and disjoint, and the index in `walls` where the obstacle walls and caps start (they are not drawn).
  // Story worlds only: where `use` emits a spot event.
  spots?: Spot[];
  // Golf worlds: the tee, where the player on turn stands (the origin of field coordinates).
  golf?: { tee: Vec3 };
  corridor?: { obstacles: { from: number; to: number }[]; wallsFrom: number };
}
