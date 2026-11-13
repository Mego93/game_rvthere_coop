# Step 3: Players on foot, seats, and the shoulder camera

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md` (sections "Players", "Player physics", "Interact resolution", "Snapshot", "Camera and rendering"). This plan fixes interfaces, constants, rules and test cases. Implementers write the tests first, then the code. Where this plan and the spec disagree, stop and report (CLAUDE.md, "When something is not specified").

## Goal

Every player is a capsule on foot, simulated on the server. They walk, jump, stand on the vehicle (carried in its frame), are shoved out of its way, board and leave seats, and respawn after falling below the kill plane. The first player no longer drives automatically: whoever sits in the driver seat drives. The page draws the players, a shoulder camera follows the local player (an orbit camera while seated), and a crosshair shows the aim.

Not in this step: client prediction (step 4), push, hands, props (5), health and damage (7, 9), counted respawns (9), checkpoint recording (8). The local player is drawn from interpolated snapshots until step 4, so walking lags by about 100 ms plus the round trip. That is accepted.

## Decisions made in this plan (log them in `ROADMAP.md` in the last task; the owner confirms at go-ahead)

D1. Spawn slots are not shared. A slot is valid only if, besides the spec's rules (ground beneath, nothing overlapping), no other player stands within `2 * PLAYER_RADIUS` of it horizontally. Without this every player would stack in slot 0. Spec text to amend: "Spawn slots".
D2. Nobody is seated automatically at the start of a run. A player boards with interact. This breaks "the first player drives"; the roadmap line "Runnable today" changes with it.
D3. Press detection (jump, interact, drop) lives in the world: a press is a button that is true now and was false in that player's previous tick input. The queue merges taps (rule Q1). The `fresh` flag stays unused. This replaces the carried roadmap rows about `fresh` and merging presses.
D4. `World` gains `addPlayer`, `removePlayer` and `teleportPlayer` (the last is needed by tests now and by checkpoint restarts at step 8). Spec section "shared" lists the first two; add the third there.
D5. The camera's wall pull-in is computed on the client with a ray against the course's ground and wall boxes (no physics on the client before step 4).
D6. There is no way onto the vehicle's roof from the ground yet (the Lodgy roof is 1.5 m up, a jump reaches 1.27 m). Tests place players there with `teleportPlayer`; props at step 5 give players something to climb.

## Constants (`packages/shared/src/constants.ts`, one block "Players on foot")

| Name | Value | Meaning |
|---|---|---|
| `PLAYER_RADIUS` | 0.35 | capsule radius, m |
| `PLAYER_HEIGHT` | 1.8 | feet to top of the head, m |
| `PLAYER_EYE_HEIGHT` | 1.6 | aim ray origin above the feet |
| `PLAYER_WALK_SPEED` | 4.5 | m/s at full input |
| `PLAYER_GROUND_ACCEL` | 40 | m/s², walk velocity toward the wish velocity |
| `PLAYER_AIR_ACCEL` | 10 | same, airborne |
| `PLAYER_JUMP_SPEED` | 5 | m/s upward at take-off |
| `PLAYER_STEP_HEIGHT` | 0.3 | highest ledge walked up without jumping |
| `PLAYER_SNAP_DISTANCE` | 0.3 | glue to the ground when walking down |
| `PLAYER_MAX_SLOPE_DEG` | 45 | steepest slope walked up |
| `PLAYER_SLIDE_SLOPE_DEG` | 50 | slopes steeper than this make a player slide |
| `PLAYER_KILL_RESPAWN_DELAY` | 3 | s below the kill plane before respawning |
| `BOARD_RANGE` | 2 | m, to the nearest point of the vehicle's box, for boarding |
| `DRIVER_DOOR_RANGE` | 1.6 | m, horizontal, to the driver door point, for taking the driver seat |
| `SEAT_EXIT_DISTANCE` | 0.9 | m from the vehicle's side to the exit point |
| `SHOVE_STEP` | 0.1 | m, search step when shoving a player out |
| `SHOVE_MAX_DISTANCE` | 4 | m, farthest shove before the player goes to a spawn slot |
| `LOOK_SENSITIVITY` | 0.0025 | rad per pixel of mouse movement (client) |
| `CAMERA_DISTANCE` | 3.2 | m behind the player's head (client) |
| `CAMERA_SHOULDER` | 0.6 | m to the right of the head (client) |
| `CAMERA_MIN_DISTANCE` | 0.4 | m, closest the wall pull-in brings the camera |
| `CAMERA_WALL_MARGIN` | 0.2 | m kept between the camera and a wall |

Also in `constants.ts`: `PLAYER_COLOUR_PATTERN = /^#[0-9a-f]{6}$/`, used by the protocol check.

## Conventions this step adds (apply to all code)

