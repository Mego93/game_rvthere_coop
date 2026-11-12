import { NEUTRAL_INPUT } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createKeyboardSource } from './keyboard';

function setup() {
  const target = new EventTarget();
  const source = createKeyboardSource(target);
  const key = (type: 'keydown' | 'keyup', code: string) =>
    target.dispatchEvent(Object.assign(new Event(type), { code }));
  return { target, source, press: (code: string) => key('keydown', code), release: (code: string) => key('keyup', code) };
}

test('with no key held it reports neutral input', () => {
  expect(setup().source.sample()).toEqual(NEUTRAL_INPUT);
});

test('WASD map to the move axes: W forward, D right', () => {
  const { source, press, release } = setup();
  press('KeyW');
  press('KeyD');
  expect(source.sample()).toMatchObject({ moveX: 1, moveY: 1 });
  release('KeyW');
  press('KeyS');
  release('KeyD');
  press('KeyA');
  expect(source.sample()).toMatchObject({ moveX: -1, moveY: -1 });
});

test('opposite keys cancel out', () => {
  const { source, press } = setup();
  press('KeyA');
  press('KeyD');
  expect(source.sample().moveX).toBe(0);
});

test('buttons: Space jump, E interact, F use, G drop', () => {
  const { source, press, release } = setup();
  for (const code of ['Space', 'KeyE', 'KeyF', 'KeyG']) press(code);
  expect(source.sample()).toMatchObject({ jump: true, interact: true, use: true, drop: true });
  release('KeyE');
  expect(source.sample().interact).toBe(false);
});

test('Q reels in, R reels out', () => {
  const { source, press, release } = setup();
  press('KeyQ');
  expect(source.sample().reel).toBe(1);
  release('KeyQ');
  press('KeyR');
  expect(source.sample().reel).toBe(-1);
});

test('1, 2 and 3 select a slot, which stays selected after release', () => {
  const { source, press, release } = setup();
  press('Digit3');
  release('Digit3');
  expect(source.sample().slot).toBe(2);
  press('Digit2');
  expect(source.sample().slot).toBe(1);
});

test('losing focus releases every key', () => {
  const { target, source, press } = setup();
  press('KeyW');
  press('Space');
  target.dispatchEvent(new Event('blur'));
  expect(source.sample()).toEqual(NEUTRAL_INPUT);
});

test('dispose stops listening', () => {
  const { source, press } = setup();
  source.dispose();
  press('KeyW');
  expect(source.sample().moveY).toBe(0);
});
