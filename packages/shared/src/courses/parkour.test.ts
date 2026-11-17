import { describe, expect, it } from 'vitest';
import { BIG_HILL_SLOPE, ROAD_WIDTH, SEGMENT_SPAWN_INSET } from '../constants';
import { buildSegment, type SegmentDef } from '../segments';
import { buildCourse } from './build';
import { hazardRange } from './marrakech.extras';
import { CREST_AND_PULL, PARKOUR_TOOLS, PIT_GAUNTLET, RUBBLE_RUN } from './parkour';
import { hillSegments } from './terrain';

type RoadDef = Extract<SegmentDef, { type: 'road' }>;

const SECTIONS = { RUBBLE_RUN, CREST_AND_PULL, PIT_GAUNTLET };
const flat = (length: number): SegmentDef => ({ type: 'road', length });
const alone = (section: SegmentDef[]): SegmentDef[] => [flat(40), ...section, flat(40)];
const advance = (def: SegmentDef): number => -buildSegment(def).exit.pos.z;

describe('parkour sections (28d)', () => {
  it('has 6, 6 and 7 segments, each starting on a flat 15 m road and ending on a flat road', () => {
    expect([RUBBLE_RUN, CREST_AND_PULL, PIT_GAUNTLET].map((s) => s.length)).toEqual([6, 6, 7]);
    for (const section of Object.values(SECTIONS)) {
      const [first, last] = [section[0]!, section[section.length - 1]!];
      expect(first.type === 'road' && first.length === 15 && !first.slope && !first.curve).toBe(true);
      expect(last.type === 'road' && last.length >= 15 && !last.slope && !last.curve).toBe(true);
    }
  });

  it('builds every segment and a course of each section between two flat roads', () => {
    for (const [name, section] of Object.entries(SECTIONS)) {
      for (const def of section) expect(() => buildSegment(def), name).not.toThrow();
      const course = buildCourse({ id: `parkour-${name}`, segments: alone(section), targetTime: 100 });
      expect(course.checkpoints, name).toHaveLength(section.length + 2);
    }
  });

  it('is level: each section returns to the height it started at', () => {
    for (const [name, section] of Object.entries(SECTIONS)) expect(section.reduce((sum, d) => sum + buildSegment(d).exit.pos.y, 0), name).toBeCloseTo(0, 2);
  });

  it('puts RUBBLE_RUN together as the plan says (gates, crate wall, roadblock, toolbox and health kit)', () => {
    const gates = hazardRange('gates', 70)!;
    expect(RUBBLE_RUN).toEqual([
      flat(15),
      { type: 'road', length: 70, hazards: [{ kind: 'gates', along: Math.round(((gates.lo + gates.hi) / 2) * 10) / 10, count: 4 }] },
      { type: 'road', length: 40, hazards: [{ kind: 'crateWall', along: 20 }] },
      { type: 'road', length: 40, hazards: [{ kind: 'roadblock', along: 20 }] },
      { type: 'road', length: 40, pickups: [{ kind: 'toolbox', along: 20, lateral: -3 }, { kind: 'healthKit', along: 28, lateral: 3 }] },
      flat(15),
    ]);
  });

  it('puts CREST_AND_PULL together as the big hill and a jerrycan flat', () => {
    expect(CREST_AND_PULL).toEqual([...hillSegments(BIG_HILL_SLOPE), { type: 'road', length: 40, pickups: [{ kind: 'jerrycan', along: 20, lateral: 3 }] }]);
    expect(CREST_AND_PULL.map(advance)).toEqual([15, 60, 15, 60, 15, 40].map((v) => expect.closeTo(v, 2)));
  });

  it('puts PIT_GAUNTLET together: jerrycan flat, shallow pit, plain road 30, deep pit, health kit flat, no debris', () => {
    expect(PIT_GAUNTLET.map((d) => d.type)).toEqual(['road', 'road', 'pit', 'road', 'pit', 'road', 'road']);
    expect(PIT_GAUNTLET[1]).toEqual({ type: 'road', length: 40, pickups: [{ kind: 'jerrycan', along: 20, lateral: -3 }] });
    expect(PIT_GAUNTLET[3]).toEqual({ type: 'road', length: 30 });
    expect(PIT_GAUNTLET[5]).toEqual({ type: 'road', length: 40, pickups: [{ kind: 'healthKit', along: 20, lateral: 3 }] });
    expect(PIT_GAUNTLET.some((d) => d.type === 'road' && d.debris)).toBe(false);
  });

  it('keeps every pickup on the lane and at least 8 m from its segment spawn', () => {
    for (const section of Object.values(SECTIONS)) {
      for (const def of section) {
        if (def.type !== 'road') continue;
        for (const p of def.pickups ?? []) {
          expect(p.along).toBeGreaterThanOrEqual(SEGMENT_SPAWN_INSET + 8);
          expect(Math.abs(p.lateral)).toBeLessThan(ROAD_WIDTH / 2);
        }
      }
    }
  });

  it('claims all six tools between the sections, and each claimed tool really appears in the built section', () => {
    expect(new Set(Object.values(PARKOUR_TOOLS).flat())).toEqual(new Set(['jerrycan', 'toolbox', 'healthKit', 'winch', 'crate', 'barrier']));
    expect(Object.keys(PARKOUR_TOOLS).sort()).toEqual(Object.keys(SECTIONS).sort());
    for (const [name, section] of Object.entries(SECTIONS)) {
      const course = buildCourse({ id: `parkour-${name}`, segments: alone(section), targetTime: 100 });
      const have = new Set<string>([
        ...course.pickups.map((p) => p.kind),
        ...(course.anchors.length > 0 ? ['winch'] : []),
        ...course.props.map((p) => p.kind),
      ]);
      for (const tool of PARKOUR_TOOLS[name]!) {
        const kinds = tool === 'winch' ? ['winch'] : [tool];
        expect(kinds.some((k) => have.has(k)), `${name} ${tool}`).toBe(true);
      }
    }
  });
});
