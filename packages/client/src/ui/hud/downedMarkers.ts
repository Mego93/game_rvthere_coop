import { clamp, type Vec3 } from '@lodgy/shared';

export function projectMarker(
  project: (p: Vec3) => { x: number; y: number; z: number },
  cameraSpaceZ: (p: Vec3) => number,
  pos: Vec3,
  width: number,
  height: number,
): { x: number; y: number; behind: boolean } {
  const behind = cameraSpaceZ(pos) >= 0;
  const ndc = project(pos);
  // A point behind the camera projects mirrored; flip it so the marker points the right way.
  const sign = behind ? -1 : 1;
  const nx = clamp(ndc.x * sign, -1, 1);
  const ny = clamp(ndc.y * sign, -1, 1);
  return { x: ((nx + 1) / 2) * width, y: ((1 - ny) / 2) * height, behind };
}
