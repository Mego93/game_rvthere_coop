import { RATE_LIMIT_CLOSE_AFTER, RATE_LIMIT_PER_SECOND, RATE_LIMIT_STRIKES } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createRateLimiter, type RateVerdict } from './rateLimit';

// Sends `perSecond` messages evenly through each of `seconds` seconds, starting at `from`.
function flood(limiter: ReturnType<typeof createRateLimiter>, from: number, seconds: number, perSecond: number) {
  const verdicts: RateVerdict[] = [];
  for (let s = 0; s < seconds; s++) {
    for (let i = 0; i < perSecond; i++) verdicts.push(limiter.hit(from + s + i / perSecond));
  }
  return verdicts;
}

test('allows messages up to the limit in each second', () => {
  const verdicts = flood(createRateLimiter(), 0, 5, RATE_LIMIT_PER_SECOND);
  expect(verdicts.every((verdict) => verdict === 'ok')).toBe(true);
});

test('drops the messages beyond the limit within a second', () => {
  const verdicts = flood(createRateLimiter(), 0, 1, RATE_LIMIT_PER_SECOND + 30);
  expect(verdicts.filter((verdict) => verdict === 'ok')).toHaveLength(RATE_LIMIT_PER_SECOND);
  expect(verdicts.filter((verdict) => verdict === 'drop')).toHaveLength(30);
});

test('closes a connection that stays over the limit for the allowed time', () => {
  const verdicts = flood(createRateLimiter(), 0, RATE_LIMIT_CLOSE_AFTER + 2, RATE_LIMIT_PER_SECOND * 2);
  const firstClose = verdicts.indexOf('close');
  expect(firstClose).toBeGreaterThan(-1);
  const closeTime = firstClose / (RATE_LIMIT_PER_SECOND * 2);
  expect(closeTime).toBeGreaterThanOrEqual(RATE_LIMIT_CLOSE_AFTER);
  expect(closeTime).toBeLessThan(RATE_LIMIT_CLOSE_AFTER + 1);
});

test('a second within the limit forgives earlier bursts', () => {
  const limiter = createRateLimiter();
  flood(limiter, 0, 2, RATE_LIMIT_PER_SECOND * 2);
  flood(limiter, 5, 1, RATE_LIMIT_PER_SECOND);
  const verdicts = flood(limiter, 9, 2, RATE_LIMIT_PER_SECOND * 2);
  expect(verdicts).not.toContain('close');
});

test('a silent second forgives earlier bursts', () => {
  const limiter = createRateLimiter();
  flood(limiter, 0, 2, RATE_LIMIT_PER_SECOND * 2);
  const verdicts = flood(limiter, 9, 2, RATE_LIMIT_PER_SECOND * 2);
  expect(verdicts).not.toContain('close');
});

test('exactly the limit passes in a window and the next message drops', () => {
  const limiter = createRateLimiter();
  const verdicts = flood(limiter, 0, 1, RATE_LIMIT_PER_SECOND + 1);
  expect(verdicts.slice(0, RATE_LIMIT_PER_SECOND).every((verdict) => verdict === 'ok')).toBe(true);
  expect(verdicts[RATE_LIMIT_PER_SECOND]).toBe('drop');
});

test('a continuous flood closes on the first over-limit message of the 4th over-limit window, not before', () => {
  const perSecond = RATE_LIMIT_PER_SECOND * 2;
  const verdicts = flood(createRateLimiter(), 0, 6, perSecond);
  expect(verdicts.indexOf('close')).toBe((RATE_LIMIT_STRIKES - 1) * perSecond + RATE_LIMIT_PER_SECOND);
});

test('floods in alternate windows close on the 4th flood, which the 3 s rule would forgive', () => {
  const limiter = createRateLimiter();
  const perSecond = RATE_LIMIT_PER_SECOND * 2;
  for (let n = 0; n < RATE_LIMIT_STRIKES - 1; n++) {
    expect(flood(limiter, n * 2, 1, perSecond)).not.toContain('close');
  }
  expect(flood(limiter, (RATE_LIMIT_STRIKES - 1) * 2, 1, perSecond)).toContain('close');
});

test('floods 3 s apart never close', () => {
  const limiter = createRateLimiter();
  for (let n = 0; n < 10; n++) {
    expect(flood(limiter, n * 3, 1, RATE_LIMIT_PER_SECOND * 2)).not.toContain('close');
  }
});
