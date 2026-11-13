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
D6. While seated, the camera is the existing vehicle follow camera, which is what the spec's "orbits the vehicle" means for now.
D7. `respawn` events returned by `World.step` are ignored by the room until step 9 (there is no `event` message yet).
D8. The shove-out search runs along one line, away from the vehicle's centre, and may not pass through static geometry; with no free place on that line the player goes to a spawn slot.
D9. `createWorld` takes an optional third argument, a `BuiltCourse`, used instead of the id's course (tests use it to add walls and ledges). `createRig` takes the same.
D10. Seat ids are `driver`, `seat1` … `seat5`, so they cannot be confused with player ids `p1` … `p6`.
D11. There is no way onto the vehicle's roof from the ground yet (the Lodgy roof is 1.5 m up, a jump reaches 1.27 m). Tests place players there with `teleportPlayer`; props at step 5 give players something to climb.

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
| `PLAYER_CONTROLLER_OFFSET` | 0.02 | m, the character controller's skin gap |
| `PLAYER_OVERLAP_LIFT` | 0.05 | m, a capsule is lifted this much when testing it for overlap, so standing on the ground is not an overlap (covers slopes to about 29°) |
| `PLAYER_KILL_RESPAWN_DELAY` | 3 | s below the kill plane before respawning |
| `BOARD_RANGE` | 2 | m, 3D, from the feet to the nearest point of the vehicle's box |
| `DRIVER_DOOR_RANGE` | 1.5 | m, horizontal, to the driver door point, for taking the driver seat |
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

- `PlayerSnapshot.pos` and every player position are the **feet**. The capsule is `ColliderDesc.capsule(PLAYER_HEIGHT/2 − PLAYER_RADIUS = 0.55, PLAYER_RADIUS)`, a collider with no rigid body, centred `PLAYER_HEIGHT/2` above the feet and moved with `setTranslation`.
- Wish direction. With `f = (−sin yaw, 0, −cos yaw)` and `r = (cos yaw, 0, −sin yaw)`: `wish = f·moveY + r·moveX`. If its length exceeds 1 it is normalised. Wish velocity is `wish · PLAYER_WALK_SPEED`. Yaw 0 faces −Z, positive yaw turns left.
- Aim: the ray starts at `pos + (0, PLAYER_EYE_HEIGHT, 0)` and points along `(−sin yaw·cos pitch, sin pitch, −cos yaw·cos pitch)`.
- Vehicle yaw frame: the vehicle's heading about +Y only (`yawOf(rot)`), used for seat exits and spawn slots so a rolled vehicle does not tip them.
- Seat ids: `driver`, `seat1` … `seat5`.

## Vehicle config additions (`vehicles.ts`)

```ts
export interface SeatConfig {
  id: string;          // 'driver', 'seat1' … 'seat5'
  pos: Vec3;           // chassis-local, the sitting position
  side: -1 | 1;        // −1 left (−X), +1 right (+X); the door is on this side
}
// VehicleConfig gains:
seats: readonly SeatConfig[];      // seats[0] is the driver seat; at least 6 in total
spawnSlots: readonly Vec3[];       // six, in the vehicle yaw frame; y is ignored (the ground is found below)
```

| | Lodgy (half x 0.88, z 2.25) | RV (half x 1.15, z 3.4) |
|---|---|---|
| seat x | `side · 0.4` | `side · 0.55` |
| seat y | 0.1 | 0.0 |
| seat z, rows 1 to 3 | −0.7, 0.4, 1.5 | −2.2, −0.4, 1.8 |
| seat order | driver (left, row 1), seat1 (right, row 1), seat2 (left, row 2), seat3 (right, row 2), seat4 (left, row 3), seat5 (right, row 3) | same |
| spawn slots (x, z), in this order | (−2.08, −0.7), (2.08, −0.7), (−2.08, 0.4), (2.08, 0.4), (−2.08, 1.5), (2.08, 1.5) | (−2.35, −2.2), (2.35, −2.2), (−2.35, −0.4), (2.35, −0.4), (−2.35, 1.8), (2.35, 1.8) |

The driver is on the left in both vehicles.

Derived in `seats.ts`, not stored: a seat's door point is `(side · halfX, z = seat.z)` in the vehicle yaw frame, at ground level. Its own-side exit point is `(side · (halfX + SEAT_EXIT_DISTANCE), seat.z)`; the other-side exit point mirrors x.

Plan check. Slot 0 to the driver door point: 1.2 m horizontal (both vehicles), inside `DRIVER_DOOR_RANGE` 1.5. Slot 2 to it: 1.628 m (Lodgy), 2.16 m (RV), outside. Slot 0 to the vehicle's box, 3D from the feet: 1.265 m (Lodgy) and 1.30 m (RV), inside `BOARD_RANGE` 2. The chassis bottom is 0.4 m (Lodgy) and 0.5 m (RV) above the ground, higher than `PLAYER_STEP_HEIGHT`, so a player cannot walk under or up the side. A seated player's capsule is centred on the seat and sticks out of the Lodgy's roof by 0.45 m; harmless, since seated players are excluded from the shove and from slot occupancy.

