import { HANDS_RANGE, PROP_KINDS } from './constants';
import { type Quat, type Vec3 } from './math';
import { aimRay } from './player';
import type { PropSnapshot } from './props';
import { contactPoint } from './push';
import { chooseSeat, distanceToBox } from './seats';
import type { VehicleConfig } from './vehicles';

export type InteractAction =
  | { kind: 'exitSeat' }
  | { kind: 'throw' }
  | { kind: 'board'; seatId: string }
  | { kind: 'pickUp'; propId: string };

export interface InteractCandidate {
  action: { kind: 'board'; seatId: string } | { kind: 'pickUp'; propId: string };
  // Radians between the aim and the candidate.
  angle: number;
}

// Rule F10: the angle to the point of the box nearest to the origin; 0 when the origin is inside the box.
export function aimAngleToBox(origin: Vec3, dir: Vec3, centre: Vec3, rot: Quat, half: Vec3): number {
  const nearest = contactPoint(origin, centre, rot, half);
  const dx = nearest.x - origin.x;
  const dy = nearest.y - origin.y;
  const dz = nearest.z - origin.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 1e-12) return 0;
  const cos = (dir.x * dx + dir.y * dy + dir.z * dz) / (distance * Math.hypot(dir.x, dir.y, dir.z));
  return Math.acos(Math.min(1, Math.max(-1, cos)));
}

// Rule K1; pure over poses so the server and the client's hint agree. Boarding comes first, then props in the given order.
export function interactCandidates(ctx: {
  config: VehicleConfig;
  vehiclePos: Vec3;
  vehicleRot: Quat;
  feet: Vec3;
  yaw: number;
  pitch: number;
  takenSeats: ReadonlySet<string>;
  props: readonly PropSnapshot[];
  heldProps: ReadonlySet<string>;
}): InteractCandidate[] {
  const { origin, dir } = aimRay(ctx.feet, ctx.yaw, ctx.pitch);
  const found: InteractCandidate[] = [];
  const seatId = chooseSeat(ctx.config, ctx.vehiclePos, ctx.vehicleRot, ctx.feet, ctx.takenSeats);
  if (seatId !== null) {
    found.push({
      action: { kind: 'board', seatId },
      angle: aimAngleToBox(origin, dir, ctx.vehiclePos, ctx.vehicleRot, ctx.config.halfExtents),
    });
  }
  for (const prop of ctx.props) {
    if (ctx.heldProps.has(prop.id) || !Object.hasOwn(PROP_KINDS, prop.kind)) continue;
    const config = PROP_KINDS[prop.kind as keyof typeof PROP_KINDS];
    if (config.class !== 'light') continue;
    if (distanceToBox(ctx.feet, config.halfExtents, prop.pos, prop.rot) > HANDS_RANGE) continue;
    found.push({
      action: { kind: 'pickUp', propId: prop.id },
      angle: aimAngleToBox(origin, dir, prop.pos, prop.rot, config.halfExtents),
    });
  }
  return found;
}

export function resolveInteract(ctx: {
  seat: string | null;
  hands: string | null;
  candidates: readonly InteractCandidate[];
}): InteractAction | null {
  if (ctx.seat !== null) return { kind: 'exitSeat' };
  if (ctx.hands !== null) return { kind: 'throw' };
  let best: InteractCandidate | null = null;
  for (const candidate of ctx.candidates) if (best === null || candidate.angle < best.angle) best = candidate;
  return best === null ? null : best.action;
}
