import type { Surface } from './constants';
import type { Pose, Quat, Vec3 } from './math';

export interface Box {
  center: Vec3;
  halfExtents: Vec3;
  rot: Quat;
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
  route: [x: number, z: number][];
  finish: Box;
  killPlaneY: number;
  targetTime: number;
  // Along-route spans (m) with no ambient animals, sorted and disjoint; only on courses that opt in.
  ambient?: { blocked: { from: number; to: number }[] };
  // Present on courses that opt in to the solid land beside the road: the along-route spans (m) of the obstacles that get a berm, sorted and disjoint.
  corridor?: { obstacles: { from: number; to: number }[] };
}
