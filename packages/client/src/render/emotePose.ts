import { EMOTE_SECONDS, type Emote } from '@lodgy/shared';

export type PoseNode = 'torso' | 'arm-left' | 'arm-right' | 'head';
export interface Euler3 {
  x: number;
  y: number;
  z: number;
}
export type Pose = Record<PoseNode, Euler3>;

export const EMOTE_RAMP = 0.2;

// The nodes an emote drives; the others keep the clip's rotation.
export const EMOTE_NODES: Record<Emote, readonly PoseNode[]> = {
  sixSeven: ['arm-left', 'arm-right'],
  dab: ['head', 'arm-left', 'arm-right'],
  wave: ['arm-right'],
  dance: ['torso', 'arm-left', 'arm-right'],
};

const TAU = Math.PI * 2;
const zero = (): Euler3 => ({ x: 0, y: 0, z: 0 });

// Euler radians of the emote's nodes `t` seconds in; nodes it does not drive are zero.
export function emotePose(emote: Emote, t: number): Pose {
  const pose: Pose = { torso: zero(), 'arm-left': zero(), 'arm-right': zero(), head: zero() };
  switch (emote) {
    case 'sixSeven': {
      const swing = 0.4 * Math.sin(TAU * 2 * t);
      pose['arm-left'].x = -1.4 + swing;
      pose['arm-right'].x = -1.4 - swing;
      break;
    }
    case 'dab':
      pose.head.x = 0.5;
      pose.head.y = 0.5;
      pose['arm-left'].x = -1.7;
      pose['arm-left'].z = 0.7;
      pose['arm-right'].z = -2.3;
      break;
    case 'wave':
      pose['arm-right'].z = -2.6 + 0.35 * Math.sin(TAU * 2 * t);
      break;
    case 'dance': {
      const sway = Math.sin(TAU * 1.5 * t);
      pose.torso.z = 0.17 * sway;
      pose['arm-left'].x = 0.7 * sway;
      pose['arm-right'].x = -0.7 * sway;
      break;
    }
  }
  return pose;
}

// How much of the pose replaces the clip: ramps in and out over EMOTE_RAMP, zero outside the emote.
export function emoteWeight(t: number): number {
  if (t <= 0 || t >= EMOTE_SECONDS) return 0;
  return Math.min(1, t / EMOTE_RAMP, (EMOTE_SECONDS - t) / EMOTE_RAMP);
}
