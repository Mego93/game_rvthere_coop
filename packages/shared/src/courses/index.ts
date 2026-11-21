import { STAGE_IDS } from '../constants';
import type { BuiltCourse } from '../course';
import { deepFreeze } from '../math';
import { buildSegment, type SegmentDef } from '../segments';
import { airport } from './airport';
import { arrival } from './arrival';
import { buildCourse, type CourseDef } from './build';
import { segmentDemo } from './demo';
import { marrakech } from './marrakech';
import { airportHomeDef } from './reverse';
import { stageDefs } from './stages';
import { testGround } from './testGround';
import { primegolf } from './primegolf';
import { villa } from './villa';

const COURSES: Record<string, BuiltCourse> = {
  [testGround.id]: testGround,
  [segmentDemo.id]: buildCourse(segmentDemo),
  [airport.id]: buildCourse(airport),
  [villa.id]: villa,
  [primegolf.id]: primegolf,
  [arrival.id]: arrival,
};

// Courses that exist for the story and are not offered as a race.
const STORY_ONLY = new Set([villa.id, primegolf.id, arrival.id, 'airport-home']);

// Built on first use, so importing the package does not pay for the 22 km course.
const LAZY: Record<string, () => CourseDef> = { ...stageDefs, [marrakech.id]: () => marrakech, 'airport-home': airportHomeDef };

// The stages in play order, then marrakech, then the rest; the story's own courses are left out.
export function courseIds(): string[] {
  const stages = STAGE_IDS.filter((id) => Object.hasOwn(LAZY, id));
  return [...new Set([...stages, marrakech.id, ...Object.keys(COURSES), ...Object.keys(LAZY)])].filter((id) => !STORY_ONLY.has(id));
}

export function getCourse(courseId: string): BuiltCourse {
  if (Object.hasOwn(LAZY, courseId) && !Object.hasOwn(COURSES, courseId)) COURSES[courseId] = buildCourse(LAZY[courseId]!());
  const course = Object.hasOwn(COURSES, courseId) ? COURSES[courseId] : undefined;
  if (!course) throw new Error(`Unknown course: ${courseId}`);
  return course;
}

// Plain-data copies, so freezing never touches the exported defs.
const copy = (def: CourseDef): CourseDef => JSON.parse(JSON.stringify(def)) as CourseDef;
const COURSE_DEFS: Record<string, CourseDef> = {
  [segmentDemo.id]: copy(segmentDemo),
  [airport.id]: copy(airport),
};
for (const def of Object.values(COURSE_DEFS)) deepFreeze(def);

export function getCourseDef(id: string): CourseDef | null {
  if (Object.hasOwn(LAZY, id) && !Object.hasOwn(COURSE_DEFS, id)) COURSE_DEFS[id] = deepFreeze(copy(LAZY[id]!()));
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
