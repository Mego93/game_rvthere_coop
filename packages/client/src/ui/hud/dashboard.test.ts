import { describe, expect, it } from 'vitest';
import { GEAR_TOPS, IDLE_RPM, REDLINE_RPM, gearbox, speedKmh } from './dashboard';

describe('gearbox', () => {
  it('idles in neutral when standing', () => {
    expect(gearbox(0, 0)).toEqual({ gear: 0, rpm: IDLE_RPM });
    expect(gearbox(0.2, 0)).toEqual({ gear: 0, rpm: IDLE_RPM });
  });

  it('revs a little when standing with the throttle down, never past the redline', () => {
    const { rpm } = gearbox(0, 1);
    expect(rpm).toBeGreaterThan(IDLE_RPM);
    expect(rpm).toBeLessThanOrEqual(REDLINE_RPM);
  });

  it('picks gear 1 at 5 m/s and gear 5 at 30 m/s', () => {
    expect(gearbox(5, 1).gear).toBe(1);
    expect(gearbox(30, 1).gear).toBe(5);
  });

  it('changes up at each top speed', () => {
    GEAR_TOPS.forEach((top, index) => expect(gearbox(top - 0.01, 1).gear).toBe(index + 1));
    expect(gearbox(GEAR_TOPS[0]!, 1).gear).toBe(2);
  });

  it('rises linearly from 1500 at the bottom of a gear to 6500 at its top', () => {
    expect(gearbox(14, 1).rpm).toBeCloseTo(1500, 5);
    expect(gearbox(17, 1).rpm).toBeCloseTo(4000, 5);
    expect(gearbox(19.99999, 1).rpm).toBeCloseTo(6500, 0);
  });

  it('keeps the rpm between idle and redline over the whole speed range, also past the top gear', () => {
    for (let speed = -10; speed <= 60; speed += 0.5) {
      const { rpm } = gearbox(speed, 1);
      expect(rpm).toBeGreaterThanOrEqual(IDLE_RPM);
      expect(rpm).toBeLessThanOrEqual(REDLINE_RPM);
    }
  });

  it('shows reverse as gear -1', () => {
    expect(gearbox(-4, 1).gear).toBe(-1);
  });
});

describe('speedKmh', () => {
  it('converts m/s to whole km/h', () => {
    expect(speedKmh(0)).toBe(0);
    expect(speedKmh(10)).toBe(36);
    expect(speedKmh(27.78)).toBe(100);
  });

  it('reads the magnitude when reversing', () => {
    expect(speedKmh(-5)).toBe(18);
  });
});
