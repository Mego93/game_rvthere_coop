import type { Box, Checkpoint, Vec3 } from '@lodgy/shared';

export const COMPASS_FOV = Math.PI;

// Brings an angle into (-PI, PI].
function wrap(angle: number): number {
  const wrapped = angle % (2 * Math.PI);
  if (wrapped > Math.PI) return wrapped - 2 * Math.PI;
  if (wrapped <= -Math.PI) return wrapped + 2 * Math.PI;
  return wrapped;
}

// Yaw convention: 0 faces -z, positive turns left.
export function bearingTo(from: Vec3, to: Vec3): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

// Positive when the target is to the right.
export function headingOffset(heading: number, bearing: number): number {
  return wrap(heading - bearing);
}

export function markerPosition(offset: number): number | null {
  return Math.abs(offset) <= COMPASS_FOV / 2 ? 0.5 + offset / COMPASS_FOV : null;
}

export function edgeSide(offset: number): -1 | 0 | 1 {
  if (!(Math.abs(offset) > COMPASS_FOV / 2)) return 0;
  return offset > 0 ? 1 : -1;
}

// checkpointIndex is the last reached checkpoint (0 at the start).
export function compassTarget(checkpoints: readonly Checkpoint[], finish: Box, checkpointIndex: number, won: boolean): Vec3 | null {
  if (won) return null;
  return (checkpoints[checkpointIndex + 1]?.trigger ?? finish).center;
}

export function compassLabel(distance: number | null): string {
  return distance === null ? '' : `${Math.round(distance)} m`;
}
