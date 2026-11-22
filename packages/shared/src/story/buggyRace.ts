export type RaceMedal = 'gold' | 'silver' | 'bronze';

// Multiples of the target time: gold is under the first, silver under the second, bronze otherwise.
export const RACE_MEDALS = { gold: 1, silver: 1.25 } as const;
export const RACE_HAPPINESS: Record<RaceMedal, number> = { gold: 10, silver: 5, bronze: 0 };
// A time over target x this costs RACE_SLOW_HAPPINESS instead.
export const RACE_SLOW_FACTOR = 2;
export const RACE_SLOW_HAPPINESS = -5;
// Seconds from the lunch to the return to the villa.
export const LUNCH_RETURN_SECONDS = 5;

export function raceResult(timeSeconds: number, targetTime: number): { medal: RaceMedal; happiness: number } {
  const medal: RaceMedal = timeSeconds < targetTime * RACE_MEDALS.gold ? 'gold' : timeSeconds < targetTime * RACE_MEDALS.silver ? 'silver' : 'bronze';
  const slow = timeSeconds > targetTime * RACE_SLOW_FACTOR;
  return { medal, happiness: slow ? RACE_SLOW_HAPPINESS : RACE_HAPPINESS[medal] };
}
