import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { LONG_PRESS, TOUCH_LOOK_SENSITIVITY } from './touchConfig';
import { createTouchSource, type TouchButtonName, type TouchControls } from './touch';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const surface = new EventTarget();
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  let onButton: (name: TouchButtonName, down: boolean) => void = () => {};
  let onSlot: (slot: 0 | 1 | 2, down: boolean) => void = () => {};
  let onCancel: () => void = () => {};
  const controls: TouchControls = {
    onButton: (h) => (onButton = h),
    onSlot: (h) => (onSlot = h),
    onCancel: (h) => (onCancel = h),
  };
  const source = createTouchSource({ surface, win, doc, width: () => 800, controls });
  const touch = (type: string, id: number, x: number, y: number) => {
    const event = Object.assign(new Event(type, { cancelable: true }), {
      changedTouches: [{ identifier: id, clientX: x, clientY: y }],
    });
    surface.dispatchEvent(event);
    return event;
  };
  return {
    source,
    surface,
    win,
    doc,
    touch,
    button: (name: TouchButtonName, down: boolean) => onButton(name, down),
    slot: (slot: 0 | 1 | 2, down: boolean) => onSlot(slot, down),
    cancel: () => onCancel(),
  };
}

test('with nothing touched it reports neutral input', () => {
  expect(setup().source.sample()).toEqual({
    moveX: 0, moveY: 0, yaw: 0, pitch: 0, jump: false, interact: false, use: false, reel: 0, slot: 0, drop: false,
  });
});

test('the joystick maps to moveX and moveY', () => {
  const { source, touch } = setup();
  touch('touchstart', 1, 100, 200);
  touch('touchmove', 1, 160, 200);
  expect(source.sample()).toMatchObject({ moveX: 1, moveY: 0 });
  touch('touchmove', 1, 100, 140);
  const s = source.sample();
  expect(s.moveX).toBeCloseTo(0, 9);
  expect(s.moveY).toBeCloseTo(1, 9);
  expect(source.joystick()).toEqual({ origin: { x: 100, y: 200 }, point: { x: 100, y: 140 } });
  touch('touchend', 1, 100, 140);
  expect(source.sample()).toMatchObject({ moveX: 0, moveY: 0 });
  expect(source.joystick()).toBeNull();
});

test('a drag on the right half applies look with the mouse signs, in sample and aim', () => {
  const { source, touch } = setup();
  touch('touchstart', 2, 600, 200);
  touch('touchmove', 2, 650, 180);
  const s = source.sample();
  expect(s.yaw).toBeCloseTo(-50 * TOUCH_LOOK_SENSITIVITY, 9);
  expect(s.pitch).toBeCloseTo(20 * TOUCH_LOOK_SENSITIVITY, 9);
  touch('touchmove', 2, 660, 180);
  expect(source.aim().yaw).toBeCloseTo(-60 * TOUCH_LOOK_SENSITIVITY, 9);
  expect(source.sample().yaw).toBeCloseTo(-60 * TOUCH_LOOK_SENSITIVITY, 9);
});

test('the buttons map to their fields', () => {
  const { source, button } = setup();
  button('interact', true);
  button('use', true);
  button('jump', true);
  button('reelIn', true);
  expect(source.sample()).toMatchObject({ interact: true, use: true, jump: true, reel: 1 });
  button('reelIn', false);
  button('reelOut', true);
  expect(source.sample()).toMatchObject({ reel: -1 });
  button('interact', false);
  button('use', false);
  button('jump', false);
  button('reelOut', false);
  expect(source.sample()).toMatchObject({ interact: false, use: false, jump: false, reel: 0 });
});

test('a tap shorter than a tick still counts once', () => {
  const { source, button } = setup();
  button('interact', true);
  button('interact', false);
  expect(source.sample().interact).toBe(true);
  expect(source.sample().interact).toBe(false);
});

test('both reel buttons give 0', () => {
  const { source, button } = setup();
  button('reelIn', true);
  button('reelOut', true);
  expect(source.sample().reel).toBe(0);
});

test('a slot tap sets slot and keeps it', () => {
  const { source, slot } = setup();
  slot(2, true);
  slot(2, false);
  expect(source.sample()).toMatchObject({ slot: 2, drop: false });
  expect(source.sample().slot).toBe(2);
});

test('a long press gives drop true for exactly one sample', () => {
  const { source, slot } = setup();
  slot(1, true);
  expect(source.sample()).toMatchObject({ slot: 1, drop: false });
  vi.advanceTimersByTime(LONG_PRESS * 1000);
  expect(source.sample()).toMatchObject({ slot: 1, drop: true });
  expect(source.sample().drop).toBe(false);
  slot(1, false);
  expect(source.sample().drop).toBe(false);
});

test('releasing before the long press cancels the drop', () => {
  const { source, slot } = setup();
  slot(0, true);
  vi.advanceTimersByTime(LONG_PRESS * 1000 - 1);
  slot(0, false);
  vi.advanceTimersByTime(1000);
  expect(source.sample().drop).toBe(false);
});

// Held buttons, a pending slot press and a tap made just before the cancel.
function holdEverything(h: ReturnType<typeof setup>) {
  h.button('interact', true);
  h.button('jump', true);
  h.button('reelIn', true);
  h.button('use', true);
  h.button('use', false);
  h.slot(2, true);
}

const cancels: [string, (h: ReturnType<typeof setup>) => void][] = [
  ['blur', (h) => h.win.dispatchEvent(new Event('blur'))],
  ['touchcancel', (h) => h.touch('touchcancel', 9, 0, 0)],
  ['controls.onCancel', (h) => h.cancel()],
  ['visibilitychange to hidden', (h) => {
    h.doc.visibilityState = 'hidden';
    h.doc.dispatchEvent(new Event('visibilitychange'));
  }],
];

for (const [name, cancel] of cancels) {
  test(`${name} releases every button, drops the tap and the pending long press`, () => {
    const h = setup();
    h.touch('touchstart', 1, 100, 200);
    h.touch('touchmove', 1, 160, 200);
    holdEverything(h);
    cancel(h);
    vi.advanceTimersByTime(LONG_PRESS * 1000 + 1);
    expect(h.source.sample()).toMatchObject({
      moveX: 0, moveY: 0, jump: false, interact: false, use: false, reel: 0, drop: false,
    });
    expect(h.source.joystick()).toBeNull();
  });
}

test('a visibilitychange that leaves the page visible cancels nothing', () => {
  const h = setup();
  h.button('jump', true);
  h.doc.dispatchEvent(new Event('visibilitychange'));
  expect(h.source.sample().jump).toBe(true);
});

test('touch events are not required to be trusted', () => {
  const { source, touch } = setup();
  const event = touch('touchstart', 1, 100, 200);
  expect(event.isTrusted).toBe(false);
  expect(source.joystick()).not.toBeNull();
});

test('dispose removes the listeners and the pending long press', () => {
  const h = setup();
  h.slot(0, true);
  h.source.dispose();
  h.touch('touchstart', 1, 100, 200);
  expect(h.source.joystick()).toBeNull();
  vi.advanceTimersByTime(LONG_PRESS * 1000 + 1);
  expect(h.source.sample().drop).toBe(false);
});
