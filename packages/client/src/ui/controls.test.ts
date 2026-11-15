import { expect, test } from 'vitest';
import { KEY_BINDINGS } from '../input/keyboard';
import { CONTROLS, EXTRA_CODES, isHelpKey, missingFromControls } from './controls';

const plain = { code: 'KeyH', repeat: false, ctrlKey: false, metaKey: false, altKey: false };

test('T11: every key the keyboard reads appears in CONTROLS, and so do F3, Escape, M and H', () => {
  const listed = new Set(CONTROLS.flatMap((entry) => entry.keys));
  for (const binding of KEY_BINDINGS) expect(listed.has(binding.code), binding.code).toBe(true);
  for (const code of EXTRA_CODES) expect(listed.has(code), code).toBe(true);
  expect(missingFromControls()).toEqual([]);
});

test('T11: reset is X and help is H, and R stays reel out', () => {
  const action = (code: string) => CONTROLS.find((entry) => entry.keys.includes(code))?.action ?? '';
  expect(action('KeyX')).toMatch(/reset/i);
  expect(action('KeyH')).toMatch(/help/i);
  expect(action('KeyR')).toMatch(/reel out/i);
});

test('H opens the panel except while typing or with a modifier held', () => {
  expect(isHelpKey(plain, 'CANVAS')).toBe(true);
  expect(isHelpKey(plain, 'input')).toBe(false);
  expect(isHelpKey(plain, 'TEXTAREA')).toBe(false);
  expect(isHelpKey({ ...plain, ctrlKey: true }, null)).toBe(false);
  expect(isHelpKey({ ...plain, repeat: true }, null)).toBe(false);
  expect(isHelpKey({ ...plain, code: 'KeyJ' }, null)).toBe(false);
});
