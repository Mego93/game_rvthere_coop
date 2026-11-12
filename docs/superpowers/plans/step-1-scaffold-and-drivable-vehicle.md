# Step 1: Scaffold and Drivable Vehicle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A TypeScript workspace in which either vehicle (Lodgy or RV) can be driven around a test ground in one browser tab, with the simulation running locally in the page, plus measured starting values for the winch cable.

**Architecture:** `packages/shared` holds the whole simulation as pure code that receives an initialised Rapier module; it knows nothing about the browser. `packages/client` is a Vite app that creates a `shared` world, steps it at a fixed 60 Hz from keyboard input, and draws it with Three.js. There is no server yet (step 2).

**Tech Stack:** Node 22+, npm workspaces, TypeScript 7.0.2, Vitest 5.1.0, `@dimforge/rapier3d-compat` 0.21.0, Three.js 0.187.0, Vite 8.3.8.

**Spec:** `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`, build step 1.

**Status of this plan's code:** every file below was drafted and run in a scratch workspace before the plan was written (clean install, 57 tests passing, typecheck clean, production build succeeding, page driven in a real browser). Copy the code exactly. If something fails that the plan says should pass, stop and report; do not improvise a fix.

## Global Constraints

- Use npm only. Dependency versions are exact, as written in each `package.json` below. Do not add, remove or upgrade a dependency.
- TypeScript strict mode, ES modules. Imports between files in a package have no file extension.
- Units are metres, seconds, kilograms, radians. Axes are right-handed with +Y up. Forward is −Z and right is +X in a vehicle's local frame. Yaw is rotation about +Y; yaw 0 faces −Z; positive yaw turns left.
- The simulation tick is fixed at 1/60 s.
- `shared` never loads WebAssembly. The caller runs `await RAPIER.init()` and passes the module in.
- The simulation uses no randomness and no wall clock.
- Every tuning number lives in `packages/shared/src/constants.ts` or `packages/shared/src/vehicles.ts`. Do not change any of them, and do not change the target numbers in `scenarios.test.ts`: they are the owner's to tune.
- Comments explain only a non-obvious why, in one line. No docblocks.
- Commits use Conventional Commits with a required scope: `<type>(<scope>): <description>`, ending with the line `Co-Authored-By: Claude <noreply@anthropic.com>`. Scopes used here: `repo`, `shared`, `client`, `experiments`, `spec`, `roadmap`.
- Never commit `.env*`, keys, tokens or cookies files.
- Write each test before the code it covers, and watch it fail first.
- If the plan and the spec do not answer a question, stop and report it. Do not guess.

## File Structure

```
package.json                  workspace root, scripts
tsconfig.base.json            compiler options
tsconfig.json                 what gets typechecked
vitest.config.ts              test discovery
.gitignore
packages/shared/
  package.json
  src/
    index.ts                  re-exports everything public
    rapier.ts                 the Rapier type the caller passes in
    math.ts                   Vec3, Quat, Pose and helpers
    constants.ts              tick, gravity, surfaces, reference slopes, winch values
    protocol.ts               PlayerInput
    course.ts                 BuiltCourse and its parts (types only)
    courses/testGround.ts     the hand-written test course
    courses/index.ts          course registry
    statics.ts                turns a BuiltCourse into fixed colliders
    vehicles.ts               Lodgy and RV configs
    vehicle.ts                raycast vehicle driven by a config
    testRig.ts                a vehicle on the test ground, for tests and experiments
    world.ts                  createWorld: the simulation's public entry point
    *.test.ts                 beside the file each one covers
packages/client/
  package.json
  vite.config.ts
  index.html
  src/
    main.ts                   wires everything together
    loop.ts                   fixed-step accumulator
    input/source.ts           InputSource interface
    input/keyboard.ts         keyboard implementation
    render/scene.ts           course meshes and lights
    render/vehicleMesh.ts     vehicle drawn as boxes
    render/followCamera.ts    camera behind the vehicle
    ui/overlay.ts             debug text
experiments/
  vitest.config.ts
  cable/cable.experiment.ts   throwaway winch cable sweep
  cable/RESULTS.md
```

## Deliberate limits of this step

These are decisions, not omissions. Do not "fix" them.

- The test ground has ground, a sand patch, a small ramp, three reference slopes, one anchor, two checkpoints and a finish. Props, the heavy obstacle, service stops and coins are added by the later steps that first simulate them.
- `BuiltCourse.ground` holds boxes only. Heightfields arrive with the segment system.
- `VehicleConfig` has no seats, doors or spawn slots yet (step 3), and no fuel or health (step 7).
- `world.step` drives the vehicle from the first input in the map. Seats replace this in step 3.
- The camera simply follows the vehicle. Mouse look and the crosshair arrive in step 3.
- All four wheels are driven on both vehicles.
- A braked vehicle on a steep slope creeps slowly (under 0.1 m/s). This is how the wheel model behaves, and a test bounds it.

---

### Task 1: Workspace scaffold

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `packages/shared/package.json`, `packages/shared/src/rapier.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/src/rapier.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the commands `npm test`, `npm run typecheck`; the type `Rapier` (the initialised `@dimforge/rapier3d-compat` module), `RapierWorld`, `RigidBody`, exported from `@lodgy/shared`.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b step-1-scaffold-and-drivable-vehicle
```

- [ ] **Step 2: Create the root files**

`package.json`:

```json
{
  "name": "lodgy-coop",
  "private": true,
  "type": "module",
  "workspaces": [
    "packages/*"
  ],
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json",
    "dev": "npm run dev -w @lodgy/client",
    "build": "npm run build -w @lodgy/client",
    "experiment:cable": "vitest run --config experiments/vitest.config.ts --reporter=verbose"
  },
  "devDependencies": {
    "typescript": "7.0.2",
    "vitest": "5.1.0"
  }
}
```

The `dev`, `build` and `experiment:cable` scripts refer to things later tasks create.

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": [
      "ES2022",
      "DOM",
      "DOM.Iterable"
    ],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

`tsconfig.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "include": [
    "packages/*/src/**/*.ts",
    "packages/*/vite.config.ts",
    "experiments/**/*.ts",
    "vitest.config.ts"
  ]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['packages/*/src/**/*.test.ts'], environment: 'node' },
});
```

`.gitignore`:

```gitignore
node_modules/
dist/
*.tsbuildinfo
.DS_Store
.playwright-mcp/

# Secrets: never commit
.env
.env.*
*.pem
*.key
*.p12
token.json
service-account*.json
cookies.txt
*-cookies*.txt
```

- [ ] **Step 3: Create the shared package manifest**

`packages/shared/package.json`:

```json
{
  "name": "@lodgy/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@dimforge/rapier3d-compat": "0.21.0"
  }
}
```

`exports` points at the TypeScript source on purpose: Vite and Vitest compile it directly, so there is no build step for `shared`.

- [ ] **Step 4: Install**

Run: `npm install`
Expected: completes without errors and creates `package-lock.json`.

- [ ] **Step 5: Write the failing test**

`packages/shared/src/rapier.test.ts`:

```ts
import RAPIER from '@dimforge/rapier3d-compat';
import { expect, test } from 'vitest';
import type { Rapier } from './rapier';

test('Rapier initialises and an empty world steps', async () => {
  await RAPIER.init();
  const rapier: Rapier = RAPIER;
  const world = new rapier.World({ x: 0, y: -9.81, z: 0 });
  world.step();
  expect(world.bodies.len()).toBe(0);
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL, because `./rapier` cannot be resolved.

- [ ] **Step 7: Write the implementation**

`packages/shared/src/rapier.ts`:

```ts
import type RAPIER from '@dimforge/rapier3d-compat';

// The initialised Rapier module. Callers run `await RAPIER.init()` and pass it in; shared never loads it.
export type Rapier = typeof RAPIER;
export type RapierWorld = RAPIER.World;
export type RigidBody = RAPIER.RigidBody;
```

`packages/shared/src/index.ts`:

```ts
export * from './rapier';
```

- [ ] **Step 8: Run the checks**

Run: `npm test`
Expected: 1 test file, 1 test, passing.

Run: `npm run typecheck`
Expected: exits 0 with no output after the script banner.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json tsconfig.json vitest.config.ts .gitignore packages/shared
git commit -m "chore(repo): scaffold npm workspace with shared package

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Math, constants and input type

**Files:**
- Create: `packages/shared/src/math.ts`, `packages/shared/src/constants.ts`, `packages/shared/src/protocol.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/math.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, from `math.ts`: types `Vec3 {x,y,z}`, `Quat {x,y,z,w}`, `Pose {pos, rot}`; constants `IDENTITY`, `AXIS_X`, `AXIS_Y`; functions `vec3(x,y,z)`, `add`, `sub`, `scale(v, s)`, `dot`, `length`, `clamp(v, lo, hi)`, `degToRad`, `quatFromAxisAngle(axis, angle)`, `quatMul(a, b)`, `rotate(q, v)`, `yawOf(q)`.
- Produces, from `constants.ts`: `TICK_RATE`, `TICK_DT`, `GRAVITY` (positive, 9.81), `MAX_CATCHUP_STEPS`, type `Surface`, `SURFACES`, `REFERENCE_SLOPES_DEG`, type `ReferenceSlope`.
- Produces, from `protocol.ts`: `PlayerInput`, `InputFields` (`PlayerInput` without `seq`), `NEUTRAL_INPUT`.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/math.test.ts`:

```ts
import { expect, test } from 'vitest';
import { AXIS_X, AXIS_Y, IDENTITY, quatFromAxisAngle, quatMul, rotate, vec3, yawOf } from './math';

test('identity rotation leaves a vector unchanged', () => {
  expect(rotate(IDENTITY, vec3(1, 2, 3))).toEqual(vec3(1, 2, 3));
});

test('positive yaw turns forward (-Z) toward -X', () => {
  const f = rotate(quatFromAxisAngle(AXIS_Y, Math.PI / 2), vec3(0, 0, -1));
  expect(f.x).toBeCloseTo(-1);
  expect(f.z).toBeCloseTo(0);
});

test('yawOf recovers the yaw angle', () => {
  expect(yawOf(quatFromAxisAngle(AXIS_Y, 0.5))).toBeCloseTo(0.5);
  expect(yawOf(quatFromAxisAngle(AXIS_Y, -1.2))).toBeCloseTo(-1.2);
});

test('positive rotation about +X raises the -Z end', () => {
  const f = rotate(quatFromAxisAngle(AXIS_X, 0.3), vec3(0, 0, -1));
  expect(f.y).toBeCloseTo(Math.sin(0.3));
  expect(f.z).toBeCloseTo(-Math.cos(0.3));
});

