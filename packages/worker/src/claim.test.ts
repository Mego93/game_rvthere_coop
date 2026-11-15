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

function* words(...list: string[]) {
  yield* list;
}

test('allocate returns the first free candidate and tries them in order', async () => {
  const tried: string[] = [];
  const noun = await allocate(words('a', 'b', 'c', 'd'), async (n) => (tried.push(n), tried.length > 2 ? 'free' : 'taken'));
  expect(noun).toBe('c');
  expect(tried).toEqual(['a', 'b', 'c']);
});

test('allocate gives up after 20 attempts by default', async () => {
  let calls = 0;
  const never = (function* () {
    for (let i = 0; ; i++) yield `n${i}`;
  })();
  expect(await allocate(never, async () => (calls++, 'taken'))).toBeNull();
  expect(calls).toBe(20);
});

test('allocate honours a custom attempt count and an exhausted generator', async () => {
  let calls = 0;
  expect(await allocate(words('a', 'b', 'c'), async () => (calls++, 'taken'), 2)).toBeNull();
  expect(calls).toBe(2);
  expect(await allocate(words('a'), async () => 'taken')).toBeNull();
});
