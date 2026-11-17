export const GROUP_WORLD = 0x0001;
export const GROUP_PLAYER = 0x0002;
export const GROUP_GROUND = 0x0004;
export const GROUP_STATIC = 0x0008;
export const GROUP_ITEM = 0x0010;
// Animals touch nothing in the simulation; the hit check finds them with a query.
export const GROUP_ANIMAL = 0x0020;

export function groups(membership: number, filter: number): number {
  return ((membership << 16) | filter) >>> 0;
}
