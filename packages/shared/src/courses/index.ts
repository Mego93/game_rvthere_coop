import type { BuiltCourse } from '../course';
import { testGround } from './testGround';

const COURSES: Record<string, BuiltCourse> = { [testGround.id]: testGround };

export function getCourse(courseId: string): BuiltCourse {
  const course = Object.hasOwn(COURSES, courseId) ? COURSES[courseId] : undefined;
  if (!course) throw new Error(`Unknown course: ${courseId}`);
  return course;
}
