import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const PUBLIC = join(import.meta.dirname, '../../public');
const FOLDER = join(PUBLIC, 'models/sketchfab');
const NAMES = [
  'jerrycan', 'toolbox', 'first-aid', 'tajine', 'coin', 'crate', 'barrier', 'cart', 'scooter', 'goat', 'rocks',
  'tyres', 'cone', 'agave', 'cliffs', 'kasbah', 'mosque', 'stall', 'mountains', 'headdress', 'treedent', 'fromage-blanc', 'koke-zero', 'ammo', 'gun', 'knife',
  'pine', 'broadleaf', 'adobe-house', 'kasbah-abh', 'car-hatchback', 'car-minicab',
  'couch', 'kitchen-island', 'dining-set', 'bed', 'laptop', 'pool-lounger', 'parasol', 'atm', 'shop-kiosk', 'tennis-court-net', 'treadmill',
  'golf-ball', 'golf-driver', 'range-flag', 'range-screen', 'rental-booth', 'terminal',
  'dune-buggy', 'desert-tent', 'camel', 'low-table', 'floor-cushion',
];
// Step 43a: the airport theme (the A-pose and T-pose people wait for 43b).
const AIRPORT_NAMES = [
  'luggage-trolley', 'suitcase-rolling', 'suitcase-stack', 'baggage-cart', 'cafe-set', 'bin', 'traffic-cone', 'crowd-barrier', 'turnstile',
  'boom-gate', 'bench-modern', 'seats-row', 'bollard-post', 'delineator', 'lamp-post', 'palm-tall', 'palm-slim', 'palm-pair', 'planter-urn', 'flag-pole',
  'wayfinding-totem', 'bus-stop-glass', 'bus-stop-shelter', 'kiosk', 'guard-booth', 'sign-gate', 'arrivals-board', 'sign-wc',
  'taxi', 'minibus', 'car-sedan', 'car-hatch', 'person-suit', 'fountain', 'building-garage', 'building-concourse', 'building-shop', 'building-rental-office',
];

test('T2: the 92 Sketchfab files exist, the first 54 add at most 8 MB, the 38 of step 43a at most 6 MB, and none is over 1.5 MB', () => {
  const files = readdirSync(FOLDER).filter((name) => name.endsWith('.glb'));
  expect(files.sort()).toEqual([...NAMES, ...AIRPORT_NAMES].map((name) => `${name}.glb`).sort());
  const sum = (names: readonly string[]) => names.reduce((total, name) => total + statSync(join(FOLDER, `${name}.glb`)).size, 0);
  for (const file of files) expect(statSync(join(FOLDER, file)).size, file).toBeLessThanOrEqual(1.5 * 1024 * 1024);
  expect(sum(NAMES)).toBeLessThanOrEqual(8 * 1024 * 1024);
  expect(sum(AIRPORT_NAMES)).toBeLessThanOrEqual(6 * 1024 * 1024);
});

test('T2: the night and overcast skies exist', () => {
  for (const file of ['qwantani_night_puresky_1k.hdr', 'kloofendal_overcast_puresky_1k.hdr']) {
    expect(existsSync(join(PUBLIC, 'env', file)), file).toBe(true);
  }
});
