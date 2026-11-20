import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { MOUNTAIN_ANCHOR_SLOPE } from '../constants';
import { driveSegment } from './driveRig';
import { getCourse, getCourseDef } from './index';

declare const console: { info(...args: unknown[]): void };
beforeAll(async () => {
  await RAPIER.init();
});

const course = getCourse('mountain');
const def = getCourseDef('mountain')!;
const climbs = def.segments.flatMap((s, i) => (s.type === 'road' && s.slope && s.slope > 0 && s.slope < MOUNTAIN_ANCHOR_SLOPE ? [i] : []));

describe('mountain stage: Lodgy climbs every straight under 10 degrees without help (test 5)', () => {
  test('there are climbs to drive', () => {
    expect(climbs.length).toBeGreaterThan(0);
  });

  test.each(climbs)('segment %i', (i) => {
    const result = driveSegment(RAPIER, 'lodgy', course, i);
    console.info(`mountain segment ${i}: slope ${(def.segments[i] as { slope: number }).slope}, reached ${result.reached} in ${result.seconds.toFixed(1)} s`);
    expect(result.reached).toBe(true);
  }, 60000);
});
