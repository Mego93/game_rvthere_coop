import { describe, expect, it } from 'vitest';
import { getCourse } from '@lodgy/shared';
import { gateGoalLabel, SPOT_LABELS, markerShown, nearAtm, spotPrompt, usableSpot } from './spots';

const spots = getCourse('villa').spots!;
const at = (id: string) => spots.find((spot) => spot.id === id)!;

describe('spots', () => {
  it('labels every kind of spot the villa has', () => {
    for (const spot of spots) expect(SPOT_LABELS[spot.kind], spot.id).toBeTruthy();
  });

  it('has a prompt for the spots that act and none for the couch or a bed by day', () => {
    expect(spotPrompt('kitchen', false)).toContain('F');
    expect(spotPrompt('couch', true)).toBeNull();
    expect(spotPrompt('bed', false)).toBeNull();
    expect(spotPrompt('bed', true)).toContain('bed');
  });

  it('draws a marker within 6 m and not for the couch', () => {
    const kitchen = at('kitchen');
    expect(markerShown(kitchen, { x: kitchen.pos.x + 5.9, y: 0, z: kitchen.pos.z })).toBe(true);
    expect(markerShown(kitchen, { x: kitchen.pos.x + 6.1, y: 0, z: kitchen.pos.z })).toBe(false);
    expect(markerShown(kitchen, null)).toBe(false);
    expect(markerShown(at('couch-0'), { ...at('couch-0').pos })).toBe(false);
  });

  it('finds the spot a use press would reach, as the world does', () => {
    const laptop = at('laptop-0');
    expect(usableSpot(spots, { ...laptop.pos })?.id).toBe('laptop-0');
    expect(usableSpot(spots, { x: laptop.pos.x, y: laptop.pos.y + 3, z: laptop.pos.z })).toBeNull();
    expect(usableSpot(spots, { x: 0, y: 0, z: 0 })).toBeNull();
    expect(usableSpot(spots, null)).toBeNull();
  });

  it('lets the phone withdraw only near the ATM', () => {
    const atm = at('atm');
    expect(nearAtm(spots, { x: atm.pos.x + 1, y: 0, z: atm.pos.z })).toBe(true);
    expect(nearAtm(spots, { x: atm.pos.x + 10, y: 0, z: atm.pos.z })).toBe(false);
    expect(nearAtm(spots, null)).toBe(false);
  });

  it('names the goal the gate would start, from the goal label', () => {
    expect(gateGoalLabel(2, [{ id: 'buggy', status: 'pending' }, { id: 'lunch', status: 'pending' }])).toBe('Buggy race in Agafay');
    expect(gateGoalLabel(2, [{ id: 'buggy', status: 'done' }, { id: 'lunch', status: 'pending' }])).toBeNull();
    expect(gateGoalLabel(1, [{ id: 'tajine', status: 'done' }, { id: 'primegolf', status: 'pending' }])).toBe('Play PrimeGolf');
    expect(gateGoalLabel(99, [])).toBeNull();
    expect(spotPrompt('gate', false, 'Buggy race in Agafay')).toBe('F: Buggy race in Agafay');
    expect(spotPrompt('gate', false)).not.toContain('Lodgy');
  });
});
