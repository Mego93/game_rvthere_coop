import { expect, test } from 'vitest';
import { predictionActive } from './gate';

const free = { seat: null, ground: null, downed: null };

test('C3: prediction runs for an unseated player on the ground who is not downed', () => {
  expect(predictionActive(free)).toBe(true);
});

test('C3: a seat, a body underfoot or a downed timer switches prediction off', () => {
  expect(predictionActive({ ...free, seat: 'driver' })).toBe(false);
  expect(predictionActive({ ...free, ground: { bodyId: 'vehicle', localPos: { x: 0, y: 1, z: 0 } } })).toBe(false);
  expect(predictionActive({ ...free, downed: 30 })).toBe(false);
  expect(predictionActive({ ...free, downed: 0 })).toBe(false);
});
