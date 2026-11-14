import { describe, expect, test } from 'vitest';
import type { ServiceStop } from './course';
import { IDENTITY, vec3 } from './math';
import { stopUsable } from './stops';

const zone = { center: vec3(8, 2, -20), halfExtents: vec3(2.5, 2, 5), rot: IDENTITY };
const fuel: ServiceStop = { id: 's-fuel', kind: 'fuel', zone, operatePoint: vec3(11.5, 0, -20), shopCounter: vec3(11.5, 0, -22) };
const garage: ServiceStop = { id: 's-garage', kind: 'garage', zone, operatePoint: vec3(11.5, 0, -20), shopCounter: null };
const inside = vec3(8, 1, -20);

describe('stopUsable (S3)', () => {
  test('a fuel stop is usable in the zone below full fuel', () => {
    expect(stopUsable(fuel, inside, 0.5, 1)).toBe(true);
  });
  test('a full tank is not usable, whatever the health', () => {
    expect(stopUsable(fuel, inside, 1, 0.2)).toBe(false);
  });
  test('0.01 m outside the zone is not usable', () => {
    expect(stopUsable(fuel, vec3(10.51, 1, -20), 0.5, 1)).toBe(false);
    expect(stopUsable(fuel, vec3(10.49, 1, -20), 0.5, 1)).toBe(true);
  });
  test('a garage with full health is not usable', () => {
    expect(stopUsable(garage, inside, 0.2, 1)).toBe(false);
  });
  test('a garage below full health is usable, whatever the fuel', () => {
    expect(stopUsable(garage, inside, 1, 0.5)).toBe(true);
  });
});
