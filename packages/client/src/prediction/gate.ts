import type { PlayerSnapshot } from '@lodgy/shared';

// Prediction runs only while the player is unseated, off any body and not downed.
export const predictionActive = (entry: Pick<PlayerSnapshot, 'seat' | 'ground' | 'downed'>): boolean =>
  entry.seat === null && entry.ground === null && entry.downed === null;
