import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PLAYER_HEIGHT } from '@lodgy/shared';
import { describe, expect, it } from 'vitest';
import { fitToTarget } from './models';
import { MODEL_KEYS, MODEL_MANIFEST } from './modelManifest';

const PUBLIC = join(import.meta.dirname, '../../public');

const subfolders = (dir: string): string[] =>
  readdirSync(join(PUBLIC, dir)).filter((name) => statSync(join(PUBLIC, dir, name)).isDirectory());

describe('model manifest', () => {
  it('T2: keys are unique and listed once', () => {
    expect(new Set(MODEL_KEYS).size).toBe(MODEL_KEYS.length);
    expect(MODEL_KEYS.length).toBeGreaterThan(60);
  });

  it('T2: every file exists, is a .glb and sits in its pack folder', () => {
    for (const key of MODEL_KEYS) {
      const entry = MODEL_MANIFEST[key];
      expect(entry.file.endsWith('.glb'), key).toBe(true);
      expect(entry.file.startsWith(`${entry.pack}/`), key).toBe(true);
      expect(existsSync(join(PUBLIC, 'models', entry.file)), key).toBe(true);
    }
  });

  it('T2: target sizes are above 0 and at most 30 m, except distant cliffs and the kasbah landmark up to 40 m', () => {
    for (const key of MODEL_KEYS) {
      const { targetSize } = MODEL_MANIFEST[key];
      const sides = typeof targetSize === 'number' ? [targetSize] : [targetSize.x, targetSize.y, targetSize.z];
      const limit = key.startsWith('decor.cliff.') || key === 'decor.kasbah.landmark' ? 40 : 30;
      for (const side of sides) {
        expect(side, key).toBeGreaterThan(0);
        expect(side, key).toBeLessThanOrEqual(limit);
      }
    }
  });

  it('every model file stays small and every texture it names is beside it', () => {
    let total = 0;
    for (const key of MODEL_KEYS) {
      const path = join(PUBLIC, 'models', MODEL_MANIFEST[key].file);
      const bytes = readFileSync(path);
      total += bytes.length;
      const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()) as { images?: { uri?: string }[] };
      for (const image of json.images ?? []) {
        if (image.uri) expect(existsSync(join(path, '..', image.uri)), `${key} ${image.uri}`).toBe(true);
      }
    }
    expect(total).toBeLessThan(12 * 1024 * 1024);
  });
});

describe('step 40 models', () => {
  it('the trees, the house, the kasbah and the cars are fitted to their real size in metres', () => {
    expect(MODEL_MANIFEST['decor.pine'].targetSize).toBe(12);
    expect(MODEL_MANIFEST['decor.kasbah.landmark'].targetSize).toBe(40);
    expect(MODEL_MANIFEST['decor.car.hatchback'].targetSize).toBe(4);
    for (const key of ['decor.pine', 'decor.broadleaf', 'decor.adobe', 'decor.kasbah.landmark', 'decor.car.hatchback', 'decor.car.minicab'] as const) expect(MODEL_MANIFEST[key].pack, key).toBe('sketchfab');
  });
});

describe('step 41 models', () => {
  it('the villa furniture and outdoor models are manifest keys in the sketchfab pack', () => {
    const files = { 'villa.couch': 'couch', 'villa.kitchenIsland': 'kitchen-island', 'villa.diningSet': 'dining-set', 'villa.bed': 'bed', 'villa.laptop': 'laptop', 'villa.lounger': 'pool-lounger', 'villa.parasol': 'parasol', 'villa.atm': 'atm', 'villa.kiosk': 'shop-kiosk', 'villa.court': 'tennis-court-net', 'villa.treadmill': 'treadmill' } as const;
    for (const [key, name] of Object.entries(files)) {
      const entry = MODEL_MANIFEST[key as keyof typeof files];
      expect(entry.file, key).toBe(`sketchfab/${name}.glb`);
      expect(entry.pack, key).toBe('sketchfab');
    }
  });
});

