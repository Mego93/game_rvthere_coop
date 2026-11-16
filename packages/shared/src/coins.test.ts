import { expect, test } from 'vitest';
import { COIN_RADIUS, PLAYER_HEIGHT, PLAYER_RADIUS } from './constants';
import { coinTouched } from './coins';
import { vec3 } from './math';

const EPS = 0.01;
const reach = PLAYER_RADIUS + COIN_RADIUS;
const feet = vec3(0, 0, 0);

test('S6: a coin level with the capsule body is taken within the reach and not beyond it', () => {
  expect(coinTouched(feet, vec3(reach - EPS, 1, 0))).toBe(true);
  expect(coinTouched(feet, vec3(reach + EPS, 1, 0))).toBe(false);
  expect(reach).toBeCloseTo(0.68);
});

test('S6: the capsule segment ends at the radius above the feet and below the head', () => {
  const top = PLAYER_HEIGHT - PLAYER_RADIUS;
  expect(coinTouched(feet, vec3(0, top + reach - EPS, 0))).toBe(true);
  expect(coinTouched(feet, vec3(0, top + reach + EPS, 0))).toBe(false);
  expect(coinTouched(feet, vec3(0, PLAYER_RADIUS - reach + EPS, 0))).toBe(true);
  expect(coinTouched(feet, vec3(0, PLAYER_RADIUS - reach - EPS, 0))).toBe(false);
});

test('S6: beyond the segment end the distance is measured to the end point', () => {
  const top = PLAYER_HEIGHT - PLAYER_RADIUS;
  const d = (reach - EPS) / Math.SQRT2;
  expect(coinTouched(feet, vec3(d, top + d, 0))).toBe(true);
  const e = (reach + EPS) / Math.SQRT2;
  expect(coinTouched(feet, vec3(e, top + e, 0))).toBe(false);
});
