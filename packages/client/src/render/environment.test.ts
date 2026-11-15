import { describe, expect, test } from 'vitest';
import { conditionsLook } from './conditions';
import { hasSky, skyYaw, SKY_FILES, SKY_SUN_AZIMUTH } from './environment';

const TIMES = ['dawn', 'midday', 'sunset', 'night'] as const;
const azimuth = (time: (typeof TIMES)[number]) => {
  const { x, z } = conditionsLook(time, 'clear').sunDirection;
  return (Math.atan2(z, x) * 180) / Math.PI;
};
const wrapped = (degrees: number) => (((degrees + 180) % 360) + 360) % 360 - 180;

describe('sky', () => {
  test('each time of day has its own file and the yaw shows the file\'s sun in the sun direction', () => {
    expect(new Set(Object.values(SKY_FILES)).size).toBe(4);
    for (const time of TIMES) {
      const yaw = skyYaw(time);
      expect(yaw).toBeGreaterThanOrEqual(-180);
      expect(yaw).toBeLessThan(180);
      expect(Math.abs(wrapped(SKY_SUN_AZIMUTH[time] - yaw - azimuth(time)))).toBeLessThan(1e-9);
    }
  });

  test('no sky is loaded until preloadSkies has run', () => {
    expect(hasSky('midday')).toBe(false);
  });
});
