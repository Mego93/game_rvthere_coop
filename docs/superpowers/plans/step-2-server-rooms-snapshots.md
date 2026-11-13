# Step 2: Server, Rooms and Snapshots — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A game server that several browsers connect to. One player creates a room on the home page and shares its address; everyone who opens it sees the same vehicle on the test ground, simulated on the server and driven by the first player.

**Architecture:** A new `packages/server` holds a `room` layer (rooms, players, the 60 Hz simulation loop, 20 Hz snapshots, liveness, rate limit) that talks only to an abstract connection, clock, timer and random source, and a `node` adapter that wires it to `ws` sockets, real timers and static file serving on one port. `packages/shared` gains the message types and validators. `packages/client` stops simulating: it sends one input per tick, buffers snapshots and draws the vehicle 100 ms in the past, and gains a home page.

**Tech Stack:** as step 1, plus `ws` 8.22.2, `tsx` 4.23.15 (runs the server from TypeScript source), `@types/node` 26.6.6, `@types/ws` 8.18.2, `@playwright/test` 1.65.0.

**Spec:** `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`, build step 2, and the nine step-2 rows of "Carried into later steps" in `ROADMAP.md`.

**Status of this plan's code:** every file below was drafted and run in a scratch workspace before the plan was written (clean install, 231 tests passing in 21 files, typecheck clean, production build succeeding, 12 Playwright tests passing, `npm run dev` and `npm start` both exercised). Copy the code exactly. If something fails that the plan says should pass, stop and report; do not improvise a fix.

## Global Constraints

- Use npm only. Dependency versions are exact, as written below. Do not add, remove or upgrade any other dependency.
- TypeScript strict mode, ES modules. Imports between files in a package have no file extension.
- Units are metres, seconds, kilograms, radians. Axes are right-handed with +Y up. Forward is −Z and right is +X in a vehicle's local frame. Yaw is rotation about +Y; yaw 0 faces −Z; positive yaw turns left.
- The simulation tick is fixed at 1/60 s. The simulation uses no randomness and no wall clock.
- `shared` never loads WebAssembly; the caller runs `await RAPIER.init()` and passes the module in.
- `packages/server/src/room` imports nothing from Node, from `ws` or from the DOM. Only `packages/server/src/node` may. The room layer gets its clock, timer and random source as parameters.
- Every tuning number lives in `packages/shared/src/constants.ts` or `packages/shared/src/vehicles.ts`. Do not change any value given here.
- Player-supplied text (names, room names) is put on the page with `textContent`, never as HTML.
- Comments explain only a non-obvious why, in one line. No docblocks.
- Commits use Conventional Commits with a required scope: `<type>(<scope>): <description>`, ending with the line `Co-Authored-By: Claude <noreply@anthropic.com>`. Use that trailer exactly, whatever other attribution guidance your session suggests. Scopes used here: `repo`, `shared`, `server`, `client`, `e2e`, `roadmap`.
- Never commit `.env*`, keys, tokens or cookies files, `node_modules`, `dist`, `test-results`, `.superpowers/` or `.playwright-mcp/`.
- Write each test before the code it covers, and watch it fail first.
- Ports: the owner may have a dev server running on 3000 or 5173. Do not stop any process you did not start, and never use `pkill` or `killall`. The integration test picks a free port; the Playwright test uses 3100; the manual check in Task 6 uses 3210.
- `npm install` prints an `EBADENGINE` warning on Node 25 (Vitest lists only even-numbered releases). That one warning is expected.
- With this many test files Vitest may print a tip about `isolate: false`. Ignore it.
- If the plan and the spec do not answer a question, stop and report it. Do not guess.

## File Structure

```
package.json                      scripts and dev dependencies (changed in Tasks 1, 4, 6, 9)
tsconfig.base.json                shared compiler options, no DOM
tsconfig.json                     experiments, e2e and root config files
playwright.config.ts              smoke test configuration
scripts/dev.mjs                   runs the game server and Vite together
e2e/smoke.spec.ts                 browser smoke test
packages/shared/
  tsconfig.json
  src/math.ts                     + deepFreeze, lerp, nlerp
  src/constants.ts                + server, network and interpolation values
  src/protocol.ts                 + message types, validators, neutralInput, SOCKET_PATH
  src/world.ts                    + dispose, non-finite input guard
  src/courses/index.ts, src/vehicles.ts, src/courses/testGround.ts   frozen data, safe lookups
packages/server/
  package.json
  tsconfig.json                   the room layer: no Node types
  tsconfig.node.json              the node adapter: Node types
  src/room/types.ts               Connection, RoomDeps, RoomServer
  src/room/nouns.ts               room names
  src/room/rateLimit.ts           per-connection message limit
  src/room/inputQueue.ts          per-player input queue
  src/room/room.ts                one room: players, world, loop, snapshots
  src/room/server.ts              connections, create and join, liveness, room clean-up
  src/room/testing.ts             fake clock, timer and connections for tests
  src/node/static.ts              serves the built client
  src/node/listen.ts              startServer: http + ws + room layer
  src/node/main.ts                entry point
packages/client/
  tsconfig.json
  vite.config.ts                  + WebSocket proxy to the game server
  index.html                      + home form
  src/main.ts                     home page, socket, starts the game
  src/game.ts                     one run: input sending, drawing from snapshots
  src/session.ts                  per-tab token, remembered name
  src/route.ts                    room from the address, socket address
  src/net/socket.ts               WebSocket wrapper
  src/net/snapshotBuffer.ts       snapshot buffer and interpolation
  src/ui/home.ts                  the home and join form
  src/ui/overlay.ts               debug text from snapshot data
  src/loop.ts                     + guard against bad frame times
```

## Deliberate limits of this step

These are decisions, not omissions. Do not "fix" them.

- Every room runs the test ground with one vehicle: the Lodgy, or the RV when the server is started with `VEHICLE=rv`. There is no lobby phase, ready state or configuration yet (step 11). The `lobby` message is sent with `phase: 'playing'` and has no `timeOfDay` or `weather`.
- A player who disconnects is removed at once. Held slots arrive at step 11. The page does not reconnect by itself (step 19): it returns to the name form.
- The first player in join order drives. There are no characters (step 3). The snapshot holds `tick`, `ackSeq`, `full` and `vehicle` only.
- No `event`, `results`, `ready`, `configure`, `kick` or other later messages exist yet.
- When the server consumes two queued inputs in one tick, only the second is simulated.
- Interpolation covers the vehicle only.
- The client no longer imports Rapier, so the page is small. `@dimforge/rapier3d-compat` stays in `packages/client/package.json`; step 4 uses it again.
- The Playwright "phone" project runs in WebKit, the engine of Safari, with an iPhone 14 viewport and touch (changed at the owner's request during the step; see Task 9, steps 7 and 8). It is not Safari on a real iPhone.
- A room with nobody connected is paused, then deleted after 60 s.

---

### Task 1: Per-package TypeScript configs

`shared` and the room layer must not be able to use browser or Node globals. Until now one config with the DOM library covered everything.

**Files:**
- Modify: `tsconfig.base.json`, `tsconfig.json`, `package.json`
- Create: `packages/shared/tsconfig.json`, `packages/client/tsconfig.json`

**Interfaces:**
- Consumes: the step 1 workspace.
- Produces: `npm run typecheck` checks each package with its own config. `shared` has no DOM library.

- [x] **Step 1: Create the branch**

```bash
git checkout main
git checkout -b step-2-server-rooms-snapshots
```

- [x] **Step 2: Replace the two root configs**

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": [
      "ES2022"
    ],
    "types": [],
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
  "compilerOptions": {
    "lib": [
      "ES2022",
      "DOM",
      "DOM.Iterable"
    ]
  },
  "include": [
    "experiments/**/*.ts",
    "e2e/**/*.ts",
    "vitest.config.ts",
    "playwright.config.ts"
  ]
}
```

(`e2e` and `playwright.config.ts` do not exist yet; they arrive in Task 9.)

- [x] **Step 3: Create the package configs**

`packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": [
    "src/**/*.ts"
  ]
}
```

`packages/client/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": [
      "ES2022",
      "DOM",
      "DOM.Iterable"
    ]
  },
  "include": [
    "src/**/*.ts",
    "vite.config.ts"
  ]
}
```

- [x] **Step 4: Change the typecheck script**

In the root `package.json`, replace the line

```json
    "typecheck": "tsc -p tsconfig.json",
```

with

```json
    "typecheck": "tsc -p packages/shared && tsc -p packages/client && tsc -p tsconfig.json",
```

- [x] **Step 5: Run the checks**

Run: `npm run typecheck`
Expected: exits 0 with no output after the command echo.

Run: `npm test`
Expected: 9 files, 57 tests passing.

- [x] **Step 6: Prove that `shared` cannot see the DOM**

Create the temporary file `packages/shared/src/zz-probe.ts` containing the single line:

```ts
export const probe = document.title;
```

Run: `npx tsc -p packages/shared`
Expected: FAIL with an error saying the name `document` cannot be found.

Delete `packages/shared/src/zz-probe.ts`, then run `npm run typecheck` again. Expected: exits 0. Confirm with `git status --short` that the probe file is gone.

- [x] **Step 7: Commit**

```bash
git add tsconfig.base.json tsconfig.json package.json packages/shared/tsconfig.json packages/client/tsconfig.json
git commit -m "chore(repo): give each package its own tsconfig

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Shared hardening and new constants

One server process will run many rooms from the same course and vehicle objects, and will receive numbers from the network. This task makes the shared data unchangeable, makes lookups safe, lets a world be freed, and adds the constants the rest of the step uses.

**Files:**
- Modify: `packages/shared/src/math.ts`, `packages/shared/src/constants.ts`, `packages/shared/src/world.ts`, `packages/shared/src/courses/index.ts`, `packages/shared/src/courses/testGround.ts`, `packages/shared/src/vehicles.ts`, `packages/client/src/loop.ts`
- Test: `packages/shared/src/math.test.ts`, `packages/shared/src/world.test.ts`, `packages/client/src/loop.test.ts`

**Interfaces:**
- Consumes: the step 1 `shared` and `client` code.
- Produces:
  - `deepFreeze<T>(value: T): T`, `lerp(a: Vec3, b: Vec3, t: number): Vec3`, `nlerp(a: Quat, b: Quat, t: number): Quat` from `math.ts`
  - `World.dispose(): void`; `World.step` now takes `ReadonlyMap<string, InputFields>`
  - `MAX_CATCHUP_STEPS` is renamed `CLIENT_MAX_CATCHUP_STEPS`
  - new constants: `SERVER_MAX_CATCHUP_STEPS`, `SNAPSHOT_EVERY_TICKS`, `INTERPOLATION_DELAY`, `SNAPSHOT_BUFFER_SIZE`, `CLOCK_OFFSET_SMOOTHING`, `MAX_PLAYERS`, `NAME_MAX_LENGTH`, `PLAYER_COLOURS`, `INPUT_QUEUE_MAX`, `INPUT_QUEUE_FAST_ABOVE`, `NEUTRAL_AFTER_TICKS`, `PING_INTERVAL`, `SILENCE_TIMEOUT`, `RATE_LIMIT_PER_SECOND`, `RATE_LIMIT_CLOSE_AFTER`, `EMPTY_ROOM_TIMEOUT`

- [x] **Step 1: Replace the three test files**

`packages/shared/src/math.test.ts`:

```ts
import { expect, test } from 'vitest';
import { AXIS_X, AXIS_Y, IDENTITY, lerp, nlerp, quatFromAxisAngle, quatMul, rotate, vec3, yawOf } from './math';

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

test('lerp moves a fraction of the way between two points', () => {
  expect(lerp(vec3(0, 0, 0), vec3(10, -4, 2), 0.25)).toEqual(vec3(2.5, -1, 0.5));
});

test('nlerp gives the rotation halfway between two yaws', () => {
  const half = nlerp(quatFromAxisAngle(AXIS_Y, 0.2), quatFromAxisAngle(AXIS_Y, 0.6), 0.5);
  expect(yawOf(half)).toBeCloseTo(0.4, 3);
  expect(Math.hypot(half.x, half.y, half.z, half.w)).toBeCloseTo(1, 9);
});

test('nlerp takes the short way when the two quaternions have opposite signs', () => {
  const a = quatFromAxisAngle(AXIS_Y, 0.2);
  const b = quatFromAxisAngle(AXIS_Y, 0.6);
  const flipped = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
  expect(yawOf(nlerp(a, flipped, 0.5))).toBeCloseTo(0.4, 3);
});

test('the shared constant vectors cannot be modified', () => {
  expect(() => {
    (IDENTITY as { w: number }).w = 0;
  }).toThrow(TypeError);
  expect(() => {
    (AXIS_Y as { y: number }).y = 0;
  }).toThrow(TypeError);
});
```

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

test('rejects ids that are only inherited object keys', () => {
  expect(() => createWorld(RAPIER, { courseId: 'constructor', vehicleId: 'lodgy' })).toThrow(
    'Unknown course: constructor',
  );
  expect(() => createWorld(RAPIER, { courseId: 'test', vehicleId: 'toString' })).toThrow('Unknown vehicle: toString');
});

test('an input that is not a finite number is treated as no input and does no lasting harm', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  run(world, 60, new Map());
  run(world, 5, new Map([['a', input({ moveY: Number.NaN, moveX: Number.POSITIVE_INFINITY })]]));
  expect(world.snapshot().vehicle.throttle).toBe(0);
  expect(world.snapshot().vehicle.steer).toBe(0);
  run(world, 120, new Map([['a', input({ moveY: 1 })]]));
  expect(world.snapshot().vehicle.pos.z).toBeLessThan(-2);
});

test('shared course and vehicle data cannot be modified', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  expect(() => {
    (world.vehicleConfig as { mass: number }).mass = 1;
  }).toThrow(TypeError);
  expect(() => {
    world.course.checkpoints[0]!.spawn.pos.x = 5;
  }).toThrow(TypeError);
});

test('dispose frees the physics world', () => {
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' });
  run(world, 10, new Map());
  world.dispose();
  expect(() => world.step(new Map())).toThrow();
});
```

`packages/client/src/loop.test.ts`:

```ts
import { CLIENT_MAX_CATCHUP_STEPS, TICK_DT } from '@lodgy/shared';
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
  expect(stepper.advance(TICK_DT * 100)).toBe(CLIENT_MAX_CATCHUP_STEPS);
  expect(stepper.advance(TICK_DT * 0.5)).toBe(0);
  expect(ticks()).toBe(CLIENT_MAX_CATCHUP_STEPS);
});

test('ignores a frame time that is not a positive number', () => {
  const { stepper, ticks } = counter();
  expect(stepper.advance(Number.NaN)).toBe(0);
  expect(stepper.advance(-5)).toBe(0);
  expect(stepper.advance(TICK_DT * 1.5)).toBe(1);
  expect(ticks()).toBe(1);
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL. The new tests in `math.test.ts`, `world.test.ts` and `loop.test.ts` fail (for example `lerp is not a function`, a wrong error message for `constructor`, `world.dispose is not a function`). The other six files still pass.

- [x] **Step 3: Replace `math.ts`, `constants.ts`, `world.ts` and `loop.ts`**

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
```

`packages/shared/src/constants.ts`:

```ts
export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;
export const GRAVITY = 9.81;
// Most simulation steps run in one frame (client) or one loop iteration (server); the rest of the backlog is dropped.
export const CLIENT_MAX_CATCHUP_STEPS = 5;
export const SERVER_MAX_CATCHUP_STEPS = 3;
// The server broadcasts a snapshot every this many ticks: 20 per second.
export const SNAPSHOT_EVERY_TICKS = 3;
// The client draws the world this many seconds in the past, between two snapshots.
export const INTERPOLATION_DELAY = 0.1;
// How many snapshots the client keeps: two seconds' worth.
export const SNAPSHOT_BUFFER_SIZE = 40;
// Fraction by which each late snapshot pulls the client's estimate of the server clock back.
export const CLOCK_OFFSET_SMOOTHING = 0.05;

export const MAX_PLAYERS = 6;
export const NAME_MAX_LENGTH = 16;
export const PLAYER_COLOURS = ['#e4572e', '#17bebb', '#ffc914', '#76b041', '#a05cdc', '#f28cb1'] as const;

// Per-player input queue on the server.
export const INPUT_QUEUE_MAX = 8;
// Above this many queued inputs the server consumes two per tick to catch up.
export const INPUT_QUEUE_FAST_ABOVE = 3;
// After this many ticks with no new input the server substitutes a neutral input.
export const NEUTRAL_AFTER_TICKS = 15;

// Seconds between pings, and seconds of silence after which a connection counts as gone.
export const PING_INTERVAL = 2;
export const SILENCE_TIMEOUT = 6;
// Messages per second allowed from one connection, and seconds over the limit before it is closed.
export const RATE_LIMIT_PER_SECOND = 120;
export const RATE_LIMIT_CLOSE_AFTER = 3;
// Seconds a room survives with nobody connected.
export const EMPTY_ROOM_TIMEOUT = 60;

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

// Friction coefficient of every ground and wall collider.
export const COURSE_FRICTION = 1;
// Friction coefficient of the vehicle's chassis box, which touches things only when the vehicle tips or scrapes.
export const CHASSIS_FRICTION = 0.5;
// Below this speed (m/s) the vehicle counts as stopped when deciding whether resistance holds it.
export const VEHICLE_STOPPED_SPEED = 0.1;
// Each wheel's suspension can push with at most this many times the vehicle's weight.
export const MAX_SUSPENSION_FORCE_PER_WEIGHT = 4;

// Winch cable starting values, from experiments/cable/RESULTS.md. Used from build step 6.
// Stiffness in N/m per kilogram of vehicle; the tension cap is a fraction of the vehicle's weight.
export const WINCH_STIFFNESS_PER_KG = 150;
export const WINCH_DAMPING_RATIO = 1;
export const WINCH_FORCE_PER_WEIGHT = 0.6;
export const WINCH_REEL_SPEED = 1;
export const WINCH_MIN_LENGTH = 1.5;
export const WINCH_MAX_LENGTH = 25;
```

`packages/shared/src/world.ts`:

```ts
import { GRAVITY, TICK_DT, type Surface } from './constants';
import type { BuiltCourse } from './course';
import { getCourse } from './courses/index';
import type { Vec3 } from './math';
import type { InputFields } from './protocol';
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
  step(inputs: ReadonlyMap<string, InputFields>): WorldEvent[];
  snapshot(): WorldSnapshot;
  debug(): WorldDebug;
  // Frees the physics world. The world must not be used afterwards.
  dispose(): void;
}

// One non-finite number would stay in the physics state for good, so it is treated as no input.
const finite = (value: number | undefined): number => (value !== undefined && Number.isFinite(value) ? value : 0);

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
        throttle: finite(driver?.moveY),
        steer: finite(driver?.moveX),
        brake: driver?.jump ?? false,
      });
      physics.step();
      tick += 1;
      return [];
    },
    snapshot: () => ({ tick, vehicle: vehicle.state() }),
    debug: () => ({ forwardSpeed: vehicle.forwardSpeed(), wheelSurfaces: vehicle.wheelSurfaces() }),
    dispose: () => physics.free(),
  };
}
```

`packages/client/src/loop.ts`:

```ts
import { CLIENT_MAX_CATCHUP_STEPS, TICK_DT } from '@lodgy/shared';

export interface FixedStepper {
  // Adds elapsed frame time and runs the ticks that are due. Returns how many ran.
  advance(frameSeconds: number): number;
}

