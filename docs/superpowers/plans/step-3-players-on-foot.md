# Step 3: Players on Foot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every player is a character on the server: they walk, jump, stand on the moving vehicle, are shoved out of its way, board and leave seats, and respawn from the kill plane; the page shows the characters with a shoulder camera and a crosshair.

**Architecture:** `shared` gains a kinematic character (`player`), placement beside the vehicle (`placement`), seats and interact resolution (`seats`, `interact`), and press detection (`input`). `createWorld` gains `addPlayer` and `removePlayer`, steps players in join order, and puts them in the snapshot. The server's room adds and removes world players and passes each tick's input with its presses. The page interpolates players as it does the vehicle, reads the mouse for aim, and replaces the follow camera with a shoulder camera on foot and an orbit camera when seated. Nothing is predicted on the page yet (step 4).

**Tech Stack:** TypeScript 7.0.2 (strict, ES modules), npm workspaces, `@dimforge/rapier3d-compat` 0.21.0, Three.js, Vite, Vitest 5.1.0, `@playwright/test` 1.65.0, `ws` 8.22.2, `tsx` 4.23.15. No dependency is added in this step.

**How this plan differs from the plans of steps 1 and 2.** Those plans contained finished code to copy. This plan does not. It fixes the file paths, the exported names and signatures, the constants, the behaviour rules and the test cases. The implementer writes the tests and the code, tests first.

- **Fixed (do not change):** every file path, exported name, signature, constant value, behaviour rule (numbered `B…`) and test case (numbered `T…`) in this plan, and every existing test that this plan does not tell you to change.
- **Free:** everything inside a function body, private helpers, and which Rapier calls to use. The "Rapier notes" in a task are hints that were checked against the installed type definitions, not requirements.
- **Stop and report** (status `BLOCKED` or `NEEDS_CONTEXT`) if: two rules contradict each other; a test case cannot pass although the rules are implemented as written; a rule cannot be implemented without changing a fixed item; or an existing test fails for a reason this plan does not name. Do not loosen a tolerance, delete a test case or change a constant to get a pass.

## Global Constraints

- Use npm only. No dependency may be added, removed or upgraded. Do not run `npm install`.
- TypeScript strict mode, ES modules. Imports between files in a package have no file extension.
- Units are metres, seconds, kilograms, radians. Axes are right-handed with +Y up. Forward is −Z and right is +X in a vehicle's or player's local frame. Yaw is rotation about +Y; yaw 0 faces −Z; positive yaw turns left (toward −X). Pitch: positive looks up.
- A player's position (`pos`) is the point on the ground between their feet. The capsule's centre is `PLAYER_HEIGHT / 2` above it and the eye is `PLAYER_EYE_HEIGHT` above it.
- The simulation tick is fixed at 1/60 s (`TICK_DT`). The simulation uses no randomness and no wall clock.
- `shared` never loads WebAssembly; the caller runs `await RAPIER.init()` and passes the module in.
- `packages/server/src/room` imports nothing from Node, `ws` or the DOM (`packages/server/src/node/roomImports.test.ts` checks this).
- Every tuning number lives in `packages/shared/src/constants.ts` or `packages/shared/src/vehicles.ts`. Use the values this plan gives; do not retune.
- Player-supplied text is put on the page with `textContent` or drawn on a canvas with `fillText`, never as HTML.
- Comments explain only a non-obvious why, in one line. No docblocks.
- Each test is written before the code it covers and watched to fail first. A test file has one `beforeAll(async () => { await RAPIER.init(); })` when it needs Rapier.
- Every task ends with `npm test` and `npm run typecheck` passing, one commit with the message the task gives, and a clean `git status --short`. The commit message ends with exactly this trailer line and no other: `Co-Authored-By: Claude <noreply@anthropic.com>`
- Work on the branch `step-3-players-on-foot`, which exists. Do not push, merge or switch branches.
- Never commit `.env*`, keys, tokens or cookies files, `node_modules`, `dist`, `test-results`, `playwright-report`, `.superpowers/` or `.playwright-mcp/`.
- Ports: the owner may have servers on 5173 and 3000. Do not stop a process you did not start; never use `pkill` or `killall`. `npm run e2e` uses port 3100.
- Expected noise: Vitest may print a tip about `isolate: false`; the client build warns about a chunk larger than 500 kB. Anything else unexpected goes in the report.
- `npm run e2e` is expected to fail from the end of Task 7 until Task 11, because the smoke test still assumes that the first player drives. Do not run it or fix it before Task 11.

## Deliberate limits of this step (not defects)

- Nothing is predicted on the page: the local player is drawn from interpolated snapshots, so their own movement lags by the interpolation delay and the network. Prediction is step 4.
- There are no touch controls (step 14). On an iPhone the page loads, renders and shows snapshots, and that is all this step asks of it.
- Players have no health, hands or inventory. The snapshot's player entries hold `playerId`, `pos`, `yaw`, `seat` and `ground` only.
- The only carrier body is the vehicle. Props arrive at step 5.
- Checkpoints are not recorded yet (step 8), so "the last checkpoint" is always the course's first checkpoint.
- The world returns a `respawn` event from the kill plane, and the server does not send it to anyone yet. The respawn is immediate: the spec's 3 s delay and 50 health arrive with health at step 9.
- A seated player is not drawn; their name is shown above the vehicle. Real meshes arrive at step 17.
- Interact has two outcomes, leave a seat and board the vehicle, so aim plays no part in choosing a target yet.

## File map

| File | Task | Responsibility |
|---|---|---|
| `packages/shared/src/constants.ts` | 1 | Player, interact, placement and camera constants |
| `packages/shared/src/math.ts` | 1 | `wrapAngle` (moved here), `normalize`, `yawRotation`, `aimRotation`, `inverseRotate`, `lerpAngle` |
| `packages/shared/src/geometry.ts` | 1 | Distance from a point and along a ray to an oriented box; the vehicle's box |
| `packages/shared/src/vehicles.ts` | 1 | Seats and spawn slots of each vehicle |
| `packages/shared/src/input.ts` | 2 | Presses, the per-tick input, press detection |
| `packages/server/src/room/inputQueue.ts` | 2 | Returns the tick's input with its presses; copies what it stores |
| `packages/shared/src/groups.ts` | 3 | Collision groups |
| `packages/shared/src/player.ts` | 3, 4 | The character: movement, carrying, shove-out |
| `packages/shared/src/testRig.ts` | 3 | `run` gains a per-tick callback |
| `packages/shared/src/vehicle.ts` | 3 | Wheel rays ignore players; `VEHICLE_BODY_ID` |
| `packages/shared/src/placement.ts` | 5 | A valid spot beside the vehicle; spawn slots; checkpoint fallback |
| `packages/shared/src/seats.ts` | 6 | Who sits where; which seat interact gives; where an exit lands |
| `packages/shared/src/interact.ts` | 6 | What interact does for a player this tick |
| `packages/shared/src/world.ts` | 7 | Players in the world: tick order, driver, kill plane, snapshot |
| `packages/server/src/room/room.ts` | 7 | Adds and removes world players; passes tick inputs |
| `packages/shared/src/protocol.ts` | 8 | Validation of the snapshot's players and of colours |
| `packages/client/src/net/snapshotBuffer.ts` | 9 | Interpolates players |
| `packages/client/src/input/keyboard.ts`, `mouseLook.ts` | 9 | Game keys do not scroll the page; mouse aim |
| `packages/client/src/render/camera.ts`, `playerMesh.ts` | 10 | Shoulder and orbit cameras; the character mesh |
| `packages/client/src/ui/overlay.ts`, `game.ts`, `main.ts`, `index.html` | 10 | Overlay text, wiring, crosshair |
| `e2e/smoke.spec.ts`, `playwright.config.ts` | 11 | The smoke test with boarding; trace on failure |
| `ROADMAP.md`, the spec | 11 | The step's record |

---

### Task 1: Shared data and geometry

**Files:**
- Modify: `packages/shared/src/constants.ts`, `packages/shared/src/math.ts`, `packages/shared/src/protocol.ts` (import `wrapAngle` instead of defining it), `packages/shared/src/vehicles.ts`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/geometry.ts`
- Test: `packages/shared/src/math.test.ts` (add), `packages/shared/src/geometry.test.ts` (new), `packages/shared/src/vehicles.test.ts` (new)

**Interfaces:**
- Consumes: `Vec3`, `Quat`, `Pose`, `rotate`, `quatMul`, `quatFromAxisAngle`, `AXIS_X`, `AXIS_Y`, `clamp`, `deepFreeze` from `math.ts`; `Box` from `course.ts`; `VehicleConfig` from `vehicles.ts`.
- Produces:

Constants, appended to `constants.ts` (each with a one-line comment saying what it is):

```ts
export const PLAYER_RADIUS = 0.3;
export const PLAYER_HEIGHT = 1.7;
export const PLAYER_EYE_HEIGHT = 1.55;
export const PLAYER_WALK_SPEED = 4.5;
// Gives a jump of about 1.7 m, enough to reach the Lodgy's roof (1.5 m).
export const PLAYER_JUMP_SPEED = 5.8;
export const PLAYER_MAX_FALL_SPEED = 30;
export const PLAYER_MAX_SLOPE_DEG = 45;
export const PLAYER_STEP_HEIGHT = 0.3;
// A ledge is stepped onto only if it is at least this deep.
export const PLAYER_STEP_MIN_WIDTH = 0.2;
// The gap the character controller keeps between the capsule and what it touches.
export const PLAYER_SKIN = 0.02;
export const PLAYER_SNAP_DISTANCE = 0.2;
// How far below the capsule a carrier is looked for when the player is grounded.
export const PLAYER_GROUND_PROBE = 0.1;
// A shoved player is moved outward in steps of this size, up to this distance.
export const PLAYER_SHOVE_STEP = 0.1;
export const PLAYER_SHOVE_MAX = 4;
// A spot beside the vehicle is probed from this far above the vehicle's centre to this far below it.
export const PLACEMENT_PROBE_UP = 2;
export const PLACEMENT_PROBE_DOWN = 6;
// Interact reaches this far, measured from the middle of the player to the nearest point of the target.
export const INTERACT_RANGE = 2;
// Within this horizontal distance of the driver's door, interact gives the driver seat.
export const DRIVER_DOOR_RANGE = 1.5;

