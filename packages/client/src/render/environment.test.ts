import { describe, expect, test } from 'vitest';
import { conditionsLook } from './conditions';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { hasSky, skyFor, skyYaw, SKY_COUNT, SKY_FILES, SKY_SUN_AZIMUTH } from './environment';

const TIMES = ['dawn', 'midday', 'sunset', 'night'] as const;
const azimuth = (time: (typeof TIMES)[number]) => {
  const { x, z } = conditionsLook(time, 'clear').sunDirection;
  return (Math.atan2(z, x) * 180) / Math.PI;
};
const wrapped = (degrees: number) => (((degrees + 180) % 360) + 360) % 360 - 180;

describe('sky', () => {
  test('each time of day and the overcast sky have their own file and the yaw shows the file\'s sun in the sun direction', () => {
    expect(new Set(Object.values(SKY_FILES)).size).toBe(5);
    expect(SKY_COUNT).toBe(5);
    for (const time of TIMES) {
      for (const weather of ['clear', 'rain', 'sandstorm'] as const) {
        const yaw = skyYaw(time, undefined, weather);
        expect(yaw).toBeGreaterThanOrEqual(-180);
        expect(yaw).toBeLessThan(180);
        expect(Math.abs(wrapped(SKY_SUN_AZIMUTH[skyFor(time, weather)] - yaw - azimuth(time)))).toBeLessThan(1e-9);
      }
    }
  });

  test('D4: rain and a sandstorm use the overcast sky by day, the night sky stays the night sky, clear weather follows the time', () => {
    for (const time of ['dawn', 'midday', 'sunset'] as const) {
      expect(skyFor(time, 'clear')).toBe(time);
      expect(skyFor(time, 'rain')).toBe('overcast');
      expect(skyFor(time, 'sandstorm')).toBe('overcast');
    }
    for (const weather of ['clear', 'rain', 'sandstorm'] as const) expect(skyFor('night', weather)).toBe('night');
    expect(SKY_FILES.overcast).toBe('kloofendal_overcast_puresky_1k.hdr');
  });

  test('every sky file is in public/env', () => {
    for (const file of Object.values(SKY_FILES)) expect(existsSync(join(import.meta.dirname, '../../public/env', file)), file).toBe(true);
  });

  test('no sky is loaded until preloadSkies has run', () => {
    expect(hasSky('midday')).toBe(false);
  });
});
