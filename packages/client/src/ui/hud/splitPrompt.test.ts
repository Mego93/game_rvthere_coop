import { describe, expect, it } from 'vitest';
import { splitPrompt } from './splitPrompt';

describe('splitPrompt', () => {
  it('T1 E to board', () => {
    expect(splitPrompt('E to board')).toEqual([{ key: 'E', hold: false, text: 'board' }]);
  });
  it('splits the reset hint', () => {
    expect(splitPrompt('Hold X to reset (60 s penalty)')).toEqual([{ key: 'X', hold: true, text: 'reset (60 s penalty)' }]);
    expect(splitPrompt('Hold Reset to reset')).toEqual([{ key: 'Reset', hold: true, text: 'reset' }]);
  });
  it('T2 Hold F to refuel', () => {
    expect(splitPrompt('Hold F to refuel')).toEqual([{ key: 'F', hold: true, text: 'refuel' }]);
  });
  it('T3 two touch parts', () => {
    expect(splitPrompt('Act to board   Hold Use to refuel')).toEqual([
      { key: 'Act', hold: false, text: 'board' },
      { key: 'Use', hold: true, text: 'refuel' },
    ]);
  });
  it('T4 unrecognised text and empty string give key null', () => {
    expect(splitPrompt('Press E to board')).toEqual([{ key: null, hold: false, text: 'Press E to board' }]);
    expect(splitPrompt('')).toEqual([{ key: null, hold: false, text: '' }]);
  });
  it('T4 keeps a name containing E in the text', () => {
    expect(splitPrompt('Hold F to revive Eve')).toEqual([{ key: 'F', hold: true, text: 'revive Eve' }]);
  });
  it('R4 matches every pattern', () => {
    for (const [pre, key, hold] of [
      ['E to ', 'E', false], ['F to ', 'F', false], ['Hold E to ', 'E', true], ['Hold F to ', 'F', true],
      ['Act to ', 'Act', false], ['Use to ', 'Use', false], ['Hold Act to ', 'Act', true], ['Hold Use to ', 'Use', true],
    ] as const) {
      expect(splitPrompt(`${pre}go`)).toEqual([{ key, hold, text: 'go' }]);
    }
  });
  it('R4 collapses longer runs of spaces and ignores empty parts', () => {
    expect(splitPrompt('E to board     F to  refuel')).toEqual([
      { key: 'E', hold: false, text: 'board' },
      { key: 'F', hold: false, text: 'refuel' },
    ]);
  });
});