export function createFixedStepper(tick: () => void): FixedStepper {
  let accumulator = 0;
  return {
    advance(frameSeconds) {
      // A NaN or negative frame time would poison or stall the accumulator.
      if (!(frameSeconds > 0)) return 0;
      accumulator += frameSeconds;
      let steps = 0;
      while (accumulator >= TICK_DT && steps < CLIENT_MAX_CATCHUP_STEPS) {
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

- [x] **Step 4: Make the registries safe and freeze the data**

Replace `packages/shared/src/courses/index.ts` with:

```ts
import type { BuiltCourse } from '../course';
import { testGround } from './testGround';

const COURSES: Record<string, BuiltCourse> = { [testGround.id]: testGround };

export function getCourse(courseId: string): BuiltCourse {
  const course = Object.hasOwn(COURSES, courseId) ? COURSES[courseId] : undefined;
  if (!course) throw new Error(`Unknown course: ${courseId}`);
  return course;
}
```

In `packages/shared/src/courses/testGround.ts` make three one-line changes:

1. Replace the import line
   `import { AXIS_X, IDENTITY, add, degToRad, quatFromAxisAngle, rotate, vec3, type Pose, type Vec3 } from '../math';`
   with
   `import { AXIS_X, IDENTITY, add, deepFreeze, degToRad, quatFromAxisAngle, rotate, vec3, type Pose, type Vec3 } from '../math';`
2. Replace `export const testGround: BuiltCourse = {` with `export const testGround: BuiltCourse = deepFreeze({`
3. Replace the `};` that closes that object (the line directly after `  targetTime: 120,`, and the last line of the file) with `});`

In `packages/shared/src/vehicles.ts` make four one-line changes:

1. Replace `import { vec3, type Vec3 } from './math';` with `import { deepFreeze, vec3, type Vec3 } from './math';`
2. Replace `export const VEHICLES: Record<VehicleId, VehicleConfig> = {` with `export const VEHICLES: Record<VehicleId, VehicleConfig> = deepFreeze({`
3. Replace the `};` that closes that object (the line directly before the blank line above `export function getVehicleConfig`) with `});`
4. Replace `  const config = (VEHICLES as Record<string, VehicleConfig | undefined>)[id];` with `  const config = Object.hasOwn(VEHICLES, id) ? VEHICLES[id as VehicleId] : undefined;`

Each line to replace occurs exactly once. If one does not, stop and report.

- [x] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: 9 files, 66 tests passing.

Run: `npm run typecheck`
Expected: exits 0.

Run: `npm run experiment:cable`
Expected: passes, and the row `lodgy     150  1.00     22.53      0.98     0.08        0.19               0.98` is unchanged.

- [x] **Step 6: Commit**

```bash
git add packages/shared/src packages/client/src/loop.ts packages/client/src/loop.test.ts
git commit -m "feat(shared): freeze shared data, free worlds and add server constants

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Message types and validators

**Files:**
- Modify: `packages/shared/src/protocol.ts`
- Test: `packages/shared/src/protocol.test.ts`

**Interfaces:**
- Consumes: `NAME_MAX_LENGTH`, `clamp`, `deepFreeze`, `WorldSnapshot`.
- Produces, all exported from `@lodgy/shared`:
  - `ClientMessage`: `{ type: 'create'; name; token }`, `{ type: 'join'; room; name; token }`, `{ type: 'input' } & PlayerInput`, `{ type: 'pong' }`
  - `ServerMessage`: `{ type: 'welcome'; playerId; room }`, `LobbyMessage`, `SnapshotMessage`, `{ type: 'error'; reason: ErrorReason }`, `{ type: 'ping' }`
  - `LobbyMessage { type: 'lobby'; room; phase: Phase; players: LobbyPlayer[]; adminId: string | null; courseId; vehicleId }`
  - `LobbyPlayer { playerId; name; colour; ready; connected }`
  - `SnapshotMessage extends WorldSnapshot { type: 'snapshot'; ackSeq: number; full: boolean }`
  - `ErrorReason = 'unknown_room' | 'room_full' | 'name_taken' | 'bad_message'`
  - `parseClientMessage(raw: string): ClientMessage | null`
  - `cleanName(value: unknown): string | null`, `cleanRoom(value: unknown): string | null`
  - `neutralInput(last: InputFields): InputFields`
  - `SOCKET_PATH = '/ws'`
  - `PlayerInput.seq` starts at 1; an `ackSeq` of 0 means no input has been consumed.

- [x] **Step 1: Write the failing test**

`packages/shared/src/protocol.test.ts`:

```ts
import { expect, test } from 'vitest';
import { NEUTRAL_INPUT, cleanName, cleanRoom, neutralInput, parseClientMessage, type PlayerInput } from './protocol';

const TOKEN = 'abcdefghijklmnop';
const INPUT: PlayerInput = { ...NEUTRAL_INPUT, seq: 1 };
const input = (changes: Record<string, unknown>) => JSON.stringify({ type: 'input', ...INPUT, ...changes });

test('accepts a create message and trims the name', () => {
  expect(parseClientMessage(JSON.stringify({ type: 'create', name: '  Amal ', token: TOKEN }))).toEqual({
    type: 'create',
    name: 'Amal',
    token: TOKEN,
  });
});

test('accepts a join message and lower-cases the room', () => {
  expect(parseClientMessage(JSON.stringify({ type: 'join', room: 'Camel', name: 'Amal', token: TOKEN }))).toEqual({
    type: 'join',
    room: 'camel',
    name: 'Amal',
    token: TOKEN,
  });
});

test('accepts pong', () => {
  expect(parseClientMessage('{"type":"pong"}')).toEqual({ type: 'pong' });
});

test.each([
  ['not JSON', 'nope'],
  ['a JSON array', '[]'],
  ['a JSON string', '"create"'],
  ['null', 'null'],
  ['an unknown type', '{"type":"dance"}'],
  ['a missing type', '{"name":"Amal"}'],
  ['an empty name', JSON.stringify({ type: 'create', name: '   ', token: TOKEN })],
  ['a 17-character name', JSON.stringify({ type: 'create', name: 'a'.repeat(17), token: TOKEN })],
  ['a name that is not a string', JSON.stringify({ type: 'create', name: 7, token: TOKEN })],
  ['a short token', JSON.stringify({ type: 'create', name: 'Amal', token: 'short' })],
  ['a token with a space', JSON.stringify({ type: 'create', name: 'Amal', token: 'abcdefgh ijklmnop' })],
  ['a room with a slash', JSON.stringify({ type: 'join', room: 'a/b', name: 'Amal', token: TOKEN })],
  ['an empty room', JSON.stringify({ type: 'join', room: '', name: 'Amal', token: TOKEN })],
])('rejects %s', (_label, raw) => {
  expect(parseClientMessage(raw)).toBeNull();
});

test('accepts an input and keeps its fields', () => {
  const raw = input({ seq: 42, moveX: 0.5, moveY: -0.25, jump: true, reel: -1, slot: 2 });
  expect(parseClientMessage(raw)).toEqual({
    type: 'input',
    ...INPUT,
    seq: 42,
    moveX: 0.5,
    moveY: -0.25,
    jump: true,
    reel: -1,
    slot: 2,
  });
});

test('clamps the axes and the pitch, and wraps the yaw', () => {
  const message = parseClientMessage(input({ moveX: 3, moveY: -9, pitch: 5, yaw: 3 * Math.PI + 0.5 }));
  expect(message).toMatchObject({ moveX: 1, moveY: -1, pitch: Math.PI / 2 });
  expect((message as PlayerInput).yaw).toBeCloseTo(-Math.PI + 0.5, 9);
});

test.each([
  ['a seq of 0', { seq: 0 }],
  ['a fractional seq', { seq: 1.5 }],
  ['a string seq', { seq: '1' }],
  ['a null axis (how JSON carries NaN)', { moveY: null }],
  ['a string axis', { moveX: '1' }],
  ['a number for a button', { jump: 1 }],
  ['a reel of 2', { reel: 2 }],
  ['a slot of 3', { slot: 3 }],
  ['a missing field', { drop: undefined }],
])('rejects an input with %s', (_label, changes) => {
  expect(parseClientMessage(input(changes))).toBeNull();
});

test('rejects an input whose number is too large to be finite', () => {
  expect(parseClientMessage(input({}).replace('"moveY":0', '"moveY":1e999'))).toBeNull();
});

test('cleanName and cleanRoom return null for bad values', () => {
  expect(cleanName(' Amal ')).toBe('Amal');
  expect(cleanName('')).toBeNull();
  expect(cleanRoom(' Tagine ')).toBe('tagine');
  expect(cleanRoom('tag ine')).toBeNull();
  expect(cleanRoom('constructor.')).toBeNull();
});

test('a neutral input releases everything but keeps the aim and the slot', () => {
  const last = { ...NEUTRAL_INPUT, moveY: 1, jump: true, yaw: 1.2, pitch: -0.3, slot: 2 as const, reel: 1 as const };
  expect(neutralInput(last)).toEqual({ ...NEUTRAL_INPUT, yaw: 1.2, pitch: -0.3, slot: 2 });
});

test('the shared neutral input cannot be modified', () => {
  expect(() => {
    (NEUTRAL_INPUT as { moveX: number }).moveX = 1;
  }).toThrow(TypeError);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/shared/src/protocol.test.ts`
Expected: FAIL, because `cleanName`, `cleanRoom`, `neutralInput` and `parseClientMessage` are not exported yet.

- [x] **Step 3: Replace `protocol.ts`**

`packages/shared/src/protocol.ts`:

```ts
import { NAME_MAX_LENGTH } from './constants';
import { clamp, deepFreeze } from './math';
import type { WorldSnapshot } from './world';

export interface PlayerInput {
  // Starts at 1 and rises by 1 with every input the client sends.
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

export const NEUTRAL_INPUT: InputFields = deepFreeze({
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
});

// The input substituted for a silent player: nothing pressed, aim and slot as they were.
export function neutralInput(last: InputFields): InputFields {
  return { ...NEUTRAL_INPUT, yaw: last.yaw, pitch: last.pitch, slot: last.slot };
}

// The path of the WebSocket endpoint on the server. No room can be named "ws".
export const SOCKET_PATH = '/ws';

export type ClientMessage =
  | { type: 'create'; name: string; token: string }
  | { type: 'join'; room: string; name: string; token: string }
  | ({ type: 'input' } & PlayerInput)
  | { type: 'pong' };

export type Phase = 'lobby' | 'playing' | 'results';

export type ErrorReason = 'unknown_room' | 'room_full' | 'name_taken' | 'bad_message';

export interface LobbyPlayer {
  playerId: string;
  name: string;
  colour: string;
  ready: boolean;
  connected: boolean;
}

export interface LobbyMessage {
  type: 'lobby';
  room: string;
  phase: Phase;
  players: LobbyPlayer[];
  adminId: string | null;
  courseId: string;
  vehicleId: string;
}

export interface SnapshotMessage extends WorldSnapshot {
  type: 'snapshot';
  // The last input sequence number the server consumed for the receiving client; 0 before any.
  ackSeq: number;
  full: boolean;
}

export type ServerMessage =
  | { type: 'welcome'; playerId: string; room: string }
  | LobbyMessage
  | SnapshotMessage
  | { type: 'error'; reason: ErrorReason }
  | { type: 'ping' };

const ROOM_PATTERN = /^[a-z0-9]{1,24}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

// A trimmed display name, or null if it is not 1 to 16 characters.
export function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name.length >= 1 && name.length <= NAME_MAX_LENGTH ? name : null;
}

// A room noun in lower case, or null if it is not a valid one.
export function cleanRoom(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const room = value.trim().toLowerCase();
  return ROOM_PATTERN.test(room) ? room : null;
}

const cleanToken = (value: unknown): string | null =>
  typeof value === 'string' && TOKEN_PATTERN.test(value) ? value : null;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

// Brings an angle into (-PI, PI].
function wrapAngle(angle: number): number {
  const wrapped = angle % (2 * Math.PI);
  if (wrapped > Math.PI) return wrapped - 2 * Math.PI;
  if (wrapped <= -Math.PI) return wrapped + 2 * Math.PI;
  return wrapped;
}

function parseInput(data: Record<string, unknown>): PlayerInput | null {
  const { seq, moveX, moveY, yaw, pitch, jump, interact, use, reel, slot, drop } = data;
  if (!Number.isSafeInteger(seq) || (seq as number) < 1) return null;
  if (!finite(moveX) || !finite(moveY) || !finite(yaw) || !finite(pitch)) return null;
  if (typeof jump !== 'boolean' || typeof interact !== 'boolean') return null;
  if (typeof use !== 'boolean' || typeof drop !== 'boolean') return null;
  if (reel !== -1 && reel !== 0 && reel !== 1) return null;
  if (slot !== 0 && slot !== 1 && slot !== 2) return null;
  return {
    seq: seq as number,
    moveX: clamp(moveX, -1, 1),
    moveY: clamp(moveY, -1, 1),
    yaw: wrapAngle(yaw),
    pitch: clamp(pitch, -Math.PI / 2, Math.PI / 2),
    jump,
    interact,
    use,
    reel,
    slot,
    drop,
  };
}

// Validates one message from a client. Returns null for anything malformed.
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const fields = data as Record<string, unknown>;
  switch (fields.type) {
    case 'create': {
      const name = cleanName(fields.name);
      const token = cleanToken(fields.token);
      return name && token ? { type: 'create', name, token } : null;
    }
    case 'join': {
      const room = cleanRoom(fields.room);
      const name = cleanName(fields.name);
      const token = cleanToken(fields.token);
      return room && name && token ? { type: 'join', room, name, token } : null;
    }
    case 'input': {
      const input = parseInput(fields);
      return input ? { type: 'input', ...input } : null;
    }
    case 'pong':
      return { type: 'pong' };
    default:
      return null;
  }
}
```

`protocol.ts` and `world.ts` import each other's types. Both imports are type-only, so nothing is circular at run time.

- [x] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: 10 files, 97 tests passing.

Run: `npm run typecheck`
Expected: exits 0.

- [x] **Step 5: Commit**

```bash
git add packages/shared/src/protocol.ts packages/shared/src/protocol.test.ts
git commit -m "feat(shared): add message types and validators

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Server package and its pure helpers

**Files:**
- Create: `packages/server/package.json`, `packages/server/tsconfig.json`
- Create: `packages/server/src/room/nouns.ts`, `packages/server/src/room/rateLimit.ts`, `packages/server/src/room/inputQueue.ts`
- Test: `packages/server/src/room/nouns.test.ts`, `packages/server/src/room/rateLimit.test.ts`, `packages/server/src/room/inputQueue.test.ts`
- Test: `packages/server/src/node/roomImports.test.ts` (added after the task's review, steps 8 to 10)
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: constants and protocol types from `@lodgy/shared`.
- Produces:
  - `NOUNS: readonly string[]`, `RESERVED_PATHS: readonly string[]`, `pickNoun(random: () => number, isTaken: (noun: string) => boolean): string`
  - `createRateLimiter(): RateLimiter` with `hit(now: number): 'ok' | 'drop' | 'close'`
  - `createInputQueue(): InputQueue` with `push(input: PlayerInput): void`, `next(): { input: InputFields; fresh: boolean }`, `ackSeq(): number`

- [x] **Step 1: Create the package**

`packages/server/package.json`:

```json
{
  "name": "@lodgy/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/node/main.ts",
    "start": "tsx src/node/main.ts"
  },
  "dependencies": {
    "@dimforge/rapier3d-compat": "0.21.0",
    "@lodgy/shared": "*",
    "ws": "8.22.2"
  },
  "devDependencies": {
    "@types/node": "26.6.6",
    "@types/ws": "8.18.2"
  }
}
```

`packages/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": [
    "src/room/**/*.ts"
  ]
}
```

In the root `package.json`, replace the line

```json
    "typecheck": "tsc -p packages/shared && tsc -p packages/client && tsc -p tsconfig.json",
```

with

```json
    "typecheck": "tsc -p packages/shared && tsc -p packages/server && tsc -p packages/client && tsc -p tsconfig.json",
```

and replace the `devDependencies` block with

```json
  "devDependencies": {
    "tsx": "4.23.15",
    "typescript": "7.0.2",
    "vitest": "5.1.0"
  }
```

- [x] **Step 2: Install**

Run: `npm install`
Expected: packages are added, `found 0 vulnerabilities`. The `EBADENGINE` warning is expected.

- [x] **Step 3: Write the failing tests**

`packages/server/src/room/nouns.test.ts`:

```ts
import { cleanRoom } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { NOUNS, RESERVED_PATHS, pickNoun } from './nouns';

test('every noun is a valid, unique, unreserved room name', () => {
  expect(new Set(NOUNS).size).toBe(NOUNS.length);
  for (const noun of NOUNS) {
    expect(noun).toMatch(/^[a-z]+$/);
    expect(cleanRoom(noun)).toBe(noun);
    expect(RESERVED_PATHS).not.toContain(noun);
  }
});

test('picks the noun the random source points at', () => {
  expect(pickNoun(() => 0, () => false)).toBe(NOUNS[0]);
  expect(pickNoun(() => 0.999999, () => false)).toBe(NOUNS[NOUNS.length - 1]);
});

test('skips nouns that are taken', () => {
  const taken = new Set([NOUNS[0], NOUNS[1]]);
  expect(pickNoun(() => 0, (noun) => taken.has(noun))).toBe(NOUNS[2]);
});

test('appends a number once every noun is taken', () => {
  const taken = new Set(NOUNS);
  expect(pickNoun(() => 0, (noun) => taken.has(noun))).toBe(`${NOUNS[0]}2`);
  for (const noun of NOUNS) taken.add(`${noun}2`);
  expect(pickNoun(() => 0, (noun) => taken.has(noun))).toBe(`${NOUNS[0]}3`);
});
```

`packages/server/src/room/rateLimit.test.ts`:

```ts
import { RATE_LIMIT_CLOSE_AFTER, RATE_LIMIT_PER_SECOND } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createRateLimiter, type RateVerdict } from './rateLimit';

// Sends `perSecond` messages evenly through each of `seconds` seconds, starting at `from`.
function flood(limiter: ReturnType<typeof createRateLimiter>, from: number, seconds: number, perSecond: number) {
  const verdicts: RateVerdict[] = [];
  for (let s = 0; s < seconds; s++) {
    for (let i = 0; i < perSecond; i++) verdicts.push(limiter.hit(from + s + i / perSecond));
  }
  return verdicts;
}

test('allows messages up to the limit in each second', () => {
  const verdicts = flood(createRateLimiter(), 0, 5, RATE_LIMIT_PER_SECOND);
  expect(verdicts.every((verdict) => verdict === 'ok')).toBe(true);
});

test('drops the messages beyond the limit within a second', () => {
  const verdicts = flood(createRateLimiter(), 0, 1, RATE_LIMIT_PER_SECOND + 30);
  expect(verdicts.filter((verdict) => verdict === 'ok')).toHaveLength(RATE_LIMIT_PER_SECOND);
  expect(verdicts.filter((verdict) => verdict === 'drop')).toHaveLength(30);
});

test('closes a connection that stays over the limit for the allowed time', () => {
  const verdicts = flood(createRateLimiter(), 0, RATE_LIMIT_CLOSE_AFTER + 2, RATE_LIMIT_PER_SECOND * 2);
  const firstClose = verdicts.indexOf('close');
  expect(firstClose).toBeGreaterThan(-1);
  const closeTime = firstClose / (RATE_LIMIT_PER_SECOND * 2);
  expect(closeTime).toBeGreaterThanOrEqual(RATE_LIMIT_CLOSE_AFTER);
  expect(closeTime).toBeLessThan(RATE_LIMIT_CLOSE_AFTER + 1);
});

test('a second within the limit forgives earlier bursts', () => {
  const limiter = createRateLimiter();
  flood(limiter, 0, 2, RATE_LIMIT_PER_SECOND * 2);
  flood(limiter, 2, 1, RATE_LIMIT_PER_SECOND);
  const verdicts = flood(limiter, 3, 2, RATE_LIMIT_PER_SECOND * 2);
  expect(verdicts).not.toContain('close');
});

test('a silent second forgives earlier bursts', () => {
  const limiter = createRateLimiter();
  flood(limiter, 0, 2, RATE_LIMIT_PER_SECOND * 2);
  const verdicts = flood(limiter, 4, 2, RATE_LIMIT_PER_SECOND * 2);
  expect(verdicts).not.toContain('close');
});
```

`packages/server/src/room/inputQueue.test.ts`:

```ts
import { INPUT_QUEUE_MAX, NEUTRAL_AFTER_TICKS, NEUTRAL_INPUT, type PlayerInput } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createInputQueue } from './inputQueue';

// An input whose moveX carries its sequence number, so tests can tell inputs apart.
const input = (seq: number, fields: Partial<PlayerInput> = {}): PlayerInput => ({
  ...NEUTRAL_INPUT,
  moveX: seq / 100,
  ...fields,
  seq,
});

test('gives the neutral input before anything arrives', () => {
  const queue = createInputQueue();
  expect(queue.next()).toEqual({ input: NEUTRAL_INPUT, fresh: false });
  expect(queue.ackSeq()).toBe(0);
});

test('consumes one input per tick, in order', () => {
  const queue = createInputQueue();
  queue.push(input(1));
  queue.push(input(2));
  expect(queue.next()).toMatchObject({ input: { moveX: 0.01 }, fresh: true });
  expect(queue.ackSeq()).toBe(1);
  expect(queue.next()).toMatchObject({ input: { moveX: 0.02 }, fresh: true });
  expect(queue.ackSeq()).toBe(2);
});

test('repeats the last input when the queue is empty, and marks it as not fresh', () => {
  const queue = createInputQueue();
  queue.push(input(1, { jump: true }));
  expect(queue.next().fresh).toBe(true);
  expect(queue.next()).toMatchObject({ input: { jump: true }, fresh: false });
  expect(queue.ackSeq()).toBe(1);
});

test('consumes two per tick while more than three are queued', () => {
  const queue = createInputQueue();
  for (let seq = 1; seq <= 5; seq++) queue.push(input(seq));
  expect(queue.next().input.moveX).toBe(0.02);
  expect(queue.ackSeq()).toBe(2);
  expect(queue.next().input.moveX).toBe(0.03);
  expect(queue.next().input.moveX).toBe(0.04);
  expect(queue.next().input.moveX).toBe(0.05);
  expect(queue.ackSeq()).toBe(5);
});

test('drops the oldest input when the queue overflows', () => {
  const queue = createInputQueue();
  for (let seq = 1; seq <= INPUT_QUEUE_MAX + 2; seq++) queue.push(input(seq));
  // Inputs 1 and 2 were dropped; 3 and 4 are consumed together.
  expect(queue.next().input.moveX).toBe(0.04);
  expect(queue.ackSeq()).toBe(4);
});

test('ignores an input that is not newer than the last one queued', () => {
  const queue = createInputQueue();
  queue.push(input(5));
  queue.push(input(5, { moveY: 1 }));
  queue.push(input(3, { moveY: 1 }));
  expect(queue.next().input).toMatchObject({ moveX: 0.05, moveY: 0 });
  expect(queue.next().fresh).toBe(false);
});

test('substitutes a neutral input after the silent-tick limit, keeping the aim and the slot', () => {
  const queue = createInputQueue();
  queue.push(input(1, { moveY: 1, jump: true, yaw: 1.5, pitch: 0.2, slot: 1 }));
  queue.next();
  for (let i = 0; i < NEUTRAL_AFTER_TICKS - 1; i++) {
    expect(queue.next().input).toMatchObject({ moveY: 1, jump: true });
  }
  expect(queue.next()).toEqual({ input: { ...NEUTRAL_INPUT, yaw: 1.5, pitch: 0.2, slot: 1 }, fresh: false });
});

test('a new input after the neutral substitute is used again', () => {
  const queue = createInputQueue();
  queue.push(input(1, { moveY: 1 }));
  for (let i = 0; i <= NEUTRAL_AFTER_TICKS; i++) queue.next();
  queue.push(input(2, { moveY: -1 }));
  expect(queue.next()).toMatchObject({ input: { moveY: -1 }, fresh: true });
});
```

- [x] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run packages/server`
Expected: FAIL in all three files, because `./nouns`, `./rateLimit` and `./inputQueue` cannot be resolved.

- [x] **Step 5: Write the implementations**

`packages/server/src/room/nouns.ts`:

```ts
// Room names. Lower-case letters only, so that none can match a static file path or a reserved path.
export const NOUNS: readonly string[] = [
  'tagine', 'camel', 'souk', 'riad', 'argan', 'atlas', 'medina', 'oasis', 'dune', 'palm',
  'mint', 'saffron', 'kasbah', 'minaret', 'lantern', 'caravan', 'olive', 'fig', 'cedar', 'almond',
  'cumin', 'harira', 'couscous', 'babouche', 'zellige', 'fountain', 'courtyard', 'terrace', 'donkey', 'stork',
  'gecko', 'falcon', 'jackal', 'gazelle', 'tortoise', 'hedgehog', 'cactus', 'jasmine', 'orange', 'lemon',
  'apricot', 'pepper', 'ginger', 'cinnamon', 'clove', 'honey', 'teapot', 'kettle', 'carpet', 'drum',
  'flute', 'kite', 'compass', 'pebble', 'canyon', 'gorge', 'summit', 'valley', 'river', 'bridge',
];

// Paths the server uses for something else; no room may take one.
export const RESERVED_PATHS: readonly string[] = ['ws', 'assets', 'index', 'favicon'];

// Picks a noun no live room uses. When every noun is taken, a number is appended.
export function pickNoun(random: () => number, isTaken: (noun: string) => boolean): string {
  const start = Math.floor(random() * NOUNS.length) % NOUNS.length;
  for (let suffix = 1; ; suffix++) {
    for (let i = 0; i < NOUNS.length; i++) {
      const word = NOUNS[(start + i) % NOUNS.length]!;
      const noun = suffix === 1 ? word : `${word}${suffix}`;
      if (!isTaken(noun)) return noun;
    }
  }
}
```

`packages/server/src/room/rateLimit.ts`:

```ts
import { RATE_LIMIT_CLOSE_AFTER, RATE_LIMIT_PER_SECOND } from '@lodgy/shared';

export type RateVerdict = 'ok' | 'drop' | 'close';

export interface RateLimiter {
  // Counts one message received at `now` (seconds) and says what to do with it.
  hit(now: number): RateVerdict;
}

export function createRateLimiter(): RateLimiter {
  let windowStart = Number.NEGATIVE_INFINITY;
  let count = 0;
  // When the current unbroken run of over-limit seconds began.
  let overSince: number | null = null;
  return {
    hit(now) {
      if (now - windowStart >= 1) {
        // The run is broken by a second within the limit, or by a whole second of silence.
        if (count <= RATE_LIMIT_PER_SECOND || now - windowStart >= 2) overSince = null;
        windowStart = now;
        count = 0;
      }
      count += 1;
      if (count <= RATE_LIMIT_PER_SECOND) return 'ok';
      overSince ??= now;
      return now - overSince >= RATE_LIMIT_CLOSE_AFTER ? 'close' : 'drop';
    },
  };
}
```

`packages/server/src/room/inputQueue.ts`:

```ts
import {
  INPUT_QUEUE_FAST_ABOVE,
  INPUT_QUEUE_MAX,
  NEUTRAL_AFTER_TICKS,
  NEUTRAL_INPUT,
  neutralInput,
  type InputFields,
  type PlayerInput,
} from '@lodgy/shared';

export interface TickInput {
  input: InputFields;
  // False when the input repeats an earlier one or is the neutral substitute; a repeat is never a new press.
  fresh: boolean;
}

export interface InputQueue {
  // Queues an input received from the client. Inputs that are not newer than the last one queued are ignored.
  push(input: PlayerInput): void;
  // The input to simulate this tick. Call exactly once per tick.
  next(): TickInput;
  // The sequence number of the last input consumed; 0 before any.
  ackSeq(): number;
}

export function createInputQueue(): InputQueue {
  const queue: PlayerInput[] = [];
  let lastQueuedSeq = 0;
  let ackSeq = 0;
  let last: InputFields = NEUTRAL_INPUT;
  let ticksWithoutInput = 0;

  return {
    push(input) {
      if (input.seq <= lastQueuedSeq) return;
      lastQueuedSeq = input.seq;
      queue.push(input);
      if (queue.length > INPUT_QUEUE_MAX) queue.shift();
    },
    next() {
      if (queue.length === 0) {
        ticksWithoutInput += 1;
        if (ticksWithoutInput >= NEUTRAL_AFTER_TICKS) last = neutralInput(last);
        return { input: last, fresh: false };
      }
      // A long queue means the client is ahead of the server; taking two brings the delay back down.
      const take = queue.length > INPUT_QUEUE_FAST_ABOVE ? 2 : 1;
      const consumed = queue.splice(0, take);
      const { seq, ...fields } = consumed[consumed.length - 1]!;
      ackSeq = seq;
      last = fields;
      ticksWithoutInput = 0;
      return { input: last, fresh: true };
    },
    ackSeq: () => ackSeq,
  };
}
```

- [x] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: 13 files, 114 tests passing.

Run: `npm run typecheck`
Expected: exits 0.

- [x] **Step 7: Commit**

```bash
git add package.json package-lock.json packages/server
git commit -m "feat(server): add the server package with nouns, rate limiter and input queue

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [x] **Step 8: Write the import guard test**

The review of this task found that `packages/server/tsconfig.json` does not fully enforce the room layer's import rule: `import … from 'ws'` type-checks, and it brings Node's types in with it, after which `node:` imports and `setTimeout` compile in every room file. This test closes the hole. It lives in `src/node` because it reads files with Node; no tsconfig type-checks it until Task 6 adds `tsconfig.node.json`, and Vitest runs it from now on. It makes one test per room file, so the test count grows as later tasks add room files.

Create `packages/server/src/node/roomImports.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// The room tsconfig alone cannot enforce this: importing "ws" type-checks and brings Node's types in with it.
const roomDir = fileURLToPath(new URL('../room', import.meta.url));
const roomFiles = readdirSync(roomDir, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.ts'))
  .sort();

const ALLOWED_EVERYWHERE = /^(\.{1,2}\/[\w./-]+|@lodgy\/shared)$/;
const ALLOWED_IN_TESTS = /^(vitest|@dimforge\/rapier3d-compat)$/;
const SPECIFIER = /\b(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g;

function specifiers(source: string): string[] {
  return [...source.matchAll(SPECIFIER)].map((match) => match[1]!);
}

test('the room layer has files to check', () => {
  expect(roomFiles).toContain('nouns.ts');
});

test.each(roomFiles)('room/%s imports only room files and @lodgy/shared', (file) => {
  const source = readFileSync(path.join(roomDir, file), 'utf8');
  const isTest = file.endsWith('.test.ts');
  const forbidden = specifiers(source).filter(
    (specifier) => !ALLOWED_EVERYWHERE.test(specifier) && !(isTest && ALLOWED_IN_TESTS.test(specifier)),
  );
  expect(forbidden).toEqual([]);
  // A relative import must not climb out of the room layer into the Node adapter.
  const outside = specifiers(source).filter(
    (specifier) => specifier.startsWith('.') && !path.resolve(roomDir, path.dirname(file), specifier).startsWith(roomDir + path.sep),
  );
  expect(outside).toEqual([]);
  // A triple-slash reference would bring Node or DOM types in without an import.
  expect(source).not.toMatch(/\/\/\/\s*<reference/);
});
```

- [x] **Step 9: Watch the guard fail, then pass**

Create a temporary file `packages/server/src/room/zzProbe.ts`:

```ts
import { WebSocket } from 'ws';
export const x = WebSocket;
```

Run: `npx vitest run packages/server/src/node/roomImports.test.ts`
Expected: FAIL, 1 failed and 7 passed; the failure is `room/zzProbe.ts imports only room files and @lodgy/shared` with `expected [ 'ws' ] to deeply equal []`.

Delete `packages/server/src/room/zzProbe.ts`.

Run: `npm test`
Expected: 14 files, 121 tests passing.

Run: `npm run typecheck`
Expected: exits 0.

- [x] **Step 10: Commit**

```bash
git add packages/server/src/node/roomImports.test.ts
git commit -m "test(server): guard the room layer's imports

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: The room layer

Steps 7 to 10 were added after this task's review; they also modify `packages/shared/src/constants.ts` and `packages/shared/src/protocol.ts` and add `packages/server/src/room/roomFailure.test.ts`.

**Files:**
- Create: `packages/server/src/room/types.ts`, `packages/server/src/room/testing.ts`, `packages/server/src/room/room.ts`, `packages/server/src/room/server.ts`
- Test: `packages/server/src/room/server.test.ts`

**Interfaces:**
- Consumes: Task 4's helpers; `createWorld`, `parseClientMessage` and the message types from `@lodgy/shared`.
- Produces:
  - `Connection { send(data: string): void; close(): void }`
  - `ConnectionHandle { message(data: string): void; closed(): void }`
  - `RoomDeps { rapier: Rapier; clock: () => number; random: () => number; timer: Timer }` where `Timer { every(seconds: number, fn: () => void): () => void }`
  - `createRoomServer(deps: RoomDeps, options?: { courseId?: string; vehicleId?: string }): RoomServer`
  - `RoomServer { connect(connection: Connection): ConnectionHandle; roomCount(): number; stop(): void }`
  - for tests: `createFakeDeps(rapier)` and `connectFakeClient(server)` from `testing.ts`

Behaviour, in the order a connection meets it:

- Every message counts as a sign of life and passes the rate limiter before anything else.
- A malformed message gets `error { reason: 'bad_message' }`. The connection stays open.
- `create` makes a room with a fresh noun, adds the player as `p1` and admin, sends `welcome` to that connection and then `lobby` to the room.
- `join` to an unknown room gets `unknown_room`; to a room with 6 players, `room_full`; with a name already present ignoring case, `name_taken`. A join whose token matches a connected player takes that player over: the old connection is closed and the player keeps their id and name.
- `create` or `join` from a connection already in a room gets `bad_message`. `input` from a connection not in a room is ignored.
- A player whose connection closes, goes silent for 6 s or is closed by the rate limiter leaves the room. If they were admin, the first remaining player becomes admin.
- Each room steps its world 60 times a second, at most 3 steps per timer callback, and sends a snapshot every 3 ticks. The first snapshot each connection receives has `full: true`.

- [x] **Step 1: Write the types and the test fakes**

`packages/server/src/room/types.ts`:

```ts
import type { Rapier } from '@lodgy/shared';

// One client's connection, as the room layer sees it. The adapter implements it over a real socket.
export interface Connection {
  send(data: string): void;
  close(): void;
}

// What the adapter calls when the connection receives a message or closes.
export interface ConnectionHandle {
  message(data: string): void;
  closed(): void;
}

export interface Timer {
  // Calls fn repeatedly, about every `seconds`. Returns a function that stops it.
  every(seconds: number, fn: () => void): () => void;
}

// Everything the room layer needs from outside. Tests pass fakes.
export interface RoomDeps {
  rapier: Rapier;
  // Seconds from any fixed origin; it must never go backwards.
  clock: () => number;
  // A number in [0, 1).
  random: () => number;
  timer: Timer;
}

export interface RoomServerOptions {
  // Until the lobby exists (step 11), every room runs this course with this vehicle.
  courseId?: string;
  vehicleId?: string;
}

export interface RoomServer {
  connect(connection: Connection): ConnectionHandle;
  roomCount(): number;
  // Stops the timer and frees every room.
  stop(): void;
}
```

`packages/server/src/room/testing.ts`:

```ts
import type { ClientMessage, Rapier, ServerMessage } from '@lodgy/shared';
import type { ConnectionHandle, RoomDeps, RoomServer } from './types';

// Fakes for tests of the room layer: a clock and timer moved by hand, and connections that record what they are sent.

export interface FakeDeps {
  deps: RoomDeps;
  // Moves the clock forward, running every timer callback that falls due on the way.
  advance(seconds: number): void;
  // Moves the clock forward without running any timer callback, as if the process had stalled.
  stall(seconds: number): void;
  // The values the random source returns next; it returns 0 once they run out.
  randomValues: number[];
}

export function createFakeDeps(rapier: Rapier): FakeDeps {
  let now = 0;
  const timers: { period: number; fn: () => void; origin: number; fired: number }[] = [];
  const randomValues: number[] = [];
  // Due times are origin + n × period, never a running sum, so they do not drift.
  const nextDue = () => {
    let best: (typeof timers)[number] | undefined;
    for (const timer of timers) {
      const due = timer.origin + (timer.fired + 1) * timer.period;
      if (!best || due < best.origin + (best.fired + 1) * best.period) best = timer;
    }
    return best;
  };
  return {
    deps: {
      rapier,
      clock: () => now,
      random: () => randomValues.shift() ?? 0,
      timer: {
        every(seconds, fn) {
          const timer = { period: seconds, fn, origin: now, fired: 0 };
          timers.push(timer);
          return () => {
            const index = timers.indexOf(timer);
            if (index !== -1) timers.splice(index, 1);
          };
        },
      },
    },
    advance(seconds) {
      const target = now + seconds;
      for (let timer = nextDue(); timer; timer = nextDue()) {
        const due = timer.origin + (timer.fired + 1) * timer.period;
        if (due > target + 1e-9) break;
        now = Math.max(now, due);
        timer.fired += 1;
        timer.fn();
      }
      now = target;
    },
    stall(seconds) {
      now += seconds;
      // Callbacks missed during a stall are not made up afterwards.
      for (const timer of timers) timer.fired = Math.floor((now - timer.origin) / timer.period + 1e-9);
    },
    randomValues,
  };
}

export interface FakeClient {
  // Every message the server has sent this client, oldest first.
  received: ServerMessage[];
  // True once the server has closed the connection.
  closedByServer: boolean;
  send(message: ClientMessage): void;
  sendRaw(data: string): void;
  // Closes the connection from the client's side.
  close(): void;
  ofType<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }>[];
  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }>;
}

export function connectFakeClient(server: RoomServer): FakeClient {
  const received: ServerMessage[] = [];
  let handle: ConnectionHandle | null = null;
  const client: FakeClient = {
    received,
    closedByServer: false,
    send: (message) => handle?.message(JSON.stringify(message)),
    sendRaw: (data) => handle?.message(data),
    close: () => handle?.closed(),
    ofType: <T extends ServerMessage['type']>(type: T) =>
      received.filter((message): message is Extract<ServerMessage, { type: T }> => message.type === type),
    last<T extends ServerMessage['type']>(type: T) {
      const matches = client.ofType(type);
      const message = matches[matches.length - 1];
      if (!message) throw new Error(`No ${type} message received`);
      return message;
    },
  };
  handle = server.connect({
    send: (data) => received.push(JSON.parse(data) as ServerMessage),
    close: () => {
      client.closedByServer = true;
    },
  });
  return client;
}
```

- [x] **Step 2: Write the failing test**

`packages/server/src/room/server.test.ts`:

```ts
import RAPIER from '@dimforge/rapier3d-compat';
import {
  EMPTY_ROOM_TIMEOUT,
  MAX_PLAYERS,
  NEUTRAL_INPUT,
  PING_INTERVAL,
  PLAYER_COLOURS,
  RATE_LIMIT_CLOSE_AFTER,
  RATE_LIMIT_PER_SECOND,
  SERVER_MAX_CATCHUP_STEPS,
  SILENCE_TIMEOUT,
  SNAPSHOT_EVERY_TICKS,
  TICK_RATE,
  type ClientMessage,
  type PlayerInput,
} from '@lodgy/shared';
import { beforeAll, expect, test } from 'vitest';
import { NOUNS } from './nouns';
import { createRoomServer } from './server';
import { connectFakeClient, createFakeDeps, type FakeClient } from './testing';
import type { RoomServerOptions } from './types';

beforeAll(async () => {
  await RAPIER.init();
});

const token = (n: number) => `token-${n}-abcdefghij`;
const input = (seq: number, fields: Partial<PlayerInput> = {}): ClientMessage => ({
  type: 'input',
  ...NEUTRAL_INPUT,
  ...fields,
  seq,
});

function setup(options?: RoomServerOptions) {
  const fake = createFakeDeps(RAPIER);
  const server = createRoomServer(fake.deps, options);
  const connect = () => connectFakeClient(server);
  // Connects a client and creates a room with it.
  const host = (name = 'Amal') => {
    const client = connect();
    client.send({ type: 'create', name, token: token(1) });
    return { client, room: client.last('welcome').room };
  };
  // Connects a client and joins `room` with it.
  const guest = (room: string, n: number, name = `Guest${n}`) => {
    const client = connect();
    client.send({ type: 'join', room, name, token: token(n) });
    return client;
  };
  return { ...fake, server, connect, host, guest };
}

const reasons = (client: FakeClient) => client.ofType('error').map((message) => message.reason);

// --- rooms ---

test('create makes a room and welcomes its creator, then announces the lobby', () => {
  const { host, server } = setup();
  const { client, room } = host('Amal');
  expect(room).toBe(NOUNS[0]);
  expect(server.roomCount()).toBe(1);
  expect(client.received[0]).toEqual({ type: 'welcome', playerId: 'p1', room });
  expect(client.received[1]).toEqual({
    type: 'lobby',
    room,
    phase: 'playing',
    players: [{ playerId: 'p1', name: 'Amal', colour: PLAYER_COLOURS[0], ready: false, connected: true }],
    adminId: 'p1',
    courseId: 'test',
    vehicleId: 'lodgy',
  });
});

test('each room gets its own noun', () => {
  const { host } = setup();
  expect(host().room).toBe(NOUNS[0]);
  expect(host().room).toBe(NOUNS[1]);
});

test('the random source chooses the noun', () => {
  const { host, randomValues } = setup();
  randomValues.push(0.5);
  expect(host().room).toBe(NOUNS[Math.floor(NOUNS.length / 2)]);
});

test('the room runs the configured vehicle', () => {
  const { host } = setup({ vehicleId: 'rv' });
  expect(host().client.last('lobby').vehicleId).toBe('rv');
});

test('an unknown course or vehicle is refused when the server is created', () => {
  const fake = createFakeDeps(RAPIER);
  expect(() => createRoomServer(fake.deps, { vehicleId: 'bus' })).toThrow('Unknown vehicle: bus');
  expect(() => createRoomServer(fake.deps, { courseId: 'moon' })).toThrow('Unknown course: moon');
});

test('join welcomes the newcomer and announces the lobby to everyone', () => {
  const { host, guest } = setup();
  const { client: amal, room } = host('Amal');
  const badr = guest(room, 2, 'Badr');
  expect(badr.received[0]).toEqual({ type: 'welcome', playerId: 'p2', room });
  for (const client of [amal, badr]) {
    const lobby = client.last('lobby');
    expect(lobby.players.map((player) => player.name)).toEqual(['Amal', 'Badr']);
    expect(lobby.players.map((player) => player.colour)).toEqual([PLAYER_COLOURS[0], PLAYER_COLOURS[1]]);
    expect(lobby.adminId).toBe('p1');
  }
});

test('join finds the room whatever the case of the noun', () => {
  const { host, guest } = setup();
  const { room } = host();
  expect(guest(room.toUpperCase(), 2).last('welcome').room).toBe(room);
});

test('join refuses an unknown room', () => {
  const { host, guest } = setup();
  host();
  expect(reasons(guest('nowhere', 2))).toEqual(['unknown_room']);
});

test('join refuses a name already in the room, ignoring case', () => {
  const { host, guest } = setup();
  const { room } = host('Amal');
  expect(reasons(guest(room, 2, 'aMAL'))).toEqual(['name_taken']);
});

test('a refused client can try again on the same connection', () => {
  const { host, guest } = setup();
  const { room } = host('Amal');
  const client = guest(room, 2, 'Amal');
  client.send({ type: 'join', room, name: 'Badr', token: token(2) });
  expect(client.last('welcome').playerId).toBe('p2');
});

test('join refuses a seventh player', () => {
  const { host, guest } = setup();
  const { room } = host();
  for (let n = 2; n <= MAX_PLAYERS; n++) expect(guest(room, n).ofType('welcome')).toHaveLength(1);
  expect(reasons(guest(room, MAX_PLAYERS + 1))).toEqual(['room_full']);
});

test('create and join are refused once the connection is in a room', () => {
  const { host } = setup();
  const { client, room } = host();
  client.send({ type: 'create', name: 'Again', token: token(1) });
  client.send({ type: 'join', room, name: 'Again', token: token(1) });
  expect(reasons(client)).toEqual(['bad_message', 'bad_message']);
});

test('a malformed message gets bad_message and the connection stays usable', () => {
  const { connect } = setup();
  const client = connect();
  client.sendRaw('not json');
  client.sendRaw('{"type":"create","name":"","token":"x"}');
  expect(reasons(client)).toEqual(['bad_message', 'bad_message']);
  client.send({ type: 'create', name: 'Amal', token: token(1) });
  expect(client.ofType('welcome')).toHaveLength(1);
});

// --- leaving ---

test('a player who disconnects leaves the room, and their colour and name become free', () => {
  const { host, guest } = setup();
  const { client: amal, room } = host('Amal');
  const badr = guest(room, 2, 'Badr');
  badr.close();
  expect(amal.last('lobby').players.map((player) => player.name)).toEqual(['Amal']);
  const again = guest(room, 3, 'Badr');
  expect(again.last('welcome').playerId).toBe('p3');
  expect(again.last('lobby').players[1]!.colour).toBe(PLAYER_COLOURS[1]);
});

test('the admin role passes to the longest-connected player', () => {
  const { host, guest } = setup();
  const { client: amal, room } = host();
  const badr = guest(room, 2);
  const chadi = guest(room, 3);
  amal.close();
  expect(badr.last('lobby').adminId).toBe('p2');
  expect(chadi.last('lobby').adminId).toBe('p2');
});

test('when everyone has left, the next player to join becomes admin', () => {
  const { host, guest } = setup();
  const { client: amal, room } = host();
  amal.close();
  expect(guest(room, 2).last('lobby').adminId).toBe('p2');
});

test('an empty room is deleted after the timeout, and not before', () => {
  const { host, guest, advance, server } = setup();
  const { client, room } = host();
  client.close();
  advance(EMPTY_ROOM_TIMEOUT - 1);
  expect(server.roomCount()).toBe(1);
  advance(1);
  expect(server.roomCount()).toBe(0);
  expect(reasons(guest(room, 2))).toEqual(['unknown_room']);
});

test('a room that someone rejoins is not deleted', () => {
  const { host, guest, advance, server } = setup();
  const { client, room } = host();
  client.close();
  advance(EMPTY_ROOM_TIMEOUT - 1);
  const badr = guest(room, 2);
  advance(5);
  expect(server.roomCount()).toBe(1);
  // The timeout starts again from the moment the room next empties.
  badr.close();
  advance(EMPTY_ROOM_TIMEOUT - 1);
  expect(server.roomCount()).toBe(1);
  advance(1);
  expect(server.roomCount()).toBe(0);
});

test('a join with the token of a connected player takes that player over', () => {
  const { host, connect, advance } = setup();
  const { client: first, room } = host('Amal');
  first.send(input(1, { moveY: 1 }));
  first.send(input(2, { moveY: 1 }));
  advance(0.5);

  const second = connect();
  second.send({ type: 'join', room, name: 'Other name', token: token(1) });
  expect(first.closedByServer).toBe(true);
  expect(second.received[0]).toEqual({ type: 'welcome', playerId: 'p1', room });
  expect(second.last('lobby').players).toHaveLength(1);
  expect(second.last('lobby').players[0]!.name).toBe('Amal');

  // The old connection's close arrives late and must not remove the player.
  first.close();
  // The new connection numbers its inputs from 1 again.
  second.send(input(1, { moveY: 1 }));
  advance(0.5);
  expect(second.last('lobby').players).toHaveLength(1);
  expect(second.last('snapshot').ackSeq).toBe(1);
  expect(second.ofType('snapshot')[0]!.full).toBe(true);
});

// --- simulation and snapshots ---

test('snapshots arrive 20 times a second, the first one full', () => {
  const { host, advance } = setup();
  const { client } = host();
  advance(1);
  const snapshots = client.ofType('snapshot');
  expect(snapshots).toHaveLength(TICK_RATE / SNAPSHOT_EVERY_TICKS);
  expect(snapshots.map((snapshot) => snapshot.tick)).toEqual(
    snapshots.map((_, index) => (index + 1) * SNAPSHOT_EVERY_TICKS),
  );
  expect(snapshots.map((snapshot) => snapshot.full)).toEqual(snapshots.map((_, index) => index === 0));
  expect(snapshots[0]!.vehicle.pos.z).toBeCloseTo(0, 1);
});

test('a player who joins mid-run gets a full snapshot first', () => {
  const { host, guest, advance } = setup();
  const { room } = host();
  advance(1);
  const badr = guest(room, 2);
  advance(0.2);
  const snapshots = badr.ofType('snapshot');
  expect(snapshots[0]!.full).toBe(true);
  expect(snapshots[0]!.tick).toBeGreaterThan(TICK_RATE);
  expect(snapshots[1]!.full).toBe(false);
});

test('the first player drives; the others do not', () => {
  const { host, guest, advance } = setup();
  const { client: amal, room } = host();
  const badr = guest(room, 2);
  advance(1);
  let seq = 0;
  // One input per tick for two seconds: Badr holds full throttle, Amal steers nothing and stays off the pedal.
  for (let i = 0; i < 2 * TICK_RATE; i++) {
    seq += 1;
    badr.send(input(seq, { moveY: 1 }));
    advance(1 / TICK_RATE);
  }
  expect(amal.last('snapshot').vehicle.pos.z).toBeCloseTo(0, 1);

  for (let i = 0; i < 2 * TICK_RATE; i++) {
    seq += 1;
    amal.send(input(seq, { moveY: 1 }));
    advance(1 / TICK_RATE);
  }
  const { vehicle } = badr.last('snapshot');
  expect(vehicle.pos.z).toBeLessThan(-2);
  expect(vehicle.throttle).toBe(1);
});

test('when the driver leaves, the next player drives', () => {
  const { host, guest, advance } = setup();
  const { client: amal, room } = host();
  const badr = guest(room, 2);
  amal.close();
  for (let seq = 1; seq <= 2 * TICK_RATE; seq++) {
    badr.send(input(seq, { moveY: 1 }));
    advance(1 / TICK_RATE);
  }
  expect(badr.last('snapshot').vehicle.pos.z).toBeLessThan(-2);
});

test('each client is told the last of its own inputs that was consumed', () => {
  const { host, guest, advance } = setup();
  const { client: amal, room } = host();
  const badr = guest(room, 2);
  amal.send(input(1));
  amal.send(input(2));
  badr.send(input(1));
  advance(0.5);
  expect(amal.last('snapshot').ackSeq).toBe(2);
  expect(badr.last('snapshot').ackSeq).toBe(1);
});

test('input from a connection that is not in a room is ignored', () => {
  const { connect, advance } = setup();
  const client = connect();
  client.send(input(1, { moveY: 1 }));
  advance(0.5);
  expect(client.received).toEqual([]);
});

test('a silent driver stops pressing the pedal after the neutral-input delay', () => {
  const { host, advance } = setup();
  const { client } = host();
  client.send(input(1, { moveY: 1 }));
  advance(0.1);
  expect(client.last('snapshot').vehicle.throttle).toBe(1);
  advance(0.5);
  expect(client.last('snapshot').vehicle.throttle).toBe(0);
});

test('after a stall the room runs only the catch-up limit and drops the rest', () => {
  const { host, advance, stall } = setup();
  const { client } = host();
  advance(1);
  const before = client.last('snapshot').tick;
  // Three seconds without a timer callback: 180 ticks are owed.
  stall(3);
  advance(1 / TICK_RATE);
  const after = client.last('snapshot').tick;
  expect(after - before).toBeGreaterThanOrEqual(SERVER_MAX_CATCHUP_STEPS);
  expect(after - before).toBeLessThanOrEqual(SERVER_MAX_CATCHUP_STEPS + SNAPSHOT_EVERY_TICKS);
  // The loop is back in step: one more second gives one more second of ticks.
  advance(1);
  expect(client.last('snapshot').tick - after).toBe(TICK_RATE);
});

test('an empty room is paused and resumes where it was', () => {
  const { host, guest, advance } = setup();
  const { client, room } = host();
  advance(1);
  const before = client.last('snapshot').tick;
  client.close();
  advance(10);
  const badr = guest(room, 2);
  advance(0.1);
  const first = badr.ofType('snapshot')[0]!;
  expect(first.tick).toBeGreaterThan(before);
  expect(first.tick).toBeLessThanOrEqual(before + 2 * SNAPSHOT_EVERY_TICKS);
});

// --- liveness and rate limit ---

test('the server pings every connection at the ping interval', () => {
  const { connect, advance } = setup();
  const client = connect();
  advance(PING_INTERVAL - 0.1);
  expect(client.ofType('ping')).toHaveLength(0);
  advance(0.2);
  expect(client.ofType('ping')).toHaveLength(1);
});

test('a connection that keeps answering stays; one that goes silent is dropped from its room', () => {
  const { host, guest, advance } = setup();
  const { client: amal, room } = host('Amal');
  const badr = guest(room, 2, 'Badr');
  for (let second = 0; second < SILENCE_TIMEOUT + 2; second++) {
    amal.send({ type: 'pong' });
    advance(1);
  }
  expect(amal.closedByServer).toBe(false);
  expect(badr.closedByServer).toBe(true);
  expect(amal.last('lobby').players.map((player) => player.name)).toEqual(['Amal']);
});

test('messages beyond the rate limit within a second are dropped', () => {
  const { connect } = setup();
  const client = connect();
  for (let i = 0; i < RATE_LIMIT_PER_SECOND + 50; i++) client.sendRaw('garbage');
  expect(client.ofType('error')).toHaveLength(RATE_LIMIT_PER_SECOND);
  expect(client.closedByServer).toBe(false);
});

test('a connection that stays over the rate limit is closed and removed', () => {
  const { host, guest, advance } = setup();
  const { client: amal, room } = host('Amal');
  const badr = guest(room, 2, 'Badr');
  for (let tenth = 0; tenth < (RATE_LIMIT_CLOSE_AFTER + 2) * 10 && !badr.closedByServer; tenth++) {
    for (let i = 0; i < RATE_LIMIT_PER_SECOND; i++) badr.send({ type: 'pong' });
    amal.send({ type: 'pong' });
    advance(0.1);
  }
  expect(badr.closedByServer).toBe(true);
  expect(amal.last('lobby').players.map((player) => player.name)).toEqual(['Amal']);
});

test('stop frees every room', () => {
  const { host, server } = setup();
  host();
  host();
  server.stop();
  expect(server.roomCount()).toBe(0);
});
```

- [x] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/server/src/room/server.test.ts`
Expected: FAIL, because `./server` cannot be resolved.

- [x] **Step 4: Write the room and the room server**

`packages/server/src/room/room.ts`:

```ts
import {
  PLAYER_COLOURS,
  SERVER_MAX_CATCHUP_STEPS,
  SNAPSHOT_EVERY_TICKS,
  TICK_DT,
  TICK_RATE,
  createWorld,
  type InputFields,
  type LobbyMessage,
  type PlayerInput,
  type Rapier,
  type SnapshotMessage,
} from '@lodgy/shared';
import { createInputQueue, type InputQueue } from './inputQueue';
import type { Connection } from './types';

export interface RoomPlayer {
  readonly playerId: string;
  readonly name: string;
  readonly colour: string;
  readonly token: string;
  connection: Connection;
  queue: InputQueue;
  // Whether this connection has been sent a full snapshot yet.
  sentFull: boolean;
}

export interface Room {
  readonly noun: string;
  playerCount(): number;
  findByToken(token: string): RoomPlayer | undefined;
  // Names are compared ignoring case.
  nameTaken(name: string): boolean;
  // add and replaceConnection do not announce; the caller sends welcome first, then calls announce.
  add(name: string, token: string, connection: Connection): RoomPlayer;
  // Hands a player's slot to a new connection and returns the old one.
  replaceConnection(player: RoomPlayer, connection: Connection): Connection;
  remove(player: RoomPlayer, now: number): void;
  // Sends the lobby message to every player.
  announce(): void;
  pushInput(player: RoomPlayer, input: PlayerInput): void;
  // Runs the simulation ticks that are due at `now` and broadcasts snapshots.
  update(now: number): void;
  // When the last player left, or null while anyone is connected.
  emptySince(): number | null;
  dispose(): void;
}

export interface RoomConfig {
  noun: string;
  courseId: string;
  vehicleId: string;
}

export function createRoom(rapier: Rapier, config: RoomConfig, createdAt: number): Room {
  const world = createWorld(rapier, { courseId: config.courseId, vehicleId: config.vehicleId });
  // Kept in the order players joined: the first is the driver until seats exist (step 3).
  const players: RoomPlayer[] = [];
  let nextPlayerNumber = 1;
  let adminId: string | null = null;
  let tick = 0;
  // The time at which tick 0 would have run, given the ticks simulated so far.
  let startTime = createdAt;
  let emptySince: number | null = createdAt;

  const broadcastLobby = () => {
    const message: LobbyMessage = {
      type: 'lobby',
      room: config.noun,
      phase: 'playing',
      players: players.map(({ playerId, name, colour }) => ({ playerId, name, colour, ready: false, connected: true })),
      adminId,
      courseId: config.courseId,
      vehicleId: config.vehicleId,
    };
    const data = JSON.stringify(message);
    for (const player of players) player.connection.send(data);
  };

  const broadcastSnapshot = () => {
    const snapshot = world.snapshot();
    for (const player of players) {
      const message: SnapshotMessage = {
        type: 'snapshot',
        ...snapshot,
        ackSeq: player.queue.ackSeq(),
        full: !player.sentFull,
      };
      player.sentFull = true;
      player.connection.send(JSON.stringify(message));
    }
  };

  const stepOnce = () => {
    const inputs = new Map<string, InputFields>();
    for (const player of players) inputs.set(player.playerId, player.queue.next().input);
    world.step(inputs);
    tick += 1;
    if (tick % SNAPSHOT_EVERY_TICKS === 0) broadcastSnapshot();
  };

  return {
    noun: config.noun,
    playerCount: () => players.length,
    findByToken: (token) => players.find((player) => player.token === token),
    nameTaken(name) {
      const wanted = name.toLowerCase();
      return players.some((player) => player.name.toLowerCase() === wanted);
    },
    add(name, token, connection) {
      const colour = PLAYER_COLOURS.find((candidate) => !players.some((player) => player.colour === candidate));
      const player: RoomPlayer = {
        playerId: `p${nextPlayerNumber}`,
        name,
        colour: colour ?? PLAYER_COLOURS[0],
        token,
        connection,
        queue: createInputQueue(),
        sentFull: false,
      };
      nextPlayerNumber += 1;
      players.push(player);
      adminId ??= player.playerId;
      emptySince = null;
      return player;
    },
    replaceConnection(player, connection) {
      const old = player.connection;
      player.connection = connection;
      // The new connection numbers its inputs from 1 again and has seen no snapshot.
      player.queue = createInputQueue();
      player.sentFull = false;
      return old;
    },
    remove(player, now) {
      const index = players.indexOf(player);
      if (index === -1) return;
      players.splice(index, 1);
      // The role passes to the longest-connected player, or to the next to join if nobody is left.
      if (adminId === player.playerId) adminId = players[0]?.playerId ?? null;
      if (players.length === 0) emptySince = now;
      broadcastLobby();
    },
    announce: broadcastLobby,
    pushInput: (player, input) => player.queue.push(input),
    update(now) {
      if (players.length === 0) {
        // An empty room is paused: the world keeps its state and no time is owed when someone returns.
        startTime = now - tick * TICK_DT;
        return;
      }
      // The small allowance stops a tick being missed when floating-point error leaves the product just short.
      let due = Math.floor((now - startTime) * TICK_RATE + 1e-6) - tick;
      if (due > SERVER_MAX_CATCHUP_STEPS) {
        // Whatever is owed beyond the catch-up limit is discarded, so a stall cannot snowball.
        startTime += (due - SERVER_MAX_CATCHUP_STEPS) * TICK_DT;
        due = SERVER_MAX_CATCHUP_STEPS;
      }
      for (let i = 0; i < due; i++) stepOnce();
    },
    emptySince: () => emptySince,
    dispose: () => world.dispose(),
  };
}
```

`packages/server/src/room/server.ts`:

```ts
import {
  EMPTY_ROOM_TIMEOUT,
  MAX_PLAYERS,
  PING_INTERVAL,
  SILENCE_TIMEOUT,
  TICK_DT,
  getCourse,
  getVehicleConfig,
  parseClientMessage,
  type ClientMessage,
  type ErrorReason,
  type ServerMessage,
} from '@lodgy/shared';
import { pickNoun } from './nouns';
import { createRateLimiter, type RateLimiter } from './rateLimit';
import { createRoom, type Room, type RoomPlayer } from './room';
import type { Connection, ConnectionHandle, RoomDeps, RoomServer, RoomServerOptions } from './types';

interface Session {
  connection: Connection;
  limiter: RateLimiter;
  lastHeard: number;
  lastPing: number;
  room: Room | null;
  player: RoomPlayer | null;
}

export function createRoomServer(deps: RoomDeps, options: RoomServerOptions = {}): RoomServer {
  const courseId = options.courseId ?? 'test';
  const vehicleId = options.vehicleId ?? 'lodgy';
  // Fail at start-up, not at the first room, if either id is wrong.
  getCourse(courseId);
  getVehicleConfig(vehicleId);

  const rooms = new Map<string, Room>();
  const sessions = new Set<Session>();

  const send = (connection: Connection, message: ServerMessage) => connection.send(JSON.stringify(message));
  const refuse = (session: Session, reason: ErrorReason) => send(session.connection, { type: 'error', reason });

  // Forgets a session whose connection is gone, and takes its player out of the room.
  const forget = (session: Session) => {
    if (!sessions.delete(session)) return;
    if (session.room && session.player) session.room.remove(session.player, deps.clock());
  };

  // Puts a session in a room: welcome goes to the newcomer first, then the lobby message to everyone.
  const admit = (session: Session, room: Room, player: RoomPlayer) => {
    session.room = room;
    session.player = player;
    send(session.connection, { type: 'welcome', playerId: player.playerId, room: room.noun });
    room.announce();
  };

  const create = (session: Session, message: Extract<ClientMessage, { type: 'create' }>) => {
    const noun = pickNoun(deps.random, (candidate) => rooms.has(candidate));
    const room = createRoom(deps.rapier, { noun, courseId, vehicleId }, deps.clock());
    rooms.set(noun, room);
    admit(session, room, room.add(message.name, message.token, session.connection));
  };

  const join = (session: Session, message: Extract<ClientMessage, { type: 'join' }>) => {
    const room = rooms.get(message.room);
    if (!room) return refuse(session, 'unknown_room');

    const existing = room.findByToken(message.token);
    if (existing) {
      // The same browser tab has come back (a reload, a dropped socket): it takes its slot over at once.
      for (const other of sessions) {
        if (other.player === existing) {
          other.room = null;
          other.player = null;
          sessions.delete(other);
        }
      }
      room.replaceConnection(existing, session.connection).close();
      admit(session, room, existing);
      return;
    }

    if (room.playerCount() >= MAX_PLAYERS) return refuse(session, 'room_full');
    if (room.nameTaken(message.name)) return refuse(session, 'name_taken');
    admit(session, room, room.add(message.name, message.token, session.connection));
  };

  const handle = (session: Session, raw: string) => {
    if (!sessions.has(session)) return;
    const now = deps.clock();
    session.lastHeard = now;
    const verdict = session.limiter.hit(now);
    if (verdict === 'close') {
      session.connection.close();
      forget(session);
      return;
    }
    if (verdict === 'drop') return;

    const message = parseClientMessage(raw);
    if (!message) return refuse(session, 'bad_message');
    switch (message.type) {
      case 'pong':
        return;
      case 'input': {
        // Input from a connection that is not in a room is ignored.
        if (!session.room || !session.player) return;
        const { type: _type, ...input } = message;
        session.room.pushInput(session.player, input);
        return;
      }
      case 'create':
        if (session.room) return refuse(session, 'bad_message');
        return create(session, message);
      case 'join':
        if (session.room) return refuse(session, 'bad_message');
        return join(session, message);
    }
  };

  const tick = () => {
    const now = deps.clock();
    for (const session of [...sessions]) {
      if (now - session.lastHeard >= SILENCE_TIMEOUT) {
        session.connection.close();
        forget(session);
      } else if (now - session.lastPing >= PING_INTERVAL) {
        session.lastPing = now;
        send(session.connection, { type: 'ping' });
      }
    }
    for (const [noun, room] of rooms) {
      room.update(now);
      const emptySince = room.emptySince();
      if (emptySince !== null && now - emptySince >= EMPTY_ROOM_TIMEOUT) {
        room.dispose();
        rooms.delete(noun);
      }
    }
  };
  // Twice per simulation tick, so that a late timer callback rarely delays a tick by a whole period.
  const stopTimer = deps.timer.every(TICK_DT / 2, tick);

  return {
    connect(connection): ConnectionHandle {
      const now = deps.clock();
      const session: Session = {
        connection,
        limiter: createRateLimiter(),
        lastHeard: now,
        lastPing: now,
        room: null,
        player: null,
      };
      sessions.add(session);
      return {
        message: (data) => handle(session, data),
        closed: () => forget(session),
      };
    },
    roomCount: () => rooms.size,
    stop() {
      stopTimer();
      for (const room of rooms.values()) room.dispose();
      rooms.clear();
      sessions.clear();
    },
  };
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: 15 files, 159 tests passing.

Run: `npm run typecheck`
Expected: exits 0. This also proves the room layer uses no Node or DOM global, because `packages/server/tsconfig.json` provides neither.

- [x] **Step 6: Commit**

```bash
git add packages/server/src/room
git commit -m "feat(server): add the room layer

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [x] **Step 7: Write the failing tests for the room limit and for failures**

The review of this task found two gaps, and steps 7 to 10 close them. Steps 1 to 6 above are kept as they were first built.

- Nothing bounded the number of rooms, and each room is a physics world. `create` is now refused with the new reason `server_full` once the server holds `MAX_ROOMS` (50) rooms.
- An error thrown inside the tick stopped every room. Now a connection whose `send` or `close` throws is reported through the new optional `RoomDeps.onError` and dropped at the next tick, and a room whose `update` throws is reported, closed and deleted, with its players disconnected. Other rooms are not affected.

Apply this change. It adds four tests: three in `packages/server/src/room/server.test.ts` and one in the new file `packages/server/src/room/roomFailure.test.ts`. The main session provides the same change as a patch file for `git apply`.

```diff
diff --git a/packages/server/src/room/roomFailure.test.ts b/packages/server/src/room/roomFailure.test.ts
new file mode 100644
index 0000000..6f73bc7
--- /dev/null
+++ b/packages/server/src/room/roomFailure.test.ts
@@ -0,0 +1,56 @@
+import RAPIER from '@dimforge/rapier3d-compat';
+import { SNAPSHOT_EVERY_TICKS, TICK_RATE } from '@lodgy/shared';
+import { beforeAll, expect, test, vi } from 'vitest';
+import { createRoomServer } from './server';
+import { connectFakeClient, createFakeDeps } from './testing';
+
+// The nouns of the rooms whose simulation is made to fail.
+const failing = vi.hoisted(() => new Set<string>());
+
+// No message a client can send makes a room's update throw, so the failure is injected here.
+vi.mock('./room', async (importOriginal) => {
+  const original = await importOriginal<typeof import('./room')>();
+  const createRoom: typeof original.createRoom = (...args) => {
+    const room = original.createRoom(...args);
+    return {
+      ...room,
+      update(now) {
+        if (failing.has(room.noun)) throw new Error('simulation failed');
+        room.update(now);
+      },
+    };
+  };
+  return { ...original, createRoom };
+});
+
+beforeAll(async () => {
+  await RAPIER.init();
+});
+
+test('a room whose update throws is closed and reported, and the other rooms carry on', () => {
+  const fake = createFakeDeps(RAPIER);
+  const errors: unknown[] = [];
+  const server = createRoomServer({ ...fake.deps, onError: (error) => errors.push(error) });
+  const amal = connectFakeClient(server);
+  amal.send({ type: 'create', name: 'Amal', token: 'token-1-abcdefghij' });
+  const badr = connectFakeClient(server);
+  badr.send({ type: 'create', name: 'Badr', token: 'token-2-abcdefghij' });
+  fake.advance(1);
+  expect(server.roomCount()).toBe(2);
+
+  // Amal's room was created first, so it is updated before Badr's on every tick.
+  failing.add(amal.last('welcome').room);
+  const before = badr.ofType('snapshot').length;
+  fake.advance(1);
+
+  expect(errors).toHaveLength(1);
+  expect(server.roomCount()).toBe(1);
+  expect(amal.closedByServer).toBe(true);
+  expect(badr.closedByServer).toBe(false);
+  expect(badr.ofType('snapshot').length - before).toBe(TICK_RATE / SNAPSHOT_EVERY_TICKS);
+
+  // The failed room is gone: its name can no longer be joined.
+  const late = connectFakeClient(server);
+  late.send({ type: 'join', room: amal.last('welcome').room, name: 'Chadi', token: 'token-3-abcdefghij' });
+  expect(late.ofType('error').map((message) => message.reason)).toEqual(['unknown_room']);
+});
diff --git a/packages/server/src/room/server.test.ts b/packages/server/src/room/server.test.ts
index 6ef05b1..1407d3b 100644
--- a/packages/server/src/room/server.test.ts
+++ b/packages/server/src/room/server.test.ts
@@ -2,6 +2,7 @@ import RAPIER from '@dimforge/rapier3d-compat';
 import {
   EMPTY_ROOM_TIMEOUT,
   MAX_PLAYERS,
+  MAX_ROOMS,
   NEUTRAL_INPUT,
   PING_INTERVAL,
   PLAYER_COLOURS,
@@ -34,7 +35,9 @@ const input = (seq: number, fields: Partial<PlayerInput> = {}): ClientMessage =>
 
 function setup(options?: RoomServerOptions) {
   const fake = createFakeDeps(RAPIER);
-  const server = createRoomServer(fake.deps, options);
+  // Everything the server reports through onError, oldest first.
+  const errors: unknown[] = [];
+  const server = createRoomServer({ ...fake.deps, onError: (error) => errors.push(error) }, options);
   const connect = () => connectFakeClient(server);
   // Connects a client and creates a room with it.
   const host = (name = 'Amal') => {
@@ -48,7 +51,7 @@ function setup(options?: RoomServerOptions) {
     client.send({ type: 'join', room, name, token: token(n) });
     return client;
   };
-  return { ...fake, server, connect, host, guest };
+  return { ...fake, server, errors, connect, host, guest };
 }
 
 const reasons = (client: FakeClient) => client.ofType('error').map((message) => message.reason);
@@ -408,6 +411,84 @@ test('a connection that stays over the rate limit is closed and removed', () =>
   expect(amal.last('lobby').players.map((player) => player.name)).toEqual(['Amal']);
 });
 
+test('create is refused once the server holds the most rooms it allows, until one is deleted', () => {
+  const { connect, advance, server } = setup();
+  const hosts = Array.from({ length: MAX_ROOMS }, (_, n) => {
+    const client = connect();
+    client.send({ type: 'create', name: 'Amal', token: token(n) });
+    return client;
+  });
+  expect(server.roomCount()).toBe(MAX_ROOMS);
+
+  const late = connect();
+  late.send({ type: 'create', name: 'Badr', token: token(MAX_ROOMS) });
+  expect(reasons(late)).toEqual(['server_full']);
+  expect(server.roomCount()).toBe(MAX_ROOMS);
+
+  // Joining an existing room is still possible.
+  const joiner = connect();
+  joiner.send({ type: 'join', room: hosts[0]!.last('welcome').room, name: 'Chadi', token: token(MAX_ROOMS + 1) });
+  expect(reasons(joiner)).toEqual([]);
+
+  // Once the rooms have emptied and timed out, a room can be created again.
+  joiner.close();
+  for (const client of hosts) client.close();
+  advance(EMPTY_ROOM_TIMEOUT);
+  expect(server.roomCount()).toBe(0);
+  const next = connect();
+  next.send({ type: 'create', name: 'Badr', token: token(MAX_ROOMS) });
+  expect(reasons(next)).toEqual([]);
+  expect(server.roomCount()).toBe(1);
+});
+
+test('a connection whose send throws is reported and dropped, and the others carry on', () => {
+  const { host, advance, server, errors } = setup();
+  const { client: amal, room } = host();
+  let broken = false;
+  let closed = false;
+  const handle = server.connect({
+    send() {
+      if (broken) throw new Error('socket failed');
+    },
+    close() {
+      closed = true;
+    },
+  });
+  handle.message(JSON.stringify({ type: 'join', room, name: 'Badr', token: token(2) }));
+  expect(amal.last('lobby').players).toHaveLength(2);
+
+  broken = true;
+  const before = amal.ofType('snapshot').length;
+  advance(1);
+  expect(errors).toHaveLength(1);
+  expect(closed).toBe(true);
+  expect(amal.last('lobby').players.map((player) => player.name)).toEqual(['Amal']);
+  // The tick was never interrupted: Amal missed no snapshot.
+  expect(amal.ofType('snapshot').length - before).toBe(TICK_RATE / SNAPSHOT_EVERY_TICKS);
+  expect(amal.closedByServer).toBe(false);
+});
+
+test('a connection whose close throws is still removed from its room', () => {
+  const { host, advance, server, errors } = setup();
+  const { client: amal, room } = host();
+  const handle = server.connect({
+    send() {},
+    close() {
+      throw new Error('close failed');
+    },
+  });
+  handle.message(JSON.stringify({ type: 'join', room, name: 'Badr', token: token(2) }));
+  expect(amal.last('lobby').players).toHaveLength(2);
+
+  // Badr goes silent; Amal keeps answering.
+  for (let elapsed = 0; elapsed < SILENCE_TIMEOUT + 1; elapsed += 1) {
+    advance(1);
+    amal.send({ type: 'pong' });
+  }
+  expect(errors).toHaveLength(1);
+  expect(amal.last('lobby').players.map((player) => player.name)).toEqual(['Amal']);
+});
+
 test('stop frees every room', () => {
   const { host, server } = setup();
   host();
```

- [x] **Step 8: Run the tests to verify they fail**

Run: `npx vitest run packages/server`
Expected: FAIL, 4 failed and 63 passed, in 2 failed files. The four failures are the new tests: `Error: simulation failed`, `expected +0 to be undefined`, `Error: socket failed` and `Error: close failed`.

- [x] **Step 9: Write the room limit and the failure handling**

Apply this change to `packages/shared/src/constants.ts`, `packages/shared/src/protocol.ts`, `packages/server/src/room/types.ts` and `packages/server/src/room/server.ts`. The main session provides it as a second patch file.

```diff
diff --git a/packages/server/src/room/server.ts b/packages/server/src/room/server.ts
index 23d2a6b..1b0c2a2 100644
--- a/packages/server/src/room/server.ts
+++ b/packages/server/src/room/server.ts
@@ -1,6 +1,7 @@
 import {
   EMPTY_ROOM_TIMEOUT,
   MAX_PLAYERS,
+  MAX_ROOMS,
   PING_INTERVAL,
   SILENCE_TIMEOUT,
   TICK_DT,
@@ -21,6 +22,8 @@ interface Session {
   limiter: RateLimiter;
   lastHeard: number;
   lastPing: number;
+  // Set when the connection threw; the next tick drops the session.
+  failed: boolean;
   room: Room | null;
   player: RoomPlayer | null;
 }
@@ -52,7 +55,14 @@ export function createRoomServer(deps: RoomDeps, options: RoomServerOptions = {}
     room.announce();
   };
 
+  // Takes a session out of its room and closes its connection.
+  const drop = (session: Session) => {
+    forget(session);
+    session.connection.close();
+  };
+
   const create = (session: Session, message: Extract<ClientMessage, { type: 'create' }>) => {
+    if (rooms.size >= MAX_ROOMS) return refuse(session, 'server_full');
     const noun = pickNoun(deps.random, (candidate) => rooms.has(candidate));
     const room = createRoom(deps.rapier, { noun, courseId, vehicleId }, deps.clock());
     rooms.set(noun, room);
@@ -88,11 +98,7 @@ export function createRoomServer(deps: RoomDeps, options: RoomServerOptions = {}
     const now = deps.clock();
     session.lastHeard = now;
     const verdict = session.limiter.hit(now);
-    if (verdict === 'close') {
-      session.connection.close();
-      forget(session);
-      return;
-    }
+    if (verdict === 'close') return drop(session);
     if (verdict === 'drop') return;
 
     const message = parseClientMessage(raw);
@@ -116,19 +122,40 @@ export function createRoomServer(deps: RoomDeps, options: RoomServerOptions = {}
     }
   };
 
+  // Closes a failed room: its players are disconnected and its world is freed.
+  const discard = (noun: string, room: Room) => {
+    rooms.delete(noun);
+    for (const session of [...sessions]) {
+      if (session.room !== room) continue;
+      sessions.delete(session);
+      session.connection.close();
+    }
+    try {
+      room.dispose();
+    } catch (error) {
+      deps.onError?.(error);
+    }
+  };
+
   const tick = () => {
     const now = deps.clock();
     for (const session of [...sessions]) {
-      if (now - session.lastHeard >= SILENCE_TIMEOUT) {
-        session.connection.close();
-        forget(session);
+      if (session.failed || now - session.lastHeard >= SILENCE_TIMEOUT) {
+        drop(session);
       } else if (now - session.lastPing >= PING_INTERVAL) {
         session.lastPing = now;
         send(session.connection, { type: 'ping' });
       }
     }
     for (const [noun, room] of rooms) {
-      room.update(now);
+      try {
+        room.update(now);
+      } catch (error) {
+        // A room whose simulation fails is closed, so that it cannot stop the other rooms.
+        deps.onError?.(error);
+        discard(noun, room);
+        continue;
+      }
       const emptySince = room.emptySince();
       if (emptySince !== null && now - emptySince >= EMPTY_ROOM_TIMEOUT) {
         room.dispose();
@@ -143,10 +170,29 @@ export function createRoomServer(deps: RoomDeps, options: RoomServerOptions = {}
     connect(connection): ConnectionHandle {
       const now = deps.clock();
       const session: Session = {
-        connection,
+        // Sends happen in the middle of a tick or of another player's join, so a throw is recorded and handled at the next tick.
+        connection: {
+          send(data) {
+            if (session.failed) return;
+            try {
+              connection.send(data);
+            } catch (error) {
+              session.failed = true;
+              deps.onError?.(error);
+            }
+          },
+          close() {
+            try {
+              connection.close();
+            } catch (error) {
+              deps.onError?.(error);
+            }
+          },
+        },
         limiter: createRateLimiter(),
         lastHeard: now,
         lastPing: now,
+        failed: false,
         room: null,
         player: null,
       };
diff --git a/packages/server/src/room/types.ts b/packages/server/src/room/types.ts
index 1c17f10..608da80 100644
--- a/packages/server/src/room/types.ts
+++ b/packages/server/src/room/types.ts
@@ -1,6 +1,7 @@
 import type { Rapier } from '@lodgy/shared';
 
 // One client's connection, as the room layer sees it. The adapter implements it over a real socket.
+// If send or close throws, the room server reports it and drops the connection.
 export interface Connection {
   send(data: string): void;
   close(): void;
@@ -25,6 +26,8 @@ export interface RoomDeps {
   // A number in [0, 1).
   random: () => number;
   timer: Timer;
+  // Told about a connection or a room that failed; the server carries on without it.
+  onError?: (error: unknown) => void;
 }
 
 export interface RoomServerOptions {
diff --git a/packages/shared/src/constants.ts b/packages/shared/src/constants.ts
index adf696e..4d66034 100644
--- a/packages/shared/src/constants.ts
+++ b/packages/shared/src/constants.ts
@@ -32,6 +32,8 @@ export const RATE_LIMIT_PER_SECOND = 120;
 export const RATE_LIMIT_CLOSE_AFTER = 3;
 // Seconds a room survives with nobody connected.
 export const EMPTY_ROOM_TIMEOUT = 60;
+// Rooms the server holds at once; each one is a physics world.
+export const MAX_ROOMS = 50;
 
 export type Surface = 'road' | 'sand' | 'riverbed' | 'gravel';
 
diff --git a/packages/shared/src/protocol.ts b/packages/shared/src/protocol.ts
index 73608af..460aacd 100644
--- a/packages/shared/src/protocol.ts
+++ b/packages/shared/src/protocol.ts
@@ -48,7 +48,7 @@ export type ClientMessage =
 
 export type Phase = 'lobby' | 'playing' | 'results';
 
-export type ErrorReason = 'unknown_room' | 'room_full' | 'name_taken' | 'bad_message';
+export type ErrorReason = 'unknown_room' | 'room_full' | 'name_taken' | 'bad_message' | 'server_full';
 
 export interface LobbyPlayer {
   playerId: string;
```

Run: `npm test`
Expected: 16 files, 164 tests passing.

Run: `npm run typecheck`
Expected: exits 0.

- [x] **Step 10: Commit**

```bash
git add packages/shared/src/constants.ts packages/shared/src/protocol.ts packages/server/src/room
git commit -m "fix(server): cap the number of rooms and contain failures

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: The node adapter and the run scripts

**Files:**
- Create: `packages/server/tsconfig.node.json`
- Create: `packages/server/src/node/static.ts`, `packages/server/src/node/listen.ts`, `packages/server/src/node/main.ts`
- Test: `packages/server/src/node/server.test.ts`
- Create: `scripts/dev.mjs`
- Modify: `package.json`, `packages/client/vite.config.ts`

**Interfaces:**
- Consumes: `createRoomServer` from Task 5; `SOCKET_PATH` from `@lodgy/shared`.
- Produces:
  - `startServer(options: { port: number; clientDir: string; vehicleId?: string }): Promise<{ port: number; close(): Promise<void> }>`
  - `resolveStaticPath(root: string, urlPath: string): string | null`, `contentType(file: string): string`
  - `npm start`: builds the client, then serves the page and the WebSocket on one port (`PORT`, default 3000)
  - `npm run dev`: runs the game server on port 3000 and Vite beside it; Vite forwards `/ws` to the game server
  - environment variables read by `main.ts`: `PORT`, `VEHICLE`, `LODGY_DEV`

- [x] **Step 1: Add the adapter's config and the scripts**

`packages/server/tsconfig.node.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": [
      "node"
    ]
  },
  "include": [
    "src/node/**/*.ts"
  ]
}
```

In the root `package.json`, replace the line

```json
    "typecheck": "tsc -p packages/shared && tsc -p packages/server && tsc -p packages/client && tsc -p tsconfig.json",
```

with

```json
    "typecheck": "tsc -p packages/shared && tsc -p packages/server && tsc -p packages/server/tsconfig.node.json && tsc -p packages/client && tsc -p tsconfig.json",
```

and replace the two lines

```json
    "dev": "npm run dev -w @lodgy/client",
    "build": "npm run build -w @lodgy/client",
```

with

```json
    "dev": "node scripts/dev.mjs",
    "build": "npm run build -w @lodgy/client",
    "start": "npm run build && npm run start -w @lodgy/server",
```

`scripts/dev.mjs`:

```js
// Runs the game server and the Vite dev server together, and stops both when either stops.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = ['@lodgy/server', '@lodgy/client'].map((workspace) =>
  spawn(npm, ['run', 'dev', '-w', workspace], { stdio: 'inherit', env: { ...process.env, LODGY_DEV: '1' } }),
);

