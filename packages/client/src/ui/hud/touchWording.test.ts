import { describe, expect, test } from 'vitest';
import { touchWording } from './touchWording';

describe('touchWording (T8, K1)', () => {
  test('interact hint', () => {
    expect(touchWording('E to board')).toBe('Act to board');
  });
  test('hold interact hint', () => {
    expect(touchWording('Hold E to refuel')).toBe('Hold Act to refuel');
  });
  test('hold use hint', () => {
    expect(touchWording('Hold F to heal yourself')).toBe('Hold Use to heal yourself');
  });
  test('reset hint', () => {
    expect(touchWording('Hold X to reset (60 s penalty)')).toBe('Hold Reset to reset (60 s penalty)');
  });
  test('other text is unchanged', () => {
    expect(touchWording('Press E to board')).toBe('Press E to board');
    expect(touchWording('')).toBe('');
  });
  test('only the start of the string is replaced', () => {
    expect(touchWording('E to pick up the jerrycan')).toBe('Act to pick up the jerrycan');
    expect(touchWording('Hold F to revive Eve')).toBe('Hold Use to revive Eve');
  });
});
