import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cancelWarm, runSliced, warmCourse, warmTarget } from './warm';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cancelWarm();
  vi.useRealTimers();
});

function* counting(total: number, seen: number[]): Generator<void, string> {
  for (let i = 0; i < total; i++) {
    seen.push(i);
    yield;
  }
  return 'done';
}

describe('runSliced', () => {
  test('runs a few steps per timer tick, within the budget, and finishes the generator', () => {
    const seen: number[] = [];
    // Each step costs 1 ms; a 3 ms budget lets a tick take 3 steps.
    runSliced(counting(10, seen), 3, () => true, () => seen.length);
    vi.advanceTimersByTime(0);
    expect(seen.length).toBe(3);
    vi.advanceTimersByTime(0);
    expect(seen.length).toBe(3);
    vi.advanceTimersByTime(10);
    expect(seen.length).toBe(10);
  });

  test('stops at once when active turns false, and when cancelled', () => {
    const seen: number[] = [];
    let on = true;
    runSliced(counting(100, seen), 1, () => on, () => seen.length);
    vi.advanceTimersByTime(5);
    const first = seen.length;
    expect(first).toBeGreaterThan(0);
    on = false;
    vi.advanceTimersByTime(50);
    expect(seen.length).toBe(first);

    const other: number[] = [];
    const job = runSliced(counting(100, other), 1, () => true, () => other.length);
    vi.advanceTimersByTime(3);
    job.cancel();
    const soFar = other.length;
    vi.advanceTimersByTime(50);
    expect(other.length).toBe(soFar);
  });

  test('an error ends the run quietly', () => {
    function* broken(): Generator<void, void> {
      yield;
      throw new Error('boom');
    }
    runSliced(broken(), 5, () => true);
    expect(() => vi.advanceTimersByTime(100)).not.toThrow();
  });
});

describe('warmCourse', () => {
  test('waits for the delay, and does nothing when inactive by then', () => {
    const active = vi.fn(() => false);
    warmCourse('marrakech', active, 12, 1500);
    vi.advanceTimersByTime(1499);
    expect(active).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10);
    expect(active).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('cancelWarm clears the pending start', () => {
    warmCourse('marrakech', () => true, 12, 1500);
    expect(vi.getTimerCount()).toBe(1);
    cancelWarm();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('an unknown course ends quietly', () => {
    warmCourse('no-such-course', () => true, 12, 10);
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('asking again for the same course keeps the first timer', () => {
    const active = vi.fn(() => true);
    warmCourse('no-such-course', active, 12, 1500);
    vi.advanceTimersByTime(1000);
    warmCourse('no-such-course', active, 12, 1500);
    vi.advanceTimersByTime(600);
    expect(active).toHaveBeenCalled();
  });
});

describe('warmTarget', () => {
  test('V1: a chained run warms the first stage, whichever stage is selected; otherwise the selected course', () => {
    expect(warmTarget({ courseId: 'city', chain: true })).toBe('desert');
    expect(warmTarget({ courseId: 'city', chain: false })).toBe('city');
    expect(warmTarget({ courseId: 'marrakech', chain: true })).toBe('marrakech');
  });
});