test('quatMul applies the right-hand rotation first', () => {
  const yaw = quatFromAxisAngle(AXIS_Y, Math.PI / 2);
  const pitch = quatFromAxisAngle(AXIS_X, Math.PI / 2);
  const v = rotate(quatMul(yaw, pitch), vec3(0, 0, -1));
  expect(v.x).toBeCloseTo(0);
  expect(v.y).toBeCloseTo(1);
  expect(v.z).toBeCloseTo(0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/shared/src/math.test.ts`
Expected: FAIL, because `./math` cannot be resolved.

- [ ] **Step 3: Write the implementation**

`packages/shared/src/math.ts`:

```ts
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

export const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };
export const AXIS_X: Vec3 = { x: 1, y: 0, z: 0 };
export const AXIS_Y: Vec3 = { x: 0, y: 1, z: 0 };

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => vec3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => vec3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, s: number): Vec3 => vec3(a.x * s, a.y * s, a.z * s);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const degToRad = (deg: number): number => (deg * Math.PI) / 180;

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

// Yaw 0 faces -Z; positive yaw turns left (toward -X).
export function yawOf(q: Quat): number {
  const f = rotate(q, vec3(0, 0, -1));
  return Math.atan2(-f.x, -f.z);
}
```

`packages/shared/src/constants.ts`:

```ts
export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;
export const GRAVITY = 9.81;
export const MAX_CATCHUP_STEPS = 5;

export type Surface = 'road' | 'sand' | 'riverbed' | 'gravel';

// grip multiplies the vehicle's tyre grip; rolling is resistance as a fraction of the vehicle's weight.
export const SURFACES: Record<Surface, { grip: number; rolling: number }> = {
  road: { grip: 1, rolling: 0.015 },
  gravel: { grip: 0.8, rolling: 0.05 },
  riverbed: { grip: 0.7, rolling: 0.15 },
  sand: { grip: 0.6, rolling: 0.25 },
};

export const REFERENCE_SLOPES_DEG = { gentle: 8, medium: 15, steep: 25 } as const;
export type ReferenceSlope = keyof typeof REFERENCE_SLOPES_DEG;
```

`packages/shared/src/protocol.ts`:

```ts
export interface PlayerInput {
  seq: number;
  moveX: number;
  moveY: number;
  yaw: number;
  pitch: number;
  jump: boolean;
  interact: boolean;
  use: boolean;
  reel: -1 | 0 | 1;
  slot: 0 | 1 | 2;
  drop: boolean;
}

export type InputFields = Omit<PlayerInput, 'seq'>;

export const NEUTRAL_INPUT: InputFields = {
  moveX: 0,
  moveY: 0,
  yaw: 0,
  pitch: 0,
  jump: false,
  interact: false,
  use: false,
  reel: 0,
  slot: 0,
  drop: false,
};
```

`constants.ts` and `protocol.ts` hold only data and types, so they have no test of their own; later tasks exercise them.

Replace `packages/shared/src/index.ts` with:

```ts
export * from './constants';
export * from './math';
export * from './protocol';
export * from './rapier';
```

- [ ] **Step 4: Run the checks**

Run: `npm test`
Expected: 2 test files, 6 tests, passing.

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add math helpers, constants and input type

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Built course, test ground and static colliders

**Files:**
- Create: `packages/shared/src/course.ts`, `packages/shared/src/courses/testGround.ts`, `packages/shared/src/courses/index.ts`, `packages/shared/src/statics.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/courses/testGround.test.ts`

**Interfaces:**
- Consumes: `math.ts`, `constants.ts`, `rapier.ts` from Tasks 1 and 2.
- Produces, from `course.ts`: types `Box {center, halfExtents, rot}`, `GroundBox` (a `Box` with `surface`), `Placed {id, kind, pose}`, `ServiceStop`, `Checkpoint {id, trigger, spawn}`, `BuiltCourse`.
- Produces, from `courses/testGround.ts`: `testGround: BuiltCourse` (id `'test'`), `slopePose(slope: ReferenceSlope, along: number): Pose`, `SLOPE_LENGTH`, `SAND_PATCH_CENTER`.
- Produces, from `courses/index.ts`: `getCourse(courseId: string): BuiltCourse`, which throws `Unknown course: <id>`.
- Produces, from `statics.ts`: `buildStatics(rapier, world, course): Statics`, where `Statics.surfaceOf(colliderHandle: number): Surface | null`.

A checkpoint's `spawn` is a pose on the ground. Whoever spawns a vehicle there raises it by the vehicle's ride height.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/courses/testGround.test.ts`:

```ts
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, test } from 'vitest';
import { GRAVITY, REFERENCE_SLOPES_DEG, type ReferenceSlope } from '../constants';
import { degToRad } from '../math';
import { buildStatics } from '../statics';
import { getCourse } from './index';
import { SAND_PATCH_CENTER, slopePose, testGround } from './testGround';

beforeAll(async () => {
  await RAPIER.init();
});

function build() {
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  const statics = buildStatics(RAPIER, world, testGround);
  world.step();
  return { world, statics };
}

// Casts straight down from 1 m above the point; returns the hit distance and surface.
function probe(x: number, y: number, z: number) {
  const { world, statics } = build();
  const hit = world.castRay(new RAPIER.Ray({ x, y: y + 1, z }, { x: 0, y: -1, z: 0 }), 50, true);
  if (!hit) return null;
  return { distance: hit.timeOfImpact, surface: statics.surfaceOf(hit.collider.handle) };
}

test('the registry returns the test ground and rejects unknown ids', () => {
  expect(getCourse('test')).toBe(testGround);
  expect(() => getCourse('nope')).toThrow('Unknown course: nope');
});

test('has at least two checkpoints and a finish', () => {
  expect(testGround.checkpoints.length).toBeGreaterThanOrEqual(2);
  expect(testGround.finish.halfExtents.x).toBeGreaterThan(0);
});

test('every checkpoint spawn pose rests on road', () => {
  for (const cp of testGround.checkpoints) {
    const hit = probe(cp.spawn.pos.x, cp.spawn.pos.y, cp.spawn.pos.z);
    expect(hit, cp.id).not.toBeNull();
    expect(hit!.distance, cp.id).toBeCloseTo(1, 2);
    expect(hit!.surface, cp.id).toBe('road');
  }
});

test('the sand patch reports sand', () => {
  expect(probe(SAND_PATCH_CENTER.x, 0, SAND_PATCH_CENTER.z)!.surface).toBe('sand');
});

test.each(Object.keys(REFERENCE_SLOPES_DEG) as ReferenceSlope[])('the %s slope rises toward -Z at its angle', (slope) => {
  const pose = slopePose(slope, 10);
  expect(pose.pos.y).toBeCloseTo(10 * Math.sin(degToRad(REFERENCE_SLOPES_DEG[slope])));
  const hit = probe(pose.pos.x, pose.pos.y, pose.pos.z);
  expect(hit!.distance).toBeCloseTo(1, 1);
  expect(hit!.surface).toBe('road');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/shared/src/courses/testGround.test.ts`
Expected: FAIL, because `../statics` cannot be resolved.

- [ ] **Step 3: Write the implementation**

`packages/shared/src/course.ts`:

```ts
import type { Surface } from './constants';
import type { Pose, Quat, Vec3 } from './math';

export interface Box {
  center: Vec3;
  halfExtents: Vec3;
  rot: Quat;
}

export interface GroundBox extends Box {
  surface: Surface;
}

// Anything placed in the course. `kind` tells the client what to draw.
export interface Placed {
  id: string;
  kind: string;
  pose: Pose;
}

export interface ServiceStop {
  id: string;
  kind: 'fuel' | 'garage';
  zone: Box;
  operatePoint: Vec3;
  shopCounter: Vec3 | null;
}

export interface Checkpoint {
  id: string;
  trigger: Box;
  // A pose on the ground. The vehicle spawns above it by its ride height.
  spawn: Pose;
}

export interface BuiltCourse {
  id: string;
  ground: GroundBox[];
  walls: Box[];
  props: Placed[];
  pickups: Placed[];
  anchors: Placed[];
  stops: ServiceStop[];
  coins: Placed[];
  decor: Placed[];
  checkpoints: Checkpoint[];
  route: [x: number, z: number][];
  finish: Box;
  killPlaneY: number;
  targetTime: number;
}
```

`packages/shared/src/courses/testGround.ts`:

```ts
import { REFERENCE_SLOPES_DEG, type ReferenceSlope, type Surface } from '../constants';
import type { BuiltCourse, GroundBox } from '../course';
import { AXIS_X, IDENTITY, add, degToRad, quatFromAxisAngle, rotate, vec3, type Pose, type Vec3 } from '../math';

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

export const testGround: BuiltCourse = {
  id: 'test',
  ground: [
    { center: vec3(0, -0.5, -200), halfExtents: vec3(150, 0.5, 250), rot: IDENTITY, surface: 'road' },
    // A thin slab on top of the road, so wheel rays hit sand first.
    { center: vec3(SAND_PATCH_CENTER.x, 0.02, SAND_PATCH_CENTER.z), halfExtents: vec3(8, 0.02, 15), rot: IDENTITY, surface: 'sand' },
    ramp(vec3(8, 0, -60), 12, 3, 6, 'road'),
    ...slopes,
  ],
  walls: [],
  props: [],
  pickups: [],
  anchors: [{ id: 'anchor-1', kind: 'milestone', pose: { pos: vec3(-40, 0, -70), rot: IDENTITY } }],
  stops: [],
  coins: [],
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
};
```

`packages/shared/src/courses/index.ts`:

```ts
import type { BuiltCourse } from '../course';
import { testGround } from './testGround';

const COURSES: Record<string, BuiltCourse> = { [testGround.id]: testGround };

export function getCourse(courseId: string): BuiltCourse {
  const course = COURSES[courseId];
  if (!course) throw new Error(`Unknown course: ${courseId}`);
  return course;
}
```

`packages/shared/src/statics.ts`:

```ts
import type { Surface } from './constants';
import type { Box, BuiltCourse } from './course';
import type { Rapier, RapierWorld } from './rapier';

export interface Statics {
  // The surface of a ground collider, or null if the handle is not ground.
  surfaceOf(colliderHandle: number): Surface | null;
}

export function buildStatics(rapier: Rapier, world: RapierWorld, course: BuiltCourse): Statics {
  const surfaces = new Map<number, Surface>();
  const addBox = (box: Box) =>
    world.createCollider(
      rapier.ColliderDesc.cuboid(box.halfExtents.x, box.halfExtents.y, box.halfExtents.z)
        .setTranslation(box.center.x, box.center.y, box.center.z)
        .setRotation(box.rot)
        .setFriction(1),
    );
  for (const ground of course.ground) surfaces.set(addBox(ground).handle, ground.surface);
  for (const wall of course.walls) addBox(wall);
  return { surfaceOf: (handle) => surfaces.get(handle) ?? null };
}
```

Replace `packages/shared/src/index.ts` with:

```ts
export * from './constants';
export * from './course';
export * from './courses/index';
export * from './math';
export * from './protocol';
export * from './rapier';
export * from './statics';
```

- [ ] **Step 4: Run the checks**

Run: `npm test`
Expected: 3 test files, 13 tests, passing.

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add built course type, test ground and static colliders

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Vehicle configs and the raycast vehicle

**Files:**
- Create: `packages/shared/src/vehicles.ts`, `packages/shared/src/vehicle.ts`, `packages/shared/src/testRig.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/vehicle.test.ts`, `packages/shared/src/scenarios.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 to 3.
- Produces, from `vehicles.ts`: type `VehicleId = 'lodgy' | 'rv'`, `VehicleConfig`, `VEHICLES`, `getVehicleConfig(id: string): VehicleConfig`, which throws `Unknown vehicle: <id>`.
- Produces, from `vehicle.ts`: `VehicleControls {throttle, steer, brake}`, `VehicleState {pos, rot, linvel, throttle, steer}`, `Vehicle {config, body, step(controls), state(), forwardSpeed(), wheelSurfaces()}`, `createVehicle(rapier, world, config, spawn, surfaceOf): Vehicle`.
- Produces, from `testRig.ts`: `createRig(rapier, vehicleId, spawn): Rig`, where `Rig {world, vehicle, run(seconds, controls?)}`. It is not exported from `index.ts`; tests and experiments import it by path.

Three facts about Rapier's vehicle controller that the code depends on. They were measured, not assumed:

1. With the wheel axle along −X, a **negative** engine force drives toward −Z.
2. A **positive** steering angle turns left.
3. `setWheelBrake` takes an impulse per step, and it is ignored on a wheel whose engine force is not zero. This is why rolling resistance is subtracted from the drive force while driving, and applied as a brake only when coasting or held.

`vehicle.step(controls)` must be called once per tick **before** the physics world's `step()`.

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/vehicle.test.ts`:

```ts
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, test } from 'vitest';
import { GRAVITY, SURFACES } from './constants';
import { SAND_PATCH_CENTER } from './courses/testGround';
import { IDENTITY, vec3, yawOf, type Pose } from './math';
import { createRig } from './testRig';
import { VEHICLES, getVehicleConfig, type VehicleId } from './vehicles';

beforeAll(async () => {
  await RAPIER.init();
});

const ORIGIN: Pose = { pos: vec3(0, 0, 0), rot: IDENTITY };
const ON_SAND: Pose = { pos: vec3(SAND_PATCH_CENTER.x, 0, SAND_PATCH_CENTER.z + 10), rot: IDENTITY };

// A rig that has had one second to settle on its suspension.
function settled(id: VehicleId, spawn: Pose = ORIGIN) {
  const rig = createRig(RAPIER, id, spawn);
  rig.run(1);
  return rig;
}

test('getVehicleConfig rejects unknown ids', () => {
  expect(getVehicleConfig('lodgy')).toBe(VEHICLES.lodgy);
  expect(() => getVehicleConfig('bus')).toThrow('Unknown vehicle: bus');
});

describe.each(['lodgy', 'rv'] as const)('%s', (id) => {
  const config = VEHICLES[id];

  test('stays at rest on flat ground for 10 s', () => {
    const rig = createRig(RAPIER, id, ORIGIN);
    rig.run(10);
    const { pos } = rig.vehicle.state();
    expect(Math.hypot(pos.x, pos.z)).toBeLessThan(0.01);
    expect(Math.abs(rig.vehicle.forwardSpeed())).toBeLessThan(0.01);
    expect(pos.y).toBeCloseTo(config.rideHeight, 1);
  });

  test('throttle drives it straight toward -Z', () => {
    const rig = settled(id);
    rig.run(3, { throttle: 1 });
    const { pos } = rig.vehicle.state();
    expect(pos.z).toBeLessThan(-5);
    expect(Math.abs(pos.x)).toBeLessThan(0.1);
    expect(rig.vehicle.forwardSpeed()).toBeGreaterThan(0);
  });

  test('negative throttle reverses, no faster than the reverse speed', () => {
    const rig = settled(id);
    rig.run(4, { throttle: -1 });
    expect(rig.vehicle.state().pos.z).toBeGreaterThan(3);
    expect(rig.vehicle.forwardSpeed()).toBeLessThan(0);
    expect(rig.vehicle.forwardSpeed()).toBeGreaterThanOrEqual(-config.reverseSpeed);
  });

  test('positive steer turns right, negative steer turns left', () => {
    const right = settled(id);
    right.run(3, { throttle: 1, steer: 1 });
    expect(right.vehicle.state().pos.x).toBeGreaterThan(1);
    expect(yawOf(right.vehicle.state().rot)).toBeLessThan(0);

    const left = settled(id);
    left.run(3, { throttle: 1, steer: -1 });
    expect(left.vehicle.state().pos.x).toBeLessThan(-1);
    expect(yawOf(left.vehicle.state().rot)).toBeGreaterThan(0);
  });

  test('approaches but never exceeds its top speed', () => {
    const rig = settled(id);
    rig.run(20, { throttle: 1 });
    expect(rig.vehicle.forwardSpeed()).toBeLessThanOrEqual(config.maxSpeed);
    expect(rig.vehicle.forwardSpeed()).toBeGreaterThan(config.maxSpeed * 0.8);
  });

  test('coasts down at the road rolling resistance, and brakes much harder', () => {
    const rig = settled(id);
    rig.run(5, { throttle: 1 });
    const v0 = rig.vehicle.forwardSpeed();
    rig.run(2);
    const coast = (v0 - rig.vehicle.forwardSpeed()) / 2;
    expect(coast).toBeCloseTo(SURFACES.road.rolling * GRAVITY, 2);

    const v1 = rig.vehicle.forwardSpeed();
    rig.run(0.5, { brake: true });
    const braking = (v1 - rig.vehicle.forwardSpeed()) / 0.5;
    expect(braking).toBeGreaterThan(coast * 10);

    rig.run(5, { brake: true });
    expect(Math.abs(rig.vehicle.forwardSpeed())).toBeLessThan(0.01);
  });

  test('reports the surface under each wheel', () => {
    expect(settled(id).vehicle.wheelSurfaces()).toEqual(['road', 'road', 'road', 'road']);
    expect(settled(id, ON_SAND).vehicle.wheelSurfaces()).toEqual(['sand', 'sand', 'sand', 'sand']);
  });

  test('sand slows it to less than half the distance covered on road', () => {
    const road = settled(id);
    road.run(3, { throttle: 1 });
    const onRoad = -road.vehicle.state().pos.z;

    const sand = settled(id, ON_SAND);
    sand.run(3, { throttle: 1 });
    const onSand = ON_SAND.pos.z - sand.vehicle.state().pos.z;

    expect(onSand).toBeLessThan(onRoad / 2);
  });

  test('state reports clamped throttle and steer', () => {
    const rig = settled(id);
    rig.run(0.1, { throttle: 3, steer: -3 });
    expect(rig.vehicle.state().throttle).toBe(1);
    expect(rig.vehicle.state().steer).toBe(-1);
  });
});
```

`packages/shared/src/scenarios.test.ts`:

```ts
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, test } from 'vitest';
import type { ReferenceSlope } from './constants';
import { slopePose } from './courses/testGround';
import { createRig } from './testRig';
import type { VehicleId } from './vehicles';

beforeAll(async () => {
  await RAPIER.init();
});

// Handling targets. The numbers are the owner's to change, not the implementer's.
const CLIMB_SECONDS = 5;
const CLIMBS_IF_GAIN_ABOVE = 0.5;
const FAILS_IF_GAIN_BELOW = 0;

// Height gained in CLIMB_SECONDS at full throttle, starting at rest 8 m up the slope.
function heightGained(id: VehicleId, slope: ReferenceSlope): number {
  const rig = createRig(RAPIER, id, slopePose(slope, 8));
  rig.run(1, { brake: true });
  const before = rig.vehicle.state().pos.y;
  rig.run(CLIMB_SECONDS, { throttle: 1 });
  return rig.vehicle.state().pos.y - before;
}

test('the Lodgy climbs the gentle slope unaided', () => {
  expect(heightGained('lodgy', 'gentle')).toBeGreaterThan(CLIMBS_IF_GAIN_ABOVE);
});

test('the Lodgy fails the steep slope unaided', () => {
  expect(heightGained('lodgy', 'steep')).toBeLessThan(FAILS_IF_GAIN_BELOW);
});

test('the RV climbs the gentle slope unaided', () => {
  expect(heightGained('rv', 'gentle')).toBeGreaterThan(CLIMBS_IF_GAIN_ABOVE);
});

test('the RV fails the medium slope unaided', () => {
  expect(heightGained('rv', 'medium')).toBeLessThan(FAILS_IF_GAIN_BELOW);
});

// The wheel model lets a braked vehicle creep slowly on a steep slope. This bounds the creep.
test.each(['lodgy', 'rv'] as const)('the %s creeps less than 0.1 m/s on the steep slope with the brake on', (id) => {
  const rig = createRig(RAPIER, id, slopePose('steep', 8));
  rig.run(1, { brake: true });
  const before = rig.vehicle.state().pos;
  rig.run(5, { brake: true });
  const after = rig.vehicle.state().pos;
  expect(Math.hypot(after.y - before.y, after.z - before.z) / 5).toBeLessThan(0.1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/shared/src/vehicle.test.ts packages/shared/src/scenarios.test.ts`
Expected: both files FAIL, because `./testRig` cannot be resolved.

- [ ] **Step 3: Write the implementation**

`packages/shared/src/vehicles.ts`:

```ts
import { vec3, type Vec3 } from './math';

export type VehicleId = 'lodgy' | 'rv';

export interface VehicleConfig {
  id: VehicleId;
  halfExtents: Vec3;
  mass: number;
  // Height of the centre of mass relative to the chassis centre.
  comY: number;
  // Wheel attachment points relative to the chassis centre: (+-wheelX, wheelY, +-wheelZ).
  wheelX: number;
  wheelY: number;
  wheelZ: number;
  wheelRadius: number;
  suspensionRest: number;
  suspensionTravel: number;
  suspensionStiffness: number;
  suspensionCompression: number;
  suspensionRelaxation: number;
  // Height of the chassis centre above the ground when at rest.
  rideHeight: number;
  grip: number;
  sideGrip: number;
  // Total drive force at standstill, shared by the four wheels.
  engineForce: number;
  maxSpeed: number;
  reverseSpeed: number;
  brakeForce: number;
  maxSteer: number;
  // Front bumper point where the winch cable leaves the vehicle, relative to the chassis centre.
  winchMount: Vec3;
}

export const VEHICLES: Record<VehicleId, VehicleConfig> = {
  lodgy: {
    id: 'lodgy',
    halfExtents: vec3(0.88, 0.55, 2.25),
    mass: 1500,
    comY: -0.2,
    wheelX: 0.78,
    wheelY: -0.4,
    wheelZ: 1.4,
    wheelRadius: 0.33,
    suspensionRest: 0.3,
    suspensionTravel: 0.25,
    suspensionStiffness: 30,
    suspensionCompression: 2.5,
    suspensionRelaxation: 2,
    rideHeight: 0.95,
    grip: 1.6,
    sideGrip: 1,
    engineForce: 5000,
    maxSpeed: 20,
    reverseSpeed: 6,
    brakeForce: 12000,
    maxSteer: 0.55,
    winchMount: vec3(0, -0.3, -2.25),
  },
  rv: {
    id: 'rv',
    halfExtents: vec3(1.15, 1.2, 3.4),
    mass: 3750,
    comY: 0.1,
    wheelX: 1.05,
    wheelY: -1.05,
    wheelZ: 2.3,
    wheelRadius: 0.4,
    suspensionRest: 0.35,
    suspensionTravel: 0.3,
    suspensionStiffness: 30,
    suspensionCompression: 2.5,
    suspensionRelaxation: 2,
    rideHeight: 1.7,
    grip: 1.6,
    sideGrip: 1,
    engineForce: 7500,
    maxSpeed: 15,
    reverseSpeed: 5,
    brakeForce: 24000,
    maxSteer: 0.45,
    winchMount: vec3(0, -0.9, -3.4),
  },
};

export function getVehicleConfig(id: string): VehicleConfig {
  const config = (VEHICLES as Record<string, VehicleConfig | undefined>)[id];
  if (!config) throw new Error(`Unknown vehicle: ${id}`);
  return config;
}
```

`packages/shared/src/vehicle.ts`:

```ts
import { GRAVITY, SURFACES, TICK_DT, type Surface } from './constants';
import { AXIS_Y, IDENTITY, add, clamp, dot, rotate, scale, vec3, type Pose, type Quat, type Vec3 } from './math';
import type { Rapier, RapierWorld, RigidBody } from './rapier';
import type { VehicleConfig } from './vehicles';

export interface VehicleControls {
  // -1 (reverse) to 1 (forward).
  throttle: number;
  // -1 (left) to 1 (right).
  steer: number;
  brake: boolean;
}

export interface VehicleState {
  pos: Vec3;
  rot: Quat;
  linvel: Vec3;
  throttle: number;
  steer: number;
}

export interface Vehicle {
  readonly config: VehicleConfig;
  readonly body: RigidBody;
  // Sets the wheel forces for this tick. Call once per tick, before the physics world steps.
  step(controls: VehicleControls): void;
  state(): VehicleState;
  // Speed along the vehicle's forward (-Z) axis; negative when reversing.
  forwardSpeed(): number;
  // The surface under each wheel (front-left, front-right, rear-left, rear-right), or null if airborne.
  wheelSurfaces(): (Surface | null)[];
}

const WHEEL_COUNT = 4;
const FRONT_WHEELS = 2;
const FORWARD = vec3(0, 0, -1);
// Below this speed the vehicle counts as stopped when deciding whether resistance holds it.
const STOPPED_SPEED = 0.1;

export function createVehicle(
  rapier: Rapier,
  world: RapierWorld,
  config: VehicleConfig,
  // A pose on the ground; the chassis centre is placed above it by the ride height.
  spawn: Pose,
  surfaceOf: (colliderHandle: number) => Surface | null,
): Vehicle {
  const h = config.halfExtents;
  const pos = add(spawn.pos, rotate(spawn.rot, scale(AXIS_Y, config.rideHeight)));
  const inertia = {
    x: (config.mass / 3) * (h.y * h.y + h.z * h.z),
    y: (config.mass / 3) * (h.x * h.x + h.z * h.z),
    z: (config.mass / 3) * (h.x * h.x + h.y * h.y),
  };
  const body = world.createRigidBody(
    rapier.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation(spawn.rot)
      .setCanSleep(false)
      .setAdditionalMassProperties(config.mass, { x: 0, y: config.comY, z: 0 }, inertia, IDENTITY),
  );
  world.createCollider(rapier.ColliderDesc.cuboid(h.x, h.y, h.z).setDensity(0).setFriction(0.5), body);

  const controller = world.createVehicleController(body);
  controller.indexUpAxis = 1;
  controller.setIndexForwardAxis = 2;
  // Order: front-left, front-right, rear-left, rear-right. Front is -Z, left is -X.
  const corners: [number, number][] = [
    [-config.wheelX, -config.wheelZ],
    [config.wheelX, -config.wheelZ],
    [-config.wheelX, config.wheelZ],
    [config.wheelX, config.wheelZ],
  ];
  for (const [x, z] of corners) {
    controller.addWheel(
      { x, y: config.wheelY, z },
      { x: 0, y: -1, z: 0 },
      { x: -1, y: 0, z: 0 },
      config.suspensionRest,
      config.wheelRadius,
    );
  }
  for (let i = 0; i < WHEEL_COUNT; i++) {
    controller.setWheelSuspensionStiffness(i, config.suspensionStiffness);
    controller.setWheelSuspensionCompression(i, config.suspensionCompression);
    controller.setWheelSuspensionRelaxation(i, config.suspensionRelaxation);
    controller.setWheelMaxSuspensionTravel(i, config.suspensionTravel);
    controller.setWheelMaxSuspensionForce(i, config.mass * GRAVITY * 4);
    controller.setWheelSideFrictionStiffness(i, config.sideGrip);
  }

  let throttle = 0;
  let steer = 0;

  const forwardSpeed = () => dot(body.linvel(), rotate(body.rotation(), FORWARD));

  const wheelSurfaces = () =>
    Array.from({ length: WHEEL_COUNT }, (_, i) => {
      const collider = controller.wheelIsInContact(i) ? controller.wheelGroundObject(i) : null;
      return collider ? surfaceOf(collider.handle) : null;
    });

  return {
    config,
    body,
    forwardSpeed,
    wheelSurfaces,
    step(controls) {
      throttle = clamp(controls.throttle, -1, 1);
      steer = clamp(controls.steer, -1, 1);
      const speed = forwardSpeed();
      const fade = throttle >= 0 ? 1 - speed / config.maxSpeed : 1 + speed / config.reverseSpeed;
      const drive = throttle * config.engineForce * clamp(fade, 0, 1);
      const moving = Math.abs(speed) > STOPPED_SPEED;
      const surfaces = wheelSurfaces();
      for (let i = 0; i < WHEEL_COUNT; i++) {
        const surface = SURFACES[surfaces[i] ?? 'road'];
        const resistance = surface.rolling * config.mass * GRAVITY + (controls.brake ? config.brakeForce : 0);
        // The controller ignores the brake on a wheel that has engine force, so while driving
        // the resistance is subtracted from the drive force instead.
        const held = drive === 0 || controls.brake || (!moving && Math.abs(drive) <= resistance);
        const net = drive - (moving ? Math.sign(speed) : Math.sign(drive)) * resistance;
        controller.setWheelFrictionSlip(i, config.grip * surface.grip);
        // With the axle along -X, a negative engine force drives toward -Z.
        controller.setWheelEngineForce(i, held ? 0 : -net / WHEEL_COUNT);
        // The controller takes the brake as an impulse per step.
        controller.setWheelBrake(i, held ? (resistance * TICK_DT) / WHEEL_COUNT : 0);
        // A positive steering angle turns left, so right-positive input is negated.
        if (i < FRONT_WHEELS) controller.setWheelSteering(i, -steer * config.maxSteer);
      }
      controller.updateVehicle(TICK_DT);
    },
    state() {
      const t = body.translation();
      const r = body.rotation();
      const v = body.linvel();
      return {
        pos: { x: t.x, y: t.y, z: t.z },
        rot: { x: r.x, y: r.y, z: r.z, w: r.w },
        linvel: { x: v.x, y: v.y, z: v.z },
        throttle,
        steer,
      };
    },
  };
}
```

`packages/shared/src/testRig.ts`:

```ts
import type RAPIER from '@dimforge/rapier3d-compat';
import { GRAVITY, TICK_DT, TICK_RATE } from './constants';
import { getCourse } from './courses/index';
import type { Pose } from './math';
import type { Rapier } from './rapier';
import { buildStatics } from './statics';
import { createVehicle, type Vehicle, type VehicleControls } from './vehicle';
import { getVehicleConfig, type VehicleId } from './vehicles';

export interface Rig {
  world: RAPIER.World;
  vehicle: Vehicle;
  // Advances the simulation by `seconds` with constant controls.
  run(seconds: number, controls?: Partial<VehicleControls>): void;
}

// A vehicle on the test ground, for tests and experiments that need no full game world.
export function createRig(rapier: Rapier, vehicleId: VehicleId, spawn: Pose): Rig {
  const world = new rapier.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = TICK_DT;
  const statics = buildStatics(rapier, world, getCourse('test'));
  const vehicle = createVehicle(rapier, world, getVehicleConfig(vehicleId), spawn, statics.surfaceOf);
  return {
    world,
    vehicle,
    run(seconds, controls = {}) {
      for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
        vehicle.step({ throttle: 0, steer: 0, brake: false, ...controls });
        world.step();
      }
    },
  };
}
```

Replace `packages/shared/src/index.ts` with:

```ts
export * from './constants';
export * from './course';
export * from './courses/index';
export * from './math';
export * from './protocol';
export * from './rapier';
export * from './statics';
export * from './vehicle';
export * from './vehicles';
```

- [ ] **Step 4: Run the checks**

Run: `npm test`
Expected: 5 test files, 38 tests, passing.

Run: `npm run typecheck`
Expected: exits 0.

If a scenario test fails, do not change its numbers or the vehicle configs. Stop and report the failing test and its output.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add Lodgy and RV configs and the raycast vehicle

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: The world

**Files:**
- Create: `packages/shared/src/world.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/world.test.ts`

**Interfaces:**
- Consumes: `getCourse`, `getVehicleConfig`, `buildStatics`, `createVehicle`, `PlayerInput`, `Rapier`.
- Produces: `createWorld(rapier: Rapier, options: WorldOptions): World`.
  - `WorldOptions { courseId: string; vehicleId: string }`
  - `World { course, vehicleConfig, step(inputs: ReadonlyMap<string, PlayerInput>): WorldEvent[], snapshot(): WorldSnapshot, debug(): WorldDebug }`
  - `WorldSnapshot { tick: number; vehicle: VehicleState }`
  - `WorldDebug { forwardSpeed: number; wheelSurfaces: (Surface | null)[] }`
  - `WorldEvent { kind: string; tick: number; playerId?: string; pos?: Vec3 }`. `step` returns an empty list in this step; later steps fill it.

The vehicle spawns at the course's first checkpoint. The first input in the map drives it: `moveY` is throttle, `moveX` is steer, `jump` is brake.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/world.test.ts`:

```ts
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, test } from 'vitest';
import { NEUTRAL_INPUT, type PlayerInput } from './protocol';
import { VEHICLES } from './vehicles';
import { createWorld, type World } from './world';

beforeAll(async () => {
  await RAPIER.init();
});

const input = (fields: Partial<PlayerInput>): PlayerInput => ({ ...NEUTRAL_INPUT, seq: 0, ...fields });

function run(world: World, ticks: number, inputs: Map<string, PlayerInput>) {
  for (let i = 0; i < ticks; i++) world.step(inputs);
}

test('rejects unknown courses and vehicles', () => {
  expect(() => createWorld(RAPIER, { courseId: 'nope', vehicleId: 'lodgy' })).toThrow('Unknown course: nope');
  expect(() => createWorld(RAPIER, { courseId: 'test', vehicleId: 'bus' })).toThrow('Unknown vehicle: bus');
});

test('spawns the chosen vehicle at the first checkpoint', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'rv' });
  expect(world.vehicleConfig).toBe(VEHICLES.rv);
  run(world, 120, new Map());
  const { tick, vehicle } = world.snapshot();
  expect(tick).toBe(120);
  expect(vehicle.pos.x).toBeCloseTo(0, 2);
  expect(vehicle.pos.z).toBeCloseTo(0, 2);
  expect(vehicle.pos.y).toBeCloseTo(VEHICLES.rv.rideHeight, 1);
});

test('with no input the vehicle does not move', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  run(world, 300, new Map());
  expect(Math.abs(world.debug().forwardSpeed)).toBeLessThan(0.01);
});

test('the first input in the map drives: moveY is throttle, moveX is steer, jump is brake', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  run(world, 60, new Map());
  const inputs = new Map([
    ['a', input({ moveY: 1, moveX: 0.3 })],
    ['b', input({ moveY: -1, moveX: -1 })],
  ]);
  run(world, 180, inputs);
  const moving = world.snapshot().vehicle;
  expect(moving.throttle).toBe(1);
  expect(moving.steer).toBe(0.3);
  expect(moving.pos.z).toBeLessThan(-3);
  expect(moving.pos.x).toBeGreaterThan(0.5);

  run(world, 300, new Map([['a', input({ jump: true })]]));
  expect(Math.abs(world.debug().forwardSpeed)).toBeLessThan(0.01);
});

test('step returns an event list and debug reports wheel surfaces', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  expect(world.step(new Map())).toEqual([]);
  run(world, 60, new Map());
  expect(world.debug().wheelSurfaces).toEqual(['road', 'road', 'road', 'road']);
});

test('the same inputs produce the same snapshot', () => {
  const play = () => {
    const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
    run(world, 60, new Map());
    run(world, 240, new Map([['a', input({ moveY: 1, moveX: 0.4 })]]));
    run(world, 120, new Map([['a', input({ moveY: -1, moveX: -1 })]]));
    return JSON.stringify(world.snapshot());
  };
  expect(play()).toBe(play());
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/shared/src/world.test.ts`
Expected: FAIL, because `./world` cannot be resolved.

- [ ] **Step 3: Write the implementation**

`packages/shared/src/world.ts`:

```ts
import { GRAVITY, TICK_DT, type Surface } from './constants';
import type { BuiltCourse } from './course';
import { getCourse } from './courses/index';
import type { Vec3 } from './math';
import type { PlayerInput } from './protocol';
import type { Rapier } from './rapier';
import { buildStatics } from './statics';
import { createVehicle, type VehicleState } from './vehicle';
import { getVehicleConfig, type VehicleConfig } from './vehicles';

export interface WorldOptions {
  courseId: string;
  vehicleId: string;
}

export interface WorldEvent {
  kind: string;
  tick: number;
  playerId?: string;
  pos?: Vec3;
}

export interface WorldSnapshot {
  tick: number;
  vehicle: VehicleState;
}

export interface WorldDebug {
  forwardSpeed: number;
  wheelSurfaces: (Surface | null)[];
}

export interface World {
  readonly course: BuiltCourse;
  readonly vehicleConfig: VehicleConfig;
  // Advances one fixed tick and returns that tick's events.
  step(inputs: ReadonlyMap<string, PlayerInput>): WorldEvent[];
  snapshot(): WorldSnapshot;
  debug(): WorldDebug;
}

export function createWorld(rapier: Rapier, options: WorldOptions): World {
  const course = getCourse(options.courseId);
  const vehicleConfig = getVehicleConfig(options.vehicleId);
  const start = course.checkpoints[0];
  if (!start) throw new Error(`Course ${course.id} has no checkpoint`);

  const physics = new rapier.World({ x: 0, y: -GRAVITY, z: 0 });
  physics.timestep = TICK_DT;
  const statics = buildStatics(rapier, physics, course);
  const vehicle = createVehicle(rapier, physics, vehicleConfig, start.spawn, statics.surfaceOf);
  let tick = 0;

  return {
    course,
    vehicleConfig,
    step(inputs) {
      // Until seats exist (step 3), the first input in the map drives the vehicle.
      const driver = inputs.values().next().value;
      vehicle.step({
        throttle: driver?.moveY ?? 0,
        steer: driver?.moveX ?? 0,
        brake: driver?.jump ?? false,
      });
      physics.step();
      tick += 1;
      return [];
    },
    snapshot: () => ({ tick, vehicle: vehicle.state() }),
    debug: () => ({ forwardSpeed: vehicle.forwardSpeed(), wheelSurfaces: vehicle.wheelSurfaces() }),
  };
}
```

Replace `packages/shared/src/index.ts` with:

```ts
export * from './constants';
export * from './course';
export * from './courses/index';
export * from './math';
export * from './protocol';
export * from './rapier';
export * from './statics';
export * from './vehicle';
export * from './vehicles';
export * from './world';
```

- [ ] **Step 4: Run the checks**

Run: `npm test`
Expected: 6 test files, 44 tests, passing.

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add createWorld with step, snapshot and debug

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Client package, fixed-step loop and keyboard input

**Files:**
- Create: `packages/client/package.json`, `packages/client/vite.config.ts`
- Create: `packages/client/src/loop.ts`, `packages/client/src/input/source.ts`, `packages/client/src/input/keyboard.ts`
- Test: `packages/client/src/loop.test.ts`, `packages/client/src/input/keyboard.test.ts`

**Interfaces:**
- Consumes: `MAX_CATCHUP_STEPS`, `TICK_DT`, `NEUTRAL_INPUT`, `InputFields` from `@lodgy/shared`.
- Produces, from `loop.ts`: `createFixedStepper(tick: () => void): FixedStepper`, where `FixedStepper.advance(frameSeconds: number): number` runs the due ticks and returns how many ran.
- Produces, from `input/source.ts`: `InputSource { sample(): InputFields; dispose(): void }`. The touch source in a later step implements the same interface.
- Produces, from `input/keyboard.ts`: `createKeyboardSource(target: EventTarget): InputSource`.

Key bindings: W/S forward and back, A/D left and right, Space jump or brake, E interact, F use, Q reel in, R reel out, 1/2/3 select a slot, G drop. `yaw` and `pitch` stay 0 until mouse look arrives in step 3.

- [ ] **Step 1: Create the package manifest and Vite config**

`packages/client/package.json`:

```json
{
  "name": "@lodgy/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@dimforge/rapier3d-compat": "0.21.0",
    "@lodgy/shared": "*",
    "three": "0.187.0"
  },
  "devDependencies": {
    "@types/three": "0.187.0",
    "vite": "8.3.8"
  }
}
```

`packages/client/vite.config.ts`:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  // host: true makes the dev server reachable from other devices on the LAN.
  server: { host: true, port: 5173 },
  build: { target: 'es2022' },
});
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: completes without errors; `package-lock.json` changes.