## Modules and signatures

### `shared/src/groups.ts` (new)

```ts
export const GROUP_WORLD = 0x0001;   // ground, walls, vehicle chassis
export const GROUP_PLAYER = 0x0002;
export function groups(membership: number, filter: number): number   // ((membership << 16) | filter) >>> 0
```

Rapier lets two colliders interact only if `(A.membership & B.filter) && (B.membership & A.filter)`. Ground, walls and the chassis use `groups(GROUP_WORLD, GROUP_WORLD)`. Player colliders use `groups(GROUP_PLAYER, 0)`: they interact with nothing in the solver, and wheel rays ignore them. Every query by the character controller, the overlap tests and the downward spawn rays passes `groups(GROUP_WORLD, GROUP_WORLD)` as the filter groups. Changes `statics.ts` and `vehicle.ts` (the chassis collider's groups). `Vehicle` gains `readonly chassisHandle: number`.

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
export interface StepInputs { fields: InputFields; pressed: { jump: boolean; interact: boolean; drop: boolean } }
export function wishVelocity(yaw: number, moveX: number, moveY: number): { x: number; z: number }   // rule P1
export function aimRay(pos: Vec3, yaw: number, pitch: number): { origin: Vec3; dir: Vec3 }          // rule P2
export interface Players {
  add(id: string): PlayerState;                 // placed by findSpawn(id)
  remove(id: string): void;
  get(id: string): PlayerState | undefined;
  all(): PlayerState[];                         // in the order the players were added
  // One tick for every player, in join order, after the physics step: seated players are placed at their seat;
  // players on the vehicle are re-derived from localPos (M1); then shove-out (M3); then movement (P3, P4, M2). Players with no entry get neutral input.
  stepOnFoot(inputs: ReadonlyMap<string, StepInputs>): void;
  setSeat(id: string, seatId: string | null, pos?: Vec3): void;   // seating puts the player at the seat; leaving puts them at `pos`, grounded, at rest
  teleport(id: string, pos: Vec3): void;        // clears velocity, seat, ground and respawnIn; grounded false
  findSpawn(forId: string | null): Vec3;        // rules S1, S2
  findExit(seat: SeatConfig): Vec3 | null;      // rule E1
  dispose(): void;
}
export function createPlayers(rapier: Rapier, physics: RapierWorld, vehicle: Vehicle, course: BuiltCourse): Players
```

Controller setup (all from the constants): up axis +Y, `offset = PLAYER_CONTROLLER_OFFSET`, autostep `(PLAYER_STEP_HEIGHT, PLAYER_RADIUS, false)`, snap to ground `PLAYER_SNAP_DISTANCE`, max slope climb `PLAYER_MAX_SLOPE_DEG`, min slope slide `PLAYER_SLIDE_SLOPE_DEG`, no impulses on dynamic bodies.

### `shared/src/seats.ts` (new, pure)

```ts
export function seatDoorPoint(config: VehicleConfig, seat: SeatConfig, vehiclePos: Vec3, vehicleRot: Quat): Vec3
export function exitPoints(config: VehicleConfig, seat: SeatConfig, vehiclePos: Vec3, vehicleRot: Quat): [Vec3, Vec3]  // [own side, other side]
export function distanceToBox(point: Vec3, halfExtents: Vec3, pos: Vec3, rot: Quat): number   // to the nearest point of an oriented box, 0 inside
export function chooseSeat(config: VehicleConfig, vehiclePos: Vec3, vehicleRot: Quat, playerPos: Vec3, taken: ReadonlySet<string>): string | null   // rules B1 to B4
```

### `shared/src/interact.ts` (new, pure)

```ts
export type InteractAction = { kind: 'exitSeat' } | { kind: 'board'; seatId: string };
export function resolveInteract(ctx: { seat: string | null; seatChoice: string | null }): InteractAction | null
```

`seatChoice` is `chooseSeat(...)`'s result. Priority is exit seat, then board (I1). The server uses it to act; the client uses it on snapshot state for the hint. It gains fields as later steps add targets.

### `shared/src/world.ts` and `testRig.ts` changes

```ts
createWorld(rapier: Rapier, options: WorldOptions, course?: BuiltCourse): World   // D9
createRig(rapier: Rapier, vehicleId: VehicleId, spawn: Pose, course?: BuiltCourse): Rig
// World gains:
addPlayer(id: string): void;       // placed by rule S1; ids unknown to the world in step() are ignored
removePlayer(id: string): void;    // frees a held seat
teleportPlayer(id: string, pos: Vec3): void;   // also frees a held seat
// WorldSnapshot gains:
players: PlayerSnapshot[];         // in join order
```

`testRig.ts` also exports `withBoxes(course: BuiltCourse, extra: { ground?: GroundBox[]; walls?: Box[] }): BuiltCourse` (returns a new, frozen course with the boxes added) for the tests.

`step` still takes `ReadonlyMap<string, InputFields>`. A player with no entry is treated as `NEUTRAL_INPUT`. The world remembers each player's previous input (rule T1).

Tick order inside `step` (the parts of the spec's order that exist):
1. Presses are computed; interact is resolved for each player in join order (board, exit via `setSeat`).
2. Vehicle controls are set (until Task 5: from the first input in the map; from Task 5: rule V1) and the vehicle's `step` runs.
3. Physics step.
4. `players.stepOnFoot` (seated placement, vehicle frame, shove-out, movement).
5. Kill plane (rule K1), in `world.ts`, using `teleport` and `findSpawn`; the `respawn` event is returned.

### `PlayerSnapshot` (`protocol.ts`, defined in Task 3)

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
- P1. `wishVelocity` follows the convention above; its length is at most `PLAYER_WALK_SPEED`, exactly that when the input's magnitude is 1 or more.
- P2. `aimRay` follows the convention above; the direction is unit length.
- P3. Each tick, in this order: (1) a jump press while grounded sets `vy = PLAYER_JUMP_SPEED` (P4); (2) `vy -= GRAVITY·dt`, also while grounded, so the controller always has a downward contact; (3) `walk` moves toward the wish velocity by at most `PLAYER_GROUND_ACCEL·dt` (grounded) or `PLAYER_AIR_ACCEL·dt` (airborne); (4) the desired movement is `(walk + carry)·dt` horizontally and `vy·dt` vertically, through the engine's kinematic character controller; (5) if the controller reports grounded, `vy = 0` (and `carry = 0`, M2). No impulse is applied to any body.
- P4. A jump press while grounded jumps. A press while airborne does nothing. A held jump does not repeat.
- P5. Yaw and pitch are copied from the input every tick.
- P6. Players do not collide with each other.

**Isolation**
- N1. Players never change the vehicle's motion: its state after N ticks is the same (within 1e-6 m) with any number of players present, standing in its path or on it. Wheel rays ignore players.

**Standing on the vehicle and shove-out**
- M1. After the move, the player is on the vehicle if the controller reports grounded and one of its computed collisions is the vehicle's chassis collider (`vehicle.chassisHandle`) with an upward normal within `PLAYER_MAX_SLOPE_DEG` of vertical. Then `ground` is `{ bodyId: 'vehicle', localPos }` (the feet, in the vehicle's local frame). At the start of each later tick, before the player's own movement, `pos` is re-derived from `localPos` and the vehicle's current transform. A rolled vehicle uses the same formula; a player stays grounded only where the controller says the surface is walkable.
- M2. A player who leaves the vehicle (jump or walking off) gets `carry` = the horizontal part of the vehicle's velocity at the player's position (linear plus angular contribution) and keeps it until landing. Landing on static ground sets `carry` to zero; landing on the vehicle sets `ground` and zeroes `carry`.
- M3. Before a player's own movement, a player not seated and not standing on the vehicle whose capsule (lifted by `PLAYER_OVERLAP_LIFT`) overlaps the vehicle's chassis is moved out horizontally along the line from the chassis centre through the player, in steps of `SHOVE_STEP`, to the first position within `SHOVE_MAX_DISTANCE` where the capsule overlaps neither the vehicle nor any static collider, and such that the line from the old position to it crosses no static collider (D8). If none exists, the player goes to a spawn slot (S1).

**Spawn slots and exits**
- S1. `findSpawn(forId)` returns the first slot, in config order, that is valid: ground exists beneath it (a downward ray, `GROUP_WORLD` only, from 3 m above the vehicle's position, finds ground within 6 m of that start); the capsule placed there (feet at the ray hit plus `PLAYER_CONTROLLER_OFFSET`, lifted by `PLAYER_OVERLAP_LIFT`) overlaps no static collider and not the vehicle; and no other unseated player (not `forId`) stands within `2·PLAYER_RADIUS` horizontally (D1). Slot coordinates are rotated by the vehicle's yaw and added to the vehicle's position. If none is valid it returns the course's `checkpoints[0].spawn.pos` (the spec says "last checkpoint"; that is checkpoint 0 until step 8). That point is under the vehicle at the start, so M3 shoves the player out on the next tick.
- S2. `addPlayer` places the player with `findSpawn(id)`, at rest, grounded, unseated. Later players take the next free slot.
- E1. Leaving a seat places the player at the seat's own-side exit point, resolved to the ground as in S1 and valid under the same overlap test (static and vehicle; other players do not block). If it is not valid the other-side exit point is tried; if neither is, `findSpawn(id)`.
- E2. After leaving, the player is grounded, at rest, and `seat` is null.

**Seats and boarding**
- B1. If the player is in `BOARD_RANGE` and the driver seat is free and the player's horizontal distance to the driver door point is at most `DRIVER_DOOR_RANGE`, `chooseSeat` returns `driver`.
- B2. Otherwise it returns the free seat whose door point is nearest to the player horizontally (ties: lowest index in `seats`).
- B3. With every seat taken it returns null and interact does nothing.
- B4. Outside `BOARD_RANGE` it returns null.
- B5. A seated player's `pos` is the seat's world position (chassis-local `pos` through the vehicle transform) minus `PLAYER_HEIGHT/2` along world −Y; `ground` is null; their capsule moves with them. A seated player can look around and exit; moves, jumps and drops do nothing.
- I1. Interact priority: exit seat (if seated), otherwise board. Only a press acts (T1).
- V1. From Task 5: the driver's `moveY` is throttle, `moveX` steer, `jump` brake (held). With no driver: throttle 0, steer 0, brake false.
- V2. `removePlayer` frees the seat the player held; the vehicle then coasts (V1).
- V3. Two players pressing interact for the same seat on one tick: the earlier in join order gets it; the other then runs `chooseSeat` again with that seat taken (B2).

**Kill plane**
- K1. A non-seated player whose feet are below `course.killPlaneY` and who has no `respawnIn` gets `respawnIn = PLAYER_KILL_RESPAWN_DELAY`; it counts down by `dt` every tick, wherever the player is. At zero the player is teleported to `findSpawn(id)`, grounded, at rest, and `step` returns `{ kind: 'respawn', tick, playerId, pos }` with `tick` the world's tick after the increment. No respawn counter exists yet (step 9). The room ignores the event (D7).

**Presses and input**
- T1. For each player and each of `jump`, `interact`, `drop`: `pressed = current && !previous`, where `previous` is that player's input in the previous tick (neutral on the first tick). A repeated input never re-triggers.
- Q1. (server `InputQueue`) When it consumes two inputs in one tick, it returns the second with `jump`, `interact` and `drop` set to true if either consumed input had them true, but stores the unmerged second as `last` for later repeats. It returns copies, never its stored objects.
- W1. A non-finite number in an input is treated as 0 (already so for the vehicle; extend to yaw, pitch and the new fields).

**Protocol and client**
- R1. `parseServerMessage` rejects a snapshot whose `players` is missing or not an array, or whose entries lack finite `pos`, finite `yaw`, a string `playerId`, a `seat` that is neither string nor null, or a `ground` that is neither null nor `{ bodyId: string, localPos: Vec3 }`.
- R2. `parseServerMessage` rejects a lobby entry whose `colour` does not match `PLAYER_COLOUR_PATTERN`. The server's own colours match it.
- C1. Snapshot buffer: `sample(now)` returns `{ vehicle, players }`; each player in the newer snapshot is interpolated with the same older/newer pair as the vehicle (position lerp, yaw by the shorter way round). A player missing from the older snapshot is held at the newer one's value; one missing from the newer is dropped. The result never aliases stored objects.
- C2. Mouse look: while the pointer is locked on the canvas, `movementX` and `movementY` turn the view: `yaw -= movementX · LOOK_SENSITIVITY` (moving right turns right), `pitch -= movementY · LOOK_SENSITIVITY`, pitch clamped to ±(π/2 − 0.05), yaw wrapped to (−π, π]. Without pointer lock the view stays still.
- C3. Keyboard: `preventDefault` on keydown and keyup for game keys (WASD, Space, E, F, Q, R, G, 1 to 3) and not for others (F5, Ctrl+R, F12, Tab); with Ctrl, Meta or Alt held the key is left alone.
- C3b. A key pressed and released between two samples is still reported true in the next sample, once (so a quick tap of E acts).
- C4. Shoulder camera. The pivot is the head: `pos + (0, PLAYER_EYE_HEIGHT, 0)`. The camera sits `CAMERA_DISTANCE` behind the aim direction and `CAMERA_SHOULDER` to the right, looking along the aim. A ray from the pivot toward the camera against the course's ground and wall boxes shortens the distance to the first hit minus `CAMERA_WALL_MARGIN`, never below `CAMERA_MIN_DISTANCE`. While the local player is seated, the existing vehicle follow camera is used (D6).
- C5. Rendering: each player in the snapshot is a capsule body plus a sphere head in their lobby colour (checked against `PLAYER_COLOUR_PATTERN`, else the first player colour), with the name as a sprite above it (drawn onto a canvas with `fillText`, never HTML). Seated players are not drawn. The local player is drawn too. A centred cross-shaped crosshair is an HTML element over the canvas, shown on foot and hidden seated.
- C6. Overlay: the players line shows each name with its state (`on foot`, `driver`, `seat1` …); the "(drives)" logic goes. One line shows the hint for the local player: `E to board`, `E to leave the seat`, or nothing, decided by `interactHint` using `resolveInteract` and `chooseSeat` on the interpolated snapshot state. A plain overlay line until the HUD step.

## Tasks

Each task: the implementer writes the listed tests first, then the code; then a review subagent. Commit with the scope shown after the full `npm test` and `npm run typecheck` pass. Every task must leave every earlier test passing; where a task changes an existing test it is named.

### Task 1 — constants, vehicle config, collision groups (`shared`)
Files: `constants.ts`, `vehicles.ts`, `groups.ts` (new), `statics.ts`, `vehicle.ts` (chassis groups, `chassisHandle`), `index.ts` (export `groups`), tests in `vehicle.test.ts` (the existing home of the config tests) and `groups.test.ts` (new).
Tests:
1. Both configs have at least 6 seats; `seats[0].id === 'driver'` and it is on the left; ids are unique and are `driver`, `seat1` … `seat5`.
2. Every seat position lies inside the chassis box; every seat's `side` matches the sign of its `x`.
3. Six spawn slots per vehicle; each lies outside the chassis box horizontally by at least 1 m; none coincide.
4. Slot 0 is within `DRIVER_DOOR_RANGE` of the driver door point and slot 2 is beyond it (both vehicles).
5. Config and constants are frozen (extend "shared course and vehicle data cannot be modified" in `world.test.ts`, and `math.test.ts` if it covers constants).
6. `groups(1, 1)` and `groups(2, 0)` give the packed values `0x00010001` and `0x00020000`; two group pairs interact only by Rapier's rule (a small test with real colliders: a player-group collider and a world-group collider do not collide; two world-group colliders do).
7. Existing vehicle tests pass unchanged (wheel rays still hit the ground).
Commit: `feat(shared): player constants, seats and spawn slots in the vehicle configs`.

### Task 2 — input queue (`server`)
Files: `packages/server/src/room/inputQueue.ts`, `inputQueue.test.ts`.
Tests:
1. Two inputs consumed in one tick where only the first has `interact` true: the returned input has `interact` true; its other fields are the second's.
2. Same for `jump` and `drop`; axes, yaw, pitch, `use`, `reel`, `slot` are the second's.
3. One input consumed: returned unchanged.
4. The returned object is not the stored object: mutating it changes no later `next()` result (repeat and fresh cases).
5. Neutral substitution after `NEUTRAL_AFTER_TICKS` still works and keeps yaw, pitch and slot.
6. After a merged tick, an empty queue repeats the unmerged second input (`interact` false), so a later real press is read as a new press.
Commit: `fix(server): keep taps when the input queue consumes two inputs, and return copies`.

### Task 3 — walking, jumping, spawn slots, kill plane, players in snapshots (`shared`, `server` hooks)
Files: `player.ts`, `world.ts`, `testRig.ts` (`createRig` course argument, `withBoxes`), `protocol.ts` (`PlayerSnapshot`, `WorldSnapshot.players`), `index.ts`; `packages/server/src/room/room.ts` (`room.add` calls `world.addPlayer`, `room.remove` calls `world.removePlayer`); tests in `player.test.ts` (new), `world.test.ts`, `room/server.test.ts`.
Scope: rules P1 to P6, S1, S2, K1, T1, W1 and the `players` snapshot field. Seats and vehicle carrying are later tasks. The world still drives the vehicle from the first input in the map (Task 5 changes that), so every walking test puts a neutral dummy entry first: `new Map([['nobody', NEUTRAL_INPUT], [id, walk]])`; unknown ids are ignored.
Tests:
1. `wishVelocity`: forward at yaw 0 is (0, −4.5); at yaw π/2 it is (−4.5, 0); strafe right at yaw 0 is (4.5, 0); full diagonal input has length 4.5; zero input is zero.
2. `aimRay`: origin is feet plus eye height; yaw 0, pitch 0 gives direction (0, 0, −1); pitch π/4 gives positive y; direction length 1.
3. A player added to a Lodgy world is at slot 0 (rotated by the vehicle's yaw, vehicle at the course start), on the ground (`pos.y` within 0.05 of 0), unseated.
4. Six players take six different slots, in order.
5. With slot 0 blocked by a wall box (`withBoxes`, centre = slot 0's world position + (0, 1, 0), half extents (0.5, 1, 0.5)) the player takes slot 1; with all six slots blocked likewise the player is at `checkpoints[0].spawn.pos`.
6. Walking forward from rest for 60 ticks covers 4.1 to 4.5 m (expected 4.28) on flat road; releasing stops within 0.2 s.
7. The test teleports the player to `slopePose(slope, 1)` (a position on the slope, facing uphill: yaw 0) and walks forward 4 s: on the 25° slope the player gains at least 4 m of height; on the 8° slope at least 2 m.
8. A wall box taller than `PLAYER_STEP_HEIGHT` ahead of the player stops them; a ground box 0.2 m high does not stop them.
9. Jump: apex between 1.15 and 1.3 m above the take-off; back on the ground after 1.0 to 1.1 s; holding jump for 3 s gives one jump; pressing in the air does nothing; `vy` is 0 after landing.
10. A repeated input (the same `jump: true` for 10 ticks) gives exactly one jump; releasing and pressing again gives a second.
11. Airborne, the horizontal `walk` velocity changes by no more than `PLAYER_AIR_ACCEL·dt` per tick.
12. Two players at the same spot do not move each other.
13. Kill plane: teleport a player to y = `killPlaneY − 1`; at 2.9 s later they have not respawned, at 3.1 s they are at a slot, and `step` returned exactly one `respawn` event with the right `playerId` and `tick`.
14. `teleportPlayer` clears velocity and `respawnIn`.
15. Non-finite `yaw`, `pitch`, `moveX`, `moveY` in an input do no lasting harm (position stays finite).
16. `snapshot().players` lists players in join order with `seat: null` and `ground: null`; `removePlayer` removes the entry.
17. Server: a joining player appears in `snapshot.players` at a spawn slot; two players occupy different slots; a leaving player disappears from the list; a player who joins mid-run gets a full snapshot that includes players.
Existing tests changed: `client/src/net/snapshotBuffer.test.ts` (its snapshot helper gains `players: []`); no others are expected.
Commit: `feat(shared): players on foot with spawn slots, jumping and kill-plane respawn`.

### Task 4 — standing on the vehicle, take-off, shove-out (`shared`)
Files: `player.ts`, tests in `player.test.ts`.
Scope: rules M1 to M3 and N1's wheel-ray part. The tests build the physics world, statics, vehicle and players directly with `createPlayers(...)` (using `createRig` for the world and vehicle). Per tick the test calls `vehicle.step({ throttle: 0, steer: 0, brake: false })`, `physics.step()`, `players.stepOnFoot(map)`. The rig first runs 1 s so the vehicle settles; the roof is at the settled `vehicle.body` height plus `halfExtents.y`.
Tests:
1. A player teleported 0.1 m above the Lodgy's roof lands and has `ground.bodyId === 'vehicle'`.
2. Walking on the roof from its centre for 0.5 s (vehicle still) moves `localPos` by 1.9 to 2.25 m along the vehicle's axis; walking on to the end drops the player to the ground with `ground` null.
3. Take-off carry: with the vehicle's linear velocity set to 10 m/s forward (`body.setLinvel` each tick), a player on the roof who jumps gets `carry` of about 10 m/s along the vehicle's forward direction (within 0.2) and `ground` null.
4. Shove-out: a stationary player 1.5 m ahead of the Lodgy's front face, the vehicle driven at 5 m/s toward them: at the end of every tick the player is outside the chassis box; at the end they are ahead of the front face; no NaN. With a wall box (centre (0, 1, zp − 3.1), half extents (3, 1, 3), where zp is the player's z) just behind the player, the player is never inside the wall or the chassis, and ends at a spawn slot (no free place on the line).
5. A rolled vehicle (rotation 90° about Z, centre at y = 0.88 + 0.1 above the ground): a player teleported onto its upward-facing side is grounded on the vehicle; a player standing beside it on the ground is not; no throw and no NaN.
6. N1 (wheel rays): a player standing in the path of a driven vehicle does not make the chassis rise or tilt: while the vehicle passes through them, the chassis centre's y stays within 0.02 m of its settled value.
Commit: `feat(shared): carry players on the vehicle and shove them out of its way`.

### Task 5 — seats, boarding, driving (`shared`, `server`)
Files: `seats.ts`, `interact.ts`, `player.ts`, `world.ts`, `index.ts`; tests in `seats.test.ts`, `interact.test.ts`, `player.test.ts`, `world.test.ts`, `scenarios.test.ts`, `room/server.test.ts`, `node/server.test.ts`.
Scope: rules B1 to B5, I1, V1 to V3, E1, E2. The world's driver is now the player in the `driver` seat.
Tests:
1. `distanceToBox`: 0 inside; the face distance in front of a face; the corner distance beyond a corner; a rotated box.
2. `chooseSeat`: B1 (a player at slot 0 gets `driver`); B1 with the driver seat taken (nearest free seat); B2 nearest door; B3 all taken gives null; B4 out of range gives null; a tie goes to the lower index.
3. `resolveInteract`: seated gives exitSeat; not seated with a choice gives board; neither gives null.
4. In the world: a player at slot 0 presses interact and sits in the driver seat; a second player at slot 1 presses interact and takes `seat1`.
5. Holding interact does one action only.
6. V3: two players at the same spot (the second teleported to slot 0's position), both pressing on one tick: the first in join order gets `driver`, the second gets `seat2` (its door is 1.63 m away against 2.96 m for `seat1`).
7. The driver's `moveY: 1` accelerates the vehicle; a passenger's `moveY: 1` does not; coasting: the driver drives to about 10 m/s, exits, and 2 s later the vehicle's speed is above 90% of its speed at the exit.
8. N1: the vehicle's state after 300 ticks of full throttle is the same (within 1e-6 m) with three extra players standing beside it, one standing in its path and one on the roof (teleported), as with none.
9. Exit: interact while seated places the player at the own-side exit point (horizontal distance within 0.05 m); with a wall box over that point, on the other side; with both blocked, at a spawn slot. Afterwards the seat is free and `seat` is null.
10. `removePlayer` of the driver frees the seat and the vehicle coasts.
11. A seated player's `pos` follows the vehicle while it is driven and they are not shoved.
12. A seated player's walk and jump inputs do nothing.
13. Roof ride: Lodgy at full throttle for 6 s from rest, a second player teleported onto the roof giving no input: their `localPos` changes by less than 0.05 m and they are still on the vehicle at the end. Jump and land: the driver releases the throttle at about 10 m/s, the roof player jumps; after landing `ground` is set again and `localPos` is within 1.5 m of the take-off `localPos`.
14. Scenario: a scripted two-player run: player 1 boards the driver seat, player 2 a passenger seat, player 1 drives the Lodgy to z ≤ −100 in under 40 s (the finish rule itself comes at step 8).
15. Determinism: the same sequence of inputs, including boarding, gives the same snapshot (`JSON.stringify` equal).
16. Server (`room/server.test.ts`): "the first player drives; the others do not" becomes "the player in the driver seat drives; the others do not" (the first player boards by sending `interact: true` at slot 0, which is free at the start); "when the driver leaves, the next player drives" becomes "when the driver leaves, the vehicle coasts until someone boards"; "a silent driver stops pressing the pedal after the neutral-input delay" becomes "a silent seated driver…" (board first); a new test: a client that sends `interact: true` then `false` in two inputs consumed together (queue holding at least 4 inputs) boards.
17. Server (`node/server.test.ts`): "two clients share a room, and the first one drives the vehicle both see" becomes: the first client boards with `interact`, then drives, both see the vehicle move (real sockets, scripted).
Existing tests changed: `world.test.ts` ("the first input in the map drives…", "the same inputs produce the same snapshot", "an input that is not a finite number…": seat a driver first); the four server tests above. `vehicle.test.ts` and `scenarios.test.ts` do not use `createWorld` and need no change; any other test that fails is reported to the main session, not fixed silently.
Commit: `feat(shared): seats, boarding and driving by the driver seat`.

### Task 6 — protocol checks (`shared`)
Files: `protocol.ts`, `protocol.test.ts`.
Scope: R1, R2; the carried protocol tests.
Tests:
1. `parseServerMessage` accepts a snapshot with players (on foot, seated, on the vehicle) and rejects each malformed case in R1 (missing `players`, non-array, NaN `pos`, bad `seat`, bad `ground`, entry not an object). Unknown extra fields on a player are kept.
2. Lobby colour: `#a05cdc` accepted; `red`, `#fff`, `#GGGGGG`, `url(x)`, `""` rejected.
3. `parseClientMessage` for input: non-finite values are rejected (the tests send raw text such as `1e999`, since JSON cannot hold NaN or Infinity) for each numeric field; strings in each numeric field are rejected; out-of-range `reel` and `slot` are rejected; moveX and moveY beyond ±1 are clamped; pitch beyond ±π/2 is clamped; yaw beyond ±π is wrapped; values exactly at the boundaries pass; names of length 0, 1, 16, 17 and a name of only spaces; a room noun of 24 and 25 characters; `__proto__` and `constructor` as extra fields do not appear on the parsed result and do not pollute `Object.prototype`.
4. Every lobby field in `parseServerMessage` is checked (a wrong type for each field rejects).
Commit: `test(shared): check player snapshots and tighten the protocol tests`.

### Task 7 — client net and input
Files: `net/snapshotBuffer.ts`, `net/snapshotBuffer.test.ts`, `loop.test.ts`, `input/keyboard.ts`, `input/keyboard.test.ts`, `input/mouse.ts` (new), `input/mouse.test.ts` (new), `input/combined.ts` (new), `input/combined.test.ts` (new).
Scope: rules C1, C2, C3, C3b; the step-4 carried test gaps that belong here.
`mouse.ts`: `createMouseLook(canvas: HTMLElement, doc: Document): { yaw(): number; pitch(): number; locked(): boolean; dispose(): void }`; it requests pointer lock on a click on the canvas. `combined.ts`: `createInputSource(keyboard: InputSource, mouse: { yaw(): number; pitch(): number; dispose(): void }): InputSource`, whose `sample()` is the keyboard's fields with the mouse's yaw and pitch.
`snapshotBuffer.sample` returns `{ vehicle: VehicleState; players: PlayerSnapshot[] } | null`; callers are updated.
Tests:
1. C1 cases: players interpolate between the pair; yaw crossing ±π goes the short way; a player only in the newer snapshot is held at the newer; one only in the older is dropped; the result is not the stored object (mutate and sample again).
2. Carried gaps: the clock offset's jump to an earlier snapshot; a duplicate tick; a long gap (3 s) then recovery; a rewind (tick goes backwards: ignored). In `loop.test.ts`: the first frame's time step is never negative.
3. Mouse: right movement lowers yaw; down movement lowers pitch; pitch clamps both ways; yaw wraps; no change when not locked; `dispose` removes the listeners.
4. Keyboard: W+S gives 0, A+D gives 0, Q+R gives 0; key repeat (keydown twice) keeps one press; `blur` clears; `dispose` stops it; `preventDefault` is called for each game key and not for F5, Ctrl+R or Tab, and not when Ctrl, Meta or Alt is held; C3b: keydown and keyup between two samples gives one true sample for `interact`, then false.
5. The combined source gives the full `InputFields`, with yaw and pitch from the mouse.
Existing tests changed: `snapshotBuffer.test.ts` expectations that read `sample()` as a vehicle; `keyboard.test.ts` only if its shape check breaks.
Commit: `feat(client): interpolate players, mouse look, and keyboard default prevention`.

### Task 8 — client rendering
Files: `render/playerMesh.ts` (new), `render/shoulderCamera.ts` (new), `render/shoulderCamera.test.ts` (new), `game.ts`, `main.ts`, `ui/overlay.ts`, `ui/overlay.test.ts`, `index.html` (crosshair element and style).
Scope: rules C4, C5, C6, D5.
Signatures:
- `cameraPlacement(head: Vec3, yaw: number, pitch: number, boxes: Box[]): { position: Vec3; target: Vec3 }` (pure).
- `createPlayerMesh(name: string, colour: string): THREE.Group`; `placePlayerMesh(mesh: THREE.Group, player: PlayerSnapshot): void`.
- `createGame(view: GameView, playerId: string, firstLobby: LobbyMessage, send: (m: ClientMessage) => void): Game`; `main.ts` passes the `welcome` message's `playerId`.
- `OverlayData` = `{ lobby; tick; fps; vehicle: VehicleState | null; players: PlayerSnapshot[]; localId: string }`.
- `interactHint(config: VehicleConfig, vehicle: VehicleState, local: PlayerSnapshot, players: PlayerSnapshot[]): string | null` in `ui/overlay.ts`, using `resolveInteract` and `chooseSeat`.
Tests (pure parts only): ray against a wall 1 m behind the head gives a distance of about 0.8; a wall 10 m behind leaves `CAMERA_DISTANCE`; a wall closer than the minimum clamps to `CAMERA_MIN_DISTANCE`; the camera is right of the aim at yaw 0 and at yaw π/2; the target lies along the aim from the head; overlay lines for each state; `interactHint` for each case (near the driver door: board; seated: leave; far away: none; all seats taken: none). Rendering itself is not tested; the owner checks it by eye.
Existing tests changed: `overlay.test.ts` "shows the room, the players and who drives" → states instead of "(drives)".
Commit: `feat(client): draw players, shoulder camera and crosshair`.

### Task 9 — browser test, configuration, documents
Files: `e2e/smoke.spec.ts`, `playwright.config.ts`, `ROADMAP.md`, the spec.
Scope:
- Smoke test: the first case becomes: both pages list both players on foot; A presses E (keydown, 100 ms wait, keyup) and the overlay shows A as `driver`; A holds W and the applied throttle is 1 on both pages; B's W keys leave the throttle unchanged; B boards a seat with E; A presses E and leaves, and the throttle falls to 0. All numbers are read from the overlay.
- Playwright `trace: 'retain-on-failure'` (carried row).
- ROADMAP: step 3 → `done`; "Runnable today"; D1 to D11 in the decisions log; delete the step-3 carried rows; edit the step-4 row so it no longer lists the first-frame time step and the snapshot-buffer gaps done in Task 7, keeping "Test `ackSeq` through the neutral substitute"; list the iPhone check as open for the owner (the page over the same Wi-Fi: it loads, renders, shows both players). Spec: amend "Spawn slots" (D1), the `world` list (D4), and note D6.
Run: `npm test`, `npm run typecheck`, `npm run e2e`, `npm run build`.
Commits: `test(e2e): board, drive and leave in the smoke test`, then `docs(roadmap): record step 3`.

## What the owner checks by hand
Feel and looks cannot be tested: walking, jumping and shoulder-camera feel, how players look, the crosshair, and that the page loads on a real iPhone over the LAN. Report these as unverified when the step ends.

## Known risks to watch in review
- The character controller's treatment of the vehicle's collider (a dynamic body) as an obstacle and as ground; M1 depends on it. The reviewer of Task 4 checks it against the installed Rapier 0.21 API.
- Collision groups: the `statics.ts` and `vehicle.ts` changes must leave every existing test unchanged.
- The real-time cost of a world with six players: measure one room at six players for 10 s of ticks and report it (no limit set).
