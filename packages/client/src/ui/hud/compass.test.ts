import { IDENTITY, degToRad, vec3, type Box, type Checkpoint } from '@lodgy/shared';
import { describe, expect, it } from 'vitest';
import { COMPASS_FOV, bearingTo, compassLabel, compassTarget, edgeSide, headingOffset, markerPosition } from './compass';

const box = (x: number, z: number): Box => ({ center: vec3(x, 0, z), halfExtents: vec3(1, 1, 1), rot: IDENTITY });
const checkpoint = (id: string, x: number, z: number): Checkpoint => ({
  id,
  trigger: box(x, z),
  spawn: { pos: vec3(x, 0, z), rot: IDENTITY },
});

describe('bearingTo', () => {
  const o = vec3(0, 0, 0);
  it('uses yaw 0 = -z, positive turns left', () => {
    expect(bearingTo(o, vec3(0, 0, -5))).toBeCloseTo(0);
    expect(bearingTo(o, vec3(-5, 0, 0))).toBeCloseTo(Math.PI / 2);
    expect(bearingTo(o, vec3(5, 0, 0))).toBeCloseTo(-Math.PI / 2);
    expect(Math.abs(bearingTo(o, vec3(0, 0, 5)))).toBeCloseTo(Math.PI);
  });
});

describe('headingOffset', () => {
  it('wraps and is positive to the right', () => {
    expect(headingOffset(degToRad(10), degToRad(350))).toBeCloseTo(degToRad(20));
    expect(headingOffset(degToRad(350), degToRad(10))).toBeCloseTo(degToRad(-20));
  });
  it('is in (-PI, PI]', () => {
    expect(headingOffset(Math.PI, 0)).toBeCloseTo(Math.PI);
    expect(headingOffset(-Math.PI, 0)).toBeCloseTo(Math.PI);
  });
  it('is positive when the target is to the right', () => {
    // facing -z, target at +x is to the right
    expect(headingOffset(0, bearingTo(vec3(0, 0, 0), vec3(5, 0, 0)))).toBeCloseTo(Math.PI / 2);
  });
});

describe('markerPosition', () => {
  it('is 0.5 at zero, 0 and 1 at the edges, null beyond', () => {
    expect(markerPosition(0)).toBe(0.5);
    expect(markerPosition(-COMPASS_FOV / 2)).toBeCloseTo(0);
    expect(markerPosition(COMPASS_FOV / 2)).toBeCloseTo(1);
    expect(markerPosition(COMPASS_FOV / 2 + 0.01)).toBeNull();
    expect(markerPosition(-COMPASS_FOV / 2 - 0.01)).toBeNull();
  });
});

describe('edgeSide', () => {
  it('is 0 inside the strip and the offset sign outside', () => {
    expect(edgeSide(0)).toBe(0);
    expect(edgeSide(COMPASS_FOV / 2)).toBe(0);
    expect(edgeSide(COMPASS_FOV / 2 + 0.01)).toBe(1);
    expect(edgeSide(-COMPASS_FOV / 2 - 0.01)).toBe(-1);
  });
});

describe('compassTarget', () => {
  // status.checkpoint is the index of the last reached checkpoint (0 at the start).
  const cps = [checkpoint('a', 0, 0), checkpoint('b', 0, -100), checkpoint('c', 0, -200)];
  const finish = box(0, -300);
  it('returns the next checkpoint, then the finish after the last', () => {
    expect(compassTarget(cps, finish, 0, false)).toEqual(vec3(0, 0, -100));
    expect(compassTarget(cps, finish, 1, false)).toEqual(vec3(0, 0, -200));
    expect(compassTarget(cps, finish, 2, false)).toEqual(vec3(0, 0, -300));
  });
  it('is null once won', () => {
    expect(compassTarget(cps, finish, 2, true)).toBeNull();
  });
});

describe('compassLabel', () => {
  it('rounds metres and is empty for null', () => {
    expect(compassLabel(340.4)).toBe('340 m');
    expect(compassLabel(339.6)).toBe('340 m');
    expect(compassLabel(null)).toBe('');
  });
  it('a NaN offset gives no marker and no edge side', () => {
    expect(markerPosition(NaN)).toBeNull();
    expect(edgeSide(NaN)).toBe(0);
  });
});
