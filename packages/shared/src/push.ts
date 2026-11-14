import { PLAYER_WALK_SPEED, PUSH_FORCE, PUSH_FORCE_TIPPED, PUSH_MAX_ACCEL } from './constants';
import { rotate, vec3, type Quat, type Vec3 } from './math';

export interface PushIntent {
  playerId: string;
  bodyId: 'vehicle' | string;
  point: Vec3;
  force: Vec3;
}

export function requiredPushers(playerCount: number): number {
  if (playerCount <= 1) return 1;
  return playerCount <= 3 ? 2 : 3;
}

const conjugate = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
const clamp = (value: number, limit: number): number => Math.min(limit, Math.max(-limit, value));

// The point of the box nearest to the push point (rule F3).
export function contactPoint(pushPoint: Vec3, centre: Vec3, rot: Quat, half: Vec3): Vec3 {
  const local = rotate(conjugate(rot), vec3(pushPoint.x - centre.x, pushPoint.y - centre.y, pushPoint.z - centre.z));
  const clamped = rotate(rot, vec3(clamp(local.x, half.x), clamp(local.y, half.y), clamp(local.z, half.z)));
  return vec3(centre.x + clamped.x, centre.y + clamped.y, centre.z + clamped.z);
}

// Rules H1 to H3: the force one player applies, or null when the move does not point into the surface.
export function pushForce(
  wish: { x: number; z: number },
  pushPoint: Vec3,
  contact: Vec3,
  mass: number,
  tipped: boolean,
): Vec3 | null {
  const speed = Math.hypot(wish.x, wish.z);
  if (speed < 1e-9) return null;
  const toX = contact.x - pushPoint.x;
  const toZ = contact.z - pushPoint.z;
  const reach = Math.hypot(toX, toZ);
  if (reach < 1e-6) return null;
  if ((wish.x / speed) * (toX / reach) + (wish.z / speed) * (toZ / reach) <= 0) return null;
  const magnitude = Math.min(tipped ? PUSH_FORCE_TIPPED : PUSH_FORCE, mass * PUSH_MAX_ACCEL) * Math.min(1, speed / PLAYER_WALK_SPEED);
  return vec3((wish.x / speed) * magnitude, 0, (wish.z / speed) * magnitude);
}
