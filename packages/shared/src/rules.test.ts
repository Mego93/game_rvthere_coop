import { describe, expect, test } from 'vitest';
import { finalTime, resultsOf, stars } from './rules';
import type { WorldStatus } from './world';

describe('S1: finalTime', () => {
  test('nothing added gives the elapsed time', () => {
    expect(finalTime({ elapsed: 100, restarts: 0, respawns: 0, wallet: 0 })).toBe(100);
  });
  test('1 restart, 2 respawns and 3 coins give 205', () => {
    expect(finalTime({ elapsed: 100, restarts: 1, respawns: 2, wallet: 3 })).toBe(205);
  });
  test('a large wallet clamps at 0', () => {
    expect(finalTime({ elapsed: 100, restarts: 0, respawns: 0, wallet: 1000 })).toBe(0);
  });
});

describe('S2: stars', () => {
  const base = { restarts: 0, finalTime: 100, targetTime: 120, coinsCollected: 4, coinsTotal: 4, assisted: false };
  test('all three on a clean run', () => {
    expect(stars(base)).toEqual([true, true, true]);
  });
  test('star 1 needs no restarts', () => {
    expect(stars({ ...base, restarts: 1 })).toEqual([false, true, true]);
  });
  test('star 2 needs a final time under the target; equal does not earn it', () => {
    expect(stars({ ...base, finalTime: 120 })).toEqual([true, false, true]);
    expect(stars({ ...base, finalTime: 119.9 })[1]).toBe(true);
  });
  test('star 3 needs every coin', () => {
    expect(stars({ ...base, coinsCollected: 3 })).toEqual([true, true, false]);
  });
  test('a course with no coins earns star 3', () => {
    expect(stars({ ...base, coinsCollected: 0, coinsTotal: 0 })[2]).toBe(true);
  });
  test('assisted gives all false', () => {
    expect(stars({ ...base, assisted: true })).toEqual([false, false, false]);
  });
});

describe('L4: resultsOf', () => {
  const status: WorldStatus = { state: 'won', elapsed: 100, restarts: 0, respawns: 1, wallet: 2, coinsCollected: 4, coinsTotal: 4, finalTime: 120, assisted: false };
  const course = { id: 'test', targetTime: 150 };
  const config = { vehicleId: 'rv', timeOfDay: 'sunset', weather: 'rain' } as const;
  test('fills every field', () => {
    expect(resultsOf(status, course, config)).toEqual({
      courseId: 'test',
      vehicleId: 'rv',
      timeOfDay: 'sunset',
      weather: 'rain',
      elapsed: 100,
      restarts: 0,
      respawns: 1,
      wallet: 2,
      coinsCollected: 4,
      coinsTotal: 4,
      finalTime: 120,
      stars: [true, true, true],
      assisted: false,
    });
  });
  test('assisted gives all stars false', () => {
    const result = resultsOf({ ...status, assisted: true }, course, config);
    expect(result.assisted).toBe(true);
    expect(result.stars).toEqual([false, false, false]);
  });
});