- [ ] **Step 3: Write the failing tests**

`packages/client/src/loop.test.ts`:

```ts
import { MAX_CATCHUP_STEPS, TICK_DT } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createFixedStepper } from './loop';

function counter() {
  let ticks = 0;
  const stepper = createFixedStepper(() => {
    ticks += 1;
  });
  return { stepper, ticks: () => ticks };
}

test('runs no tick until a full tick of time has passed', () => {
  const { stepper, ticks } = counter();
  expect(stepper.advance(TICK_DT * 0.4)).toBe(0);
  expect(stepper.advance(TICK_DT * 0.4)).toBe(0);
  expect(stepper.advance(TICK_DT * 0.4)).toBe(1);
  expect(ticks()).toBe(1);
});

test('runs several ticks for a long frame and keeps the remainder', () => {
  const { stepper, ticks } = counter();
  expect(stepper.advance(TICK_DT * 2.5)).toBe(2);
  expect(stepper.advance(TICK_DT * 0.6)).toBe(1);
  expect(ticks()).toBe(3);
});

test('caps catch-up and discards the backlog', () => {
  const { stepper, ticks } = counter();
  expect(stepper.advance(TICK_DT * 100)).toBe(MAX_CATCHUP_STEPS);
  expect(stepper.advance(TICK_DT * 0.5)).toBe(0);
  expect(ticks()).toBe(MAX_CATCHUP_STEPS);
});
```

