import type { BuiltCourse } from '../course';
import { deepFreeze } from '../math';
import { buildSegment, type SegmentDef } from '../segments';
import { airport } from './airport';
import { buildCourse, type CourseDef } from './build';
import { segmentDemo } from './demo';
import { testGround } from './testGround';

const COURSES: Record<string, BuiltCourse> = {
  [testGround.id]: testGround,
  [segmentDemo.id]: buildCourse(segmentDemo),
  [airport.id]: buildCourse(airport),
};

export function courseIds(): string[] {
  return Object.keys(COURSES);
}

export function getCourse(courseId: string): BuiltCourse {
  const course = Object.hasOwn(COURSES, courseId) ? COURSES[courseId] : undefined;
  if (!course) throw new Error(`Unknown course: ${courseId}`);
  return course;
}

// Plain-data copies, so freezing never touches the exported defs.
const copy = (def: CourseDef): CourseDef => JSON.parse(JSON.stringify(def)) as CourseDef;
const COURSE_DEFS: Record<string, CourseDef> = deepFreeze({
  [segmentDemo.id]: copy(segmentDemo),
  [airport.id]: copy(airport),
});

export function getCourseDef(id: string): CourseDef | null {
  return Object.hasOwn(COURSE_DEFS, id) ? COURSE_DEFS[id]! : null;
}

function polylineLength(route: readonly (readonly [number, number])[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) total += Math.hypot(route[i]![0] - route[i - 1]![0], route[i]![1] - route[i - 1]![1]);
  return total;
}

// Each segment's span along the route, in order; the finish pad follows the last.
export function segmentRanges(def: CourseDef): { type: SegmentDef['type']; from: number; to: number }[] {
  let at = 0;
  return def.segments.map((segment) => {
    const from = at;
    at += polylineLength(buildSegment(segment).route);
    return { type: segment.type, from, to: at };
  });
}
