import { CHARACTER_IDS, type CharacterId } from '../characters';
import { ITEM_KINDS } from '../constants';
import type { GoalState } from './days';
import {
  COFFEE_FAST, FAKE_REPUBLIC_BELOW, FAKE_REPUBLIC_OUTCOMES, FAKE_REPUBLIC_WEIGHTS, FOOD_FALL_PER_SECOND, GOAL_DONE_HAPPINESS, HUNGER_BELOW, HUNGER_HEALTH_PER_SECOND, HUU_PHRASE_WINDOW,
  LOUIS_COMPLAIN_COOLDOWN, LOUIS_COMPLAIN_HAPPINESS, MISSED_GOAL_HAPPINESS, NEED_START, PHONE_BUY_HAPPINESS, PHONE_SHOP_PRICES, RAPH_ANGER_FALL_PER_SECOND, RAPH_ANGER_FOOD_BELOW, RAPH_ANGER_MAX,
  RAPH_ANGER_PER_SECOND, RAPH_FOOD_FACTOR, SACHA_SPEND_WINDOW, SLEEP_TIREDNESS, STORY_BANK_START, STORY_FOODS, STORY_PRICES, SUNIL_CODE_FALL_PER_SECOND, SUNIL_CODE_HEALTH_PER_SECOND,
  SUNIL_CODE_REFILL, TIRED_RISE_PER_SECOND, TIRED_SLOW_ABOVE, TIRED_SLOW_FACTOR, TRAIT_WINDOW_HAPPINESS_FALL, VIBECODE_HAPPINESS, VIBECODE_TIREDNESS, type PhoneShopItem, type StoryItemKind, type StoryPriced,
} from './constants';

export type Activity = 'idle' | 'vibecoding' | 'exerting';

export interface FriendState {
  health: number;
  food: number;
  happiness: number;
  tiredness: number;
  cash: number;
  bank: number;
  anger: number;
  code: number;
  caffeine: { fast: number; slow: number };
  // Week-clock times in s; null means never (the trait window then runs from clock 0).
  lastSpend: number | null;
  lastPhrase: number | null;
  lastComplain: number | null;
  fakeRepublicDay: number | null;
  items: StoryItemKind[];
}

export interface Week {
  version: 1;
  day: number;
  clock: number;
  friends: Record<CharacterId, FriendState>;
  goals: GoalState[];
  finishedDays: number[];
  morning: Week | null;
}

export type Refusal = 'not_carried' | 'wrong_food' | 'not_for_sale' | 'not_enough_cash' | 'not_enough_bank' | 'bad_amount' | 'not_alexander' | 'not_luiz' | 'cooldown' | 'not_poor' | 'already_played' | 'bad_pick';
export type Result<T = unknown> = ({ ok: true; week: Week } & T) | { ok: false; reason: Refusal };

const clamp = (v: number, lo = 0, hi = 100): number => Math.min(hi, Math.max(lo, v));
const copy = (week: Week): Week => JSON.parse(JSON.stringify(week)) as Week;

const newFriend = (): FriendState => ({
  ...NEED_START,
  cash: 0,
  bank: STORY_BANK_START,
  anger: 0,
  code: 100,
  caffeine: { fast: 0, slow: 0 },
  lastSpend: null,
  lastPhrase: null,
  lastComplain: null,
  fakeRepublicDay: null,
  items: [],
});

export function newWeek(): Week {
  const friends = Object.fromEntries(CHARACTER_IDS.map((id) => [id, newFriend()])) as Record<CharacterId, FriendState>;
  const week: Week = { version: 1, day: 1, clock: 0, friends, goals: [], finishedDays: [], morning: null };
  week.morning = copy(week);
  return week;
}

// The factor on walk and sprint speed: coffee, then tiredness.
export function speedFactor(friend: FriendState): number {
  const coffee = friend.caffeine.fast > 0 ? COFFEE_FAST.factor : friend.caffeine.slow > 0 ? COFFEE_FAST.slowFactor : 1;
  return coffee * (friend.tiredness > TIRED_SLOW_ABOVE ? TIRED_SLOW_FACTOR : 1);
}

