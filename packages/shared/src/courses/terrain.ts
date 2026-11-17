import { BIG_HILL_SLOPE, BOULDER_EDGE_INSET, PIT_DEEP_EXIT, ROAD_WIDTH, SEGMENT_MIN_LENGTH } from '../constants';
import { degToRad } from '../math';
import type { Placement, SegmentDef } from '../segments';

type PitDef = Extract<SegmentDef, { type: 'pit' }>;
type RoadDef = Extract<SegmentDef, { type: 'road' }>;

// Both vehicles drive out: a jolt.
export const SHALLOW_PIT: PitDef = { type: 'pit', depth: 0.6, gradient: 10, floor: 6, anchors: 0 };
// Six boulders (pairs 3, 5 and 7 m into the exit flat): with only the first pair the cable runs sideways by the crest and the RV hangs there.
export const DEEP_PIT: PitDef = { type: 'pit', depth: 2, gradient: 15, gradientOut: PIT_DEEP_EXIT, floor: 8, anchors: 6 };

// m, horizontal, of a hill's climb and of its descent.
export const HILL_RUN = 60;
// m along the big hill's climb where its boulders stand (and one at the crest).
export const BIG_HILL_ANCHORS_ALONG = [20, 45];

const round3 = (v: number): number => Math.round(v * 1000) / 1000;
const boulder = (along: number, side: -1 | 1): Placement => ({ kind: 'boulder', along, lateral: side * (ROAD_WIDTH / 2 - BOULDER_EDGE_INSET) });

// Flat 15, climb, crest 15, descent, flat 15; the big hill carries boulders on the climb (alternating sides) and at the crest.
export function hillSegments(slope: number): SegmentDef[] {
  const length = round3(HILL_RUN / Math.cos(degToRad(slope)));
  const flat = (): RoadDef => ({ type: 'road', length: SEGMENT_MIN_LENGTH });
  const climb: RoadDef = { type: 'road', length, slope };
  const crest = flat();
  if (slope === BIG_HILL_SLOPE) {
    climb.anchors = BIG_HILL_ANCHORS_ALONG.map((along, i) => boulder(along, i % 2 === 0 ? -1 : 1));
    // The climb's two boulders take the left then the right, so the crest's is on the left again.
    crest.anchors = [boulder(SEGMENT_MIN_LENGTH / 2, -1)];
  }
  return [flat(), climb, crest, { type: 'road', length, slope: -slope }, flat()];
}