const stopAll = () => {
  for (const child of children) child.kill();
};
for (const child of children) child.on('exit', stopAll);
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
```

Replace `packages/client/vite.config.ts` with:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // host: true makes the dev server reachable from other devices on the LAN.
    host: true,
    port: 5173,
    // In development the page comes from Vite and the game server runs beside it on port 3000.
    proxy: { '/ws': { target: 'ws://localhost:3000', ws: true } },
  },
  build: { target: 'es2022' },
});
```

- [x] **Step 2: Write the failing test**

`packages/server/src/node/server.test.ts`:

```ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NEUTRAL_INPUT, SOCKET_PATH, TICK_DT, type ClientMessage, type ServerMessage } from '@lodgy/shared';
import { afterAll, beforeAll, expect, test } from 'vitest';
import WebSocket from 'ws';
import { startServer, type RunningServer } from './listen';
import { contentType, resolveStaticPath } from './static';

let root: string;
let clientDir: string;
let server: RunningServer;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'lodgy-server-test-'));
  clientDir = path.join(root, 'dist');
  await mkdir(path.join(clientDir, 'assets'), { recursive: true });
  await writeFile(path.join(clientDir, 'index.html'), '<!doctype html><title>client</title>');
  await writeFile(path.join(clientDir, 'assets', 'app.js'), 'console.log("app")');
  await writeFile(path.join(root, 'secret.txt'), 'outside the client folder');
  server = await startServer({ port: 0, clientDir });
});

afterAll(async () => {
  await server.close();
  await rm(root, { recursive: true, force: true });
});

const url = (pathname: string) => `http://localhost:${server.port}${pathname}`;