// Uses week.clock as "now" for the trait windows; the caller advances the clock.
export function stepNeeds(week: Week, dt: number, present: readonly CharacterId[], activity: Partial<Record<CharacterId, Activity>>): Week {
  const next = copy(week);
  for (const id of present) {
    const f = next.friends[id];
    const exerting = activity[id] === 'exerting';
    f.food = clamp(f.food - FOOD_FALL_PER_SECOND * (id === 'rafael' ? RAPH_FOOD_FACTOR : 1) * dt);
    if (f.food < HUNGER_BELOW) f.health -= HUNGER_HEALTH_PER_SECOND * dt;
    f.tiredness = clamp(f.tiredness + TIRED_RISE_PER_SECOND * (exerting ? 2 : 1) * dt);
    if (id === 'rafael') f.anger = clamp(f.anger + (f.food < RAPH_ANGER_FOOD_BELOW ? RAPH_ANGER_PER_SECOND : -RAPH_ANGER_FALL_PER_SECOND) * dt, 0, RAPH_ANGER_MAX);
    if (id === 'alexander' && next.clock - (f.lastSpend ?? 0) > SACHA_SPEND_WINDOW) f.happiness -= TRAIT_WINDOW_HAPPINESS_FALL * dt;
    if (id === 'huu' && next.clock - (f.lastPhrase ?? 0) > HUU_PHRASE_WINDOW) f.happiness -= TRAIT_WINDOW_HAPPINESS_FALL * dt;
    if (id === 'sounile') {
      f.code = clamp(f.code - SUNIL_CODE_FALL_PER_SECOND * dt);
      if (f.code <= 0) f.health -= SUNIL_CODE_HEALTH_PER_SECOND * dt;
    }
    if (f.caffeine.fast > 0) {
      f.caffeine.fast = Math.max(0, f.caffeine.fast - dt);
      if (f.caffeine.fast === 0) f.caffeine.slow = COFFEE_FAST.slowSeconds;
    } else if (f.caffeine.slow > 0) f.caffeine.slow = Math.max(0, f.caffeine.slow - dt);
    f.health = clamp(f.health);
    f.happiness = clamp(f.happiness);
  }
  return next;
}

// Eats a carried item; pizza comes free from the chef and only Nandan eats it, and Nandan eats nothing else.
export function eat(week: Week, id: CharacterId, item: StoryItemKind): Result {
  if (item === 'pizza' ? id !== 'nandan' : id === 'nandan') return { ok: false, reason: 'wrong_food' };
  const effect = STORY_FOODS[item];
  if (!effect) return { ok: false, reason: 'wrong_food' };
  const next = copy(week);
  const f = next.friends[id];
  if (item !== 'pizza') {
    const at = f.items.indexOf(item);
    if (at < 0) return { ok: false, reason: 'not_carried' };
    f.items.splice(at, 1);
  }
  f.food = clamp(f.food + effect.food);
  f.health = clamp(f.health + effect.health);
  f.happiness = clamp(f.happiness + effect.happiness);
  if (item === 'coffee') f.caffeine = { fast: COFFEE_FAST.seconds, slow: 0 };
  return { ok: true, week: next };
}

export function buy(week: Week, id: CharacterId, item: StoryItemKind): Result {
  if (!Object.hasOwn(STORY_PRICES, item)) return { ok: false, reason: 'not_for_sale' };
  const price = STORY_PRICES[item as StoryPriced];
  if (week.friends[id].cash < price) return { ok: false, reason: 'not_enough_cash' };
  const next = copy(week);
  next.friends[id].cash -= price;
  next.friends[id].items.push(item);
  return { ok: true, week: next };
}

export function withdraw(week: Week, id: CharacterId, amount: number): Result {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: 'bad_amount' };
  if (amount > week.friends[id].bank) return { ok: false, reason: 'not_enough_bank' };
  const next = copy(week);
  next.friends[id].bank -= amount;
  next.friends[id].cash += amount;
  return { ok: true, week: next };
}

// Alexander's phone shop, paid from his bank.
export function phoneBuy(week: Week, id: CharacterId, shopItem: PhoneShopItem): Result {
  if (id !== 'alexander') return { ok: false, reason: 'not_alexander' };
  if (!Object.hasOwn(PHONE_SHOP_PRICES, shopItem)) return { ok: false, reason: 'not_for_sale' };
  const price = PHONE_SHOP_PRICES[shopItem];
  if (week.friends[id].bank < price) return { ok: false, reason: 'not_enough_bank' };
  const next = copy(week);
  const f = next.friends[id];
  f.bank -= price;
  f.lastSpend = next.clock;
  f.happiness = clamp(f.happiness + PHONE_BUY_HAPPINESS);
  return { ok: true, week: next };
}

export function sayPhrase(week: Week, id: CharacterId, now: number): Result {
  const next = copy(week);
  next.friends[id].lastPhrase = now;
  return { ok: true, week: next };
}

export function complain(week: Week, id: CharacterId, now: number): Result {
  if (id !== 'luiz') return { ok: false, reason: 'not_luiz' };
  const last = week.friends[id].lastComplain;
  if (last !== null && now - last < LOUIS_COMPLAIN_COOLDOWN) return { ok: false, reason: 'cooldown' };
  const next = copy(week);
  next.friends[id].lastComplain = now;
  next.friends[id].happiness = clamp(next.friends[id].happiness + LOUIS_COMPLAIN_HAPPINESS);
  return { ok: true, week: next };
}

export function vibecodeTick(week: Week, id: CharacterId): Week {
  const next = copy(week);
  const f = next.friends[id];
  f.happiness = clamp(f.happiness + VIBECODE_HAPPINESS);
  f.tiredness = clamp(f.tiredness + VIBECODE_TIREDNESS);
  f.code = clamp(f.code + SUNIL_CODE_REFILL);
  return next;
}

