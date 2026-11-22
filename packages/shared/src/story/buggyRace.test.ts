import { describe, expect, test } from 'vitest';
import { LUNCH_RETURN_SECONDS, RACE_HAPPINESS, RACE_MEDALS, RACE_SLOW_FACTOR, RACE_SLOW_HAPPINESS, raceResult } from './buggyRace';

const TARGET = 180;

describe('raceResult', () => {
  test('just under the target is gold', () => {
    expect(raceResult(TARGET - 0.01, TARGET)).toEqual({ medal: 'gold', happiness: 10 });
  });

  test('exactly the target is silver', () => {
    expect(raceResult(TARGET, TARGET)).toEqual({ medal: 'silver', happiness: 5 });
  });

  test('under the target times 1.25 is silver', () => {
    expect(raceResult(TARGET * 1.25 - 0.01, TARGET)).toEqual({ medal: 'silver', happiness: 5 });
  });

  test('the target times 1.25 is bronze', () => {
    expect(raceResult(TARGET * 1.25, TARGET)).toEqual({ medal: 'bronze', happiness: 0 });
  });

  test('the target times 2 is bronze with 0', () => {
    expect(raceResult(TARGET * 2, TARGET)).toEqual({ medal: 'bronze', happiness: 0 });
  });

  test('just over the target times 2 is bronze with -5', () => {
    expect(raceResult(TARGET * 2 + 0.01, TARGET)).toEqual({ medal: 'bronze', happiness: -5 });
  });
});

describe('constants', () => {
  test('hold the plan values', () => {
    expect(RACE_MEDALS).toEqual({ gold: 1, silver: 1.25 });
    expect(RACE_HAPPINESS).toEqual({ gold: 10, silver: 5, bronze: 0 });
    expect(RACE_SLOW_FACTOR).toBe(2);
    expect(RACE_SLOW_HAPPINESS).toBe(-5);
    expect(LUNCH_RETURN_SECONDS).toBe(5);
  });
});
