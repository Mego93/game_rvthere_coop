import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CREDITS_FAILED, CREDITS_URL, loadCredits } from './credits';

const response = (body: string, init: { status?: number; type?: string } = {}) =>
  Promise.resolve(new Response(body, { status: init.status ?? 200, headers: { 'Content-Type': init.type ?? 'text/markdown; charset=utf-8' } }));

describe('loadCredits', () => {
  it('A12: returns the text of /CREDITS.md', async () => {
    const urls: string[] = [];
    const text = await loadCredits((url) => {
      urls.push(String(url));
      return response('# Credits\n\nDacia Lodgy, CC BY 4.0');
    });
    expect(urls).toEqual([CREDITS_URL]);
    expect(CREDITS_URL).toBe('/CREDITS.md');
    expect(text).toContain('CC BY 4.0');
  });

  it('A12: a network failure, an error status or a page that is not text gives the fallback line and never throws', async () => {
    expect(await loadCredits(() => Promise.reject(new Error('offline')))).toBe(CREDITS_FAILED);
    expect(await loadCredits(() => response('nope', { status: 404 }))).toBe(CREDITS_FAILED);
    expect(await loadCredits(() => response('<!doctype html><title>x</title>', { type: 'text/html' }))).toBe(CREDITS_FAILED);
    expect(await loadCredits(() => Promise.reject(undefined))).toBe(CREDITS_FAILED);
  });
});

describe('OpenStreetMap credit (R12, T13)', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  for (const [name, path] of [['root CREDITS.md', '../../../../CREDITS.md'], ['served credits', '../../public/CREDITS.md']] as const) {
    it(`T13 ${name} credits OpenStreetMap contributors under the ODbL with the copyright link`, () => {
      const text = read(path);
      expect(text).toContain('OpenStreetMap contributors');
      expect(text).toContain('ODbL');
      expect(text).toContain('https://www.openstreetmap.org/copyright');
    });
  }
});
