import { ENEMY_KNIFE_COOLDOWN, ENEMY_SLIP_SECONDS, PLAYER_RADIUS } from '@lodgy/shared';
import { describe, expect, it } from 'vitest';
import { ENEMY_NODES, enemyPose, type EnemyPose } from './enemyPose';

const finite = (pose: EnemyPose) => {
  expect(Number.isFinite(pose.pitch) && Number.isFinite(pose.lift)).toBe(true);
  for (const node of ENEMY_NODES) for (const axis of ['x', 'y', 'z'] as const) expect(Number.isFinite(pose.nodes[node][axis]), `${node}.${axis}`).toBe(true);
};

describe('enemyPose (step 39)', () => {
  it('idle stands up straight with the knife held low in front', () => {
    const pose = enemyPose('idle', 0, 0);
    expect(pose.pitch).toBe(0);
    expect(pose.lift).toBe(0);
    expect(pose.nodes['leg-left'].x).toBe(0);
    expect(pose.nodes['arm-right'].x).toBeLessThan(0);
  });

  it('run swings the legs against each other and the left arm against the left leg, and leans forward (negative pitch)', () => {
    const pose = enemyPose('run', 0, Math.PI / 2);
    expect(pose.nodes['leg-left'].x).toBeGreaterThan(0.5);
    expect(pose.nodes['leg-right'].x).toBeCloseTo(-pose.nodes['leg-left'].x, 9);
    expect(Math.sign(pose.nodes['arm-left'].x)).toBe(-Math.sign(pose.nodes['leg-left'].x));
    expect(pose.pitch).toBeLessThan(0);
    const back = enemyPose('run', 0, (3 * Math.PI) / 2);
    expect(back.nodes['leg-left'].x).toBeCloseTo(-pose.nodes['leg-left'].x, 9);
  });

  it('run keeps the knife arm out in front the whole stride', () => {
    for (let phase = 0; phase < 2 * Math.PI; phase += 0.4) expect(enemyPose('run', 0, phase).nodes['arm-right'].x).toBeLessThan(-0.9);
  });

  it('attack thrusts the knife arm forward once per knife cooldown and draws it back in between', () => {
    const arm = (t: number) => enemyPose('attack', t, 0).nodes['arm-right'].x;
    const cocked = arm(0);
    const thrust = Math.min(...[0.3, 0.4, 0.45, 0.5, 0.6].map((c) => arm(c * ENEMY_KNIFE_COOLDOWN)));
    expect(thrust).toBeLessThan(cocked - 0.8);
    expect(arm(ENEMY_KNIFE_COOLDOWN)).toBeCloseTo(cocked, 9);
    expect(arm(0.45 * ENEMY_KNIFE_COOLDOWN + 7 * ENEMY_KNIFE_COOLDOWN)).toBeCloseTo(arm(0.45 * ENEMY_KNIFE_COOLDOWN), 9);
  });

  it('slip falls on the back, lies, and is on its feet again exactly when the slip ends', () => {
    expect(enemyPose('slip', 0, 0).pitch).toBe(0);
    expect(enemyPose('slip', 0.1, 0).pitch).toBeGreaterThan(0.3);
    expect(enemyPose('slip', 0.5, 0).pitch).toBeCloseTo(Math.PI / 2, 9);
    expect(enemyPose('slip', 0.5, 0).lift).toBeCloseTo(PLAYER_RADIUS, 9);
    expect(enemyPose('slip', ENEMY_SLIP_SECONDS - 0.05, 0).pitch).toBeLessThan(Math.PI / 2);
    expect(enemyPose('slip', ENEMY_SLIP_SECONDS, 0).pitch).toBeCloseTo(0, 9);
    expect(enemyPose('slip', ENEMY_SLIP_SECONDS + 1, 0).pitch).toBeCloseTo(0, 9);
  });

  it('slip never turns past lying flat, whatever the time', () => {
    for (let t = 0; t < 2; t += 0.05) {
      const { pitch } = enemyPose('slip', t, 0);
      expect(pitch).toBeGreaterThanOrEqual(0);
      expect(pitch).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
    }
  });

  it('down and dead drop to lying and stay there; dead falls slower than a knock', () => {
    for (const state of ['down', 'dead'] as const) {
      expect(enemyPose(state, 0, 0).pitch).toBe(0);
      expect(enemyPose(state, 1.5, 0).pitch).toBeCloseTo(Math.PI / 2, 9);
      expect(enemyPose(state, 1.5, 0).lift).toBeCloseTo(PLAYER_RADIUS, 9);
    }
    expect(enemyPose('down', 0.1, 0).pitch).toBeGreaterThan(enemyPose('dead', 0.1, 0).pitch);
  });

  it('every pose is finite, also for a time before the state began', () => {
    for (const state of ['idle', 'run', 'attack', 'slip', 'down', 'dead'] as const) {
      for (const t of [-1, 0, 0.3, 5]) finite(enemyPose(state, t, t * 3));
    }
    expect(enemyPose('slip', -1, 0).pitch).toBe(0);
  });
});
