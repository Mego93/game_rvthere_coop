import { getVehicleConfig } from '@lodgy/shared';
import { describe, expect, test } from 'vitest';
import { SEAT_LABELS, seatLabel } from './seatLabels';

describe.each(['lodgy', 'rv'] as const)('%s seat labels (S1)', (id) => {
  const { seats } = getVehicleConfig(id);
  test('every seat id has a label', () => {
    for (const seat of seats) expect(seatLabel(seat.id), seat.id).toBeTruthy();
  });
  test('left and right in the label match the seat side', () => {
    for (const seat of seats) {
      const label = seatLabel(seat.id)!.toLowerCase();
      if (label.includes('left')) expect(seat.side, seat.id).toBe(-1);
      if (label.includes('right')) expect(seat.side, seat.id).toBe(1);
    }
  });
});

test('the labels are the agreed strings and an unknown id has none', () => {
  expect(Object.values(SEAT_LABELS)).toEqual(['Driver', 'Front passenger', 'Middle left', 'Middle right', 'Rear left', 'Rear right']);
  expect(seatLabel('seat9')).toBeNull();
});