`packages/client/src/input/keyboard.test.ts`:

```ts
import { NEUTRAL_INPUT } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createKeyboardSource } from './keyboard';

function setup() {
  const target = new EventTarget();
  const source = createKeyboardSource(target);
  const key = (type: 'keydown' | 'keyup', code: string) =>
    target.dispatchEvent(Object.assign(new Event(type), { code }));
  return { target, source, press: (code: string) => key('keydown', code), release: (code: string) => key('keyup', code) };
}

test('with no key held it reports neutral input', () => {
  expect(setup().source.sample()).toEqual(NEUTRAL_INPUT);
});

test('WASD map to the move axes: W forward, D right', () => {
  const { source, press, release } = setup();
  press('KeyW');
  press('KeyD');
  expect(source.sample()).toMatchObject({ moveX: 1, moveY: 1 });
  release('KeyW');
  press('KeyS');
  release('KeyD');
  press('KeyA');
  expect(source.sample()).toMatchObject({ moveX: -1, moveY: -1 });
});

test('opposite keys cancel out', () => {
  const { source, press } = setup();
  press('KeyA');
  press('KeyD');
  expect(source.sample().moveX).toBe(0);
});

test('buttons: Space jump, E interact, F use, G drop', () => {
  const { source, press, release } = setup();
  for (const code of ['Space', 'KeyE', 'KeyF', 'KeyG']) press(code);
  expect(source.sample()).toMatchObject({ jump: true, interact: true, use: true, drop: true });
  release('KeyE');
  expect(source.sample().interact).toBe(false);
});

test('Q reels in, R reels out', () => {
  const { source, press, release } = setup();
  press('KeyQ');
  expect(source.sample().reel).toBe(1);
  release('KeyQ');
  press('KeyR');
  expect(source.sample().reel).toBe(-1);
});

test('1, 2 and 3 select a slot, which stays selected after release', () => {
  const { source, press, release } = setup();
  press('Digit3');
  release('Digit3');
  expect(source.sample().slot).toBe(2);
  press('Digit2');
  expect(source.sample().slot).toBe(1);
});

test('losing focus releases every key', () => {
  const { target, source, press } = setup();
  press('KeyW');
  press('Space');
  target.dispatchEvent(new Event('blur'));
  expect(source.sample()).toEqual(NEUTRAL_INPUT);
});

test('dispose stops listening', () => {
  const { source, press } = setup();
  source.dispose();
  press('KeyW');
  expect(source.sample().moveY).toBe(0);
});
```

