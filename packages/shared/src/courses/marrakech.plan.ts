import { buildSegment, type SegmentDef } from '../segments';
import { fitRoute, planInserts, type FitReport, type InsertPlacement, type InsertSpec, type Route } from './fit';
import { MARRAKECH_ROUTE } from './marrakech.route';

// How far a built segment advances the course, flat and straight.
const advanceOf = (defs: SegmentDef[]): number => defs.reduce((sum, def) => sum - buildSegment(def).exit.pos.z, 0);

const insert = (name: string, fraction: number, segments: SegmentDef[]): InsertSpec => ({ name, fraction, length: advanceOf(segments), segments });

export const MARRAKECH_INSERTS: readonly InsertSpec[] = [
  insert('sand', 0.2, [{ type: 'sand', length: 60, palms: 4 }]),
  insert('alley', 0.38, [{ type: 'alley', length: 160, clutter: 0.7 }]),
  insert('roadworks', 0.52, [{ type: 'roadworks', length: 120, obstacles: 6 }]),
  insert('ford', 0.64, [
    { type: 'ford', width: 24, rocks: 8 },
    { type: 'road', length: 60, slope: 4 },
    { type: 'bank', height: 3, gradient: 15, anchors: 3 },
  ]),
  insert('roadworks', 0.86, [{ type: 'roadworks', length: 120, obstacles: 6 }]),
];

export function planMarrakech(route: Route = MARRAKECH_ROUTE): { segments: SegmentDef[]; report: FitReport; placements: InsertPlacement[]; inserted: number[] } {
  const fit = fitRoute(route);
  const planned = planInserts(fit.segments, MARRAKECH_INSERTS);
  return { segments: planned.segments, report: fit.report, placements: planned.placements, inserted: planned.inserted };
}
