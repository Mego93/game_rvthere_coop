// Run: npx tsx scripts/route/searchTerrain.ts
// Finds MARRAKECH_TERRAIN_SHIFTS: the smallest moves of the hill and pit targets that leave a fuel chain of gaps at most 1.5 km.
import { fitRoute } from '../../packages/shared/src/courses/fit';
import { largestStopGap } from '../../packages/shared/src/courses/marrakech.extras';
import { MARRAKECH_ROUTE } from '../../packages/shared/src/courses/marrakech.route';
import { MARRAKECH_TERRAIN, MAX_TERRAIN_DISTANCE, placeTerrain } from '../../packages/shared/src/courses/marrakech.plan';

const STEP = 50;
const REACH = 1000;
const GAP_GOAL = 1400;
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
