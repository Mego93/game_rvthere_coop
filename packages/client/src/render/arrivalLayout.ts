// The arrival's dressing, in the course's frame (x east, z south, the route runs toward -z). The shared course owns the collision boxes; these are the visuals set on them.

// The rental stand is the course's wall box beside the stop: x -12.5 to -10.5, z -254 to -246, 3.5 m high. Three ticket booths side by side fill it, windows toward the stop.
export const RENTAL_BOX = { x0: -12.5, x1: -10.5, z0: -254, z1: -246, height: 3.5 };
export const BOOTH_COUNT = 3;
export const RENTAL_SIGN = { text: 'Car Rental', width: 7, height: 1.3, y: 3.6 };

// The terminal behind the start wall, facade toward the hall; and one along the hall's left side, facade toward the hall.
export const TERMINAL = { width: 23.8, height: 9.8, depth: 15.8 };
export const TERMINAL_PLACES: readonly { x: number; z: number; yaw: number }[] = [
  { x: 0, z: 6.4 + TERMINAL.depth / 2, yaw: 0 },
  { x: -9.4 - TERMINAL.depth / 2, z: -52, yaw: -Math.PI / 2 },
];

// Lamp posts beside the plaza's fences, every LAMP_SPACING m.
export const LAMP_SPACING = 30;
export const LAMP_OFFSET = 1.6;
export const PLAZA_EDGE = 14;
export const PLAZA_FROM = -112;
export const PLAZA_TO = -268;

export interface Booth {
  x: number;
  z: number;
  // Along z.
  length: number;
}

export function booths(): Booth[] {
  const length = (RENTAL_BOX.z1 - RENTAL_BOX.z0) / BOOTH_COUNT;
  return Array.from({ length: BOOTH_COUNT }, (_, i) => ({ x: (RENTAL_BOX.x0 + RENTAL_BOX.x1) / 2, z: RENTAL_BOX.z0 + (i + 0.5) * length, length }));
}

export function lampPosts(): { x: number; z: number }[] {
  const posts: { x: number; z: number }[] = [];
  for (let z = PLAZA_FROM - 10; z > PLAZA_TO + 6; z -= LAMP_SPACING) for (const side of [-1, 1]) posts.push({ x: side * (PLAZA_EDGE + LAMP_OFFSET), z });
  return posts;
}

// White bars across the pedestrian lane, which runs from z -112 to -178 between fences at x +-7.
export const CROSSING = { x: 7, from: -118, to: -172, bar: 0.5, gap: 0.9 };

export function crossingBars(): number[] {
  const bars: number[] = [];
  for (let z = CROSSING.from; z > CROSSING.to; z -= CROSSING.bar + CROSSING.gap) bars.push(z);
  return bars;
}
