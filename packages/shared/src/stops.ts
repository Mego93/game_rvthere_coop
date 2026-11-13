import { insideBox } from './checkpoints';
import type { ServiceStop } from './course';
import type { Vec3 } from './math';

// Rule V5: the vehicle's centre is in the zone and it needs what the stop gives.
export function stopUsable(stop: ServiceStop, vehicleCentre: Vec3, fuel: number, health: number): boolean {
  if (!insideBox(vehicleCentre, stop.zone)) return false;
  return stop.kind === 'fuel' ? fuel < 1 : health < 1;
}
