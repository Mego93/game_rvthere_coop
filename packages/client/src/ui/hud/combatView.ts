import type { PlayerSnapshot } from '@lodgy/shared';

export interface PowerTimer {
  kind: 'treedent' | 'shield' | 'koke';
  label: string;
  // Seconds left, or the damage the shield still absorbs.
  text: string;
}

export interface CombatView {
  // Rounds left; null when the player has no gun to show (none, seated or downed).
  ammo: number | null;
  timers: PowerTimer[];
}

type Source = Pick<PlayerSnapshot, 'seat' | 'downed' | 'gun' | 'ammo' | 'treedent' | 'shield' | 'koke'>;

// Whole seconds rounded up, so a timer never reads 0 while it still runs.
export const timerText = (seconds: number): string => `${Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds - 1e-9)) : 0}s`;

export function combatView(player: Source | undefined): CombatView {
  if (!player) return { ammo: null, timers: [] };
  const timers: PowerTimer[] = [];
  if (player.treedent !== undefined && player.treedent > 0) timers.push({ kind: 'treedent', label: 'Gum', text: timerText(player.treedent) });
  if (player.shield !== undefined && player.shield > 0) timers.push({ kind: 'shield', label: 'Shield', text: String(Math.ceil(player.shield - 1e-9)) });
  if (player.koke !== undefined && player.koke > 0) timers.push({ kind: 'koke', label: 'Koke', text: timerText(player.koke) });
  const armed = player.gun === true && player.seat === null && player.downed === null;
  return { ammo: armed ? (player.ammo ?? 0) : null, timers };
}