These run in Node, which provides `EventTarget` and `Event`. The tests attach `code` to a plain `Event`, so the implementation must read `code` from the event and nothing else.

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run packages/client`
Expected: both files FAIL, because `./loop` and `./keyboard` cannot be resolved.

- [ ] **Step 5: Write the implementation**

`packages/client/src/loop.ts`:

```ts
import { MAX_CATCHUP_STEPS, TICK_DT } from '@lodgy/shared';

export interface FixedStepper {
  // Adds elapsed frame time and runs the ticks that are due. Returns how many ran.
  advance(frameSeconds: number): number;
}

export function createFixedStepper(tick: () => void): FixedStepper {
  let accumulator = 0;
  return {
    advance(frameSeconds) {
      accumulator += frameSeconds;
      let steps = 0;
      while (accumulator >= TICK_DT && steps < MAX_CATCHUP_STEPS) {
        tick();
        accumulator -= TICK_DT;
        steps += 1;
      }
      // Whatever is still owed after the catch-up limit is discarded, so a stall cannot snowball.
      if (accumulator >= TICK_DT) accumulator = 0;
      return steps;
    },
  };
}
```

`packages/client/src/input/source.ts`:

```ts
import type { InputFields } from '@lodgy/shared';

// A device-specific reader of the player's intent. Keyboard and touch both implement it.
export interface InputSource {
  sample(): InputFields;
  dispose(): void;
}
```

`packages/client/src/input/keyboard.ts`:

```ts
import { NEUTRAL_INPUT } from '@lodgy/shared';
import type { InputSource } from './source';

