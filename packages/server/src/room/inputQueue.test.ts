import { INPUT_QUEUE_MAX, NEUTRAL_AFTER_TICKS, NEUTRAL_INPUT, type PlayerInput } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createInputQueue } from './inputQueue';

// An input whose moveX carries its sequence number, so tests can tell inputs apart.
const input = (seq: number, fields: Partial<PlayerInput> = {}): PlayerInput => ({
  ...NEUTRAL_INPUT,
  moveX: seq / 100,
  ...fields,
  seq,
});

test('gives the neutral input before anything arrives', () => {
  const queue = createInputQueue();
  expect(queue.next()).toEqual({ input: NEUTRAL_INPUT, fresh: false });
  expect(queue.ackSeq()).toBe(0);
});

test('consumes one input per tick, in order', () => {
  const queue = createInputQueue();
  queue.push(input(1));
  queue.push(input(2));
  expect(queue.next()).toMatchObject({ input: { moveX: 0.01 }, fresh: true });
  expect(queue.ackSeq()).toBe(1);
  expect(queue.next()).toMatchObject({ input: { moveX: 0.02 }, fresh: true });
  expect(queue.ackSeq()).toBe(2);
});

test('repeats the last input when the queue is empty, and marks it as not fresh', () => {
  const queue = createInputQueue();
  queue.push(input(1, { jump: true }));
  expect(queue.next().fresh).toBe(true);
  expect(queue.next()).toMatchObject({ input: { jump: true }, fresh: false });
  expect(queue.ackSeq()).toBe(1);
});

test('consumes two per tick while more than three are queued', () => {
  const queue = createInputQueue();
  for (let seq = 1; seq <= 5; seq++) queue.push(input(seq));
  expect(queue.next().input.moveX).toBe(0.02);
  expect(queue.ackSeq()).toBe(2);
  expect(queue.next().input.moveX).toBe(0.03);
  expect(queue.next().input.moveX).toBe(0.04);
  expect(queue.next().input.moveX).toBe(0.05);
  expect(queue.ackSeq()).toBe(5);
});

test('drops the oldest input when the queue overflows', () => {
  const queue = createInputQueue();
  for (let seq = 1; seq <= INPUT_QUEUE_MAX + 2; seq++) queue.push(input(seq));
  // Inputs 1 and 2 were dropped; 3 and 4 are consumed together.
  expect(queue.next().input.moveX).toBe(0.04);
  expect(queue.ackSeq()).toBe(4);
});

test('ignores an input that is not newer than the last one queued', () => {
  const queue = createInputQueue();
  queue.push(input(5));
  queue.push(input(5, { moveY: 1 }));
  queue.push(input(3, { moveY: 1 }));
  expect(queue.next().input).toMatchObject({ moveX: 0.05, moveY: 0 });
  expect(queue.next().fresh).toBe(false);
});

test('substitutes a neutral input after the silent-tick limit, keeping the aim and the slot', () => {
  const queue = createInputQueue();
  queue.push(input(1, { moveY: 1, jump: true, yaw: 1.5, pitch: 0.2, slot: 1 }));
  queue.next();
  for (let i = 0; i < NEUTRAL_AFTER_TICKS - 1; i++) {
    expect(queue.next().input).toMatchObject({ moveY: 1, jump: true });
  }
  expect(queue.next()).toEqual({ input: { ...NEUTRAL_INPUT, yaw: 1.5, pitch: 0.2, slot: 1 }, fresh: false });
});

test('a new input after the neutral substitute is used again', () => {
  const queue = createInputQueue();
  queue.push(input(1, { moveY: 1 }));
  for (let i = 0; i <= NEUTRAL_AFTER_TICKS; i++) queue.next();
  queue.push(input(2, { moveY: -1 }));
  expect(queue.next()).toMatchObject({ input: { moveY: -1 }, fresh: true });
});
