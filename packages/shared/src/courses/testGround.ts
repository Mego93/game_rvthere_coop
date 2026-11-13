import { COIN_HEIGHT, REFERENCE_SLOPES_DEG, type ReferenceSlope, type Surface } from '../constants';
import type { BuiltCourse, GroundBox } from '../course';
import { AXIS_X, IDENTITY, add, deepFreeze, degToRad, quatFromAxisAngle, rotate, vec3, type Pose, type Vec3 } from '../math';

const RAMP_THICKNESS = 0.5;

// A ramp whose lower edge sits at `start` on the ground and which rises toward -Z.
function ramp(start: Vec3, angleDeg: number, halfWidth: number, length: number, surface: Surface): GroundBox {
  const rot = quatFromAxisAngle(AXIS_X, degToRad(angleDeg));
  const center = add(start, rotate(rot, vec3(0, -RAMP_THICKNESS / 2, -length / 2)));
  return { center, halfExtents: vec3(halfWidth, RAMP_THICKNESS / 2, length / 2), rot, surface };
}

export const SLOPE_LENGTH = 40;
const SLOPE_START_Z = -20;
const SLOPE_X: Record<ReferenceSlope, number> = { gentle: -20, medium: -30, steep: -40 };

// A pose on the surface of a reference slope, `along` metres up from its lower edge, facing uphill.
export function slopePose(slope: ReferenceSlope, along: number): Pose {
  const rot = quatFromAxisAngle(AXIS_X, degToRad(REFERENCE_SLOPES_DEG[slope]));
  const start = vec3(SLOPE_X[slope], 0, SLOPE_START_Z);
  return { pos: add(start, rotate(rot, vec3(0, 0, -along))), rot };
}

const slopes: GroundBox[] = (Object.keys(SLOPE_X) as ReferenceSlope[]).map((slope) =>
  ramp(vec3(SLOPE_X[slope], 0, SLOPE_START_Z), REFERENCE_SLOPES_DEG[slope], 4, SLOPE_LENGTH, 'road'),
);

export const SAND_PATCH_CENTER = vec3(20, 0, -30);

export const testGround: BuiltCourse = deepFreeze({
  id: 'test',
  ground: [
    { center: vec3(0, -0.5, -200), halfExtents: vec3(150, 0.5, 250), rot: IDENTITY, surface: 'road' },
    // A thin slab on top of the road, so wheel rays hit sand first.
    { center: vec3(SAND_PATCH_CENTER.x, 0.02, SAND_PATCH_CENTER.z), halfExtents: vec3(8, 0.02, 15), rot: IDENTITY, surface: 'sand' },
    ramp(vec3(8, 0, -60), 12, 3, 6, 'road'),
    ...slopes,
  ],
  walls: [],
  props: [
    { id: 'crate-1', kind: 'crate', pose: { pos: vec3(10, 0, 8), rot: IDENTITY } },
    { id: 'crate-2', kind: 'crate', pose: { pos: vec3(10, 0, 9.5), rot: IDENTITY } },
    { id: 'crate-3', kind: 'crate', pose: { pos: vec3(10, 0, 11), rot: IDENTITY } },
    { id: 'barrier-1', kind: 'barrier', pose: { pos: vec3(-10, 0, 10), rot: IDENTITY } },
  ],
  pickups: [
    { id: 'jerrycan-1', kind: 'jerrycan', pose: { pos: vec3(-4, 0, 14), rot: IDENTITY } },
    { id: 'jerrycan-2', kind: 'jerrycan', pose: { pos: vec3(-3, 0, 14), rot: IDENTITY } },
    { id: 'toolbox-1', kind: 'toolbox', pose: { pos: vec3(-2, 0, 14), rot: IDENTITY } },
    { id: 'healthKit-1', kind: 'healthKit', pose: { pos: vec3(-1, 0, 14), rot: IDENTITY } },
  ],
  anchors: [
    { id: 'anchor-1', kind: 'milestone', pose: { pos: vec3(-40, 0, -70), rot: IDENTITY } },
    { id: 'anchor-2', kind: 'milestone', pose: { pos: slopePose('steep', 39).pos, rot: IDENTITY } },
    { id: 'anchor-3', kind: 'milestone', pose: { pos: vec3(SAND_PATCH_CENTER.x, 0, SAND_PATCH_CENTER.z - 25), rot: IDENTITY } },
  ],
  stops: [],
  coins: [
    { id: 'coin-1', kind: 'coin', pose: { pos: vec3(3, COIN_HEIGHT, -12), rot: IDENTITY } },
    { id: 'coin-2', kind: 'coin', pose: { pos: vec3(-3, COIN_HEIGHT, -28), rot: IDENTITY } },
    { id: 'coin-3', kind: 'coin', pose: { pos: vec3(6, COIN_HEIGHT, -36), rot: IDENTITY } },
    { id: 'coin-4', kind: 'coin', pose: { pos: vec3(-6, COIN_HEIGHT, -44), rot: IDENTITY } },
  ],
  decor: [],
  checkpoints: [
    {
      id: 'cp-0',
      trigger: { center: vec3(0, 2, 0), halfExtents: vec3(6, 2, 6), rot: IDENTITY },
      spawn: { pos: vec3(0, 0, 0), rot: IDENTITY },
    },
    {
      id: 'cp-1',
      trigger: { center: vec3(0, 2, -50), halfExtents: vec3(10, 2, 2), rot: IDENTITY },
      spawn: { pos: vec3(0, 0, -50), rot: IDENTITY },
    },
  ],
  route: [
    [0, 0],
    [0, -100],
  ],
  finish: { center: vec3(0, 2, -100), halfExtents: vec3(10, 2, 2), rot: IDENTITY },
  killPlaneY: -20,
  targetTime: 120,
});
