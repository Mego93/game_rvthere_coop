import RAPIER from '@dimforge/rapier3d-compat';
import {
  NEUTRAL_INPUT,
  PREDICTION_MAX_PENDING,
  createPredictor,
  getCourse,
  getVehicleConfig,
  vec3,
  type InputFields,
  type PredictedState,
  type Predictor,
} from '@lodgy/shared';
import { beforeAll, describe, expect, test } from 'vitest';
import { createReconciler } from './reconciler';

beforeAll(async () => {
  await RAPIER.init();
});

// Exact arithmetic: x advances by moveY; vy counts jump presses.
const fake = (): Predictor => ({
  setVehicle() {},
  setProps() {},
  stepPlayer(state, input, previousJump) {
    return {
      ...state,
      pos: { x: state.pos.x + input.moveY, y: state.pos.y, z: state.pos.z },
      vy: state.vy + (input.jump && !previousJump ? 1 : 0),
    };
  },
  dispose() {},
});

const at = (x: number, vy = 0): PredictedState => ({
  pos: vec3(x, 0, 0),
  walk: { x: 0, z: 0 },
  carry: { x: 0, z: 0 },
  vy,
  grounded: true,
});
const step = (moveY = 1, jump = false): InputFields => ({ ...NEUTRAL_INPUT, moveY, jump });

function active(start = 0) {
  const r = createReconciler(fake());
  r.correct(at(start), 0);
  return r;
}
const recordMany = (r: ReturnType<typeof createReconciler>, from: number, to: number, moveY = 1) => {
  for (let seq = from; seq <= to; seq++) r.record(seq, step(moveY));
};

describe('activation and record', () => {
  test('inactive until the first correct; view is null and record stores without predicting', () => {
    const r = createReconciler(fake());
    expect(r.active).toBe(false);
    expect(r.record(1, step())).toBeNull();
    expect(r.view(0.016, 1)).toBeNull();
    r.correct(at(10), 0);
    expect(r.active).toBe(true);
    expect(r.view(0.016, 1)?.pos.x).toBe(11);
  });

  test('the first correct has no offset and does not snap', () => {
    const r = active(5);
    const v = r.view(0.1, 1);
    expect(v).toEqual({ pos: vec3(5, 0, 0), snapped: false });
  });

  test('record predicts while active and returns the state', () => {
    const r = active();
    expect(r.record(1, step(2))?.pos.x).toBe(2);
    expect(r.record(2, step(3))?.pos.x).toBe(5);
  });

  test('record returns the last state while inactive', () => {
    const r = active();
    r.record(1, step());
    r.suspend();
    expect(r.record(2, step())?.pos.x).toBe(1);
  });
});

describe('X4 correct', () => {
  test('the state is the server state plus the inputs after ackSeq', () => {
    const r = active();
    recordMany(r, 1, 6);
    r.correct(at(100), 3);
    expect(r.record(7, step(0))?.pos.x).toBe(103);
  });

  test('an ackSeq of 0 replays everything', () => {
    const r = active();
    recordMany(r, 1, 4);
    r.correct(at(50), 0);
    expect(r.record(5, step(0))?.pos.x).toBe(54);
  });

  test('resetting to the same state with nothing pending changes nothing', () => {
    const r = active(7);
    r.correct(at(7), 0);
    expect(r.view(0.1, 1)).toEqual({ pos: vec3(7, 0, 0), snapped: false });
  });

  test('replay does not re-jump when the acknowledged input held jump', () => {
    const r = active();
    r.record(1, step(0, true));
    r.record(2, step(0, true));
    r.record(3, step(0, true));
    r.correct(at(0, 1), 1);
    expect(r.record(4, step(0, true))?.vy).toBe(1);
  });

  test('replay jumps on a fresh press after a release', () => {
    const r = active();
    r.record(1, step(0, true));
    r.record(2, step(0, false));
    r.record(3, step(0, true));
    r.correct(at(0, 1), 1);
    expect(r.record(4, step(0, false))?.vy).toBe(2);
  });

  test('the live press uses the previous recorded input', () => {
    const r = active();
    expect(r.record(1, step(0, true))?.vy).toBe(1);
    expect(r.record(2, step(0, true))?.vy).toBe(1);
  });
});

