import { EVENT_KINDS } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { EVENT_TOAST_SECONDS, SOULEYMAN_GREETING, createEventToast, eventToastText } from './eventToast';

test('T9: the goat, scooter, checkpoint and eat events have a toast, the others none', () => {
  expect(eventToastText('checkpoint')).toBe(SOULEYMAN_GREETING);
  expect(eventToastText('goatHit')).toBe('Goat!');
  expect(eventToastText('scooterHit')).toBe('Scooter!');
  expect(eventToastText('eat')).toBe('Tajine! Faster for 15 s');
  expect(EVENT_KINDS.filter((kind) => eventToastText(kind) !== null)).toEqual(['checkpoint', 'goatHit', 'scooterHit', 'eat']);
});

test('T9: a toast lasts EVENT_TOAST_SECONDS and a later one replaces it; other events show nothing', () => {
  const toast = createEventToast();
  expect(toast.current(0)).toBeNull();
  toast.show('hurt', 1);
  expect(toast.current(1)).toBeNull();
  toast.show('goatHit', 10);
  expect(toast.current(10 + EVENT_TOAST_SECONDS - 0.01)).toBe('Goat!');
  expect(toast.current(10 + EVENT_TOAST_SECONDS + 0.01)).toBeNull();
  toast.show('goatHit', 20);
  toast.show('scooterHit', 20.5);
  expect(toast.current(21)).toBe('Scooter!');
});
