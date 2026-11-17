import { describe, expect, test } from 'vitest';
import { FINISH_PAD } from '../constants';
import { airport } from './airport';
import { segmentDemo } from './demo';
import { marrakech } from './marrakech';
import { getCourse, getCourseDef, segmentRanges } from './index';

const length = (route: [number, number][]) => route.reduce((sum, p, i) => (i === 0 ? 0 : sum + Math.hypot(p[0] - route[i - 1]![0], p[1] - route[i - 1]![1])), 0);

describe('getCourseDef', () => {
  test('returns the airport, marrakech and demo definitions', () => {
    expect(getCourseDef('marrakech')).toEqual(marrakech);
    expect(getCourseDef('airport')).toEqual(airport);
    expect(getCourseDef('segment-demo')).toEqual(segmentDemo);
  });

  test('the test course and unknown ids have none', () => {
    expect(getCourseDef('test')).toBeNull();
    expect(getCourseDef('nope')).toBeNull();
    expect(getCourseDef('constructor')).toBeNull();
  });

  test('the definitions are frozen and the exported ones are not', () => {
    expect(Object.isFrozen(getCourseDef('airport')!.segments[0])).toBe(true);
    expect(Object.isFrozen(airport.segments[0])).toBe(false);
  });
});

describe('segmentRanges', () => {
  test.each(['airport', 'segment-demo', 'marrakech'])('%s: ranges are contiguous and plus the finish pad equal the route length', (id) => {
    const def = getCourseDef(id)!;
    const ranges = segmentRanges(def);
    expect(ranges.map((r) => r.type)).toEqual(def.segments.map((s) => s.type));
    expect(ranges[0]!.from).toBe(0);
    ranges.forEach((r, i) => i > 0 && expect(r.from).toBe(ranges[i - 1]!.to));
    expect(ranges[ranges.length - 1]!.to + FINISH_PAD).toBeCloseTo(length(getCourse(id).route), 6);
  });
});
