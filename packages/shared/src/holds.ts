import { HOLD_DURATION, ITEM_KINDS, TICK_DT, USE_RANGE, type ItemKind } from './constants';
import type { Quat, Vec3 } from './math';
import { distanceToBox } from './seats';

export interface Hold {
  action: 'useItem';
  targetId: 'vehicle';
  slot: 0 | 1 | 2;
  item: ItemKind;
  // 0..1
  progress: number;
}

export interface HoldVehicle {
  pos: Vec3;
  rot: Quat;
  half: Vec3;
  fuel: number;
  health: number;
}

// Rule I8.
export function useTarget(item: ItemKind | null, feet: Vec3, vehicle: HoldVehicle): 'vehicle' | null {
  if (item === null || !(item in ITEM_KINDS)) return null;
  const needed = item === 'jerrycan' ? vehicle.fuel < 1 : vehicle.health < 1;
  if (!needed) return null;
  return distanceToBox(feet, vehicle.half, vehicle.pos, vehicle.rot) <= USE_RANGE ? 'vehicle' : null;
}

const DONE = 1 - 1e-9;

// Rules I8 and I9. The press tick binds and counts as the first tick of progress.
export function stepHold(
  hold: Hold | null,
  input: { usePressed: boolean; useHeld: boolean; slot: 0 | 1 | 2 },
  inventory: readonly (ItemKind | null)[],
  target: 'vehicle' | null,
  seated: boolean,
): { hold: Hold | null; completed: Hold | null } {
  const none = { hold: null, completed: null };
  if (seated) return none;
  let current: Hold;
  if (hold) {
    if (!input.useHeld || target === null || input.slot !== hold.slot || inventory[hold.slot] !== hold.item) return none;
    current = hold;
  } else {
    const item = inventory[input.slot] ?? null;
    if (!input.usePressed || target === null || item === null) return none;
    current = { action: 'useItem', targetId: target, slot: input.slot, item, progress: 0 };
  }
  const progress = current.progress + TICK_DT / HOLD_DURATION;
  if (progress >= DONE) return { hold: null, completed: { ...current, progress: 1 } };
  return { hold: { ...current, progress }, completed: null };
}
