import { WATER_DEPTH_BELOW_ROAD } from './constants';
import { routeFrame } from './corridor';
import type { BuiltCourse } from './course';
import type { Vec3 } from './math';

// m, the most a point can lie from the route and still count as over a ravine.
const WATER_REACH = 60;

// Under a bridge the water stands WATER_DEPTH_BELOW_ROAD below the route height; a point below it is lost, like one below the kill plane.
export function belowWater(course: BuiltCourse, pos: Vec3): boolean {
  if (course.ravines.length === 0) return false;
  const frame = routeFrame(course);
  const hit = frame.nearest(pos.x, pos.z);
  if (hit.d > WATER_REACH) return false;
  if (!course.ravines.some((r) => hit.along >= r.from && hit.along <= r.to)) return false;
  return pos.y < frame.heightAtAlong(hit.along) - WATER_DEPTH_BELOW_ROAD;
}
