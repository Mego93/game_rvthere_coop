import { NEUTRAL_INPUT } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { menuInput } from './shopMenu';
import { inputFrozen, runMenuItems, runMenuState } from './runMenu';

const CLOSED = { open: false };
const OPEN = { open: true };

test('L19: Esc opens the run menu and Esc again closes it', () => {
  expect(runMenuState(CLOSED, 'esc', false).open).toBe(true);
  expect(runMenuState(OPEN, 'esc', false).open).toBe(false);
});

test('L19: the touch button opens it and Resume closes it', () => {
  expect(runMenuState(CLOSED, 'button', false).open).toBe(true);
  expect(runMenuState(OPEN, 'resume', false).open).toBe(false);
});

test('L19: an Esc with the shop menu open never opens the run menu', () => {
  expect(runMenuState(CLOSED, 'esc', true).open).toBe(false);
});

test('L19: opening the shop menu closes the run menu, and leaving the phase closes it', () => {
  expect(runMenuState(OPEN, 'shopOpened', true).open).toBe(false);
  expect(runMenuState(OPEN, 'phaseLeft', false).open).toBe(false);
});

test('L19: the button opens the run menu even with the shop menu open (the caller closes the shop menu)', () => {
  expect(runMenuState(CLOSED, 'button', true).open).toBe(true);
});

test('L19: a non-admin sees only Resume; the admin sees the actions too', () => {
  expect(runMenuItems(false)).toEqual(['Resume']);
  expect(runMenuItems(true)).toEqual(['Resume', 'Restart from checkpoint', 'Restart course', 'Return to lobby', 'Skip checkpoint', 'Refill', 'Toggle fly', 'Toggle infinite items']);
});

test('L19: input is neutral while either menu is open, with the slot kept from the last send', () => {
  const sampled = { ...NEUTRAL_INPUT, moveY: 1, yaw: 0.5, pitch: 0.2, slot: 2 as const };
  const last = { ...NEUTRAL_INPUT, slot: 1 as const };
  for (const [shopOpen, runOpen] of [[true, false], [false, true], [true, true]] as [boolean, boolean][]) {
    const fields = menuInput(shopOpen || runOpen, sampled, last);
    expect(fields.moveY).toBe(0);
    expect(fields.slot).toBe(1);
    expect(fields.yaw).toBe(0.5);
  }
  expect(menuInput(false, sampled, last)).toEqual(sampled);
});

test('L19: neither Esc nor the touch button opens the menu outside the playing phase', () => {
  expect(runMenuState(CLOSED, 'button', false, false).open).toBe(false);
  expect(runMenuState(CLOSED, 'esc', false, false).open).toBe(false);
});

test('L19: input is frozen while a menu is open and in every phase but playing', () => {
  expect(inputFrozen(false, 'playing')).toBe(false);
  expect(inputFrozen(true, 'playing')).toBe(true);
  expect(inputFrozen(false, 'results')).toBe(true);
  expect(inputFrozen(false, 'lobby')).toBe(true);
});
