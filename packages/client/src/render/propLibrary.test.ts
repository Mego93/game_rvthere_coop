import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL_KEYS, MODEL_MANIFEST } from './modelManifest';
import { PROP_THEMES, type PropTheme } from './propLibrary';

const PUBLIC = join(import.meta.dirname, '../../public');
const airport = PROP_THEMES.airport;

describe('prop library', () => {
  it('L1: every theme is declared; only the airport is filled in this step', () => {
    const themes: PropTheme[] = ['airport', 'city', 'souk', 'desert', 'forest', 'mountain', 'villa', 'golf'];
    expect(Object.keys(PROP_THEMES).sort()).toEqual([...themes].sort());
    for (const theme of themes) if (theme !== 'airport') expect(PROP_THEMES[theme], theme).toEqual([]);
  });

  it('L2: the airport has at least 25 props, each a manifest key with a positive size and a weight of 0 or more', () => {
    expect(airport.length).toBeGreaterThanOrEqual(25);
    expect(new Set(airport.map((entry) => entry.key)).size).toBe(airport.length);
    for (const entry of airport) {
      expect(MODEL_KEYS, entry.key).toContain(entry.key);
      expect(entry.size, entry.key).toBeGreaterThan(0);
      expect(entry.weight, entry.key).toBeGreaterThanOrEqual(0);
    }
  });

  it('L2: the airport has what the plan lists, in the right roles', () => {
    const roleOf = (key: string) => airport.find((entry) => entry.key === key)?.role;
    for (const key of ['airport.luggageTrolley', 'airport.suitcaseRolling', 'airport.suitcaseStack', 'airport.bin', 'airport.trafficCone', 'airport.crowdBarrier']) expect(roleOf(key), key).toBe('clutter');
    for (const key of ['airport.bench', 'airport.bollard', 'airport.planterUrn', 'airport.palmTall', 'airport.palmSlim', 'airport.palmPair', 'airport.taxi', 'airport.minibus', 'airport.carSedan', 'airport.carHatch', 'airport.wayfindingTotem', 'airport.kiosk', 'airport.lampPost', 'airport.flagPole', 'airport.busStopGlass', 'airport.boomGate']) expect(roleOf(key), key).toBe('roadside');
    for (const key of ['airport.arrivalsBoard', 'airport.signGate']) expect(roleOf(key), key).toBe('wall');
    expect(roleOf('airport.personSuit')).toBe('crowd');
    expect(roleOf('airport.fountain')).toBe('landmark');
    for (const key of ['arrival.terminal', 'airport.garage', 'airport.rentalOffice']) expect(roleOf(key), key).toBe('building');
  });

  it('L2: the vehicles and buildings are placed by hand, so their weight is 0; the dressed roles each have a weighted prop for phones', () => {
    for (const entry of airport.filter((e) => e.role === 'building' || e.role === 'landmark' || /taxi|minibus|carSedan|carHatch/.test(e.key))) expect(entry.weight, entry.key).toBe(0);
    for (const role of ['clutter', 'roadside', 'wall', 'crowd'] as const) {
      expect(airport.filter((e) => e.role === role && e.weight > 0 && e.phone).length, role).toBeGreaterThan(0);
    }
  });

  it('every airport model is credited, in both credit files and in the folder licence', () => {
    const files = [...new Set(airport.map((entry) => MODEL_MANIFEST[entry.key].file.replace('sketchfab/', '')))];
    const texts = [readFileSync(join(PUBLIC, 'CREDITS.md'), 'utf8'), readFileSync(join(import.meta.dirname, '../../../../CREDITS.md'), 'utf8')];
    const licence = readFileSync(join(PUBLIC, 'models/sketchfab/License.txt'), 'utf8');
    for (const file of files) {
      for (const text of texts) expect(text.split('\n').find((line) => line.startsWith('- ') && line.includes(`\`${file}\``)), file).toContain('CC BY 4.0');
      expect(licence, file).toContain(`File: ${file}`);
    }
  });
});

describe('download budget (test 6)', () => {
  it('the arrival\'s new model files add at most 6 MB', () => {
    const files = new Set(MODEL_KEYS.filter((key) => key.startsWith('airport.')).map((key) => MODEL_MANIFEST[key].file));
    expect(files.size).toBeGreaterThanOrEqual(25);
    let total = 0;
    for (const file of files) total += statSync(join(PUBLIC, 'models', file)).size;
    expect(total).toBeLessThanOrEqual(6 * 1024 * 1024);
  });
});
