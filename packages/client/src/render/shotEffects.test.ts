import { describe, expect, it } from 'vitest';
import { FLASH_SECONDS, TRACER_SECONDS, effectAlpha, tracerStart } from './shotEffects';

describe('shot effects (step 39)', () => {
  it('a tracer fades from 1 to 0 over TRACER_SECONDS, and is gone after', () => {
    expect(effectAlpha(0, TRACER_SECONDS)).toBe(1);
    expect(effectAlpha(TRACER_SECONDS / 2, TRACER_SECONDS)).toBeCloseTo(0.5, 9);
    expect(effectAlpha(TRACER_SECONDS, TRACER_SECONDS)).toBe(0);
    expect(effectAlpha(10, TRACER_SECONDS)).toBe(0);
    expect(effectAlpha(-1, TRACER_SECONDS)).toBe(1);
    expect(FLASH_SECONDS).toBeGreaterThan(0);
  });

  it('the tracer leaves from a point beside and below the eye on the shooter\'s right, not from the eye itself', () => {
    const eye = { x: 10, y: 1.3, z: -4 };
    // Shooting along -z: the right is +x.
    const start = tracerStart(eye, { x: 10, y: 1.3, z: -64 });
    expect(start.x).toBeGreaterThan(eye.x + 0.1);
    expect(start.y).toBeLessThan(eye.y - 0.1);
    expect(start.z).toBeCloseTo(eye.z - 0.3, 6);
    // Shooting along +x: the right is +z.
    const east = tracerStart(eye, { x: 70, y: 1.3, z: -4 });
    expect(east.z).toBeGreaterThan(eye.z + 0.1);
    expect(east.x).toBeCloseTo(eye.x + 0.3, 6);
  });

  it('a shot straight up or straight down, or of no length, still gives a finite start', () => {
    for (const to of [{ x: 0, y: 50, z: 0 }, { x: 0, y: -50, z: 0 }, { x: 0, y: 1.3, z: 0 }]) {
      const start = tracerStart({ x: 0, y: 1.3, z: 0 }, to);
      expect([start.x, start.y, start.z].every(Number.isFinite)).toBe(true);
    }
  });
});
