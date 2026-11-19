import { expect, test } from 'vitest';
import { combatView, timerText } from './combatView';

const foot = { seat: null, downed: null } as const;

test('step 39: no gun and no power-up show nothing', () => {
  expect(combatView(undefined)).toEqual({ ammo: null, timers: [] });
  expect(combatView({ ...foot })).toEqual({ ammo: null, timers: [] });
});

test('step 39: the ammo count shows on foot with a gun and is gone when seated or downed', () => {
  expect(combatView({ ...foot, gun: true, ammo: 12 }).ammo).toBe(12);
  expect(combatView({ ...foot, gun: true }).ammo).toBe(0);
  expect(combatView({ seat: 'driver', downed: null, gun: true, ammo: 12 }).ammo).toBeNull();
  expect(combatView({ seat: null, downed: 5, gun: true, ammo: 12 }).ammo).toBeNull();
});

test('step 39: timers come in the order gum, shield, Koke with whole seconds rounded up, and run on while seated', () => {
  const view = combatView({ seat: 'driver', downed: null, koke: 19.2, shield: 30, treedent: 14.1 });
  expect(view.timers).toEqual([
    { kind: 'treedent', label: 'Gum', text: '15s' },
    { kind: 'shield', label: 'Shield', text: '30' },
    { kind: 'koke', label: 'Koke', text: '20s' },
  ]);
});

test('step 39: a power-up at zero or below is not shown, and the last tenth of a second still reads 1s', () => {
  expect(combatView({ ...foot, treedent: 0, koke: 0, shield: 0 }).timers).toEqual([]);
  expect(combatView({ ...foot, treedent: 0.1 }).timers).toEqual([{ kind: 'treedent', label: 'Gum', text: '1s' }]);
  expect(timerText(15 + 1e-12)).toBe('15s');
  expect(timerText(Number.NaN)).toBe('0s');
});
