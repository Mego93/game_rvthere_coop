import { describe, expect, it } from 'vitest';
import { KEY_BINDINGS } from '../../input/keyboard';
import { CONTROLS, EXTRA_CODES } from '../controls';
import { isComplainKey, isPhoneKey } from './storyUi';

const key = (code: string, over: Partial<{ repeat: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({ code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, ...over });

describe('story keys', () => {
  it('opens the phone on P, not while typing, repeating or with a modifier', () => {
    expect(isPhoneKey(key('KeyP'), null)).toBe(true);
    expect(isPhoneKey(key('KeyP'), 'INPUT')).toBe(false);
    expect(isPhoneKey(key('KeyP', { repeat: true }), null)).toBe(false);
    expect(isPhoneKey(key('KeyP', { ctrlKey: true }), null)).toBe(false);
    expect(isPhoneKey(key('KeyO'), null)).toBe(false);
  });

  it('complains on Z, because C is crouch, and the same rules apply', () => {
    expect(isComplainKey(key('KeyZ'), null)).toBe(true);
    expect(isComplainKey(key('KeyC'), null)).toBe(false);
    expect(isComplainKey(key('KeyZ'), 'TEXTAREA')).toBe(false);
  });

  it('uses no key the keyboard source reads, and the controls panel lists both', () => {
    const read = new Set(KEY_BINDINGS.map((binding) => binding.code));
    expect(read.has('KeyP')).toBe(false);
    expect(read.has('KeyZ')).toBe(false);
    expect(EXTRA_CODES).toContain('KeyP');
    expect(EXTRA_CODES).toContain('KeyZ');
    expect(CONTROLS.some((entry) => entry.keys.includes('KeyP'))).toBe(true);
    expect(CONTROLS.some((entry) => entry.keys.includes('KeyZ'))).toBe(true);
  });
});
