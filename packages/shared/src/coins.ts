import { COIN_RADIUS, PLAYER_HEIGHT, PLAYER_RADIUS } from './constants';
import type { Vec3 } from './math';

// Rule V1: the coin's centre is within PLAYER_RADIUS + COIN_RADIUS of the capsule's segment.
export function coinTouched(feet: Vec3, coinPos: Vec3): boolean {
  const low = feet.y + PLAYER_RADIUS;
  const high = feet.y + PLAYER_HEIGHT - PLAYER_RADIUS;
  const y = Math.min(Math.max(coinPos.y, low), high);
  const reach = PLAYER_RADIUS + COIN_RADIUS;
  return Math.hypot(coinPos.x - feet.x, coinPos.y - y, coinPos.z - feet.z) <= reach;
}
