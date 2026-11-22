import { expect, test } from 'vitest';
import { labelWithoutNumber, STAGE_BANNER_MS, stageBannerText } from './stageBanner';

test('V2: the banner names the stage number out of the total and the label without its number', () => {
  expect(stageBannerText({ courseId: 'valley', index: 1, of: 5 })).toBe('Stage 2 of 5: Bridge and forest');
  expect(stageBannerText({ courseId: 'desert', index: 0, of: 5 })).toBe('Stage 1 of 5: Desert');
  expect(stageBannerText({ courseId: 'mountain', index: 2, of: 5 })).toBe('Stage 3 of 5: Mountains');
  expect(stageBannerText({ courseId: 'city', index: 3, of: 5 })).toBe('Stage 4 of 5: City');
  expect(stageBannerText({ courseId: 'airport-road', index: 4, of: 5 })).toBe('Stage 5 of 5: To the airport');
});

test('V2: a course with no label shows its id, and only a leading number is dropped', () => {
  expect(stageBannerText({ courseId: 'test', index: 0, of: 2 })).toBe('Stage 1 of 2: test');
  expect(labelWithoutNumber('12 Big city')).toBe('Big city');
  expect(labelWithoutNumber('Full route')).toBe('Full route');
  expect(labelWithoutNumber('Route 66')).toBe('Route 66');
});

test('V2: the banner shows for 3 s', () => {
  expect(STAGE_BANNER_MS).toBe(3000);
});

test('story mode shows a title and never a stage count', () => {
  expect(stageBannerText({ courseId: 'arrival', index: 0, of: 1 }, true)).toBe('Arrival in Marrakech');
  expect(stageBannerText({ courseId: 'airport-home', index: 0, of: 1 }, true)).toBe('Drive home to the villa');
  expect(stageBannerText({ courseId: 'primegolf', index: 0, of: 1 }, true)).toBe('PrimeGolf');
  expect(stageBannerText({ courseId: 'desert', index: 0, of: 1 }, true)).toBe('Back to the desert');
  expect(stageBannerText({ courseId: 'test', index: 0, of: 1 }, true)).not.toMatch(/Stage/);
});

test('step 41c: the race and the camp have story titles', () => {
  expect(stageBannerText({ courseId: 'agafay', index: 0, of: 1 }, true)).toBe('Buggy race in Agafay');
  expect(stageBannerText({ courseId: 'camp', index: 0, of: 1 }, true)).toBe('Lunch at the desert camp');
  expect(stageBannerText({ courseId: 'agafay', index: 0, of: 1 })).toMatch(/^Stage 1 of 1:/);
});
