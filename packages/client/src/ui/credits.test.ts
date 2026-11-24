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
        expect(entry, file).toMatch(/Modified: (textures resized|simplified)/);
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

  it('step 41b: the driver is credited as "Golf driver (modified)" with no brand name, and the golf and arrival models are credited', () => {
    for (const path of ['../../../../CREDITS.md', '../../public/CREDITS.md', '../../public/models/sketchfab/License.txt']) {
      const text = read(path);
      expect(text, path).toContain('Golf driver (modified)');
      expect(text, path).toContain('paulekins2007');
      for (const brand of ['Callaway', 'Maverik', 'MAVRIK']) expect(text, `${path} ${brand}`).not.toContain(brand);
    }
    for (const path of ['../../../../CREDITS.md', '../../public/CREDITS.md']) {
      const lines = read(path).split('\n');
      const driver = lines.find((line) => line.includes('`golf-driver.glb`'))!;
      expect(driver).toContain('"Golf driver (modified)" by paulekins2007 (https://sketchfab.com/paulekins2007)');
      expect(driver).toContain('painted out');
      for (const file of ['golf-ball.glb', 'range-flag.glb', 'range-screen.glb', 'rental-booth.glb', 'terminal.glb']) expect(lines.find((line) => line.includes(`\`${file}\``)), file).toContain('CC BY 4.0');
    }
  });

  it('step 41c: the buggy, the tent, the camel, the table and the cushion are credited with author, source and licence', () => {
    const models = {
      'dune-buggy.glb': ['XP_Frost', 'c9838cac69904010923d5024168b0893'],
      'desert-tent.glb': ['omarme37', 'f3bb254a2fbe449e9450fe999a538d0a'],
      'camel.glb': ['omarme37', '44ef2ea4b50a49e395e5e3ebbdc99f98'],
      'low-table.glb': ['Oussama Laabidate', 'aada3f7586db4cf5a86c19148bfbcf02'],
      'floor-cushion.glb': ['Geraldo Pratama Wahyu Teddy', '016627cce41a42cfb48db34becd7cbd8'],
    } as const;
    for (const path of ['../../../../CREDITS.md', '../../public/CREDITS.md']) {
      const lines = read(path).split('\n');
      for (const [file, [author, uid]] of Object.entries(models)) {
        const line = lines.find((entry) => entry.includes(`\`${file}\``));
        expect(line, `${path} ${file}`).toBeDefined();
        expect(line, `${path} ${file}`).toContain(author);
        expect(line, `${path} ${file}`).toContain(`https://sketchfab.com/3d-models/${uid}`);
        expect(line, `${path} ${file}`).toContain('CC BY 4.0');
        expect(line, `${path} ${file}`).toContain('Modified:');
      }
    }
    const licence = read('../../public/models/sketchfab/License.txt');
    for (const [file, [author]] of Object.entries(models)) {
      expect(licence, file).toContain(`File: ${file}`);
      expect(licence, file).toContain(` by ${author}`);
    }
  });

  it('step 43a: the airport models are credited with author, source and licence, and no title names a car maker, a brand or a game', () => {
    const models = { 'taxi.glb': ['TSB3DMODELS'], 'minibus.glb': ['aeroux'], 'luggage-trolley.glb': ['iDamian'], 'building-garage.glb': ['tikoavp'], 'person-suit.glb': ['jetsu'] } as const;
    for (const path of ['../../../../CREDITS.md', '../../public/CREDITS.md', '../../public/models/sketchfab/License.txt']) {
      const text = read(path);
      for (const word of ['Carbon Motors', 'CARBON MOTORS', 'Cities Skylines', 'Toyota', 'Fallout']) expect(text, `${path} ${word}`).not.toContain(word);
    }
    for (const path of ['../../../../CREDITS.md', '../../public/CREDITS.md']) {
      const lines = read(path).split('\n');
      for (const [file, [author]] of Object.entries(models)) {
        const line = lines.find((entry) => entry.includes(`\`${file}\``));
        expect(line, `${path} ${file}`).toContain(`by ${author} (https://sketchfab.com/${author})`);
        expect(line, `${path} ${file}`).toContain('Modified:');
      }
      expect(lines.find((entry) => entry.includes('`taxi.glb`'))).toContain('"E7 Taxi (modified)"');
    }
    expect(files).not.toContain('person-woman.glb');
    expect(files).not.toContain('person-girl.glb');
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
