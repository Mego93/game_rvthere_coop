import { describe, expect, test } from 'vitest';
import { TICK_RATE, WEATHERS, WEATHER_CHANGE_MAX, WEATHER_CHANGE_MIN, WEATHER_SETTINGS, WEATHER_WEIGHTS } from './constants';
import { weatherAt, weatherSchedule } from './weather';

const HOUR = 3600 * TICK_RATE;

describe('weatherSchedule', () => {
  test('is deterministic for a seed and differs for another', () => {
    expect(weatherSchedule(1234, HOUR)).toEqual(weatherSchedule(1234, HOUR));
    expect(weatherSchedule(1234, HOUR)).not.toEqual(weatherSchedule(1235, HOUR));
  });

  test('starts at tick 0 and every change falls 150 to 300 s after the one before', () => {
    for (const seed of [1, 2, 3, 99, 4242]) {
      const list = weatherSchedule(seed, HOUR);
      expect(list[0]!.tick).toBe(0);
      expect(list.length).toBeGreaterThan(10);
      for (let i = 1; i < list.length; i++) {
        const gap = (list[i]!.tick - list[i - 1]!.tick) / TICK_RATE;
        expect(gap).toBeGreaterThanOrEqual(WEATHER_CHANGE_MIN - 1e-9);
        expect(gap).toBeLessThanOrEqual(WEATHER_CHANGE_MAX + 1e-9);
      }
    }
  });

  test('consecutive weathers differ', () => {
    for (const seed of [1, 2, 3, 99, 4242]) {
      const list = weatherSchedule(seed, HOUR);
      for (let i = 1; i < list.length; i++) expect(list[i]!.weather).not.toBe(list[i - 1]!.weather);
    }
  });

  test('lists nothing beyond the horizon', () => {
    const list = weatherSchedule(7, 1000 * TICK_RATE);
    expect(list.every((entry) => entry.tick <= 1000 * TICK_RATE)).toBe(true);
    expect(weatherSchedule(7, 0)).toHaveLength(1);
  });

  test('the first weather follows the weights over many seeds', () => {
    const counts = { clear: 0, rain: 0, sandstorm: 0 };
    const n = 3000;
    for (let seed = 0; seed < n; seed++) counts[weatherSchedule(seed * 7919 + 13, 0)[0]!.weather] += 1;
    for (const weather of WEATHERS) {
      const p = WEATHER_WEIGHTS[weather];
      expect(Math.abs(counts[weather] - p * n)).toBeLessThanOrEqual(4 * Math.sqrt(n * p * (1 - p)));
    }
  });

  test('weights sum to 1 and the setting list is the weathers plus random', () => {
    expect(WEATHERS.reduce((sum, w) => sum + WEATHER_WEIGHTS[w], 0)).toBeCloseTo(1, 12);
    expect(WEATHER_SETTINGS).toEqual(['clear', 'rain', 'sandstorm', 'random']);
  });
});

describe('weatherAt', () => {
  const list = [
    { tick: 0, weather: 'clear' as const },
    { tick: 100, weather: 'rain' as const },
    { tick: 250, weather: 'sandstorm' as const },
  ];
  test('is the entry in force at the tick, changing exactly on its tick', () => {
    expect([0, 99, 100, 249, 250, 9999].map((tick) => weatherAt(list, tick))).toEqual(['clear', 'clear', 'rain', 'rain', 'sandstorm', 'sandstorm']);
  });
});
