import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '../characters';
import { STORY_DAYS, goalReady, outingAtGate, spotGoalsDone, startGoals, togetherNear, type DayDef } from './days';

const day = STORY_DAYS[0]!;
const spot = { x: 0, y: 0, z: 0 };

describe('days', () => {
  it('day 0 has the three goals in order', () => {
    expect(day.goals.map((g) => g.id)).toEqual(['vibecode', 'eat', 'outing']);
  });

  it('skips a goal when a needed friend is absent', () => {
    const custom: DayDef = { goals: [{ id: 'a', label: 'a', kind: 'spot', spot: 'couch', needs: ['rafael'] }, { id: 'b', label: 'b', kind: 'spot', spot: 'couch' }] };
    expect(startGoals(custom, ['luiz']).map((s) => s.status)).toEqual(['skipped', 'pending']);
    expect(startGoals(custom, ['luiz', 'rafael']).map((s) => s.status)).toEqual(['pending', 'pending']);
  });

  it('gates a goal on its after goal', () => {
    const states = startGoals(day, CHARACTER_IDS);
    expect(goalReady(day, states, 'outing')).toBe(false);
    expect(outingAtGate(day, states)).toBeNull();
    states[1]!.status = 'done';
    expect(goalReady(day, states, 'outing')).toBe(true);
    expect(outingAtGate(day, states)?.courseId).toBe('desert');
    states[2]!.status = 'done';
    expect(outingAtGate(day, states)).toBeNull();
  });

  it('completes a together goal only with every present friend near', () => {
    const present = ['luiz', 'huu'] as const;
    const states = startGoals(day, present);
    const near = { luiz: { x: 1, y: 0, z: 0 }, huu: { x: 0, y: 0, z: 2.5 } };
    expect(spotGoalsDone(day, states, 'kitchen', spot, { ...near, huu: { x: 0, y: 0, z: 4 } }, present)).toEqual([]);
    expect(spotGoalsDone(day, states, 'kitchen', spot, { luiz: near.luiz }, present)).toEqual([]);
    expect(spotGoalsDone(day, states, 'kitchen', spot, near, present)).toEqual(['eat']);
    expect(togetherNear(spot, near, present)).toBe(true);
  });

  it('completes the laptop goal for any single friend and ignores a wrong spot', () => {
    const states = startGoals(day, ['luiz', 'huu']);
    expect(spotGoalsDone(day, states, 'laptop', spot, {}, ['luiz', 'huu'])).toEqual(['vibecode']);
    expect(spotGoalsDone(day, states, 'bed', spot, {}, ['luiz'])).toEqual([]);
    states[0]!.status = 'done';
    expect(spotGoalsDone(day, states, 'laptop', spot, {}, ['luiz'])).toEqual([]);
  });
});
