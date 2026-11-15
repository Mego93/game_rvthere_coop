import { WINCH_MAX_LENGTH, WINCH_WARN_LENGTH } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { ropeColor } from './winchMesh';

test('the rope turns red from 26 m and stays red up to the 30 m maximum', () => {
  expect(WINCH_WARN_LENGTH).toBe(26);
  expect(WINCH_WARN_LENGTH).toBeLessThan(WINCH_MAX_LENGTH);
  expect(ropeColor(WINCH_WARN_LENGTH - 0.01)).toBe(0x1f2937);
  expect(ropeColor(WINCH_WARN_LENGTH)).toBe(0xdc2626);
  expect(ropeColor(WINCH_MAX_LENGTH)).toBe(0xdc2626);
});