const SLOT_KEYS: Record<string, 0 | 1 | 2> = { Digit1: 0, Digit2: 1, Digit3: 2 };

export function createKeyboardSource(target: EventTarget): InputSource {
  const down = new Set<string>();
  let slot: 0 | 1 | 2 = 0;

  const onKeyDown = (event: Event) => {
    const code = (event as KeyboardEvent).code;
    down.add(code);
    const selected = SLOT_KEYS[code];
    if (selected !== undefined) slot = selected;
  };
  const onKeyUp = (event: Event) => {
    down.delete((event as KeyboardEvent).code);
  };
  // Keys released while the window is unfocused never send keyup.
  const onBlur = () => down.clear();

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  const axis = (negative: string, positive: string) =>
    ((down.has(positive) ? 1 : 0) - (down.has(negative) ? 1 : 0)) as -1 | 0 | 1;

  return {
    sample: () => ({
      ...NEUTRAL_INPUT,
      moveX: axis('KeyA', 'KeyD'),
      moveY: axis('KeyS', 'KeyW'),
      jump: down.has('Space'),
      interact: down.has('KeyE'),
      use: down.has('KeyF'),
      reel: axis('KeyR', 'KeyQ'),
      slot,
      drop: down.has('KeyG'),
    }),
    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}
```

- [ ] **Step 6: Run the checks**

Run: `npm test`
Expected: 8 test files, 55 tests, passing.

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add package-lock.json packages/client
git commit -m "feat(client): add client package, fixed-step loop and keyboard input

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Rendering, debug overlay and the running page

**Files:**
- Create: `packages/client/index.html`, `packages/client/src/main.ts`
- Create: `packages/client/src/render/scene.ts`, `packages/client/src/render/vehicleMesh.ts`, `packages/client/src/render/followCamera.ts`
- Create: `packages/client/src/ui/overlay.ts`
- Test: `packages/client/src/ui/overlay.test.ts`

**Interfaces:**
- Consumes: `createWorld`, `World`, `BuiltCourse`, `Box`, `Surface`, `VehicleConfig`, `VehicleState`, `PlayerInput` and the math helpers from `@lodgy/shared`; `createFixedStepper`; `createKeyboardSource`.
- Produces: `createScene(course): THREE.Scene`; `createVehicleMesh(config): THREE.Group`; `placeVehicleMesh(mesh, state): void`; `updateFollowCamera(camera, state, frameSeconds): void`; `overlayText(world, fps): string`.

The page reads `?vehicle=rv` from the address to pick the RV; the default is the Lodgy.

Rendering has no automated test. The overlay text does, and the page is checked in a browser in Step 6.

- [ ] **Step 1: Write the failing test**

`packages/client/src/ui/overlay.test.ts`:

```ts
import RAPIER from '@dimforge/rapier3d-compat';
import { createWorld } from '@lodgy/shared';
import { beforeAll, expect, test } from 'vitest';
import { overlayText } from './overlay';

beforeAll(async () => {
  await RAPIER.init();
});

test('shows the vehicle, course, tick, speed, position and wheel surfaces', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'rv' });
  for (let i = 0; i < 60; i++) world.step(new Map());
  const text = overlayText(world, 59.6);
  expect(text).toContain('vehicle  rv   course test');
  expect(text).toContain('tick     60   fps 60');
  expect(text).toContain('km/h');
  expect(text).toContain('wheels   road road road road');
});

test('shows air for a wheel with no ground under it', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  expect(overlayText(world, 60)).toContain('wheels   air air air air');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/client/src/ui/overlay.test.ts`
Expected: FAIL, because `./overlay` cannot be resolved.

- [ ] **Step 3: Write the overlay**

`packages/client/src/ui/overlay.ts`:

```ts
import type { World } from '@lodgy/shared';

const fixed = (value: number, digits = 1) => value.toFixed(digits).padStart(7);

// The debug text shown until the real HUD exists.
export function overlayText(world: World, fps: number): string {
  const { tick, vehicle } = world.snapshot();
  const { forwardSpeed, wheelSurfaces } = world.debug();
  return [
    `vehicle  ${world.vehicleConfig.id}   course ${world.course.id}`,
    `tick     ${tick}   fps ${Math.round(fps)}`,
    `speed    ${fixed(forwardSpeed * 3.6)} km/h`,
    `pos      ${fixed(vehicle.pos.x)} ${fixed(vehicle.pos.y)} ${fixed(vehicle.pos.z)}`,
    `throttle ${fixed(vehicle.throttle, 2)}   steer ${fixed(vehicle.steer, 2)}`,
    `wheels   ${wheelSurfaces.map((surface) => surface ?? 'air').join(' ')}`,
    '',
    'WASD drive   Space brake   ?vehicle=rv for the RV',
  ].join('\n');
}
```

Run: `npx vitest run packages/client/src/ui/overlay.test.ts`
Expected: 2 tests passing.

- [ ] **Step 4: Write the rendering code and the page**

`packages/client/src/render/scene.ts`:

```ts
import type { Box, BuiltCourse, Surface } from '@lodgy/shared';
import * as THREE from 'three';

const SKY = 0xcfe6f5;
const SURFACE_COLOURS: Record<Surface, number> = {
  road: 0x8a7f72,
  gravel: 0xa39a8c,
  riverbed: 0x7d8a8f,
  sand: 0xd9b77a,
};

function boxMesh(box: Box, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(box.halfExtents.x * 2, box.halfExtents.y * 2, box.halfExtents.z * 2),
    material,
  );
  mesh.position.set(box.center.x, box.center.y, box.center.z);
  mesh.quaternion.set(box.rot.x, box.rot.y, box.rot.z, box.rot.w);
  return mesh;
}

const solid = (colour: number) => new THREE.MeshLambertMaterial({ color: colour, flatShading: true });
const ghost = (colour: number) =>
  new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.25, depthWrite: false });

export function createScene(course: BuiltCourse): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(30, 60, 20);
  scene.add(sun);

  for (const ground of course.ground) scene.add(boxMesh(ground, solid(SURFACE_COLOURS[ground.surface])));
  for (const wall of course.walls) scene.add(boxMesh(wall, solid(0xc98a5a)));
  for (const checkpoint of course.checkpoints) scene.add(boxMesh(checkpoint.trigger, ghost(0x3b82f6)));
  scene.add(boxMesh(course.finish, ghost(0x22c55e)));

  for (const anchor of course.anchors) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.4), solid(0xf59e0b));
    post.position.set(anchor.pose.pos.x, anchor.pose.pos.y + 0.6, anchor.pose.pos.z);
    scene.add(post);
  }
  return scene;
}
```

`packages/client/src/render/vehicleMesh.ts`:

```ts
import type { VehicleConfig, VehicleState } from '@lodgy/shared';
import * as THREE from 'three';

const BODY_COLOURS: Record<VehicleConfig['id'], number> = { lodgy: 0x4a6fa5, rv: 0xefe6d2 };

const part = (width: number, height: number, depth: number, colour: number) =>
  new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshLambertMaterial({ color: colour, flatShading: true }),
  );

// The vehicle drawn as boxes: a body, a dark windscreen strip marking the front (-Z), and four wheels.
export function createVehicleMesh(config: VehicleConfig): THREE.Group {
  const h = config.halfExtents;
  const group = new THREE.Group();
  group.add(part(h.x * 2, h.y * 2, h.z * 2, BODY_COLOURS[config.id]));

  const windscreen = part(h.x * 1.8, h.y * 0.6, 0.1, 0x1f2937);
  windscreen.position.set(0, h.y * 0.5, -h.z - 0.03);
  group.add(windscreen);

  const wheelY = config.wheelY - config.suspensionRest;
  for (const x of [-config.wheelX, config.wheelX]) {
    for (const z of [-config.wheelZ, config.wheelZ]) {
      const wheel = part(0.25, config.wheelRadius * 2, config.wheelRadius * 2, 0x111827);
      wheel.position.set(x, wheelY, z);
      group.add(wheel);
    }
  }
  return group;
}

export function placeVehicleMesh(mesh: THREE.Group, state: VehicleState): void {
  mesh.position.set(state.pos.x, state.pos.y, state.pos.z);
  mesh.quaternion.set(state.rot.x, state.rot.y, state.rot.z, state.rot.w);
}
```

`packages/client/src/render/followCamera.ts`:

```ts
import { AXIS_Y, add, quatFromAxisAngle, rotate, vec3, yawOf, type VehicleState } from '@lodgy/shared';
import * as THREE from 'three';

const OFFSET = vec3(0, 4.5, 11);
const LOOK_HEIGHT = 1.2;
// Fraction of the remaining distance the camera closes each second.
const FOLLOW_RATE = 6;