describe('step 41b models', () => {
  it('the golf and arrival models are manifest keys in the sketchfab pack', () => {
    const files = { 'golf.ball': 'golf-ball', 'golf.driver': 'golf-driver', 'golf.flag': 'range-flag', 'golf.screen': 'range-screen', 'arrival.booth': 'rental-booth', 'arrival.terminal': 'terminal' } as const;
    for (const [key, name] of Object.entries(files)) {
      const entry = MODEL_MANIFEST[key as keyof typeof files];
      expect(entry.file, key).toBe(`sketchfab/${name}.glb`);
      expect(entry.pack, key).toBe('sketchfab');
    }
  });
});

describe('character fit', () => {
  it('T9: the character is fitted to the player height, not a literal', () => {
    expect(MODEL_MANIFEST['character.player'].targetSize).toBe(PLAYER_HEIGHT);
    const box = { min: { x: -0.3, y: 0, z: -0.2 }, max: { x: 0.3, y: 1.8, z: 0.2 } };
    const { scale } = fitToTarget(box, MODEL_MANIFEST['character.player'].targetSize);
    expect(1.8 * scale.y).toBeCloseTo(PLAYER_HEIGHT, 9);
    expect(scale.x).toBeCloseTo(scale.y, 9);
  });
});

describe('real vehicles', () => {
  it('both keys exist, point into the real pack and every credit names the files', () => {
    expect(MODEL_MANIFEST['vehicle.lodgy.real'].file).toBe('real/lodgy-merc_tv.glb');
    expect(MODEL_MANIFEST['vehicle.rv.real'].file).toBe('real/camper-libau.glb');
    const credits = readFileSync(join(PUBLIC, 'CREDITS.md'), 'utf8');
    for (const text of ['lodgy-merc_tv.glb', 'camper-libau.glb', 'Merc_TV', 'Libau Media', 'CC BY 4.0', 'simplified geometry and resized textures for real-time use']) {
      expect(credits, text).toContain(text);
    }
  });
});

describe('Sketchfab models (step 33)', () => {
  const swapped = { 'prop.crate': 'crate', 'prop.barrier': 'barrier', 'prop.cart': 'cart', 'prop.cone': 'cone', 'anchor.boulder': 'rocks' } as const;
  const added = {
    'item.jerrycan': 'jerrycan', 'item.toolbox': 'toolbox', 'item.healthKit': 'first-aid', 'item.tajine': 'tajine', coin: 'coin',
    'animal.goat': 'goat', 'animal.scooter': 'scooter', 'prop.scooter': 'scooter', 'decor.agave': 'agave', 'decor.kasbah': 'kasbah',
    'decor.mosque': 'mosque', 'decor.stall': 'stall', 'decor.tyres': 'tyres', 'decor.cliffs': 'cliffs', 'decor.mountains': 'mountains',
    'souleyman.headdress': 'headdress', 'item.treedent': 'treedent', 'item.fromageBlanc': 'fromage-blanc', 'item.kokeZero': 'koke-zero',
    'item.ammo': 'ammo', 'prop.gun': 'gun', 'enemy.knife': 'knife',
  } as const;

  it('T1: the swapped keys point into the sketchfab pack and the new keys exist', () => {
    for (const [key, name] of [...Object.entries(swapped), ...Object.entries(added)]) {
      const entry = MODEL_MANIFEST[key as keyof typeof MODEL_MANIFEST];
      expect(entry, key).toBeDefined();
      expect(entry.file, key).toBe(`sketchfab/${name}.glb`);
      expect(entry.pack, key).toBe('sketchfab');
    }
  });

  it('every Sketchfab file in the folder is named by a manifest key', () => {
    const named = new Set(MODEL_KEYS.map((key) => MODEL_MANIFEST[key].file).filter((file) => file.startsWith('sketchfab/')));
    const files = readdirSync(join(PUBLIC, 'models/sketchfab')).filter((name) => name.endsWith('.glb'));
    expect(files.filter((name) => !named.has(`sketchfab/${name}`))).toEqual([]);
  });
});