// Sends a request whose path is not normalised first, as fetch would do.
function rawGet(pathname: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = request({ host: 'localhost', port: server.port, path: pathname, method: 'GET' }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

interface TestClient {
  received: ServerMessage[];
  send(message: ClientMessage): void;
  // Resolves with the first message, already received or yet to come, that satisfies the test.
  waitFor<T extends ServerMessage>(test: (message: ServerMessage) => message is T): Promise<T>;
  closed: Promise<void>;
  socket: WebSocket;
}

async function connect(): Promise<TestClient> {
  const socket = new WebSocket(`ws://localhost:${server.port}${SOCKET_PATH}`);
  const received: ServerMessage[] = [];
  const waiting: (() => void)[] = [];
  socket.on('message', (data) => {
    received.push(JSON.parse(data.toString()) as ServerMessage);
    for (const check of waiting.splice(0)) check();
  });
  const closed = new Promise<void>((resolve) => socket.on('close', () => resolve()));
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return {
    received,
    socket,
    closed,
    send: (message) => socket.send(JSON.stringify(message)),
    waitFor<T extends ServerMessage>(test: (message: ServerMessage) => message is T) {
      return new Promise<T>((resolve) => {
        const check = () => {
          const found = received.find(test);
          if (found) resolve(found);
          else waiting.push(check);
        };
        check();
      });
    },
  };
}

const isWelcome = (message: ServerMessage) => message.type === 'welcome';
const isSnapshot = (message: ServerMessage) => message.type === 'snapshot';
type Welcome = Extract<ServerMessage, { type: 'welcome' }>;
type Snapshot = Extract<ServerMessage, { type: 'snapshot' }>;

test('serves the client at the root and at any room address', async () => {
  for (const pathname of ['/', '/camel', '/index.html']) {
    const response = await fetch(url(pathname));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(await response.text()).toContain('<title>client</title>');
  }
});

test('serves built assets with a long cache life', async () => {
  const response = await fetch(url('/assets/app.js'));
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
  expect(response.headers.get('cache-control')).toContain('immutable');
  expect(await response.text()).toBe('console.log("app")');
});

test('answers 404 for a missing file and 405 for a method other than GET or HEAD', async () => {
  expect((await fetch(url('/assets/missing.js'))).status).toBe(404);
  expect((await fetch(url('/'), { method: 'POST' })).status).toBe(405);
});

test('never serves a file outside the client folder', async () => {
  for (const pathname of ['/../secret.txt', '/%2e%2e/secret.txt', '/assets/../../secret.txt', '/..%2fsecret.txt']) {
    const { body } = await rawGet(pathname);
    expect(body).not.toContain('outside the client folder');
  }
  expect(resolveStaticPath('/srv/dist', '/../../etc/passwd')).toBe(path.join('/srv/dist', 'etc/passwd'));
  expect(resolveStaticPath('/srv/dist', '/%E0%A4%A')).toBeNull();
});

test('knows the content types the client needs', () => {
  expect(contentType('a/b/index.html')).toBe('text/html; charset=utf-8');
  expect(contentType('x.wasm')).toBe('application/wasm');
  expect(contentType('x.unknown')).toBe('application/octet-stream');
});

test('two clients share a room, and the first one drives the vehicle both see', async () => {
  const amal = await connect();
  amal.send({ type: 'create', name: 'Amal', token: 'integration-token-amal' });
  const { room } = await amal.waitFor((message): message is Welcome => isWelcome(message));

  const badr = await connect();
  badr.send({ type: 'join', room, name: 'Badr', token: 'integration-token-badr' });
  const welcome = await badr.waitFor((message): message is Welcome => isWelcome(message));
  expect(welcome).toEqual({ type: 'welcome', playerId: 'p2', room });

  // Amal holds the throttle, one input per tick, as the browser client does.
  let seq = 0;
  const driving = setInterval(() => {
    seq += 1;
    amal.send({ type: 'input', ...NEUTRAL_INPUT, moveY: 1, seq });
  }, TICK_DT * 1000);
  const moved = (message: ServerMessage): message is Snapshot => isSnapshot(message) && message.vehicle.pos.z < -1;
  const [seenByAmal, seenByBadr] = await Promise.all([amal.waitFor(moved), badr.waitFor(moved)]);
  clearInterval(driving);

  expect(seenByAmal.ackSeq).toBeGreaterThan(0);
  expect(seenByBadr.ackSeq).toBe(0);
  expect(badr.received.find(isSnapshot)).toMatchObject({ full: true });
  amal.socket.close();
  badr.socket.close();
});

test('a join to a room that does not exist is refused', async () => {
  const client = await connect();
  client.send({ type: 'join', room: 'nowhere', name: 'Amal', token: 'integration-token-amal' });
  const error = await client.waitFor(
    (message): message is Extract<ServerMessage, { type: 'error' }> => message.type === 'error',
  );
  expect(error.reason).toBe('unknown_room');
  client.socket.close();
});

test('a binary message or an oversized message closes the connection', async () => {
  const binary = await connect();
  binary.socket.send(new Uint8Array([1, 2, 3]));
  await binary.closed;

  const oversized = await connect();
  oversized.socket.send('x'.repeat(5000));
  await oversized.closed;
});
```

- [x] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/server/src/node`
Expected: FAIL, because `./listen` and `./static` cannot be resolved.

- [x] **Step 4: Write the adapter**

`packages/server/src/node/static.ts`:

```ts
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.map': 'application/json; charset=utf-8',
};

export const contentType = (file: string): string =>
  CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

// The file a request path maps to inside `root`, or null if the path cannot be decoded.
// Normalising against "/" first means no sequence of ".." can climb out of `root`.
export function resolveStaticPath(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  return path.join(root, path.posix.normalize(`/${decoded.replaceAll('\\', '/')}`));
}

const isFile = async (file: string) => {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
};

const plain = (response: ServerResponse, status: number, text: string) => {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(`${text}\n`);
};

// Serves the built client from `root`. Any path that is not a file serves index.html: the client reads the room from the address.
export async function serveStatic(root: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return plain(response, 405, 'Method not allowed');
  let urlPath: string;
  try {
    urlPath = new URL(request.url ?? '/', 'http://localhost').pathname;
  } catch {
    return plain(response, 400, 'Bad request');
  }
  const requested = resolveStaticPath(root, urlPath);
  if (!requested) return plain(response, 400, 'Bad request');

  let file = requested;
  if (!(await isFile(file))) {
    // A missing file with an extension is a real 404; anything else is a page address.
    if (path.extname(urlPath) !== '') return plain(response, 404, 'Not found');
    file = path.join(root, 'index.html');
    if (!(await isFile(file))) return plain(response, 503, 'The client is not built. Run "npm run build" first.');
  }

  const hashed = file.startsWith(path.join(root, 'assets') + path.sep);
  response.writeHead(200, {
    'Content-Type': contentType(file),
    // Vite gives files under assets/ a content hash in their name, so they can be cached for good.
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
}
```

`packages/server/src/node/listen.ts`:

```ts
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import RAPIER from '@dimforge/rapier3d-compat';
import { SOCKET_PATH } from '@lodgy/shared';
import { WebSocketServer } from 'ws';
import { createRoomServer } from '../room/server';
import { serveStatic } from './static';

// No valid message is anywhere near this size; larger ones close the connection.
const MAX_MESSAGE_BYTES = 4096;

export interface ServerOptions {
  // 0 picks a free port.
  port: number;
  // The folder holding the built client.
  clientDir: string;
  vehicleId?: string;
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

// Wires the room layer to real sockets, real time and an initialised Rapier, and serves the client on the same port.
export async function startServer(options: ServerOptions): Promise<RunningServer> {
  await RAPIER.init();
  const rooms = createRoomServer(
    {
      rapier: RAPIER,
      clock: () => performance.now() / 1000,
      random: Math.random,
      onError: (error) => console.error(error),
      timer: {
        every(seconds, fn) {
          const id = setInterval(fn, seconds * 1000);
          return () => clearInterval(id);
        },
      },
    },
    { vehicleId: options.vehicleId },
  );

  const http = createServer((request, response) => {
    serveStatic(options.clientDir, request, response).catch(() => response.destroy());
  });
  const sockets = new WebSocketServer({ server: http, path: SOCKET_PATH, maxPayload: MAX_MESSAGE_BYTES });
  sockets.on('connection', (socket) => {
    const handle = rooms.connect({
      send(data) {
        if (socket.readyState === socket.OPEN) socket.send(data);
      },
      close: () => socket.close(),
    });
    socket.on('message', (data, isBinary) => {
      // The protocol is JSON text; a binary frame is not part of it.
      if (isBinary) socket.close();
      else handle.message(data.toString());
    });
    socket.on('close', () => handle.closed());
    // An oversized or malformed frame raises an error; the socket is then dropped.
    socket.on('error', () => socket.terminate());
  });

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(options.port, resolve);
  });

  return {
    port: (http.address() as AddressInfo).port,
    async close() {
      rooms.stop();
      for (const socket of sockets.clients) socket.terminate();
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
```

`packages/server/src/node/main.ts`:

```ts
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { startServer } from './listen';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`PORT must be a number from 1 to 65535, not "${process.env.PORT}".`);
  process.exit(1);
}

const clientDir = fileURLToPath(new URL('../../../client/dist', import.meta.url));
// VEHICLE=rv runs every room with the RV until the lobby (step 11) lets the admin choose.
const server = await startServer({ port, clientDir, vehicleId: process.env.VEHICLE });

if (process.env.LODGY_DEV) {
  // Under "npm run dev" the page comes from Vite, which prints its own addresses.
  console.log(`Game server is running on port ${server.port}. Open the Vite address, not this port.`);
} else {
  console.log('Lodgy Co-op server is running.');
  console.log(`  On this machine:   http://localhost:${server.port}/`);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        console.log(`  On the same Wi-Fi: http://${address.address}:${server.port}/`);
      }
    }
  }
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: 17 files, 172 tests passing. The integration test takes about a second, because it drives a real server in real time.