// Keeps the camera behind and above the vehicle, following its yaw only so rolls do not spin the view.
export function updateFollowCamera(camera: THREE.PerspectiveCamera, state: VehicleState, frameSeconds: number): void {
  const behind = rotate(quatFromAxisAngle(AXIS_Y, yawOf(state.rot)), OFFSET);
  const goal = add(state.pos, behind);
  const blend = 1 - Math.exp(-FOLLOW_RATE * frameSeconds);
  camera.position.lerp(new THREE.Vector3(goal.x, goal.y, goal.z), blend);
  camera.lookAt(state.pos.x, state.pos.y + LOOK_HEIGHT, state.pos.z);
}
```

`packages/client/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Lodgy Co-op</title>
    <link rel="icon" href="data:," />
    <style>
      html,
      body {
        margin: 0;
        height: 100%;
        overflow: hidden;
        background: #cfe6f5;
      }
      #game {
        display: block;
        width: 100%;
        height: 100%;
      }
      #overlay {
        position: fixed;
        top: 8px;
        left: 8px;
        margin: 0;
        padding: 8px 10px;
        font: 12px/1.4 ui-monospace, Menlo, monospace;
        color: #fff;
        background: rgba(0, 0, 0, 0.55);
        border-radius: 4px;
        pointer-events: none;
        white-space: pre;
      }
    </style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <pre id="overlay"></pre>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`packages/client/src/main.ts`:

```ts
import RAPIER from '@dimforge/rapier3d-compat';
import { createWorld, type PlayerInput } from '@lodgy/shared';
import * as THREE from 'three';
import { createKeyboardSource } from './input/keyboard';
import { createFixedStepper } from './loop';
import { updateFollowCamera } from './render/followCamera';
import { createScene } from './render/scene';
import { createVehicleMesh, placeVehicleMesh } from './render/vehicleMesh';
import { overlayText } from './ui/overlay';

const LOCAL_PLAYER = 'local';
// A frame longer than this (a background tab, a debugger pause) is treated as this long.
const MAX_FRAME_SECONDS = 0.25;

async function main() {
  await RAPIER.init();
  const vehicleId = new URLSearchParams(location.search).get('vehicle') ?? 'lodgy';
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId });

  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const overlay = document.querySelector<HTMLPreElement>('#overlay')!;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 6, 14);

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const scene = createScene(world.course);
  const vehicleMesh = createVehicleMesh(world.vehicleConfig);
  scene.add(vehicleMesh);

  const keyboard = createKeyboardSource(window);
  const inputs = new Map<string, PlayerInput>();
  let seq = 0;
  const stepper = createFixedStepper(() => {
    inputs.set(LOCAL_PLAYER, { ...keyboard.sample(), seq });
    seq += 1;
    world.step(inputs);
  });

  let last = performance.now();
  let fps = 60;
  const frame = (now: number) => {
    const frameSeconds = Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
    last = now;
    stepper.advance(frameSeconds);
    if (frameSeconds > 0) fps += (1 / frameSeconds - fps) * 0.05;

    const { vehicle } = world.snapshot();
    placeVehicleMesh(vehicleMesh, vehicle);
    updateFollowCamera(camera, vehicle, frameSeconds);
    overlay.textContent = overlayText(world, fps);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main().catch((error: unknown) => {
  document.querySelector('#overlay')!.textContent = `Failed to start: ${String(error)}`;
  throw error;
});
```

- [ ] **Step 5: Run the automated checks**

Run: `npm test`
Expected: 9 test files, 57 tests, passing.

Run: `npm run typecheck`
Expected: exits 0.

Run: `npm run build`
Expected: ends with `✓ built in …`. A warning that a chunk is larger than 500 kB is expected: Rapier's WebAssembly is inlined in the bundle.

- [ ] **Step 6: Check the page in a browser**

Run `npm run dev` in the background and note the address it prints (normally `http://localhost:5173/`).

If browser automation tools are available, open the address, wait for the page, and run this in the page:

```js
async () => {
  const overlay = () => document.querySelector('#overlay').textContent;
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
  await new Promise((r) => setTimeout(r, 1500));
  const before = overlay();
  key('keydown', 'KeyD');
  key('keydown', 'KeyW');
  await new Promise((r) => setTimeout(r, 2500));
  key('keyup', 'KeyW');
  key('keyup', 'KeyD');
  return { before, after: overlay() };
}
```

Expected:
- `before` shows `speed 0.0 km/h`, `pos 0.0 1.0 0.0` and `wheels road road road road`.
- `after` shows a speed above 10 km/h, `throttle 1.00`, `steer 1.00`, a positive x and a negative z in `pos`.
- The browser console shows no errors.
- A screenshot shows a brown ground, a blue box with four dark wheels seen from behind, and the text overlay top left.

Repeat with `?vehicle=rv` appended to the address: the overlay's first line reads `vehicle  rv   course test`, the box is cream and larger, and the resting `pos` y is about 1.7.

Do not save screenshots inside the repository, except under `.playwright-mcp/`, which is ignored.

If no browser tool is available, say so in your report and leave this step unticked. Do not claim the page works.

Stop the dev server afterwards.

- [ ] **Step 7: Commit**

```bash
git add packages/client
git commit -m "feat(client): render the test ground and a drivable vehicle with debug overlay

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Winch cable experiment

This is a throwaway experiment. Its output is a set of starting values for the winch, which step 6 will use. Nothing under `packages/` imports the experiment.

**Files:**
- Create: `experiments/vitest.config.ts`, `experiments/cable/cable.experiment.ts`, `experiments/cable/RESULTS.md`
- Modify: `packages/shared/src/constants.ts` (append the winch constants)
- Modify: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md` (two sentences in the "Winch" section)
- Modify: `CLAUDE.md` (add one commit scope)

**Interfaces:**
- Consumes: `createRig` from `packages/shared/src/testRig`, `slopePose`, the math helpers, `GRAVITY`, `TICK_DT`, `TICK_RATE`.
- Produces: constants `WINCH_STIFFNESS_PER_KG`, `WINCH_DAMPING_RATIO`, `WINCH_FORCE_PER_WEIGHT`, `WINCH_REEL_SPEED`, `WINCH_MIN_LENGTH`, `WINCH_MAX_LENGTH` in `constants.ts`.

What the experiment does: it places each vehicle on the steep reference slope with the cable attached to a point near the top, reels in at 1 m/s with no throttle, and records how the vehicle behaves for a grid of spring stiffness and damping values. It runs each case a second time with the brake held for the first 5 s, to check that releasing a stalled cable does not fling the vehicle.

The cable model, which step 6 will reuse:
- Stiffness is `stiffnessPerKg × vehicle mass`, so both vehicles behave alike.
- Damping is `2 × dampingRatio × mass × √stiffnessPerKg`.
- The tension cap is `0.6 × vehicle weight`.
- The cable does not shorten on a tick where the tension is at the cap.

- [ ] **Step 1: Create the experiment**

`experiments/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

// Experiments are throwaway scripts run on demand; they are not part of `npm test`.
export default defineConfig({
  test: { include: ['experiments/**/*.experiment.ts'], environment: 'node', testTimeout: 120_000 },
});
```

`experiments/cable/cable.experiment.ts`:

```ts
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, test } from 'vitest';
import { GRAVITY, TICK_DT, TICK_RATE } from '../../packages/shared/src/constants';
import { slopePose } from '../../packages/shared/src/courses/testGround';
import { add, dot, length, rotate, scale, sub, vec3, type Vec3 } from '../../packages/shared/src/math';
import { createRig } from '../../packages/shared/src/testRig';
import type { VehicleId } from '../../packages/shared/src/vehicles';

// Throwaway experiment for build step 1. It finds stable starting values for the force-based
// winch cable at both vehicle masses. Nothing in packages/ imports this file.

interface CableParams {
  // Spring stiffness per kilogram of vehicle, in N/m per kg.
  stiffnessPerKg: number;
  dampingRatio: number;
}

const FORCE_PER_WEIGHT = 0.6;
const REEL_SPEED = 1;
const MIN_LENGTH = 1.5;
const START_ALONG = 8;
const ANCHOR_ALONG = 38;
const GOAL_ALONG = 30;

interface Result {
  vehicle: VehicleId;
  stiffnessPerKg: number;
  dampingRatio: number;
  secondsToTop: number | null;
  maxSpeed: number;
  maxSpin: number;
  maxStretch: number;
  maxSpeedAfterRelease: number;
}

function simulate(vehicle: VehicleId, params: CableParams, brakedSeconds: number): Omit<Result, 'maxSpeedAfterRelease'> & { speedAfterRelease: number } {
  const rig = createRig(RAPIER, vehicle, slopePose('steep', START_ALONG));
  const { body, config } = rig.vehicle;
  rig.run(1, { brake: true });

  const anchor = add(slopePose('steep', ANCHOR_ALONG).pos, vec3(0, 0.5, 0));
  const mount = (): Vec3 => add(body.translation(), rotate(body.rotation(), config.winchMount));
  const stiffness = params.stiffnessPerKg * config.mass;
  const damping = 2 * params.dampingRatio * config.mass * Math.sqrt(params.stiffnessPerKg);
  const cap = FORCE_PER_WEIGHT * config.mass * GRAVITY;
  const startY = body.translation().y;
  const goalGain = slopePose('steep', GOAL_ALONG).pos.y - slopePose('steep', START_ALONG).pos.y;

  let cableLength = length(sub(anchor, mount()));
  let secondsToTop: number | null = null;
  let maxSpeed = 0;
  let maxSpin = 0;
  let maxStretch = 0;
  let speedAfterRelease = 0;

  const totalTicks = (brakedSeconds + 40) * TICK_RATE;
  for (let tick = 0; tick < totalTicks; tick++) {
    const braked = tick < brakedSeconds * TICK_RATE;
    const from = mount();
    const toAnchor = sub(anchor, from);
    const distance = length(toAnchor);
    const direction = scale(toAnchor, 1 / distance);
    const stretch = distance - cableLength;
    // Positive when the two ends are moving apart.
    const stretchRate = -dot(body.velocityAtPoint(from), direction);
    const tension = stretch > 0 ? Math.min(cap, Math.max(0, stiffness * stretch + damping * stretchRate)) : 0;
    if (tension > 0) body.applyImpulseAtPoint(scale(direction, tension * TICK_DT), from, true);
    // The cable does not shorten while its tension is at the cap.
    if (tension < cap) cableLength = Math.max(MIN_LENGTH, cableLength - REEL_SPEED * TICK_DT);

    rig.vehicle.step({ throttle: 0, steer: 0, brake: braked });
    rig.world.step();

    const speed = length(body.linvel());
    maxSpeed = Math.max(maxSpeed, speed);
    maxSpin = Math.max(maxSpin, length(body.angvel()));
    maxStretch = Math.max(maxStretch, stretch);
    if (!braked && tick < (brakedSeconds + 3) * TICK_RATE) speedAfterRelease = Math.max(speedAfterRelease, speed);
    if (secondsToTop === null && body.translation().y - startY >= goalGain) {
      secondsToTop = (tick + 1) / TICK_RATE - brakedSeconds;
    }
  }
  return { vehicle, ...params, secondsToTop, maxSpeed, maxSpin, maxStretch, speedAfterRelease };
}

beforeAll(async () => {
  await RAPIER.init();
});

test('sweep cable stiffness and damping for both vehicles', () => {
  const rows: Result[] = [];
  for (const vehicle of ['lodgy', 'rv'] as const) {
    for (const stiffnessPerKg of [20, 60, 150, 400]) {
      for (const dampingRatio of [0.5, 1, 2]) {
        const free = simulate(vehicle, { stiffnessPerKg, dampingRatio }, 0);
        const stalled = simulate(vehicle, { stiffnessPerKg, dampingRatio }, 5);
        rows.push({
          vehicle,
          stiffnessPerKg,
          dampingRatio,
          secondsToTop: free.secondsToTop,
          maxSpeed: free.maxSpeed,
          maxSpin: free.maxSpin,
          maxStretch: free.maxStretch,
          maxSpeedAfterRelease: stalled.speedAfterRelease,
        });
      }
    }
  }
  const fmt = (n: number | null) => (n === null ? 'never' : n.toFixed(2));
  console.log('vehicle  k/kg  zeta  toTop(s)  maxSpeed  maxSpin  maxStretch  speedAfterRelease');
  for (const r of rows) {
    console.log(
      [r.vehicle.padEnd(7), String(r.stiffnessPerKg).padStart(5), fmt(r.dampingRatio).padStart(5), fmt(r.secondsToTop).padStart(9),
        fmt(r.maxSpeed).padStart(9), fmt(r.maxSpin).padStart(8), fmt(r.maxStretch).padStart(11), fmt(r.maxSpeedAfterRelease).padStart(18)].join(' '),
    );
  }
});
```