- `PlayerSnapshot.pos` and every player position are the **feet**. The capsule's centre is `PLAYER_HEIGHT / 2` above the feet.
- Wish direction. With `f = (−sin yaw, 0, −cos yaw)` and `r = (cos yaw, 0, −sin yaw)`: `wish = f·moveY + r·moveX`. If its length exceeds 1 it is normalised. Wish velocity is `wish · PLAYER_WALK_SPEED`. Yaw 0 faces −Z, positive yaw turns left.
- Aim: the ray starts at `pos + (0, PLAYER_EYE_HEIGHT, 0)` and points along `(−sin yaw·cos pitch, sin pitch, −cos yaw·cos pitch)`.
- Vehicle yaw frame: the vehicle's heading about +Y only (`yawOf(rot)`), used for seat exits and spawn slots so a rolled vehicle does not tip them.

## Vehicle config additions (`vehicles.ts`)

```ts
export interface SeatConfig {
  id: string;          // 'driver', 'p1' … 'p5'
  pos: Vec3;           // chassis-local, the sitting position
  side: -1 | 1;        // −1 left (−X), +1 right (+X); the door is on this side
}
// VehicleConfig gains:
seats: readonly SeatConfig[];      // seats[0] is the driver seat; at least 6 in total
spawnSlots: readonly Vec3[];       // six, in the vehicle yaw frame; y is ignored (the ground is found below)
```

Values (the plan checked them against `halfExtents`):

| | Lodgy (half x 0.88, z 2.25) | RV (half x 1.15, z 3.4) |
|---|---|---|
| seats, x = ∓side · 0.4 / 0.55; y | y = 0.1; z = −0.7, 0.4, 1.5 | y = 0.0; z = −2.2, −0.4, 1.8 |
| order | driver (left, row 1), front passenger (right, row 1), left row 2, right row 2, left row 3, right row 3 | same order |
| spawn slots (x = ∓(halfX + 1.2), z = seat row) | (−2.08, −0.7), (2.08, −0.7), (−2.08, 0.4), (2.08, 0.4), (−2.08, 1.5), (2.08, 1.5) | (−2.35, −2.2), (2.35, −2.2), (−2.35, −0.4), (2.35, −0.4), (−2.35, 1.8), (2.35, 1.8) |

Seat x: left seats `−0.4` (Lodgy) / `−0.55` (RV), right seats the same with positive sign. The driver is on the left in both.

Derived (computed in `seats.ts`, not stored): a seat's door point is `(side · halfX, z = seat.z)` in the vehicle yaw frame, at ground level. Its exit point is `(side · (halfX + SEAT_EXIT_DISTANCE), z = seat.z)`; the other-side exit point mirrors x.

Plan check: spawn slot 0 lies 1.2 m (horizontal) from the driver door point, inside `DRIVER_DOOR_RANGE` (1.6); slot 2 lies about 1.64 m (Lodgy) and 1.83 m (RV) from it, outside. Slot 0 is 1.2 m from the vehicle's side, inside `BOARD_RANGE`. The chassis bottom is 0.4 m (Lodgy) and 0.5 m (RV) above the ground, higher than `PLAYER_STEP_HEIGHT`, so a player cannot walk under or up the side.

## Modules and signatures

### `shared/src/groups.ts` (new)

```ts
export const GROUP_WORLD = 0x0001;   // ground, walls, vehicle chassis
export const GROUP_PLAYER = 0x0002;
export function groups(membership: number, filter: number): number   // Rapier's packed interaction groups
```

Rules: ground, wall and chassis colliders are in `GROUP_WORLD` and collide only with `GROUP_WORLD`. Player colliders are in `GROUP_PLAYER` and collide with nothing in the solver. The character controller's queries and the wheel raycasts see only `GROUP_WORLD`. Changes `statics.ts` and `vehicle.ts` (the chassis collider group and the `updateVehicle` filter).

### `shared/src/player.ts` (new)

```ts
export interface GroundRef { bodyId: 'vehicle'; localPos: Vec3 }   // localPos: feet, in the vehicle's local frame
export interface PlayerState {
  id: string; pos: Vec3; yaw: number; pitch: number;
  walk: { x: number; z: number };    // own horizontal velocity, relative to the ground the player stands on
  carry: { x: number; z: number };   // inherited horizontal velocity while airborne
  vy: number; grounded: boolean;
  ground: GroundRef | null; seat: string | null;
  respawnIn: number | null;          // seconds left below the kill plane
}
export function wishVelocity(yaw: number, moveX: number, moveY: number): { x: number; z: number }   // rule P1
export function aimRay(pos: Vec3, yaw: number, pitch: number): { origin: Vec3; dir: Vec3 }          // rule P2
export interface Players {
  add(id: string): PlayerState;
  remove(id: string): void;
  get(id: string): PlayerState | undefined;
  all(): PlayerState[];               // in the order the players were added
  // One tick of foot movement for every unseated player; call after the physics step. `pressed` is per player.
  stepOnFoot(inputs: ReadonlyMap<string, StepInputs>): void;
  teleport(id: string, pos: Vec3): void;
  findSpawn(forId: string | null): Vec3;                    // rule S1, S2
  findExit(seat: SeatConfig): Vec3 | null;                  // rules E1, E2
  dispose(): void;
}
export function createPlayers(rapier: Rapier, physics: RapierWorld, vehicle: Vehicle, course: BuiltCourse): Players
export interface StepInputs { fields: InputFields; pressed: { jump: boolean; interact: boolean; drop: boolean } }
```

