import { NEUTRAL_INPUT } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createKeyboardSource } from './keyboard';

function setup() {
  const target = new EventTarget();
  const source = createKeyboardSource(target);
  // Returns the event so a test can ask whether the default was prevented.
  const key = (type: 'keydown' | 'keyup', code: string, modifiers: Record<string, boolean> = {}) => {
    const event = Object.assign(new Event(type, { cancelable: true }), { code }, modifiers);
    target.dispatchEvent(event);
    return event;
  };
  return {
    target,
    source,
    press: (code: string, modifiers?: Record<string, boolean>) => key('keydown', code, modifiers),
    release: (code: string, modifiers?: Record<string, boolean>) => key('keyup', code, modifiers),
  };
}

test('with no key held it reports neutral input', () => {
  expect(setup().source.sample()).toEqual({ ...NEUTRAL_INPUT, reset: false });
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

test('X holds reset and R stays reel out', () => {
  const { source, press, release } = setup();
  press('KeyX');
  expect(source.sample()).toMatchObject({ reset: true, reel: 0 });
  expect(source.sample().reset).toBe(true);
  release('KeyX');
  expect(source.sample().reset).toBe(false);
  press('KeyR');
  expect(source.sample()).toMatchObject({ reset: false, reel: -1 });
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
  expect(source.sample()).toEqual({ ...NEUTRAL_INPUT, reset: false });
});

test('dispose stops listening', () => {
  const { source, press } = setup();
  source.dispose();
  press('KeyW');
  expect(source.sample().moveY).toBe(0);
});

test('W and S together, and Q and R together, give 0', () => {
  const { source, press } = setup();
  press('KeyW');
  press('KeyS');
  press('KeyQ');
  press('KeyR');
  expect(source.sample()).toMatchObject({ moveY: 0, reel: 0 });
});

test('key repeat keeps one press: one keyup ends it', () => {
  const { source, press, release } = setup();
  press('KeyE');
  press('KeyE');
  press('KeyE');
  release('KeyE');
  source.sample();
  expect(source.sample().interact).toBe(false);
});

test('a key held across samples stays true', () => {
  const { source, press } = setup();
  press('KeyE');
  expect(source.sample().interact).toBe(true);
  expect(source.sample().interact).toBe(true);
});

test('a tap between two samples is reported once in the next sample', () => {
  const { source, press, release } = setup();
  press('KeyE');
  release('KeyE');
  expect(source.sample().interact).toBe(true);
  expect(source.sample().interact).toBe(false);
});

test('a tap of jump and drop is reported once too', () => {
  const { source, press, release } = setup();
  for (const code of ['Space', 'KeyG']) {
    press(code);
    release(code);
  }
  expect(source.sample()).toMatchObject({ jump: true, drop: true });
  expect(source.sample()).toMatchObject({ jump: false, drop: false });
});

test('a held key that repeats is not reported as a new tap after release', () => {
  const { source, press, release } = setup();
  press('KeyE');
  source.sample();
  press('KeyE');
  release('KeyE');
  expect(source.sample().interact).toBe(false);
});

test('blur drops a pending tap', () => {
  const { target, source, press, release } = setup();
  press('KeyE');
  release('KeyE');
  target.dispatchEvent(new Event('blur'));
  expect(source.sample().interact).toBe(false);
});

test('game keys are default-prevented on keydown and keyup', () => {
  const { press, release } = setup();
  const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyE', 'KeyF', 'KeyQ', 'KeyR', 'KeyG', 'KeyX', 'Digit1', 'Digit2', 'Digit3'];
  for (const code of codes) {
    expect(press(code).defaultPrevented, `${code} down`).toBe(true);
    expect(release(code).defaultPrevented, `${code} up`).toBe(true);
  }
});

test('other keys are left alone: F5, F12, Tab', () => {
  const { press, release } = setup();
  for (const code of ['F5', 'F12', 'Tab']) {
    expect(press(code).defaultPrevented, code).toBe(false);
    expect(release(code).defaultPrevented, code).toBe(false);
  }
});

test('with Ctrl, Meta or Alt held a game key is left alone (Ctrl+R)', () => {
  const { press, release } = setup();
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
    expect(press('KeyR', { [modifier]: true }).defaultPrevented, modifier).toBe(false);
    expect(release('KeyR', { [modifier]: true }).defaultPrevented, modifier).toBe(false);
  }
});

test('a key pressed with a modifier held is not tracked (no keyup comes on macOS)', () => {
  const { source, press } = setup();
  press('KeyD', { metaKey: true });
  press('Digit3', { ctrlKey: true });
  expect(source.sample()).toEqual({ ...NEUTRAL_INPUT, reset: false });
});

test('a keyup with a modifier held still releases the key', () => {
  const { source, press, release } = setup();
  press('KeyW');
  release('KeyW', { ctrlKey: true });
  expect(source.sample().moveY).toBe(0);
});

test('releasing Meta clears every held key', () => {
  const { source, press, release } = setup();
  press('KeyW');
  press('KeyD');
  release('MetaLeft');
  expect(source.sample()).toMatchObject({ moveX: 0, moveY: 0 });
  press('KeyW');
  release('MetaRight');
  expect(source.sample().moveY).toBe(0);
});

test('B13: either Shift is sprint and C is crouch, both read as held and sent only when true', () => {
  const { source, press, release } = setup();
  expect('sprint' in source.sample()).toBe(false);
  expect('crouch' in source.sample()).toBe(false);
  press('ShiftLeft');
  expect(source.sample().sprint).toBe(true);
  expect(source.sample().sprint).toBe(true);
  release('ShiftLeft');
  expect('sprint' in source.sample()).toBe(false);
  press('ShiftRight');
  expect(source.sample().sprint).toBe(true);
  release('ShiftRight');
  press('KeyC');
  expect(source.sample().crouch).toBe(true);
  expect(source.sample().crouch).toBe(true);
  release('KeyC');
  expect(source.sample()).toEqual({ ...NEUTRAL_INPUT, reset: false });
});

test('B13: a window blur releases sprint and crouch', () => {
  const { target, source, press } = setup();
  press('ShiftLeft');
  press('KeyC');
  target.dispatchEvent(new Event('blur'));
  expect(source.sample()).toEqual({ ...NEUTRAL_INPUT, reset: false });
});
