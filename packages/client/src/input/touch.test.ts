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
  let released = 0;
  const controls: TouchControls = {
    onButton: (h) => (onButton = h),
    onSlot: (h) => (onSlot = h),
    onCancel: (h) => (onCancel = h),
    releaseAll: () => (released += 1),
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
    released: () => released,
  };
}

test('with nothing touched it reports neutral input', () => {
  expect(setup().source.sample()).toEqual({
    moveX: 0, moveY: 0, yaw: 0, pitch: 0, jump: false, interact: false, use: false, reel: 0, slot: 0, drop: false, reset: false,
  });
});

test('the reset button is held while down', () => {
  const { source, button } = setup();
  button('reset', true);
  expect(source.sample().reset).toBe(true);
  expect(source.sample().reset).toBe(true);
  button('reset', false);
  expect(source.sample().reset).toBe(false);
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

test('releasing another slot does not cancel the long press of the held one', () => {
  const { source, slot } = setup();
  slot(0, true);
  slot(1, true);
  slot(0, false);
  vi.advanceTimersByTime(LONG_PRESS * 1000);
  expect(source.sample()).toMatchObject({ slot: 1, drop: true });
});

test('releasing the owning slot still cancels it', () => {
  const { source, slot } = setup();
  slot(0, true);
  slot(1, true);
  slot(1, false);
  vi.advanceTimersByTime(LONG_PRESS * 1000);
  expect(source.sample().drop).toBe(false);
});

test('a disposed source receives nothing from controls that keep every handler', () => {
  const handlers = { button: [] as ((n: TouchButtonName, d: boolean) => void)[], slot: [] as ((s: 0 | 1 | 2, d: boolean) => void)[], cancel: [] as (() => void)[] };
  const controls: TouchControls = {
    onButton: (h) => handlers.button.push(h),
    onSlot: (h) => handlers.slot.push(h),
    onCancel: (h) => handlers.cancel.push(h),
    releaseAll() {},
  };
  const make = () =>
    createTouchSource({ surface: new EventTarget(), win: new EventTarget(), doc: Object.assign(new EventTarget(), { visibilityState: 'visible' }), width: () => 800, controls });
  const first = make();
  first.dispose();
  const second = make();
  for (const h of handlers.button) h('jump', true);
  for (const h of handlers.slot) h(2, true);
  expect(first.sample()).toMatchObject({ jump: false, slot: 0 });
  expect(second.sample()).toMatchObject({ jump: true, slot: 2 });
});

test('with controls that replace the handler, only the second source sees events', () => {
  let onButton: (n: TouchButtonName, d: boolean) => void = () => {};
  const controls: TouchControls = { onButton: (h) => (onButton = h), onSlot() {}, onCancel() {}, releaseAll() {} };
  const make = () =>
    createTouchSource({ surface: new EventTarget(), win: new EventTarget(), doc: Object.assign(new EventTarget(), { visibilityState: 'visible' }), width: () => 800, controls });
  const first = make();
  const second = make();
  onButton('interact', true);
  expect(first.sample().interact).toBe(false);
  expect(second.sample().interact).toBe(true);
});

test('the surface listeners are non-passive and the touch events are default-prevented', () => {
  const added: [string, unknown][] = [];
  const surface = new EventTarget();
  const original = surface.addEventListener.bind(surface);
  surface.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: unknown) => {
    added.push([type, options]);
    original(type, listener, options as AddEventListenerOptions);
  }) as typeof surface.addEventListener;
  createTouchSource({ surface, win: new EventTarget(), doc: Object.assign(new EventTarget(), { visibilityState: 'visible' }), width: () => 800, controls: { onButton() {}, onSlot() {}, onCancel() {}, releaseAll() {} } });
  for (const type of ['touchstart', 'touchmove', 'touchend']) {
    expect(added.find(([t]) => t === type)?.[1]).toEqual({ passive: false });
    const event = Object.assign(new Event(type, { cancelable: true }), { changedTouches: [{ identifier: 1, clientX: 1, clientY: 1 }] });
    surface.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  }
});

test('dispose removes the blur and visibilitychange listeners too', () => {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const removed: string[] = [];
  for (const target of [win, doc]) {
    const remove = target.removeEventListener.bind(target);
    target.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject) => {
      removed.push(type);
      remove(type, listener);
    }) as typeof target.removeEventListener;
  }
  const source = createTouchSource({ surface: new EventTarget(), win, doc, width: () => 800, controls: { onButton() {}, onSlot() {}, onCancel() {}, releaseAll() {} } });
  source.dispose();
  expect(removed).toContain('blur');
  expect(removed).toContain('visibilitychange');
});

test('every kind of cancel tells the controls to release their held buttons', () => {
  for (const [, cancel] of cancels) {
    const h = setup();
    cancel(h);
    expect(h.released()).toBeGreaterThan(0);
  }
});

test('B13: the sprint button is a level the UI sets, absent when off, and cancel clears it', () => {
  const { source, button, cancel } = setup();
  button('sprint', true);
  expect(source.sample().sprint).toBe(true);
  expect(source.sample().sprint).toBe(true);
  button('sprint', false);
  expect('sprint' in source.sample()).toBe(false);
  button('sprint', true);
  cancel();
  expect('sprint' in source.sample()).toBe(false);
});

test('B13: a hidden page clears sprint, and touch never sends crouch', () => {
  const { source, button, doc } = setup();
  button('sprint', true);
  (doc as { visibilityState: string }).visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  const sample = source.sample();
  expect('sprint' in sample).toBe(false);
  expect('crouch' in sample).toBe(false);
});

test('step 39: the fire button is held while down, a short tap counts once, and it is absent when up', () => {
  const { source, button } = setup();
  button('fire', true);
  expect(source.sample().fire).toBe(true);
  expect(source.sample().fire).toBe(true);
  button('fire', false);
  expect('fire' in source.sample()).toBe(false);
  button('fire', true);
  button('fire', false);
  expect(source.sample().fire).toBe(true);
  expect('fire' in source.sample()).toBe(false);
});
