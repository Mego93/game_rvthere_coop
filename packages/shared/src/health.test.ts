import { describe, expect, test } from 'vitest';
import { DOWNED_TIMEOUT, FALL_DAMAGE, FALL_DAMAGE_SPEED, TICK_DT } from './constants';
import { damageAbove, everyoneDowned, stepDowned } from './health';

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
