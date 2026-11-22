import { ROAD_WIDTH, type BuiltCourse } from '@lodgy/shared';
import { surfaceYAt } from './terrain';

// The arches over the road at the start and the finish: pillars outside the road edge, a banner beam on top.
export const ARCH = { span: ROAD_WIDTH + 4, height: 7.2, pillar: 0.9, beam: 1.6, thickness: 0.8 };
// How far ahead of the route's first point the start arch stands, so the buggy's spawn is just before it.
export const START_ARCH_ALONG = 26;

export interface ArchPose {
  x: number;
  y: number;
  z: number;
  // Turn about y; at 0 the arch spans x and the road runs along -z through it.
  yaw: number;
}

// The yaw that turns an arch spanning x to span across a road heading (tx, tz).
export const tangentYaw = (tx: number, tz: number): number => Math.atan2(-tx, -tz);

// The point `along` metres from the route's start, and the heading there.
function onRoute(route: BuiltCourse['route'], along: number): { x: number; z: number; tx: number; tz: number } {
  let left = along;
  for (let i = 0; i + 1 < route.length; i++) {
    const dx = route[i + 1]![0] - route[i]![0];
    const dz = route[i + 1]![1] - route[i]![1];
    const length = Math.hypot(dx, dz);
    if (left <= length || i + 2 === route.length) {
      const t = length === 0 ? 0 : Math.min(1, left / length);
      return { x: route[i]![0] + dx * t, z: route[i]![1] + dz * t, tx: dx / (length || 1), tz: dz / (length || 1) };
    }
    left -= length;
  }
  return { x: route[0]![0], z: route[0]![1], tx: 0, tz: -1 };
}

export function archPoses(course: BuiltCourse): { start: ArchPose; finish: ArchPose } {
  const point = onRoute(course.route, START_ARCH_ALONG);
  const rot = course.finish.rot;
  const ground = (x: number, z: number, fallback: number) => surfaceYAt(course, x, z) ?? fallback;
  return {
    start: { x: point.x, y: ground(point.x, point.z, 0), z: point.z, yaw: tangentYaw(point.tx, point.tz) },
    // The finish box lies along the road, so its own turn is the arch's.
    finish: { x: course.finish.center.x, y: ground(course.finish.center.x, course.finish.center.z, course.finish.center.y - course.finish.halfExtents.y), z: course.finish.center.z, yaw: 2 * Math.atan2(rot.y, rot.w) },
  };
}
