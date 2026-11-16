import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dir = new URL('../../packages/shared/src/courses/', import.meta.url);

describe('route files carry no geographic text', () => {
  for (const name of ['marrakech.route.ts', 'marrakech.generated.ts']) {
    it(name, () => {
      const source = readFileSync(new URL(name, dir), 'utf8');
      // `lateral` is a placement field, not a coordinate.
      expect(source).not.toMatch(/\blat\b|\blon\b|\blng\b|latitude|longitude/i);
      expect(source).not.toMatch(/\d{2}\.\d{4,}/);
    });
  }
});
