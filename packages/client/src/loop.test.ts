import { CLIENT_MAX_CATCHUP_STEPS, TICK_DT } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createFixedStepper } from './loop';

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
