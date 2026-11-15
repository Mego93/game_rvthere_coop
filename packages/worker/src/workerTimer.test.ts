import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createWorkerTimer } from './workerTimer';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('every runs the callback at its period and stop ends it', () => {
  const timer = createWorkerTimer(() => {});
  const fn = vi.fn();
  const stop = timer.every(0.5, fn);
  vi.advanceTimersByTime(1600);
  expect(fn).toHaveBeenCalledTimes(3);
  stop();
  vi.advanceTimersByTime(2000);
  expect(fn).toHaveBeenCalledTimes(3);
});

test('pause clears every interval and resume restores the periods', () => {
  const timer = createWorkerTimer(() => {});
  const a = vi.fn();
  const b = vi.fn();
  timer.every(1, a);
  timer.every(2, b);
  timer.pause();
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(10_000);
  expect(a).not.toHaveBeenCalled();
  timer.resume();
  expect(vi.getTimerCount()).toBe(2);
  vi.advanceTimersByTime(2000);
  expect(a).toHaveBeenCalledTimes(2);
  expect(b).toHaveBeenCalledTimes(1);
});

test('resume twice does not double the intervals, and a stopped timer is not restored', () => {
  const timer = createWorkerTimer(() => {});
  const fn = vi.fn();
  const stop = timer.every(1, fn);
  timer.pause();
  timer.resume();
  timer.resume();
  expect(vi.getTimerCount()).toBe(1);
  timer.pause();
  stop();
  timer.resume();
  expect(vi.getTimerCount()).toBe(0);
});

test('every while paused waits for resume', () => {
  const timer = createWorkerTimer(() => {});
  timer.pause();
  const fn = vi.fn();
  timer.every(1, fn);
  expect(vi.getTimerCount()).toBe(0);
  timer.resume();
  vi.advanceTimersByTime(1000);
  expect(fn).toHaveBeenCalledTimes(1);
});

test('a throwing callback is reported and the interval keeps running', () => {
  const onError = vi.fn();
  const timer = createWorkerTimer(onError);
  const boom = new Error('boom');
  let calls = 0;
  timer.every(1, () => {
    calls += 1;
    throw boom;
  });
  vi.advanceTimersByTime(2000);
  expect(calls).toBe(2);
  expect(onError).toHaveBeenCalledWith(boom, 'timer');
});
