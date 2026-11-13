import {
  PREDICTION_IGNORE_DISTANCE,
  PREDICTION_MAX_PENDING,
  PREDICTION_SMOOTH_RATE,
  PREDICTION_TELEPORT_DISTANCE,
  type InputFields,
  type PredictedState,
  type Predictor,
  type Vec3,
} from '@lodgy/shared';

export interface Reconciler {
  // Stores the input just sent (always) and, while active, predicts one tick with it; returns the predicted state (the last one while inactive).
  record(seq: number, input: InputFields): PredictedState | null;
  // A snapshot arrived with the local player unseated and not on the vehicle: reset to the server's state and replay the inputs after `ackSeq`. The first call activates the reconciler.
  correct(server: PredictedState, ackSeq: number): void;
  // The state to draw: the previous and current predicted positions blended by `alpha` (0 to 1, from the fixed stepper) plus the fading offset; `dt` advances the fade.
  view(dt: number, alpha: number): { pos: Vec3; snapped: boolean } | null;
  // Prediction off (seated, on the vehicle, missing from the snapshot): stop predicting and clear the offset. The recorded inputs are kept.
  suspend(): void;
  readonly active: boolean;
}

interface Pending {
  seq: number;
  input: InputFields;
}

const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z);

export function createReconciler(predictor: Predictor): Reconciler {
  let pending: Pending[] = [];
  let lastJump = false; // jump flag of the newest recorded input
  let ackedJump = false; // jump flag of the newest input dropped from `pending`
  let lastAck = -1;
  let active = false;
  let current: PredictedState | null = null;
  let previous: Vec3 = { x: 0, y: 0, z: 0 };
  let offset: Vec3 = { x: 0, y: 0, z: 0 };
  let snapped = false;

  const clearOffset = () => {
    offset = { x: 0, y: 0, z: 0 };
  };

  return {
    get active() {
      return active;
    },
    record(seq, input) {
      pending.push({ seq, input });
      if (pending.length > PREDICTION_MAX_PENDING) {
        const dropped = pending.splice(0, pending.length - PREDICTION_MAX_PENDING);
        ackedJump = dropped[dropped.length - 1]!.input.jump;
      }
      if (active && current) {
        previous = current.pos;
        current = predictor.stepPlayer(current, input, lastJump);
      }
      lastJump = input.jump;
      return current;
    },
    correct(server, ackSeq) {
      if (ackSeq < lastAck) return;
      lastAck = ackSeq;
      let discarded = 0;
      while (discarded < pending.length && pending[discarded]!.seq <= ackSeq) discarded += 1;
      if (discarded > 0) ackedJump = pending[discarded - 1]!.input.jump;
      const lost = pending.length > 0 && ackSeq + 1 < pending[0]!.seq;
      pending = pending.slice(discarded);

      let state: PredictedState = { ...server, pos: { ...server.pos }, walk: { ...server.walk }, carry: { ...server.carry } };
      let before = state.pos;
      let jump = ackedJump;
      for (const { input } of pending) {
        before = state.pos;
        state = predictor.stepPlayer(state, input, jump);
        jump = input.jump;
      }

      if (active && current) {
        const total = {
          x: offset.x + current.pos.x - state.pos.x,
          y: offset.y + current.pos.y - state.pos.y,
          z: offset.z + current.pos.z - state.pos.z,
        };
        const size = length(total);
        if (lost || size > PREDICTION_TELEPORT_DISTANCE) {
          clearOffset();
          if (size > PREDICTION_IGNORE_DISTANCE) snapped = true;
        } else if (size <= PREDICTION_IGNORE_DISTANCE) clearOffset();
        else offset = total;
      } else {
        clearOffset();
      }
      current = state;
      previous = before;
      active = true;
    },
    view(dt, alpha) {
      if (!active || !current) return null;
      const keep = Math.exp(-PREDICTION_SMOOTH_RATE * dt);
      offset = { x: offset.x * keep, y: offset.y * keep, z: offset.z * keep };
      const a = Math.min(Math.max(alpha, 0), 1);
      const b = 1 - a;
      const pos = {
        x: previous.x * b + current.pos.x * a + offset.x,
        y: previous.y * b + current.pos.y * a + offset.y,
        z: previous.z * b + current.pos.z * a + offset.z,
      };
      const result = { pos, snapped };
      snapped = false;
      return result;
    },
    suspend() {
      active = false;
      clearOffset();
      snapped = false;
    },
  };
}
