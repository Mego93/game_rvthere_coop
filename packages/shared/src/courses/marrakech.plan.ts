import { buildSegment, type SegmentDef } from '../segments';
import { BIG_HILL_SLOPE, HILL_SLOPE } from '../constants';
import { MUD_PLAN, planExtras, ROCKS_PLAN, TERRAIN_HAZARD_CLEAR, TERRAIN_DEEP_CLEAR, type ExtrasReport, type TerrainSpan } from './marrakech.extras';
import { DEEP_PIT, hillSegments, SHALLOW_PIT } from './terrain';
import { fitRoute, planInserts, type FitReport, type InsertPlacement, type InsertSpec, type Route } from './fit';
import { MARRAKECH_ROUTE } from './marrakech.route';
import { CREST_AND_PULL, PIT_GAUNTLET, RUBBLE_RUN } from './parkour';

// How far a built segment advances the course, flat and straight.
const advanceOf = (defs: SegmentDef[]): number => defs.reduce((sum, def) => sum - buildSegment(def).exit.pos.z, 0);

const insert = (name: string, fraction: number, segments: SegmentDef[], clearance?: number): InsertSpec => ({ name, fraction, length: advanceOf(segments), segments, ...(clearance ? { clearance } : {}) });

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

interface TerrainEntry {
  name: string;
  fraction: number;
  segments: SegmentDef[];
  clearance: number;
}

const terrainEntry = (name: string, fraction: number, segments: SegmentDef[], clearance: number): TerrainEntry => ({ name, fraction, segments, clearance });

// Hills, pits and the parkour sections go in after the inserts above, in this order, each clear of every earlier insert (a deep pit 150 m).
export const MARRAKECH_TERRAIN: readonly TerrainEntry[] = [
  terrainEntry('hill', 0.15, hillSegments(HILL_SLOPE), TERRAIN_HAZARD_CLEAR),
  terrainEntry('hill', 0.55, hillSegments(HILL_SLOPE), TERRAIN_HAZARD_CLEAR),
  terrainEntry('hill', 0.8, hillSegments(HILL_SLOPE), TERRAIN_HAZARD_CLEAR),
  terrainEntry('bigHill', 0.35, hillSegments(BIG_HILL_SLOPE), TERRAIN_HAZARD_CLEAR),
  ...[0.22, 0.47, 0.66, 0.9].map((fraction) => terrainEntry('pit', fraction, [SHALLOW_PIT], TERRAIN_HAZARD_CLEAR)),
  ...[0.27, 0.77].map((fraction) => terrainEntry('deepPit', fraction, [DEEP_PIT], TERRAIN_DEEP_CLEAR)),
  terrainEntry('parkour', 0.1, RUBBLE_RUN, TERRAIN_HAZARD_CLEAR),
  terrainEntry('parkour', 0.43, CREST_AND_PULL, TERRAIN_HAZARD_CLEAR),
  terrainEntry('parkourPit', 0.72, PIT_GAUNTLET, TERRAIN_DEEP_CLEAR),
];

// Metres each terrain target is moved along the route (found by scripts/route/searchTerrain.ts so the 1.5 km fuel chain holds); every feature stays within MAX_TERRAIN_DISTANCE of its target.
export const MARRAKECH_TERRAIN_SHIFTS: readonly number[] = [-200, 0, -100, 0, -150, -50, 0, -150, 550, 0, 100, -200, 0];
export const MAX_TERRAIN_DISTANCE = 1300;

const TERRAIN_NAMES = new Set(MARRAKECH_TERRAIN.map((entry) => entry.name));

export function terrainSpecs(total: number, shifts: readonly number[]): InsertSpec[] {
  return MARRAKECH_TERRAIN.map((e, i) => insert(e.name, e.fraction + (shifts[i] ?? 0) / total, e.segments, e.clearance));
}

export interface TerrainPlan {
  segments: SegmentDef[];
  placements: InsertPlacement[];
  inserted: number[];
  spans: TerrainSpan[];
}

// The inserts and the terrain placed on the fitted route; each placement's target is the unshifted one.
export function placeTerrain(fitted: readonly SegmentDef[], shifts: readonly number[]): TerrainPlan {
  const total = fitted.reduce((sum, def) => sum + ('length' in def ? def.length : 0), 0);
  const planned = planInserts(fitted, [...MARRAKECH_INSERTS, ...terrainSpecs(total, shifts)]);
  const terrain = MARRAKECH_INSERTS.length;
  const placements = planned.placements.map((p, i) => {
    if (i < terrain) return p;
    const target = MARRAKECH_TERRAIN[i - terrain]!.fraction * total;
    return { ...p, target, distance: Math.abs(p.at - target) };
  });
  const spans = planned.groups.filter((g) => TERRAIN_NAMES.has(g.name)).map((g) => ({ first: g.first, last: g.last, deep: g.name === 'deepPit' || g.name === 'parkourPit' }));
  return { segments: planned.segments, placements, inserted: planned.inserted, spans };
}

export function planMarrakech(route: Route = MARRAKECH_ROUTE, shifts: readonly number[] = MARRAKECH_TERRAIN_SHIFTS): { segments: SegmentDef[]; report: FitReport; placements: InsertPlacement[]; inserted: number[]; extras: ExtrasReport } {
  const fit = fitRoute(route);
  const planned = placeTerrain(fit.segments, shifts);
  const extras = planExtras(planned.segments, planned.inserted, { terrain: planned.spans, mud: MUD_PLAN, rocks: ROCKS_PLAN, seed: 'marrakech' });
  return { segments: extras.segments, report: fit.report, placements: planned.placements, inserted: planned.inserted, extras: extras.report };
}
