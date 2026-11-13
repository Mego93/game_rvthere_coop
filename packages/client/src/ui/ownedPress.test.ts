import { expect, test } from 'vitest';
import { createOwnedPress } from './ownedPress';

test('the first touch goes down and holds the press', () => {
  const press = createOwnedPress();
  expect(press.start(1)).toBe(true);
  expect(press.held()).toBe(true);
});

test('a second finger on a held press is ignored, and its end does not release it', () => {
  const press = createOwnedPress();
  press.start(1);
  expect(press.start(2)).toBe(false);
  expect(press.end([2])).toBe(false);
  expect(press.held()).toBe(true);
});

test('the end of a different id does not release; the owner id does', () => {
  const press = createOwnedPress();
  press.start(1);
  expect(press.end([5, 6])).toBe(false);
  expect(press.end([5, 1])).toBe(true);
  expect(press.held()).toBe(false);
});

test('cancel releases a held press and does nothing otherwise', () => {
  const press = createOwnedPress();
  expect(press.cancel()).toBe(false);
  press.start(1);
  expect(press.cancel()).toBe(true);
  expect(press.held()).toBe(false);
  expect(press.end([1])).toBe(false);
});

test('after release a new touch can take the press', () => {
  const press = createOwnedPress();
  press.start(1);
  press.end([1]);
  expect(press.start(2)).toBe(true);
});
