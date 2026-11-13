import {
  RATE_LIMIT_CLOSE_AFTER,
  RATE_LIMIT_PER_SECOND,
  RATE_LIMIT_STRIKES,
  RATE_LIMIT_STRIKE_WINDOW,
} from '@lodgy/shared';

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
  // Window starts of the windows that went over the limit, within the strike window.
  let strikes: number[] = [];
  let struck = false;
  return {
    hit(now) {
      if (now - windowStart >= 1) {
        // The run is broken by a second within the limit, or by a whole second of silence.
        if (count <= RATE_LIMIT_PER_SECOND || now - windowStart >= 2) overSince = null;
        windowStart = now;
        count = 0;
        struck = false;
      }
      count += 1;
      if (count <= RATE_LIMIT_PER_SECOND) return 'ok';
      overSince ??= now;
      if (!struck) {
        struck = true;
        strikes = strikes.filter((time) => time > now - RATE_LIMIT_STRIKE_WINDOW);
        strikes.push(windowStart);
      }
      if (strikes.length >= RATE_LIMIT_STRIKES) return 'close';
      return now - overSince >= RATE_LIMIT_CLOSE_AFTER ? 'close' : 'drop';
    },
  };
}