// `pick` only changes the chart shown; the outcome is drawn from `rand` (in [0, 1)) with the weights and paid into the bank.
export function fakeRepublic(week: Week, id: CharacterId, pick: 0 | 1 | 2, rand: () => number): Result<{ outcome: number }> {
  if (pick !== 0 && pick !== 1 && pick !== 2) return { ok: false, reason: 'bad_pick' };
  const f = week.friends[id];
  if (f.fakeRepublicDay === week.day) return { ok: false, reason: 'already_played' };
  if (f.cash + f.bank >= FAKE_REPUBLIC_BELOW) return { ok: false, reason: 'not_poor' };
  let roll = rand();
  let at = FAKE_REPUBLIC_OUTCOMES.length - 1;
  for (let i = 0; i < FAKE_REPUBLIC_WEIGHTS.length; i += 1) {
    roll -= FAKE_REPUBLIC_WEIGHTS[i]!;
    if (roll < 0) {
      at = i;
      break;
    }
  }
  const outcome = FAKE_REPUBLIC_OUTCOMES[at]!;
  const next = copy(week);
  next.friends[id].bank += outcome;
  next.friends[id].fakeRepublicDay = week.day;
  return { ok: true, week: next, outcome };
}

// A goal done gives happiness to every present friend (default all).
export function goalDone(week: Week, goalId: string, present: readonly CharacterId[] = CHARACTER_IDS): Week {
  const next = copy(week);
  const goal = next.goals.find((g) => g.id === goalId);
  if (!goal || goal.status !== 'pending') return next;
  goal.status = 'done';
  for (const id of present) next.friends[id].happiness = clamp(next.friends[id].happiness + GOAL_DONE_HAPPINESS);
  return next;
}

// `present` defaults to every friend; absent friends are left as they are.
export function endDay(week: Week, missed: readonly string[], present: readonly CharacterId[] = CHARACTER_IDS): Week {
  const next = copy(week);
  next.morning = null;
  for (const id of present) {
    const f = next.friends[id];
    f.happiness = clamp(f.happiness + MISSED_GOAL_HAPPINESS * missed.length);
    f.tiredness = SLEEP_TIREDNESS;
  }
  for (const f of Object.values(next.friends)) {
    f.lastSpend = null;
    f.lastPhrase = null;
    f.lastComplain = null;
  }
  if (!next.finishedDays.includes(next.day)) next.finishedDays.push(next.day);
  next.day += 1;
  next.clock = 0;
  next.goals = [];
  next.morning = copy(next);
  return next;
}

// The week as it was this morning, still able to be lost again.
export function loseDay(week: Week): Week {
  if (!week.morning) return copy(week);
  const next = copy(week.morning);
  next.morning = copy(next);
  return next;
}

export const serialiseWeek = (week: Week): string => JSON.stringify(week);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v: unknown): v is number | null => v === null || isNum(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const NUMERIC = ['health', 'food', 'happiness', 'tiredness', 'cash', 'bank', 'anger', 'code'] as const;
const STATUSES = ['pending', 'done', 'missed', 'skipped'];

const validFriend = (v: unknown): v is FriendState => {
  if (!isRecord(v) || !NUMERIC.every((k) => isNum(v[k]))) return false;
  const c = v.caffeine;
  if (!isRecord(c) || !isNum(c.fast) || !isNum(c.slow)) return false;
  if (!isNumOrNull(v.lastSpend) || !isNumOrNull(v.lastPhrase) || !isNumOrNull(v.lastComplain) || !isNumOrNull(v.fakeRepublicDay)) return false;
  return Array.isArray(v.items) && v.items.every((i) => typeof i === 'string' && (Object.hasOwn(STORY_FOODS, i) || Object.hasOwn(ITEM_KINDS, i)));
};

const validWeek = (v: unknown, nested: boolean): v is Week => {
  if (!isRecord(v) || v.version !== 1 || !Number.isInteger(v.day) || !isNum(v.clock)) return false;
  if (!isRecord(v.friends) || !CHARACTER_IDS.every((id) => validFriend((v.friends as Record<string, unknown>)[id]))) return false;
  if (!Array.isArray(v.goals) || !v.goals.every((g) => isRecord(g) && typeof g.id === 'string' && STATUSES.includes(g.status as string))) return false;
  if (!Array.isArray(v.finishedDays) || !v.finishedDays.every((d) => Number.isInteger(d))) return false;
  if (v.morning === null) return true;
  return !nested && validWeek(v.morning, true) && (v.morning as Week).morning === null;
};

// Null for anything that is not a version 1 week: the caller logs it and starts a new week.
export function parseWeek(json: string): Week | null {
  try {
    const value: unknown = JSON.parse(json);
    return validWeek(value, false) ? value : null;
  } catch {
    return null;
  }
}
