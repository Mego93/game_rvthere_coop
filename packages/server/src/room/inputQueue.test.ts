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

test('ackSeq is unchanged through the neutral substitute', () => {
  const queue = createInputQueue();
  queue.push(input(1, { moveY: 1 }));
  queue.push(input(2, { moveY: 1 }));
  queue.next();
  queue.next();
  for (let i = 0; i <= NEUTRAL_AFTER_TICKS + 2; i++) queue.next();
  expect(queue.next().input).toMatchObject({ moveY: 0 });
  expect(queue.ackSeq()).toBe(2);
});

test('a new input after the neutral substitute is used again', () => {
  const queue = createInputQueue();
  queue.push(input(1, { moveY: 1 }));
  for (let i = 0; i <= NEUTRAL_AFTER_TICKS; i++) queue.next();
  queue.push(input(2, { moveY: -1 }));
  expect(queue.next()).toMatchObject({ input: { moveY: -1 }, fresh: true });
});

// Five queued inputs make the next tick consume two (seq 1 and 2), the second being the one returned.
const consumeTwo = (first: Partial<PlayerInput>, second: Partial<PlayerInput> = {}) => {
  const queue = createInputQueue();
  queue.push(input(1, first));
  queue.push(input(2, second));
  for (let seq = 3; seq <= 5; seq++) queue.push(input(seq));
  return { queue, tick: queue.next() };
};

test.each(['jump', 'interact', 'drop'] as const)('keeps a %s tap from the first of two consumed inputs', (button) => {
  const { tick, queue } = consumeTwo({ [button]: true, moveY: 1 });
  expect(queue.ackSeq()).toBe(2);
  expect(tick.input[button]).toBe(true);
  expect(tick.input.moveY).toBe(0);
  expect(tick.input.moveX).toBe(0.02);
});

test('(T8) a reset hold is not a tap: the first of two consumed inputs does not set it', () => {
  const { tick } = consumeTwo({ reset: true }, {});
  expect(tick.input.reset).toBeFalsy();
  const held = consumeTwo({}, { reset: true });
  expect(held.tick.input.reset).toBe(true);
});

test.each(['sprint', 'crouch'] as const)('(T6) a %s hold is not a tap: the first of two consumed inputs does not set it', (key) => {
  const { tick } = consumeTwo({ [key]: true }, {});
  expect(tick.input[key]).toBeFalsy();
  const held = consumeTwo({}, { [key]: true });
  expect(held.tick.input[key]).toBe(true);
});

test('takes axes, aim, use, reel and slot from the second of two consumed inputs', () => {
  const { tick } = consumeTwo(
    { moveX: 1, moveY: 1, yaw: 1, pitch: 1, use: true, reel: 1, slot: 1 },
    { moveX: -1, moveY: -1, yaw: 2, pitch: 0.5, use: false, reel: -1, slot: 2 },
  );
  expect(tick.input).toEqual({ ...NEUTRAL_INPUT, moveX: -1, moveY: -1, yaw: 2, pitch: 0.5, reel: -1, slot: 2 });
});

test('returns a single consumed input unchanged', () => {
  const queue = createInputQueue();
  queue.push(input(1, { jump: true, yaw: 1 }));
  const { seq, ...fields } = input(1, { jump: true, yaw: 1 });
  expect(seq).toBe(1);
  expect(queue.next().input).toEqual(fields);
});

test('returns copies: mutating one changes no later result', () => {
  const queue = createInputQueue();
  queue.push(input(1, { moveY: 1 }));
  const first = queue.next().input;
  first.moveY = -1;
  first.jump = true;
  expect(queue.next().input).toMatchObject({ moveY: 1, jump: false });
  queue.push(input(2, { moveY: 0.5 }));
  const fresh = queue.next().input;
  fresh.moveY = 9;
  expect(queue.next().input.moveY).toBe(0.5);
});

// A two-input take always leaves at least two queued, so the unmerged-last rule cannot be seen through the public API; this checks that no merged tap is repeated.
test('a repeat after draining a merged tick never carries the tap', () => {
  const { queue, tick } = consumeTwo({ interact: true });
  expect(tick.input.interact).toBe(true);
  for (let i = 0; i < 3; i++) queue.next();
  expect(queue.next()).toMatchObject({ input: { interact: false, moveX: 0.05 }, fresh: false });
});

test('repeat and neutral results are copies too', () => {
  const queue = createInputQueue();
  const neutral = queue.next().input;
  neutral.moveY = 9;
  expect(NEUTRAL_INPUT.moveY).toBe(0);
  queue.push(input(1, { moveY: 1 }));
  queue.next();
  const repeat = queue.next().input;
  repeat.moveY = 9;
  repeat.jump = true;
  expect(queue.next().input).toMatchObject({ moveY: 1, jump: false });
});
