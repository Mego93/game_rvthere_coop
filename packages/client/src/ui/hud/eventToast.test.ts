import { EVENT_KINDS } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { EVENT_TOAST_SECONDS, SOULEYMAN_GREETING, STORY_TOAST_SECONDS, createEventToast, eventToastText, toastFor } from './eventToast';

test('T9, T14: the goat, scooter, checkpoint, out-of-bounds and eat events have a toast, the others none', () => {
  expect(eventToastText('checkpoint')).toBe(SOULEYMAN_GREETING);
  expect(eventToastText('goatHit')).toBe('Goat!');
  expect(eventToastText('scooterHit')).toBe('Scooter!');
  expect(eventToastText('outOfBounds')).toBe('Back to the road');
  expect(eventToastText('eat')).toBe('Power-up!');
  expect(EVENT_KINDS.filter((kind) => eventToastText(kind) !== null)).toEqual(['checkpoint', 'goatHit', 'scooterHit', 'outOfBounds', 'eat']);
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

test('T10: the eat toast shows only to the eater, other events to everyone', () => {
  expect(toastFor({ kind: 'eat', playerId: 'p1' }, 'p1')).toBe(true);
  expect(toastFor({ kind: 'eat', playerId: 'p2' }, 'p1')).toBe(false);
  expect(toastFor({ kind: 'eat' }, 'p1')).toBe(false);
  expect(toastFor({ kind: 'outOfBounds', playerId: 'p1' }, 'p1')).toBe(true);
  expect(toastFor({ kind: 'outOfBounds', playerId: 'p2' }, 'p1')).toBe(false);
  expect(toastFor({ kind: 'goatHit', playerId: 'p2' }, 'p1')).toBe(true);
  expect(toastFor({ kind: 'checkpoint' }, 'p1')).toBe(true);
});

test('step 39: the eat toast names the item and falls back to Power-up! for one it does not know', () => {
  expect(eventToastText('eat', 'treedent')).toBe('Treedent! Faster for 15 s');
  expect(eventToastText('eat', 'fromageBlanc')).toBe('Fromage blanc! Shield of 30 for 30 s');
  expect(eventToastText('eat', 'kokeZero')).toBe('Koke Zero! Double damage for 20 s');
  expect(eventToastText('eat', 'tajine')).toBe('Tajine! +40 health');
  expect(eventToastText('eat', 'ammo')).toBe('Ammo! +12 rounds');
  expect(eventToastText('eat', 'toString')).toBe('Power-up!');
  expect(eventToastText('eat')).toBe('Power-up!');
  expect(eventToastText('goatHit', 'treedent')).toBe('Goat!');
  const toast = createEventToast();
  toast.show('eat', 5, 'kokeZero');
  expect(toast.current(5.5)).toBe('Koke Zero! Double damage for 20 s');
});

test('step 41: a story toast shows its own text for STORY_TOAST_SECONDS and an event toast after it takes the short time again', () => {
  const toast = createEventToast();
  toast.showText('Raph is at the WC', 5);
  expect(toast.current(5 + STORY_TOAST_SECONDS - 0.01)).toBe('Raph is at the WC');
  expect(toast.current(5 + STORY_TOAST_SECONDS + 0.01)).toBeNull();
  toast.show('goatHit', 20);
  expect(toast.current(20 + EVENT_TOAST_SECONDS + 0.01)).toBeNull();
});
