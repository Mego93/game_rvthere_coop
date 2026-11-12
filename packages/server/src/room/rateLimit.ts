import { RATE_LIMIT_CLOSE_AFTER, RATE_LIMIT_PER_SECOND } from '@lodgy/shared';

export type RateVerdict = 'ok' | 'drop' | 'close';

export interface RateLimiter {
  // Counts one message received at `now` (seconds) and says what to do with it.
  hit(now: number): RateVerdict;
}

export function createRateLimiter(): RateLimiter {
  let windowStart = Number.NEGATIVE_INFINITY;
  let count = 0;
  // When the current unbroken run of over-limit seconds began.
  let overSince: number | null = null;
  return {
    hit(now) {
      if (now - windowStart >= 1) {
        // The run is broken by a second within the limit, or by a whole second of silence.
        if (count <= RATE_LIMIT_PER_SECOND || now - windowStart >= 2) overSince = null;
        windowStart = now;
        count = 0;
      }
      count += 1;
      if (count <= RATE_LIMIT_PER_SECOND) return 'ok';
      overSince ??= now;
      return now - overSince >= RATE_LIMIT_CLOSE_AFTER ? 'close' : 'drop';
    },
  };
}
