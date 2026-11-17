import { describe, expect, it } from 'vitest';
import * as icons from './icons';

describe('icons', () => {
  const entries = Object.entries(icons);
  it('T7 exports the nine icons', () => {
    expect(entries.map(([k]) => k).sort()).toEqual(
      ['ICON_COIN', 'ICON_FUEL', 'ICON_HEALTHKIT', 'ICON_HEART', 'ICON_HULL', 'ICON_JERRYCAN', 'ICON_SEAT', 'ICON_TAJINE', 'ICON_TOOLBOX'],
    );
  });
  for (const [name, svg] of entries) {
    it(`T7 ${name} is a safe inline svg`, () => {
      expect(typeof svg).toBe('string');
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).toContain('fill="currentColor"');
      expect(svg).not.toMatch(/\son[a-z]+\s*=/i);
      expect(svg).not.toContain('http');
      expect(svg.toLowerCase()).not.toContain('<script');
    });
  }
});