// The page's cameras. Offsets are in the aim's frame: right, up, back.
export const CAMERA_FOV = 60;
export const CAMERA_SHOULDER_OFFSET = deepFreeze({ x: 0.5, y: 0.25, z: 2.6 });
export const CAMERA_WALL_MARGIN = 0.2;
export const CAMERA_MIN_DISTANCE = 0.4;
// The orbit camera sits this many vehicle half-lengths from a point this high above the vehicle's centre.
export const CAMERA_ORBIT_HALF_LENGTHS = 4;
export const CAMERA_ORBIT_HEIGHT = 1.2;
// The orbit camera never looks up at the vehicle from below: its pitch is at most this.
export const CAMERA_ORBIT_MAX_PITCH = -0.15;
// Radians of aim per pixel of mouse movement, and the limit of pitch either way.
export const MOUSE_SENSITIVITY = 0.0025;
export const AIM_PITCH_LIMIT = 1.5;
```

`math.ts`:

```ts
// Brings an angle into (-PI, PI]. Moved from protocol.ts unchanged.
export function wrapAngle(angle: number): number;
// The unit vector along v, or the zero vector if v has no length.
export function normalize(v: Vec3): Vec3;
export function yawRotation(yaw: number): Quat;                 // rotation about +Y
export function aimRotation(yaw: number, pitch: number): Quat;  // yaw about +Y, then pitch about the local +X
// v expressed in the frame of q: the inverse of rotate(q, v).
export function inverseRotate(q: Quat, v: Vec3): Vec3;
// The angle a fraction t of the way from a to b, by the shorter way round, wrapped into (-PI, PI].
export function lerpAngle(a: number, b: number, t: number): number;
```

`geometry.ts`:

```ts
// Distance from a point to the nearest point of an oriented box; 0 inside it.
export function pointBoxDistance(point: Vec3, box: Box): number;
// Distance along a ray (dir is a unit vector) to where it first meets the box; 0 if it starts inside; null if it misses.
export function rayBoxDistance(origin: Vec3, dir: Vec3, box: Box): number | null;
// The vehicle's chassis as a box.
export function vehicleBox(config: VehicleConfig, pose: { pos: Vec3; rot: Quat }): Box;
```

`vehicles.ts`:

```ts
export interface Seat {
  id: string;
  // Where a seated player is, relative to the chassis centre.
  pos: Vec3;
  // The spot beside the vehicle where this seat's door is, relative to the chassis centre. Its y is not used.
  door: Vec3;
}
// VehicleConfig gains:
//   seats: Seat[];        six; seats[0] is the driver's and has id 'driver'
//   spawnSlots: Vec3[];   six spots beside the vehicle, relative to the chassis centre; y is not used
```

Seat and slot values:

| | Lodgy | RV |
|---|---|---|
| Seat `pos.x` (left, right) | −0.45, 0.45 | −0.6, 0.6 |
| Seat `pos.y` | −0.45 | −1.1 |
| Seat rows `pos.z` (front, middle, rear) | −0.6, 0.4, 1.4 | −2.4, −0.8, 0.8 |
| Door `x` (left, right); door `z` is the seat's `z`; door `y` is 0 | −1.48, 1.48 | −1.75, 1.75 |
| Spawn slot `x` (left, right); `y` is 0 | −1.6, 1.6 | −1.9, 1.9 |
| Spawn slot rows `z` | −0.6, 0.4, 1.4 | −2.4, −0.8, 0.8 |

Seat order and ids: `driver` (front left), `seat-1` (front right), `seat-2` (middle left), `seat-3` (middle right), `seat-4` (rear left), `seat-5` (rear right). Spawn slot order: front left, front right, middle left, middle right, rear left, rear right.

**Behaviour rules:**
- **B1.1** `aimRotation(yaw, pitch)` equals `quatMul(quatFromAxisAngle(AXIS_Y, yaw), quatFromAxisAngle(AXIS_X, pitch))`.
- **B1.2** `vehicleBox` returns `{ center: pose.pos, halfExtents: config.halfExtents, rot: pose.rot }`.
- **B1.3** `index.ts` exports `geometry.ts`. `VEHICLES` stays deep-frozen with the new fields.

**Test cases:**
- **T1.1** (`math.test.ts`) `wrapAngle`: `0 → 0`; `Math.PI → Math.PI`; `-Math.PI → Math.PI`; `3 * Math.PI + 0.5 → -Math.PI + 0.5`; `-3 * Math.PI - 0.5 → Math.PI - 0.5` (each to 9 decimal places).
- **T1.2** `normalize(vec3(3, 0, 4))` is `(0.6, 0, 0.8)`; `normalize(vec3(0, 0, 0))` is `(0, 0, 0)`.
- **T1.3** `rotate(aimRotation(0, 0), vec3(0, 0, -1))` is `(0, 0, -1)`. With yaw `Math.PI / 2` it is `(-1, 0, 0)`. With pitch `Math.PI / 2` and yaw 0 it is `(0, 1, 0)`. With yaw `Math.PI / 2` and pitch `Math.PI / 4` its y is `Math.SQRT1_2` and its x is `-Math.SQRT1_2` (each to 6 decimal places).
- **T1.4** `inverseRotate(q, rotate(q, v))` returns `v` for `q = aimRotation(0.7, -0.3)` and `v = vec3(1, 2, 3)` (6 decimal places).
- **T1.5** `lerpAngle(0, 1, 0.5)` is `0.5`. `lerpAngle(3, -3, 0.5)` is π by the short way, which crosses ±π: assert `Math.abs(wrapAngle(result - Math.PI)) < 1e-6`, so that −π is accepted too. `lerpAngle(-3, 3, 0)` is `-3`.
- **T1.6** (`geometry.test.ts`) With `box = { center: (0,0,0), halfExtents: (1,2,3), rot: IDENTITY }`: `pointBoxDistance` of `(4,0,0)` is 3; of `(0.5,1,-2)` is 0; of `(4,6,0)` is 5. With the same box rotated by `quatFromAxisAngle(AXIS_Y, Math.PI / 2)`: of `(4,0,0)` is 1; of `(0,0,4)` is 3.
- **T1.7** With the unrotated box: `rayBoxDistance((-5,0,0), (1,0,0))` is 4; from `(0,0,0)` it is 0; `((-5,0,0), (-1,0,0))` is null; `((-5,3,0), (1,0,0))` is null. With the rotated box: `((-5,0,0), (1,0,0))` is 2.
- **T1.8** `vehicleBox(VEHICLES.lodgy, { pos: vec3(1,2,3), rot: IDENTITY })` has that centre, the Lodgy's half extents and the identity rotation.
- **T1.9** (`vehicles.test.ts`, for both vehicles) There are six seats with six different ids and `seats[0].id === 'driver'`. The driver sits on the left (`pos.x < 0`, `door.x < -halfExtents.x`). Every seat `pos` is inside the chassis box. Every door and every spawn slot is outside the chassis in x by at least `PLAYER_RADIUS + 0.1`. Spawn slot 0 is within `DRIVER_DOOR_RANGE` of the driver's door (horizontal distance). No two spawn slots are closer than `2 * PLAYER_RADIUS`.

- [ ] **Step 1: Write the tests T1.1 to T1.9**
- [ ] **Step 2: Run them and see them fail** — `npx vitest run packages/shared/src/math.test.ts packages/shared/src/geometry.test.ts packages/shared/src/vehicles.test.ts`. Expected: the new cases fail because the exports do not exist.
- [ ] **Step 3: Implement** the constants, the maths, `geometry.ts` and the seat and slot data. Move `wrapAngle` out of `protocol.ts`.
- [ ] **Step 4: Run every check** — `npm test` and `npm run typecheck`. Expected: both pass.
- [ ] **Step 5: Commit** — `git add packages/shared` then commit as `feat(shared): add player constants, box geometry and seat data`.

---

### Task 2: Press detection

**Files:**
- Create: `packages/shared/src/input.ts`
- Modify: `packages/shared/src/index.ts`, `packages/server/src/room/inputQueue.ts`, `packages/server/src/room/room.ts` (only if the type change requires it)
- Test: `packages/shared/src/input.test.ts` (new), `packages/server/src/room/inputQueue.test.ts` (change)

**Interfaces:**
- Consumes: `InputFields`, `PlayerInput`, `NEUTRAL_INPUT`, `neutralInput` from `protocol.ts`.
- Produces, in `input.ts`:

```ts
// Buttons that act once when they go down.
export interface Presses {
  jump: boolean;
  interact: boolean;
  drop: boolean;
}
export const NO_PRESSES: Presses;   // all false, frozen
// What the simulation is given for one player on one tick.
export interface TickInput {
  input: InputFields;
  pressed: Presses;
}
// previous: the input simulated on the tick before. consumed: the new inputs taken this tick, oldest first; empty when none arrived.
export function pressesOf(previous: InputFields, consumed: readonly InputFields[]): Presses;
```

- Produces, in `inputQueue.ts`: `InputQueue.next(): TickInput` (the shared type). The server's own `TickInput` interface and its `fresh` field are removed.

**Behaviour rules:**
- **B2.1** A button is pressed on a tick if it is true in one of the consumed inputs and false in the input just before that one (`previous` for the first). With nothing consumed, nothing is pressed.
- **B2.2** The queue's `next()` returns `{ input, pressed }`. `input` is the last consumed input's fields, or the repeated last input, or the neutral substitute, exactly as today. `pressed` is `pressesOf(the input returned by the previous call, the inputs consumed by this call)`.
- **B2.3** When the neutral substitute replaces a held button, a later input that still holds it counts as a new press.
- **B2.4** `push` stores a copy of the input, and `next` returns an `input` object that is not the queue's internal one: changing either from outside changes nothing inside the queue.

**Test cases:**
- **T2.1** (`input.test.ts`) Nothing consumed: `NO_PRESSES` values.
- **T2.2** `previous.jump` false, one consumed input with `jump` true: `jump` pressed, the others not.
- **T2.3** `previous.jump` true, one consumed input with `jump` true: not pressed (a held button).
- **T2.4** Two consumed inputs, `interact` true then false, `previous.interact` false: `interact` pressed (a tap between two ticks is not lost).
- **T2.5** Two consumed inputs, `jump` false then true, `previous.jump` true: `jump` pressed (released and pressed again).
- **T2.6** `NO_PRESSES` cannot be modified (a write throws `TypeError`).
- **T2.7** (`inputQueue.test.ts`) A pushed input with `interact` true gives `pressed.interact` true on the tick it is consumed and false on the following ticks while the queue is empty.
- **T2.8** Four inputs queued (so two are consumed in one tick), the first with `jump` true and the second with `jump` false: that tick's `pressed.jump` is true and its `input.jump` is false.
- **T2.9** A button held through `NEUTRAL_AFTER_TICKS` silent ticks and then sent again as held gives `pressed` true on the tick the new input is consumed.
- **T2.10** Mutating an input after pushing it, and mutating the `input` returned by `next()`, changes nothing that later calls return.
- **T2.11** The existing queue tests keep passing, with their `fresh` assertions replaced: a tick that consumed an input used to have `fresh: true`; assert instead that `ackSeq()` advanced. A repeat or a neutral substitute used to have `fresh: false`; assert that `ackSeq()` did not advance and that every field of `pressed` is false.

- [ ] **Step 1: Write the tests T2.1 to T2.11**
- [ ] **Step 2: Run them and see them fail** — `npx vitest run packages/shared/src/input.test.ts packages/server/src/room/inputQueue.test.ts`.
- [ ] **Step 3: Implement** `input.ts` and the queue changes.
- [ ] **Step 4: Run every check** — `npm test` and `npm run typecheck`.
- [ ] **Step 5: Commit** — `git add packages/shared packages/server` then commit as `feat(shared): detect button presses, merging inputs consumed in one tick`.

---

### Task 3: The character on static ground

**Files:**
- Create: `packages/shared/src/groups.ts`, `packages/shared/src/player.ts`
- Modify: `packages/shared/src/vehicle.ts`, `packages/shared/src/testRig.ts`, `packages/shared/src/rapier.ts` (add a `Collider` type alias), `packages/shared/src/index.ts`
- Test: `packages/shared/src/player.test.ts` (new)

**Interfaces:**
- Consumes: Task 1's constants and maths; `InputFields`; `createRig` from `testRig.ts`; `slopePose` from `courses/testGround.ts`.
- Produces:

`groups.ts`:

```ts
// A player's collider: member of group 0, and it interacts with nothing, so the solver skips it, and so does any query that passes QUERY_GROUPS.
export const PLAYER_GROUPS = 0x0001_0000;
// What every query in the simulation passes as its filter groups: everything except players. A query given no groups would see players.
export const QUERY_GROUPS = 0xffff_ffff;
```

`vehicle.ts`:

```ts
// The id a player's `ground` carries when they stand on the vehicle.
export const VEHICLE_BODY_ID = 'vehicle';
```

`testRig.ts`: `run(seconds: number, controls?: Partial<VehicleControls>, each?: () => void): void` — `each` is called after every physics step.

`player.ts`:

```ts
export interface PlayerGround {
  bodyId: string;
  // The player's position in that body's frame.
  localPos: Vec3;
}
export interface PlayerState {
  pos: Vec3;
  yaw: number;
  pitch: number;
  // True when the character rests on something.
  grounded: boolean;
  // Set while standing on a carrier; null on static ground and in the air.
  ground: PlayerGround | null;
}
// A dynamic body players can stand on and are shoved by.
export interface Carrier {
  id: string;
  body: RigidBody;
}
export interface Player {
  readonly id: string;
  state(): PlayerState;
  // One tick of movement on foot. Call once per tick, after the physics step.
  // Returns 'stuck' when the player overlaps a carrier and no free position was found (Task 4); otherwise 'ok'.
  step(input: InputFields, jumpPressed: boolean, carriers: readonly Carrier[]): 'ok' | 'stuck';
  // Puts the feet at `pos`, on no carrier, with no vertical speed and no carried velocity.
  teleport(pos: Vec3): void;
  // A disabled player (seated) has no collider in the world, and step only records yaw and pitch.
  setEnabled(enabled: boolean): void;
  // Sets where a disabled player is reported to be (their seat).
  setPosition(pos: Vec3): void;
  dispose(): void;
}
export function createPlayer(rapier: Rapier, physics: RapierWorld, id: string, feet: Vec3): Player;
```

**Behaviour rules:**
- **B3.1** The character is a capsule of radius `PLAYER_RADIUS` and total height `PLAYER_HEIGHT`, upright, with collision groups `PLAYER_GROUPS`. It is kinematic: only `step`, `teleport` and `setPosition` move it.
- **B3.2** Each `step` records `yaw = wrapAngle(input.yaw)` and `pitch = clamp(input.pitch, -Math.PI / 2, Math.PI / 2)`.
- **B3.3** The wanted horizontal velocity is `(right × moveX + forward × moveY) × PLAYER_WALK_SPEED`, where forward is `rotate(yawRotation(yaw), (0, 0, -1))` and right is `rotate(yawRotation(yaw), (1, 0, 0))`. If `moveX` and `moveY` together are longer than 1 they are scaled to length 1 first. The same control applies in the air.
- **B3.4** Vertical speed `vy`, each tick, in this order: `vy = max(vy - GRAVITY × TICK_DT, -PLAYER_MAX_FALL_SPEED)`; then a jump (B3.5) sets `vy = PLAYER_JUMP_SPEED`; the wanted vertical movement is `vy × TICK_DT`; after the move, if the controller reports grounded and `vy < 0`, `vy = 0`.
- **B3.5** `jumpPressed` on a tick that began with the player grounded makes that tick a jump. In the air it does nothing.
- **B3.6** The character collides with everything except other players: static course geometry and the colliders of dynamic bodies are obstacles it slides along. It never moves or applies force to anything.
- **B3.7** It walks up slopes of at most `PLAYER_MAX_SLOPE_DEG`, cannot climb steeper ones, and slides down them: the same angle is the most it climbs and the least it slides on.
- **B3.8** It steps up ledges of at most `PLAYER_STEP_HEIGHT` that are at least `PLAYER_STEP_MIN_WIDTH` deep, and stays on the ground when walking down a slope or off a low ledge (`PLAYER_SNAP_DISTANCE`).
- **B3.9** Dynamic bodies and the vehicle's wheel rays ignore players: a player in the way changes nothing about how a body moves. `vehicle.ts` passes `QUERY_GROUPS` to its wheel-ray update.
- **B3.10** `state()` returns new objects each call. In this task `ground` is always null and `step` always returns `'ok'`; the `carriers` argument is used from Task 4.
- **B3.11** `setEnabled(false)` takes the collider out of the world's queries; `setEnabled(true)` puts it back. While disabled, `step` does only B3.2, and `state().grounded` is false.
- **B3.12** `index.ts` exports `groups.ts` and `player.ts`.

**Rapier notes (hints):** `physics.createCharacterController(PLAYER_SKIN)` with `setUp`, `setMaxSlopeClimbAngle`, `setMinSlopeSlideAngle`, `enableAutostep(PLAYER_STEP_HEIGHT, PLAYER_STEP_MIN_WIDTH, false)`, `enableSnapToGround(PLAYER_SNAP_DISTANCE)` and `setApplyImpulsesToDynamicBodies(false)`; `controller.computeColliderMovement(collider, delta, undefined, QUERY_GROUPS)`, then `computedMovement()` and `computedGrounded()`. A collider made with `physics.createCollider(desc)` and no parent body can be moved with `collider.setTranslation`. `ColliderDesc.capsule(halfHeight, radius)` takes the half-height of the cylinder part, here `PLAYER_HEIGHT / 2 - PLAYER_RADIUS`. `collider.setCollisionGroups(PLAYER_GROUPS)`, `collider.setEnabled(false)`. The vehicle controller's `updateVehicle(dt, filterFlags, filterGroups)` takes the groups as its third argument. The controller and the collider must be freed in `dispose` (`physics.removeCharacterController`, `physics.removeCollider`).

**Test cases** (`player.test.ts`; each builds `createRig(RAPIER, 'lodgy', spawn)` with the vehicle spawned out of the way at `{ pos: vec3(60, 0, 0), rot: IDENTITY }` unless it says otherwise, makes players with `createPlayer(RAPIER, rig.world, id, feet)`, and steps them inside `rig.run(seconds, {}, each)` with an empty `carriers` list. A player "made at `(x, 0, z)`" is made with feet at `(x, PLAYER_SKIN, z)`: the controller keeps that gap, and a capsule made touching the ground sinks into it. "Input" means `NEUTRAL_INPUT` with the named fields changed. W is `PLAYER_WALK_SPEED`.)
- **T3.1** A player made at `(0, 0, 0)` and stepped with no input for 5 s: `pos` stays within 0.01 of the start on x and z, `pos.y` is within 0.05 of 0, and `grounded` is true.
- **T3.2** `moveY: 1` for 2 s: `pos.z` is between `-2 × W × 1.02` and `-2 × W × 0.9`, `|pos.x| < 0.05`, `|pos.y| < 0.05`.
- **T3.3** `moveX: 1` for 2 s: `pos.x` is between `2 × W × 0.9` and `2 × W × 1.02`, `|pos.z| < 0.05`.
- **T3.4** `yaw: Math.PI / 2, moveY: 1` for 2 s: `pos.x` is below `-2 × W × 0.9` and `|pos.z| < 0.05`. `state().yaw` is `Math.PI / 2`.
- **T3.5** `moveX: 1, moveY: 1` for 2 s: the horizontal distance from the start is at most `2 × W × 1.02` and at least `2 × W × 0.9`.
- **T3.6** `pitch: 5` gives `state().pitch === Math.PI / 2`; `yaw: 3 * Math.PI` gives `state().yaw` equal to `Math.PI` to 9 decimal places.
- **T3.7** A player made at `(0, 3, 0)` is not grounded on the first tick, and after 2 s is grounded with `|pos.y| < 0.05`.
- **T3.8** From rest on the ground, one step with `jumpPressed` true and then 1.5 s with it false: the highest `pos.y` seen is between `0.9 × h` and `1.05 × h`, where `h = PLAYER_JUMP_SPEED² / (2 × GRAVITY)`, and the player ends grounded with `|pos.y| < 0.05`.
- **T3.9** `jumpPressed` true on a tick when the player is in the air (0.2 s after a jump) does not raise the highest `pos.y` above `1.05 × h`.
- **T3.10** On the steep reference slope (start at `slopePose('steep', 1).pos`, facing uphill with yaw 0), `moveY: 1` for 3 s raises `pos.y` by more than 2.
- **T3.11** A static cuboid added to `rig.world` as a 60° ramp, built like the test ground's ramps: half extents `(2, 0.25, 4)`, rotation `q = quatFromAxisAngle(AXIS_X, degToRad(60))`, centre `vec3(0, 0, -3) + rotate(q, vec3(0, -0.25, -4))`, so that its lower edge lies on the ground at `z = -3` and it rises toward −Z. `moveY: 1` for 3 s from `(0, 0, 0)` leaves `pos.y` below 0.5.
- **T3.12** A static box of half extents `(2, 0.125, 6)` centred at `(0, 0.125, -8)` (a 0.25 m ledge whose near face is at `z = -2`): `moveY: 1` for 2 s from `(0, 0, 0)` ends with `pos.y` within 0.05 of 0.25 and `pos.z` below −2.5.
- **T3.13** A static box of half extents `(2, 0.3, 2)` centred at `(0, 0.3, -4)` (a 0.6 m ledge): the same walk ends with `pos.z` above `-2 + PLAYER_RADIUS - 0.1` and `pos.y` below 0.05.
- **T3.14** A static wall of half extents `(5, 2, 0.25)` centred at `(0, 2, -3)`: `moveY: 1` for 2 s ends with `pos.z` between `-2.75 + PLAYER_RADIUS` and `-2.75 + PLAYER_RADIUS + 0.1`.
- **T3.15** A dynamic cuboid (half extents 0.25, mass about 1 kg, default groups) resting at `(0, 0.25, -2)`: after the player walks into it for 2 s the box has moved less than 0.01 on every axis.
- **T3.16** The same dynamic cuboid dropped from `(0, 3, 0)` onto a player standing at the origin comes to rest with its centre below `y = 0.3`: it fell through the player.
- **T3.17** Two runs of the Lodgy from `{ pos: vec3(0, 0, 0), rot: IDENTITY }` with `throttle: 1` for 3 s, one with a player made at `(0, 0, -6)` and stepped with no input, one without a player: the vehicle's final `pos.z` differs by less than 0.01.
- **T3.18** A Lodgy at rest at the origin for 2 s, with a player made at `(-0.78, 0, -1.4)` (under the front-left wheel) and stepped with no input: the chassis `pos.y` at the end is within 0.01 of its value in the same run without the player.
- **T3.19** Two players at `(-2, 0, 0)` and `(2, 0, 0)` walking toward each other for 1 s (`yaw: -Math.PI / 2, moveY: 1` and `yaw: Math.PI / 2, moveY: 1`): each ends past the other's start (`pos.x > 2` and `pos.x < -2`).
- **T3.20** `state()` returns a different object each call, and changing a returned `pos` does not change the next one.
- **T3.21** After `setEnabled(false)` and `setPosition(vec3(1, 2, 3))`, `state().pos` is `(1, 2, 3)`, `grounded` is false, and stepping with `moveY: 1` for 1 s leaves `pos` unchanged while `yaw` follows the input. After `teleport(vec3(0, 0, 0))` and `setEnabled(true)` the player walks again.
- **T3.22** `dispose()` removes the collider: `rig.world.colliders.len()` returns to its value from before the player was made.

- [ ] **Step 1: Write the tests T3.1 to T3.22**
- [ ] **Step 2: Run them and see them fail** — `npx vitest run packages/shared/src/player.test.ts`. Expected: every case fails because `./player` does not exist.
- [ ] **Step 3: Implement** `groups.ts`, `player.ts`, the `each` callback of the rig, and the wheel-ray groups in `vehicle.ts`.
- [ ] **Step 4: Run every check** — `npm test` and `npm run typecheck`. The existing vehicle and scenario tests must still pass unchanged: they show that the wheel rays still find the ground.
- [ ] **Step 5: Commit** — `git add packages/shared` then commit as `feat(shared): add the character that walks, jumps and collides`.

---

### Task 4: Standing on the vehicle, and being shoved by it

**Files:**
- Modify: `packages/shared/src/player.ts`
- Test: `packages/shared/src/player.test.ts` (add), `packages/shared/src/scenarios.test.ts` (add)

**Interfaces:**
- Consumes: Task 3's `Player`, `Carrier`, `PlayerGround`; `VEHICLE_BODY_ID`; `vehicleBox`, `pointBoxDistance`; `inverseRotate`.
- Produces: no new export. `Player.step` now uses `carriers`, sets `state().ground`, and can return `'stuck'`.

**Behaviour rules.** They run inside `step`, in this order, for an enabled player:
- **B4.1 Carry.** If the player was standing on a carrier at the end of their previous step, their position is first re-derived from that carrier's current pose: `pos = body position + rotate(body rotation, ground.localPos)`.
- **B4.2 Shove-out.** This rule ignores the carrier that the player was standing on at the end of their previous step. If the capsule, shrunk by `PLAYER_SKIN` all round, now overlaps another carrier's collider, the player is moved horizontally away from that body's position: the direction is from the body's position to the player's, flattened to the horizontal (if that has no length, the body's right axis). The player is moved along it in steps of `PLAYER_SHOVE_STEP` until the shrunk capsule overlaps no carrier. Both checks, against carriers and against static geometry, use the shrunk capsule. If a step would make it overlap static geometry, or `PLAYER_SHOVE_MAX` is reached first, the player is left where they were and `step` returns `'stuck'` without doing B4.3 to B4.5. The player's height is not changed by a shove.
- **B4.3 Movement.** Then the player's own movement of Task 3 is applied. While the player is in the air, the carried velocity of B4.5 is added to the wanted horizontal velocity.
- **B4.4 Ground.** After moving, if the player is grounded, a ball of radius `PLAYER_RADIUS` is cast straight down from the centre of the capsule's lower hemisphere for `PLAYER_GROUND_PROBE`. If the first thing it meets is a carrier's collider, `ground` is `{ bodyId: carrier.id, localPos }`, with `localPos = inverseRotate(body rotation, pos - body position)`. Otherwise `ground` is null. (A ray from the feet would miss the roof while the capsule still rests on its edge.)
- **B4.5 Take-off.** On the step in which a player who was standing on a carrier ends in the air, the carrier's horizontal velocity at the player's position (its linear velocity plus its angular velocity crossed with the offset from its centre of mass, y set to 0) becomes the player's carried velocity. The carried velocity is cleared when the player is next grounded.
- **B4.6** A disabled player is neither carried nor shoved.

**Rapier notes (hints):** `physics.castShape(position, rotation, velocity, shape, targetDistance, maxToi, stopAtPenetration, undefined, QUERY_GROUPS)` with a ball gives the collider underfoot; `collider.parent()` is its body, to compare with each carrier's `body`. `physics.intersectionsWithShape(pos, rot, shape, callback, undefined, QUERY_GROUPS)` reports the colliders a shape overlaps; a collider whose parent is a carrier's body is that carrier, and one with no parent or a fixed parent is static geometry. `body.linvel()`, `body.angvel()`, `body.worldCom()`.

**Test cases** (`player.test.ts`; the Lodgy is spawned at `{ pos: vec3(0, 0, 0), rot: IDENTITY }`; `carriers` is `[{ id: VEHICLE_BODY_ID, body: rig.vehicle.body }]`; a player "on the ground at `(x, 0, z)`" is made with feet at `(x, PLAYER_SKIN, z)`; "the roof" is a player made with feet at `(0, rideHeight + halfExtents.y + 0.05, 0)` after the vehicle has settled for 1 s with the brake on)
- **T4.1** A player on the roof of the stationary vehicle for 1 s: `ground.bodyId` is `'vehicle'`, `ground.localPos` is within 0.05 of `(0, halfExtents.y, 0)` on x and z and within 0.1 on y, and `grounded` is true.
- **T4.2** The vehicle then drives with `throttle: 1` for 5 s. On every tick `ground.bodyId` is `'vehicle'` and `step` returns `'ok'`. At the end `ground.localPos` is within 0.1 of its value before the drive, on each axis, and the player's `pos.z` is within 0.3 of the vehicle's.
- **T4.3** As T4.2 but with `throttle: 1, steer: 1` for 3 s after 3 s straight: the player is still on the vehicle on every tick and `ground.localPos` moved less than 0.1.
- **T4.4** While the vehicle drives (`throttle: 1`), the player walks with `moveY: 1` (yaw 0) for 0.3 s: `ground.localPos.z` falls by between `0.8 × W × 0.3` and `1.2 × W × 0.3`.
- **T4.5** After 5 s at `throttle: 1`, the player walks off the side (`moveX: 1`) until `ground` is null. Over the next 0.2 s, with no input and the vehicle keeping `throttle: 1`, the player's horizontal displacement is at least `0.8 × 0.2 ×` the vehicle's speed at the moment they left.
- **T4.6** A player standing on the ground at `(0, 0, -6)` with no input while the Lodgy drives at them (`throttle: 1` for 3 s). On every tick after the first second: `step` returns `'ok'`; `pointBoxDistance(pos + (0, PLAYER_HEIGHT / 2, 0), vehicleBox(config, vehicle state))` is at least `PLAYER_RADIUS - 0.05`; and `|pos.y| < 0.1`. The vehicle's final `pos.z` is within 0.01 of the run without a player (T3.17).
- **T4.7** As T4.6 with the player at `(0.5, 0, -6)`: they end with `pos.x` above `halfExtents.x + PLAYER_RADIUS - 0.1`.
- **T4.8** As T4.6 with the player at `(0.98, 0, -6)` and a static wall of half extents `(0.25, 2, 10)` centred at `(1.55, 2, -6)` (its inner face is at `x = 1.3`): `step` returns `'stuck'` on at least one tick, and on every tick `pos.x` is at most `1.3 - PLAYER_RADIUS + 0.03`.
- **T4.9** A disabled player whose position was set inside the chassis is not moved by any number of steps, and `step` returns `'ok'`.
- **T4.10** (`scenarios.test.ts`) "a player on the roof of a vehicle driving at speed stays on it, and lands back on it after a jump": the Lodgy drives with `throttle: 1` for 10 s with a player on the roof (its speed is then above 15 m/s); the player is on the vehicle on every tick. Then one step with `jumpPressed` true; the vehicle keeps `throttle: 1` throughout. Within the next 2 s the player's `ground.bodyId` is `'vehicle'` again, and at that moment `ground.localPos` is within 1.0 of its value at take-off on x and on z.
- **T4.11** (`scenarios.test.ts`) An RV driving with `throttle: 1` for 5 s with a player made on its roof (feet at `(0, rideHeight + halfExtents.y + 0.05, 0)` after settling): the player is on the vehicle on every tick and `ground.localPos` moves less than 0.1 on each axis.

- [ ] **Step 1: Write the tests T4.1 to T4.11**
- [ ] **Step 2: Run them and see them fail** — `npx vitest run packages/shared/src/player.test.ts packages/shared/src/scenarios.test.ts`.
- [ ] **Step 3: Implement** B4.1 to B4.6 in `player.ts`.
- [ ] **Step 4: Run every check** — `npm test` and `npm run typecheck`. Task 3's tests must still pass unchanged.
- [ ] **Step 5: Commit** — `git add packages/shared` then commit as `feat(shared): carry players on the vehicle and shove them out of its way`.

---

### Task 5: Placement beside the vehicle

**Files:**
- Create: `packages/shared/src/placement.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/testRig.ts` (`Rig` gains `surfaceOf`, the function its statics return)
- Test: `packages/shared/src/placement.test.ts` (new)

**Interfaces:**
- Consumes: `Vehicle` (its `body` and `config`), `Statics.surfaceOf`, `yawOf`, `yawRotation`, Task 1's constants, `QUERY_GROUPS`.
- Produces:

```ts
export interface Placement {
  // The feet position on the ground at the spot `local` beside the vehicle, or null if that spot is not valid.
  // `others` are the feet positions of the players on foot other than the one being placed.
  beside(local: Vec3, others: readonly Vec3[]): Vec3 | null;
  // The first valid spawn slot, or the fallback when none is valid.
  spawn(others: readonly Vec3[]): Vec3;
}
export function createPlacement(
  rapier: Rapier,
  physics: RapierWorld,
  vehicle: Vehicle,
  surfaceOf: (colliderHandle: number) => Surface | null,
  // The last checkpoint's spawn position.
  fallback: () => Vec3,
): Placement;
```

**Behaviour rules:**
- **B5.1** The spot's horizontal position is the vehicle's position plus `rotate(yawRotation(yawOf(vehicle rotation)), (local.x, 0, local.z))`. Only the vehicle's yaw is used, so the spots stay beside a vehicle that is tilted or upside down.
- **B5.2** A ray goes straight down from `PLACEMENT_PROBE_UP` above the vehicle's centre height at that horizontal position, for `PLACEMENT_PROBE_UP + PLACEMENT_PROBE_DOWN`. The spot is valid only if the first thing the ray meets is ground (`surfaceOf` gives a surface for it) and the ground there is no steeper than `PLAYER_MAX_SLOPE_DEG`.
- **B5.3** The feet go where the capsule, standing upright over the hit point, just clears the ground: `feet.y = hit.y + (PLAYER_RADIUS + PLAYER_SKIN) / normal.y - PLAYER_RADIUS`. On flat ground that is `PLAYER_SKIN` above it.
- **B5.4** The spot is valid only if a capsule standing there overlaps nothing (static geometry, the vehicle) and no entry of `others` is within `2 × PLAYER_RADIUS` of it horizontally while within `PLAYER_HEIGHT` of it vertically.
- **B5.5** `spawn` tries `vehicle.config.spawnSlots` in order with `beside` and returns the first valid one; if none is valid it returns `fallback()`.

**Test cases** (`placement.test.ts`; `createRig(RAPIER, id, spawn)` settled for 1 s with the brake on; `placement = createPlacement(RAPIER, rig.world, rig.vehicle, rig.surfaceOf, () => vec3(0, 0, 50))`; the Lodgy at the origin means `spawn = { pos: vec3(0, 0, 0), rot: IDENTITY }`)
- **T5.1** Lodgy at the origin: `spawn([])` is within 0.05 of `(-1.6, PLAYER_SKIN, -0.6)`.
- **T5.2** With `others` holding that position, `spawn` is within 0.05 of `(1.6, PLAYER_SKIN, -0.6)`. With the first five slots' positions in `others`, it is the sixth slot. With all six, it is the fallback `(0, 0, 50)`.
- **T5.3** An entry of `others` at slot 0's x and z but 5 m higher does not block slot 0.
- **T5.4** A static wall of half extents `(0.5, 1, 0.5)` centred at `(-1.6, 1, -0.6)` blocks slot 0: `spawn([])` is slot 1.
- **T5.5** Lodgy spawned at `{ pos: vec3(149, 0, 0), rot: IDENTITY }` (the ground ends at `x = 150`): `spawn([])` is slot 0, and `beside(config.spawnSlots[1], [])` is null (no ground under it).
- **T5.6** Lodgy spawned with `rot = quatFromAxisAngle(AXIS_Y, Math.PI / 2)` at the origin: `spawn([])` is within 0.05 of `(-0.6, PLAYER_SKIN, 1.6)`.
- **T5.7** Lodgy spawned upside down with `spawn = { pos: vec3(0, 2, 0), rot: quatFromAxisAngle(vec3(0, 0, 1), Math.PI) }` (the rig places the chassis centre at the spawn position plus the rotated ride height, here 1.05 m above the ground), then left for 3 s with no controls to settle on its roof: `spawn([])` has `|y| < 0.1` and lies between 1.4 and 1.9 from the vehicle's position horizontally, and it is not the fallback.
- **T5.8** Both vehicles on the gentle reference slope (`slopePose('gentle', 10)`, brake on): `spawn([])` is not the fallback, and a capsule standing at the returned position overlaps nothing.
- **T5.9** RV at the origin: `spawn([])` is within 0.05 of `(-1.9, PLAYER_SKIN, -2.4)`.

- [ ] **Step 1: Write the tests T5.1 to T5.9**
- [ ] **Step 2: Run them and see them fail** — `npx vitest run packages/shared/src/placement.test.ts`.
- [ ] **Step 3: Implement** `placement.ts` and the rig's `surfaceOf`.
- [ ] **Step 4: Run every check** — `npm test` and `npm run typecheck`.
- [ ] **Step 5: Commit** — `git add packages/shared` then commit as `feat(shared): find valid spots and spawn slots beside the vehicle`.

---

### Task 6: Seats and interact

**Files:**
- Create: `packages/shared/src/seats.ts`, `packages/shared/src/interact.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/seats.test.ts` (new), `packages/shared/src/interact.test.ts` (new)

**Interfaces:**
- Consumes: `VehicleConfig`, `Seat`; `Placement`; `Box`, `pointBoxDistance`; `yawOf`, `yawRotation`, `rotate`; `DRIVER_DOOR_RANGE`, `INTERACT_RANGE`, `PLAYER_HEIGHT`.
- Produces:

```ts
// seats.ts
export interface Seats {
  // The player in a seat, or null.
  occupant(seatId: string): string | null;
  // The seat a player is in, or null.
  seatOf(playerId: string): string | null;
  // The player in the driver's seat, or null.
  driver(): string | null;
  // The seat interact gives a player whose feet are at `feet`, or null when every seat is taken.
  seatFor(feet: Vec3, vehicle: { pos: Vec3; rot: Quat }): string | null;
  // Puts a player in a free seat. Throws if the seat is taken or the player is already seated.
  sit(playerId: string, seatId: string): void;
  // Frees the player's seat; does nothing if they have none.
  leave(playerId: string): void;
  // Where the occupant of a seat is, in the world.
  seatPosition(seatId: string, vehicle: { pos: Vec3; rot: Quat }): Vec3;
  // Where a player leaving this seat lands: beside its door, else beside the door opposite, else a spawn slot.
  exitPosition(seatId: string, placement: Placement, others: readonly Vec3[]): Vec3;
}
export function createSeats(config: VehicleConfig): Seats;