### `shared/src/seats.ts` (new, pure)

```ts
export function seatDoorPoint(config: VehicleConfig, seat: SeatConfig, vehiclePos: Vec3, vehicleRot: Quat): Vec3
export function exitPoints(config: VehicleConfig, seat: SeatConfig, vehiclePos: Vec3, vehicleRot: Quat): [Vec3, Vec3]  // [own side, other side]
export function distanceToBox(point: Vec3, halfExtents: Vec3, pos: Vec3, rot: Quat): number   // to the nearest point of an oriented box, 0 inside
export function chooseSeat(config, vehiclePos, vehicleRot, playerPos: Vec3, taken: ReadonlySet<string>): string | null   // rules B1 to B4
```

### `shared/src/interact.ts` (new, pure)

```ts
export type InteractAction = { kind: 'exitSeat' } | { kind: 'board'; seatId: string };
export function resolveInteract(ctx: { seat: string | null; seatChoice: string | null }): InteractAction | null
```

`seatChoice` is `chooseSeat(...)`'s result when the player is in `BOARD_RANGE`, otherwise null. Priority is exitSeat, then board (rule I1). The signature will gain fields as later steps add targets; nothing else calls it now besides `world.ts` and its tests.

### `shared/src/world.ts` changes

```ts
// World gains:
addPlayer(id: string): void;       // places the player by rule S1; unknown ids in step() are ignored
removePlayer(id: string): void;    // frees a held seat
teleportPlayer(id: string, pos: Vec3): void;   // sets feet position; clears velocity, seat and ground
// WorldSnapshot gains:
players: PlayerSnapshot[];         // in join order
```

`step` still takes `ReadonlyMap<string, InputFields>`. A player with no entry in the map is treated as `NEUTRAL_INPUT`. The world remembers each player's previous input to detect presses (rule T1).

