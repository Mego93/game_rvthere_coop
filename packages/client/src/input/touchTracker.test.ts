import { expect, test } from 'vitest';
import { createTouchTracker } from './touchTracker';

const make = () => createTouchTracker(() => 800);

test('a left touch becomes the joystick with its own origin', () => {
  const t = make();
  t.start(1, 100, 200);
  t.move(1, 130, 190);
  expect(t.joystick()).toEqual({ origin: { x: 100, y: 200 }, point: { x: 130, y: 190 } });
});

test('with no touch there is no joystick', () => {
  expect(make().joystick()).toBeNull();
});

test('a second left touch is ignored', () => {
  const t = make();
  t.start(1, 100, 200);
  t.start(2, 50, 50);
  t.move(2, 90, 90);
  expect(t.joystick()).toEqual({ origin: { x: 100, y: 200 }, point: { x: 100, y: 200 } });
  expect(t.takeLook()).toEqual({ dx: 0, dy: 0 });
});

test('a right touch drives look while the joystick is held', () => {
  const t = make();
  t.start(1, 100, 200);
  t.start(2, 600, 200);
  t.move(2, 610, 195);
  t.move(2, 615, 190);
  expect(t.joystick()).not.toBeNull();
  expect(t.takeLook()).toEqual({ dx: 15, dy: -10 });
});

test('ending the joystick touch clears it while look continues', () => {
  const t = make();
  t.start(1, 100, 200);
  t.start(2, 600, 200);
  t.end(1);
  expect(t.joystick()).toBeNull();
  t.move(2, 620, 200);
  expect(t.takeLook()).toEqual({ dx: 20, dy: 0 });
});

test('ending the look touch stops the look', () => {
  const t = make();
  t.start(2, 600, 200);
  t.end(2);
  t.move(2, 650, 200);
  expect(t.takeLook()).toEqual({ dx: 0, dy: 0 });
});

test('takeLook resets', () => {
  const t = make();
  t.start(2, 600, 200);
  t.move(2, 610, 200);
  expect(t.takeLook()).toEqual({ dx: 10, dy: 0 });
  expect(t.takeLook()).toEqual({ dx: 0, dy: 0 });
});

test('cancelAll clears both', () => {
  const t = make();
  t.start(1, 100, 200);
  t.start(2, 600, 200);
  t.move(2, 610, 200);
  t.cancelAll();
  expect(t.joystick()).toBeNull();
  expect(t.takeLook()).toEqual({ dx: 0, dy: 0 });
  t.move(2, 650, 200);
  expect(t.takeLook()).toEqual({ dx: 0, dy: 0 });
});

test('a touch at exactly width / 2 counts as right', () => {
  const t = make();
  t.start(1, 400, 200);
  expect(t.joystick()).toBeNull();
  t.move(1, 410, 200);
  expect(t.takeLook()).toEqual({ dx: 10, dy: 0 });
});

test('a move or end with an unknown or ignored id changes nothing', () => {
  const t = make();
  t.start(1, 100, 200);
  t.start(2, 600, 200);
  t.start(3, 50, 50);
  t.move(9, 5, 5);
  t.end(9);
  t.move(3, 70, 70);
  t.end(3);
  expect(t.joystick()).toEqual({ origin: { x: 100, y: 200 }, point: { x: 100, y: 200 } });
  expect(t.takeLook()).toEqual({ dx: 0, dy: 0 });
  t.move(2, 605, 200);
  expect(t.takeLook()).toEqual({ dx: 5, dy: 0 });
});

test('a second right touch while a look touch is active is ignored', () => {
  const t = make();
  t.start(2, 600, 200);
  t.start(3, 700, 100);
  t.move(3, 750, 100);
  expect(t.takeLook()).toEqual({ dx: 0, dy: 0 });
  t.end(3);
  t.move(2, 610, 200);
  expect(t.takeLook()).toEqual({ dx: 10, dy: 0 });
});

test('reads the width afresh', () => {
  let width = 800;
  const t = createTouchTracker(() => width);
  width = 1400;
  t.start(1, 600, 0);
  expect(t.joystick()).not.toBeNull();
});