// interact.ts
export type InteractAction = { kind: 'exit' } | { kind: 'board'; seatId: string };
export interface InteractContext {
  feet: Vec3;
  // The seat the player is in, or null.
  seat: string | null;
  vehicleBox: Box;
  // The seat boarding would give, or null; see Seats.seatFor.
  seatFor: () => string | null;
}
// What interact does for a player this tick, or null for nothing.
export function resolveInteract(context: InteractContext): InteractAction | null;
```

**Behaviour rules:**
- **B6.1** A door's world position is the vehicle's position plus `rotate(yawRotation(yawOf(rot)), (door.x, 0, door.z))`. Distances to doors are horizontal (x and z only).
- **B6.2** `seatFor`: if the driver's seat is free and `feet` is within `DRIVER_DOOR_RANGE` of the driver's door, the driver's seat. Otherwise the free seat whose door is nearest to `feet`; on a tie, the one earlier in `config.seats`. Null when no seat is free.
- **B6.3** `seatPosition` is the vehicle's position plus `rotate(rot, seat.pos)` (the full rotation: a seated player tilts with the vehicle).
- **B6.4** `exitPosition`: `placement.beside(seat.door, others)`; if null, `placement.beside` of the mirrored door `(-door.x, door.y, door.z)`; if null, `placement.spawn(others)`.
- **B6.5** `resolveInteract`: a seated player gets `{ kind: 'exit' }`. A player on foot gets `{ kind: 'board', seatId }` when `pointBoxDistance(feet + (0, PLAYER_HEIGHT / 2, 0), vehicleBox) <= INTERACT_RANGE` and `seatFor()` is not null. Otherwise null. `seatFor` is not called for a seated player or one out of range.
- **B6.6** `index.ts` exports both files.

**Test cases** (`seats.test.ts`; the vehicle pose is `{ pos: vec3(0, 0.95, 0), rot: IDENTITY }` and the config is the Lodgy's unless stated; `exitPosition` is tested with a hand-made `Placement` object whose `beside` and `spawn` return scripted values and record their arguments)
- **T6.1** A new `Seats` has no occupant in any seat, `driver()` is null, and `seatOf('p1')` is null.
- **T6.2** `seatFor(vec3(-1.6, 0, -0.6), pose)` is `'driver'`. From `(-1.6, 0, 0.4)` (1.0 from the driver's door) it is also `'driver'`.
- **T6.3** From `(1.6, 0, -0.6)` it is `'seat-1'`; from `(1.6, 0, 1.4)` it is `'seat-5'`; from `(-1.6, 0, 1.4)` (2.0 from the driver's door) it is `'seat-4'`.
- **T6.4** With the driver's seat taken, from `(-1.6, 0, -0.6)` it is `'seat-2'` (the nearest free door, 1.0 away, on the same side).
- **T6.5** With every seat taken it is null.
- **T6.6** With the vehicle turned by `quatFromAxisAngle(AXIS_Y, Math.PI / 2)`, `seatFor(vec3(-0.6, 0, 1.6), pose)` is `'driver'`.
- **T6.7** `sit('p1', 'driver')` makes `occupant('driver')`, `seatOf('p1')` and `driver()` return `'p1'`, `'driver'` and `'p1'`. A second `sit` into a taken seat throws, and so does `sit` for a player already seated. `leave('p1')` frees the seat; `leave` for an unseated player does nothing.
- **T6.8** `seatPosition('driver', pose)` is `(-0.45, 0.5, -0.6)`. With the vehicle rolled 90° about −Z (`quatFromAxisAngle(vec3(0, 0, 1), -Math.PI / 2)`) it is the vehicle's position plus that rotation applied to the seat's `pos` (6 decimal places).
- **T6.9** `exitPosition('seat-1', placement, others)` returns what `beside` returned for the door `(1.48, 0, -0.6)`. When that call returns null it returns what `beside` returned for `(-1.48, 0, -0.6)`. When both return null it returns `spawn(others)`. `others` is passed through to each call.
- **T6.10** (`interact.test.ts`; the vehicle box is `vehicleBox(VEHICLES.lodgy, { pos: vec3(0, 0.95, 0), rot: IDENTITY })`) A seated player gets `{ kind: 'exit' }` and `seatFor` is not called.
- **T6.11** A player on foot at `(1.6, 0, -0.6)` beside the Lodgy's box, with `seatFor` returning `'seat-1'`, gets `{ kind: 'board', seatId: 'seat-1' }`.
- **T6.12** The same player with `seatFor` returning null gets null.
- **T6.13** A player at `(0, 0, 4.2)` (1.95 behind the rear face at `z = 2.25`, and 4.2 from the centre) boards; at `(0, 0, 4.4)` they get null and `seatFor` is not called. This shows range is measured to the nearest point of the box.

- [ ] **Step 1: Write the tests T6.1 to T6.13**
- [ ] **Step 2: Run them and see them fail** — `npx vitest run packages/shared/src/seats.test.ts packages/shared/src/interact.test.ts`.
- [ ] **Step 3: Implement** `seats.ts` and `interact.ts`.
- [ ] **Step 4: Run every check** — `npm test` and `npm run typecheck`.
- [ ] **Step 5: Commit** — `git add packages/shared` then commit as `feat(shared): add seats and what interact does at the vehicle`.

---

### Task 7: Players in the world and in the room

**Files:**
- Modify: `packages/shared/src/world.ts`, `packages/server/src/room/room.ts`
- Test: `packages/shared/src/world.test.ts` (change and add), `packages/server/src/room/server.test.ts` (change and add), `packages/server/src/node/server.test.ts` (change), `packages/client/src/net/snapshotBuffer.test.ts` (add `players: []` to its `snapshot` helper so that it still type-checks, and nothing else)

**Interfaces:**
- Consumes: everything from Tasks 1 to 6; `TickInput`, `NO_PRESSES`; `neutralInput`.
- Produces, in `world.ts`:

```ts
export interface PlayerSnapshot {
  playerId: string;
  pos: Vec3;
  yaw: number;
  seat: string | null;
  ground: PlayerGround | null;
}
export interface WorldSnapshot {
  tick: number;
  vehicle: VehicleState;
  // In the order the players joined.
  players: PlayerSnapshot[];
}
export interface World {
  // (existing members stay)
  // Puts a new player on foot in a spawn slot. Throws if the id is already in the world.
  addPlayer(playerId: string): void;
  // Takes a player out, freeing their seat. Does nothing for an unknown id.
  removePlayer(playerId: string): void;
  step(inputs: ReadonlyMap<string, TickInput>): WorldEvent[];
}
```

**Behaviour rules.** One tick of `step`, in this order:
- **B7.1 Inputs.** For each player in join order: their `TickInput` from the map, or, if the map has none, `{ input: neutralInput(the input they were last given), pressed: NO_PRESSES }` (a player never given one starts from `NEUTRAL_INPUT`). Every number in the input that is not finite is replaced by 0 before use. Inputs for ids that are not in the world are ignored.
- **B7.2 Interact.** For each player in join order whose `pressed.interact` is true, `resolveInteract` is applied at once, so a later player sees the result. `board` seats the player (`setEnabled(false)`); `exit` frees the seat and puts the player on foot (`setEnabled(true)`, `teleport`) at `exitPosition`, where `others` is the feet positions of all the other players on foot.
- **B7.3 Drive.** The vehicle's controls come from the driver's input: `throttle = moveY`, `steer = moveX`, `brake = jump` (held). With no driver they are `throttle 0, steer 0, brake false`: the vehicle coasts.
- **B7.4** The physics world steps.
- **B7.5 Characters.** For each player in join order: a seated player's position is set to their seat's position (`setPosition`) and their step is run for yaw and pitch only; a player on foot is stepped with their input, `pressed.jump`, and the vehicle as the only carrier. If the step returns `'stuck'` the player is teleported to `placement.spawn(others)`.
- **B7.6 Kill plane.** A player on foot whose `pos.y` is below `course.killPlaneY` is teleported to `placement.spawn(others)`, and the tick's events gain `{ kind: 'respawn', tick, playerId }`, where `tick` is the tick being simulated (the snapshot's tick after this step).
- **B7.7** The placement's fallback is the position of the course's first checkpoint's spawn pose.
- **B7.8** `addPlayer` places the player with `placement.spawn(others)`, so players added one after another take the slots in order. `removePlayer` frees the seat and disposes the character.
- **B7.9** `snapshot().players` lists every player in join order with their `pos`, `yaw`, `seat` (`seats.seatOf`) and `ground`. A seated player's `ground` is null.
- **B7.10** `dispose` frees every player before the physics world.
- **B7.11** The comment and the code that made "the first input in the map" drive are removed.

In `room.ts`:
- **B7.12** `add` calls `world.addPlayer(playerId)` and `remove` calls `world.removePlayer(playerId)`. `replaceConnection` leaves the world's player as it is.
- **B7.13** `stepOnce` gives the world a map from each player's id to their queue's `next()` (the whole `TickInput`).
- **B7.14** The snapshot message carries the world's `players`.

**Test cases** (`world.test.ts`. A helper `tickInput(fields, pressed?)` builds a `TickInput` from `NEUTRAL_INPUT`; `run(world, ticks, inputsFor)` steps with a map built per tick. The world is `createWorld(RAPIER, { courseId: 'test', vehicleId: 'lodgy' })` unless stated, and has run 60 ticks to settle before players act.)
- **T7.1** Six `addPlayer` calls put the players at the six spawn slots in order: after one tick, player n's `pos` is within 0.1 of `(±1.6, 0, slot z)` for the Lodgy at the origin, and each has `seat: null`, `ground: null`.
- **T7.2** `addPlayer` with an id already present throws. `removePlayer('nobody')` does nothing. After `removePlayer`, the snapshot no longer lists the player.
- **T7.3** A player given `moveY: 1` for 60 ticks moves between `0.9 × W` and `1.02 × W` toward −Z; a player with no entry in the map does not move. The snapshot's `yaw` for a player given `yaw: 1` is 1.
- **T7.4** (replaces "the first input in the map drives") Player `p1` (at slot 0) is given `pressed.interact` once: the snapshot shows `seat: 'driver'` and `pos` within 0.01 of the driver seat's world position. Then `moveY: 1` for 180 ticks drives the vehicle more than 5 m toward −Z; `moveX: 1` with `moveY: 1` turns it right (its x increases); `jump: true` at speed slows it harder than coasting (compare the forward speed lost over 60 ticks with and without `jump`). "Speed" in this task's tests is `world.debug().forwardSpeed`, because a vehicle at rest reports a small vertical velocity.
- **T7.5** With `p1` in the driver's seat and sending nothing, a second player `p2` (at slot 1) presses interact and the snapshot shows `seat: 'seat-1'`. Then `p2` is given `moveY: 1, moveX: 1, jump: true` for 120 ticks: the vehicle's `throttle` and `steer` in the snapshot stay 0 and its forward speed stays below 0.05 in magnitude.
- **T7.6** With `interact` held true in `input` for 60 ticks but `pressed.interact` true only on the first, the player stays in the seat.
- **T7.7** `addPlayer('p1')`, `addPlayer('p2')`, `addPlayer('p3')`: `p1` is at slot 0 and `p3` at slot 2, both within `DRIVER_DOOR_RANGE` of the driver's door. `p1` and `p3` press interact on the same tick: `p1` gets `'driver'` and `p3` gets `'seat-2'`, because players are handled in the order they joined.
- **T7.8** After driving to a forward speed of more than 5 m/s, the driver presses interact: on the next snapshot they are on foot (`seat: null`) within 0.5 horizontally of the driver door's world position in that snapshot, and 60 ticks later the vehicle still has more than 0.8 of the forward speed it had (it coasts, the brake is off).
- **T7.9** `removePlayer` of the driver frees the seat: another player at the driver's door can then board as `'driver'`.
- **T7.10** A player at slot 1 is given `yaw: -Math.PI / 2, moveY: 1` (they walk toward +X) until a tick's events contain `{ kind: 'respawn', playerId }`, for at most 2600 ticks: they walk off the east edge of the ground (`x = 150`) and fall. The event's `tick` equals the snapshot's tick after that step. The player is then given no input for 30 ticks, and ends within 0.3 of a spawn slot's position with `pos.y` above −1.
- **T7.11** (replaces "the same inputs produce the same snapshot") Two worlds given the same scripted inputs for 600 ticks, with three players who walk, board, drive and leave, produce deeply equal snapshots.
- **T7.12** (replaces the non-finite test) A player given `moveY: NaN`, `yaw: Infinity` and `pitch: NaN` for 10 ticks, on foot and then as the driver: every number in the snapshot is finite, and normal input works afterwards.
- **T7.13** An input in the map for an id that was never added is ignored, and `step` does not throw.
- **T7.14** The existing tests "rejects unknown courses and vehicles", "spawns the chosen vehicle at the first checkpoint", "with no input the vehicle does not move", "step returns an event list and debug reports wheel surfaces", "rejects ids that are only inherited object keys", "shared course and vehicle data cannot be modified" and "dispose frees the physics world" still pass; change them only where the type of `step`'s argument requires it.

(`packages/server/src/room/server.test.ts`. Add a helper `board(client, seq)` that sends an input with `interact: true` and returns the next `seq`; the first player of a room spawns at the driver's door, so one such input seats them as the driver.)
- **T7.15** Every snapshot a client receives has `players` with one entry per player in the room, in join order, each with the fields of `PlayerSnapshot`.
- **T7.16** (replaces "the first player drives; the others do not") The host boards and sends nothing more. A guest then sends `moveY: 1` for 1 s: the guest's `pos.z` falls by more than 2, the vehicle's `throttle` stays 0 and its `pos.z` stays within 0.05 of where it was. Then the host sends `moveY: 1` for 2 s and the vehicle's `pos.z` falls by more than 2.
- **T7.17** (replaces "when the driver leaves, the next player drives") When the driver disconnects, their seat is free: the snapshot lists no player with `seat: 'driver'`, and the vehicle's `throttle` is 0.
- **T7.18** A player who joins a room that has been running for 5 s appears in the next snapshot on foot near the vehicle (within 3 m of it horizontally).
- **T7.19** A takeover (a join with a connected player's token) keeps the player's place in the world: their `seat` in the next snapshot is what it was.
- **T7.20** The other existing room tests still pass unchanged, with one exception: "a silent driver stops pressing the pedal after the neutral-input delay" has its client board first with the helper, then send the throttle with the next `seq`; what it asserts stays the same. Tests that only count ticks, snapshots or `ackSeq` do not need the vehicle to move: leave them as they are.

(`packages/server/src/node/server.test.ts`)
- **T7.21** In "two clients share a room, and the first one drives the vehicle both see", the first client sends one input with `interact: true` before holding the throttle. The assertions stay as they are.

- [ ] **Step 1: Write and change the tests T7.1 to T7.21**
- [ ] **Step 2: Run them and see them fail** — `npx vitest run packages/shared/src/world.test.ts packages/server`.
- [ ] **Step 3: Implement** the world's player handling and the room's wiring.
- [ ] **Step 4: Run every check** — `npm test` and `npm run typecheck`. (`npm run e2e` now fails until Task 11; do not run it.)
- [ ] **Step 5: Commit** — `git add packages/shared packages/server` then commit as `feat(shared): put players in the world, with seats, a driver and the kill plane`.

---

### Task 8: Validating the new snapshot, and the protocol tests owed

**Files:**
- Modify: `packages/shared/src/protocol.ts`
- Test: `packages/shared/src/protocol.test.ts` (add)

**Interfaces:**
- Consumes: `PlayerSnapshot`, `PlayerGround`.
- Produces: no new export. `parseServerMessage` checks more.

**Behaviour rules:**
- **B8.1** A `snapshot` is accepted only if `players` is an array and every entry has: `playerId` a string; `pos` three finite numbers; `yaw` a finite number; `seat` a string or null; `ground` null, or an object with `bodyId` a string and `localPos` three finite numbers.
- **B8.2** A `lobby` is accepted only if every player's `colour` matches `/^#[0-9a-f]{6}$/i`.
- **B8.3** Unknown fields are still kept. The existing test "parseServerMessage keeps fields it does not know, so a newer server can add to a message" used `players: [{ playerId: 'p1' }]` as its unknown field, which is now a known and invalid one: change that test to add `weather: 'rain'` to the valid fixture instead, and keep its assertion.

