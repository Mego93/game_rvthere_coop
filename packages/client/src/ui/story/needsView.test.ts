import { describe, expect, it } from 'vitest';
import type { StoryFriendView } from '@lodgy/shared';
import { cashText, clockText, fakeRepublicShown, goalsView, needsView, storyHudModel } from './needsView';

const friend = (over: Partial<StoryFriendView> = {}): StoryFriendView => ({ health: 100, food: 80, happiness: 70, tiredness: 10, cash: 0, bank: 2000, items: [], caffeine: { fast: 0, slow: 0 }, ...over });

describe('needsView', () => {
  it('shows food, happiness and tiredness as fractions with whole-number text', () => {
    const view = needsView(friend({ food: 80, happiness: 70, tiredness: 10 }), 'huu');
    expect(view.bars.map((bar) => bar.key)).toEqual(['food', 'happiness', 'tiredness']);
    expect(view.bars.map((bar) => bar.fraction)).toEqual([0.8, 0.7, 0.1]);
    expect(view.bars.map((bar) => bar.text)).toEqual(['80', '70', '10']);
    expect(view.bars.every((bar) => !bar.warn)).toBe(true);
  });

  it('warns on hunger below 25, on low happiness below 25 and on tiredness above 80', () => {
    const view = needsView(friend({ food: 24, happiness: 24, tiredness: 81 }), 'huu');
    expect(view.bars.map((bar) => bar.warn)).toEqual([true, true, true]);
    expect(needsView(friend({ food: 25, happiness: 25, tiredness: 80 }), 'huu').bars.some((bar) => bar.warn)).toBe(false);
  });

  it('clamps out-of-range values', () => {
    const view = needsView(friend({ food: -5, happiness: 140, tiredness: Number.NaN }), 'huu');
    expect(view.bars.map((bar) => bar.fraction)).toEqual([0, 1, 0]);
  });

  it('carries the cash and the bank', () => {
    const view = needsView(friend({ cash: 40, bank: 1500 }), 'huu');
    expect([view.cash, view.bank]).toEqual([40, 1500]);
  });

  it('shows the caffeine meter only for Luiz while the fast or slow phase runs, and the phase it is in', () => {
    expect(needsView(friend({ caffeine: { fast: 30, slow: 0 } }), 'huu').caffeine).toBeNull();
    expect(needsView(friend(), 'luiz').caffeine).toBeNull();
    expect(needsView(friend({ caffeine: { fast: 30, slow: 0 } }), 'luiz').caffeine).toEqual({ phase: 'fast', fraction: 0.5, text: '30s' });
    const slow = needsView(friend({ caffeine: { fast: 0, slow: 15 } }), 'luiz').caffeine!;
    expect(slow.phase).toBe('slow');
    expect(slow.fraction).toBeCloseTo(0.5);
  });

  it("shows Raph's red face only when angry", () => {
    expect(needsView(friend(), 'rafael').angry).toBe(false);
    expect(needsView(friend({ angry: true }), 'rafael').angry).toBe(true);
    expect(needsView(friend({ angry: true }), 'huu').angry).toBe(false);
  });
});

describe('clockText', () => {
  it('runs from 08:00 at the start to 23:00 at the end of the day', () => {
    expect(clockText(0, 600)).toBe('08:00');
    expect(clockText(600, 600)).toBe('23:00');
    expect(clockText(300, 600)).toBe('15:30');
  });

  it('floors the minute, so the clock never runs ahead', () => {
    expect(clockText(1, 600)).toBe('08:01');
    expect(clockText(0.66, 600)).toBe('08:00');
  });

  it('holds at 23:00 after the day and at 08:00 for a bad value', () => {
    expect(clockText(900, 600)).toBe('23:00');
    expect(clockText(-5, 600)).toBe('08:00');
    expect(clockText(Number.NaN, 600)).toBe('08:00');
    expect(clockText(10, 0)).toBe('08:00');
  });
});

describe('cashText', () => {
  it('writes dirhams with a thousands separator', () => {
    expect(cashText(0)).toBe('0 dh');
    expect(cashText(1250)).toBe('1,250 dh');
  });
});

describe('fakeRepublicShown', () => {
  it('shows only when cash and bank together are under 200 and it was not played today', () => {
    expect(fakeRepublicShown(friend({ cash: 100, bank: 99 }))).toBe(true);
    expect(fakeRepublicShown(friend({ cash: 100, bank: 100 }))).toBe(false);
    expect(fakeRepublicShown(friend({ cash: 0, bank: 2000 }))).toBe(false);
    expect(fakeRepublicShown(friend({ cash: 0, bank: 0, played: true }))).toBe(false);
  });
});

describe('goalsView', () => {
  it('gives each goal a mark and a status class', () => {
    const rows = goalsView([
      { id: 'a', label: 'A', status: 'pending' },
      { id: 'b', label: 'B', status: 'done' },
      { id: 'c', label: 'C', status: 'missed' },
      { id: 'd', label: 'D', status: 'skipped' },
    ]);
    expect(rows.map((row) => row.mark)).toEqual(['○', '✓', '✗', '–']);
    expect(rows.map((row) => row.status)).toEqual(['pending', 'done', 'missed', 'skipped']);
    expect(rows[0]!.label).toBe('A');
  });

  it('counts the goals still to do', () => {
    expect(goalsView([{ id: 'a', label: 'A', status: 'pending' }, { id: 'b', label: 'B', status: 'done' }]).filter((row) => row.status === 'pending')).toHaveLength(1);
  });
});

describe('storyHudModel', () => {
  const state = { day: 0, clock: 300, dayLength: 600, night: false, goals: [{ id: 'a', label: 'A', status: 'pending' as const }], friends: { huu: friend({ cash: 5 }) } };

  it('puts the clock, the goals and the local friend needs together', () => {
    const model = storyHudModel(state, 'huu');
    expect(model.clock).toBe('15:30');
    expect(model.goals).toHaveLength(1);
    expect(model.needs?.cash).toBe(5);
    expect(model.day).toBe(0);
  });

  it('has no needs for a friend who is not in the state', () => {
    expect(storyHudModel(state, 'luiz').needs).toBeNull();
    expect(storyHudModel(state, null).needs).toBeNull();
  });
});
