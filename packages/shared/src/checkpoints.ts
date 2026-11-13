import { PROP_KINDS, type ItemKind, type PropKind } from './constants';
import type { Box, BuiltCourse, Placed } from './course';
import { dot, rotate, scale, sub, vec3, type Quat, type Vec3 } from './math';
import { propCentre, type PropSnapshot } from './props';

export interface BodyPose {
  centre: Vec3;
  rot: Quat;
}

// The selected slot is not recorded: the client sets it with every input.
export interface CheckpointRecord {
  index: number;
  fuel: number;
  health: number;
  props: Map<string, BodyPose>;
  items: { id: string; kind: ItemKind; centre: Vec3; rot: Quat }[];
  players: Map<string, { inventory: (ItemKind | null)[]; health: number }>;
}

const conjugate = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

export function insideBox(point: Vec3, box: Box): boolean {
  const local = rotate(conjugate(box.rot), sub(point, box.center));
  const h = box.halfExtents;
  return Math.abs(local.x) <= h.x && Math.abs(local.y) <= h.y && Math.abs(local.z) <= h.z;
}

// Rule K1: the highest index above `lastIndex` whose trigger contains the point.
export function enteredCheckpoint(course: BuiltCourse, vehicleCentre: Vec3, lastIndex: number): number | null {
  for (let index = course.checkpoints.length - 1; index > lastIndex; index--) {
    if (insideBox(vehicleCentre, course.checkpoints[index]!.trigger)) return index;
  }
  return null;
}

const AXES: Vec3[] = [vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1)];

// Separating axis test over the 15 candidate axes; boxes that only touch do not overlap.
export function boxesOverlap(a: Box, b: Box): boolean {
  const axesA = AXES.map((axis) => rotate(a.rot, axis));
  const axesB = AXES.map((axis) => rotate(b.rot, axis));
  const radius = (box: Box, axes: Vec3[], along: Vec3) =>
    Math.abs(dot(axes[0]!, along)) * box.halfExtents.x + Math.abs(dot(axes[1]!, along)) * box.halfExtents.y + Math.abs(dot(axes[2]!, along)) * box.halfExtents.z;
  const between = sub(b.center, a.center);
  const candidates: Vec3[] = [...axesA, ...axesB];
  for (const u of axesA) {
    for (const v of axesB) {
      const cross = vec3(u.y * v.z - u.z * v.y, u.z * v.x - u.x * v.z, u.x * v.y - u.y * v.x);
      const size = Math.hypot(cross.x, cross.y, cross.z);
      // Near-parallel edges give no new axis.
      if (size > 1e-9) candidates.push(scale(cross, 1 / size));
    }
  }
  return candidates.every((axis) => Math.abs(dot(between, axis)) < radius(a, axesA, axis) + radius(b, axesB, axis));
}

export interface RecordInput {
  index: number;
  fuel: number;
  health: number;
  props: PropSnapshot[];
  heldIds: ReadonlySet<string>;
  courseProps: readonly Placed[];
  items: PropSnapshot[];
  players: { id: string; inventory: readonly (ItemKind | null)[]; health: number }[];
}

// Rule Q4: a held prop is recorded at its course spawn.
export function recordState(input: RecordInput): CheckpointRecord {
  const props = new Map<string, BodyPose>();
  for (const prop of input.props) {
    const placed = input.courseProps.find((candidate) => candidate.id === prop.id);
    if (input.heldIds.has(prop.id) && placed) {
      props.set(prop.id, { centre: propCentre(placed, PROP_KINDS[placed.kind as PropKind]), rot: { ...placed.pose.rot } });
    } else {
      props.set(prop.id, { centre: { ...prop.pos }, rot: { ...prop.rot } });
    }
  }
  return {
    index: input.index,
    fuel: input.fuel,
    health: input.health,
    props,
    items: input.items.map((item) => ({ id: item.id, kind: item.kind as ItemKind, centre: { ...item.pos }, rot: { ...item.rot } })),
    players: new Map(input.players.map((player) => [player.id, { inventory: [...player.inventory], health: player.health }])),
  };
}
