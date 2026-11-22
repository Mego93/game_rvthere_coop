import { describe, expect, it } from 'vitest';
import { worldVehicleId } from './worldVehicle';

describe('worldVehicleId', () => {
  it('is the buggy in the story race and at the camp', () => {
    expect(worldVehicleId('agafay', 'lodgy', true)).toBe('buggy');
    expect(worldVehicleId('camp', 'rv', true)).toBe('buggy');
  });

  it('is the lobby vehicle everywhere else', () => {
    expect(worldVehicleId('villa', 'lodgy', true)).toBe('lodgy');
    expect(worldVehicleId('desert', 'rv', true)).toBe('rv');
    expect(worldVehicleId('marrakech', 'lodgy', false)).toBe('lodgy');
  });

  it('never gives the buggy to a plain race, even on the story-only course ids', () => {
    expect(worldVehicleId('agafay', 'lodgy', false)).toBe('lodgy');
  });
});
