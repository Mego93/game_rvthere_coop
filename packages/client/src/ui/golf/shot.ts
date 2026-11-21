import { GOLF_POWER_CYCLE, clamp, type ClientMessage } from '@lodgy/shared';

// s, the curve marker sweeps once from the middle to the right, across to the left and back.
export const GOLF_CURVE_SWEEP_SECONDS = 1;
// rad, the aim stays within this of straight down the field; the side rings are within 32 degrees of the tee.
export const GOLF_AIM_LIMIT = (60 * Math.PI) / 180;
// A release below this power is a stray click and is cancelled.
export const GOLF_MIN_POWER = 0.05;
// s, how long a sent shot waits for the ball to appear before the player may try again.
export const GOLF_SENT_TIMEOUT = 1.5;

const TAU = 2 * Math.PI;

// 0 to 1 and back to 0 once per GOLF_POWER_CYCLE of holding.
export function powerAt(heldSeconds: number): number {
  if (!(heldSeconds > 0)) return 0;
  const phase = (heldSeconds % GOLF_POWER_CYCLE) / GOLF_POWER_CYCLE;
  return phase < 0.5 ? phase * 2 : (1 - phase) * 2;
}

// The marker after `seconds` of sweeping, in [-1, 1] with +1 to the right: 0, +1, 0, -1, 0 across the sweep.
export function curveAt(seconds: number): number {
  if (!(seconds > 0) || seconds >= GOLF_CURVE_SWEEP_SECONDS) return 0;
  const phase = seconds / GOLF_CURVE_SWEEP_SECONDS;
  if (phase < 0.25) return phase * 4;
  if (phase < 0.75) return 2 - phase * 4;
  return phase * 4 - 4;
}

// The look yaw wrapped to (-pi, pi] and kept inside the field's cone; yaw 0 is straight down the field and positive turns left.
export function aimYaw(inputYaw: number): number {
  const wrapped = inputYaw - TAU * Math.round(inputYaw / TAU);
  return clamp(wrapped, -GOLF_AIM_LIMIT, GOLF_AIM_LIMIT);
}

export type ShotPhase = 'idle' | 'charging' | 'curve' | 'sent';

export interface ShotState {
  phase: ShotPhase;
  // Seconds the shoot button has been held, or the sweep's seconds, or the wait after sending.
  clock: number;
  power: number;
  // The curve marker while sweeping, else 0.
  marker: number;
  // The shoot button as of the last step, for finding a press.
  down: boolean;
}

export const IDLE_SHOT: ShotState = { phase: 'idle', clock: 0, power: 0, marker: 0, down: false };

export interface ShotStep {
  state: ShotState;
  send: { power: number; curve: number } | null;
}

// One tick of the shot: hold the shoot button to fill the bar, release to fix the power, tap once during the sweep to fix the curve (no tap is curve 0). `enabled` is false when it is not the player's turn to hit or a ball is in play.
export function stepShot(state: ShotState, dt: number, fire: boolean, enabled: boolean): ShotStep {
  const pressed = fire && !state.down;
  if (!enabled) return { state: { ...IDLE_SHOT, down: fire }, send: null };
  switch (state.phase) {
    case 'idle':
      return { state: pressed ? { phase: 'charging', clock: 0, power: 0, marker: 0, down: true } : { ...IDLE_SHOT, down: fire }, send: null };
    case 'charging': {
      if (fire) {
        const clock = state.clock + dt;
        return { state: { phase: 'charging', clock, power: powerAt(clock), marker: 0, down: true }, send: null };
      }
      if (state.power < GOLF_MIN_POWER) return { state: { ...IDLE_SHOT }, send: null };
      return { state: { phase: 'curve', clock: 0, power: state.power, marker: 0, down: false }, send: null };
    }
    case 'curve': {
      if (pressed) return { state: { phase: 'sent', clock: 0, power: state.power, marker: state.marker, down: true }, send: { power: state.power, curve: state.marker } };
      const clock = state.clock + dt;
      if (clock >= GOLF_CURVE_SWEEP_SECONDS) return { state: { phase: 'sent', clock: 0, power: state.power, marker: 0, down: fire }, send: { power: state.power, curve: 0 } };
      return { state: { phase: 'curve', clock, power: state.power, marker: curveAt(clock), down: fire }, send: null };
    }
    case 'sent': {
      const clock = state.clock + dt;
      if (clock >= GOLF_SENT_TIMEOUT) return { state: { ...IDLE_SHOT, down: fire }, send: null };
      return { state: { ...state, clock, down: fire }, send: null };
    }
  }
}

export function shotMessage(inputYaw: number, shot: { power: number; curve: number }): Extract<ClientMessage, { type: 'golfShot' }> {
  return { type: 'golfShot', yaw: aimYaw(inputYaw), power: clamp(shot.power, 0, 1), curve: clamp(shot.curve, -1, 1) };
}
