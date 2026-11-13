import { ANCHOR_HEIGHT, HANDS_RANGE, HOOK_RANGE, PROP_KINDS, PUSH_HEIGHT, WINCH_MAX_LENGTH } from './constants';
import type { Placed } from './course';
import { IDENTITY, add, length, rotate, sub, vec3, type Quat, type Vec3 } from './math';
import { aimRay } from './player';
import type { PropSnapshot } from './props';
import { contactPoint } from './push';
import { chooseSeat, distanceToBox } from './seats';
import type { VehicleConfig } from './vehicles';
import type { CableSnapshot } from './winch';

export type InteractAction =
  | { kind: 'exitSeat' }
  | { kind: 'throw' }
  | { kind: 'board'; seatId: string }
  | { kind: 'pickUp'; propId: string }
  | { kind: 'attachHook'; anchorId: string }
  | { kind: 'dropHook' }
  | { kind: 'takeHook' }
  | { kind: 'detachHook' }
  | { kind: 'releaseHook' };

export interface InteractCandidate {
  action:
    | { kind: 'board'; seatId: string }
    | { kind: 'pickUp'; propId: string }
    | { kind: 'attachHook'; anchorId: string }
    | { kind: 'takeHook' }
    | { kind: 'detachHook' }
    | { kind: 'releaseHook' };
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

const ZERO_HALF = vec3(0, 0, 0);

const seatPos = (config: VehicleConfig, seatId: string): Vec3 => config.seats.find((seat) => seat.id === seatId)?.pos ?? vec3(0, 0, 0);

// Rule K1 with W11: the boarding angle is to the chosen seat, not to the vehicle's box. Pure over poses so the server and the client's hint agree. Seated players have no candidates (they leave the seat).
// Holding the hook: the anchors in range. Holding a prop: none. Empty hands: the hook, then boarding, props in the given order.
// The order of the list is the tie order (V8): board, takeHook, detachHook, releaseHook, then props; attach: static anchors, then props.
export function interactCandidates(ctx: {
  config: VehicleConfig;
  vehiclePos: Vec3;
  vehicleRot: Quat;
  feet: Vec3;
  yaw: number;
  pitch: number;
  seat: string | null;
  hands: string | null;
  takenSeats: ReadonlySet<string>;
  props: readonly PropSnapshot[];
  heldProps: ReadonlySet<string>;
  cable: CableSnapshot;
  anchors: readonly Placed[];
}): InteractCandidate[] {
  if (ctx.seat !== null) return [];
  const { origin, dir } = aimRay(ctx.feet, ctx.yaw, ctx.pitch);
  const chest = add(ctx.feet, vec3(0, PUSH_HEIGHT, 0));
  const mount = add(ctx.vehiclePos, rotate(ctx.vehicleRot, ctx.config.winchMount));
  const inReach = (point: Vec3) => length(sub(point, chest)) <= HOOK_RANGE;
  const angleTo = (point: Vec3) => aimAngleToBox(origin, dir, point, IDENTITY, ZERO_HALF);
  const found: InteractCandidate[] = [];

  if (ctx.hands === 'hook') {
    const attach = (anchorId: string, point: Vec3) => {
      if (inReach(point) && length(sub(point, mount)) <= WINCH_MAX_LENGTH) {
        found.push({ action: { kind: 'attachHook', anchorId }, angle: angleTo(point) });
      }
    };
    for (const anchor of ctx.anchors) attach(anchor.id, add(anchor.pose.pos, vec3(0, ANCHOR_HEIGHT, 0)));
    for (const prop of ctx.props) {
      if (!Object.hasOwn(PROP_KINDS, prop.kind)) continue;
      const local = PROP_KINDS[prop.kind as keyof typeof PROP_KINDS].anchor;
      if (local) attach(prop.id, add(prop.pos, rotate(prop.rot, local)));
    }
    return found;
  }
  if (ctx.hands !== null) return [];

  const seatId = chooseSeat(ctx.config, ctx.vehiclePos, ctx.vehicleRot, ctx.feet, ctx.takenSeats);
  if (seatId !== null) {
    found.push({
      action: { kind: 'board', seatId },
      angle: angleTo(add(ctx.vehiclePos, rotate(ctx.vehicleRot, seatPos(ctx.config, seatId)))),
    });
  }
  const { cable } = ctx;
  if (cable.state === 'stowed' && inReach(mount)) found.push({ action: { kind: 'takeHook' }, angle: angleTo(mount) });
  if (cable.state === 'ground' && inReach(cable.hookPos)) found.push({ action: { kind: 'takeHook' }, angle: angleTo(cable.hookPos) });
  if (cable.state === 'attached') {
    if (inReach(cable.hookPos)) found.push({ action: { kind: 'detachHook' }, angle: angleTo(cable.hookPos) });
    if (inReach(mount)) found.push({ action: { kind: 'releaseHook' }, angle: angleTo(mount) });
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

const isAttach = (candidate: InteractCandidate) => candidate.action.kind === 'attachHook';

// The candidates of interactCandidates split the way resolveInteract takes them.
export function splitCandidates(found: readonly InteractCandidate[]): { candidates: InteractCandidate[]; attachCandidates: InteractCandidate[] } {
  return { candidates: found.filter((c) => !isAttach(c)), attachCandidates: found.filter(isAttach) };
}

const smallest = (list: readonly InteractCandidate[]): InteractCandidate | null => {
  let best: InteractCandidate | null = null;
  for (const candidate of list) if (best === null || candidate.angle < best.angle) best = candidate;
  return best;
};

export function resolveInteract(ctx: {
  seat: string | null;
  hands: string | null;
  holdsHook: boolean;
  candidates: readonly InteractCandidate[];
  attachCandidates: readonly InteractCandidate[];
}): InteractAction | null {
  if (ctx.seat !== null) return { kind: 'exitSeat' };
  if (ctx.holdsHook) return smallest(ctx.attachCandidates)?.action ?? { kind: 'dropHook' };
  if (ctx.hands !== null) return { kind: 'throw' };
  return smallest(ctx.candidates)?.action ?? null;
}
