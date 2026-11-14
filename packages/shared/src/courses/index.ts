import type { BuiltCourse } from '../course';
import { airport } from './airport';
import { buildCourse } from './build';
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
