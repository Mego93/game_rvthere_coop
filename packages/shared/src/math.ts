export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Pose {
  pos: Vec3;
  rot: Quat;
}

// Shared data is frozen: one server process runs many rooms, and none may alter what the others read.
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const IDENTITY: Quat = deepFreeze({ x: 0, y: 0, z: 0, w: 1 });
export const AXIS_X: Vec3 = deepFreeze({ x: 1, y: 0, z: 0 });
export const AXIS_Y: Vec3 = deepFreeze({ x: 0, y: 1, z: 0 });

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => vec3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => vec3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, s: number): Vec3 => vec3(a.x * s, a.y * s, a.z * s);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
// The point a fraction t of the way from a to b.
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(angle / 2) };
}

export function quatMul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function rotate(q: Quat, v: Vec3): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

// The rotation a fraction t of the way from a to b, by the shorter way round. Accurate enough between two snapshots.
export function nlerp(a: Quat, b: Quat, t: number): Quat {
  // q and -q are the same rotation; blending toward the nearer one avoids going the long way.
  const sign = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1;
  const x = a.x + (sign * b.x - a.x) * t;
  const y = a.y + (sign * b.y - a.y) * t;
  const z = a.z + (sign * b.z - a.z) * t;
  const w = a.w + (sign * b.w - a.w) * t;
  const norm = Math.sqrt(x * x + y * y + z * z + w * w);
  return { x: x / norm, y: y / norm, z: z / norm, w: w / norm };
}

// Yaw 0 faces -Z; positive yaw turns left (toward -X).
export function yawOf(q: Quat): number {
  const f = rotate(q, vec3(0, 0, -1));
  return Math.atan2(-f.x, -f.z);
}
