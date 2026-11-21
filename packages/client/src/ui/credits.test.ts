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

  it('step 39: the recoloured models say so and the can keeps its modified title', () => {
    for (const path of ['../../../../CREDITS.md', '../../public/CREDITS.md']) {
      const lines = read(path).split('\n');
      for (const file of ['treedent.glb', 'fromage-blanc.glb', 'koke-zero.glb']) expect(lines.find((line) => line.includes(`\`${file}\``)), file).toContain('recoloured');
      expect(lines.find((line) => line.includes('`koke-zero.glb`'))).toContain('"Soda Can (modified)" by x2w-soda (https://sketchfab.com/x2w-soda)');
    }
  });

  it('step 40: the minicab is credited as "Minicab 2005 (modified)" with its logos painted out, and every new model has a credit', () => {
    for (const path of ['../../../../CREDITS.md', '../../public/CREDITS.md']) {
      const lines = read(path).split('\n');
      const cab = lines.find((line) => line.includes('`car-minicab.glb`'))!;
      expect(cab).toContain('"Minicab 2005 (modified)" by own.guest (https://sketchfab.com/own.guest)');
      expect(cab).not.toContain('Mitsubishi');
      expect(cab).toContain('painted out');
      for (const file of ['pine.glb', 'broadleaf.glb', 'adobe-house.glb', 'kasbah-abh.glb', 'car-hatchback.glb']) expect(lines.find((line) => line.includes(`\`${file}\``)), file).toContain('CC BY 4.0');
    }
    expect(read('../../public/models/sketchfab/License.txt')).toContain('Minicab 2005 (modified) by own.guest');
  });

  it('step 41: the laptop is credited as "Laptop (modified)", recoloured with the logo painted out, and the villa models are credited', () => {
    for (const path of ['../../../../CREDITS.md', '../../public/CREDITS.md']) {
      const lines = read(path).split('\n');
      const laptop = lines.find((line) => line.includes('`laptop.glb`'))!;
      expect(laptop).toContain('"Laptop (modified)" by senthil123 (https://sketchfab.com/senthil123)');
      expect(laptop).toContain('recoloured');
      expect(laptop).toContain('logo');
      for (const file of ['couch.glb', 'kitchen-island.glb', 'dining-set.glb', 'bed.glb', 'pool-lounger.glb', 'parasol.glb', 'atm.glb', 'shop-kiosk.glb', 'tennis-court-net.glb', 'treadmill.glb']) expect(lines.find((line) => line.includes(`\`${file}\``)), file).toContain('CC BY 4.0');
    }
    expect(read('../../public/models/sketchfab/License.txt')).toContain('Laptop (modified) by senthil123');
  });

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
