import { expect, test } from 'vitest';
import { createWeatherTracker } from './weatherTracker';

test('K1: a fixed weather never changes and is settled', () => {
  const tracker = createWeatherTracker('rain');
  expect(tracker.weather()).toBe('rain');
  expect(tracker.blend(100)).toBe(1);
  tracker.push(undefined, 5);
  expect(tracker.weather()).toBe('rain');
  expect(tracker.takeSky(100)).toBeNull();
});

test('K2: the first weather the server names replaces the start at once, with the sky to apply', () => {
  const tracker = createWeatherTracker('clear');
  tracker.push('sandstorm', 3);
  expect(tracker.weather()).toBe('sandstorm');
  expect(tracker.blend(3)).toBe(1);
  expect(tracker.takeSky(3)).toBe('sandstorm');
  expect(tracker.takeSky(3)).toBeNull();
});

test('K3: the first weather equal to the start changes nothing', () => {
  const tracker = createWeatherTracker('clear');
  tracker.push('clear', 1);
  expect(tracker.takeSky(1)).toBeNull();
  expect(tracker.blend(1)).toBe(1);
});

test('K4: a later change blends over 10 s and the sky switches at the midpoint, once', () => {
  const tracker = createWeatherTracker('clear');
  tracker.push('clear', 0);
  tracker.push('rain', 100);
  expect(tracker.weather()).toBe('rain');
  expect(tracker.blend(100)).toBe(0);
  expect(tracker.blend(102.5)).toBeCloseTo(0.25, 9);
  expect(tracker.takeSky(104.9)).toBeNull();
  expect(tracker.takeSky(105)).toBe('rain');
  expect(tracker.takeSky(106)).toBeNull();
  expect(tracker.blend(110)).toBe(1);
});

test('K5: a repeat of the current weather does not restart the blend', () => {
  const tracker = createWeatherTracker('clear');
  tracker.push('clear', 0);
  tracker.push('rain', 100);
  tracker.push('rain', 104);
  expect(tracker.blend(105)).toBeCloseTo(0.5, 9);
});
