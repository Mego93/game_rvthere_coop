import { describe, expect, it } from 'vitest';
import { CAMPAIGN, FINISH_PAD, STAGE_IDS, STAGE_MAX_LENGTH, STAGE_MIN_LENGTH } from '../constants';
import type { SegmentDef } from '../segments';
import { buildCourse } from './build';
import { courseIds, getCourse, getCourseDef, segmentRanges } from './index';
import { FUEL_MAX_GAP } from './marrakech.extras';
import { MARRAKECH_INSERTED, MARRAKECH_SEGMENTS } from './marrakech.generated';
import { sliceCourse } from './stages';

type RoadDef = Extract<SegmentDef, { type: 'road' }>;

const CUT = ['desert', 'city', 'airport-road'] as const;
const LABELS: Record<string, string> = { desert: '1 Desert', city: '4 City', 'airport-road': '5 To the airport' };
const THEMES: Record<string, string> = { desert: 'desert', city: 'city', 'airport-road': 'airport' };
const plainRoad = (s: SegmentDef | undefined, i: number): boolean => s?.type === 'road' && !MARRAKECH_INSERTED.includes(i) && !s.slope && !s.stop;

describe('stage ids', () => {
  it('makes the stages the campaign', () => {
    expect(STAGE_IDS).toEqual(['desert', 'valley', 'mountain', 'city', 'airport-road']);
    expect(CAMPAIGN).toEqual(STAGE_IDS);
  });

  it('lists the stages, then marrakech, then the rest', () => {
    const ids = courseIds();
    const present = STAGE_IDS.filter((id) => ids.includes(id));
    expect(present).toEqual(['desert', 'city', 'airport-road']);
    expect(ids.slice(0, present.length)).toEqual(present);
    expect(ids[present.length]).toBe('marrakech');
    expect([...ids].sort()).toEqual([...present, 'airport', 'marrakech', 'segment-demo', 'test'].sort());
  });
});

describe.each(CUT)('cut stage %s', (id) => {
  const def = getCourseDef(id)!;
  const ranges = segmentRanges(def);
  const total = ranges[ranges.length - 1]!.to;

  it('has its label, theme, corridor and ambient', () => {
    expect(def.id).toBe(id);
    expect(def.label).toBe(LABELS[id]);
    expect(def.theme).toBe(THEMES[id]);
    expect(def.corridor).toBe(true);
    expect(def.ambient).toBe(true);
  });

  it('builds, within the stage length limits', () => {
    const course = getCourse(id);
    expect(course.id).toBe(id);
    expect(total).toBeGreaterThanOrEqual(STAGE_MIN_LENGTH);
    expect(total).toBeLessThanOrEqual(STAGE_MAX_LENGTH);
    expect(course.corridor).toBeDefined();
    expect(course.ambient).toBeDefined();
  });

  it('starts with a flat 80 m road carrying the three start pickups', () => {
    const first = def.segments[0] as RoadDef;
    expect(first.type).toBe('road');
    expect(first.length).toBe(80);
    expect(first.curve).toBeUndefined();
    expect(first.slope).toBeUndefined();
    expect(first.pickups!.map((p) => p.kind).sort()).toEqual(['healthKit', 'jerrycan', 'toolbox']);
  });

  it('has a fuel stop, and no fuel gap above the maximum counting both ends', () => {
    const mids = def.segments.flatMap((s, i) => (s.type === 'road' && s.stop?.kind === 'fuel' ? [(ranges[i]!.from + ranges[i]!.to) / 2] : []));
    expect(mids.length).toBeGreaterThan(0);
    const points = [0, ...mids, total + FINISH_PAD];
    for (let i = 1; i < points.length; i++) expect(points[i]! - points[i - 1]!).toBeLessThanOrEqual(FUEL_MAX_GAP);
  });
});

describe('sliceCourse', () => {
  it('cuts only at boundaries between plain roads, and keeps the segments in between', () => {
    const slice = sliceCourse(MARRAKECH_SEGMENTS, MARRAKECH_INSERTED, 8000, 11000);
    const second = MARRAKECH_SEGMENTS.findIndex((s, i) => i > 0 && JSON.stringify(s) === JSON.stringify(slice[1]));
    const start = second - 1;
    expect(start).toBeGreaterThan(0);
    const end = start + slice.length;
    slice.forEach((s, k) => k > 0 && expect(s).toEqual(MARRAKECH_SEGMENTS[start + k]));
    expect(plainRoad(MARRAKECH_SEGMENTS[start - 1], start - 1)).toBe(true);
    expect(plainRoad(MARRAKECH_SEGMENTS[start], start)).toBe(true);
    expect(plainRoad(MARRAKECH_SEGMENTS[end - 1], end - 1)).toBe(true);
    expect(plainRoad(MARRAKECH_SEGMENTS[end], end)).toBe(true);
  });

  it('keeps the route ends as they are, and does not touch its input', () => {
    const before = JSON.stringify(MARRAKECH_SEGMENTS);
    const whole = sliceCourse(MARRAKECH_SEGMENTS, MARRAKECH_INSERTED, -10, 1e9);
    expect(whole).toHaveLength(MARRAKECH_SEGMENTS.length);
    expect(whole[0]).toEqual(MARRAKECH_SEGMENTS[0]);
    expect(whole[whole.length - 1]).toEqual(MARRAKECH_SEGMENTS[MARRAKECH_SEGMENTS.length - 1]);
    expect(JSON.stringify(MARRAKECH_SEGMENTS)).toBe(before);
    expect(() => buildCourse({ id: 'whole-slice', segments: whole, targetTime: 1 })).not.toThrow();
  });

  it('throws on an empty slice', () => {
    expect(() => sliceCourse(MARRAKECH_SEGMENTS, MARRAKECH_INSERTED, 5000, 5000)).toThrow();
  });
});
