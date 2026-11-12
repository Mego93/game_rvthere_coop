import { RATE_LIMIT_CLOSE_AFTER, RATE_LIMIT_PER_SECOND } from '@lodgy/shared';
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
  flood(limiter, 2, 1, RATE_LIMIT_PER_SECOND);
  const verdicts = flood(limiter, 3, 2, RATE_LIMIT_PER_SECOND * 2);
  expect(verdicts).not.toContain('close');
});

test('a silent second forgives earlier bursts', () => {
  const limiter = createRateLimiter();
  flood(limiter, 0, 2, RATE_LIMIT_PER_SECOND * 2);
  const verdicts = flood(limiter, 4, 2, RATE_LIMIT_PER_SECOND * 2);
  expect(verdicts).not.toContain('close');
});
