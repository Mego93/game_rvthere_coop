import { TICK_DT } from './constants';
import { dot, sub, vec3, type Vec3 } from './math';

export function damageAbove(speed: number, threshold: number, perUnit: number): number {
  return Math.max(0, speed - threshold) * perUnit;
}

// Rule H6: the seconds left after one tick, or 'respawn' at the end; a paused timer does not move.
export function stepDowned(downed: number, paused: boolean): number | 'respawn' {
  if (paused) return downed;
  const left = downed - TICK_DT;
  return left <= 1e-9 ? 'respawn' : left;
}

// Rule H7: false for an empty world.
export function everyoneDowned(players: readonly { downed: number | null }[]): boolean {
  return players.length > 0 && players.every((player) => player.downed !== null);
}

// Rules H4, J3: how fast the body closes on the player along n, the unit normal from the body to the player.
export function relativeSpeed(bodyLinvel: Vec3, bodyAngvel: Vec3, bodyCentre: Vec3, point: Vec3, playerVel: Vec3, n: Vec3): number {
  const r = sub(point, bodyCentre);
  const w = bodyAngvel;
  const atPoint = vec3(bodyLinvel.x + w.y * r.z - w.z * r.y, bodyLinvel.y + w.z * r.x - w.x * r.z, bodyLinvel.z + w.x * r.y - w.y * r.x);
  return Math.max(0, dot(sub(atPoint, playerVel), n));
}
