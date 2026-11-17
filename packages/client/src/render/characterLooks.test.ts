import { CHARACTER_IDS, PLAYER_COLOUR_PATTERN } from '@lodgy/shared';
import { describe, expect, test } from 'vitest';
import { CHARACTER_LOOKS, FACIAL_STYLES, HAIR_STYLES, OUTFITS } from './characterLooks';

const HEX = /^#[0-9a-f]{6}$/;

describe('CHARACTER_LOOKS', () => {
  test('has a look for exactly the six characters', () => {
    expect(Object.keys(CHARACTER_LOOKS).sort()).toEqual([...CHARACTER_IDS].sort());
  });

  test.each([...CHARACTER_IDS])('%s uses valid lowercase hex colours and known styles', (id) => {
    const look = CHARACTER_LOOKS[id];
    const colours = [look.top, look.trousers, look.hair.colour, ...(look.trim ? [look.trim] : []), ...(look.under ? [look.under] : [])];
    for (const colour of colours) {
      expect(colour).toMatch(HEX);
      expect(PLAYER_COLOUR_PATTERN.test(colour)).toBe(true);
    }
    expect(HAIR_STYLES).toContain(look.hair.style);
    expect(FACIAL_STYLES).toContain(look.facial);
    expect(OUTFITS).toContain(look.outfit);
    expect(['none', 'round']).toContain(look.glasses);
  });

  test('rafael and huu have round glasses by default and the others do not', () => {
    for (const id of CHARACTER_IDS) expect(CHARACTER_LOOKS[id].glasses).toBe(id === 'rafael' || id === 'huu' ? 'round' : 'none');
  });

  test('the defaults match the roadmap list', () => {
    const summary = Object.fromEntries(CHARACTER_IDS.map((id) => [id, [CHARACTER_LOOKS[id].outfit, CHARACTER_LOOKS[id].hair.style, CHARACTER_LOOKS[id].facial]]));
    expect(summary).toEqual({
      sounile: ['halfzip', 'short', 'moustache'],
      rafael: ['jacket', 'bald', 'beard'],
      nandan: ['sweater', 'wavy', 'none'],
      alexander: ['cardigan', 'short', 'none'],
      luiz: ['hoodie', 'swept', 'none'],
      huu: ['tee', 'long', 'none'],
    });
  });

  test('only alexander has trim, and only nandan and rafael show a garment underneath', () => {
    expect(CHARACTER_IDS.filter((id) => CHARACTER_LOOKS[id].trim)).toEqual(['alexander']);
    expect(CHARACTER_IDS.filter((id) => CHARACTER_LOOKS[id].under)).toEqual(['rafael', 'nandan']);
  });

  test('colours match the descriptions: black tops, light jeans, olive and beige trousers, light hair for luiz', () => {
    const luma = (hex: string) => (parseInt(hex.slice(1, 3), 16) * 0.3 + parseInt(hex.slice(3, 5), 16) * 0.59 + parseInt(hex.slice(5, 7), 16) * 0.11) / 255;
    for (const id of ['sounile', 'luiz', 'huu'] as const) expect(luma(CHARACTER_LOOKS[id].top)).toBeLessThan(0.15);
    expect(luma(CHARACTER_LOOKS.alexander.top)).toBeGreaterThan(0.75);
    expect(luma(CHARACTER_LOOKS.sounile.trousers)).toBeGreaterThan(0.5);
    expect(CHARACTER_LOOKS.rafael.trousers).toBe(CHARACTER_LOOKS.alexander.trousers);
    expect(CHARACTER_LOOKS.nandan.trousers).toBe(CHARACTER_LOOKS.luiz.trousers);
    expect(luma(CHARACTER_LOOKS.luiz.hair.colour)).toBeGreaterThan(0.6);
    for (const id of ['sounile', 'nandan', 'alexander', 'huu'] as const) expect(luma(CHARACTER_LOOKS[id].hair.colour)).toBeLessThan(0.2);
  });

  test('is frozen', () => {
    expect(Object.isFrozen(CHARACTER_LOOKS)).toBe(true);
    expect(Object.isFrozen(CHARACTER_LOOKS.rafael)).toBe(true);
    expect(Object.isFrozen(CHARACTER_LOOKS.rafael.hair)).toBe(true);
  });
});