describe('X5 offset', () => {
  test('a 0.5 m correction fades', () => {
    const r = active();
    recordMany(r, 1, 1); // predicted x = 1
    r.correct(at(0.5), 1); // new predicted 0.5, correction +0.5
    const v = r.view(0.25, 1)!;
    expect(v.pos.x - 0.5).toBeCloseTo(0.5 * Math.exp(-12 * 0.25), 3);
    expect(v.snapped).toBe(false);
  });

  test('a correction arriving while an offset fades adds to it', () => {
    const r = active();
    r.record(1, step(0));
    r.correct(at(0.4), 1);
    r.correct(at(0.8), 1);
    // offsets: -0.4 (0 to 0.4), then -0.4 more (0.4 to 0.8)
    expect(r.view(0, 1)!.pos.x).toBeCloseTo(0.8 - 0.8, 12);
  });

  test('a 1.5 m correction snaps once', () => {
    const r = active();
    r.correct(at(1.5), 0);
    const first = r.view(0.016, 1)!;
    expect(first).toEqual({ pos: vec3(1.5, 0, 0), snapped: true });
    expect(r.view(0.016, 1)!.snapped).toBe(false);
  });

  test('accumulated offsets beyond the teleport distance snap', () => {
    const r = active();
    r.correct(at(0.7), 0);
    r.correct(at(1.4), 0);
    expect(r.view(0, 1)).toEqual({ pos: vec3(1.4, 0, 0), snapped: true });
  });

  test('a 0.001 m correction is ignored but the state is reset', () => {
    const r = active();
    r.correct(at(0.001), 0);
    expect(r.view(0, 1)).toEqual({ pos: vec3(0.001, 0, 0), snapped: false });
    expect(r.record(1, step(0))?.pos.x).toBe(0.001);
  });
});

describe('X6 cap', () => {
  test('121 recorded inputs keep 120', () => {
    const r = active();
    recordMany(r, 1, PREDICTION_MAX_PENDING + 1);
    r.correct(at(0), 1); // seq 1 was dropped but is the ack: nothing lost
    expect(r.record(200, step(0))?.pos.x).toBe(PREDICTION_MAX_PENDING);
    expect(r.view(0, 1)!.snapped).toBe(false);
  });

  test('a correct whose inputs were dropped snaps, even for a small correction', () => {
    const r = active();
    recordMany(r, 1, PREDICTION_MAX_PENDING + 1);
    r.correct(at(0.5), 0); // seq 1 was dropped; predicted 121 -> 120.5, 0.5 m is below the teleport distance
    const v = r.view(0, 1)!;
    expect(v.snapped).toBe(true);
    expect(v.pos.x).toBe(120.5);
    expect(r.view(0, 1)!.snapped).toBe(false);
  });

  test('a dropped input that held jump seeds the replay, so the kept one does not re-jump', () => {
    const r = active();
    r.record(1, step(0, true));
    r.record(2, step(0, true));
    for (let seq = 3; seq <= PREDICTION_MAX_PENDING + 1; seq++) r.record(seq, step(0, false));
    r.correct(at(0, 5), 1); // seq 1 dropped by the cap, nothing left to discard
    expect(r.record(PREDICTION_MAX_PENDING + 2, step(0, false))?.vy).toBe(5);
  });
});

describe('X7 blending', () => {
  test('alpha 0, 0.5 and 1 blend the previous and current predicted positions', () => {
    const r = active();
    r.record(1, step(2));
    r.record(2, step(4));
    expect(r.view(0, 0)!.pos.x).toBe(2);
    expect(r.view(0, 0.5)!.pos.x).toBe(4);
    expect(r.view(0, 1)!.pos.x).toBe(6);
  });

  test('after a correct, alpha 0 is the state before the last replayed input', () => {
    const r = active();
    recordMany(r, 1, 3);
    r.correct(at(10), 1);
    expect(r.view(0, 0)!.pos.x - r.view(0, 1)!.pos.x).toBeCloseTo(-1, 12);
  });
});

