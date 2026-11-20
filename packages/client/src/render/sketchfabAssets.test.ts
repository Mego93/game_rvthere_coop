import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const PUBLIC = join(import.meta.dirname, '../../public');
const FOLDER = join(PUBLIC, 'models/sketchfab');
const NAMES = [
  'jerrycan', 'toolbox', 'first-aid', 'tajine', 'coin', 'crate', 'barrier', 'cart', 'scooter', 'goat', 'rocks',
  'tyres', 'cone', 'agave', 'cliffs', 'kasbah', 'mosque', 'stall', 'mountains', 'headdress', 'treedent', 'fromage-blanc', 'koke-zero', 'ammo', 'gun', 'knife',
  'pine', 'broadleaf', 'adobe-house', 'kasbah-abh', 'car-hatchback', 'car-minicab',
];

test('T2: the 32 Sketchfab files exist, add at most 8 MB and none is over 1.5 MB', () => {
  const files = readdirSync(FOLDER).filter((name) => name.endsWith('.glb'));
  expect(files.sort()).toEqual(NAMES.map((name) => `${name}.glb`).sort());
  let total = 0;
  for (const file of files) {
    const size = statSync(join(FOLDER, file)).size;
    expect(size, file).toBeLessThanOrEqual(1.5 * 1024 * 1024);
    total += size;
  }
  expect(total).toBeLessThanOrEqual(8 * 1024 * 1024);
});

test('T2: the night and overcast skies exist', () => {
  for (const file of ['qwantani_night_puresky_1k.hdr', 'kloofendal_overcast_puresky_1k.hdr']) {
    expect(existsSync(join(PUBLIC, 'env', file)), file).toBe(true);
  }
});
