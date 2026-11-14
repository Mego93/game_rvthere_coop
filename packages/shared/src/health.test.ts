import { describe, expect, test } from 'vitest';
import { DOWNED_TIMEOUT, FALL_DAMAGE, FALL_DAMAGE_SPEED, TICK_DT } from './constants';
import { vec3 } from './math';
import { damageAbove, everyoneDowned, relativeSpeed, stepDowned } from './health';

describe('damageAbove', () => {
  test('P1: nothing at and below the threshold, linear above it', () => {
    expect(damageAbove(0, 9, 10)).toBe(0);
    expect(damageAbove(8.9, 9, 10)).toBe(0);
    expect(damageAbove(9, 9, 10)).toBe(0);
    expect(damageAbove(10, 9, 10)).toBeCloseTo(10);
    expect(damageAbove(12, 9, 10)).toBeCloseTo(30);
    expect(damageAbove(FALL_DAMAGE_SPEED + 2, FALL_DAMAGE_SPEED, FALL_DAMAGE)).toBeCloseTo(20);
  });
});

describe('stepDowned', () => {
  test('P3: counts down, holds when paused', () => {
    expect(stepDowned(10, false)).toBeCloseTo(10 - TICK_DT, 12);
    expect(stepDowned(10, true)).toBe(10);
  });

  test('P3: gives respawn after exactly the timeout in ticks, not one tick earlier', () => {
    let left: number | 'respawn' = DOWNED_TIMEOUT;
    let ticks = 0;
    while (left !== 'respawn') {
      left = stepDowned(left, false);
      ticks += 1;
    }
    expect(ticks).toBe(Math.round(DOWNED_TIMEOUT / TICK_DT));
  });

  test('P3: a paused timer never respawns', () => {
    expect(stepDowned(1e-12, true)).toBe(1e-12);
  });
});

describe('everyoneDowned', () => {
  test('P4: empty is false, all downed is true, one up is false', () => {
    expect(everyoneDowned([])).toBe(false);
    expect(everyoneDowned([{ downed: 3 }, { downed: 0.5 }])).toBe(true);
    expect(everyoneDowned([{ downed: 3 }, { downed: null }])).toBe(false);
  });
});

describe('relativeSpeed', () => {
  const zero = vec3(0, 0, 0);
  const centre = vec3(0, 1, 0);

  test('P2: a translating body closes at its speed along the normal', () => {
    expect(relativeSpeed(vec3(0, 0, -10), zero, centre, vec3(0, 1, -2), zero, vec3(0, 0, -1))).toBeCloseTo(10);
  });

  test('P2: a body sliding past, with the normal perpendicular, gives 0', () => {
    expect(relativeSpeed(vec3(0, 0, -10), zero, centre, vec3(2, 1, 0), zero, vec3(1, 0, 0))).toBe(0);
  });

  test('P2: a body moving away gives 0, not a negative speed', () => {
    expect(relativeSpeed(vec3(0, 0, 10), zero, centre, vec3(0, 1, -2), zero, vec3(0, 0, -1))).toBe(0);
  });

  test('P2: a spinning body is faster further from its centre', () => {
    const spin = vec3(0, 0, 4);
    const n = vec3(0, 1, 0);
    expect(relativeSpeed(zero, spin, centre, vec3(0, 1, 0), zero, n)).toBeCloseTo(0);
    // w x r for w = (0,0,4) and r = (-2,0,0) is (0,-8,0); the normal points down.
    expect(relativeSpeed(zero, spin, centre, vec3(-2, 1, 0), zero, vec3(0, -1, 0))).toBeCloseTo(8);
    expect(relativeSpeed(zero, spin, centre, vec3(-1, 1, 0), zero, vec3(0, -1, 0))).toBeCloseTo(4);
  });

  test('P2: a player moving with the body gives 0', () => {
    const v = vec3(3, 0, -7);
    expect(relativeSpeed(v, zero, centre, vec3(0, 1, 0), v, vec3(0, 0, -1))).toBeCloseTo(0);
  });

  test('P2: the player moving into the body adds to the closing speed', () => {
    expect(relativeSpeed(zero, zero, centre, vec3(0, 1, 0), vec3(0, 0, 4), vec3(0, 0, 1))).toBeCloseTo(0);
    expect(relativeSpeed(zero, zero, centre, vec3(0, 1, 0), vec3(0, 0, -4), vec3(0, 0, 1))).toBeCloseTo(4);
  });
});
