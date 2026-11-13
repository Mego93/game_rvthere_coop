import { TICK_DT } from './constants';

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