- [ ] **Step 2: Run it**

Run: `npm run experiment:cable`
Expected: a table of 24 rows, then `1 passed`. It is deterministic. These six rows must match to the printed precision:

```
vehicle  k/kg  zeta  toTop(s)  maxSpeed  maxSpin  maxStretch  speedAfterRelease
lodgy     150  0.50     22.50      1.01     0.08        0.11               1.01
lodgy     150  1.00     22.53      0.98     0.08        0.19               0.98
lodgy     150  2.00     22.65      0.98     0.08        0.35               0.98
rv        150  0.50     22.48      1.01     0.04        0.11               1.01
rv        150  1.00     22.52      1.00     0.04        0.19               0.98
rv        150  2.00     22.68      0.99     0.04        0.35               0.98
```

The rows with `k/kg` of 400 show `never` under `toTop(s)`. That is the experiment's main finding, explained in the results file below.

If the six rows differ, stop and report the full table. Do not pick other values.

- [ ] **Step 3: Record the results**

Create `experiments/cable/RESULTS.md` with this content, replacing the marked line with the full 24-row table copied from your run:

````markdown
# Winch cable experiment — results

Run with `npm run experiment:cable`. Build step 1, 2026-11-12.

## Question

Is a force-based cable (spring and damper, capped tension, no physics joint) stable when it winches each vehicle up the steep reference slope, and which stiffness and damping should the winch start with?

## Setup

- Each vehicle starts at rest 8 m up the 25° slope. The cable runs from its winch mount to a fixed point 38 m up.
- Reel-in speed 1 m/s, no throttle. The run lasts 40 s.
- Tension cap: 0.6 × vehicle weight. Stiffness and damping scale with vehicle mass.
- The cable does not shorten on a tick where tension is at the cap.
- Each case is run again with the brake held for the first 5 s, then released.

## Table

```
PASTE THE FULL TABLE FROM YOUR RUN HERE
```

Columns: seconds to climb 22 m of slope; highest speed (m/s); highest spin (rad/s); largest cable stretch (m); highest speed in the 3 s after the brake is released (m/s).

## Findings

1. The force-based cable is stable at both vehicle masses. Speed never exceeds the reel speed by more than about 0.1 m/s, spin stays under 0.1 rad/s, and releasing a stalled cable does not fling the vehicle.
2. Because stiffness, damping and the cap all scale with mass, the Lodgy and the RV behave almost identically.
3. Stiffness has an upper limit. At 400 N/m per kg the tension reaches the cap after about 15 mm of stretch, which is less than the 17 mm the reel takes in per tick. The "do not shorten at the cap" rule then blocks the reel on every other tick and the vehicle climbs at half speed. The stretch at which the cap is reached must stay well above one tick of reel travel.

## Chosen starting values

Rule: among rows where both vehicles reach the top, with top speed and post-release speed at or below 1.5 m/s and spin at or below 0.5 rad/s, take the highest stiffness, with a damping ratio of 1.

| Constant | Value |
|---|---|
| `WINCH_STIFFNESS_PER_KG` | 150 |
| `WINCH_DAMPING_RATIO` | 1 |
| `WINCH_FORCE_PER_WEIGHT` | 0.6 |
| `WINCH_REEL_SPEED` | 1 |
| `WINCH_MIN_LENGTH` | 1.5 |
| `WINCH_MAX_LENGTH` | 25 |

At these values the cap is reached at about 39 mm of stretch, more than twice one tick of reel travel.
````

- [ ] **Step 4: Add the winch constants**

Append to `packages/shared/src/constants.ts`:

```ts

// Winch cable starting values, from experiments/cable/RESULTS.md. Used from build step 6.
// Stiffness in N/m per kilogram of vehicle; the tension cap is a fraction of the vehicle's weight.
export const WINCH_STIFFNESS_PER_KG = 150;
export const WINCH_DAMPING_RATIO = 1;
export const WINCH_FORCE_PER_WEIGHT = 0.6;
export const WINCH_REEL_SPEED = 1;
export const WINCH_MIN_LENGTH = 1.5;
export const WINCH_MAX_LENGTH = 25;
```

- [ ] **Step 5: Update the spec and the commit scopes**

In `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`, in the "Winch" section, replace this bullet:

```
- A slack cable has no effect. A taut cable pulls its two ends together with a spring-and-damper force, capped at the maximum winch force. Under a load above the cap the cable stretches; it never breaks.
```

with:

```
- A slack cable has no effect. A taut cable pulls its two ends together with a spring-and-damper force, capped at the maximum winch force. Under a load above the cap the cable stretches; it never breaks.
- The maximum winch force is a fixed fraction of the vehicle's weight, and the cable's stiffness and damping scale with the vehicle's mass, so both vehicles winch up the same slopes at the same speed.
```

In `CLAUDE.md`, replace:

```
- Scopes: `shared`, `server`, `client`, `e2e`, `spec`, `plan`, `roadmap`, `repo`, `deps`
```

with:

```
- Scopes: `shared`, `server`, `client`, `e2e`, `experiments`, `spec`, `plan`, `roadmap`, `repo`, `deps`
```

- [ ] **Step 6: Run the checks**

Run: `npm test`
Expected: 9 test files, 57 tests, passing. The experiment is not part of `npm test`.

Run: `npm run typecheck`
Expected: exits 0. This also typechecks the experiment.

- [ ] **Step 7: Commit**

```bash
git add experiments packages/shared/src/constants.ts docs/superpowers/specs/2026-11-11-lodgy-coop-design.md CLAUDE.md
git commit -m "feat(experiments): measure force-based winch cable and record starting values

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Record the step in the roadmap

**Files:**
- Modify: `ROADMAP.md`
- Modify: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md` (one sentence in "Build order")
- Modify: `docs/superpowers/plans/step-1-scaffold-and-drivable-vehicle.md` (tick the boxes)

**Interfaces:**
- Consumes: the finished work of Tasks 1 to 8.
- Produces: nothing in code.

- [ ] **Step 1: Run every check one last time**

Run: `npm test && npm run typecheck && npm run build`
Expected: 57 tests passing, typecheck exits 0, build ends with `✓ built in …`.

- [ ] **Step 2: Update `ROADMAP.md`**

Replace the "Current state" section's two paragraphs with:

```markdown
**Current step:** step 1 is built on branch `step-1-scaffold-and-drivable-vehicle`. Next action: review and merge it, then write the plan for step 2.

**Runnable today:** `npm run dev` opens a page where the Lodgy (or the RV, with `?vehicle=rv`) drives around the test ground. The simulation runs in the page; there is no server yet.
```

In the steps table, change row 1's `Status` to `done`, its `Branch` to `step-1-scaffold-and-drivable-vehicle`, and its `Plan` to `[plan](docs/superpowers/plans/step-1-scaffold-and-drivable-vehicle.md)`.

Replace the body of "How to run and test" with:

```markdown
Requires Node 22 or later.

| Command | What it does |
|---|---|
| `npm install` | Installs every package in the workspace |
| `npm test` | Runs all unit and scenario tests once |
| `npm run test:watch` | Runs tests on every change |
| `npm run typecheck` | Typechecks every package, config and experiment |
| `npm run dev` | Starts the client at `http://localhost:5173/`, also reachable from other devices on the same Wi-Fi |
| `npm run build` | Builds the client into `packages/client/dist` |
| `npm run experiment:cable` | Re-runs the winch cable experiment and prints its table |

In the page: WASD to drive, Space to brake. Add `?vehicle=rv` to the address for the RV.
```

Replace the body of "Known issues" with:

```markdown
- A braked vehicle creeps at under 0.1 m/s on the steep (25°) reference slope. The wheel model causes it; a scenario test bounds it.
- The production bundle is about 4.9 MB because Rapier's WebAssembly is inlined. Acceptable for now.
```

Append these rows to the decisions log:

```markdown
| 2026-11-12 | The winch force cap is a fraction of the vehicle's weight, and cable stiffness scales with mass | Experiment in `experiments/cable/RESULTS.md`; a fixed cap would let the winch lift the Lodgy outright |
| 2026-11-12 | Winch stiffness has an upper limit set by the reel speed | Same experiment: too stiff a cable hits the cap every other tick and halves the reel speed |
| 2026-11-12 | The test ground gains its props, obstacles, stops and coins in the steps that first simulate them | Avoids placing data nothing reads yet |
| 2026-11-12 | All four wheels are driven on both vehicles | Keeps slope behaviour dependent on engine force alone |
```

- [ ] **Step 3: Update the spec's build-order sentence**

In `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`, replace:

```
Steps 1 to 15 run on a flat test ground with a ramp, reference slopes, a sand patch, an anchor, a heavy obstacle, a few props, a fuel station with a shop, a garage, a few coins, two checkpoints and a finish.
```

with:

```
Steps 1 to 15 run on a flat test ground with a ramp, reference slopes, a sand patch, an anchor, a heavy obstacle, a few props, a fuel station with a shop, a garage, a few coins, two checkpoints and a finish. Each of these is added to the test ground by the step that first simulates it.
```

- [ ] **Step 4: Tick this plan's checkboxes**

In `docs/superpowers/plans/step-1-scaffold-and-drivable-vehicle.md`, change `- [ ]` to `- [x]` for every step that was completed. Leave Task 7 Step 6 unticked if the browser check was not performed.

- [ ] **Step 5: Commit**

```bash
git add ROADMAP.md docs/superpowers
git commit -m "docs(roadmap): record step 1 as built

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Do not merge the branch. The main session reviews it and merges.