describe('model triangle budgets', () => {
  const triangles = (file: string): number => {
    const bytes = readFileSync(join(PUBLIC, 'models', file));
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()) as {
      accessors: { count: number }[];
      meshes: { primitives: { indices?: number; attributes: { POSITION: number } }[] }[];
    };
    let total = 0;
    for (const mesh of json.meshes) {
      for (const p of mesh.primitives) total += (json.accessors[p.indices ?? p.attributes.POSITION]?.count ?? 0) / 3;
    }
    return total;
  };

  // The models drawn once or a few times in the story's own worlds: the arrival terminal (9948), the buggy (8782), the tent (18190) and the camel (9262).
  const STORY_LIMITS: Record<string, number> = { 'arrival.terminal': 10_500, 'vehicle.buggy': 9_000, 'decor.tent': 18_500, 'decor.camel': 9_500 };

  it('A5: palms stay at most 1000 triangles, everything else at most 2500, the Sketchfab models at most 6500 (the mosque has 6110; a few story models have their own limit), the real vehicles at most 20000', () => {
    for (const key of MODEL_KEYS) {
      const pack = MODEL_MANIFEST[key].pack;
      const limit = STORY_LIMITS[key] ?? (pack === 'real' ? 20_000 : pack === 'sketchfab' ? 6500 : key.includes('palm') ? 1000 : 2500);
      expect(triangles(MODEL_MANIFEST[key].file), key).toBeLessThanOrEqual(limit);
    }
  });

  it('the real vehicle files are plain glTF: under 1.5 MB, no compression, no extensions a stock loader lacks', () => {
    for (const key of ['vehicle.lodgy.real', 'vehicle.rv.real'] as const) {
      const bytes = readFileSync(join(PUBLIC, 'models', MODEL_MANIFEST[key].file));
      expect(bytes.length, key).toBeLessThan(1.5 * 1024 * 1024);
      const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()) as { extensionsUsed?: string[]; extensionsRequired?: string[] };
      expect(json.extensionsUsed ?? [], key).toEqual([]);
      expect(json.extensionsRequired ?? [], key).toEqual([]);
      expect(triangles(MODEL_MANIFEST[key].file), key).toBeGreaterThan(1000);
    }
  });
});

describe('credits', () => {
  const credits = readFileSync(join(PUBLIC, 'CREDITS.md'), 'utf8');
  const headings = credits.split('\n').filter((line) => line.startsWith('## ')).map((line) => line.slice(3).trim());

  it('T1: every folder under models, textures and env has a section', () => {
    for (const pack of subfolders('models')) expect(headings, `models/${pack}`).toContain(`models/${pack}`);
    for (const name of subfolders('textures')) expect(headings, `textures/${name}`).toContain(`textures/${name}`);
    expect(headings).toContain('env');
    expect(headings).toContain('sounds');
  });

  it('T1: every section names a real folder and the sounds record is referenced', () => {
    for (const heading of headings) expect(existsSync(join(PUBLIC, heading)), heading).toBe(true);
    expect(credits).toContain('sounds/LICENSE.md');
    expect(existsSync(join(PUBLIC, 'sounds/LICENSE.md'))).toBe(true);
  });

  it('T1: every pack folder carries its licence file and every skies/texture file is under 2.5 MB / 600 KB', () => {
    for (const pack of subfolders('models')) expect(existsSync(join(PUBLIC, 'models', pack, 'License.txt')), pack).toBe(true);
    let sky = 0;
    for (const file of readdirSync(join(PUBLIC, 'env'))) {
      const size = statSync(join(PUBLIC, 'env', file)).size;
      expect(size, file).toBeLessThan(2.5 * 1024 * 1024);
      sky += size;
    }
    expect(sky).toBeLessThan(8 * 1024 * 1024);
    for (const name of subfolders('textures')) {
      for (const file of readdirSync(join(PUBLIC, 'textures', name))) {
        expect(statSync(join(PUBLIC, 'textures', name, file)).size, `${name}/${file}`).toBeLessThan(600 * 1024);
      }
    }
  });
});

describe('step 41c models', () => {
  it('the buggy, the tent, the camel, the table and the cushion are manifest keys in the sketchfab pack', () => {
    const files = { 'vehicle.buggy': 'dune-buggy', 'decor.tent': 'desert-tent', 'decor.camel': 'camel', 'camp.table': 'low-table', 'camp.cushion': 'floor-cushion' } as const;
    for (const [key, name] of Object.entries(files)) {
      const entry = MODEL_MANIFEST[key as keyof typeof files];
      expect(entry.file, key).toBe(`sketchfab/${name}.glb`);
      expect(entry.pack, key).toBe('sketchfab');
    }
  });
});
