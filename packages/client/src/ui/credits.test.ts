import { readdirSync, readFileSync } from 'node:fs';
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

describe('Sketchfab credits (step 33)', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const files = readdirSync(new URL('../../public/models/sketchfab/', import.meta.url)).filter((name) => name.endsWith('.glb'));
  for (const [name, path] of [['root CREDITS.md', '../../../../CREDITS.md'], ['served credits', '../../public/CREDITS.md']] as const) {
    it(`${name} has an entry for every Sketchfab model, with its source, licence and the modification`, () => {
      const lines = read(path).split('\n');
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const entry = lines.find((line) => line.startsWith('- ') && line.includes(`\`${file}\``));
        expect(entry, file).toBeDefined();
        expect(entry, file).toContain('https://sketchfab.com/3d-models/');
        expect(entry, file).toMatch(/Licence: (CC BY 4\.0|CC0 1\.0)/);
        expect(entry, file).toContain('Modified: textures resized');
      }
    });
  }

  it('every Sketchfab model is in the folder License.txt, and the served credits list the two new skies', () => {
    const licence = read('../../public/models/sketchfab/License.txt');
    for (const file of files) expect(licence, file).toContain(`File: ${file}`);
    for (const sky of ['qwantani_night_puresky_1k.hdr', 'kloofendal_overcast_puresky_1k.hdr']) expect(read('../../public/CREDITS.md')).toContain(sky);
  });
});

describe('font credits (step 35)', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  for (const [name, path] of [['root CREDITS.md', '../../../../CREDITS.md'], ['served credits', '../../public/CREDITS.md']] as const) {
    it(`${name} names Rubik and Inter with the SIL Open Font License 1.1 and their source`, () => {
      const lines = read(path).split('\n');
      for (const [font, source] of [['Rubik', 'https://fontsource.org/fonts/rubik'], ['Inter', 'https://fontsource.org/fonts/inter']]) {
        const entry = lines.find((line) => line.startsWith('- ') && line.includes(`"${font}"`));
        expect(entry, font).toBeDefined();
        expect(entry, font).toContain('SIL Open Font License 1.1');
        expect(entry, font).toContain(source);
      }
    });
  }
});
