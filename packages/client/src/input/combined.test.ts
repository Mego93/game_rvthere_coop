import { NEUTRAL_INPUT, type InputFields } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createInputSource } from './combined';

test('gives the keyboard fields with the mouse yaw and pitch', () => {
  const keys: InputFields = { ...NEUTRAL_INPUT, moveX: 1, moveY: -1, jump: true, interact: true, reel: 1, slot: 2, yaw: 9, pitch: 9 };
  const source = createInputSource({ sample: () => keys, dispose() {} }, { yaw: () => 1.5, pitch: () => -0.25, dispose() {} });
  expect(source.sample()).toEqual({ ...keys, yaw: 1.5, pitch: -0.25 });
});

test('reads the mouse afresh at each sample', () => {
  let yaw = 0;
  const source = createInputSource({ sample: () => NEUTRAL_INPUT, dispose() {} }, { yaw: () => yaw, pitch: () => 0, dispose() {} });
  yaw = 0.5;
  expect(source.sample().yaw).toBe(0.5);
});

test('dispose stops both', () => {
  const stopped: string[] = [];
  const source = createInputSource(
    { sample: () => NEUTRAL_INPUT, dispose: () => stopped.push('keyboard') },
    { yaw: () => 0, pitch: () => 0, dispose: () => stopped.push('mouse') },
  );
  source.dispose();
  expect(stopped.sort()).toEqual(['keyboard', 'mouse']);
});

test('step 39: fire is added only while the mouse fires, and a mouse without fire adds nothing', () => {
  let firing = false;
  const source = createInputSource({ sample: () => NEUTRAL_INPUT, dispose() {} }, { yaw: () => 0, pitch: () => 0, fire: () => firing, dispose() {} });
  expect('fire' in source.sample()).toBe(false);
  firing = true;
  expect(source.sample().fire).toBe(true);
  expect('fire' in createInputSource({ sample: () => NEUTRAL_INPUT, dispose() {} }, { yaw: () => 0, pitch: () => 0, dispose() {} }).sample()).toBe(false);
});
