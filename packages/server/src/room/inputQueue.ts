import {
  INPUT_QUEUE_FAST_ABOVE,
  INPUT_QUEUE_MAX,
  NEUTRAL_AFTER_TICKS,
  NEUTRAL_INPUT,
  neutralInput,
  type InputFields,
  type PlayerInput,
} from '@lodgy/shared';

export interface TickInput {
  input: InputFields;
  // False when the input repeats an earlier one or is the neutral substitute; a repeat is never a new press.
  fresh: boolean;
}

export interface InputQueue {
  // Queues an input received from the client. Inputs that are not newer than the last one queued are ignored.
  push(input: PlayerInput): void;
  // The input to simulate this tick. Call exactly once per tick.
  next(): TickInput;
  // The sequence number of the last input consumed; 0 before any.
  ackSeq(): number;
}

export function createInputQueue(): InputQueue {
  const queue: PlayerInput[] = [];
  let lastQueuedSeq = 0;
  let ackSeq = 0;
  let last: InputFields = NEUTRAL_INPUT;
  let ticksWithoutInput = 0;

  return {
    push(input) {
      if (input.seq <= lastQueuedSeq) return;
      lastQueuedSeq = input.seq;
      queue.push(input);
      if (queue.length > INPUT_QUEUE_MAX) queue.shift();
    },
    next() {
      if (queue.length === 0) {
        ticksWithoutInput += 1;
        if (ticksWithoutInput >= NEUTRAL_AFTER_TICKS) last = neutralInput(last);
        return { input: { ...last }, fresh: false };
      }
      // A long queue means the client is ahead of the server; taking two brings the delay back down.
      const take = queue.length > INPUT_QUEUE_FAST_ABOVE ? 2 : 1;
      const consumed = queue.splice(0, take);
      const { seq, ...fields } = consumed[consumed.length - 1]!;
      ackSeq = seq;
      last = fields;
      ticksWithoutInput = 0;
      const result: InputFields = { ...fields };
      // A tap in the skipped input must not vanish; `last` stays unmerged so a repeat is not a new press.
      for (const earlier of consumed.slice(0, -1)) {
        result.jump ||= earlier.jump;
        result.interact ||= earlier.interact;
        result.drop ||= earlier.drop;
      }
      return { input: result, fresh: true };
    },
    ackSeq: () => ackSeq,
  };
}
