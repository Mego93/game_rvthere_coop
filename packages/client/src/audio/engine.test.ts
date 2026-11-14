import { expect, test } from 'vitest';
import { engineRate, rainOn, winchOn } from './engine';

test('E5: idle is 0.6, top speed with full throttle is 1.7, and reverse uses its absolute value', () => {
  expect(engineRate(0, 20, 0)).toBeCloseTo(0.6);
  expect(engineRate(20, 20, 1)).toBeCloseTo(1.7);
  expect(engineRate(-10, 20, 0)).toBeCloseTo(engineRate(10, 20, 0));
  expect(engineRate(0, 20, -1)).toBeCloseTo(0.8);
  expect(engineRate(40, 20, 0)).toBeCloseTo(1.5);
});

test('E5: the winch is on only while attached and reeling', () => {
  expect(winchOn({ state: 'attached', reel: 1 })).toBe(true);
  expect(winchOn({ state: 'attached', reel: -1 })).toBe(true);
  expect(winchOn({ state: 'attached', reel: 0 })).toBe(false);
  expect(winchOn({ state: 'ground', reel: 1 })).toBe(false);
  expect(winchOn({ state: 'held', reel: 1 })).toBe(false);
  expect(winchOn(null)).toBe(false);
});

test('E5: rain is on only in rain', () => {
  expect(rainOn('rain')).toBe(true);
  expect(rainOn('clear')).toBe(false);
  expect(rainOn('sandstorm')).toBe(false);
});
