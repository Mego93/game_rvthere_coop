import { describe, expect, it } from 'vitest';
import { BUBBLE_SECONDS, bubbleUp, wrapText } from './speechText';

describe('wrapText', () => {
  it('wraps at spaces within the width', () => {
    expect(wrapText('It is 38 degrees and the sun has no off switch.', 20)).toEqual(['It is 38 degrees and', 'the sun has no off', 'switch.']);
  });

  it('keeps a long word whole and drops extra spaces', () => {
    expect(wrapText('  a   supercalifragilistic  b ', 8)).toEqual(['a', 'supercalifragilistic', 'b']);
    expect(wrapText('', 10)).toEqual([]);
  });
});

describe('bubbleUp', () => {
  it('shows a bubble for four seconds', () => {
    expect(BUBBLE_SECONDS).toBe(4);
    expect(bubbleUp(10, 10)).toBe(true);
    expect(bubbleUp(10, 13.9)).toBe(true);
    expect(bubbleUp(10, 14)).toBe(false);
    // A frame's timestamp can be a few ms older than the message that made the bubble.
    expect(bubbleUp(10, 9.99)).toBe(true);
  });
});
