import { GOLF_POWER_CYCLE, TICK_DT, parseClientMessage } from '@lodgy/shared';
import { describe, expect, it } from 'vitest';
import { GOLF_AIM_LIMIT, GOLF_CURVE_SWEEP_SECONDS, GOLF_MIN_POWER, GOLF_SENT_TIMEOUT, IDLE_SHOT, aimYaw, curveAt, powerAt, shotMessage, stepShot, type ShotState } from './shot';

const C = GOLF_POWER_CYCLE;
const T = GOLF_CURVE_SWEEP_SECONDS;

describe('powerAt', () => {
  it('fills over half the cycle, then empties, and repeats while held', () => {
    expect(powerAt(0)).toBe(0);
    expect(powerAt(C / 4)).toBeCloseTo(0.5, 9);
    expect(powerAt(C / 2)).toBeCloseTo(1, 9);
    expect(powerAt((3 * C) / 4)).toBeCloseTo(0.5, 9);
    expect(powerAt(C)).toBeCloseTo(0, 9);
    expect(powerAt(C + C / 4)).toBeCloseTo(0.5, 9);
    expect(powerAt(5 * C + C / 2)).toBeCloseTo(1, 9);
  });

  it('stays in [0, 1] and treats a negative hold as none', () => {
    for (let t = 0; t < 4 * C; t += 0.013) {
      expect(powerAt(t)).toBeGreaterThanOrEqual(0);
      expect(powerAt(t)).toBeLessThanOrEqual(1);
    }
    expect(powerAt(-1)).toBe(0);
  });
});

describe('curveAt', () => {
  it('sweeps from the middle to the right, across to the left and back in the sweep time', () => {
    expect(curveAt(0)).toBe(0);
    expect(curveAt(T / 4)).toBeCloseTo(1, 9);
    expect(curveAt(T / 2)).toBeCloseTo(0, 9);
    expect(curveAt((3 * T) / 4)).toBeCloseTo(-1, 9);
    expect(curveAt(T)).toBeCloseTo(0, 9);
  });

  it('is about one second long and stays in [-1, 1]', () => {
    expect(T).toBeGreaterThanOrEqual(0.8);
    expect(T).toBeLessThanOrEqual(1.2);
    for (let t = -1; t < 3; t += 0.01) expect(Math.abs(curveAt(t))).toBeLessThanOrEqual(1);
  });
});

describe('aimYaw', () => {
  it('passes a yaw inside the limit and clamps one outside it to the nearest side', () => {
    expect(aimYaw(0.3)).toBeCloseTo(0.3, 9);
    expect(aimYaw(-0.3)).toBeCloseTo(-0.3, 9);
    expect(aimYaw(2)).toBeCloseTo(GOLF_AIM_LIMIT, 9);
    expect(aimYaw(-2)).toBeCloseTo(-GOLF_AIM_LIMIT, 9);
  });

  it('wraps a turned-around yaw before clamping, so a full turn is straight again', () => {
    expect(aimYaw(2 * Math.PI + 0.2)).toBeCloseTo(0.2, 9);
    expect(aimYaw(-2 * Math.PI - 0.2)).toBeCloseTo(-0.2, 9);
  });

  it('never aims backwards: the limit is well under a right angle and wide enough for the side rings', () => {
    expect(GOLF_AIM_LIMIT).toBeLessThan(Math.PI / 2);
    expect(GOLF_AIM_LIMIT).toBeGreaterThan(Math.atan2(12, 20));
  });
});

// Runs ticks of `fire` values and returns the last state and every shot sent.
function run(state: ShotState, fires: boolean[], enabled = true) {
  const sent: { power: number; curve: number }[] = [];
  let current = state;
  for (const fire of fires) {
    const step = stepShot(current, TICK_DT, fire, enabled);
    current = step.state;
    if (step.send) sent.push(step.send);
  }
  return { state: current, sent };
}
const ticks = (seconds: number) => Math.round(seconds / TICK_DT);
const times = (fire: boolean, count: number) => Array.from({ length: count }, () => fire);

