import { CAMPAIGN, getCourse, getCourseDef, warmCorridor } from '@lodgy/shared';
import { scatterDecorSteps, seedFromId, type DecorPlacement } from './decorScatter';
import { warmTerrainGrid } from './terrain';

const placements = new Map<string, DecorPlacement[]>();

// The decor of a course, built once per page load; a run's first frame no longer pays for it when the lobby warmed it.
export function decorFor(courseId: string): DecorPlacement[] {
  let found = placements.get(courseId);
  if (!found) {
    const steps = decorSteps(courseId);
    while (!steps.next().done);
    found = placements.get(courseId)!;
  }
  return found;
}

function* decorSteps(courseId: string): Generator<void, void> {
  if (placements.has(courseId)) return;
  const course = getCourse(courseId);
  const placed = yield* scatterDecorSteps(course, getCourseDef(courseId), seedFromId(courseId));
  if (!placements.has(courseId)) placements.set(courseId, placed);
}

// Runs a generator in slices of at most `budgetMs` between timer ticks, so the page keeps answering. It stops, and drops the generator, when `active` turns false, on cancel, or on an error.
export function runSliced(gen: Generator<void, unknown>, budgetMs: number, active: () => boolean, now: () => number = () => performance.now()): { cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const stop = () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    gen.return(undefined);
  };
  const tick = () => {
    timer = null;
    const start = now();
    try {
      do {
        if (!active()) return stop();
        if (gen.next().done) return void (stopped = true);
      } while (now() - start < budgetMs);
    } catch {
      return stop();
    }
    timer = setTimeout(tick, 0);
  };
  timer = setTimeout(tick, 0);
  return {
    cancel() {
      if (!stopped) stop();
    },
  };
}

// The course the lobby warms: a chained run starts at the first stage, whatever stage is selected.
export const warmTarget = (settings: { courseId: string; chain: boolean }): string => (settings.chain && CAMPAIGN.includes(settings.courseId) ? CAMPAIGN[0]! : settings.courseId);

// How long a course stays selected before the lobby starts building it.
export const WARM_DELAY_MS = 1500;
export const WARM_BUDGET_DESKTOP_MS = 12;
export const WARM_BUDGET_TOUCH_MS = 8;

let delay: ReturnType<typeof setTimeout> | null = null;
let job: { cancel(): void } | null = null;
let warming = '';

export function cancelWarm(): void {
  if (delay !== null) clearTimeout(delay);
  delay = null;
  job?.cancel();
  job = null;
  warming = '';
}

function* pipeline(courseId: string): Generator<void, void> {
  // Inside the first timed step, so an unknown course ends the warm-up quietly.
  const course = getCourse(courseId);
  yield* warmCorridor(course);
  yield* warmTerrainGrid(course);
  yield* decorSteps(courseId);
}

// Builds the course's corridor, terrain and decor in the lobby, in short slices, once the course has stayed selected for a while. Stops when `active` turns false.
export function warmCourse(courseId: string, active: () => boolean, budgetMs: number, delayMs: number = WARM_DELAY_MS): void {
  if (warming === courseId) return;
  cancelWarm();
  warming = courseId;
  delay = setTimeout(() => {
    delay = null;
    if (!active()) return;
    job = runSliced(pipeline(courseId), budgetMs, active);
  }, delayMs);
}
