import { FINAL_COIN_BONUS, FINAL_RESPAWN_PENALTY, FINAL_RESTART_PENALTY, TICK_DT } from './constants';
import type { Box } from './course';
import { insideBox } from './checkpoints';
import type { Vec3 } from './math';

// Rule K4: the vehicle is lost at health 0 or with its centre below the kill plane.
export const vehicleLost = (centre: Vec3, health: number, killPlaneY: number): boolean => health <= 0 || centre.y < killPlaneY;

// Rule K4 step 9: a vehicle lost this tick does not win.
export const reachedFinish = (centre: Vec3, finish: Box, lost: boolean): boolean => !lost && insideBox(centre, finish);

// Rule Q16: from an integer tick count, so rounding does not accumulate.
export const elapsedAfter = (runTicks: number): number => runTicks * TICK_DT;

export interface FinalTimeInput {
  elapsed: number;
  restarts: number;
  respawns: number;
  wallet: number;
}

// Rule V4: never below zero.
export const finalTime = (input: FinalTimeInput): number =>
  Math.max(0, input.elapsed + FINAL_RESTART_PENALTY * input.restarts + FINAL_RESPAWN_PENALTY * input.respawns - FINAL_COIN_BONUS * input.wallet);

export interface StarsInput {
  restarts: number;
  finalTime: number;
  targetTime: number;
  coinsCollected: number;
  coinsTotal: number;
  assisted: boolean;
}

// Rule V4: no restart, a final time under the target, every coin; none when assisted.
export const stars = (input: StarsInput): [boolean, boolean, boolean] =>
  input.assisted
    ? [false, false, false]
    : [input.restarts === 0, input.finalTime < input.targetTime, input.coinsCollected === input.coinsTotal];
