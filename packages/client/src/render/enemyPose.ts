import { ENEMY_KNIFE_COOLDOWN, ENEMY_SLIP_SECONDS, PLAYER_RADIUS, type EnemyState } from '@lodgy/shared';
import type { Euler3 } from './emotePose';

export const ENEMY_NODES = ['leg-left', 'leg-right', 'arm-left', 'arm-right'] as const;
export type EnemyNode = (typeof ENEMY_NODES)[number];

export interface EnemyPose {
  // Euler radians of the model's limbs in their own frame, the model's front on +z (an arm swung to -1.4 about x points forward).
  nodes: Record<EnemyNode, Euler3>;
  // The whole body about the feet, in the game's frame: negative leans forward, +pi/2 lies on the back.
  pitch: number;
  // Metres the body is raised so that it lies on the ground and not in it.
  lift: number;
}

const FORWARD = -1.4;
// Seconds the fall, the knock and the getting up take.
const FALL_SECONDS = 0.25;
const KNOCK_SECONDS = 0.15;
const DIE_SECONDS = 0.4;
const GET_UP_SECONDS = 0.3;
const LYING = Math.PI / 2;

const zero = (): Euler3 => ({ x: 0, y: 0, z: 0 });
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOut = (value: number) => 1 - (1 - value) * (1 - value);

// 0 upright and 1 lying: falls in FALL_SECONDS, stays down, and gets up over the last GET_UP_SECONDS of the slip.
function slipLie(t: number): number {
  if (t <= 0) return 0;
  const down = easeOut(clamp01(t / FALL_SECONDS));
  const up = clamp01((ENEMY_SLIP_SECONDS - t) / GET_UP_SECONDS);
  return Math.min(down, up);
}

function pose(nodes: Partial<Record<EnemyNode, Partial<Euler3>>>, pitch = 0, lie = 0): EnemyPose {
  const out = { 'leg-left': zero(), 'leg-right': zero(), 'arm-left': zero(), 'arm-right': zero() };
  for (const node of ENEMY_NODES) Object.assign(out[node], nodes[node]);
  return { nodes: out, pitch, lift: PLAYER_RADIUS * lie };
}

// The pose of an enemy: `t` seconds since its state began, `phase` the run cycle in radians.
export function enemyPose(state: EnemyState, t: number, phase: number): EnemyPose {
  switch (state) {
    case 'idle':
      return pose({ 'arm-right': { x: -0.6 } });
    case 'run': {
      const swing = Math.sin(phase);
      return pose({
        'leg-left': { x: 0.9 * swing },
        'leg-right': { x: -0.9 * swing },
        'arm-left': { x: -0.8 * swing },
        'arm-right': { x: FORWARD + 0.1 * Math.sin(2 * phase) - 0.1 },
      }, -0.2);
    }
    case 'attack': {
      // Cocked, a quick thrust at 40 % of the cooldown and back, once per cooldown like the stabs.
      const c = (((t / ENEMY_KNIFE_COOLDOWN) % 1) + 1) % 1;
      const thrust = c < 0.3 ? 0 : c < 0.45 ? (c - 0.3) / 0.15 : c < 0.75 ? 1 - (c - 0.45) / 0.3 : 0;
      return pose({
        'leg-left': { x: 0.25 },
        'leg-right': { x: -0.25 },
        'arm-left': { x: -0.5 },
        'arm-right': { x: -0.6 + (FORWARD - 0.15 + 0.6) * thrust },
      }, -0.1 - 0.15 * thrust);
    }
    case 'slip': {
      const lie = slipLie(t);
      return pose({ 'leg-left': { x: -1.1 * lie }, 'leg-right': { x: -0.8 * lie }, 'arm-left': { z: 1.2 * lie }, 'arm-right': { z: -1.2 * lie } }, LYING * lie, lie);
    }
    case 'down':
    case 'dead': {
      const lie = easeOut(clamp01(t / (state === 'down' ? KNOCK_SECONDS : DIE_SECONDS)));
      return pose({ 'leg-left': { x: -0.3 * lie }, 'leg-right': { x: 0.2 * lie }, 'arm-left': { z: 1.4 * lie }, 'arm-right': { z: -1.4 * lie } }, LYING * lie, lie);
    }
  }
}
