// Run: npx tsx scripts/route/searchTerrain.ts (finds MARRAKECH_TERRAIN_SHIFTS: the smallest moves that keep a fuel chain within 1.5 km)
import { fitRoute } from '../../packages/shared/src/courses/fit';
import { FUEL_MAX_GAP, largestStopGap } from '../../packages/shared/src/courses/marrakech.extras';
import { MARRAKECH_ROUTE } from '../../packages/shared/src/courses/marrakech.route';
import { MARRAKECH_TERRAIN, MAX_TERRAIN_DISTANCE, placeTerrain, planMarrakech } from '../../packages/shared/src/courses/marrakech.plan';

const STEP = 50;
const REACH = 1000;
const GAP_GOAL = 1400;
const THIN_MARGIN = 25;
const fitted = fitRoute(MARRAKECH_ROUTE).segments;

function cost(shifts: number[]): number {
  try {
    const plan = placeTerrain(fitted, shifts);
    const terrain = plan.placements.slice(plan.placements.length - MARRAKECH_TERRAIN.length);
    if (terrain.some((p) => p.distance > MAX_TERRAIN_DISTANCE)) return Infinity;
    return Math.max(largestStopGap(plan.segments, plan.inserted, plan.spans), GAP_GOAL) * 1000 + shifts.reduce((sum, s) => sum + Math.abs(s), 0);
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
    for (let s = -REACH; s <= REACH; s += STEP) {
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
console.log(`cost ${best}`);
console.log(`export const MARRAKECH_TERRAIN_SHIFTS: readonly number[] = [${shifts.join(', ')}];`);

// The planner's own fuel chain with these shifts: its largest gap, and how much of the 1.5 km is left.
try {
  const { extras } = planMarrakech(MARRAKECH_ROUTE, shifts);
  const at = [0, ...extras.fuel.map((f) => f.at), extras.total];
  const real = Math.max(...at.slice(1).map((v, i) => v - at[i]!));
  console.log(`real fuel chain: largest gap ${real.toFixed(0)} m, ${(FUEL_MAX_GAP - real).toFixed(0)} m under the ${FUEL_MAX_GAP} m maximum`);
  if (real > FUEL_MAX_GAP - THIN_MARGIN) console.warn(`warning: under ${THIN_MARGIN} m of margin left`);
} catch (error) {
  console.warn(`warning: no fuel chain with these shifts: ${(error as Error).message}`);
}
