// Run: npx tsx scripts/route/searchTerrain.ts [--loose] (finds MARRAKECH_TERRAIN_SHIFTS: feasible first, then the smallest moves that keep a fuel chain within 1.5 km; --loose lets every entry move up to MAX_TERRAIN_DISTANCE)
import { buildSegment, type SegmentDef } from '../../packages/shared/src/segments';
import { fitRoute } from '../../packages/shared/src/courses/fit';
import { FUEL_MAX_GAP, largestStopGap, planExtras } from '../../packages/shared/src/courses/marrakech.extras';
import { MARRAKECH_ROUTE } from '../../packages/shared/src/courses/marrakech.route';
import { MARRAKECH_TERRAIN, MAX_TERRAIN_DISTANCE, placeTerrain, planMarrakech } from '../../packages/shared/src/courses/marrakech.plan';

const STEP = 50;
const RANDOM_MOVES = 12000;
// The entries before the parkour ones keep their old bounds (shift 200 m, placement 200 m, the 0.55 hill 1300 m); the parkour entries and, only if nothing is feasible otherwise, every entry may go up to MAX_TERRAIN_DISTANCE.
declare const process: { argv: string[] };
const OLD_SHIFT = 200;
const OLD_DISTANCE = 200;
const parkour = (i: number): boolean => MARRAKECH_TERRAIN[i]!.name.startsWith('parkour');
const loose = process.argv.includes('--loose');
const reach = (i: number): number => (parkour(i) || loose ? MAX_TERRAIN_DISTANCE : OLD_SHIFT);
const limit = (i: number): number => (parkour(i) || loose || (MARRAKECH_TERRAIN[i]!.name === 'hill' && MARRAKECH_TERRAIN[i]!.fraction === 0.55) ? MAX_TERRAIN_DISTANCE : OLD_DISTANCE);
const GAP_GOAL = 1400;
const THIN_MARGIN = 25;
const fitted = fitRoute(MARRAKECH_ROUTE).segments;

// Route length of a built segment (a curve's path is longer than its forward advance, which the planner measures).
const pathLength = (def: SegmentDef): number => {
  const route = buildSegment(def).route;
  return route.slice(1).reduce((sum, [x, z], i) => sum + Math.hypot(x - route[i]![0], z - route[i]![1]), 0);
};
const FINISH_PAD = 20;
// The course test keeps garages within 6 km of each other (and of the start), by path length.
const GARAGE_MAX_GAP = 6000;
function garageGap(segments: readonly SegmentDef[], garages: readonly { index: number }[]): number {
  const lengths = segments.map(pathLength);
  const mids = garages.map((g) => lengths.slice(0, g.index).reduce((a, b) => a + b, 0) + lengths[g.index]! / 2);
  const points = [0, ...mids];
  return Math.max(...points.slice(1).map((p, i) => p - points[i]!));
}
// The largest fuel gap along the path, as the course test measures it (start, stop middles, finish pad).
function realGap(segments: readonly SegmentDef[], fuel: readonly { index: number }[]): number {
  const lengths = segments.map(pathLength);
  const start = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0));
  const points = [0, ...fuel.map((f) => start[f.index]! + lengths[f.index]! / 2), lengths.reduce((a, b) => a + b, 0) + FINISH_PAD];
  return Math.max(...points.slice(1).map((p, i) => p - points[i]!));
}

function cost(shifts: number[]): number {
  try {
    const plan = placeTerrain(fitted, shifts);
    const terrain = plan.placements.slice(plan.placements.length - MARRAKECH_TERRAIN.length);
    const excess = terrain.reduce((sum, p, i) => sum + Math.max(0, p.distance - limit(i)), 0);
    let gap = largestStopGap(plan.segments, plan.inserted, plan.spans);
    // Feasibility first: a shift set that makes the stops, hazards or pickups throw is never chosen over one that does not; both are ranked by how close they come.
    let penalty = 0;
    try {
      const chain = planExtras(plan.segments, plan.inserted, { terrain: plan.spans });
      gap = realGap(chain.segments, chain.report.fuel);
      if (gap > FUEL_MAX_GAP || garageGap(chain.segments, chain.report.garages) > GARAGE_MAX_GAP) penalty = 1e9;
    } catch {
      penalty = 2e9;
    }
    // In loose mode an old entry past its old bound costs 50 per metre, so the search keeps the exceptions few.
    const old = terrain.reduce((sum, p, i) => sum + (parkour(i) || (MARRAKECH_TERRAIN[i]!.name === 'hill' && MARRAKECH_TERRAIN[i]!.fraction === 0.55) ? 0 : Math.max(0, p.distance - OLD_DISTANCE)), 0);
    const rank = Math.max(gap, GAP_GOAL) * 1000 + old * 50 + shifts.reduce((sum, s) => sum + Math.abs(s), 0);
    return (excess > 0 ? 1e12 + excess * 1e6 : 0) + penalty + rank;
  } catch {
    return Infinity;
  }
}

const shifts = MARRAKECH_TERRAIN.map(() => 0);
let best = cost(shifts);
for (let round = 0; round < 6; round++) {
  let improved = false;
  for (let i = 0; i < shifts.length; i++) {
    let pick = shifts[i]!;
    for (let s = -reach(i); s <= reach(i); s += STEP) {
      shifts[i] = s;
      const c = cost(shifts);
      if (c < best) {
        best = c;
        pick = s;
        improved = true;
      }
    }
    shifts[i] = pick;
  }
  if (!improved) break;
}
// Coordinate moves stall on a plateau of infeasible sets, so refine with seeded random moves of one to three entries.
let seed = 12345;
const random = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
for (let n = 0; n < RANDOM_MOVES; n++) {
  const trial = [...shifts];
  for (let k = 1 + Math.floor(random() * 3); k > 0; k--) {
    const i = Math.floor(random() * trial.length);
    trial[i] = Math.round(((random() * 2 - 1) * reach(i)) / STEP) * STEP;
  }
  const c = cost(trial);
  if (c < best) {
    best = c;
    shifts.splice(0, shifts.length, ...trial);
  }
}
// Then pull each shift back toward zero while the cost does not rise.
for (let i = 0; i < shifts.length; i++) {
  for (;;) {
    const trial = [...shifts];
    trial[i] = shifts[i]! - Math.sign(shifts[i]!) * STEP;
    const c = shifts[i] === 0 ? Infinity : cost(trial);
    if (c > best) break;
    best = c;
    shifts[i] = trial[i]!;
  }
}
console.log(`cost ${best}`);
console.log(`export const MARRAKECH_TERRAIN_SHIFTS: readonly number[] = [${shifts.join(', ')}];`);

// The planner's own fuel chain with these shifts: its largest gap, and how much of the 1.5 km is left.
try {
  const { extras, segments } = planMarrakech(MARRAKECH_ROUTE, shifts);
  const at = [0, ...extras.fuel.map((f) => f.at), extras.total];
  console.log(`planner fuel chain (forward advance): largest gap ${Math.max(...at.slice(1).map((v, i) => v - at[i]!)).toFixed(0)} m`);
  const real = realGap(segments, extras.fuel);
  console.log(`real fuel chain (path length, with the finish pad): largest gap ${real.toFixed(0)} m, ${(FUEL_MAX_GAP - real).toFixed(0)} m under the ${FUEL_MAX_GAP} m maximum`);
  if (real > FUEL_MAX_GAP - THIN_MARGIN) console.warn(`warning: under ${THIN_MARGIN} m of margin left`);
} catch (error) {
  console.warn(`warning: no fuel chain with these shifts: ${(error as Error).message}`);
}