Run: `npm run typecheck`
Expected: exits 0.

- [x] **Step 6: Start the server once by hand**

Run this in the background, with its output going to a file outside the repository:

```bash
PORT=3210 npm start
```

Wait until the output contains `Lodgy Co-op server is running.`, then run:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3210/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3210/camel
```

Expected: `200` twice. Then stop the server you started (kill that process only) and confirm that port 3210 is free again with `lsof -nP -iTCP:3210 -sTCP:LISTEN`, which must print nothing.

The page served here still runs the step 1 client, which does not talk to the server yet. Task 8 changes that.

- [x] **Step 7: Commit**

```bash
git add package.json scripts/dev.mjs packages/client/vite.config.ts packages/server
git commit -m "feat(server): add the node adapter and the run scripts

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [x] **Step 8: Write the failing tests for failures at the adapter**

The review of this task found three ways in which one request or one socket could end the whole process. Steps 8 to 11 close them. Steps 1 to 7 above are kept as they were first built.

- A file that fails to open or read raised an `error` event that nobody handled. `serveStatic` now sends files through `pipeline`, which ends that response and closes the file.
- `ws` repeats the HTTP server's `error` events on the WebSocket server, where nobody listened, so a port already in use ended the process instead of rejecting `startServer`. Both servers now have an error listener, and a failed start stops the room timer and rejects.
- An exception thrown inside a socket or timer callback was uncaught. Those callbacks now run inside `contain`, which reports the error through the new `ServerOptions.onError` (it prints by default) and, for a message, drops that socket.

Apply this change. It adds two tests to `packages/server/src/node/server.test.ts` and the new file `packages/server/src/node/failure.test.ts` with two more. The main session provides the same change as a patch file for `git apply`.

```diff
diff --git a/packages/server/src/node/failure.test.ts b/packages/server/src/node/failure.test.ts
new file mode 100644
index 0000000..779b244
--- /dev/null
+++ b/packages/server/src/node/failure.test.ts
@@ -0,0 +1,100 @@
+import { SOCKET_PATH, type ServerMessage } from '@lodgy/shared';
+import { afterAll, beforeAll, expect, test, vi } from 'vitest';
+import WebSocket from 'ws';
+import { startServer, type RunningServer } from './listen';
+
+// What the stand-in room server below is told to do.
+const failing = vi.hoisted(() => ({ tick: false }));
+
+// The real room layer does not throw on any message, so failures are injected around it.
+vi.mock('../room/server', async (importOriginal) => {
+  const original = await importOriginal<typeof import('../room/server')>();
+  const createRoomServer: typeof original.createRoomServer = (deps, options) => {
+    const server = original.createRoomServer(deps, options);
+    const stopFailingTimer = deps.timer.every(0.01, () => {
+      if (failing.tick) throw new Error('tick failed');
+    });
+    return {
+      ...server,
+      connect(connection) {
+        const handle = server.connect(connection);
+        return {
+          message(data) {
+            if (data === 'throw') throw new Error('message failed');
+            handle.message(data);
+          },
+          closed() {
+            handle.closed();
+            throw new Error('closed failed');
+          },
+        };
+      },
+      stop() {
+        stopFailingTimer();
+        server.stop();
+      },
+    };
+  };
+  return { ...original, createRoomServer };
+});
+
+const errors: string[] = [];
+let server: RunningServer;
+
+beforeAll(async () => {
+  server = await startServer({
+    port: 0,
+    clientDir: '/nonexistent',
+    onError: (error) => errors.push(error instanceof Error ? error.message : String(error)),
+  });
+});
+
+afterAll(async () => {
+  await server.close();
+});
+
+function open(): Promise<WebSocket> {
+  return new Promise((resolve, reject) => {
+    const socket = new WebSocket(`ws://localhost:${server.port}${SOCKET_PATH}`);
+    socket.once('open', () => resolve(socket));
+    socket.once('error', reject);
+  });
+}
+const closed = (socket: WebSocket) => new Promise<void>((resolve) => socket.once('close', () => resolve()));
+
+test('a failure while handling a message drops that connection only', async () => {
+  const bystander = await open();
+  const culprit = await open();
+  const culpritClosed = closed(culprit);
+  culprit.send('throw');
+  await culpritClosed;
+  expect(errors).toContain('message failed');
+  // The close handler failed too, and that was contained as well.
+  await vi.waitFor(() => expect(errors).toContain('closed failed'));
+
+  // The other connection still works: it can create a room.
+  const welcome = new Promise<ServerMessage>((resolve) =>
+    bystander.once('message', (data) => resolve(JSON.parse(data.toString()) as ServerMessage)),
+  );
+  bystander.send(JSON.stringify({ type: 'create', name: 'Amal', token: 'failure-token-amal' }));
+  expect((await welcome).type).toBe('welcome');
+  const bystanderClosed = closed(bystander);
+  bystander.close();
+  await bystanderClosed;
+});
+
+test('a failure inside a timer callback is reported and the server keeps running', async () => {
+  failing.tick = true;
+  await vi.waitFor(() => expect(errors).toContain('tick failed'));
+  failing.tick = false;
+
+  const socket = await open();
+  const welcome = new Promise<ServerMessage>((resolve) =>
+    socket.once('message', (data) => resolve(JSON.parse(data.toString()) as ServerMessage)),
+  );
+  socket.send(JSON.stringify({ type: 'create', name: 'Badr', token: 'failure-token-badr' }));
+  expect((await welcome).type).toBe('welcome');
+  const socketClosed = closed(socket);
+  socket.close();
+  await socketClosed;
+});
diff --git a/packages/server/src/node/server.test.ts b/packages/server/src/node/server.test.ts
index e4ca516..8694f22 100644
--- a/packages/server/src/node/server.test.ts
+++ b/packages/server/src/node/server.test.ts
@@ -1,4 +1,4 @@
-import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
+import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
 import { request } from 'node:http';
 import { tmpdir } from 'node:os';
 import path from 'node:path';
@@ -120,6 +120,25 @@ test('never serves a file outside the client folder', async () => {
   expect(resolveStaticPath('/srv/dist', '/%E0%A4%A')).toBeNull();
 });
 
