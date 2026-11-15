import { describe, expect, test } from 'vitest';
import { isSoftwareRenderer, pixelRatioFor, SOFTWARE_PIXEL_RATIO } from './renderScale';

describe('renderScale', () => {
  test('software renderers are recognised, GPUs are not', () => {
    expect(isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBe(true);
    expect(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(isSoftwareRenderer('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)')).toBe(false);
    expect(isSoftwareRenderer('')).toBe(false);
  });

  test('the pixel ratio is the device ratio capped at 2, or half on software GL unless full resolution is asked for', () => {
    expect(pixelRatioFor(3, 'NVIDIA', false)).toBe(2);
    expect(pixelRatioFor(1, 'NVIDIA', false)).toBe(1);
    expect(pixelRatioFor(1, 'SwiftShader', false)).toBe(SOFTWARE_PIXEL_RATIO);
    expect(pixelRatioFor(2, 'SwiftShader', true)).toBe(2);
  });
});
