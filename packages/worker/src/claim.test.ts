import { expect, test } from 'vitest';
import { allocate, CLAIM_SECONDS, createClaim } from './claim';

test('a free noun is claimed, then taken, then free again after 15 s', () => {
  let now = 100;
  const claim = createClaim(() => now);
  expect(CLAIM_SECONDS).toBe(15);
  expect(claim.tryClaim(false)).toBe('free');
  now += 14.9;
  expect(claim.tryClaim(false)).toBe('taken');
  now += 0.2;
  expect(claim.tryClaim(false)).toBe('free');
});

test('a noun with a live room is taken, and a claim is not made', () => {
  let now = 0;
  const claim = createClaim(() => now);
  expect(claim.tryClaim(true)).toBe('taken');
  expect(claim.tryClaim(false)).toBe('free');
  now += 20;
  expect(claim.tryClaim(true)).toBe('taken');
});

test('release frees the claim at once', () => {
  const claim = createClaim(() => 0);
  expect(claim.tryClaim(false)).toBe('free');
  claim.release();
  expect(claim.tryClaim(false)).toBe('free');
});

test('allocate returns the first free noun and draws a noun per attempt', async () => {
  const tried: string[] = [];
  let i = 0;
  const noun = await allocate(() => 'n' + i++, async (n) => (tried.push(n), tried.length > 2 ? 'free' : 'taken'));
  expect(noun).toBe('n2');
  expect(tried).toEqual(['n0', 'n1', 'n2']);
});

test('allocate gives up after 20 attempts by default, or the count given', async () => {
  let calls = 0;
  expect(await allocate(() => 'a', async () => (calls++, 'taken'))).toBeNull();
  expect(calls).toBe(20);
  calls = 0;
  expect(await allocate(() => 'a', async () => (calls++, 'taken'), 2)).toBeNull();
  expect(calls).toBe(2);
});

test('every attempt draws again, so taken draws are skipped', async () => {
  const draws = ['busy', 'busy', 'free'];
  let i = 0;
  expect(await allocate(() => draws[i++]!, async (n) => (n === 'free' ? 'free' : 'taken'))).toBe('free');
});
