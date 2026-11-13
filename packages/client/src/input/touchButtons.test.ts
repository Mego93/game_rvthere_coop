import { expect, test } from 'vitest';
import { createButton } from './touchButtons';

test('a tap between two samples counts once', () => {
  const b = createButton();
  b.down();
  b.up();
  expect(b.sample()).toBe(true);
  expect(b.sample()).toBe(false);
});

test('a hold counts on every sample', () => {
  const b = createButton();
  b.down();
  expect([b.sample(), b.sample(), b.sample()]).toEqual([true, true, true]);
});

test('release clears it', () => {
  const b = createButton();
  b.down();
  b.sample();
  b.up();
  expect(b.sample()).toBe(false);
});

test('reset clears a hold and a pending tap', () => {
  const b = createButton();
  b.down();
  b.reset();
  expect(b.sample()).toBe(false);
});
