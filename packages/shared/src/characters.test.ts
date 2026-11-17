import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS, CHARACTER_NAMES, GLASSES_CHOICES, HAT_CHOICES, TOP_CHOICES, defaultAppearance, firstFreeCharacter, isAppearance } from './characters';
import { MAX_PLAYERS } from './constants';

describe('characters', () => {
  it('lists the six characters in slot order, one per player slot', () => {
    expect([...CHARACTER_IDS]).toEqual(['sounile', 'rafael', 'nandan', 'alexander', 'luiz', 'huu']);
    expect(CHARACTER_IDS.length).toBe(MAX_PLAYERS);
  });

  it('freezes the lists', () => {
    for (const list of [CHARACTER_IDS, GLASSES_CHOICES, TOP_CHOICES, HAT_CHOICES, CHARACTER_NAMES]) expect(Object.isFrozen(list)).toBe(true);
  });

  it('has the option lists', () => {
    expect([...GLASSES_CHOICES]).toEqual(['default', 'none', 'round']);
    expect([...TOP_CHOICES]).toEqual(['default', 'sweatshirt', 'suit']);
    expect([...HAT_CHOICES]).toEqual(['none', 'cap', 'fez']);
  });

  it('names every character', () => {
    expect(CHARACTER_NAMES).toEqual({ sounile: 'Sounile', rafael: 'Rafael', nandan: 'Nandan', alexander: 'Alexander', luiz: 'Luiz', huu: 'Huu' });
  });

  it('builds the default appearance', () => {
    expect(defaultAppearance('luiz')).toEqual({ characterId: 'luiz', glasses: 'default', top: 'default', hat: 'none' });
  });

  it('accepts every combination of known values', () => {
    for (const characterId of CHARACTER_IDS) for (const glasses of GLASSES_CHOICES) for (const top of TOP_CHOICES) for (const hat of HAT_CHOICES) expect(isAppearance({ characterId, glasses, top, hat })).toBe(true);
  });

  it('rejects unknown values, non-strings and non-objects', () => {
    const good = defaultAppearance('huu');
    expect(isAppearance({ ...good, characterId: 'bob' })).toBe(false);
    expect(isAppearance({ ...good, glasses: 'square' })).toBe(false);
    expect(isAppearance({ ...good, top: 'cape' })).toBe(false);
    expect(isAppearance({ ...good, hat: 'crown' })).toBe(false);
    expect(isAppearance({ ...good, hat: 3 })).toBe(false);
    expect(isAppearance({ ...good, characterId: 'toString' })).toBe(false);
    expect(isAppearance({ glasses: 'none', top: 'default', hat: 'none' })).toBe(false);
    for (const value of [null, undefined, 'huu', 5, [], [good]]) expect(isAppearance(value)).toBe(false);
  });

  it('picks the lowest free character', () => {
    expect(firstFreeCharacter([])).toBe('sounile');
    expect(firstFreeCharacter(['sounile'])).toBe('rafael');
    expect(firstFreeCharacter(['sounile', 'nandan'])).toBe('rafael');
    expect(firstFreeCharacter(['rafael', 'sounile', 'nandan', 'alexander', 'luiz'])).toBe('huu');
    expect(firstFreeCharacter(['huu'])).toBe('sounile');
    expect(firstFreeCharacter([...CHARACTER_IDS])).toBeNull();
  });
});