+test('a file that cannot be read ends that response and leaves the server running', async () => {
+  const locked = path.join(clientDir, 'assets', 'locked.js');
+  await writeFile(locked, 'console.log("locked")');
+  await chmod(locked, 0o000);
+  // The headers are sent before the file is opened, so the failure shows as a broken response.
+  const body = await fetch(url('/assets/locked.js'))
+    .then((response) => response.text())
+    .catch(() => 'failed');
+  // As root the file is still readable; either way the server must survive.
+  expect(['failed', 'console.log("locked")']).toContain(body);
+  await chmod(locked, 0o644);
+  expect((await fetch(url('/'))).status).toBe(200);
+});
+
+test('starting on a port that is already in use is refused', async () => {
+  await expect(startServer({ port: server.port, clientDir })).rejects.toThrow(/EADDRINUSE/);
+  expect((await fetch(url('/'))).status).toBe(200);
+});
+
 test('knows the content types the client needs', () => {
   expect(contentType('a/b/index.html')).toBe('text/html; charset=utf-8');
   expect(contentType('x.wasm')).toBe('application/wasm');
```

- [x] **Step 9: Run the tests to verify they fail**

Run: `npx vitest run packages/server/src/node`
Expected: FAIL after about 25 seconds, 4 failed and 21 passed, in 2 failed files. The four failures are the new tests, and Vitest also lists unhandled errors: `message failed`, `tick failed`, `EACCES` and `EADDRINUSE`.

- [x] **Step 10: Contain the failures**

Apply this change to `packages/server/src/node/listen.ts` and `packages/server/src/node/static.ts`. The main session provides it as a second patch file.

```diff
diff --git a/packages/server/src/node/listen.ts b/packages/server/src/node/listen.ts
index dfa5fa5..46bb0b7 100644
--- a/packages/server/src/node/listen.ts
+++ b/packages/server/src/node/listen.ts
@@ -15,6 +15,8 @@ export interface ServerOptions {
   // The folder holding the built client.
   clientDir: string;
   vehicleId?: string;
+  // Told about every failure the server survives. The default prints it.
+  onError?: (error: unknown) => void;
 }
 
 export interface RunningServer {
@@ -25,15 +27,25 @@ export interface RunningServer {
 // Wires the room layer to real sockets, real time and an initialised Rapier, and serves the client on the same port.
 export async function startServer(options: ServerOptions): Promise<RunningServer> {
   await RAPIER.init();
+  const report = options.onError ?? ((error: unknown) => console.error(error));
+  // An exception thrown inside a socket or timer callback would end the process, and every room with it.
+  const contain = (fn: () => void, onFailure?: () => void) => {
+    try {
+      fn();
+    } catch (error) {
+      report(error);
+      onFailure?.();
+    }
+  };
   const rooms = createRoomServer(
     {
       rapier: RAPIER,
       clock: () => performance.now() / 1000,
       random: Math.random,
-      onError: (error) => console.error(error),
+      onError: report,
       timer: {
         every(seconds, fn) {
-          const id = setInterval(fn, seconds * 1000);
+          const id = setInterval(() => contain(fn), seconds * 1000);
           return () => clearInterval(id);
         },
       },
@@ -45,6 +57,8 @@ export async function startServer(options: ServerOptions): Promise<RunningServer
     serveStatic(options.clientDir, request, response).catch(() => response.destroy());
   });
   const sockets = new WebSocketServer({ server: http, path: SOCKET_PATH, maxPayload: MAX_MESSAGE_BYTES });
+  // ws repeats the HTTP server's errors here, and an error event nobody listens to is thrown. They are handled on `http`.
+  sockets.on('error', () => {});
   sockets.on('connection', (socket) => {
     const handle = rooms.connect({
       send(data) {
@@ -55,17 +69,27 @@ export async function startServer(options: ServerOptions): Promise<RunningServer
     socket.on('message', (data, isBinary) => {
       // The protocol is JSON text; a binary frame is not part of it.
       if (isBinary) socket.close();
-      else handle.message(data.toString());
+      else contain(() => handle.message(data.toString()), () => socket.terminate());
     });
-    socket.on('close', () => handle.closed());
+    socket.on('close', () => contain(() => handle.closed()));
     // An oversized or malformed frame raises an error; the socket is then dropped.
     socket.on('error', () => socket.terminate());
   });
 
-  await new Promise<void>((resolve, reject) => {
-    http.once('error', reject);
-    http.listen(options.port, resolve);
-  });
+  try {
+    await new Promise<void>((resolve, reject) => {
+      http.once('error', reject);
+      http.listen(options.port, () => {
+        http.off('error', reject);
+        resolve();
+      });
+    });
+  } catch (error) {
+    // The port is taken, most likely. Without this the room timer would keep the process alive.
+    rooms.stop();
+    throw error;
+  }
+  http.on('error', report);
 
   return {
     port: (http.address() as AddressInfo).port,
diff --git a/packages/server/src/node/static.ts b/packages/server/src/node/static.ts
index 5efebb3..7c93a30 100644
--- a/packages/server/src/node/static.ts
+++ b/packages/server/src/node/static.ts
@@ -2,6 +2,7 @@ import { createReadStream } from 'node:fs';
 import { stat } from 'node:fs/promises';
 import type { IncomingMessage, ServerResponse } from 'node:http';
 import path from 'node:path';
+import { pipeline } from 'node:stream';
 
 const CONTENT_TYPES: Record<string, string> = {
   '.html': 'text/html; charset=utf-8',
@@ -78,5 +79,6 @@ export async function serveStatic(root: string, request: IncomingMessage, respon
     response.end();
     return;
   }
-  createReadStream(file).pipe(response);
+  // pipeline closes the file if the client goes away, and a read error ends the response, not the process.
+  pipeline(createReadStream(file), response, () => {});
 }
```

Run: `npm test`
Expected: 18 files, 176 tests passing, and no unhandled error.

Run: `npm run typecheck`
Expected: exits 0.

- [x] **Step 11: Commit**

```bash
git add packages/server/src/node
git commit -m "fix(server): keep the process alive when a file, socket or timer fails

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Client session, routing, socket and interpolation

**Files:**
- Create: `packages/client/src/session.ts`, `packages/client/src/route.ts`, `packages/client/src/net/socket.ts`, `packages/client/src/net/snapshotBuffer.ts`
- Test: `packages/client/src/session.test.ts`, `packages/client/src/route.test.ts`, `packages/client/src/net/snapshotBuffer.test.ts`

**Interfaces:**
- Consumes: protocol types, `SOCKET_PATH`, `cleanRoom`, `lerp`, `nlerp`, `INTERPOLATION_DELAY`, `SNAPSHOT_BUFFER_SIZE`, `CLOCK_OFFSET_SMOOTHING`, `TICK_DT` from `@lodgy/shared`.
- Produces:
  - `sessionToken(store: KeyValueStore, fillRandom: (bytes: Uint8Array<ArrayBuffer>) => void): string`, `savedName(store)`, `saveName(store, name)`, `createMemoryStore(): KeyValueStore`
  - `roomFromPath(pathname: string): string | null`, `socketUrl(location: { protocol: string; host: string }): string`
  - `openSocket(url: string, handlers: { onOpen(): void; onMessage(message: ServerMessage): void; onClose(): void }): GameSocket` with `send(message: ClientMessage): void` and `close(): void`. It answers `ping` with `pong` itself.
  - `createSnapshotBuffer(): SnapshotBuffer` with `push(snapshot: WorldSnapshot, receivedAt: number): void`, `sample(now: number): VehicleState | null`, `latestTick(): number`. Times are in seconds.

`socket.ts` has no unit test: it is a thin wrapper around the browser's `WebSocket`, and the Playwright test in Task 9 exercises it.

- [x] **Step 1: Write the failing tests**

`packages/client/src/session.test.ts`:

```ts
import { parseClientMessage } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createMemoryStore, saveName, savedName, sessionToken } from './session';

const countUp = (bytes: Uint8Array) => bytes.forEach((_, index) => (bytes[index] = index * 17));

test('makes a token from 16 random bytes and keeps it', () => {
  const store = createMemoryStore();
  const token = sessionToken(store, countUp);
  expect(token).toBe('00112233445566778899aabbccddeeff');
  expect(sessionToken(store, () => {
    throw new Error('must not ask for random bytes again');
  })).toBe(token);
});

test('the token is one the server accepts', () => {
  const token = sessionToken(createMemoryStore(), countUp);
  expect(parseClientMessage(JSON.stringify({ type: 'create', name: 'Amal', token }))).not.toBeNull();
});

test('different stores get different tokens', () => {
  const a = sessionToken(createMemoryStore(), (bytes) => bytes.fill(1));
  const b = sessionToken(createMemoryStore(), (bytes) => bytes.fill(2));
  expect(a).not.toBe(b);
});

test('remembers the last name used', () => {
  const store = createMemoryStore();
  expect(savedName(store)).toBe('');
  saveName(store, 'Amal');
  expect(savedName(store)).toBe('Amal');
});
```

`packages/client/src/route.test.ts`:

```ts
import { expect, test } from 'vitest';
import { roomFromPath, socketUrl } from './route';

test('the home page names no room', () => {
  expect(roomFromPath('/')).toBeNull();
  expect(roomFromPath('')).toBeNull();
});

test('a room address names its room, in lower case', () => {
  expect(roomFromPath('/camel')).toBe('camel');
  expect(roomFromPath('/Camel/')).toBe('camel');
  expect(roomFromPath('/tagine2')).toBe('tagine2');
});

test('an address that cannot be a room names none', () => {
  expect(roomFromPath('/a/b')).toBeNull();
  expect(roomFromPath('/index.html')).toBeNull();
  expect(roomFromPath('/camel%20x')).toBeNull();
});

test('the socket address follows the page origin', () => {
  expect(socketUrl({ protocol: 'http:', host: '192.168.1.20:3000' })).toBe('ws://192.168.1.20:3000/ws');
  expect(socketUrl({ protocol: 'https:', host: 'play.example.com' })).toBe('wss://play.example.com/ws');
});
```

`packages/client/src/net/snapshotBuffer.test.ts`:

```ts
import {
  AXIS_Y,
  INTERPOLATION_DELAY,
  SNAPSHOT_BUFFER_SIZE,
  TICK_DT,
  quatFromAxisAngle,
  vec3,
  yawOf,
  type WorldSnapshot,
} from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createSnapshotBuffer } from './snapshotBuffer';

// A snapshot at `tick` whose vehicle sits at z = -tick, has yaw tick / 100 and throttle tick.
const snapshot = (tick: number): WorldSnapshot => ({
  tick,
  vehicle: {
    pos: vec3(0, 1, -tick),
    rot: quatFromAxisAngle(AXIS_Y, tick / 100),
    linvel: vec3(0, 0, -tick),
    throttle: tick,
    steer: 0,
  },
});

// Snapshots every 3 ticks, each arriving exactly when the server's clock reads its tick time plus `latency`.
function filled(ticks: number[], latency = 0) {
  const buffer = createSnapshotBuffer();
  for (const tick of ticks) buffer.push(snapshot(tick), tick * TICK_DT + latency);
  return buffer;
}

test('gives nothing before the first snapshot', () => {
  const buffer = createSnapshotBuffer();
  expect(buffer.sample(1)).toBeNull();
  expect(buffer.latestTick()).toBe(0);
});

test('draws the past: blends the two snapshots around now minus the delay', () => {
  const buffer = filled([3, 6, 9, 12, 15, 18]);
  // Now is tick 18. The delay of 0.1 s is 6 ticks, so the view is at tick 12.
  expect(buffer.sample(18 * TICK_DT)!.pos.z).toBeCloseTo(-12, 6);
  // Half a tick-pair later the view is halfway between ticks 12 and 15.
  const between = buffer.sample(19.5 * TICK_DT)!;
  expect(between.pos.z).toBeCloseTo(-13.5, 6);
  expect(between.linvel.z).toBeCloseTo(-13.5, 6);
  expect(yawOf(between.rot)).toBeCloseTo(0.135, 4);
  expect(between.throttle).toBe(15);
  expect(buffer.latestTick()).toBe(18);
});

test('the same latency on every snapshot does not change what is drawn', () => {
  const buffer = filled([3, 6, 9, 12, 15, 18], 0.25);
  expect(buffer.sample(18 * TICK_DT + 0.25)!.pos.z).toBeCloseTo(-12, 6);
});

test('holds the newest snapshot when none has arrived for a while', () => {
  const buffer = filled([3, 6, 9]);
  expect(buffer.sample(9 * TICK_DT + INTERPOLATION_DELAY + 1)!.pos.z).toBe(-9);
});

test('holds the oldest snapshot when the view is still before it', () => {
  const buffer = filled([30]);
  expect(buffer.sample(30 * TICK_DT)!.pos.z).toBe(-30);
});

test('ignores a snapshot that is not newer than the newest', () => {
  const buffer = filled([3, 6, 9]);
  buffer.push(snapshot(6), 9 * TICK_DT);
  buffer.push(snapshot(9), 9 * TICK_DT);
  expect(buffer.latestTick()).toBe(9);
});

test('one late snapshot barely moves the clock', () => {
  const buffer = filled([3, 6, 9, 12, 15]);
  // Tick 18 arrives 80 ms late.
  buffer.push(snapshot(18), 18 * TICK_DT + 0.08);
  const drawn = buffer.sample(18 * TICK_DT + 0.08)!.pos.z;
  // On time the view would be at tick 16.8 (0.08 s is 4.8 ticks after tick 12).
  expect(drawn).toBeLessThan(-16.3);
  expect(drawn).toBeGreaterThan(-16.8 - 0.001);
});

test('a lasting delay is followed within a few seconds', () => {
  const buffer = filled([3, 6, 9, 12, 15]);
  // From tick 18 on, everything arrives 0.2 s later than before.
  for (let tick = 18; tick <= 18 + 3 * 100; tick += 3) buffer.push(snapshot(tick), tick * TICK_DT + 0.2);
  const lastTick = 18 + 3 * 100;
  const drawn = buffer.sample(lastTick * TICK_DT + 0.2)!.pos.z;
  expect(drawn).toBeCloseTo(-(lastTick - INTERPOLATION_DELAY / TICK_DT), 0);
});

test('keeps only the newest snapshots', () => {
  const ticks = Array.from({ length: SNAPSHOT_BUFFER_SIZE + 10 }, (_, index) => (index + 1) * 3);
  const buffer = filled(ticks);
  // A view from long ago lands on the oldest snapshot still held, which is the 11th pushed.
  expect(buffer.sample(0)!.pos.z).toBe(-33);
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/client`
Expected: FAIL in the three new files, because `./session`, `./route` and `./snapshotBuffer` cannot be resolved. The older client tests still pass.

- [x] **Step 3: Write the implementations**

`packages/client/src/session.ts`:

```ts
const TOKEN_KEY = 'lodgy.token';
const NAME_KEY = 'lodgy.name';

// The part of the Web Storage interface this module uses.
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// Used when the browser refuses access to storage, as some private modes do.
export function createMemoryStore(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

// The token that identifies this tab to the server. It is made once and kept in the given store.
export function sessionToken(store: KeyValueStore, fillRandom: (bytes: Uint8Array<ArrayBuffer>) => void): string {
  const existing = store.getItem(TOKEN_KEY);
  if (existing) return existing;
  const bytes = new Uint8Array(16);
  fillRandom(bytes);
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  store.setItem(TOKEN_KEY, token);
  return token;
}

export const savedName = (store: KeyValueStore): string => store.getItem(NAME_KEY) ?? '';

export const saveName = (store: KeyValueStore, name: string): void => store.setItem(NAME_KEY, name);
```

`packages/client/src/route.ts`:

```ts
import { SOCKET_PATH, cleanRoom } from '@lodgy/shared';

// The room named by the page address: "/camel" gives "camel". The home page and anything else give null.
export function roomFromPath(pathname: string): string | null {
  return cleanRoom(pathname.replace(/^\/+|\/+$/g, ''));
}

// The WebSocket address on the server that served the page.
export function socketUrl(location: { protocol: string; host: string }): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${SOCKET_PATH}`;
}
```

`packages/client/src/net/snapshotBuffer.ts`:

```ts
import {
  CLOCK_OFFSET_SMOOTHING,
  INTERPOLATION_DELAY,
  SNAPSHOT_BUFFER_SIZE,
  TICK_DT,
  lerp,
  nlerp,
  type VehicleState,
  type WorldSnapshot,
} from '@lodgy/shared';

export interface SnapshotBuffer {
  // Stores a snapshot received at local time `receivedAt` (seconds). Snapshots older than the newest are ignored.
  push(snapshot: WorldSnapshot, receivedAt: number): void;
  // The vehicle as it was INTERPOLATION_DELAY before local time `now`, or null before any snapshot.
  sample(now: number): VehicleState | null;
  // The tick of the newest snapshot, or 0 before any.
  latestTick(): number;
}

function blend(a: VehicleState, b: VehicleState, t: number): VehicleState {
  return {
    pos: lerp(a.pos, b.pos, t),
    rot: nlerp(a.rot, b.rot, t),
    linvel: lerp(a.linvel, b.linvel, t),
    throttle: b.throttle,
    steer: b.steer,
  };
}

export function createSnapshotBuffer(): SnapshotBuffer {
  // Oldest first. `time` is the server's clock at the snapshot's tick.
  const entries: { time: number; snapshot: WorldSnapshot }[] = [];
  // Server clock minus local clock, as estimated from arrival times.
  let offset: number | null = null;

  return {
    push(snapshot, receivedAt) {
      const time = snapshot.tick * TICK_DT;
      const newest = entries[entries.length - 1];
      if (newest && time <= newest.time) return;
      const measured = time - receivedAt;
      // A snapshot that arrives early shows the true offset at once; late ones only nudge it,
      // so one delayed packet does not move the clock but a lasting change is followed.
      offset = offset === null || measured > offset ? measured : offset + (measured - offset) * CLOCK_OFFSET_SMOOTHING;
      entries.push({ time, snapshot });
      if (entries.length > SNAPSHOT_BUFFER_SIZE) entries.shift();
    },
    sample(now) {
      const first = entries[0];
      const last = entries[entries.length - 1];
      if (!first || !last || offset === null) return null;
      const time = now + offset - INTERPOLATION_DELAY;
      if (time <= first.time) return first.snapshot.vehicle;
      // Past the newest snapshot there is nothing to blend toward; it is shown as it is, with no guessing ahead.
      if (time >= last.time) return last.snapshot.vehicle;
      let index = entries.length - 2;
      while (entries[index]!.time > time) index -= 1;
      const from = entries[index]!;
      const to = entries[index + 1]!;
      return blend(from.snapshot.vehicle, to.snapshot.vehicle, (time - from.time) / (to.time - from.time));
    },
    latestTick: () => entries[entries.length - 1]?.snapshot.tick ?? 0,
  };
}
```

`packages/client/src/net/socket.ts`:

```ts
import type { ClientMessage, ServerMessage } from '@lodgy/shared';

export interface GameSocket {
  // Sends a message, or does nothing if the socket is not open.
  send(message: ClientMessage): void;
  close(): void;
}

export interface SocketHandlers {
  onOpen(): void;
  onMessage(message: ServerMessage): void;
  // Called once, when the socket closes or fails to open.
  onClose(): void;
}

// Opens the game's WebSocket. Pings from the server are answered here and not passed on.
export function openSocket(url: string, handlers: SocketHandlers): GameSocket {
  const socket = new WebSocket(url);
  socket.addEventListener('open', () => handlers.onOpen());
  socket.addEventListener('close', () => handlers.onClose());
  socket.addEventListener('message', (event) => {
    let message: ServerMessage;
    try {
      message = JSON.parse(String(event.data)) as ServerMessage;
    } catch {
      return;
    }
    if (message.type === 'ping') socket.send('{"type":"pong"}');
    else handlers.onMessage(message);
  });
  return {
    send(message) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
    close: () => socket.close(),
  };
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: 21 files, 193 tests passing.

Run: `npm run typecheck`
Expected: exits 0.

- [x] **Step 5: Commit**

```bash
git add packages/client/src/session.ts packages/client/src/session.test.ts packages/client/src/route.ts packages/client/src/route.test.ts packages/client/src/net
git commit -m "feat(client): add session, routing, socket and snapshot interpolation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [x] **Step 6: Write the failing tests for server messages and the stored token**

The review of this task found two places where the page trusted data it had not checked. Steps 6 to 9 close them. Steps 1 to 5 above are kept as they were first built.

- `socket.ts` cast whatever JSON arrived to a `ServerMessage`. A snapshot without finite numbers would spoil the interpolation until the page was reloaded. The new `parseServerMessage` in `packages/shared/src/protocol.ts` checks each message, and `socket.ts` drops what it rejects. Fields it does not know are kept, and an error reason it does not know becomes `bad_message`.
- `session.ts` returned any stored token. One the server refuses would stop the tab from ever joining a room. `cleanToken` is now exported from `shared`, and a stored token that fails it is replaced. A store that refuses writes no longer makes `sessionToken` or `saveName` throw.

Apply this change to `packages/shared/src/protocol.test.ts` and `packages/client/src/session.test.ts`. The main session provides the same change as a patch file for `git apply`.

```diff
diff --git a/packages/client/src/session.test.ts b/packages/client/src/session.test.ts
index e610305..224a894 100644
--- a/packages/client/src/session.test.ts
+++ b/packages/client/src/session.test.ts
@@ -30,3 +30,23 @@ test('remembers the last name used', () => {
   saveName(store, 'Amal');
   expect(savedName(store)).toBe('Amal');
 });
+
+test('a stored token the server would refuse is replaced', () => {
+  const store = createMemoryStore();
+  for (const bad of ['short', 'has spaces in it, which is not allowed', 'x'.repeat(65)]) {
+    store.setItem('lodgy.token', bad);
+    expect(sessionToken(store, countUp)).toBe('00112233445566778899aabbccddeeff');
+    expect(store.getItem('lodgy.token')).toBe('00112233445566778899aabbccddeeff');
+  }
+});
+
+test('a store that refuses writes still gives a token, and saving a name does not throw', () => {
+  const refusing = {
+    getItem: () => null,
+    setItem: () => {
+      throw new Error('QuotaExceededError');
+    },
+  };
+  expect(sessionToken(refusing, countUp)).toBe('00112233445566778899aabbccddeeff');
+  expect(() => saveName(refusing, 'Amal')).not.toThrow();
+});
diff --git a/packages/shared/src/protocol.test.ts b/packages/shared/src/protocol.test.ts
index c6fe07f..debffe2 100644
--- a/packages/shared/src/protocol.test.ts
+++ b/packages/shared/src/protocol.test.ts
@@ -1,5 +1,15 @@
 import { expect, test } from 'vitest';
-import { NEUTRAL_INPUT, cleanName, cleanRoom, neutralInput, parseClientMessage, type PlayerInput } from './protocol';
+import {
+  NEUTRAL_INPUT,
+  cleanName,
+  cleanRoom,
+  cleanToken,
+  neutralInput,
+  parseClientMessage,
+  parseServerMessage,
+  type PlayerInput,
+  type ServerMessage,
+} from './protocol';
 
 const TOKEN = 'abcdefghijklmnop';
 const INPUT: PlayerInput = { ...NEUTRAL_INPUT, seq: 1 };
@@ -100,3 +110,78 @@ test('the shared neutral input cannot be modified', () => {
     (NEUTRAL_INPUT as { moveX: number }).moveX = 1;
   }).toThrow(TypeError);
 });
+
+test('cleanToken accepts what parseClientMessage accepts as a token', () => {
+  expect(cleanToken('abcdefghijklmnop')).toBe('abcdefghijklmnop');
+  expect(cleanToken('abcdefghijklmno')).toBeNull();
+  expect(cleanToken('abcdefghijklmnop!')).toBeNull();
+  expect(cleanToken(null)).toBeNull();
+});
+
+const vehicle = {
+  pos: { x: 1, y: 2, z: 3 },
+  rot: { x: 0, y: 0, z: 0, w: 1 },
+  linvel: { x: 0, y: 0, z: -4 },
+  throttle: 1,
+  steer: 0,
+};
+const snapshot = { type: 'snapshot', tick: 30, ackSeq: 7, full: false, vehicle };
+const lobby = {
+  type: 'lobby',
+  room: 'camel',
+  phase: 'playing',
+  players: [{ playerId: 'p1', name: 'Amal', colour: '#e4572e', ready: false, connected: true }],
+  adminId: 'p1',
+  courseId: 'test',
+  vehicleId: 'lodgy',
+};
+
+test.each<ServerMessage>([
+  { type: 'ping' },
+  { type: 'welcome', playerId: 'p1', room: 'camel' },
+  { type: 'error', reason: 'room_full' },
+  lobby as ServerMessage,
+  { ...lobby, players: [], adminId: null } as ServerMessage,
+  snapshot as ServerMessage,
+  { ...snapshot, tick: 0, ackSeq: 0, full: true } as ServerMessage,
+])('parseServerMessage accepts %j', (message) => {
+  expect(parseServerMessage(JSON.stringify(message))).toEqual(message);
+});
+
+test.each([
+  ['text that is not JSON', 'not json'],
+  ['null', 'null'],
+  ['an array', '[]'],
+  ['a number', '5'],
+  ['no type', '{}'],
+  ['an unknown type', '{"type":"teleport"}'],
+  ['a welcome without a room', '{"type":"welcome","playerId":"p1"}'],
+  ['an error without a reason', '{"type":"error"}'],
+  ['a lobby whose players are not a list', JSON.stringify({ ...lobby, players: 'Amal' })],
+  ['a lobby player without a name', JSON.stringify({ ...lobby, players: [{ playerId: 'p1' }] })],
+  ['a lobby with an unknown phase', JSON.stringify({ ...lobby, phase: 'paused' })],
+  ['a lobby whose admin is a number', JSON.stringify({ ...lobby, adminId: 1 })],
+  ['a snapshot without a vehicle', JSON.stringify({ ...snapshot, vehicle: undefined })],
+  ['a snapshot whose tick is text', JSON.stringify({ ...snapshot, tick: '30' })],
+  ['a snapshot whose tick is null', JSON.stringify({ ...snapshot, tick: null })],
+  ['a snapshot whose tick is negative', JSON.stringify({ ...snapshot, tick: -1 })],
+  ['a snapshot whose tick is not whole', JSON.stringify({ ...snapshot, tick: 1.5 })],
+  ['a snapshot whose tick is too large to be finite', JSON.stringify(snapshot).replace('"tick":30', '"tick":1e999')],
+  ['a snapshot whose ackSeq is missing', JSON.stringify({ ...snapshot, ackSeq: undefined })],
+  ['a snapshot whose full is not a boolean', JSON.stringify({ ...snapshot, full: 1 })],
+  ['a snapshot whose position lacks z', JSON.stringify({ ...snapshot, vehicle: { ...vehicle, pos: { x: 1, y: 2 } } })],
+  ['a snapshot whose rotation lacks w', JSON.stringify({ ...snapshot, vehicle: { ...vehicle, rot: { x: 0, y: 0, z: 0 } } })],
+  ['a snapshot whose velocity is null', JSON.stringify({ ...snapshot, vehicle: { ...vehicle, linvel: null } })],
+  ['a snapshot whose throttle is text', JSON.stringify({ ...snapshot, vehicle: { ...vehicle, throttle: 'full' } })],
+])('parseServerMessage rejects %s', (_label, raw) => {
+  expect(parseServerMessage(raw)).toBeNull();
+});
+
+test('parseServerMessage shows a reason it does not know as a general refusal', () => {
+  expect(parseServerMessage('{"type":"error","reason":"kicked"}')).toEqual({ type: 'error', reason: 'bad_message' });
+});
+
+test('parseServerMessage keeps fields it does not know, so a newer server can add to a message', () => {
+  const newer = { ...snapshot, players: [{ playerId: 'p1' }] };
+  expect(parseServerMessage(JSON.stringify(newer))).toEqual(newer);
+});
```

- [x] **Step 7: Run the tests to verify they fail**

Run: `npx vitest run packages/shared/src/protocol.test.ts packages/client/src/session.test.ts`
Expected: FAIL, 36 failed and 35 passed, in 2 failed files: `parseServerMessage is not a function`, `cleanToken is not a function`, `expected 'short' to be '00112233445566778899aabbccddeeff'` and `Error: QuotaExceededError`.

- [x] **Step 8: Check server messages and the stored token**

Apply this change to `packages/shared/src/protocol.ts`, `packages/client/src/session.ts` and `packages/client/src/net/socket.ts`. The main session provides it as a second patch file.

```diff
diff --git a/packages/client/src/net/socket.ts b/packages/client/src/net/socket.ts
index 824bd31..9a6f161 100644
--- a/packages/client/src/net/socket.ts
+++ b/packages/client/src/net/socket.ts
@@ -1,4 +1,4 @@
-import type { ClientMessage, ServerMessage } from '@lodgy/shared';
+import { parseServerMessage, type ClientMessage, type ServerMessage } from '@lodgy/shared';
 
 export interface GameSocket {
   // Sends a message, or does nothing if the socket is not open.
@@ -19,12 +19,9 @@ export function openSocket(url: string, handlers: SocketHandlers): GameSocket {
   socket.addEventListener('open', () => handlers.onOpen());
   socket.addEventListener('close', () => handlers.onClose());
   socket.addEventListener('message', (event) => {
-    let message: ServerMessage;
-    try {
-      message = JSON.parse(String(event.data)) as ServerMessage;
-    } catch {
-      return;
-    }
+    // A message the page cannot use is dropped.
+    const message = parseServerMessage(String(event.data));
+    if (!message) return;
     if (message.type === 'ping') socket.send('{"type":"pong"}');
     else handlers.onMessage(message);
   });
diff --git a/packages/client/src/session.ts b/packages/client/src/session.ts
index c259426..204f5ba 100644
--- a/packages/client/src/session.ts
+++ b/packages/client/src/session.ts
@@ -1,3 +1,5 @@
+import { cleanToken } from '@lodgy/shared';
+
 const TOKEN_KEY = 'lodgy.token';
 const NAME_KEY = 'lodgy.name';
 
@@ -18,17 +20,27 @@ export function createMemoryStore(): KeyValueStore {
   };
 }
 
+// Storage can refuse a write (it is full, or a private mode forbids it); the value is then not remembered.
+function remember(store: KeyValueStore, key: string, value: string): void {
+  try {
+    store.setItem(key, value);
+  } catch {
+    return;
+  }
+}
+
 // The token that identifies this tab to the server. It is made once and kept in the given store.
 export function sessionToken(store: KeyValueStore, fillRandom: (bytes: Uint8Array<ArrayBuffer>) => void): string {
-  const existing = store.getItem(TOKEN_KEY);
+  // A stored value the server would refuse is replaced; with it, this tab could never join a room.
+  const existing = cleanToken(store.getItem(TOKEN_KEY));
   if (existing) return existing;
   const bytes = new Uint8Array(16);
   fillRandom(bytes);
   const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
-  store.setItem(TOKEN_KEY, token);
+  remember(store, TOKEN_KEY, token);
   return token;
 }
 
 export const savedName = (store: KeyValueStore): string => store.getItem(NAME_KEY) ?? '';
 
-export const saveName = (store: KeyValueStore, name: string): void => store.setItem(NAME_KEY, name);
+export const saveName = (store: KeyValueStore, name: string): void => remember(store, NAME_KEY, name);
diff --git a/packages/shared/src/protocol.ts b/packages/shared/src/protocol.ts
index 460aacd..b28ddf8 100644
--- a/packages/shared/src/protocol.ts
+++ b/packages/shared/src/protocol.ts
@@ -1,5 +1,6 @@
 import { NAME_MAX_LENGTH } from './constants';
-import { clamp, deepFreeze } from './math';
+import { clamp, deepFreeze, type Quat, type Vec3 } from './math';
+import type { VehicleState } from './vehicle';
 import type { WorldSnapshot } from './world';
 
 export interface PlayerInput {
@@ -49,6 +50,7 @@ export type ClientMessage =
 export type Phase = 'lobby' | 'playing' | 'results';
 
 export type ErrorReason = 'unknown_room' | 'room_full' | 'name_taken' | 'bad_message' | 'server_full';
+const ERROR_REASONS: readonly string[] = ['unknown_room', 'room_full', 'name_taken', 'bad_message', 'server_full'] satisfies ErrorReason[];
 
 export interface LobbyPlayer {
   playerId: string;
@@ -99,7 +101,8 @@ export function cleanRoom(value: unknown): string | null {
   return ROOM_PATTERN.test(room) ? room : null;
 }
 
-const cleanToken = (value: unknown): string | null =>
+// A session token the server accepts, or null.
+export const cleanToken = (value: unknown): string | null =>
   typeof value === 'string' && TOKEN_PATTERN.test(value) ? value : null;
 
 const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
@@ -167,3 +170,65 @@ export function parseClientMessage(raw: string): ClientMessage | null {
       return null;
   }
 }
+
+const isRecord = (value: unknown): value is Record<string, unknown> =>
+  typeof value === 'object' && value !== null && !Array.isArray(value);
+const isText = (value: unknown): value is string => typeof value === 'string';
+const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
+const isVec3 = (value: unknown): value is Vec3 =>
+  isRecord(value) && finite(value.x) && finite(value.y) && finite(value.z);
+const isQuat = (value: unknown): value is Quat => isRecord(value) && finite(value.w) && isVec3(value);
+const isVehicleState = (value: unknown): value is VehicleState =>
+  isRecord(value) &&
+  isVec3(value.pos) &&
+  isQuat(value.rot) &&
+  isVec3(value.linvel) &&
+  finite(value.throttle) &&
+  finite(value.steer);
+const isLobbyPlayer = (value: unknown): value is LobbyPlayer =>
+  isRecord(value) &&
+  isText(value.playerId) &&
+  isText(value.name) &&
+  isText(value.colour) &&
+  typeof value.ready === 'boolean' &&
+  typeof value.connected === 'boolean';
+
+// Checks one message from the server. Returns null for anything the page cannot use.
+// The server is trusted, but the page may be older than it, and one snapshot without finite numbers would spoil the interpolation for good.
+// Fields this version does not know are kept, so a newer server can add to a message.
+export function parseServerMessage(raw: string): ServerMessage | null {
+  let data: unknown;
+  try {
+    data = JSON.parse(raw);
+  } catch {
+    return null;
+  }
+  if (!isRecord(data)) return null;
+  const message = data as unknown as ServerMessage;
+  switch (data.type) {
+    case 'ping':
+      return message;
+    case 'welcome':
+      return isText(data.playerId) && isText(data.room) ? message : null;
+    case 'error':
+      if (!isText(data.reason)) return null;
+      // A reason this version does not know is shown as a general refusal.
+      return ERROR_REASONS.includes(data.reason) ? message : { type: 'error', reason: 'bad_message' };
+    case 'lobby':
+      return isText(data.room) &&
+        (data.phase === 'lobby' || data.phase === 'playing' || data.phase === 'results') &&
+        Array.isArray(data.players) &&
+        data.players.every(isLobbyPlayer) &&
+        (data.adminId === null || isText(data.adminId)) &&
+        isText(data.courseId) &&
+        isText(data.vehicleId)
+        ? message
+        : null;
+    case 'snapshot':
+      return isCount(data.tick) && isCount(data.ackSeq) && typeof data.full === 'boolean' && isVehicleState(data.vehicle)
+        ? message
+        : null;
+    default:
+      return null;
+  }
+}
```

Run: `npm test`
Expected: 21 files, 229 tests passing.

Run: `npm run typecheck`
Expected: exits 0.

- [x] **Step 9: Commit**

```bash
git add packages/shared/src/protocol.ts packages/shared/src/protocol.test.ts packages/client/src
git commit -m "fix(client): check server messages and the stored token

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: The page plays through the server

**Files:**
- Modify: `packages/client/src/ui/overlay.ts`, `packages/client/src/main.ts`, `packages/client/index.html`
- Create: `packages/client/src/ui/home.ts`, `packages/client/src/game.ts`
- Test: `packages/client/src/ui/overlay.test.ts`

**Interfaces:**
- Consumes: Task 7's modules; `createKeyboardSource`, `createFixedStepper`, `createScene`, `createVehicleMesh`, `placeVehicleMesh`, `updateFollowCamera` from step 1.
- Produces:
  - `overlayText(data: { lobby: LobbyMessage; tick: number; fps: number; vehicle: VehicleState | null }): string`
  - `createHome(root: HTMLElement, handlers: { onCreate(name: string): void; onJoin(room: string, name: string): void }): HomeView`, `errorText(reason: ErrorReason): string`
  - `createGame(view: { renderer: THREE.WebGLRenderer; overlay: HTMLElement }, firstLobby: LobbyMessage, send: (message: ClientMessage) => void): Game` with `setLobby`, `pushSnapshot`, `stop`
  - element ids the Playwright test relies on: `home`, `home-form`, `home-title`, `home-name`, `home-primary`, `home-room`, `home-room-row`, `home-join`, `home-error`, `home-link`, `overlay`, `game`

How the page behaves:

- At `/` it shows the name field, a "Create room" button, and a room field with a "Join" button.
- At `/<noun>` it shows "Join room <noun>", the name field, a "Join" button and a link back to the home page.
- After `welcome` the address becomes `/<noun>` without a reload, the form hides and the run starts when the first `lobby` message arrives.
- An `error` message shows its text on the form. A closed socket shows the form again with "The connection to the server was lost."
- `?vehicle=rv` is gone. The server chooses the vehicle.

The form and the canvas wiring have no unit test; the Playwright test in Task 9 covers them.

- [x] **Step 1: Replace the overlay test**

`packages/client/src/ui/overlay.test.ts`:

```ts
import { AXIS_Y, IDENTITY, quatFromAxisAngle, vec3, type LobbyMessage, type VehicleState } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { overlayText } from './overlay';

const lobby: LobbyMessage = {
  type: 'lobby',
  room: 'camel',
  phase: 'playing',
  players: [
    { playerId: 'p1', name: 'Amal', colour: '#e4572e', ready: false, connected: true },
    { playerId: 'p2', name: 'Badr', colour: '#17bebb', ready: false, connected: true },
  ],
  adminId: 'p1',
  courseId: 'test',
  vehicleId: 'rv',
};

const vehicle: VehicleState = {
  pos: vec3(1.25, 1.7, -30.04),
  rot: IDENTITY,
  linvel: vec3(0, 0, -10),
  throttle: 1,
  steer: -0.5,
};

test('shows the room, the players and who drives', () => {
  const text = overlayText({ lobby, tick: 180, fps: 59.6, vehicle });
  expect(text).toContain('room     camel   vehicle rv   course test');
  expect(text).toContain('players  Amal (drives), Badr');
  expect(text).toContain('tick     180   fps 60');
});

test('shows the speed along the vehicle, the position and the controls', () => {
  const text = overlayText({ lobby, tick: 180, fps: 60, vehicle });
  expect(text).toContain('speed       36.0 km/h');
  expect(text).toContain('pos          1.3     1.7   -30.0');
  expect(text).toContain('throttle    1.00   steer   -0.50');
});

test('speed is negative when the vehicle rolls backwards, whichever way it faces', () => {
  const facingLeft = { ...vehicle, rot: quatFromAxisAngle(AXIS_Y, Math.PI / 2), linvel: vec3(5, 0, 0) };
  expect(overlayText({ lobby, tick: 1, fps: 60, vehicle: facingLeft })).toContain('speed      -18.0 km/h');
});

test('says it is waiting before the first snapshot', () => {
  const text = overlayText({ lobby, tick: 0, fps: 60, vehicle: null });
  expect(text).toContain('waiting for the server');
  expect(text).not.toContain('speed');
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/client/src/ui/overlay.test.ts`
Expected: FAIL: the old `overlayText` expects a world, not this data.

- [x] **Step 3: Replace the overlay**

`packages/client/src/ui/overlay.ts`:

```ts
import { dot, rotate, vec3, type LobbyMessage, type VehicleState } from '@lodgy/shared';

const FORWARD = vec3(0, 0, -1);
const fixed = (value: number, digits = 1) => value.toFixed(digits).padStart(7);

export interface OverlayData {
  lobby: LobbyMessage;
  tick: number;
  fps: number;
  // Null until the first snapshot arrives.
  vehicle: VehicleState | null;
}

// The debug text shown until the real HUD exists.
export function overlayText({ lobby, tick, fps, vehicle }: OverlayData): string {
  // Until seats exist (step 3) the first player in the list drives.
  const names = lobby.players.map((player, index) => (index === 0 ? `${player.name} (drives)` : player.name));
  const lines = [
    `room     ${lobby.room}   vehicle ${lobby.vehicleId}   course ${lobby.courseId}`,
    `players  ${names.join(', ')}`,
    `tick     ${tick}   fps ${Math.round(fps)}`,
  ];
  if (vehicle) {
    const speed = dot(vehicle.linvel, rotate(vehicle.rot, FORWARD));
    lines.push(
      `speed    ${fixed(speed * 3.6)} km/h`,
      `pos      ${fixed(vehicle.pos.x)} ${fixed(vehicle.pos.y)} ${fixed(vehicle.pos.z)}`,
      `throttle ${fixed(vehicle.throttle, 2)}   steer ${fixed(vehicle.steer, 2)}`,
    );
  } else {
    lines.push('waiting for the server…');
  }
  lines.push('', 'WASD drive   Space brake');
  return lines.join('\n');
}
```

- [x] **Step 4: Write the home form, the game and the new entry point**

`packages/client/src/ui/home.ts`:

```ts
import { cleanName, cleanRoom, type ErrorReason } from '@lodgy/shared';

const ERROR_TEXT: Record<ErrorReason, string> = {
  unknown_room: 'There is no room with that name.',
  room_full: 'That room is full.',
  name_taken: 'Someone in that room already has that name.',
  bad_message: 'The server did not understand the request.',
  server_full: 'The server has no space for another room. Try again later.',
};

export const errorText = (reason: ErrorReason): string => ERROR_TEXT[reason];

export interface HomeHandlers {
  onCreate(name: string): void;
  onJoin(room: string, name: string): void;
}

export interface HomeView {
  // Shows the form. With a room it offers to join that room; without, to create one or to join one by name.
  show(options: { room: string | null; name: string; error?: string }): void;
  hide(): void;
  setError(text: string): void;
  // Disables the buttons while a request is with the server.
  setBusy(busy: boolean): void;
}

// The home page and the "join this room" page. The markup is in index.html; this wires it up.
export function createHome(root: HTMLElement, handlers: HomeHandlers): HomeView {
  const find = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const form = find<HTMLFormElement>('home-form');
  const title = find('home-title');
  const error = find('home-error');
  const nameInput = find<HTMLInputElement>('home-name');
  const roomInput = find<HTMLInputElement>('home-room');
  const roomRow = find('home-room-row');
  // The form's main button: "Create room" on the home page, "Join" on a room's page.
  const primaryButton = find<HTMLButtonElement>('home-primary');
  const joinButton = find<HTMLButtonElement>('home-join');
  const homeLink = find('home-link');
  // The room named by the address, when the page was opened by a room link.
  let linkedRoom: string | null = null;

  const setError = (text: string) => {
    error.textContent = text;
  };

  const join = () => {
    const name = cleanName(nameInput.value);
    if (!name) return setError('Enter a name of 1 to 16 characters.');
    const room = linkedRoom ?? cleanRoom(roomInput.value);
    if (!room) return setError('Enter the name of the room, for example camel.');
    setError('');
    handlers.onJoin(room, name);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    // Enter joins when the page is for one room or a room has been typed; otherwise it creates.
    if (linkedRoom || roomInput.value.trim() !== '') return join();
    const name = cleanName(nameInput.value);
    if (!name) return setError('Enter a name of 1 to 16 characters.');
    setError('');
    handlers.onCreate(name);
  });
  joinButton.addEventListener('click', join);

  return {
    show({ room, name, error: message = '' }) {
      linkedRoom = room;
      title.textContent = room ? `Join room ${room}` : 'Lodgy Co-op';
      nameInput.value = name;
      roomRow.hidden = room !== null;
      primaryButton.textContent = room ? 'Join' : 'Create room';
      homeLink.hidden = room === null;
      setError(message);
      root.hidden = false;
      nameInput.focus();
    },
    hide() {
      root.hidden = true;
    },
    setError,
    setBusy(busy) {
      primaryButton.disabled = busy;
      joinButton.disabled = busy;
    },
  };
}
```

`packages/client/src/game.ts`:

```ts
import { getCourse, getVehicleConfig, type ClientMessage, type LobbyMessage, type WorldSnapshot } from '@lodgy/shared';
import * as THREE from 'three';
import { createKeyboardSource } from './input/keyboard';
import { createFixedStepper } from './loop';
import { createSnapshotBuffer } from './net/snapshotBuffer';
import { updateFollowCamera } from './render/followCamera';
import { createScene } from './render/scene';
import { createVehicleMesh, placeVehicleMesh } from './render/vehicleMesh';
import { overlayText } from './ui/overlay';

// A frame longer than this (a background tab, a debugger pause) is treated as this long.
const MAX_FRAME_SECONDS = 0.25;

export interface Game {
  setLobby(lobby: LobbyMessage): void;
  pushSnapshot(snapshot: WorldSnapshot): void;
  // Stops drawing and listening for input.
  stop(): void;
}

export interface GameView {
  renderer: THREE.WebGLRenderer;
  overlay: HTMLElement;
}

// Draws one run: sends an input every tick and shows the vehicle from the server's snapshots.
export function createGame(view: GameView, firstLobby: LobbyMessage, send: (message: ClientMessage) => void): Game {
  const { renderer, overlay } = view;
  let lobby = firstLobby;
  const scene = createScene(getCourse(lobby.courseId));
  const vehicleMesh = createVehicleMesh(getVehicleConfig(lobby.vehicleId));
  vehicleMesh.visible = false;
  scene.add(vehicleMesh);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 6, 14);

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const buffer = createSnapshotBuffer();
  const keyboard = createKeyboardSource(window);
  let seq = 0;
  const stepper = createFixedStepper(() => {
    seq += 1;
    send({ type: 'input', ...keyboard.sample(), seq });
  });

  let last = performance.now();
  let fps = 60;
  let frameRequest = requestAnimationFrame(function frame(now: number) {
    const frameSeconds = Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
    last = now;
    stepper.advance(frameSeconds);
    if (frameSeconds > 0) fps += (1 / frameSeconds - fps) * 0.05;

    const vehicle = buffer.sample(now / 1000);
    if (vehicle) {
      vehicleMesh.visible = true;
      placeVehicleMesh(vehicleMesh, vehicle);
      updateFollowCamera(camera, vehicle, frameSeconds);
    }
    overlay.textContent = overlayText({ lobby, tick: buffer.latestTick(), fps, vehicle });
    renderer.render(scene, camera);
    frameRequest = requestAnimationFrame(frame);
  });

  return {
    setLobby(next) {
      lobby = next;
    },
    pushSnapshot: (snapshot) => buffer.push(snapshot, performance.now() / 1000),
    stop() {
      cancelAnimationFrame(frameRequest);
      window.removeEventListener('resize', resize);
      keyboard.dispose();
    },
  };
}
```

Replace `packages/client/src/main.ts` with:

```ts
import type { ClientMessage, LobbyMessage, ServerMessage } from '@lodgy/shared';
import * as THREE from 'three';
import { createGame, type Game } from './game';
import { openSocket, type GameSocket } from './net/socket';
import { roomFromPath, socketUrl } from './route';
import { createMemoryStore, saveName, savedName, sessionToken, type KeyValueStore } from './session';
import { createHome, errorText } from './ui/home';

// Some private browsing modes refuse access to storage; the page then works without remembering anything.
function storage(get: () => Storage): KeyValueStore {
  try {
    const store = get();
    store.getItem('lodgy.probe');
    return store;
  } catch {
    return createMemoryStore();
  }
}

const nameStore = storage(() => localStorage);
// Session storage is per tab, so each tab is its own player and a reload keeps its identity.
const token = sessionToken(
  storage(() => sessionStorage),
  (bytes) => crypto.getRandomValues(bytes),
);

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const overlay = document.querySelector<HTMLElement>('#overlay')!;
const CONNECTION_LOST = 'The connection to the server was lost.';

let renderer: THREE.WebGLRenderer | null = null;
let socket: GameSocket | null = null;
let game: Game | null = null;
let name = savedName(nameStore);
// What the home page says when the socket next closes.
let closeReason = CONNECTION_LOST;

const home = createHome(document.querySelector<HTMLElement>('#home')!, {
  onCreate(chosenName) {
    name = chosenName;
    request({ type: 'create', name, token });
  },
  onJoin(room, chosenName) {
    name = chosenName;
    request({ type: 'join', room, name, token });
  },
});

function onMessage(message: ServerMessage) {
  switch (message.type) {
    case 'welcome':
      saveName(nameStore, name);
      // Creating a room, or joining one by name, changes the address to the room's without reloading.
      if (roomFromPath(location.pathname) !== message.room) history.pushState(null, '', `/${message.room}`);
      home.hide();
      return;
    case 'lobby':
      if (game) game.setLobby(message);
      else startGame(message);
      return;
    case 'snapshot':
      game?.pushSnapshot(message);
      return;
    case 'error':
      home.setBusy(false);
      home.setError(errorText(message.reason));
      return;
  }
}

// The renderer is made when the first run starts, so a browser without WebGL still gets the home page and a clear message.
function startGame(lobby: LobbyMessage) {
  try {
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
  } catch {
    closeReason = 'This browser cannot show 3D graphics (WebGL is not available).';
    socket?.close();
    return;
  }
  game = createGame({ renderer, overlay }, lobby, (outgoing) => socket?.send(outgoing));
}

function onClose() {
  socket = null;
  game?.stop();
  game = null;
  overlay.textContent = '';
  home.setBusy(false);
  home.show({ room: roomFromPath(location.pathname), name, error: closeReason });
  closeReason = CONNECTION_LOST;
}

// Sends a create or join request, opening the socket first if there is none.
function request(message: ClientMessage) {
  home.setBusy(true);
  if (socket) {
    socket.send(message);
    return;
  }
  const opened = openSocket(socketUrl(location), {
    onOpen: () => opened.send(message),
    onMessage,
    onClose,
  });
  socket = opened;
}

// Back and forward change the address without loading the page; reloading puts the page in step with it.
window.addEventListener('popstate', () => location.reload());

home.show({ room: roomFromPath(location.pathname), name });
```

Replace `packages/client/index.html` with:

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
        font: 16px/1.4 system-ui, sans-serif;
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
      #overlay:empty {
        display: none;
      }
      #home {
        position: fixed;
        inset: 0;
        display: grid;
        place-items: center;
        background: #cfe6f5;
      }
      #home[hidden],
      #home [hidden] {
        display: none;
      }
      #home-form {
        display: grid;
        gap: 12px;
        width: min(320px, 90vw);
        padding: 24px;
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
      }
      #home-form h1 {
        margin: 0;
        font-size: 22px;
      }
      #home-form label {
        display: grid;
        gap: 4px;
        font-size: 14px;
      }
      #home-form input,
      #home-form button {
        padding: 10px;
        font: inherit;
        border: 1px solid #9ab;
        border-radius: 6px;
      }
      #home-form button {
        color: #fff;
        background: #2f6f9f;
        border-color: #2f6f9f;
      }
      #home-form button:disabled {
        opacity: 0.6;
      }
      #home-room-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        align-items: end;
      }
      #home-error {
        margin: 0;
        min-height: 1.4em;
        color: #b3261e;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <pre id="overlay"></pre>
    <div id="home" hidden>
      <form id="home-form" novalidate>
        <h1 id="home-title">Lodgy Co-op</h1>
        <label>
          Your name
          <input id="home-name" maxlength="16" autocomplete="nickname" />
        </label>
        <button id="home-primary" type="submit">Create room</button>
        <div id="home-room-row">
          <label>
            Or join a room
            <input id="home-room" maxlength="24" autocapitalize="none" autocomplete="off" placeholder="camel" />
          </label>
          <button id="home-join" type="button">Join</button>
        </div>
        <p id="home-error" role="alert"></p>
        <a id="home-link" href="/" hidden>Back to the home page</a>
      </form>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [x] **Step 5: Run the checks**