**Test cases** (`protocol.test.ts`; the existing `snapshot` fixture gains `players: [{ playerId: 'p1', pos, yaw: 0.5, seat: null, ground: null }]`)
- **T8.1** Accepted: the fixture; one with `players: []`; one whose player has `seat: 'driver'`; one whose player has `ground: { bodyId: 'vehicle', localPos: { x: 0, y: 0.55, z: 0 } }`.
- **T8.2** Rejected, each as its own case: `players` missing; `players` not an array; an entry that is null; an entry without `playerId`; `pos` lacking `z`; `yaw` a string; `yaw` written as `1e999`; `seat` a number; `seat` missing; `ground` a string; `ground` without `bodyId`; `ground.localPos` lacking `y`.
- **T8.3** A lobby whose player has `colour: 'red'`, `'#fff'`, `'#12345g'` or `'#1234567'` is rejected; `'#E4572E'` is accepted.
- **T8.4** Owed from step 2, for `parseServerMessage`: a snapshot is rejected when `vehicle.steer` is a string; when `vehicle.throttle` is written as `1e999`; when `vehicle.pos.x` is null; when `vehicle.pos.y` is missing; when each of `vehicle.rot.x`, `rot.y` and `rot.z` is missing in turn; and when `vehicle.linvel.z` is missing. A lobby is rejected when `room` is missing; when a player's `playerId` is missing; when `courseId` is missing; when `vehicleId` is missing; when a player's `ready` is a string; when a player's `connected` is missing; when `players` contains null; when `adminId` is missing; and an `error` is rejected when `reason` is a number.
- **T8.5** Owed from step 2, for `parseClientMessage`: an input is rejected when each of `yaw`, `pitch` and `moveX` is null, a string, or written as `1e999` (nine cases); `yaw: -3 * Math.PI - 0.5` comes back as `Math.PI - 0.5`; `yaw: -Math.PI` comes back as `Math.PI` and `yaw: Math.PI` as `Math.PI`; `pitch: -5` comes back as `-Math.PI / 2`; `moveX` and `moveY` of exactly 1 and −1 come back unchanged.
- **T8.6** Owed from step 2, length limits: a name of 16 characters is accepted and one of 17 rejected; a token of 15 characters is rejected, of 16 and of 64 accepted, of 65 rejected; a room of 24 characters is accepted and one of 25 rejected.
- **T8.7** Owed from step 2: an `input`, a `create` and a `join` that each carry `extra: 'x'` and a `__proto__` key (build the text by hand, for example `'{"type":"create","name":"Amal","token":"abcdefghijklmnop","extra":"x","__proto__":{"admin":true}}'`) parse to objects that `toStrictEqual` the message with only its known fields.

