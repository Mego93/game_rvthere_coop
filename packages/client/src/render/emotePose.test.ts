import { EMOTES, EMOTE_SECONDS } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { EMOTE_NODES, EMOTE_RAMP, emoteWeight, emotePose } from './emotePose';

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

test('P1 sixSeven: both arms swing about -1.4 by 0.4 in opposite phase, twice a second', () => {
  const at0 = emotePose('sixSeven', 0);
  near(at0['arm-left'].x, -1.4);
  near(at0['arm-right'].x, -1.4);
  const quarter = emotePose('sixSeven', 0.125);
  near(quarter['arm-left'].x, -1.4 + 0.4);
  near(quarter['arm-right'].x, -1.4 - 0.4);
  const half = emotePose('sixSeven', 0.5);
  near(half['arm-left'].x, -1.4);
});

test('P2 dab is a fixed pose', () => {
  for (const t of [0, 0.7, 2]) {
    const pose = emotePose('dab', t);
    expect(pose.head).toEqual({ x: 0.5, y: 0.5, z: 0 });
    expect(pose['arm-left']).toEqual({ x: -1.7, y: 0, z: 0.7 });
    expect(pose['arm-right']).toEqual({ x: 0, y: 0, z: -2.3 });
  }
});

test('P3 wave raises the right arm and waves it twice a second', () => {
  near(emotePose('wave', 0)['arm-right'].z, -2.6);
  near(emotePose('wave', 0.125)['arm-right'].z, -2.6 + 0.35);
  near(emotePose('wave', 0.375)['arm-right'].z, -2.6 - 0.35);
});

test('P4 dance sways the torso and swings the arms in opposite directions at 1.5 Hz', () => {
  const t = 1 / 6;
  const pose = emotePose('dance', t);
  near(pose.torso.z, 0.17);
  near(pose['arm-left'].x, 0.7);
  near(pose['arm-right'].x, -0.7);
});

test('P5 every emote names the nodes it drives, and untouched nodes stay at zero', () => {
  expect(EMOTE_NODES.sixSeven).toEqual(['arm-left', 'arm-right']);
  expect(EMOTE_NODES.dab).toEqual(['head', 'arm-left', 'arm-right']);
  expect(EMOTE_NODES.wave).toEqual(['arm-right']);
  expect(EMOTE_NODES.dance).toEqual(['torso', 'arm-left', 'arm-right']);
  expect(emotePose('wave', 0.3).head).toEqual({ x: 0, y: 0, z: 0 });
  expect(Object.keys(EMOTE_NODES).sort()).toEqual([...EMOTES].sort());
});

test('P6 the weight ramps in and out over 0.2 s and is zero outside the emote', () => {
  expect(EMOTE_RAMP).toBe(0.2);
  expect(emoteWeight(-0.1)).toBe(0);
  expect(emoteWeight(0)).toBe(0);
  near(emoteWeight(0.1), 0.5);
  expect(emoteWeight(0.2)).toBe(1);
  expect(emoteWeight(1)).toBe(1);
  near(emoteWeight(EMOTE_SECONDS - 0.1), 0.5);
  expect(emoteWeight(EMOTE_SECONDS)).toBe(0);
  expect(emoteWeight(EMOTE_SECONDS + 1)).toBe(0);
});
