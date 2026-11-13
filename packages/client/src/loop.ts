import { CLIENT_MAX_CATCHUP_STEPS, TICK_DT } from '@lodgy/shared';

export interface FixedStepper {
  // Adds elapsed frame time and runs the ticks that are due. Returns how many ran.
  advance(frameSeconds: number): number;
}

export function createFixedStepper(tick: () => void): FixedStepper {
  let accumulator = 0;
  return {
    advance(frameSeconds) {
      // A NaN or negative frame time would poison or stall the accumulator.
      if (!(frameSeconds > 0)) return 0;
      accumulator += frameSeconds;
      let steps = 0;
      while (accumulator >= TICK_DT && steps < CLIENT_MAX_CATCHUP_STEPS) {
        tick();
        accumulator -= TICK_DT;
        steps += 1;
      }
      // Whatever is still owed after the catch-up limit is discarded, so a stall cannot snowball.
      if (accumulator >= TICK_DT) accumulator = 0;
      return steps;
    },
  };
}

// Seconds since the previous call (first call 0, never negative: the first frame timestamp can precede an earlier clock read).
export function createFrameClock(maxSeconds: number): (nowMs: number) => number {
  let previous: number | null = null;
  return (nowMs) => {
    const seconds = previous === null ? 0 : Math.min(Math.max((nowMs - previous) / 1000, 0), maxSeconds);
    previous = nowMs;
    return seconds;
  };
}