- [ ] **Step 1: Write the tests T8.1 to T8.7**
- [ ] **Step 2: Run them and see them fail** — `npx vitest run packages/shared/src/protocol.test.ts`. Expected: T8.1 to T8.3 fail in part; T8.4 to T8.7 may pass already, because they cover behaviour that exists. Say in the report which did.
- [ ] **Step 3: Implement** B8.1 and B8.2.
- [ ] **Step 4: Run every check** — `npm test` and `npm run typecheck`. The server's snapshots must still pass through `parseServerMessage`; `packages/server/src/node/server.test.ts` does not use it, so add nothing there.
- [ ] **Step 5: Commit** — `git add packages/shared` then commit as `feat(shared): validate the players in a snapshot and the colours in a lobby`.

---

### Task 9: The page reads players and the mouse

**Files:**
- Modify: `packages/client/src/net/snapshotBuffer.ts`, `packages/client/src/input/keyboard.ts`, `packages/client/src/game.ts` (only to keep it compiling: use `view.vehicle` where it used the vehicle)
- Create: `packages/client/src/input/mouseLook.ts`
- Test: `packages/client/src/net/snapshotBuffer.test.ts` (change and add), `packages/client/src/input/keyboard.test.ts` (add), `packages/client/src/input/mouseLook.test.ts` (new)

