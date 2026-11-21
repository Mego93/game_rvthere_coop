import type { CharacterId } from '../characters';
import type { Vec3 } from '../math';
import { TOGETHER_RADIUS } from './constants';

export const SPOT_KINDS = Object.freeze(['kitchen', 'chef', 'laptop', 'bed', 'couch', 'board', 'atm', 'shop', 'gate'] as const);
export type SpotKind = (typeof SPOT_KINDS)[number];

export interface GoalDef {
  id: string;
  label: string;
  kind: 'spot' | 'outing';
  spot?: SpotKind;
  courseId?: string;
  needs?: CharacterId[];
  together?: boolean;
  after?: string;
}

export interface DayDef {
  goals: GoalDef[];
}

export type GoalStatus = 'pending' | 'done' | 'missed' | 'skipped';
export interface GoalState {
  id: string;
  status: GoalStatus;
}

// Day 0 is the test day; sleeping is implicit and not a goal.
export const STORY_DAYS: Record<number, DayDef> = {
  0: {
    goals: [
      { id: 'vibecode', label: 'Vibecode at a laptop', kind: 'spot', spot: 'laptop' },
      { id: 'eat', label: 'Eat together in the kitchen', kind: 'spot', spot: 'kitchen', together: true },
      { id: 'outing', label: 'Take the Lodgy to the desert', kind: 'outing', spot: 'gate', courseId: 'desert', after: 'eat' },
    ],
  },
};

// Goals needing a friend who is absent are skipped.
export function startGoals(day: DayDef, present: readonly CharacterId[]): GoalState[] {
  return day.goals.map((goal) => ({ id: goal.id, status: goal.needs?.some((id) => !present.includes(id)) ? 'skipped' : 'pending' }));
}

export function goalReady(day: DayDef, states: readonly GoalState[], goalId: string): boolean {
  const goal = day.goals.find((g) => g.id === goalId);
  if (!goal) return false;
  if (states.find((s) => s.id === goalId)?.status !== 'pending') return false;
  return goal.after === undefined || states.find((s) => s.id === goal.after)?.status === 'done';
}

// Every present friend within TOGETHER_RADIUS (3D) of the spot; a friend with no position is not near.
export function togetherNear(spot: Vec3, positions: Partial<Record<CharacterId, Vec3>>, present: readonly CharacterId[]): boolean {
  return present.length > 0 && present.every((id) => {
    const p = positions[id];
    return p !== undefined && Math.hypot(p.x - spot.x, p.y - spot.y, p.z - spot.z) <= TOGETHER_RADIUS;
  });
}

// Ids of the spot goals that this use of `spotKind` completes. Outing goals are never completed by a spot.
export function spotGoalsDone(day: DayDef, states: readonly GoalState[], spotKind: SpotKind, spot: Vec3, positions: Partial<Record<CharacterId, Vec3>>, present: readonly CharacterId[]): string[] {
  return day.goals
    .filter((goal) => goal.kind === 'spot' && goal.spot === spotKind && goalReady(day, states, goal.id) && (!goal.together || togetherNear(spot, positions, present)))
    .map((goal) => goal.id);
}

// The outing goal the gate starts: pending, with its `after` goal done.
export function outingAtGate(day: DayDef, states: readonly GoalState[]): GoalDef | null {
  return day.goals.find((goal) => goal.kind === 'outing' && goalReady(day, states, goal.id)) ?? null;
}
