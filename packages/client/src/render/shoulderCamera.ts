import {
  CAMERA_DISTANCE,
  CAMERA_MIN_DISTANCE,
  CAMERA_SHOULDER,
  CAMERA_WALL_MARGIN,
  add,
  length,
  rotate,
  scale,
  sub,
  vec3,
  type Box,
  type Vec3,
} from '@lodgy/shared';

// How far along the aim the camera looks; far enough that the shoulder offset is negligible.
const TARGET_DISTANCE = 30;

// Distance along a unit-direction ray to where it first enters the box, or null if it misses or starts inside.
function rayBoxEntry(origin: Vec3, dir: Vec3, box: Box): number | null {
  const inverse = { x: -box.rot.x, y: -box.rot.y, z: -box.rot.z, w: box.rot.w };
  const o = rotate(inverse, sub(origin, box.center));
  const d = rotate(inverse, dir);
  let near = -Infinity;
  let far = Infinity;
  for (const axis of ['x', 'y', 'z'] as const) {
    const half = box.halfExtents[axis];
    if (Math.abs(d[axis]) < 1e-9) {
      if (Math.abs(o[axis]) > half) return null;
      continue;
    }
    const a = (-half - o[axis]) / d[axis];
    const b = (half - o[axis]) / d[axis];
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
  }
  if (near > far || far < 0 || near < 0) return null;
  return near;
}

// Camera behind and to the right of the head, looking along the aim, pulled in so it stays in front of walls and ground.
export function cameraPlacement(
  head: Vec3,
  yaw: number,
  pitch: number,
  boxes: Box[],
): { position: Vec3; target: Vec3 } {
  const cosPitch = Math.cos(pitch);
  const aim = vec3(-Math.sin(yaw) * cosPitch, Math.sin(pitch), -Math.cos(yaw) * cosPitch);
  const right = vec3(Math.cos(yaw), 0, -Math.sin(yaw));
  const offset = add(scale(aim, -CAMERA_DISTANCE), scale(right, CAMERA_SHOULDER));
  const full = length(offset);
  const dir = scale(offset, 1 / full);

  let reach = full;
  for (const box of boxes) {
    const hit = rayBoxEntry(head, dir, box);
    if (hit !== null) reach = Math.min(reach, hit - CAMERA_WALL_MARGIN);
  }
  reach = Math.max(reach, CAMERA_MIN_DISTANCE);

  return { position: add(head, scale(dir, reach)), target: add(head, scale(aim, TARGET_DISTANCE)) };
}