**Interfaces:**
- Consumes: `WorldSnapshot`, `PlayerSnapshot`, `lerp`, `nlerp`, `lerpAngle`, `wrapAngle`, `clamp`, `MOUSE_SENSITIVITY`, `AIM_PITCH_LIMIT`.
- Produces:

```ts
// snapshotBuffer.ts
export interface WorldView {
  vehicle: VehicleState;
  players: PlayerSnapshot[];
}
// SnapshotBuffer.sample(now) now returns WorldView | null.

// mouseLook.ts
export interface MouseLook {
  aim(): { yaw: number; pitch: number };
  dispose(): void;
}
// `surface` is clicked to capture the pointer; `doc` reports movement and which element holds the pointer.
export function createMouseLook(
  surface: EventTarget & { requestPointerLock?: () => unknown },
  doc: EventTarget & { pointerLockElement: unknown },
): MouseLook;
```

**Behaviour rules:**
- **B9.1** The vehicle is interpolated as before.
- **B9.2** Between two snapshots `from` and `to`, the view's players are the players of `to`, in its order. A player also present in `from` has `pos = lerp(from.pos, to.pos, t)` and `yaw = lerpAngle(from.yaw, to.yaw, t)`; a player absent from `from` has their `to` values. `seat` and `ground` are `to`'s.
- **B9.3** Before the oldest snapshot and after the newest, the view is that snapshot's players unchanged.
- **B9.4** The keyboard source calls `preventDefault()` on `keydown` and `keyup` for the game's keys (`KeyW`, `KeyA`, `KeyS`, `KeyD`, `Space`, `KeyE`, `KeyF`, `KeyG`, `KeyQ`, `KeyR`, `Digit1`, `Digit2`, `Digit3`) and for no other key.
- **B9.5** A key that goes down and up between two calls of `sample()` is still reported as down by the next call, once: a quick tap is not lost. Slot keys already work this way.
- **B9.6** A click on `surface` calls `surface.requestPointerLock()` if it exists. While `doc.pointerLockElement === surface`, each `mousemove` on `doc` changes the aim: `yaw = wrapAngle(yaw - movementX × MOUSE_SENSITIVITY)` and `pitch = clamp(pitch - movementY × MOUSE_SENSITIVITY, -AIM_PITCH_LIMIT, AIM_PITCH_LIMIT)`. Without the pointer lock, movement is ignored. The aim starts at yaw 0, pitch 0.
- **B9.7** `dispose` removes the listeners; later events change nothing.

