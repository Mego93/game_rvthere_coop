import { MAX_CATCHUP_STEPS, TICK_DT } from '@lodgy/shared';

export interface FixedStepper {
  // Adds elapsed frame time and runs the ticks that are due. Returns how many ran.
  advance(frameSeconds: number): number;
}

export function createFixedStepper(tick: () => void): FixedStepper {
  let accumulator = 0;
  return {
    advance(frameSeconds) {
      accumulator += frameSeconds;
      let steps = 0;
      while (accumulator >= TICK_DT && steps < MAX_CATCHUP_STEPS) {
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
