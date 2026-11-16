import { describe, expect, test } from 'vitest';
import { SEAT_RING_SECONDS, SEAT_TOAST_SECONDS, createSeatAnnouncer, seatToastText } from './seatToast';

const driver = { id: 'driver', label: 'Driver' };
const rear = { id: 'seat4', label: 'Rear left' };

describe('seatToastText (S2)', () => {
  test('the driver and a passenger seat', () => {
    expect(seatToastText('Driver')).toBe('You are the Driver');
    expect(seatToastText('Rear left')).toBe('You are in the rear left seat');
    expect(seatToastText('Front passenger')).toBe('You are in the front passenger seat');
  });
});

describe('createSeatAnnouncer (S2)', () => {
  test('shows nothing while on foot', () => {
    const a = createSeatAnnouncer();
    expect(a.update(null, 0)).toEqual({ toast: null, ringAge: null });
  });
  test('the toast lasts 2.5 s and the ring 2 s from boarding', () => {
    const a = createSeatAnnouncer();
    a.update(null, 10);
    const r = a.update(driver, 11);
    expect(r.toast).toBe('You are the Driver');
    expect(r.ringAge).toBe(0);
    expect(a.update(driver, 11 + SEAT_RING_SECONDS - 0.01).ringAge).toBeCloseTo(1.99);
    const mid = a.update(driver, 11 + SEAT_RING_SECONDS + 0.01);
    expect(mid.ringAge).toBeNull();
    expect(mid.toast).toBe('You are the Driver');
    expect(a.update(driver, 11 + SEAT_TOAST_SECONDS + 0.01).toast).toBeNull();
  });
  test('leaving the seat clears at once, boarding again shows again, a seat change shows the new seat', () => {
    const a = createSeatAnnouncer();
    a.update(driver, 0);
    expect(a.update(null, 1)).toEqual({ toast: null, ringAge: null });
    expect(a.update(rear, 5).toast).toBe('You are in the rear left seat');
    expect(a.update(driver, 6).toast).toBe('You are the Driver');
  });
  test('a long frame gap does not show the toast again while seated', () => {
    const a = createSeatAnnouncer();
    a.update(driver, 0);
    expect(a.update(driver, 60).toast).toBeNull();
  });
});
