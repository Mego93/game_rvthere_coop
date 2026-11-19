import { LOOK_SENSITIVITY } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createMouseLook } from './mouse';

const PITCH_LIMIT = Math.PI / 2 - 0.05;

// A canvas that records pointer-lock requests and a document that says which element is locked.
function setup() {
  const canvas = Object.assign(new EventTarget(), { requestPointerLock: () => (canvas.requests += 1), requests: 0 });
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as unknown });
  const look = createMouseLook(canvas as unknown as HTMLElement, doc as unknown as Document);
  const lock = (on = true) => {
    doc.pointerLockElement = on ? canvas : null;
    doc.dispatchEvent(new Event('pointerlockchange'));
  };
  const move = (movementX: number, movementY: number) =>
    doc.dispatchEvent(Object.assign(new Event('mousemove'), { movementX, movementY }));
  return { canvas, doc, look, lock, move };
}

test('starts looking straight ahead and unlocked', () => {
  const { look } = setup();
  expect([look.yaw(), look.pitch(), look.locked()]).toEqual([0, 0, false]);
});

test('a click on the canvas requests pointer lock', () => {
  const { canvas } = setup();
  canvas.dispatchEvent(new Event('click'));
  expect(canvas.requests).toBe(1);
});

test('moving right lowers yaw, moving down lowers pitch', () => {
  const { look, lock, move } = setup();
  lock();
  move(100, 40);
  expect(look.locked()).toBe(true);
  expect(look.yaw()).toBeCloseTo(-100 * LOOK_SENSITIVITY, 9);
  expect(look.pitch()).toBeCloseTo(-40 * LOOK_SENSITIVITY, 9);
  move(-300, -40);
  expect(look.yaw()).toBeCloseTo(200 * LOOK_SENSITIVITY, 9);
  expect(look.pitch()).toBeCloseTo(0, 9);
});

test('pitch clamps both ways', () => {
  const { look, lock, move } = setup();
  lock();
  move(0, 100000);
  expect(look.pitch()).toBeCloseTo(-PITCH_LIMIT, 9);
  move(0, -1000000);
  expect(look.pitch()).toBeCloseTo(PITCH_LIMIT, 9);
});

test('yaw wraps into (-pi, pi]', () => {
  const { look, lock, move } = setup();
  lock();
  // A turn of 3.5 rad to the left.
  move(-3.5 / LOOK_SENSITIVITY, 0);
  expect(look.yaw()).toBeCloseTo(3.5 - 2 * Math.PI, 6);
  move(3.5 / LOOK_SENSITIVITY, 0);
  expect(look.yaw()).toBeCloseTo(0, 6);
  move(-1000 / LOOK_SENSITIVITY, 0);
  expect(look.yaw()).toBeGreaterThan(-Math.PI);
  expect(look.yaw()).toBeLessThanOrEqual(Math.PI);
});

test('the view does not move without pointer lock', () => {
  const { look, lock, move } = setup();
  move(100, 100);
  expect([look.yaw(), look.pitch()]).toEqual([0, 0]);
  lock();
  lock(false);
  expect(look.locked()).toBe(false);
  move(100, 100);
  expect([look.yaw(), look.pitch()]).toEqual([0, 0]);
});

test('a lock on some other element does not count', () => {
  const { doc, look, move } = setup();
  doc.pointerLockElement = {};
  move(100, 100);
  expect(look.yaw()).toBe(0);
});

test('step 39: the left button fires while the pointer is locked, as a hold and as a tap, and nothing otherwise', () => {
  const { canvas, doc, look, lock } = setup();
  const press = (button: number) => canvas.dispatchEvent(Object.assign(new Event('mousedown'), { button }));
  const release = (button: number) => doc.dispatchEvent(Object.assign(new Event('mouseup'), { button }));
  press(0);
  expect(look.fire()).toBe(false);
  release(0);
  lock();
  press(2);
  expect(look.fire()).toBe(false);
  press(0);
  expect(look.fire()).toBe(true);
  expect(look.fire()).toBe(true);
  release(0);
  expect(look.fire()).toBe(false);
  press(0);
  release(0);
  expect(look.fire()).toBe(true);
  expect(look.fire()).toBe(false);
  press(0);
  lock(false);
  expect(look.fire()).toBe(false);
});

test('step 39: a blocked gate (a menu is open) stops the fire', () => {
  const gate = { blocked: false };
  const canvas = Object.assign(new EventTarget(), { requestPointerLock() {} });
  const doc = Object.assign(new EventTarget(), { pointerLockElement: canvas as unknown });
  const look = createMouseLook(canvas as unknown as HTMLElement, doc as unknown as Document, gate);
  canvas.dispatchEvent(Object.assign(new Event('mousedown'), { button: 0 }));
  expect(look.fire()).toBe(true);
  gate.blocked = true;
  expect(look.fire()).toBe(false);
  canvas.dispatchEvent(Object.assign(new Event('mousedown'), { button: 0 }));
  expect(look.fire()).toBe(false);
});

test('dispose removes every listener', () => {
  const added: string[] = [];
  const removed: string[] = [];
  const spy = (log: string[], base: EventTarget, method: 'addEventListener' | 'removeEventListener') => {
    const original = base[method].bind(base);
    base[method] = ((type: string, listener: never) => {
      log.push(type);
      original(type, listener);
    }) as typeof base.addEventListener;
  };
  const canvas = Object.assign(new EventTarget(), { requestPointerLock() {} });
  const doc = Object.assign(new EventTarget(), { pointerLockElement: canvas as unknown });
  for (const target of [canvas, doc]) {
    spy(added, target, 'addEventListener');
    spy(removed, target, 'removeEventListener');
  }
  const look = createMouseLook(canvas as unknown as HTMLElement, doc as unknown as Document);
  look.dispose();
  expect(added.length).toBeGreaterThan(0);
  expect(removed.sort()).toEqual(added.sort());
  doc.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 100, movementY: 100 }));
  expect(look.yaw()).toBe(0);
});

test('a click does not throw when the canvas has no requestPointerLock', () => {
  const canvas = new EventTarget();
  createMouseLook(canvas as unknown as HTMLElement, new EventTarget() as unknown as Document);
  expect(() => canvas.dispatchEvent(new Event('click'))).not.toThrow();
});

test('a rejected pointer-lock promise causes no unhandled rejection', async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  const canvas = Object.assign(new EventTarget(), { requestPointerLock: () => Promise.reject(new Error('denied')) });
  createMouseLook(canvas as unknown as HTMLElement, new EventTarget() as unknown as Document);
  canvas.dispatchEvent(new Event('click'));
  await new Promise((resolve) => setTimeout(resolve, 10));
  process.off('unhandledRejection', onUnhandled);
  expect(unhandled).toEqual([]);
});

test('a click does not request pointer lock while the gate is blocked, and does again once it opens', () => {
  const canvas = Object.assign(new EventTarget(), { requestPointerLock: () => (canvas.requests += 1), requests: 0 });
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as unknown });
  const gate = { blocked: true };
  createMouseLook(canvas as unknown as HTMLElement, doc as unknown as Document, gate);
  canvas.dispatchEvent(new Event('click'));
  expect(canvas.requests).toBe(0);
  gate.blocked = false;
  canvas.dispatchEvent(new Event('click'));
  expect(canvas.requests).toBe(1);
});