**Test cases** (`snapshotBuffer.test.ts`; existing tests read the vehicle from `sample(now)?.vehicle`; snapshots in new tests carry `players`)
- **T9.1** Halfway between two snapshots in which a player moves from `(0,0,0)` to `(0,0,-2)` and turns from yaw 0 to yaw 1: `pos.z` is −1 and `yaw` is 0.5 (6 decimal places).
- **T9.2** A player whose yaw goes from 3 to −3 has yaw π halfway: assert `Math.abs(wrapAngle(yaw - Math.PI)) < 1e-6`.
- **T9.3** A player present only in the later snapshot appears with that snapshot's values; a player present only in the earlier one is not in the view.
- **T9.4** `seat` and `ground` come from the later snapshot.
- **T9.5** Before the oldest snapshot the view's players equal the oldest's; after the newest, the newest's. With no snapshot, `sample` is null.
- **T9.6** The existing vehicle tests pass, reading `.vehicle`.

(`keyboard.test.ts`)
- **T9.7** `preventDefault` is called for `keydown` and `keyup` of `Space` and `KeyW`, and not for `KeyP` or `Tab`. (Dispatch `new Event(type, { cancelable: true })` with `code` assigned and read `event.defaultPrevented`.)
- **T9.8** `keydown` then `keyup` of `KeyE` with no `sample()` between them: the next `sample()` has `interact: true` and the one after has `interact: false`. The same holds for `Space` and `jump`.
- **T9.9** Owed from step 1: opposite keys cancel on every axis (`KeyW` with `KeyS` gives `moveY` 0; `KeyQ` with `KeyR` gives `reel` 0); a repeated `keydown` of a held key (an event with `repeat: true`) changes nothing; after `dispose`, `keydown`, `keyup` and `blur` all change nothing.

(`mouseLook.test.ts`; `surface` and `doc` are `EventTarget` objects with the extra members assigned by the test)
- **T9.10** The aim starts at `{ yaw: 0, pitch: 0 }`. A click on the surface calls its `requestPointerLock` once.
- **T9.11** With `doc.pointerLockElement = surface`, a `mousemove` with `movementX: 100, movementY: 0` gives yaw `-100 × MOUSE_SENSITIVITY`; one with `movementX: 0, movementY: -100` gives pitch `100 × MOUSE_SENSITIVITY`.
- **T9.12** A move of `movementY: -100000` leaves pitch at `AIM_PITCH_LIMIT`, and one of `movementY: 100000` after it leaves pitch at `-AIM_PITCH_LIMIT`. Yaw wraps: from yaw 0, a single move of `movementX = -(Math.PI + 0.5) / MOUSE_SENSITIVITY` gives yaw `-Math.PI + 0.5` (6 decimal places).
- **T9.13** With `doc.pointerLockElement = null`, movement changes nothing. A surface without `requestPointerLock` does not throw on click.
- **T9.14** After `dispose`, clicks and movement change nothing.

- [ ] **Step 1: Write and change the tests T9.1 to T9.14**
- [ ] **Step 2: Run them and see them fail** — `npx vitest run packages/client`.
- [ ] **Step 3: Implement** the buffer, the keyboard change and `mouseLook.ts`; keep `game.ts` compiling.
- [ ] **Step 4: Run every check** — `npm test`, `npm run typecheck` and `npm run build`.
- [ ] **Step 5: Commit** — `git add packages/client` then commit as `feat(client): interpolate players and read the mouse for aim`.

---

### Task 10: Characters, cameras, crosshair and overlay

**Files:**
- Create: `packages/client/src/render/camera.ts`, `packages/client/src/render/playerMesh.ts`
- Delete: `packages/client/src/render/followCamera.ts`
- Modify: `packages/client/src/ui/overlay.ts`, `packages/client/src/game.ts`, `packages/client/src/main.ts`, `packages/client/index.html`
- Test: `packages/client/src/render/camera.test.ts` (new), `packages/client/src/ui/overlay.test.ts` (change)

**Interfaces:**
- Consumes: `WorldView`; `createMouseLook`; `aimRotation`, `rotate`, `normalize`, `rayBoxDistance`, `vehicleBox`; the camera constants; `PLAYER_*` sizes; `VEHICLES[...].seats`; `BuiltCourse` (`ground`, `walls`).
- Produces:

```ts
// camera.ts — pure; no Three.js
export interface CameraPose {
  pos: Vec3;
  yaw: number;
  pitch: number;
}
// Behind and above the shoulder of a player whose feet are at `feet`, pulled in when a box is in the way.
export function shoulderCamera(feet: Vec3, yaw: number, pitch: number, obstacles: readonly Box[]): CameraPose;
// Circling a seated player's vehicle.
export function orbitCamera(vehiclePos: Vec3, vehicleHalfLength: number, yaw: number, pitch: number): CameraPose;

// playerMesh.ts
// A capsule body and a sphere head in the player's colour, with their name above. The group's origin is at the feet.
export function createPlayerMesh(name: string, colour: string): THREE.Group;
// Hides the body and head of a seated player and keeps the name.
export function setPlayerMeshSeated(mesh: THREE.Group, seated: boolean): void;
export function disposePlayerMesh(mesh: THREE.Group): void;

// overlay.ts
export interface OverlayData {
  lobby: LobbyMessage;
  // The id of the player this page controls.
  playerId: string;
  tick: number;
  fps: number;
  // Null until the first snapshot arrives.
  view: WorldView | null;
}
export function overlayText(data: OverlayData): string;

// game.ts
export function createGame(
  view: GameView,
  firstLobby: LobbyMessage,
  playerId: string,
  send: (message: ClientMessage) => void,
): Game;
// GameView gains: crosshair: HTMLElement
```

