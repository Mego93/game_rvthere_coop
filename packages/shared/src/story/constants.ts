import { TAJINE_HEAL, type ItemKind } from '../constants';
import { deepFreeze } from '../math';

export const STORY_DAY_SECONDS = 600;
export const STORY_MORNING_HOUR = 8;
export const STORY_NIGHT_HOUR = 23;
export const STORY_BANK_START = 2000;

export const NEED_START = deepFreeze({ health: 100, food: 80, happiness: 70, tiredness: 10 });
export const FOOD_FALL_PER_SECOND = 0.1;
export const HUNGER_BELOW = 25;
export const HUNGER_HEALTH_PER_SECOND = 0.2;
export const TIRED_RISE_PER_SECOND = 0.06;
export const TIRED_SLOW_ABOVE = 80;
export const TIRED_SLOW_FACTOR = 0.85;
export const SLEEP_TIREDNESS = 10;
export const MISSED_GOAL_HAPPINESS = -10;
export const GOAL_DONE_HAPPINESS = 5;

export const VIBECODE_TICK = 10;
export const VIBECODE_HAPPINESS = 5;
export const VIBECODE_TIREDNESS = 4;

export const RAPH_FOOD_FACTOR = 1.5;
export const RAPH_ANGER_FOOD_BELOW = 30;
export const RAPH_ANGER_PER_SECOND = 1;
export const RAPH_ANGER_FALL_PER_SECOND = 2;
export const RAPH_ANGER_MAX = 100;
export const SACHA_SPEND_WINDOW = 120;
export const HUU_PHRASE_WINDOW = 90;
// Happiness lost per second outside a trait window (1 per 20 s).
export const TRAIT_WINDOW_HAPPINESS_FALL = 1 / 20;
export const LOUIS_COMPLAIN_COOLDOWN = 20;
// The client's list of complaints is this long; the server picks the line shown.
export const COMPLAINT_COUNT = 12;
export const LOUIS_COMPLAIN_HAPPINESS = 2;
export const COFFEE_FAST = deepFreeze({ factor: 1.25, seconds: 60, slowFactor: 0.85, slowSeconds: 30 });
export const SUNIL_CODE_FALL_PER_SECOND = 1 / 6;
export const SUNIL_CODE_REFILL = 25;
export const SUNIL_CODE_HEALTH_PER_SECOND = 0.2;

export const FAKE_REPUBLIC_BELOW = 200;
export const FAKE_REPUBLIC_OUTCOMES: readonly number[] = deepFreeze([0, 300, 600, 1000]);
export const FAKE_REPUBLIC_WEIGHTS: readonly number[] = deepFreeze([0.25, 0.35, 0.25, 0.15]);
export const STORY_DOWN_LOSE_SECONDS = 60;
// m, a together goal needs every present friend within this of the spot.
export const TOGETHER_RADIUS = 3;

export type StoryItemKind = ItemKind | 'nutellaCrepe' | 'water' | 'tea' | 'coffee' | 'pizza';
export const STORY_FOOD_ITEMS = Object.freeze(['nutellaCrepe', 'water', 'tea', 'coffee', 'pizza'] as const);

// Dirhams.
export const STORY_PRICES = deepFreeze({ fromageBlanc: 15, kokeZero: 10, treedent: 8, nutellaCrepe: 25, tajine: 80, water: 5, tea: 10, coffee: 15 });
export type StoryPriced = keyof typeof STORY_PRICES;
export const PHONE_SHOP_PRICES = deepFreeze({ tcgPack: 150, shirt: 600, suit: 1500 });
export type PhoneShopItem = keyof typeof PHONE_SHOP_PRICES;
export const PHONE_BUY_HAPPINESS = 10;
export const KITCHEN_WITHDRAW = 500;

// Starting values (not in the plan's table): what eating each item gives. Health is the tajine's TAJINE_HEAL.
export const STORY_FOODS: Readonly<Record<string, { food: number; health: number; happiness: number }>> = deepFreeze({
  tajine: { food: 50, health: TAJINE_HEAL, happiness: 10 },
  treedent: { food: 2, health: 0, happiness: 2 },
  fromageBlanc: { food: 15, health: 0, happiness: 3 },
  kokeZero: { food: 5, health: 0, happiness: 3 },
  nutellaCrepe: { food: 25, health: 0, happiness: 10 },
  water: { food: 3, health: 0, happiness: 0 },
  tea: { food: 5, health: 0, happiness: 2 },
  coffee: { food: 5, health: 0, happiness: 2 },
  pizza: { food: 45, health: 0, happiness: 8 },
});
