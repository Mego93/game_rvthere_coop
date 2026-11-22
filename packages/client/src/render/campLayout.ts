// The desert camp's dressing, in the course's frame (x east, z south). The shared course owns every collision box: a 40 x 30 m clearing with a tent in the north (x -8 to 8, z -13 to -3, its door in the south wall) and the low table at (0, -8).

export const CAMP = {
  half: { x: 20, z: 15 },
  tent: { x0: -8, x1: 8, z0: -13, z1: -3 },
  door: { x0: -2, x1: 2 },
  // The tent floor's top, and the walls' height.
  floor: 0.05,
  wall: 3,
};

export const TABLE = { x: 0, z: -8, diameter: 1.7, height: 0.5 };
// The rug under the table, and the cushions round it.
export const RUG = { x: 0, z: -8, width: 6.4, depth: 6.4 };
export const CUSHION = { size: 0.85, thick: 0.14, radius: 1.75, count: 6 };

export interface Cushion {
  x: number;
  z: number;
  // The turn about y that points a cushion's front at the table (the front is -z in the file's frame).
  yaw: number;
}

export function cushions(): Cushion[] {
  return Array.from({ length: CUSHION.count }, (_, i) => {
    const angle = (i / CUSHION.count) * Math.PI * 2 + Math.PI / CUSHION.count;
    const x = TABLE.x + Math.sin(angle) * CUSHION.radius;
    const z = TABLE.z + Math.cos(angle) * CUSHION.radius;
    return { x, z, yaw: Math.atan2(TABLE.x - x, TABLE.z - z) + Math.PI };
  });
}

export interface CamelPlace {
  x: number;
  z: number;
  yaw: number;
  height: number;
}

// Three camels outside the tent, in the corners of the clearing and away from the walking lane between the buggy and the door.
export const CAMELS: readonly CamelPlace[] = [
  { x: -14.5, z: 9, yaw: 0.6, height: 2.3 },
  { x: 14, z: 10.5, yaw: -2.4, height: 2.2 },
  { x: 14.5, z: -7, yaw: 3.4, height: 2.35 },
];

// Palms and rocks outside the fence, so the clearing has a horizon.
export const OUTSIDE: readonly { key: string; x: number; z: number; size: number }[] = [
  { key: 'decor.palm.b', x: -25, z: -10, size: 9 },
  { key: 'decor.palm.a', x: -24, z: 6, size: 7 },
  { key: 'decor.palm.e', x: 26, z: -6, size: 9 },
  { key: 'decor.palm.c', x: 25, z: 9, size: 7 },
  { key: 'decor.palm.d', x: -8, z: -21, size: 5.5 },
  { key: 'decor.palm.a', x: 12, z: -22, size: 7 },
  { key: 'decor.rock.large.a', x: -22, z: 20, size: 4 },
  { key: 'decor.rock.large.b', x: 20, z: 21, size: 4.5 },
  { key: 'decor.rock.tall.a', x: 4, z: 23, size: 5 },
  { key: 'decor.cactus.tall', x: -26, z: -2, size: 2.8 },
  { key: 'decor.cactus.short', x: 23, z: 1, size: 1.2 },
];