**Behaviour rules:**
- **B10.1 Shoulder camera.** The eye is `feet + (0, PLAYER_EYE_HEIGHT, 0)`. The wanted position is `eye + rotate(aimRotation(yaw, pitch), CAMERA_SHOULDER_OFFSET)`. Let `dir` be the unit vector from the eye to it and `full` the distance. If a ray from the eye along `dir` meets an obstacle at a distance `d` less than `full`, the camera is at `eye + dir × max(CAMERA_MIN_DISTANCE, d - CAMERA_WALL_MARGIN)`; otherwise at the wanted position. The pose's `yaw` and `pitch` are the aim's.
- **B10.2 Orbit camera.** The target is `vehiclePos + (0, CAMERA_ORBIT_HEIGHT, 0)`. The pitch used is `min(pitch, CAMERA_ORBIT_MAX_PITCH)`. The camera is at `target + rotate(aimRotation(yaw, used pitch), (0, 0, CAMERA_ORBIT_HALF_LENGTHS × vehicleHalfLength))`, with the aim's yaw and the used pitch.
- **B10.3** `game.ts` applies a pose to the Three.js camera with `camera.position.set(...)` and `camera.rotation.set(pitch, yaw, 0, 'YXZ')`. The camera's field of view is `CAMERA_FOV`.
- **B10.4** The local player is the entry of the view whose `playerId` is the page's. On foot: the shoulder camera, with the course's ground and wall boxes and the vehicle's box as obstacles, and the crosshair shown. Seated: the orbit camera with `config.halfExtents.z`, and the crosshair hidden. Before the local player appears in a view, the camera stays where it is.
- **B10.5** Every player in the view who is not seated is drawn with a mesh at `pos`, turned to `yaw` (`rotation.y = yaw`), the local player included. A seated player's body and head are hidden and their name is drawn at the player's `pos.x` and `pos.z` (their seat's place in the world), at the height of the vehicle's centre plus `halfExtents.y + 0.4`. Meshes are made when a player first appears, with the name and colour from the lobby (`'?'` and `'#888888'` if the lobby does not list them yet), remade when the lobby's name or colour for them changes, and removed and disposed when the player leaves the view.
- **B10.6 The character mesh.** A capsule of radius `PLAYER_RADIUS` from the feet to 1.35 m, a sphere head of radius 0.18 centred at 1.52 m, a small dark box on the front (−Z) of the head so that facing shows, all with flat-shaded Lambert materials; the name on a sprite centred 1.95 m above the feet, drawn with `fillText` on a canvas (white text, dark outline). The name is text, never markup.
- **B10.7** Each tick the page sends the keyboard's fields with the mouse's `yaw` and `pitch`. `game.stop()` also disposes the mouse look, every player mesh, and hides the crosshair.
- **B10.8** `main.ts` keeps the `playerId` from `welcome` and passes it, and the crosshair element, to `createGame`.
- **B10.9** `index.html` gains `<div id="crosshair" hidden></div>` after the overlay: a cross of two 14 px by 2 px white bars with a dark 1 px outline, fixed at the centre of the window, `pointer-events: none`, with the rule `#crosshair[hidden] { display: none; }` so that `hidden` wins over its own `display`. The overlay's last line tells the controls (below).
- **B10.10 Overlay text.** Lines, joined with `\n`:

```
room     <room>   vehicle <vehicleId>   course <courseId>
players  <name>[ (<seat>)], <name>[ (<seat>)], …
tick     <tick>   fps <rounded fps>
you      <where>
speed    <km/h, 1 decimal, width 7> km/h
pos      <x> <y> <z>            (the vehicle's, 1 decimal, width 7 each)
throttle <2 decimals, width 7>   steer <2 decimals, width 7>
(empty line)
WASD move or drive   Mouse look (click first)   Space jump or brake   E board or leave
```

  - `players` lists the lobby's players in its order; a player the view shows as seated has ` (<seat id>)` after the name, for example `Amal (driver), Badr (seat-1), Chadi`. Nobody is marked as driving by their place in the list.
  - `<where>` is `driver` or the seat id when seated; `on the vehicle` when `ground` is set; otherwise `on foot` followed by the player's own `pos` as three numbers, each with 1 decimal, padded to width 7 and preceded by one space; `joining…` when the view does not list the player yet.
  - Without a view, the lines from `you` to `throttle` are replaced by the single line `waiting for the server…`.

**Test cases** (`camera.test.ts`)
- **T10.1** `shoulderCamera(vec3(0,0,0), 0, 0, [])` is at `(0.5, PLAYER_EYE_HEIGHT + 0.25, 2.6)` with yaw 0 and pitch 0.
- **T10.2** With yaw `Math.PI / 2` and no obstacle it is at `(2.6, PLAYER_EYE_HEIGHT + 0.25, -0.5)` (6 decimal places): behind a player who faces −X.
- **T10.3** With a wall box of half extents `(5, 5, 0.25)` centred at `(0, 0, 1.5)` (its near face at `z = 1.25`) the camera's z is below 1.25 and its distance from the eye is `d - CAMERA_WALL_MARGIN`, where `d` is `rayBoxDistance` from the eye toward the wanted position.
- **T10.4** With the same wall centred at `(0, 0, 0.5)` (the eye is 0.25 from it) the camera is `CAMERA_MIN_DISTANCE` from the eye.
- **T10.5** A box that the ray does not meet, and one beyond the wanted position, change nothing.
- **T10.6** `orbitCamera(vec3(0, 1, 0), 2.25, 0, 0)` uses pitch `CAMERA_ORBIT_MAX_PITCH`: its position is `target + rotate(aimRotation(0, CAMERA_ORBIT_MAX_PITCH), (0, 0, 9))`, which is above the target (`pos.y > 1 + CAMERA_ORBIT_HEIGHT`), and its `pitch` is `CAMERA_ORBIT_MAX_PITCH`. With pitch −1 the pose's pitch is −1.
- **T10.7** `orbitCamera` with yaw `Math.PI` is on the −Z side of the vehicle (`pos.z < 0`).

(`overlay.test.ts`; replace the existing cases with these, keeping the fixture style)
- **T10.8** With two lobby players, `p1` seated as `driver` and `p2` on foot at `(1.6, 0, -0.6)`, and `playerId: 'p2'`, the text contains the lines `players  Amal (driver), Badr` and `you      on foot     1.6     0.0    -0.6`, and the vehicle's `speed`, `pos` and `throttle` lines in the format of step 2.
- **T10.9** With `playerId: 'p1'` the `you` line is `you      driver`. With `p2`'s `ground` set and `playerId: 'p2'` it is `you      on the vehicle`. With a view that does not list `p2` it is `you      joining…`.
- **T10.10** With nobody seated the players line is `players  Amal, Badr`: no `(drives)`.
- **T10.11** With `view: null` the text contains `waiting for the server…` and no `you`, `speed`, `pos` or `throttle` line.
- **T10.12** The last line is `WASD move or drive   Mouse look (click first)   Space jump or brake   E board or leave`.
- **T10.13** A lobby player the view does not list is still named in the players line, without a seat.

- [ ] **Step 1: Write the tests T10.1 to T10.13**
- [ ] **Step 2: Run them and see them fail** — `npx vitest run packages/client`.
- [ ] **Step 3: Implement** the cameras, the mesh, the overlay, the wiring and the crosshair; delete `followCamera.ts`.
- [ ] **Step 4: Run every check** — `npm test`, `npm run typecheck` and `npm run build`.
- [ ] **Step 5: Look at it once.** Start `PORT=3210 npm start` in the background (record its process id), open nothing, and check with `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3210/` that it answers `200`; then stop that process by its id and confirm with `lsof -nP -iTCP:3210 -sTCP:LISTEN` that the port is free. How the characters and cameras look is the owner's to judge; say so in the report.
- [ ] **Step 6: Commit** — `git add packages/client` then commit as `feat(client): draw the players, with shoulder and orbit cameras and a crosshair`.

---

### Task 11: The smoke test and the record

**Files:**
- Modify: `e2e/smoke.spec.ts`, `playwright.config.ts`, `ROADMAP.md`, `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`, `docs/superpowers/plans/step-3-players-on-foot.md` (tick the boxes)

**Interfaces:**
- Consumes: the overlay format of B10.10; the ids of `index.html`.
- Produces: `npm run e2e` passing again, with 12 tests (six in each project).

**Behaviour rules:**
- **B11.1** `playwright.config.ts` gains `trace: 'retain-on-failure'` in `use`.
- **B11.2** The helper `players(page)` stays. New helpers: `you(page)` returns the text after `you` on its line (trimmed); `ownZ(page)` returns the third number of an `on foot` line, or `NaN`.
- **B11.3** The first test becomes "two players share a room; the one in the driver's seat drives". Its steps, each a polled assertion unless it says otherwise:
  1. Amal creates a room and Badr joins by its link, as today. Both overlays list `Amal, Badr`, and both ticks rise.
  2. Both pages show `on foot` in their `you` line.
  3. Amal holds `KeyE` until her page lists `Amal (driver), Badr`, then releases it. Badr's page lists the same, and Amal's `you` line is `driver`.
  4. Badr holds `KeyW`. Badr's `ownZ` falls by more than 2 from its starting value (he walks), then the key is released. Read once on both pages: `throttle` is 0 and the vehicle's z is above −0.5 (walking moved him, not the vehicle).
  5. Amal holds `KeyW`: `throttle(badr)` rises above 0.9 and the vehicle's z falls below −3 on both pages. Amal releases it: `throttle(badr)` returns to 0.
  6. The canvas has a drawing size on both pages, as today.
  7. Amal holds `KeyE` again until her page lists `Amal, Badr`, then releases it. Amal's `you` line starts with `on foot`, and Badr's page lists `Amal, Badr`.
  8. Amal's page closes: Badr's page lists `Badr`.
- **B11.4** In the reload test the expected list is `Amal` (no seat). In the test that joins by typing the room's name, the expected text is `players  Amal, Badr`. The other tests are unchanged. The checks for uncaught page errors and for WebSockets stay.

**ROADMAP.md:**
- "Current state": the current step is step 3, done, with the next action "write the plan for step 4"; runnable today: everyone who opens a room is a character beside the vehicle; walk with WASD, look with the mouse after a click, jump with Space, board and leave with E; the player in the driver's seat drives. Add: "Owner's check pending: open the page once on an iPhone on the same Wi-Fi and confirm that it loads, draws the scene and that the tick in the overlay rises. There are no touch controls until step 14."
- Steps table: row 3's status `done`, branch `step-3-players-on-foot`, plan `[plan](docs/superpowers/plans/step-3-players-on-foot.md)`.
- "How to run and test": replace the last paragraph with "In the page: WASD to move, or to drive from the driver's seat; click the view, then move the mouse to look; Space to jump, or to brake when driving; E to board the vehicle or leave a seat."
- "Known issues": add "The page predicts nothing yet: your own character answers the keys a moment late. Prediction arrives at step 4." and "Jumping onto the RV's roof is not possible (2.9 m); the Lodgy's roof (1.5 m) is in reach."
- "Carried into later steps": delete every row whose first column is `3`, and add the rows that the step's reviews assign to later steps (the main session supplies them when this task is dispatched), plus: `| 4 | The page draws its own player from snapshots; prediction replaces that for walking and jumping, and must reuse `player.ts` through `createPredictor` |`, `| 5 | `Carrier` and shove-out are written for the vehicle only; props become carriers too |`, `| 8 | "The last checkpoint" in placement is the course's first checkpoint until checkpoints are recorded |`, `| 9 | The world returns a `respawn` event from the kill plane at once; the 3 s delay and the 50 health of the spec are not built, and the server sends no `event` messages yet |`.
- Decisions log, dated with the day the task runs: "A player's position is the point between their feet; the eye is 1.55 m above it"; "The jump reaches about 1.7 m so that the Lodgy's roof is in reach; the value is the owner's to tune"; "A player's collider belongs to a collision group that interacts with nothing, and the players' own queries and the wheel rays filter on it"; "Spots beside the vehicle use the vehicle's yaw only, so they stay beside it when it is tilted or upside down"; "Other players on foot count as occupying a spawn slot, so players who arrive together stand side by side"; "Press detection lives in `shared` (`pressesOf`) and the server's input queue reports the presses of every input it consumed in a tick"; "A seated player is not drawn; their name floats above the vehicle until real meshes exist"; "The step 3 plan fixed interfaces, rules and test cases and left the code to the implementers (owner's choice, to lower cost)".

**The spec** (`docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`): in "Conventions", after the bullet that begins `- A player's aim is a ray`, add the bullet: "- A player's position is the point on the ground between their feet." In the build-order paragraph that begins "Until the lobby exists (step 11)", append: " Until step 9 the snapshot's player entries hold `playerId`, `pos`, `yaw`, `seat` and `ground` only." If either anchor text is not found exactly once, stop and report.

- [ ] **Step 1: Change the smoke test** as B11.2 to B11.4 say, and the config as B11.1 says.
- [ ] **Step 2: Run it** — `npm run e2e`. Expected: `12 passed`. If a test fails, do not change the page or a timeout to make it pass: run the suite once more to tell a flake from a failure, then report. Confirm afterwards that nothing listens on port 3100.
- [ ] **Step 3: Run every other check** — `npm test`, `npm run typecheck`, `npm run build`.
- [ ] **Step 4: Update `ROADMAP.md` and the spec** as written above.
- [ ] **Step 5: Tick this plan's checkboxes** — change `- [ ]` to `- [x]` on every step heading of Tasks 1 to 11, and nothing else.
- [ ] **Step 6: Commit** — `git add e2e playwright.config.ts ROADMAP.md docs` then commit as `docs(roadmap): record step 3 as built`. Do not merge the branch; the main session reviews it and merges.
