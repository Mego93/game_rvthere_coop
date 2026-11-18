import { corridorOf, getCourse, getCourseDef } from '@lodgy/shared';
import { scatterDecor, seedFromId, type DecorPlacement } from './decorScatter';
import { buildTerrainGrid } from './terrain';

const placements = new Map<string, DecorPlacement[]>();

// The decor of a course, built once per page load; a run's first frame no longer pays for it when the lobby warmed it.
export function decorFor(courseId: string): DecorPlacement[] {
  let found = placements.get(courseId);
  if (!found) {
    found = scatterDecor(getCourse(courseId), getCourseDef(courseId), seedFromId(courseId));
    placements.set(courseId, found);
  }
  return found;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let warming = '';

// Builds the course's corridor, terrain heights and decor in the lobby, one step per timer tick, so Start has less to do.
export function warmCourse(courseId: string): void {
  if (warming === courseId) return;
  warming = courseId;
  if (timer !== null) clearTimeout(timer);
  const course = getCourse(courseId);
  const steps = [() => corridorOf(course), () => buildTerrainGrid(course), () => decorFor(courseId)];
  const next = () => {
    const step = steps.shift();
    if (!step || warming !== courseId) return;
    try {
      step();
    } catch {
      return;
    }
    timer = setTimeout(next, 100);
  };
  timer = setTimeout(next, 400);
}