Run: `npm test`
Expected: 21 files, 231 tests passing.

Run: `npm run typecheck`
Expected: exits 0.

Run: `npm run build`
Expected: ends with `✓ built in …`. The bundle is now about 540 kB, because the page no longer contains Rapier. A warning about chunks larger than 500 kB is still expected.

- [x] **Step 6: Commit**

```bash
git add packages/client/index.html packages/client/src/main.ts packages/client/src/game.ts packages/client/src/ui
git commit -m "feat(client): play through the server, with a home page

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [x] **Step 7: Stop the form zooming and clipping on a phone**

The review of this task found that the form's fields inherited 14px text from their labels. iOS Safari zooms the page when a focused field's text is smaller than 16px, and the zoom can stay once the game starts. The same change lets the form scroll when the keyboard leaves less height than the form needs. This is a styles-only change, so it has no test; the smoke test of Task 9 still has to pass with it, and how it looks on a real iPhone is the owner's check at step 14.

Apply this change to `packages/client/index.html`. The main session provides it as a patch file for `git apply`.

```diff
diff --git a/packages/client/index.html b/packages/client/index.html
index 9f45cc2..ca32ab9 100644
--- a/packages/client/index.html
+++ b/packages/client/index.html
@@ -39,7 +39,8 @@
         position: fixed;
         inset: 0;
         display: grid;
-        place-items: center;
+        /* With the keyboard open on a phone in landscape the form is taller than the screen, so it must scroll. */
+        overflow-y: auto;
         background: #cfe6f5;
       }
       #home[hidden],
@@ -50,6 +51,8 @@
         display: grid;
         gap: 12px;
         width: min(320px, 90vw);
+        /* Centres the form, and unlike centring on the container keeps its top reachable when it overflows. */
+        margin: auto;
         padding: 24px;
         background: #fff;
         border-radius: 8px;
@@ -68,6 +71,8 @@
       #home-form button {
         padding: 10px;
         font: inherit;
+        /* iOS Safari zooms the page when a focused field's text is smaller than 16px. */
+        font-size: 16px;
         border: 1px solid #9ab;
         border-radius: 6px;
       }
```

Run: `npm test`
Expected: 21 files, 231 tests passing.

Run: `npm run build`
Expected: ends with `✓ built in …`.

- [x] **Step 8: Commit**

```bash
git add packages/client/index.html
git commit -m "fix(client): keep the home form from zooming or clipping on a phone

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Browser smoke test

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`
- Modify: `package.json`, `package-lock.json`, `.gitignore`

**Interfaces:**
- Consumes: `npm start`, and the element ids listed in Task 8.
- Produces: `npm run e2e`. It builds the client, starts the real server on port 3100, and runs six tests in two projects: `desktop` (1280×720) and `phone` (an iPhone 14 landscape viewport with touch; in Chromium as first built, in WebKit after steps 7 and 8).

- [x] **Step 1: Add Playwright**

In the root `package.json`, add this line directly after the `"start": …` line:

```json
    "e2e": "playwright test",
```

and replace the `devDependencies` block with

```json
  "devDependencies": {
    "@playwright/test": "1.65.0",
    "tsx": "4.23.15",
    "typescript": "7.0.2",
    "vitest": "5.1.0"
  }
```

Run: `npm install`
Expected: packages are added, `found 0 vulnerabilities`.

Run: `npx playwright install chromium`
Expected: it downloads Chromium's headless shell (about 100 MB, into the user's cache folder, not the repository), or reports that it is already installed.

- [x] **Step 2: Ignore the test output folders**

In `.gitignore`, add these two lines directly after the line `.superpowers/`:

```
test-results/
playwright-report/
```

- [x] **Step 3: Write the configuration and the test**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

// The smoke test runs against the real server serving the built client, as players would use it.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:3100' },
  webServer: {
    command: 'npm start',
    env: { PORT: '3100' },
    url: 'http://localhost:3100/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    // An iPhone-sized touch viewport. It runs in Chromium so that only one browser has to be installed.
    { name: 'phone', use: { ...devices['iPhone 14 landscape'], browserName: 'chromium' } },
  ],
});
```

`e2e/smoke.spec.ts`:

