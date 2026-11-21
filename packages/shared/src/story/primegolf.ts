import { CHARACTER_IDS, type CharacterId } from '../characters';
import { deepFreeze, type Vec3 } from '../math';
import { STORY_PRICES } from './constants';
import type { Week } from './week';

export const GOLF_BALLS_EACH = 6;
export const GOLF_MAX_SPEED = 62;
// Degrees above the horizon.
export const GOLF_LAUNCH_PITCH = 14;
// m/s^2 sideways at curve +-1.
export const GOLF_CURVE_ACCEL = 6;
// s, the power bar fills and then empties while the button is held.
export const GOLF_POWER_CYCLE = 1.6;
export const GOLF_BALL_RADIUS = 0.0215;
// s, a ball not landed by then counts as a miss.
export const GOLF_SETTLE_SECONDS = 6;
export const GOLF_SCOREBOARD_SECONDS = 2.5;
export const GOLF_BEST_HAPPINESS = 15;
export const GOLF_TEAM_HAPPINESS_MAX = 10;
// Team points per happiness point.
export const GOLF_TEAM_DIVISOR = 20;
// m, the field the rings lie on.
export const GOLF_FIELD = deepFreeze({ length: 240, width: 80 });

// Field coordinates: the tee is the origin, the field runs toward -z, and +x is to the right of a player facing down it.
export interface GolfRing {
  id: string;
  x: number;
  z: number;
  radius: number;
  points: number;
}

const SIDE = 12;
const ringAt = (id: string, distance: number, radius: number, points: number, side: -1 | 0 | 1): GolfRing => ({ id, x: side * SIDE, z: -distance, radius, points });

export const GOLF_RINGS: readonly GolfRing[] = deepFreeze([
  ringAt('red', 20, 6, 10, 1),
  ringAt('yellow', 50, 6, 15, -1),
  ringAt('green', 80, 6, 20, 1),
  ringAt('blue', 110, 6.5, 25, -1),
  ringAt('purple', 140, 6.5, 30, 1),
  ringAt('orange', 170, 7, 40, -1),
  ringAt('white', 200, 7, 50, 1),
  ringAt('jackpot', 215, 2, 150, 0),
]);

export interface GolfState {
  // The friends playing, in character order.
  order: CharacterId[];
  // Balls still to hit.
  left: Partial<Record<CharacterId, number>>;
  scores: Partial<Record<CharacterId, number[]>>;
  // Null once nobody has a ball left.
  turn: CharacterId | null;
}

// What the world's snapshot carries.
export interface GolfSnapshot {
  turn: CharacterId | null;
  ball: Vec3 | null;
  scores: Partial<Record<CharacterId, number[]>>;
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// The first friend with balls left, looking from `from` round the order.
function nextWithBalls(state: GolfState, from: number): CharacterId | null {
  for (let i = 0; i < state.order.length; i++) {
    const id = state.order[(from + i) % state.order.length]!;
    if ((state.left[id] ?? 0) > 0) return id;
  }
  return null;
}

export function startGolf(present: readonly CharacterId[]): GolfState {
  const order = CHARACTER_IDS.filter((id) => present.includes(id));
  const state: GolfState = {
    order,
    left: Object.fromEntries(order.map((id) => [id, GOLF_BALLS_EACH])),
    scores: Object.fromEntries(order.map((id) => [id, []])),
    turn: null,
  };
  state.turn = nextWithBalls(state, 0);
  return state;
}

export const golfTurn = (state: GolfState): CharacterId | null => state.turn;

// The ring that holds the landing (the richest where they overlap); a landing within a third of the radius of the centre doubles it, the edge counting as inside.
export function scoreLanding(pos: { x: number; z: number }, rings: readonly GolfRing[]): { ring: string | null; points: number } {
  let best: { ring: string | null; points: number } = { ring: null, points: 0 };
  for (const ring of rings) {
    const distance = Math.hypot(pos.x - ring.x, pos.z - ring.z);
    if (distance > ring.radius) continue;
    const points = distance <= ring.radius / 3 ? ring.points * 2 : ring.points;
    if (points > best.points) best = { ring: ring.id, points };
  }
  return best;
}

// Records a ball for the friend on turn; anyone else's is ignored.
export function recordBall(state: GolfState, id: CharacterId, points: number): GolfState {
  if (state.turn !== id) return state;
  const next = copy(state);
  next.scores[id]!.push(points);
  next.left[id] = next.left[id]! - 1;
  next.turn = nextWithBalls(next, next.order.indexOf(id) + 1);
  return next;
}

// A friend who leaves: his remaining balls are dropped and his score stays.
export function skipFriend(state: GolfState, id: CharacterId): GolfState {
  if (!state.order.includes(id)) return state;
  const next = copy(state);
  next.left[id] = 0;
  if (next.turn === id) next.turn = nextWithBalls(next, next.order.indexOf(id) + 1);
  return next;
}

const clamp100 = (v: number): number => Math.min(100, Math.max(0, v));
const total = (state: GolfState, id: CharacterId): number => (state.scores[id] ?? []).reduce((sum, points) => sum + points, 0);

// Best friends (ties share) gain happiness, the lowest (a tie goes to the first in order) pays a coffee for every friend from his cash, and everyone gains the team bonus.
// With one friend, or a tie for the top, there is no best and no worst.
export function golfResults(state: GolfState, week: Week): Week {
  const next = copy(week);
  const ids = state.order;
  if (ids.length === 0) return next;
  const totals = ids.map((id) => total(state, id));
  const top = Math.max(...totals);
  const bottom = Math.min(...totals);
  if (ids.length > 1 && top > bottom) {
    ids.forEach((id, i) => {
      if (totals[i] === top) next.friends[id].happiness = clamp100(next.friends[id].happiness + GOLF_BEST_HAPPINESS);
    });
    const worst = ids[totals.indexOf(bottom)]!;
    const friend = next.friends[worst];
    friend.cash = Math.max(0, friend.cash - Math.min(friend.cash, STORY_PRICES.coffee * ids.length));
  }
  const average = totals.reduce((sum, value) => sum + value, 0) / ids.length;
  const team = Math.min(GOLF_TEAM_HAPPINESS_MAX, Math.round(average / GOLF_TEAM_DIVISOR));
  for (const id of ids) next.friends[id].happiness = clamp100(next.friends[id].happiness + team);
  return next;
}
