import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '../characters';
import { STORY_DAYS, goalReady, minigameAtGate, outingAtGate, spotGoalsDone, startGoals, togetherNear, type DayDef } from './days';

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

  it('day 1 is Sunday: an opening on foot then by road, the tajine, then PrimeGolf at the gate', () => {
    const sunday = STORY_DAYS[1]!;
    expect(sunday.opening).toEqual([{ goalId: 'arrive', courseId: 'arrival' }, { goalId: 'driveHome', courseId: 'airport-home' }]);
    expect(sunday.goals.map((g) => g.id)).toEqual(['arrive', 'driveHome', 'tajine', 'primegolf']);
    for (const entry of sunday.opening!) expect(sunday.goals.find((g) => g.id === entry.goalId)?.kind).toBe('opening');
    const tajine = sunday.goals.find((g) => g.id === 'tajine')!;
    expect(tajine).toMatchObject({ kind: 'spot', spot: 'kitchen', together: true, meal: 'tajine' });
    const golf = sunday.goals.find((g) => g.id === 'primegolf')!;
    expect(golf).toMatchObject({ kind: 'minigame', spot: 'gate', minigame: 'primegolf', after: 'tajine' });
    expect(day.opening).toBeUndefined();
  });

  it('the gate offers PrimeGolf only once the tajine is done, and never an outing on Sunday', () => {
    const sunday = STORY_DAYS[1]!;
    const states = startGoals(sunday, CHARACTER_IDS);
    expect(goalReady(sunday, states, 'primegolf')).toBe(false);
    expect(minigameAtGate(sunday, states)).toBeNull();
    states.find((s) => s.id === 'tajine')!.status = 'done';
    expect(minigameAtGate(sunday, states)?.id).toBe('primegolf');
    expect(outingAtGate(sunday, states)).toBeNull();
    states.find((s) => s.id === 'primegolf')!.status = 'done';
    expect(minigameAtGate(sunday, states)).toBeNull();
  });

  it('the tajine is a kitchen goal done together, and an opening goal is never done at a spot', () => {
    const sunday = STORY_DAYS[1]!;
    const present = ['luiz', 'huu'] as const;
    const states = startGoals(sunday, present);
    const near = { luiz: { x: 1, y: 0, z: 0 }, huu: { x: 0, y: 0, z: 2 } };
    expect(spotGoalsDone(sunday, states, 'kitchen', spot, near, present)).toEqual(['tajine']);
    expect(spotGoalsDone(sunday, states, 'gate', spot, near, present)).toEqual([]);
  });
});