describe('X8 suspend', () => {
  test('clears the offset and keeps the inputs; the next correct replays them', () => {
    const r = active();
    r.record(1, step(0));
    r.correct(at(0.5), 1);
    r.suspend();
    expect(r.active).toBe(false);
    expect(r.view(0, 1)).toBeNull();
    recordMany(r, 2, 11);
    r.correct(at(100), 6);
    expect(r.active).toBe(true);
    expect(r.record(12, step(0))?.pos.x).toBe(105);
    expect(r.view(0, 1)).toEqual({ pos: vec3(105, 0, 0), snapped: false });
  });

  test('inactive record keeps the last jump flag and respects the cap', () => {
    const r = active();
    r.suspend();
    r.record(1, step(0, true));
    r.correct(at(0, 0), 0);
    expect(r.record(2, step(0, true))?.vy).toBe(1);

    const r2 = active();
    r2.suspend();
    recordMany(r2, 1, PREDICTION_MAX_PENDING + 10);
    r2.correct(at(0), 5);
    expect(r2.record(500, step(0))?.pos.x).toBe(PREDICTION_MAX_PENDING);
  });
});

describe('X9 stale acknowledgements', () => {
  test('a lower ackSeq is ignored entirely', () => {
    const r = active();
    recordMany(r, 1, 6);
    r.correct(at(100), 4);
    r.view(0, 1); // takes the snap
    r.correct(at(0), 2);
    expect(r.record(7, step(0))?.pos.x).toBe(102);
    expect(r.view(0, 1)!.snapped).toBe(false);
  });
});

describe('with the real predictor', () => {
  const course = getCourse('test');
  const vehicle = getVehicleConfig('lodgy');
  const start: PredictedState = {
    pos: vec3(20, 0.02, -100),
    walk: { x: 0, z: 0 },
    carry: { x: 0, z: 0 },
    vy: 0,
    grounded: false,
  };
  const script = (i: number): InputFields => ({
    ...NEUTRAL_INPUT,
    moveY: 1,
    moveX: i % 40 < 20 ? 0.5 : -0.5,
    yaw: i / 50,
    jump: i % 30 < 3,
  });

  test('correcting with the predictor\'s own state leaves the final position unchanged', () => {
    const predictor = createPredictor(RAPIER, course, vehicle);
    const r = createReconciler(predictor);
    r.correct(start, 0);
    let state = start;
    let before = false;
    let at60: PredictedState = start;
    for (let i = 1; i <= 120; i++) {
      const input = script(i);
      state = predictor.stepPlayer(state, input, before);
      before = input.jump;
      if (i === 60) at60 = state;
      r.record(i, input);
    }
    const drawnBefore = r.view(0, 1)!.pos;
    expect(drawnBefore.x).toBeCloseTo(state.pos.x, 12);
    r.correct(at60, 60);
    const v = r.view(0, 1)!;
    expect(v.snapped).toBe(false);
    expect(Math.hypot(v.pos.x - state.pos.x, v.pos.y - state.pos.y, v.pos.z - state.pos.z)).toBeLessThan(1e-9);
    predictor.dispose();
  });

  test('a server state off by 0.3 m fades toward the replayed position', () => {
    const predictor = createPredictor(RAPIER, course, vehicle);
    const r = createReconciler(predictor);
    r.correct(start, 0);
    for (let i = 1; i <= 30; i++) r.record(i, script(i));
    const drawn = r.view(0, 1)!.pos;
    r.correct({ ...start, pos: vec3(start.pos.x + 0.3, start.pos.y, start.pos.z) }, 0);
    const v = r.view(0, 1)!;
    expect(v.snapped).toBe(false);
    expect(Math.hypot(v.pos.x - drawn.x, v.pos.y - drawn.y, v.pos.z - drawn.z)).toBeLessThan(0.3 + 1e-9);
    predictor.dispose();
  });
});
