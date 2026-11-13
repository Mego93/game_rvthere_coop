import { REPORT_INTERVAL } from '@lodgy/shared';

// Reports at most once per REPORT_INTERVAL per source; the next report carries the count of those dropped since the last.
// A count that no later report picks up is never sent.
export function createReporter(
  onError: (error: unknown, source: string, suppressed: number) => void,
  clock: () => number,
): (source: string, error: unknown) => void {
  const sources = new Map<string, { last: number; suppressed: number }>();
  return (source, error) => {
    const now = clock();
    const state = sources.get(source);
    if (state && now - state.last < REPORT_INTERVAL) {
      state.suppressed += 1;
      return;
    }
    sources.set(source, { last: now, suppressed: 0 });
    onError(error, source, state?.suppressed ?? 0);
  };
}
