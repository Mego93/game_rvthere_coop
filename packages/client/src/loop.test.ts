import { CLIENT_MAX_CATCHUP_STEPS, TICK_DT } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createFixedStepper, createFrameClock } from './loop';

function counter() {
  let ticks = 0;
  const stepper = createFixedStepper(() => {
    ticks += 1;
  });
  return { stepper, ticks: () => ticks };
}

test('runs no tick until a full tick of time has passed', () => {
  const { stepper, ticks } = counter();
  expect(stepper.advance(TICK_DT * 0.4)).toBe(0);
  expect(stepper.advance(TICK_DT * 0.4)).toBe(0);
  expect(stepper.advance(TICK_DT * 0.4)).toBe(1);
  expect(ticks()).toBe(1);
});

test('runs several ticks for a long frame and keeps the remainder', () => {
  const { stepper, ticks } = counter();
  expect(stepper.advance(TICK_DT * 2.5)).toBe(2);
  expect(stepper.advance(TICK_DT * 0.6)).toBe(1);
  expect(ticks()).toBe(3);
});

test('caps catch-up and discards the backlog', () => {
  const { stepper, ticks } = counter();
  expect(stepper.advance(TICK_DT * 100)).toBe(CLIENT_MAX_CATCHUP_STEPS);
  expect(stepper.advance(TICK_DT * 0.5)).toBe(0);
  expect(ticks()).toBe(CLIENT_MAX_CATCHUP_STEPS);
});

test('ignores a frame time that is not a positive number', () => {
  const { stepper, ticks } = counter();
  expect(stepper.advance(Number.NaN)).toBe(0);
  expect(stepper.advance(-5)).toBe(0);
  expect(stepper.advance(TICK_DT * 1.5)).toBe(1);
  expect(ticks()).toBe(1);
});

test('the first frame has a time step of 0, whatever its timestamp', () => {
  expect(createFrameClock(0.25)(12345)).toBe(0);
  expect(createFrameClock(0.25)(-5)).toBe(0);
});

test('later frames give the elapsed seconds, never negative, capped', () => {
  const clock = createFrameClock(0.25);
  clock(1000);
  expect(clock(1016)).toBeCloseTo(0.016, 9);
  expect(clock(1010)).toBe(0);
  expect(clock(1500)).toBe(0.25);
});
