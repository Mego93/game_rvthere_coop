import { DESERT_TO } from '../constants';
import { buildSegment, type SegmentDef } from '../segments';
import type { CourseDef } from './build';
import { MARRAKECH_INSERTED, MARRAKECH_SEGMENTS } from './marrakech.generated';

type RoadDef = Extract<SegmentDef, { type: 'road' }>;

const routeLength = (segment: SegmentDef): number => {
  const route = buildSegment(segment).route;
  let total = 0;
  for (let i = 1; i < route.length; i++) total += Math.hypot(route[i]![0] - route[i - 1]![0], route[i]![1] - route[i - 1]![1]);
  return total;
};

// The whole segments between the two cut points, each moved to the nearest boundary where both neighbours are plain roads (not inserted, not sloped, no stop); the route's own ends always qualify. The first segment becomes the 80 m start road of the full route.
export function sliceCourse(segments: readonly SegmentDef[], inserted: readonly number[], from: number, to: number): SegmentDef[] {
  const skip = new Set(inserted);
  const plain = (i: number): boolean => {
    const s = segments[i]!;
    return s.type === 'road' && !skip.has(i) && !s.slope && !s.stop;
  };
  const at = [0];
  for (const s of segments) at.push(at[at.length - 1]! + routeLength(s));
  const snap = (target: number): number => {
    let best = -1;
    for (let b = 0; b <= segments.length; b++) {
      if (b > 0 && b < segments.length && !(plain(b - 1) && plain(b))) continue;
      if (best < 0 || Math.abs(at[b]! - target) < Math.abs(at[best]! - target)) best = b;
    }
    return best;
  };
  const a = snap(from);
  const b = snap(to);
  if (b <= a) throw new Error('A slice needs at least one segment');
  const out = segments.slice(a, b).map((s) => ({ ...s }));
  if (a > 0) {
    const start = segments[0] as RoadDef;
    out[0] = { type: 'road', length: 80, ...(start.pickups ? { pickups: start.pickups } : {}), ...(start.coins ? { coins: start.coins } : {}) };
  }
  return out;
}

export const STAGE_SLICES: Record<'desert' | 'city' | 'airport-road', { from: (total: number) => number; to: (total: number) => number }> = {
  desert: { from: () => 0, to: () => DESERT_TO },
  city: { from: (total) => total - 7000, to: (total) => total - 3500 },
  'airport-road': { from: (total) => total - 3500, to: (total) => total },
};

const marrakechTotal = (): number => MARRAKECH_SEGMENTS.reduce((sum, s) => sum + routeLength(s), 0);

function cut(id: 'desert' | 'city' | 'airport-road'): CourseDef['segments'] {
  const total = marrakechTotal();
  return sliceCourse(MARRAKECH_SEGMENTS, MARRAKECH_INSERTED, STAGE_SLICES[id].from(total), STAGE_SLICES[id].to(total));
}

// Built when asked for, so importing the package does not walk the 22 km route.
export const stageDefs = {
  desert: (): CourseDef => ({ id: 'desert', label: '1 Desert', theme: 'desert', segments: cut('desert'), targetTime: 420, ambient: true, corridor: true }),
  city: (): CourseDef => ({ id: 'city', label: '4 City', theme: 'city', segments: cut('city'), targetTime: 420, ambient: true, corridor: true, enemyDensity: 2 }),
  'airport-road': (): CourseDef => ({ id: 'airport-road', label: '5 To the airport', theme: 'airport', segments: cut('airport-road'), targetTime: 420, ambient: true, corridor: true }),
} satisfies Record<string, () => CourseDef>;
