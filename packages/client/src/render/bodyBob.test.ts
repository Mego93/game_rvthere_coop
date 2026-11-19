import { describe, expect, it } from 'vitest';
import { vec3 } from '@lodgy/shared';
import { MAX_LIFT, MAX_SHAKE, MAX_TILT, MAX_TILT_RV, bodyBob, cameraShake } from './bodyBob';

const rest = vec3(0, 0, 0);

describe('bodyBob', () => {
  it('is zero at rest', () => {
    expect(bodyBob(rest, rest, 1 / 60, 0)).toEqual({ pitch: 0, roll: 0, lift: 0 });
  });

  it('is zero for a zero or negative step', () => {
    expect(bodyBob(rest, vec3(5, 5, -5), 0, 10)).toEqual({ pitch: 0, roll: 0, lift: 0 });
  });

  it('squats nose up when speeding up and dips nose down when braking', () => {
    expect(bodyBob(vec3(0, 0, -10), vec3(0, 0, -10.2), 1 / 60, 10).pitch).toBeGreaterThan(0);
    expect(bodyBob(vec3(0, 0, -10), vec3(0, 0, -9.8), 1 / 60, 10).pitch).toBeLessThan(0);
  });

  it('rolls with the lateral acceleration', () => {
    expect(bodyBob(rest, vec3(0.2, 0, 0), 1 / 60, 10).roll).toBeGreaterThan(0);
    expect(bodyBob(rest, vec3(-0.2, 0, 0), 1 / 60, 10).roll).toBeLessThan(0);
  });

  it('clamps pitch and roll to 0.03 rad (0.02 for the RV) and lift to 0.03 m', () => {
    const wild = bodyBob(rest, vec3(1000, 1000, -1000), 1 / 60, 40);
    expect(MAX_TILT).toBe(0.03);
    expect(MAX_LIFT).toBe(0.03);
    expect(Math.abs(wild.pitch)).toBeLessThanOrEqual(MAX_TILT);
    expect(Math.abs(wild.roll)).toBeLessThanOrEqual(MAX_TILT);
    expect(Math.abs(wild.lift)).toBeLessThanOrEqual(MAX_LIFT);
    const wildBack = bodyBob(rest, vec3(-1000, -1000, 1000), 1 / 60, 40);
    expect(Math.abs(wildBack.pitch)).toBe(MAX_TILT);
    expect(Math.abs(wildBack.lift)).toBeLessThanOrEqual(MAX_LIFT);
    expect(MAX_TILT_RV).toBe(0.02);
    const rv = bodyBob(rest, vec3(1000, 1000, -1000), 1 / 60, 40, MAX_TILT_RV);
    expect(Math.abs(rv.pitch)).toBe(MAX_TILT_RV);
    expect(Math.abs(rv.roll)).toBe(MAX_TILT_RV);
    expect(rv.lift).toBe(wild.lift);
  });

  it('stays finite on non-finite input', () => {
    const out = bodyBob(rest, vec3(NaN, 0, 0), 1 / 60, NaN);
    expect(Object.values(out).every(Number.isFinite)).toBe(true);
  });
});

describe('cameraShake', () => {
  it('is zero at rest and never above 0.02 m at any speed or time', () => {
    expect(cameraShake(3, 0)).toEqual({ x: 0, y: 0 });
    expect(MAX_SHAKE).toBe(0.02);
    for (let t = 0; t < 10; t += 0.013) for (const speed of [5, 20, 40, 200]) {
      const { x, y } = cameraShake(t, speed);
      expect(Math.abs(x)).toBeLessThanOrEqual(MAX_SHAKE);
      expect(Math.abs(y)).toBeLessThanOrEqual(MAX_SHAKE);
    }
  });

  it('grows with speed', () => {
    const peak = (speed: number) => { let m = 0; for (let t = 0; t < 5; t += 0.01) m = Math.max(m, Math.abs(cameraShake(t, speed).y)); return m; };
    expect(peak(25)).toBeGreaterThan(peak(5));
  });
});
