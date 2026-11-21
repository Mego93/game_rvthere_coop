import type { Spot, SpotKind, Vec3 } from '@lodgy/shared';

// Metres within which a spot's marker and prompt show.
export const SPOT_MARKER_RANGE = 6;

const PROMPTS: Record<SpotKind, string> = {
  kitchen: 'F to eat in the kitchen',
  chef: 'F to ask the chef for pizza',
  laptop: 'Hold F to vibecode',
  bed: 'F to go to bed',
  couch: 'The couch',
  board: 'F to read the goals',
  atm: 'F to withdraw 500 dh',
  shop: 'F to shop at the kiosk',
  gate: 'F to take the Lodgy out',
};

// The marker's short label above a spot.
export const SPOT_LABELS: Record<SpotKind, string> = { kitchen: 'EAT', chef: 'PIZZA', laptop: 'CODE', bed: 'BED', couch: 'SOFA', board: 'GOALS', atm: 'ATM', shop: 'SHOP', gate: 'GO' };

// What the use key does at a spot; a bed does nothing before night and a couch nothing at all, so they have no key.
export function spotPrompt(kind: SpotKind, night: boolean): string | null {
  if (kind === 'couch') return null;
  if (kind === 'bed' && !night) return null;
  return PROMPTS[kind];
}

// Whether a spot's marker is drawn: not for the couch seats, and only within range.
export const markerShown = (spot: Spot, feet: Vec3 | null): boolean => spot.kind !== 'couch' && feet !== null && Math.hypot(spot.pos.x - feet.x, spot.pos.z - feet.z) <= SPOT_MARKER_RANGE;

// The spot a use press would reach: the nearest whose radius holds the feet, as the world picks it.
export function usableSpot(spots: readonly Spot[], feet: Vec3 | null, reachHeight = 1.5): Spot | null {
  if (feet === null) return null;
  let best: Spot | null = null;
  let bestDistance = Infinity;
  for (const spot of spots) {
    const distance = Math.hypot(spot.pos.x - feet.x, spot.pos.z - feet.z);
    if (distance <= spot.radius && Math.abs(spot.pos.y - feet.y) <= reachHeight && distance < bestDistance) {
      best = spot;
      bestDistance = distance;
    }
  }
  return best;
}

// The ATM is reachable for the phone's withdraw within its radius plus a step.
export const ATM_PHONE_REACH = 1.5;
export function nearAtm(spots: readonly Spot[], feet: Vec3 | null): boolean {
  return feet !== null && spots.some((spot) => spot.kind === 'atm' && Math.hypot(spot.pos.x - feet.x, spot.pos.z - feet.z) <= spot.radius + ATM_PHONE_REACH);
}
