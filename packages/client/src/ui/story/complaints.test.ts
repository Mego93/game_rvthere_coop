import { COMPLAINT_COUNT } from '@lodgy/shared';
import { describe, expect, it } from 'vitest';
import { COMPLAINTS, complaintText } from './complaints';

describe('complaints', () => {
  it('has as many lines as the server picks from, all different and short enough for a bubble', () => {
    expect(COMPLAINTS).toHaveLength(COMPLAINT_COUNT);
    expect(COMPLAINT_COUNT).toBe(12);
    expect(new Set(COMPLAINTS).size).toBe(12);
    for (const line of COMPLAINTS) {
      expect(line.length, line).toBeGreaterThan(10);
      expect(line.length, line).toBeLessThanOrEqual(70);
    }
  });

  it('never insults anyone', () => {
    for (const line of COMPLAINTS) expect(line, line).not.toMatch(/stupid|idiot|dumb|hate|dirty|lazy|moroccans/i);
  });

  it('picks a line by index and wraps one out of range', () => {
    expect(complaintText(0)).toBe(COMPLAINTS[0]);
    expect(complaintText(11)).toBe(COMPLAINTS[11]);
    expect(complaintText(12)).toBe(COMPLAINTS[0]);
    expect(complaintText(-1)).toBe(COMPLAINTS[11]);
  });
});
