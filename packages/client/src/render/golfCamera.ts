import type { Vec3 } from '@lodgy/shared';

// m behind the ball along its heading, and above it.
export const BALL_FOLLOW_BEHIND = 16;
export const BALL_FOLLOW_HEIGHT = 5;
// m ahead of the ball the camera looks.
export const BALL_FOLLOW_AHEAD = 10;
// Positions kept in the trail behind the ball.
export const BALL_TRAIL_LENGTH = 14;
// Per second, how fast the follow camera takes over and gives back.
const FOLLOW_IN = 4;
const FOLLOW_OUT = 2.5;
// m, a move shorter than this does not change the heading.
const MIN_MOVE = 0.05;

export interface Heading {
  x: number;
  z: number;
}

export function ballFollowPose(ball: Vec3, heading: Heading): { position: Vec3; target: Vec3 } {
  return {
    position: { x: ball.x - heading.x * BALL_FOLLOW_BEHIND, y: ball.y + BALL_FOLLOW_HEIGHT, z: ball.z - heading.z * BALL_FOLLOW_BEHIND },
    target: { x: ball.x + heading.x * BALL_FOLLOW_AHEAD, y: ball.y, z: ball.z + heading.z * BALL_FOLLOW_AHEAD },
  };
}

// The ground-plane direction the ball moved in; `previous` when it has barely moved.
export function headingFrom(from: Vec3, to: Vec3, previous: Heading): Heading {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  return length < MIN_MOVE ? previous : { x: dx / length, z: dz / length };
}

// How much of the follow camera shows: up while a ball is out, back down once it is gone.
export function blendFollow(blend: number, ballOut: boolean, dt: number): number {
  const next = ballOut ? blend + (1 - blend) * (1 - Math.exp(-FOLLOW_IN * dt)) : blend - blend * (1 - Math.exp(-FOLLOW_OUT * dt));
  return Math.min(1, Math.max(0, next));
}

// The ball's recent positions, newest last; a ball that did not move adds nothing and a missing ball clears the trail.
export function pushTrail(trail: readonly Vec3[], ball: Vec3 | null): Vec3[] {
  if (ball === null) return [];
  const last = trail[trail.length - 1];
  if (last && last.x === ball.x && last.y === ball.y && last.z === ball.z) return [...trail];
  return [...trail, { x: ball.x, y: ball.y, z: ball.z }].slice(-BALL_TRAIL_LENGTH);
}

// m behind the tee, above it, and ahead along the aim the camera looks while a friend lines up a shot.
export const GOLF_AIM_BEHIND = 9;
export const GOLF_AIM_HEIGHT = 4.5;
export const GOLF_AIM_LOOK = 60;

// Behind and above the tee, looking down the field along the aim (yaw 0 is straight down it, positive turns left).
export function golfAimPose(tee: Vec3, yaw: number): { position: Vec3; target: Vec3 } {
  const dx = -Math.sin(yaw);
  const dz = -Math.cos(yaw);
  return {
    position: { x: tee.x - dx * GOLF_AIM_BEHIND, y: tee.y + GOLF_AIM_HEIGHT, z: tee.z - dz * GOLF_AIM_BEHIND },
    target: { x: tee.x + dx * GOLF_AIM_LOOK, y: tee.y, z: tee.z + dz * GOLF_AIM_LOOK },
  };
}
