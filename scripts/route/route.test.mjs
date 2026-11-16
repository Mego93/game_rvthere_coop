import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// A word starting lat, lon or lng; `lateral` and `long` are fine, `along` has no word boundary before lon.
const GEOGRAPHIC = /\b(lat(?!eral\b)|lon(?!g\b)|lng)/i;

const dir = new URL('../../packages/shared/src/courses/', import.meta.url);

describe('route files carry no geographic text', () => {
  for (const name of ['marrakech.route.ts', 'marrakech.generated.ts']) {
    it(name, () => {
      const source = readFileSync(new URL(name, dir), 'utf8');
      expect(source).not.toMatch(GEOGRAPHIC);
      expect(source).not.toMatch(/\d{2}\.\d{4,}/);
    });
  }
});

describe('the geographic text guard', () => {
  it('catches coordinate-like names and leaves placement fields alone', () => {
    for (const bad of ['lat1', 'lonX', 'latY', 'latlon', 'latitude', 'longitude']) expect(bad).toMatch(GEOGRAPHIC);
    for (const ok of ['along: 3', 'lateral: -2.5', 'long']) expect(ok).not.toMatch(GEOGRAPHIC);
  });
});
