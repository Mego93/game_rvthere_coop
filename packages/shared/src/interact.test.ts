import { expect, test } from 'vitest';
import { resolveInteract } from './interact';

test('a seated player leaves the seat, whatever else is in reach', () => {
  expect(resolveInteract({ seat: 'driver', seatChoice: null })).toEqual({ kind: 'exitSeat' });
  expect(resolveInteract({ seat: 'seat1', seatChoice: 'seat2' })).toEqual({ kind: 'exitSeat' });
});

test('a player on foot with a seat in reach boards it', () => {
  expect(resolveInteract({ seat: null, seatChoice: 'seat3' })).toEqual({ kind: 'board', seatId: 'seat3' });
});

test('with neither, nothing happens', () => {
  expect(resolveInteract({ seat: null, seatChoice: null })).toBeNull();
});