```ts
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

// Reads one numeric field of the debug overlay, for example the tick or the vehicle's z position.
async function overlayNumber(page: Page, pattern: RegExp): Promise<number> {
  const text = (await page.locator('#overlay').textContent()) ?? '';
  const match = pattern.exec(text);
  return match ? Number(match[1]) : Number.NaN;
}
const tick = (page: Page) => overlayNumber(page, /tick\s+(\d+)/);
const vehicleZ = (page: Page) => overlayNumber(page, /pos\s+\S+\s+\S+\s+(\S+)/);

// A page in its own browser context, so it has its own session storage: a separate player.
const contexts: BrowserContext[] = [];
async function newPlayerPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  return context.newPage();
}

// Contexts made by hand are not closed by the test runner; left open, their pages keep drawing and slow later tests.
test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
});

// Opens the home page, creates a room as `name` and returns the room's noun.
async function createRoom(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.locator('#home-name').fill(name);
  await page.locator('#home-primary').click();
  await expect(page.locator('#home')).toBeHidden();
  // Creating a room changes the address to the room's.
  await expect(page).toHaveURL(/\/[a-z]+\d*$/);
  return new URL(page.url()).pathname.slice(1);
}

test('two players share a room and see the same vehicle, driven by the first', async ({ browser }) => {
  const amal = await newPlayerPage(browser);
  const badr = await newPlayerPage(browser);
  const room = await createRoom(amal, 'Amal');

  // Badr opens the room's link, gives a name and joins.
  await badr.goto(`/${room}`);
  await expect(badr.locator('#home-title')).toHaveText(`Join room ${room}`);
  await badr.locator('#home-name').fill('Badr');
  await badr.locator('#home-primary').click();
  await expect(badr.locator('#home')).toBeHidden();

  for (const page of [amal, badr]) {
    await expect(page.locator('#overlay')).toContainText('players  Amal (drives), Badr');
    // Snapshots are arriving: the tick shown keeps rising.
    const before = await tick(page);
    await expect.poll(() => tick(page)).toBeGreaterThan(before);
  }

  // Badr's throttle does nothing: only the first player drives.
  await badr.keyboard.down('KeyW');
  await badr.waitForTimeout(700);
  await badr.keyboard.up('KeyW');
  expect(await vehicleZ(amal)).toBeGreaterThan(-0.5);

  // Amal drives forward, and both pages see the vehicle move.
  await amal.keyboard.down('KeyW');
  await expect.poll(() => vehicleZ(amal), { timeout: 10_000 }).toBeLessThan(-3);
  await expect.poll(() => vehicleZ(badr), { timeout: 10_000 }).toBeLessThan(-3);
  await amal.keyboard.up('KeyW');

  // The game canvas has been given its drawing size.
  for (const page of [amal, badr]) {
    const size = await page.locator('#game').evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height]);
    expect(size[0]).toBeGreaterThan(0);
    expect(size[1]).toBeGreaterThan(0);
  }
});

test('a room can be joined from the home page by typing its name', async ({ browser }) => {
  const amal = await newPlayerPage(browser);
  const room = await createRoom(amal, 'Amal');

  const badr = await newPlayerPage(browser);
  await badr.goto('/');
  await badr.locator('#home-name').fill('Badr');
  await badr.locator('#home-room').fill(room.toUpperCase());
  await badr.locator('#home-join').click();
  await expect(badr.locator('#home')).toBeHidden();
  await expect(badr).toHaveURL(new RegExp(`/${room}$`));
  await expect(badr.locator('#overlay')).toContainText('players  Amal (drives), Badr');
});

test('a link to a room that does not exist says so and offers the home page', async ({ page }) => {
  await page.goto('/nowhere');
  await page.locator('#home-name').fill('Amal');
  await page.locator('#home-primary').click();
  await expect(page.locator('#home-error')).toHaveText('There is no room with that name.');
  await page.locator('#home-link').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#home-primary')).toHaveText('Create room');
  await expect(page.locator('#home-room')).toBeVisible();
});

test('a name already used in the room is refused, and another name gets in', async ({ browser }) => {
  const amal = await newPlayerPage(browser);
  const room = await createRoom(amal, 'Amal');

  const other = await newPlayerPage(browser);
  await other.goto(`/${room}`);
  await other.locator('#home-name').fill('amal');
  await other.locator('#home-primary').click();
  await expect(other.locator('#home-error')).toHaveText('Someone in that room already has that name.');
  await other.locator('#home-name').fill('Badr');
  await other.locator('#home-primary').click();
  await expect(other.locator('#home')).toBeHidden();
});

test('the name is remembered, and a reload keeps the player in the room', async ({ page }) => {
  await createRoom(page, 'Amal');

  await page.reload();
  await expect(page.locator('#home-name')).toHaveValue('Amal');
  await page.locator('#home-primary').click();
  await expect(page.locator('#home')).toBeHidden();
  // The same tab took its old place: one player, not two, and no "name taken".
  await expect(page.locator('#overlay')).toContainText('players  Amal (drives)\n');
});

test('an empty name is refused on the page, before anything is sent', async ({ page }) => {
  await page.goto('/');
  await page.locator('#home-name').fill('   ');
  await page.locator('#home-primary').click();
  await expect(page.locator('#home-error')).toHaveText('Enter a name of 1 to 16 characters.');
  await expect(page).toHaveURL(/\/$/);
});
```

- [x] **Step 4: Run the smoke test**

Run: `npm run e2e`
Expected: `12 passed`, in about 20 to 40 seconds including the build. If port 3100 is in use the run fails at start-up; report that rather than changing the port.

If a test fails, read `test-results/<test name>/error-context.md`, which holds the page's state at the failure, and include it in your report. Do not change a test or the page to make it pass.

- [x] **Step 5: Run the other checks**

Run: `npm test`
Expected: 21 files, 231 tests passing. The Playwright test is not part of it.

Run: `npm run typecheck`
Expected: exits 0.

Run: `git status --short`
Expected: only `.gitignore`, `package.json`, `package-lock.json`, `playwright.config.ts` and `e2e/` are listed. `test-results/` must not appear.

- [x] **Step 6: Commit**

```bash
git add .gitignore package.json package-lock.json playwright.config.ts e2e
git commit -m "test(e2e): add the browser smoke test

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [x] **Step 7: Run the phone project in WebKit**

The owner asked during the step for the smoke test to cover Safari where possible. Playwright's WebKit is the engine of Safari, so the `phone` project now runs in it. The main session ran the six tests in WebKit three times beforehand; all passed.

Run: `npx playwright install webkit`
Expected: it downloads WebKit (about 80 MB, into the user's cache folder), or reports that it is already installed.

In `playwright.config.ts`, replace

```ts
    // An iPhone-sized touch viewport. It runs in Chromium so that only one browser has to be installed.
    { name: 'phone', use: { ...devices['iPhone 14 landscape'], browserName: 'chromium' } },
```

with

```ts
    // An iPhone in landscape, in WebKit, the engine of Safari. It is not Safari on a real iPhone, which is the owner's check.
    { name: 'phone', use: { ...devices['iPhone 14 landscape'] } },
```

Run: `npm run e2e`
Expected: `12 passed`, the six `[phone]` tests among them, in about 20 to 40 seconds.

Run: `npm run typecheck`
Expected: exits 0.

- [x] **Step 8: Commit**

```bash
git add playwright.config.ts
git commit -m "test(e2e): run the phone project in WebKit

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [x] **Step 9: Make the smoke test prove what its titles say**

The review of this task found that the check "Badr's throttle does nothing" could pass even if Badr's input were applied: 700 ms of throttle moves the vehicle about half a metre, which is the threshold, and nothing showed that Badr's keys reached the server at all. Three smaller points are fixed with it.

- Badr now holds the throttle for 2 s, and both pages must still show the vehicle at rest. At the end Amal leaves, Badr becomes the driver and drives, which shows that Badr's keys do reach the server.
- The reload test reads the exact list of players. Its trailing newline was ignored by `toContainText`, so it could not tell one player from two.
- Every page is watched for uncaught errors, and a test fails if there is one.
- The empty-name test counts WebSockets and expects none.

Apply this change to `e2e/smoke.spec.ts`. The main session provides it as a patch file for `git apply`; it ran the result three times beforehand, 12 passed each time.

```diff
diff --git a/e2e/smoke.spec.ts b/e2e/smoke.spec.ts
index 8287486..16cec6e 100644
--- a/e2e/smoke.spec.ts
+++ b/e2e/smoke.spec.ts
@@ -8,18 +8,34 @@ async function overlayNumber(page: Page, pattern: RegExp): Promise<number> {
 }
 const tick = (page: Page) => overlayNumber(page, /tick\s+(\d+)/);
 const vehicleZ = (page: Page) => overlayNumber(page, /pos\s+\S+\s+\S+\s+(\S+)/);
+// The whole list of players as the overlay shows it, for example "Amal (drives), Badr".
+async function players(page: Page): Promise<string> {
+  const text = (await page.locator('#overlay').textContent()) ?? '';
+  return /^players\s+(.*)$/m.exec(text)?.[1] ?? '';
+}
+
+// Uncaught errors in any page of the running test. A page can look right and still have failed, for example in WebGL.
+const pageErrors: string[] = [];
+const watch = (page: Page) => page.on('pageerror', (error) => pageErrors.push(error.message));
 
 // A page in its own browser context, so it has its own session storage: a separate player.
 const contexts: BrowserContext[] = [];
 async function newPlayerPage(browser: Browser): Promise<Page> {
   const context = await browser.newContext();
   contexts.push(context);
-  return context.newPage();
+  const page = await context.newPage();
+  watch(page);
+  return page;
 }
 
+test.beforeEach(({ page }) => {
+  watch(page);
+});
+
 // Contexts made by hand are not closed by the test runner; left open, their pages keep drawing and slow later tests.
 test.afterEach(async () => {
   for (const context of contexts.splice(0)) await context.close();
+  expect(pageErrors.splice(0)).toEqual([]);
 });
 
 // Opens the home page, creates a room as `name` and returns the room's noun.
@@ -52,11 +68,12 @@ test('two players share a room and see the same vehicle, driven by the first', a
     await expect.poll(() => tick(page)).toBeGreaterThan(before);
   }
 
-  // Badr's throttle does nothing: only the first player drives.
+  // Badr's throttle does nothing: only the first player drives. Two seconds of throttle would move the vehicle several metres.
   await badr.keyboard.down('KeyW');
-  await badr.waitForTimeout(700);
-  await badr.keyboard.up('KeyW');
+  await badr.waitForTimeout(2000);
   expect(await vehicleZ(amal)).toBeGreaterThan(-0.5);
+  expect(await vehicleZ(badr)).toBeGreaterThan(-0.5);
+  await badr.keyboard.up('KeyW');
 
   // Amal drives forward, and both pages see the vehicle move.
   await amal.keyboard.down('KeyW');
@@ -70,6 +87,14 @@ test('two players share a room and see the same vehicle, driven by the first', a
     expect(size[0]).toBeGreaterThan(0);
     expect(size[1]).toBeGreaterThan(0);
   }
+
+  // When Amal leaves, Badr drives. This also shows that Badr's keys do reach the server, so the check above meant something.
+  await amal.close();
+  await expect.poll(() => players(badr)).toBe('Badr (drives)');
+  const before = await vehicleZ(badr);
+  await badr.keyboard.down('KeyW');
+  await expect.poll(() => vehicleZ(badr), { timeout: 10_000 }).toBeLessThan(before - 3);
+  await badr.keyboard.up('KeyW');
 });
 
 test('a room can be joined from the home page by typing its name', async ({ browser }) => {
@@ -119,13 +144,16 @@ test('the name is remembered, and a reload keeps the player in the room', async
   await page.locator('#home-primary').click();
   await expect(page.locator('#home')).toBeHidden();
   // The same tab took its old place: one player, not two, and no "name taken".
-  await expect(page.locator('#overlay')).toContainText('players  Amal (drives)\n');
+  await expect.poll(() => players(page)).toBe('Amal (drives)');
 });
 
 test('an empty name is refused on the page, before anything is sent', async ({ page }) => {
+  let sockets = 0;
+  page.on('websocket', () => (sockets += 1));
   await page.goto('/');
   await page.locator('#home-name').fill('   ');
   await page.locator('#home-primary').click();
   await expect(page.locator('#home-error')).toHaveText('Enter a name of 1 to 16 characters.');
   await expect(page).toHaveURL(/\/$/);
+  expect(sockets).toBe(0);
 });
```

Run: `npm run e2e`
Expected: `12 passed`, in about 25 to 45 seconds.

Run: `npm run typecheck`
Expected: exits 0.

- [x] **Step 10: Commit**

```bash
git add e2e/smoke.spec.ts
git commit -m "test(e2e): prove that only the driver's keys move the vehicle

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [x] **Step 11: Prove the hand-over by the throttle, not the distance**

The re-review found that the hand-over check added in step 9 could pass with no input from Badr: when Amal leaves, the vehicle is still rolling at about 5 m/s, and coasting alone covers the 3 m the check asked for. The overlay's `throttle` value is what the server applied to the vehicle, so it shows whose keys the server obeys whatever the speed. The test now reads it in three places: it stays 0 on both pages while Badr holds the key as a passenger, it rises above 0.9 while Amal drives, and it rises above 0.9 again when Badr drives after Amal has left.

Apply this change to `e2e/smoke.spec.ts`. The main session provides it as a patch file for `git apply`; it ran the result three times beforehand, 12 passed each time.

```diff
diff --git a/e2e/smoke.spec.ts b/e2e/smoke.spec.ts
index 16cec6e..e54a956 100644
--- a/e2e/smoke.spec.ts
+++ b/e2e/smoke.spec.ts
@@ -8,6 +8,8 @@ async function overlayNumber(page: Page, pattern: RegExp): Promise<number> {
 }
 const tick = (page: Page) => overlayNumber(page, /tick\s+(\d+)/);
 const vehicleZ = (page: Page) => overlayNumber(page, /pos\s+\S+\s+\S+\s+(\S+)/);
+// The throttle the server applied to the vehicle, from 0 to 1. It shows whose keys the server obeys without depending on speed.
+const throttle = (page: Page) => overlayNumber(page, /throttle\s+(\S+)/);
 // The whole list of players as the overlay shows it, for example "Amal (drives), Badr".
 async function players(page: Page): Promise<string> {
   const text = (await page.locator('#overlay').textContent()) ?? '';
@@ -71,15 +73,19 @@ test('two players share a room and see the same vehicle, driven by the first', a
   // Badr's throttle does nothing: only the first player drives. Two seconds of throttle would move the vehicle several metres.
   await badr.keyboard.down('KeyW');
   await badr.waitForTimeout(2000);
-  expect(await vehicleZ(amal)).toBeGreaterThan(-0.5);
-  expect(await vehicleZ(badr)).toBeGreaterThan(-0.5);
+  for (const page of [amal, badr]) {
+    expect(await throttle(page)).toBe(0);
+    expect(await vehicleZ(page)).toBeGreaterThan(-0.5);
+  }
   await badr.keyboard.up('KeyW');
 
-  // Amal drives forward, and both pages see the vehicle move.
+  // Amal drives forward, and both pages see the throttle applied and the vehicle move.
   await amal.keyboard.down('KeyW');
+  await expect.poll(() => throttle(badr)).toBeGreaterThan(0.9);
   await expect.poll(() => vehicleZ(amal), { timeout: 10_000 }).toBeLessThan(-3);
   await expect.poll(() => vehicleZ(badr), { timeout: 10_000 }).toBeLessThan(-3);
   await amal.keyboard.up('KeyW');
+  await expect.poll(() => throttle(badr)).toBe(0);
 
   // The game canvas has been given its drawing size.
   for (const page of [amal, badr]) {
@@ -89,11 +95,12 @@ test('two players share a room and see the same vehicle, driven by the first', a
   }
 
   // When Amal leaves, Badr drives. This also shows that Badr's keys do reach the server, so the check above meant something.
+  // The vehicle is still rolling, so the throttle is the proof, not the distance.
   await amal.close();
   await expect.poll(() => players(badr)).toBe('Badr (drives)');
-  const before = await vehicleZ(badr);
+  expect(await throttle(badr)).toBe(0);
   await badr.keyboard.down('KeyW');
-  await expect.poll(() => vehicleZ(badr), { timeout: 10_000 }).toBeLessThan(before - 3);
+  await expect.poll(() => throttle(badr)).toBeGreaterThan(0.9);
   await badr.keyboard.up('KeyW');
 });
 
```

Run: `npm run e2e`
Expected: `12 passed`, in about 25 to 45 seconds.

Run: `npm run typecheck`
Expected: exits 0.

- [x] **Step 12: Commit**

```bash
git add e2e/smoke.spec.ts
git commit -m "test(e2e): read the applied throttle to prove who drives

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Record the step in the roadmap and the spec

**Files:**
- Modify: `ROADMAP.md`
- Modify: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`
- Modify: `docs/superpowers/plans/step-2-server-rooms-snapshots.md` (tick the boxes)

**Interfaces:**
- Consumes: the finished work of Tasks 1 to 9.
- Produces: nothing in code.

Every text to replace below occurs exactly once. If one does not, stop and report.

- [x] **Step 1: Run every check one last time**

Run: `npm test && npm run typecheck && npm run build && npm run e2e`
Expected: 231 tests passing, typecheck exits 0, build ends with `✓ built in …`, `12 passed`.

- [x] **Step 2: Update `ROADMAP.md`**

Replace the two paragraphs of "Current state" with:

```markdown
**Current step:** step 2 is done. Next action: write the plan for step 3.

**Runnable today:** `npm run dev` starts the game server and the page. Create a room on the home page and share its address; everyone who opens it sees the same vehicle on the test ground, driven by the first player in the room. There are no characters on foot yet.
```

In the steps table, change row 2's `Status` to `done`, its `Branch` to `step-2-server-rooms-snapshots`, and its `Plan` to `[plan](docs/superpowers/plans/step-2-server-rooms-snapshots.md)`.

Replace the body of "How to run and test" with:

```markdown
Requires Node 22.12 or later. Node 23 and 25 work but print an `EBADENGINE` warning on install, because Vitest lists only the even-numbered releases.

| Command | What it does |
|---|---|
| `npm install` | Installs every package in the workspace |
| `npx playwright install chromium webkit` | Downloads the two browsers the smoke test uses; needed once |
| `npm run dev` | Starts the game server on port 3000 and the page with live reload. Open the address Vite prints, normally `http://localhost:5173/`; it also prints the address for other devices on the same Wi-Fi |
| `npm start` | Builds the page and serves everything on one port, `http://localhost:3000/`. This is the mode for play sessions and for the tunnel |
| `npm test` | Runs all unit, scenario and server integration tests once |
| `npm run test:watch` | Runs tests on every change |
| `npm run e2e` | Runs the browser smoke test; it starts its own server on port 3100 |
| `npm run typecheck` | Typechecks every package, config, experiment and the smoke test |
| `npm run build` | Builds the client into `packages/client/dist` |
| `npm run experiment:cable` | Re-runs the winch cable experiment and prints its table |

Set `PORT` to change the server's port, and `VEHICLE=rv` to run every room with the RV: `VEHICLE=rv npm run dev`.

In the page: WASD to drive, Space to brake. Only the first player in the room drives until seats exist (step 3).
```

In "Known issues", replace the bullet that starts `- The production bundle is about 4.9 MB` with these three bullets:

```markdown
- The production bundle is about 0.5 MB. It returns to about 5 MB at step 4, when client prediction brings Rapier back into the page.
- A vehicle that has rolled over or is stuck cannot be recovered yet: create a new room. Pushing arrives at step 5, the winch at step 6 and checkpoint restart at step 8.
- Reloading the page, or losing the connection, returns the player to the name form, and joining again makes a new player. Held slots arrive at step 11 and automatic reconnection at step 19.
```

In the "Carried into later steps" table, delete the nine rows whose first column is `2`, and add these rows, keeping the table sorted by step:

```markdown
| 3 | When the server consumes two queued inputs in one tick, only the second reaches the world, so a button pressed only in the first would be missed. Merge presses when seats and jumping arrive |
| 3 | The snapshot gains `players`; the client's snapshot buffer interpolates the vehicle only, and `parseServerMessage` must check the new fields |
| 4 | The page no longer bundles Rapier; prediction brings it back, and the bundle size with it |
| 11 | `lobby` gains `timeOfDay` and `weather`; held slots replace the immediate removal of a disconnected player; the admin's choice replaces `VEHICLE` |
| 19 | The page does not reconnect by itself after the socket closes; it returns to the name form |
| 19 | The server caps rooms (50) but not connections: add a cap on connections in total and per address when the server is exposed through the tunnel (behind it, the address is in the `CF-Connecting-IP` header), and stop sending to a socket whose send buffer keeps growing |
```

Append these rows to the decisions log:

```markdown
| 2026-11-12 | The server runs from its TypeScript source with `tsx`; there is no server build step | `shared` exports its source, which Node cannot load by itself; a bundle step waits for the hosting decision at step 19 |
| 2026-11-12 | Liveness uses `ping` and `pong` messages, not WebSocket ping frames | Keeps the room layer independent of the transport; a frozen page stops answering, which is the case to detect |
| 2026-11-12 | The WebSocket endpoint is `/ws`; input `seq` starts at 1, so an `ackSeq` of 0 means none | Left open by the spec; both sides need the same answer |
| 2026-11-12 | Shared course, vehicle and constant objects are frozen at run time | One server process runs many rooms from the same objects |
| 2026-11-12 | A room with nobody connected is paused | Saves the cost of simulating an empty room and avoids a burst of catch-up ticks on return |
| 2026-11-12 | `VEHICLE=rv` selects the RV for every room until the lobby exists | Keeps the RV drivable for handling work before step 11 |
| 2026-11-13 | The smoke test's phone project runs in WebKit, the engine of Safari, with an iPhone 14 viewport and touch | Asked for by the owner during step 2. It is not Safari on a real iPhone, which stays the owner's check at step 14 |
| 2026-11-12 | The server holds at most 50 rooms and refuses `create` beyond that with `server_full` | Found in review: each room is a physics world, and nothing bounded how many one visitor could create |
| 2026-11-12 | A connection that throws is dropped and a room whose simulation throws is closed; both are reported and the other rooms carry on | Found in review: one error inside the tick stopped every room |
| 2026-11-12 | The Node adapter contains every failure it can: file read errors, server errors, and exceptions in socket and timer callbacks are reported and the process carries on | Found in review: any one of them ended the process, and every room with it |
| 2026-11-12 | The page checks every server message with `parseServerMessage` and drops what fails; unknown fields are kept | Found in review: the page may be older than the server, and one snapshot without finite numbers spoiled the interpolation until a reload |
| 2026-11-12 | A test checks the room layer's imports | Found in review: the room tsconfig cannot stop an import of `ws`, which brings Node's types in with it |
```

- [x] **Step 3: Update the spec**

In `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`, make these replacements.

Replace

```
- **Liveness.** The server pings each connection every 2 s and treats 6 s of silence as a disconnect.
```

with

```
- **Liveness.** The server sends each connection a `ping` message every 2 s, which the client answers with `pong`, and treats 6 s without any message from a connection as a disconnect.
```

Replace

```
The loop runs at most 3 catch-up steps per iteration and discards the remaining backlog.
```

with

```
The loop runs at most 3 catch-up steps per iteration and discards the remaining backlog. A room with nobody connected is paused: its world keeps its state, and no ticks are owed when someone returns.
```

Replace

```
Any path that is not a static file serves the client, which reads the noun from the URL.
```

with

```
Any path that is not a static file serves the client, which reads the noun from the URL. The WebSocket endpoint is `/ws`.
```

Replace

```
| `input { … }` | `playing` | Ignored in other phases |
```

with

```
| `input { … }` | `playing` | Ignored in other phases |
| `pong {}` | Any time, in answer to `ping` | Never refused |
```

Replace

```
The client sends one per simulation tick, with `seq` increasing by 1.
```

with

```
The client sends one per simulation tick, with `seq` starting at 1 and increasing by 1.
```

Replace

```
- `error { reason }` with reasons
```

with

```
- `ping {}` — to every connection, every 2 s
- `error { reason }` with reasons
```

Replace

```
- `ackSeq` is the last input sequence number the server consumed for the receiving client.
```

with

```
- `ackSeq` is the last input sequence number the server consumed for the receiving client, or 0 before any.
```

Replace

```
Until the lobby exists (step 11), creating a room starts a run on the test ground at once, with the Lodgy, and anyone opening the link joins it.
```

with

```
Until the lobby exists (step 11), creating a room starts a run on the test ground at once, with the Lodgy, and anyone opening the link joins it. Starting the server with `VEHICLE=rv` uses the RV instead. Until then the `lobby` message has no `timeOfDay` or `weather`, a disconnected player's slot is freed at once, and a reload joins as a new player.
```

Replace

```
The client derives the WebSocket URL from the page origin (`ws` for `http`, `wss` for `https`).
```

with

```
The client derives the WebSocket URL from the page origin (`ws` for `http`, `wss` for `https`). The server runs from its TypeScript source with `tsx`; there is no server build step.
```

Replace

```
- A room is deleted when it has had no connected players for 60 s.
```

with

```
- A room is deleted when it has had no connected players for 60 s.
- **Room limit.** The server holds at most 50 rooms. A `create` beyond that is refused with `server_full`.
- **Failures.** A connection whose socket throws is dropped. A room whose simulation throws is closed and its players are disconnected. Both are logged, and the other rooms carry on.
```

Replace

```
| `create { name, token }` | Not yet in a room | `bad_message` |
```

with

```
| `create { name, token }` | Not yet in a room | `bad_message`, `server_full` |
```

Replace

```
`bad_phase`, `bad_message`, `cannot_buy`
```

with

```
`bad_phase`, `bad_message`, `server_full`, `cannot_buy`
```

- [x] **Step 4: Tick this plan's checkboxes**

In `docs/superpowers/plans/step-2-server-rooms-snapshots.md`, change `- [ ]` to `- [x]` for every step that was completed, including this task's. Change nothing else in the plan.

- [x] **Step 5: Commit**

```bash
git add ROADMAP.md docs/superpowers
git commit -m "docs(roadmap): record step 2 as built

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Do not merge the branch. The main session reviews it and merges.
