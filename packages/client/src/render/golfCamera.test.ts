import { describe, expect, it } from 'vitest';
import { BALL_FOLLOW_BEHIND, BALL_FOLLOW_HEIGHT, BALL_TRAIL_LENGTH, ballFollowPose, blendFollow, headingFrom, pushTrail } from './golfCamera';

describe('ballFollowPose', () => {
  it('sits behind the ball along its heading, above it, and looks ahead of it', () => {
    const pose = ballFollowPose({ x: 3, y: 10, z: -50 }, { x: 0, z: -1 });
    expect(pose.position.x).toBeCloseTo(3, 9);
    expect(pose.position.z).toBeCloseTo(-50 + BALL_FOLLOW_BEHIND, 9);
    expect(pose.position.y).toBeCloseTo(10 + BALL_FOLLOW_HEIGHT, 9);
    expect(pose.target.z).toBeLessThan(-50);
    expect(pose.target.y).toBeCloseTo(10, 9);
  });

  it('follows a ball curving to the right: the camera is back along the new heading', () => {
    const pose = ballFollowPose({ x: 0, y: 5, z: 0 }, { x: 1, z: 0 });
    expect(pose.position.x).toBeCloseTo(-BALL_FOLLOW_BEHIND, 9);
    expect(pose.position.z).toBeCloseTo(0, 9);
  });

  it('never dips below the ground behind a ball that has landed', () => {
    expect(ballFollowPose({ x: 0, y: 0, z: -100 }, { x: 0, z: -1 }).position.y).toBeGreaterThan(1);
  });
});

describe('headingFrom', () => {
  it('is the unit direction of the move on the ground plane', () => {
    expect(headingFrom({ x: 0, y: 1, z: 0 }, { x: 3, y: 9, z: -4 }, { x: 0, z: -1 })).toEqual({ x: 0.6, z: -0.8 });
  });

  it('keeps the old heading when the ball has barely moved', () => {
    expect(headingFrom({ x: 1, y: 0, z: 1 }, { x: 1.01, y: 0, z: 1 }, { x: 0, z: -1 })).toEqual({ x: 0, z: -1 });
  });
});

describe('blendFollow', () => {
  it('rises toward 1 while the ball is out and falls back to 0 after, never leaving [0, 1]', () => {
    let blend = 0;
    for (let i = 0; i < 600; i++) blend = blendFollow(blend, true, 1 / 60);
    expect(blend).toBeCloseTo(1, 3);
    const mid = blendFollow(0, true, 0.1);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    for (let i = 0; i < 600; i++) blend = blendFollow(blend, false, 1 / 60);
    expect(blend).toBeCloseTo(0, 3);
    expect(blendFollow(1, true, 5)).toBeLessThanOrEqual(1);
    expect(blendFollow(0, false, 5)).toBeGreaterThanOrEqual(0);
  });
});

describe('pushTrail', () => {
  it('keeps the newest positions, at most the trail length', () => {
    let trail: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < BALL_TRAIL_LENGTH + 5; i++) trail = pushTrail(trail, { x: i, y: 0, z: 0 });
    expect(trail).toHaveLength(BALL_TRAIL_LENGTH);
    expect(trail[trail.length - 1]!.x).toBe(BALL_TRAIL_LENGTH + 4);
    expect(trail[0]!.x).toBe(5);
  });

  it('adds nothing for a ball that has not moved, and clears on null', () => {
    const trail = pushTrail([], { x: 1, y: 1, z: 1 });
    expect(pushTrail(trail, { x: 1, y: 1, z: 1 })).toEqual(trail);
    expect(pushTrail(trail, null)).toEqual([]);
  });
});
