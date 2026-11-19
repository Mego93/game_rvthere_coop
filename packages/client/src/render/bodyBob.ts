import type { Vec3 } from '@lodgy/shared';

// rad; the Lodgy's clamp, and the RV's lower one so seated players do not visibly float.
export const MAX_TILT = 0.03;
export const MAX_TILT_RV = 0.02;
export const MAX_LIFT = 0.03;
export const MAX_SHAKE = 0.02;
// rad per m/s² of acceleration; 15 m/s² reaches the clamp.
const TILT_GAIN = 0.004;
// m per m/s² of vertical acceleration.
const LIFT_GAIN = 0.0015;
const FULL_SWAY_SPEED = 10;
const SHAKE_SPEED = 30;

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
const finite = (value: number) => (Number.isFinite(value) ? value : 0);

// Velocities are in the vehicle's frame (x right, y up, forward is -z). Pitch is positive nose up (accelerating), roll positive when the +x side rises (a push to +x).
export function bodyBob(prevVel: Vec3, vel: Vec3, dt: number, speed: number, maxTilt = MAX_TILT): { pitch: number; roll: number; lift: number } {
  if (!(dt > 0)) return { pitch: 0, roll: 0, lift: 0 };
  const forwardAccel = -finite((vel.z - prevVel.z) / dt);
  const sideAccel = finite((vel.x - prevVel.x) / dt);
  const upAccel = finite((vel.y - prevVel.y) / dt);
  const sway = Math.min(Math.abs(finite(speed)) / FULL_SWAY_SPEED, 1);
  return {
    pitch: clamp(forwardAccel * TILT_GAIN, maxTilt) || 0,
    roll: clamp(sideAccel * TILT_GAIN, maxTilt) || 0,
    lift: clamp(upAccel * LIFT_GAIN * sway, MAX_LIFT) || 0,
  };
}

// A small offset for the camera, in metres on its right and up axes; it grows with speed and never passes MAX_SHAKE.
export function cameraShake(seconds: number, speed: number): { x: number; y: number } {
  const amount = MAX_SHAKE * Math.min(Math.abs(finite(speed)) / SHAKE_SPEED, 1);
  return { x: amount * 0.6 * Math.sin(seconds * 23.1 + 1.3), y: amount * Math.sin(seconds * 31.7) };
}
