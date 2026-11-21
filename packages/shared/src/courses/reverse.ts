import { FINISH_PAD, ROCK_LATERALS, ROCK_SPACING, GATES_SPACING } from '../constants';
import { segmentAlongLength, type Hazard, type Placement, type SegmentDef, type SegmentExtras } from '../segments';
import type { CourseDef } from './build';
import { stageDefs } from './stages';

type RoadDef = Extract<SegmentDef, { type: 'road' }>;

const round3 = (v: number): number => Math.round(v * 1000) / 1000;
// Never -0, so that reversing twice gives back the same numbers.
const neg = (v: number): number => (v === 0 ? 0 : -v);
const side = (v: -1 | 1): -1 | 1 => (v === 1 ? -1 : 1);

// A place `along` m into a segment of length `length` becomes the same place seen from the other end; a span of `span` m that starts at `along` starts at `length - along - span`.
const mirror = (along: number, length: number, span = 0): number => Math.min(length, Math.max(0, length - along - span));

const mirrorPlacements = (list: Placement[], length: number): Placement[] => list.map((p) => ({ ...p, along: mirror(p.along, length), lateral: neg(p.lateral) }));

function mirrorExtras<T extends SegmentDef>(def: T, length: number): T {
  const out: T = { ...def };
  const lists = out as { pickups?: Placement[]; anchors?: Placement[] | number; coins?: Placement[]; stop?: SegmentExtras['stop'] };
  if (lists.pickups) lists.pickups = mirrorPlacements(lists.pickups, length);
  // A bank or a pit counts its own boulders.
  if (Array.isArray(lists.anchors)) lists.anchors = mirrorPlacements(lists.anchors, length);
  if (lists.coins) lists.coins = mirrorPlacements(lists.coins, length);
  if (lists.stop) lists.stop = { ...lists.stop, side: side(lists.stop.side), along: mirror(lists.stop.along, length) };
  return out;
}

function mirrorHazard(h: Hazard, length: number): Hazard {
  switch (h.kind) {
    case 'gates': {
      // The barriers alternate sides from the first; the first one seen from the far end is the last one, on the other side.
      const first = h.first ?? -1;
      const lastLateral = (h.count - 1) % 2 === 0 ? first : side(first);
      const reversedFirst = side(lastLateral);
      const { first: _first, ...rest } = h;
      return { ...rest, along: mirror(h.along, length, (h.count - 1) * GATES_SPACING), ...(reversedFirst === -1 ? {} : { first: reversedFirst }) };
    }
    case 'crateWall': {
      const { side: _side, ...rest } = h;
      const flipped = side(h.side ?? 1);
      return { ...rest, along: mirror(h.along, length), ...(flipped === 1 ? {} : { side: flipped }) };
    }
    case 'roadblock':
      return { ...h, along: mirror(h.along, length) };
    case 'mud':
      return { ...h, along: mirror(h.along, length, h.length) };
    case 'rocks':
      return { ...h, along: mirror(h.along, length, (ROCK_LATERALS.length - 1) * ROCK_SPACING), side: side(h.side) };
  }
}

function reverseOne(def: SegmentDef): SegmentDef {
  const length = segmentAlongLength(def);
  switch (def.type) {
    case 'road': {
      const out = mirrorExtras(def, length);
      if (def.curve !== undefined) out.curve = neg(def.curve);
      if (def.slope !== undefined) out.slope = neg(def.slope);
      if (def.hazards) out.hazards = [...def.hazards].reverse().map((h) => mirrorHazard(h, length));
      return out;
    }
    case 'pit': {
      const out = mirrorExtras(def, length);
      // The descent of the reversed pit is the old climb, and its climb the old descent.
      if (def.gradientOut !== undefined) {
        out.gradient = def.gradientOut;
        out.gradientOut = def.gradient;
      }
      return out;
    }
    case 'sand':
    case 'bank': {
      const out = mirrorExtras(def, length);
      if (def.reversed) delete out.reversed;
      else out.reversed = true;
      return out;
    }
    case 'bridge': {
      const out = mirrorExtras(def, length);
      if (def.broken) {
        if (def.reversed) delete out.reversed;
        else out.reversed = true;
      }
      return out;
    }
    case 'alley':
    case 'ford':
    case 'roadworks':
      return mirrorExtras(def, length);
  }
}

// The segments in the opposite order, each driven the other way: curves and slopes negated, every extra and hazard seen from the other end and the other side, a pit's two gradients swapped, a bank, a sand stretch and a broken bridge built the other way round. Reversing twice gives back the original.
export function reverseSegments(segments: readonly SegmentDef[]): SegmentDef[] {
  return [...segments].reverse().map(reverseOne);
}

const START_ROAD = 80;

// Story only: the airport road driven home to the villa. It starts at the old finish: the flat 80 m start road with the start pickups, then the rest of the old last road (the old finish pad included, so the route is the old route run backwards), then every other segment reversed. The finish pad after the last segment is where the villa gate is.
export function airportHomeDef(): CourseDef {
  const forward = stageDefs['airport-road']().segments;
  const reversed = reverseSegments(forward);
  const [first, ...rest] = reversed;
  const start = forward[0] as RoadDef;
  if (first?.type !== 'road' || first.curve || first.slope || first.stop || first.hazards || first.pickups || first.anchors || first.debris || first.bumps) {
    throw new Error('airport-home needs a plain road at the end of the airport road');
  }
  const remainder = round3(first.length + FINISH_PAD - START_ROAD);
  // The old last road's coins move 20 m on (the old finish pad now comes first); those under the start road give way to its own.
  const coins = (first.coins ?? []).map((c) => ({ ...c, along: round3(c.along + FINISH_PAD - START_ROAD) })).filter((c) => c.along > 0 && c.along <= remainder);
  const head: SegmentDef = { type: 'road', length: START_ROAD, ...(start.pickups ? { pickups: start.pickups } : {}), ...(start.coins ? { coins: start.coins } : {}) };
  const next: SegmentDef = { type: 'road', length: remainder, ...(coins.length > 0 ? { coins } : {}) };
  return { id: 'airport-home', label: 'Home from the airport', theme: 'airport', segments: [head, next, ...rest], targetTime: 300, ambient: true, corridor: true };
}