Tick order inside `step` (matches the spec's order for the parts that exist):
1. Presses are computed; interact is resolved for each player (board / exit) in join order.
2. The driver's input becomes the vehicle controls (rule V1); the vehicle gets `step`.
3. Physics step.
4. Seated players are moved to their seat; shove-out (rule M3); walking and jumping for the others (`stepOnFoot`).
5. Kill-plane handling (rule K1).

### `PlayerSnapshot` (`protocol.ts`)

```ts
export interface PlayerSnapshot {
  playerId: string; pos: Vec3; yaw: number;
  seat: string | null;
  ground: { bodyId: string; localPos: Vec3 } | null;
}
```

Fields for health, hands, inventory and holds are added by the steps that make them.

## Behaviour rules

**Movement**
- P1. `wishVelocity` follows the convention above. Both axes at 1 give a vector of length 1.
- P2. `aimRay` follows the convention above; the direction is unit length.
- P3. On the ground, `walk` moves toward the wish velocity by at most `PLAYER_GROUND_ACCEL · dt` per tick; in the air by at most `PLAYER_AIR_ACCEL · dt`. Gravity is `GRAVITY`. The player moves by `(walk + carry)·dt` horizontally and `vy·dt` vertically through the engine's kinematic character controller with the constants above (autostep, snap to ground, slope limits). Contact alone moves nothing: no impulse is applied to any body.
- P4. A jump press while grounded sets `vy = PLAYER_JUMP_SPEED`. A press while airborne does nothing. A held jump does not repeat.
- P5. Yaw and pitch are copied from the input every tick (pitch clamped by the protocol already).
- P6. Players do not collide with each other.

**Isolation**
- N1. Players never change the vehicle's motion: the vehicle's state after N ticks is the same (within 1e-6 m) with any number of players present, standing in its path or on it. Wheel rays ignore players.

**Standing on the vehicle and shove-out**
- M1. When the controller reports the player grounded on the vehicle's chassis collider, `ground` is set to `{ bodyId: 'vehicle', localPos }` and the player's `pos` is derived from it. At the start of each later tick, before the player's own movement, `pos` is re-derived from `localPos` and the vehicle's current transform. A rolled or tipped vehicle is handled by the same formula; the player stays grounded only where the controller says the surface is walkable.
- M2. A player who leaves the vehicle (jump, walking off) takes `carry` = the horizontal part of the vehicle's velocity at the player's position (linear plus angular contribution) and keeps it until landing. Landing on static ground sets `carry` to zero; landing on the vehicle sets `ground` again and `carry` to zero.
- M3. After the physics step, a player not seated and not standing on the vehicle whose capsule overlaps the vehicle's chassis is moved out horizontally, away from the chassis centre, in steps of `SHOVE_STEP`, to the first position within `SHOVE_MAX_DISTANCE` where the capsule overlaps neither the vehicle nor any static collider. If none exists, the player goes to a spawn slot (rule S1).

**Spawn slots and exits**
- S1. `findSpawn(forId)` returns the first slot, in config order, that is valid: ground exists beneath it (a downward ray from 3 m above the vehicle's position finds `GROUP_WORLD` ground within 6 m of that start), the capsule placed there overlaps no static collider and not the vehicle, and no other player (excluding `forId`) stands within `2·PLAYER_RADIUS` horizontally (D1). Slot coordinates are rotated by the vehicle's yaw and added to the vehicle's position. If none is valid, it returns the course's `checkpoints[0].spawn.pos`.
- S2. `addPlayer` places the player with `findSpawn(id)`, at rest, grounded, unseated. Players added later take the next free slot.
- E1. Leaving a seat places the player at the seat's own-side exit point, resolved to the ground as in S1 and valid if the capsule overlaps nothing static or the vehicle. If that is not valid, the other-side exit point is tried; if neither is, `findSpawn(id)`.
- E2. After leaving, the player is grounded, at rest, and `seat` is null.

**Seats and boarding**
- B1. If the player is in `BOARD_RANGE` (`distanceToBox` of the feet to the chassis box) and the driver seat is free and the player's horizontal distance to the driver door point is at most `DRIVER_DOOR_RANGE`, `chooseSeat` returns the driver seat.
- B2. Otherwise it returns the free seat whose door point is nearest to the player horizontally (ties: lowest index in `seats`).
- B3. With every seat taken it returns null and interact does nothing.
- B4. Outside `BOARD_RANGE` it returns null.
- B5. A seated player's `pos` is the seat's world position (chassis-local `pos` through the vehicle transform, with the feet `PLAYER_HEIGHT/2` below it), `ground` is null, and their capsule is moved with them. A seated player can look around and exit; moves, jumps and drops do nothing.
- I1. Interact priority: exit seat (if seated), otherwise board. Only a press acts (T1).
- V1. The driver's `moveY` is throttle, `moveX` steer, `jump` brake (held). With no driver the vehicle gets throttle 0, steer 0, brake false.
- V2. `removePlayer` frees the seat the player held; the vehicle then coasts (V1).
- V3. Two players pressing interact for the same seat on one tick: the earlier in join order gets it; the other then tries `chooseSeat` again with the seat taken (B2).

**Kill plane**
- K1. A non-seated player whose feet are below `course.killPlaneY` gets `respawnIn = PLAYER_KILL_RESPAWN_DELAY` and counts down by `dt` each tick while they keep falling. At zero they go to `findSpawn(id)`, at rest, grounded, and a world event `{ kind: 'respawn', tick, playerId, pos }` is returned by `step`. No respawn counter exists yet (step 9). A teleport clears `respawnIn`.

**Presses and input**
- T1. For each player and each of `jump`, `interact`, `drop`: `pressed = current && !previous`, where `previous` is the player's input in the previous tick (neutral on the first tick). A repeated input never re-triggers.
- Q1. (server `InputQueue`) When it consumes two inputs in one tick, the returned input is the second one with `jump`, `interact` and `drop` set to true if either consumed input had them true. The queue returns copies, never its stored objects (carried finding).
- W1. A non-finite number in an input is treated as 0 (already so for the vehicle; extend to yaw, pitch and the new fields).

**Protocol and client**
- R1. `parseServerMessage` rejects a snapshot whose `players` is missing or not an array, or whose entries lack finite `pos`, finite `yaw`, a string `playerId`, a `seat` that is neither string nor null, or a `ground` that is neither null nor `{ bodyId: string, localPos: Vec3 }`.
- R2. `parseServerMessage` rejects a lobby entry whose `colour` does not match `PLAYER_COLOUR_PATTERN`. The server's own colours match it.
- C1. Snapshot buffer: `sample(now)` returns `{ vehicle, players }`; each player in the newer snapshot is interpolated with the same older/newer pair as the vehicle (position lerp, yaw by the shorter way round). A player missing from the older snapshot is held at the newer one's value; a player missing from the newer one is dropped. The result never aliases stored objects.
- C2. Mouse look: while the pointer is locked on the canvas, `movementX` and `movementY` turn the view: `yaw -= movementX · LOOK_SENSITIVITY` (moving right turns right), `pitch -= movementY · LOOK_SENSITIVITY`, pitch clamped to ±(π/2 − 0.05), yaw wrapped to (−π, π]. Without pointer lock the view stays still. The input source reports `yaw` and `pitch`.
- C3. Keyboard: `preventDefault` on keydown and keyup for game keys (WASD, Space, E, F, Q, R, G, 1 to 3) and not for others (F5, Ctrl+R, F12 and the rest keep working). With modifiers (Ctrl, Meta, Alt) held, the key is left alone.
- C4. Shoulder camera. The camera pivot is the head: `pos + (0, PLAYER_EYE_HEIGHT, 0)`. The camera sits `CAMERA_DISTANCE` behind the aim direction and `CAMERA_SHOULDER` to the right, looking along the aim. A ray from the pivot toward the camera against the course's ground and wall boxes shortens the distance to the first hit minus `CAMERA_WALL_MARGIN`, never below `CAMERA_MIN_DISTANCE`. While the local player is seated, the existing vehicle follow camera is used.
- C5. Rendering: each player in the snapshot is a capsule body plus a sphere head in their lobby colour, with the name as a sprite above it (drawn onto a canvas with `fillText`; never HTML). Seated players are not drawn. The local player is drawn too. A centred cross-shaped crosshair is an HTML element over the canvas, shown while on foot and hidden while seated.
- C6. Overlay: the players line shows each name with its state (`on foot`, `driver`, or `seat <id>`); the "(drives)" logic goes. A line shows the local player's state and a hint: `E to board`, `E to leave the seat`. The hint is a plain overlay line until the HUD step.

## Tasks

Each task: implementer writes the listed tests first, then the code; then a review subagent. Commit with scope as shown after the full `npm test` and `npm run typecheck` pass.

### Task 1 — constants, vehicle config, collision groups (`shared`)
Files: `constants.ts`, `vehicles.ts`, `groups.ts` (new), `statics.ts`, `vehicle.ts`, `index.ts` (export `groups`), tests in `vehicles.test.ts` (new), `vehicle.test.ts`.
Tests:
1. Both configs have at least 6 seats, `seats[0].id === 'driver'` and it is on the left; ids are unique.
2. Every seat position lies inside the chassis box; every seat's `side` matches the sign of its `x`.
3. Six spawn slots per vehicle; each lies outside the chassis box horizontally by at least 1 m; none of the six coincide.
4. Each slot's distance to the driver door point: slot 0 within `DRIVER_DOOR_RANGE`, slot 2 beyond it (both vehicles).
5. Config and constants are frozen (extend the existing frozen-data test).
6. Existing vehicle tests still pass unchanged with the group changes (wheel rays still hit the ground).
Existing tests changed: none expected. Commit: `feat(shared): player constants, seats and spawn slots in the vehicle configs`.

### Task 2 — input queue (`server`)
Files: `packages/server/src/room/inputQueue.ts`, `inputQueue.test.ts`.
Tests:
1. Two inputs consumed in one tick where only the first has `interact` true: the returned input has `interact` true, and the other fields are the second's.
2. Same for `jump` and `drop`; axes, yaw, pitch, `use`, `reel`, `slot` are the second's.
3. One input consumed: returned unchanged.
4. The returned object is not the stored object: mutating it does not change a later `next()` result (repeat case and fresh case).
5. Neutral substitution after `NEUTRAL_AFTER_TICKS` still works and keeps yaw, pitch and slot.
Commit: `fix(server): keep taps when the input queue consumes two inputs, and return copies`.

### Task 3 — walking, jumping, spawn slots, kill plane (`shared`)
Files: `player.ts`, `world.ts`, `math.ts` (helpers only if needed), `index.ts`, tests in `player.test.ts` (new) and `world.test.ts`.
Scope: rules P1 to P6, N1, S1, S2, K1, T1, W1, and the `players` snapshot field with `addPlayer`, `removePlayer`, `teleportPlayer` (no seats, no vehicle carrying yet).
Tests:
1. `wishVelocity`: forward at yaw 0 is (0, −4.5)·… i.e. direction (0, −1); at yaw π/2 forward is (−1, 0); strafe right at yaw 0 is (1, 0); diagonal input has length 4.5; zero input is zero.
2. `aimRay`: origin is feet plus eye height; yaw 0, pitch 0 gives (0, 0, −1); pitch π/4 gives positive y; direction length 1.
3. A player added to a Lodgy world is at slot 0 (rotated by vehicle yaw, vehicle at the course start), on the ground (`pos.y` within 0.05 of 0), unseated.
4. Six players take six different slots, in order; a seventh `addPlayer` is not tested here (the server caps at 6).
5. With slot 0 blocked by a static collider (use a course variant built in the test) the player takes slot 1; with every slot invalid the player is at `checkpoints[0].spawn.pos`.
6. Walking forward for 60 ticks from rest covers between 4.2 and 4.5 m on flat road; releasing stops within 0.2 s.
7. Walking up the 25° reference slope for 4 s gains height of at least 4 m; the 8° slope likewise. (Steps 6 and 7 use a world where the player is teleported to the foot of the slope.)
8. A wall-like ground box taller than the step height stops the player; a 0.2 m ledge does not.
9. Jump: apex between 1.2 and 1.3 m above the take-off; back on the ground after 1.0 to 1.1 s; holding jump for 3 s gives one jump; pressing again in the air does nothing.
10. A repeated input (same `jump: true` for 10 ticks) gives exactly one jump; releasing and pressing again gives a second.
11. Airborne, the horizontal velocity changes by no more than `PLAYER_AIR_ACCEL·dt` per tick.
12. Two players at the same spot do not move each other (rule P6).
13. (moved to Task 5, which has a driver.)
14. Kill plane: teleport a player to y = `killPlaneY − 1`; they are not respawned at 2.9 s, are at a slot at 3.1 s, and `step` returned exactly one `respawn` event.
15. `teleportPlayer` clears velocity and `respawnIn`.
16. Non-finite `yaw`, `pitch`, `moveX`, `moveY` in an input do no lasting harm (position stays finite).
17. `snapshot().players` lists players in join order with `seat: null` and `ground` null on static ground; `removePlayer` removes the entry.
Existing tests changed in `world.test.ts`: none yet (the vehicle path is unchanged in this task). Add `players: []` expectations where a snapshot is compared whole, if any.
Commit: `feat(shared): players on foot with spawn slots, jumping and kill-plane respawn`.

### Task 4 — standing on the vehicle, take-off, shove-out (`shared`)
Files: `player.ts`, `world.ts`, tests in `player.test.ts` and `scenarios.test.ts`.
Scope: rules M1 to M3.
Tests:
World access in this task: tests need the vehicle's body to give it a velocity or a pose. The world does not expose the body; use `createPlayers` directly with a vehicle built by `createRig`-style setup (physics world, statics, vehicle), which the exported `createPlayers(rapier, physics, vehicle, course)` supports.
1. A player teleported onto the Lodgy's roof (feet 0.1 m above it) lands and has `ground.bodyId === 'vehicle'`.
2. Walking on the roof: with the vehicle still, walking forward 1 s moves `localPos` by 4.2 to 4.5 m along the vehicle's axis; walking off the end drops the player to the ground with `ground` null.
3. Take-off carry: with the vehicle's linear velocity set to 10 m/s forward (`body.setLinvel`), a player on the roof jumping gets `carry` of about 10 m/s along the vehicle's forward direction (within 0.2) and `ground` null.
4. Shove-out: a stationary player 1.5 m ahead of a Lodgy moving at 5 m/s toward them is never inside the chassis box at the end of any tick, and ends farther from the vehicle's centre than they began. With a wall box 0.1 m behind the player the player is never inside the wall; when no free position exists within `SHOVE_MAX_DISTANCE` the player is at a spawn slot.
5. A rolled vehicle (rotation set to 90° about Z): a player beside it is not "grounded on the vehicle"; no throw and no NaN.
6. Roof ride and jump-and-land need a driver and are written in Task 5 (its test 13).
Commit: `feat(shared): carry players on the vehicle and shove them out of its way`.

### Task 5 — seats, boarding, driving (`shared`)
Files: `seats.ts`, `interact.ts`, `player.ts`, `world.ts`, `index.ts`, tests in `seats.test.ts`, `interact.test.ts`, `player.test.ts`, `world.test.ts`, `scenarios.test.ts`.
Scope: rules B1 to B5, I1, V1 to V3, E1, E2; the tests moved from Task 4.
Tests:
1. `distanceToBox`: 0 inside; the face distance in front of a face; the corner distance beyond a corner; a rotated box.
2. `chooseSeat`: B1 (slot 0 gets the driver seat), B1 with the driver seat taken (nearest free seat), B2 nearest door, B3 all taken gives null, B4 out of range gives null, tie goes to the lower index.
3. `resolveInteract`: seated gives exitSeat; not seated with a choice gives board; neither gives null.
4. In the world: a player at slot 0 presses interact and sits in the driver seat (`snapshot().players[0].seat === 'driver'`); a second player at slot 1 presses interact and takes seat `p1`.
5. Holding interact does not board then exit: a held interact causes one action.
6. V3: two players press on the same tick, the first in join order gets the driver seat.
7. The driver's `moveY: 1` accelerates the vehicle; a passenger's `moveY: 1` does not move it; with no driver, a vehicle given initial speed coasts without braking (speed after 2 s above 90% of its start on flat road).
8. Existing world test "the first input in the map drives" is replaced by "the driver drives": the same assertions, with the first player seated.
9. Exit: interact while seated places the player at the own-side exit point (distance within 0.05 of it); with a wall box over that point the player appears on the other side; with both blocked, at a spawn slot. After leaving, the seat is free and `seat` is null.
10. `removePlayer` of the driver frees the seat and the vehicle coasts.
11. A seated player's `pos` follows the vehicle (seat position through the transform) while it is driven; they are not shoved.
12. A seated player's walk and jump inputs do nothing.
13. Roof ride: Lodgy at full throttle for 6 s from rest, a second player teleported onto the roof giving no input: their `localPos` changes by less than 0.05 m and they are still grounded on the vehicle at the end. Jump and land: the vehicle coasting at about 10 m/s (driver releases the throttle), the roof player jumps; after landing `ground` is set again and `localPos` is within 1.5 m of the take-off `localPos`.
13b. N1: the vehicle's state after 300 ticks of full throttle is the same (within 1e-6 m) with three extra players standing beside it, one standing in its path, and one on the roof, as with none.
14. Scenario: a scripted two-player run: player 1 boards the driver seat, player 2 boards a passenger seat, player 1 drives the Lodgy to the finish volume's z (−100) in under 40 s (the finish rule itself arrives at step 8; the check is the vehicle's position).
15. Determinism: the same sequence of inputs, including boarding, gives the same snapshot (`JSON.stringify` equal).
Existing tests changed: `world.test.ts` ("the first input in the map drives…", "the same inputs produce the same snapshot", "an input that is not a finite number…" — rewrite to seat a driver first), `vehicle.test.ts` and `scenarios.test.ts` only if they go through `createWorld`'s first-input behaviour (the implementer lists any other test that fails and fixes it by seating a driver, nothing else).
Commit: `feat(shared): seats, boarding and driving by the driver seat`.

### Task 6 — protocol and server (`shared`, `server`)
Files: `protocol.ts`, `protocol.test.ts`, `packages/server/src/room/room.ts`, `server.test.ts`, `roomFailure.test.ts`, `packages/server/src/node/server.test.ts`.
Scope: `PlayerSnapshot`, R1, R2; the room adds and removes world players; the carried protocol tests.
Server behaviour: `room.add` calls `world.addPlayer(playerId)`; `room.remove` calls `world.removePlayer(playerId)`; a takeover (`replaceConnection`) changes nothing in the world. The step passes each player's input; the room no longer relies on map order.
Tests:
1. `parseServerMessage` accepts a snapshot with players (several states: on foot, seated, on the vehicle) and rejects each malformed case in R1 (missing `players`, non-array, NaN `pos`, bad `seat`, bad `ground`, entry not an object). Unknown extra fields on a player are kept.
2. Lobby colour: `#a05cdc` accepted; `red`, `#fff`, `#GGGGGG`, `url(x)`, `""` rejected.
3. Carried: `parseClientMessage` for input: NaN, Infinity and strings in each numeric field, out-of-range `reel` and `slot`, values at the boundaries (yaw ±π, pitch ±π/2, moveX ±1) and beyond them (clamped); name length 0, 1, 16, 17 and a name with only spaces; a room noun of 24 and 25 characters; `__proto__` and `constructor` as extra fields do not appear on the parsed result and do not pollute `Object.prototype`.
4. Carried: every lobby field in `parseServerMessage` is checked (wrong type for each field rejects).
5. Server: a joining player appears in `snapshot.players` at a spawn slot; two players occupy different slots; a leaving player disappears from the list and a held driver seat frees (vehicle coasts); a player who joins mid-run gets a full snapshot that includes players.
6. Server: the driver is whoever sits in the seat: the two tests "the first player drives; the others do not" and "when the driver leaves, the next player drives" are rewritten as "the player in the driver seat drives; others do not" and "when the driver leaves, the vehicle coasts until someone boards". Inputs reach the world through the queue's tap merge: a client that sends `interact: true` in one input and `false` in the next, consumed together, boards.
7. `node/server.test.ts` "two clients share a room, and the first one drives…" is rewritten to board first with `interact`, then drive; real sockets, scripted.
Commit: `feat(server): players in the world and in snapshots; protocol checks`.

### Task 7 — client net and input
Files: `net/snapshotBuffer.ts`, `net/snapshotBuffer.test.ts`, `input/keyboard.ts`, `input/keyboard.test.ts`, `input/mouse.ts` (new), `input/mouse.test.ts` (new), `input/source.ts`.
Scope: rules C1, C2, C3; the carried snapshot-buffer test gaps.
`mouse.ts`: `createMouseLook(canvas: HTMLElement, doc: Document): { yaw(): number; pitch(): number; locked(): boolean; dispose(): void }`; it requests pointer lock on a click on the canvas.
`snapshotBuffer.sample` returns `{ vehicle: VehicleState; players: PlayerSnapshot[] } | null`. The existing callers are updated.
Tests:
1. C1 cases: players interpolate between the pair; yaw crossing ±π goes the short way; a player only in the newer snapshot is held at the newer; a player only in the older is dropped; the result is not the stored object (mutate and sample again).
2. Existing carried gaps: the clock offset's jump to an earlier snapshot; a duplicate tick; a long gap (3 s) then recovery; a rewind (tick goes backwards: ignored as not newer); first-frame time step.
3. Mouse: right movement lowers yaw; down movement lowers pitch; pitch clamps both ways; yaw wraps; no change when not locked; `dispose` removes the listeners.
4. Keyboard: W+S gives 0, A+D gives 0, Q+R gives 0; key repeat (keydown twice) keeps one press; `blur` clears; `dispose` stops it; `preventDefault` is called for each game key and not for F5, Ctrl+R or Tab; not called when Ctrl, Meta or Alt is held.
5. The keyboard and mouse sources together produce the full `InputFields` (yaw and pitch from the mouse).
Existing tests changed: `snapshotBuffer.test.ts` expectations that read `sample()` as a vehicle, `keyboard.test.ts` if its shape check breaks.
Commit: `feat(client): interpolate players, mouse look, and keyboard default prevention`.

### Task 8 — client rendering
Files: `render/playerMesh.ts` (new), `render/shoulderCamera.ts` (new), `render/shoulderCamera.test.ts` (new), `game.ts`, `ui/overlay.ts`, `ui/overlay.test.ts`, `index.html` (crosshair element and style), `main.ts` if it wires the canvas.
Scope: rules C4, C5, C6, D5.
`shoulderCamera.ts`: `cameraPlacement(head: Vec3, yaw: number, pitch: number, boxes: Box[]): { position: Vec3; target: Vec3 }` (pure). `playerMesh.ts`: `createPlayerMesh(name: string, colour: string): THREE.Group`, `placePlayerMesh(mesh, player: PlayerSnapshot): void`. `colour` is checked against `PLAYER_COLOUR_PATTERN` and falls back to the first player colour if it fails.
Tests (pure parts only): ray-versus-box with a wall 1 m behind the head gives distance about 0.8; a wall 10 m behind leaves the distance at `CAMERA_DISTANCE`; a wall closer than the minimum clamps to `CAMERA_MIN_DISTANCE`; the camera is offset to the right of the aim at yaw 0 and at yaw π/2; the target is the head along the aim; overlay lines for each state. Rendering itself is not tested; the owner checks it by eye.
Existing tests changed: `overlay.test.ts` "shows the room, the players and who drives" → states instead of "(drives)".
Commit: `feat(client): draw players, shoulder camera and crosshair`.

### Task 9 — browser test, configuration, documents
Files: `e2e/smoke.spec.ts`, `playwright.config.ts`, `ROADMAP.md`, the spec.
Scope:
- Smoke test: the first case ("two players share a room and see the same vehicle, driven by the first") becomes: both see both players listed on foot; player A presses E and the overlay shows A as driver; A holds W and the applied throttle is 1 on both pages; B's W keys leave the throttle unchanged; B boards a passenger seat with E; A presses E, leaves, and the throttle falls to 0. All numbers are read from the overlay.
- Playwright `trace: 'retain-on-failure'` (carried row).
- ROADMAP: step 3 → `done`, "Runnable today", the decisions D1 to D6 in the log, the carried rows for step 3 deleted, and the iPhone check listed as open for the owner (the page over the same Wi-Fi: it loads, renders, shows both players). Spec: amend "Spawn slots" (D1), the `World` list (D4).
Run: `npm test`, `npm run typecheck`, `npm run e2e`, `npm run build`.
Commit: `test(e2e): board, drive and leave in the smoke test` and `docs(roadmap): record step 3`.

## What the owner checks by hand
Feel and looks cannot be tested: walking, jumping and shoulder-camera feel, how players look, the crosshair, and that the page loads on a real iPhone over the LAN. Report these as unverified when the step ends.

## Known risks to watch in review
- The character controller's treatment of the vehicle's collider (a dynamic body) as an obstacle and as ground; M1 depends on it.
- Collision groups: changing `statics.ts` and `vehicle.ts` must leave every existing test unchanged.
- The real-time cost of a world with six players; measure one room at six players for 10 s of ticks and report it (no limit set).
