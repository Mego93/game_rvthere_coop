import {
  COFFEE_FAST,
  FAKE_REPUBLIC_BELOW,
  HUNGER_BELOW,
  STORY_MORNING_HOUR,
  STORY_NIGHT_HOUR,
  TIRED_SLOW_ABOVE,
  clamp,
  type CharacterId,
  type GoalStatus,
  type StoryFriendView,
} from '@lodgy/shared';

export interface NeedBar {
  key: 'food' | 'happiness' | 'tiredness';
  label: string;
  fraction: number;
  text: string;
  // The bar is in a bad state: hungry, unhappy or worn out.
  warn: boolean;
}

export interface NeedsView {
  bars: NeedBar[];
  cash: number;
  bank: number;
  caffeine: { phase: 'fast' | 'slow'; fraction: number; text: string } | null;
  angry: boolean;
}

const LOW_HAPPINESS = 25;
const LABELS = { food: 'Food', happiness: 'Happiness', tiredness: 'Tiredness' } as const;

const level = (value: number) => (Number.isFinite(value) ? clamp(value, 0, 100) : 0);

// The needs HUD for one friend, from the server's view of him.
export function needsView(friend: StoryFriendView, characterId: CharacterId): NeedsView {
  const food = level(friend.food);
  const happiness = level(friend.happiness);
  const tiredness = level(friend.tiredness);
  const bar = (key: NeedBar['key'], value: number, warn: boolean): NeedBar => ({ key, label: LABELS[key], fraction: value / 100, text: String(Math.round(value)), warn });
  let caffeine: NeedsView['caffeine'] = null;
  if (characterId === 'luiz') {
    if (friend.caffeine.fast > 0) caffeine = { phase: 'fast', fraction: clamp(friend.caffeine.fast / COFFEE_FAST.seconds, 0, 1), text: `${Math.ceil(friend.caffeine.fast)}s` };
    else if (friend.caffeine.slow > 0) caffeine = { phase: 'slow', fraction: clamp(friend.caffeine.slow / COFFEE_FAST.slowSeconds, 0, 1), text: `${Math.ceil(friend.caffeine.slow)}s` };
  }
  return {
    bars: [bar('food', food, food < HUNGER_BELOW), bar('happiness', happiness, happiness < LOW_HAPPINESS), bar('tiredness', tiredness, tiredness > TIRED_SLOW_ABOVE)],
    cash: friend.cash,
    bank: friend.bank,
    caffeine,
    angry: characterId === 'rafael' && friend.angry === true,
  };
}

const two = (value: number) => String(value).padStart(2, '0');

// hh:mm from 08:00 at the start of the day to 23:00 at its end; the minute is floored so the clock never runs ahead.
export function clockText(clock: number, dayLength: number): string {
  const fraction = Number.isFinite(clock) && dayLength > 0 ? clamp(clock / dayLength, 0, 1) : 0;
  const minutes = Math.floor((STORY_MORNING_HOUR + fraction * (STORY_NIGHT_HOUR - STORY_MORNING_HOUR)) * 60 + 1e-6);
  return `${two(Math.floor(minutes / 60))}:${two(minutes % 60)}`;
}

export const cashText = (amount: number): string => `${Math.round(amount).toLocaleString('en-US')} dh`;

// Fake Republic: only for a friend with under 200 dirhams in all, once a day.
export const fakeRepublicShown = (friend: Pick<StoryFriendView, 'cash' | 'bank' | 'played'>): boolean => friend.cash + friend.bank < FAKE_REPUBLIC_BELOW && friend.played !== true;

const MARKS: Record<GoalStatus, string> = { pending: '○', done: '✓', missed: '✗', skipped: '–' };

export interface GoalRow {
  id: string;
  label: string;
  status: GoalStatus;
  mark: string;
}

export const goalsView = (goals: readonly { id: string; label: string; status: GoalStatus }[]): GoalRow[] => goals.map((goal) => ({ id: goal.id, label: goal.label, status: goal.status, mark: MARKS[goal.status] }));

export interface StoryHudModel {
  needs: NeedsView | null;
  clock: string;
  night: boolean;
  goals: GoalRow[];
  day: number;
}

// Everything the story HUD draws, from the latest state; the needs are null while the local friend is not in it.
export function storyHudModel(state: { day: number; clock: number; dayLength: number; night: boolean; goals: readonly { id: string; label: string; status: GoalStatus }[]; friends: Partial<Record<CharacterId, StoryFriendView>> }, character: CharacterId | null): StoryHudModel {
  const mine = character ? state.friends[character] : undefined;
  return { needs: mine && character ? needsView(mine, character) : null, clock: clockText(state.clock, state.dayLength), night: state.night, goals: goalsView(state.goals), day: state.day };
}
