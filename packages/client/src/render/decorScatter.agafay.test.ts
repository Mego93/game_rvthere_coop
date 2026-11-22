import { getCourse, getCourseDef } from '@lodgy/shared';
import { describe, expect, it } from 'vitest';
import { CAMP_ZONE, scatterDecor, seedFromId } from './decorScatter';
import { routeDistance } from './terrain';

const agafay = getCourse('agafay');
const placements = scatterDecor(agafay, getCourseDef('agafay'), seedFromId('agafay'));
const tents = placements.filter((p) => p.model === 'decor.tent');
const camels = placements.filter((p) => p.model === 'decor.camel');

describe('Agafay camps (step 41c)', () => {
  it('has tents and camels beside the road, several of each', () => {
    expect(tents.length).toBeGreaterThanOrEqual(5);
    expect(tents.length).toBeLessThanOrEqual(14);
    expect(camels.length).toBeGreaterThanOrEqual(tents.length);
  });

  it('keeps them beside the road, never on it or on the shoulders', () => {
    for (const tent of tents) {
      const { distance } = routeDistance(agafay, tent.x, tent.z);
      expect(distance).toBeGreaterThanOrEqual(CAMP_ZONE[0] - 6);
      expect(distance).toBeLessThanOrEqual(CAMP_ZONE[1] + 6);
    }
    for (const camel of camels) expect(routeDistance(agafay, camel.x, camel.z).distance).toBeGreaterThan(31);
  });

  it('stands each tent on the ground with camels within a stone\'s throw of a tent', () => {
    for (const tent of tents) expect(Number.isFinite(tent.y)).toBe(true);
    for (const camel of camels) expect(tents.some((tent) => Math.hypot(tent.x - camel.x, tent.z - camel.z) < 25)).toBe(true);
  });

  it('is the same every time, and the other courses have no tents', () => {
    expect(scatterDecor(agafay, getCourseDef('agafay'), seedFromId('agafay'))).toEqual(placements);
    const desert = getCourse('desert');
    const other = scatterDecor(desert, getCourseDef('desert'), seedFromId('desert'));
    expect(other.some((p) => p.model === 'decor.tent' || p.model === 'decor.camel')).toBe(false);
  });
});
