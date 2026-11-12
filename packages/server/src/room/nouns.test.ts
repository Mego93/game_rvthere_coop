import { cleanRoom } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { NOUNS, RESERVED_PATHS, pickNoun } from './nouns';

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
