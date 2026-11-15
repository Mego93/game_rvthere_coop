// Software GL (SwiftShader, llvmpipe) fills pixels on the CPU; the lit, shadowed scene is too slow at full size there.
export function isSoftwareRenderer(description: string): boolean {
  return /swiftshader|llvmpipe|software/i.test(description);
}

export const SOFTWARE_PIXEL_RATIO = 0.35;

export function pixelRatioFor(devicePixelRatio: number, description: string, fullResolution: boolean): number {
  if (!fullResolution && isSoftwareRenderer(description)) return SOFTWARE_PIXEL_RATIO;
  return Math.min(devicePixelRatio, 2);
}
