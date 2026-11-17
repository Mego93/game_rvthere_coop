import { EMOTES } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { EMOTE_LABELS, emoteForKey, emoteWheelAllowed, isEmoteKey } from './emoteWheel';

const base = { phase: 'playing', seated: false, downed: false, open: false } as const;

test('W1: the wheel may open only in a run, on foot, upright, with nothing else open', () => {
  expect(emoteWheelAllowed(base)).toBe(true);
  expect(emoteWheelAllowed({ ...base, phase: 'lobby' })).toBe(false);
  expect(emoteWheelAllowed({ ...base, phase: 'results' })).toBe(false);
  expect(emoteWheelAllowed({ ...base, seated: true })).toBe(false);
  expect(emoteWheelAllowed({ ...base, downed: true })).toBe(false);
  expect(emoteWheelAllowed({ ...base, open: true })).toBe(false);
});

test('W2: B opens the wheel, except in a field, repeating or with a shortcut modifier', () => {
  const key = { code: 'KeyB', repeat: false, ctrlKey: false, metaKey: false, altKey: false };
  expect(isEmoteKey(key, null)).toBe(true);
  expect(isEmoteKey(key, 'CANVAS')).toBe(true);
  expect(isEmoteKey({ ...key, code: 'KeyV' }, null)).toBe(false);
  expect(isEmoteKey({ ...key, repeat: true }, null)).toBe(false);
  expect(isEmoteKey({ ...key, ctrlKey: true }, null)).toBe(false);
  expect(isEmoteKey({ ...key, metaKey: true }, null)).toBe(false);
  expect(isEmoteKey({ ...key, altKey: true }, null)).toBe(false);
  for (const tag of ['INPUT', 'select', 'TEXTAREA']) expect(isEmoteKey(key, tag)).toBe(false);
});

test('W3: keys 1 to 4 pick the four emotes in order, other keys pick nothing', () => {
  expect(['Digit1', 'Digit2', 'Digit3', 'Digit4'].map(emoteForKey)).toEqual([...EMOTES]);
  expect(emoteForKey('Digit5')).toBeNull();
  expect(emoteForKey('KeyA')).toBeNull();
});

test('W4: every emote has a label', () => {
  expect(Object.keys(EMOTE_LABELS).sort()).toEqual([...EMOTES].sort());
  expect(EMOTE_LABELS.sixSeven).toBe('6-7');
});
