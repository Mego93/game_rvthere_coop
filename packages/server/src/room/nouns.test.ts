import { cleanRoom } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { NOUNS, RESERVED_PATHS, nounCandidates, pickNoun } from './nouns';

test('every noun is a valid, unique, unreserved room name', () => {
  expect(new Set(NOUNS).size).toBe(NOUNS.length);
  for (const noun of NOUNS) {
    expect(noun).toMatch(/^[a-z]+$/);
    expect(cleanRoom(noun)).toBe(noun);
    expect(RESERVED_PATHS).not.toContain(noun);
  }
});

test('picks the noun the random source points at', () => {
  expect(pickNoun(() => 0, () => false)).toBe(NOUNS[0]);
  expect(pickNoun(() => 0.999999, () => false)).toBe(NOUNS[NOUNS.length - 1]);
});

test('skips nouns that are taken', () => {
  const taken = new Set([NOUNS[0], NOUNS[1]]);
  expect(pickNoun(() => 0, (noun) => taken.has(noun))).toBe(NOUNS[2]);
});

test('appends a number once every noun is taken', () => {
  const taken = new Set(NOUNS);
  expect(pickNoun(() => 0, (noun) => taken.has(noun))).toBe(`${NOUNS[0]}2`);
  for (const noun of NOUNS) taken.add(`${noun}2`);
  expect(pickNoun(() => 0, (noun) => taken.has(noun))).toBe(`${NOUNS[0]}3`);
});

// A small deterministic random source for the generator tests.
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

test('candidates start at the random word, wrap through all words, then the numbered variants', () => {
  const candidates = nounCandidates(() => 0.5);
  const first = Array.from({ length: NOUNS.length + 2 }, () => candidates.next().value);
  const start = Math.floor(0.5 * NOUNS.length);
  expect(first.slice(0, NOUNS.length)).toEqual(NOUNS.map((_, i) => NOUNS[(start + i) % NOUNS.length]));
  expect(first[NOUNS.length]).toBe(`${NOUNS[start]}2`);
  expect(first[NOUNS.length + 1]).toBe(`${NOUNS[(start + 1) % NOUNS.length]}2`);
});

test('candidates are the same for the same seed', () => {
  const take = (seed: number) => {
    const candidates = nounCandidates(seeded(seed));
    return Array.from({ length: 200 }, () => candidates.next().value);
  };
  expect(take(7)).toEqual(take(7));
});

test('a generator never repeats a candidate and never yields a reserved path', () => {
  for (const seed of [1, 2, 3]) {
    const seen = new Set<string>();
    const candidates = nounCandidates(seeded(seed));
    for (let n = 0; n < NOUNS.length * 4; n++) {
      const noun = candidates.next().value as string;
      expect(seen.has(noun)).toBe(false);
      seen.add(noun);
      expect(RESERVED_PATHS).not.toContain(noun);
      expect(noun).toMatch(/^[a-z]+\d*$/);
    }
  }
});
