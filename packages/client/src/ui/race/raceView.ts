import { raceResult, type RaceMedal, type RaceResultMessage } from '@lodgy/shared';

// How long the result panel stays when nobody closes it.
export const RACE_RESULT_SECONDS = 8;

const finite = (seconds: number) => (Number.isFinite(seconds) && seconds > 0 ? seconds : 0);

// Floors to tenths, like the HUD timer, so the display never runs ahead of the clock.
export function raceClock(seconds: number): string {
  const tenths = Math.floor(finite(seconds) * 10 + 1e-6);
  const minutes = Math.floor(tenths / 600);
  return `${minutes}:${((tenths % 600) / 10).toFixed(1).padStart(4, '0')}`;
}

export function targetClock(seconds: number): string {
  const whole = Math.floor(finite(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export interface RaceHudView {
  timer: string;
  target: string;
  // The medal the time would earn if the race ended now.
  pace: RaceMedal;
}

export function raceHudView(elapsed: number, target: number): RaceHudView {
  return { timer: raceClock(elapsed), target: `Gold under ${targetClock(target)}`, pace: raceResult(finite(elapsed), target).medal };
}

const MEDAL_TITLES: Record<RaceMedal, string> = { gold: 'Gold medal', silver: 'Silver medal', bronze: 'Bronze medal' };

export interface RaceResultView {
  medal: RaceMedal;
  title: string;
  time: string;
  target: string;
  happiness: string;
}

const happinessText = (change: number) => (change > 0 ? `Happiness +${change}` : change < 0 ? `Happiness ${change}` : 'Happiness unchanged');

// The medal is the server's; the happiness change is the same shared rule the server applied.
export function raceResultView(message: Pick<RaceResultMessage, 'time' | 'target' | 'medal'>): RaceResultView {
  return {
    medal: message.medal,
    title: MEDAL_TITLES[message.medal],
    time: `Your time ${raceClock(message.time)}`,
    target: `Gold under ${targetClock(message.target)}`,
    happiness: happinessText(raceResult(message.time, message.target).happiness),
  };
}
