import { BIG_HILL_SLOPE, SEGMENT_MIN_LENGTH } from '../constants';
import type { Hazard, Placement, SegmentDef } from '../segments';
import { hazardRange } from './marrakech.extras';
import { DEEP_PIT, hillSegments, SHALLOW_PIT } from './terrain';

export type ParkourTool = 'jerrycan' | 'toolbox' | 'healthKit' | 'winch' | 'crate' | 'barrier';

type RoadDef = Extract<SegmentDef, { type: 'road' }>;

const flat = (): RoadDef => ({ type: 'road', length: SEGMENT_MIN_LENGTH });
const road = (length: number, extra: Partial<RoadDef> = {}): RoadDef => ({ type: 'road', length, ...extra });
const pickup = (kind: string, along: number, lateral: number): Placement => ({ kind, along, lateral });
const gatesAlong = (): number => {
  const range = hazardRange('gates', 70)!;
  return Math.round(((range.lo + range.hi) / 2) * 10) / 10;
};
const hazard = (h: Hazard): { hazards: Hazard[] } => ({ hazards: [h] });

// Barriers, crates, toolbox and health kit.
export const RUBBLE_RUN: SegmentDef[] = [
  flat(),
  road(70, hazard({ kind: 'gates', along: gatesAlong(), count: 4 })),
  road(40, hazard({ kind: 'crateWall', along: 20 })),
  road(40, hazard({ kind: 'roadblock', along: 20 })),
  road(40, { pickups: [pickup('toolbox', 20, -3), pickup('healthKit', 28, 3)] }),
  flat(),
];

// The big hill (boulders on the climb and crest), then a jerrycan on the level run-out; the crest is the jump.
export const CREST_AND_PULL: SegmentDef[] = [...hillSegments(BIG_HILL_SLOPE), road(40, { pickups: [pickup('jerrycan', 20, 3)] })];

// Jerrycan, shallow pit, a plain road, the deep pit (winch), health kit.
export const PIT_GAUNTLET: SegmentDef[] = [flat(), road(40, { pickups: [pickup('jerrycan', 20, -3)] }), SHALLOW_PIT, road(30), DEEP_PIT, road(40, { pickups: [pickup('healthKit', 20, 3)] }), flat()];

// The tools each section is meant to use (tests only).
export const PARKOUR_TOOLS: Record<string, readonly ParkourTool[]> = {
  RUBBLE_RUN: ['barrier', 'crate', 'toolbox', 'healthKit'],
  CREST_AND_PULL: ['winch', 'jerrycan'],
  PIT_GAUNTLET: ['winch', 'jerrycan', 'healthKit'],
};