describe('stepShot', () => {
  it('starts charging on a press, shows the power as it is held, and keeps it on release', () => {
    const held = run(IDLE_SHOT, times(true, ticks(C / 4)));
    expect(held.state.phase).toBe('charging');
    expect(held.state.power).toBeCloseTo(0.5, 1);
    const released = run(held.state, [false]);
    expect(released.state.phase).toBe('curve');
    expect(released.state.power).toBeCloseTo(0.5, 1);
    expect(released.sent).toEqual([]);
  });

  it('a tap during the sweep sends the shot with the marker value at that moment', () => {
    const charged = run(IDLE_SHOT, [...times(true, ticks(C / 2)), false]);
    const sweeping = run(charged.state, times(false, ticks(T / 4)));
    expect(sweeping.state.phase).toBe('curve');
    const tapped = run(sweeping.state, [true]);
    expect(tapped.sent).toHaveLength(1);
    expect(tapped.sent[0]!.power).toBeCloseTo(1, 1);
    expect(tapped.sent[0]!.curve).toBeCloseTo(1, 1);
    expect(tapped.state.phase).toBe('sent');
  });

  it('no tap means curve 0 once the sweep is over', () => {
    const charged = run(IDLE_SHOT, [...times(true, ticks(C / 2)), false]);
    const over = run(charged.state, times(false, ticks(T) + 3));
    expect(over.sent).toHaveLength(1);
    expect(over.sent[0]!.curve).toBe(0);
    expect(over.sent[0]!.power).toBeCloseTo(1, 1);
  });

  it('sends at most one shot until the turn is reset', () => {
    const charged = run(IDLE_SHOT, [...times(true, ticks(C / 2)), false]);
    const first = run(charged.state, [true]);
    expect(first.sent).toHaveLength(1);
    const more = run(first.state, [false, true, false, true]);
    expect(more.sent).toEqual([]);
  });

  it('a release with next to no power is cancelled, so a stray click costs no ball', () => {
    expect(powerAt(2 * TICK_DT)).toBeLessThan(GOLF_MIN_POWER);
    const click = run(IDLE_SHOT, [true, true, false]);
    expect(click.state.phase).toBe('idle');
    expect(click.sent).toEqual([]);
  });

  it('a press needs a new edge: a button already down when the turn begins does not start a charge', () => {
    const waiting = run(IDLE_SHOT, times(true, 3), false);
    const down = run(waiting.state, times(true, 5));
    expect(down.state.phase).toBe('idle');
    const later = run(down.state, [false, true]);
    expect(later.state.phase).toBe('charging');
  });

  it('being disabled (not your turn, a ball in flight) resets everything', () => {
    const charging = run(IDLE_SHOT, times(true, 10));
    const off = run(charging.state, [true], false);
    expect(off.state.phase).toBe('idle');
    expect(off.state.power).toBe(0);
    expect(off.sent).toEqual([]);
  });

  it('a shot the server refused (no ball ever appears) lets the player try again', () => {
    const charged = run(IDLE_SHOT, [...times(true, ticks(C / 2)), false]);
    const sent = run(charged.state, [true]);
    expect(sent.state.phase).toBe('sent');
    const waited = run(sent.state, times(false, ticks(GOLF_SENT_TIMEOUT) + 3));
    expect(waited.state.phase).toBe('idle');
  });

  it('keeps charging past a full cycle: the bar goes on to empty', () => {
    const held = run(IDLE_SHOT, times(true, ticks(C * 0.75)));
    expect(held.state.power).toBeCloseTo(0.5, 1);
    const emptied = run(IDLE_SHOT, times(true, ticks(C) - 1));
    expect(emptied.state.power).toBeLessThan(0.1);
  });
});

describe('shotMessage', () => {
  it('is the golfShot the server parses, with the aim clamped and the numbers kept', () => {
    const message = shotMessage(0.4, { power: 0.75, curve: -0.5 });
    expect(message).toEqual({ type: 'golfShot', yaw: 0.4, power: 0.75, curve: -0.5 });
    expect(parseClientMessage(JSON.stringify(message))).toEqual(message);
  });

  it('aim input to message: a turned-around mouse yaw becomes the clamped aim and the shot goes through the server parser', () => {
    const mouseYaw = 2 * Math.PI + 3;
    const message = shotMessage(mouseYaw, { power: 1, curve: 0 });
    expect(message.yaw).toBeCloseTo(aimYaw(mouseYaw), 9);
    expect(Math.abs(message.yaw)).toBeLessThanOrEqual(GOLF_AIM_LIMIT + 1e-9);
    expect(parseClientMessage(JSON.stringify(message))).not.toBeNull();
  });

  it('keeps power in [0, 1] and curve in [-1, 1]', () => {
    expect(shotMessage(0, { power: 1.7, curve: 4 })).toMatchObject({ power: 1, curve: 1 });
    expect(shotMessage(0, { power: -1, curve: -4 })).toMatchObject({ power: 0, curve: -1 });
  });
});
