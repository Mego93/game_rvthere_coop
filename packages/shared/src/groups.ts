export const GROUP_WORLD = 0x0001;
export const GROUP_PLAYER = 0x0002;

export function groups(membership: number, filter: number): number {
  return ((membership << 16) | filter) >>> 0;
}
