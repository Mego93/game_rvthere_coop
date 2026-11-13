# Step 5: Push, hands, light debris, heavy obstacles, prop kill plane

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md` (sections "Players", "Hands and inventory", "Crew actions", "Push", "Player physics", "Interact resolution", "Snapshot", "Prediction", "Collision"). This plan fixes interfaces, constants, rules and test cases. Implementers write the tests first, then the code. Where the plan and the spec disagree, or neither answers a question, stop and report (CLAUDE.md, "When something is not specified").

## Goal

The test ground gains three light crates and one heavy barrier. Players push the vehicle and props by walking into them, pick up a crate with interact and throw it with interact, stand on props and are carried by them, and are shoved out of a prop's way. A heavy barrier moves only while enough players push it. A prop that falls below the kill plane returns to its spawn. The page draws the props and the predictor blocks the local player on them.

Not in this step: the winch and the hook in the hands (6), inventory, drop, pickups (7), events (9), the interact prompt (12).

## Decisions made in this plan (log them in `ROADMAP.md` in the last task)

F1. Prop kinds are a table in `constants.ts` (`PROP_KINDS`), each with a class (`light` or `heavy`), half extents, mass and friction. A course's `props` list places them; `Placed.kind` is a key of the table. A prop's `pose.pos` is the centre of its box's **bottom face** (on the ground), like every other placed thing.
F2. Push force per player is `min(PUSH_FORCE, mass · PUSH_MAX_ACCEL)` along the move input, scaled by the input's magnitude (at most 1). On the vehicle, while its up vector is more than 45° from world up, `PUSH_FORCE_TIPPED` replaces `PUSH_FORCE`. Measured before planning: four pushers at 1500 N cannot roll a Lodgy lying on its side; it rights at about 14 kN in total, and 1500 N per player is already a firm shove on a level Lodgy (0.85 m/s² net on road). Spec "Push" is amended.
F3. The contact point is the point of the body's box nearest to the player's push point, `feet + (0, PUSH_HEIGHT, 0)`. "Into the surface" means the move direction has a positive dot product with the horizontal direction from the push point to the contact point.
F4. Push intents are found while moving characters (tick step 4) and applied as impulses (`force · TICK_DT` at the contact point) at step 2 of the next tick, then cleared. One tick of delay is accepted.
F5. A heavy obstacle's rotations are always locked. While locked, its X and Z translations are locked too (Y stays free, so it rests under gravity). It unlocks for a tick when the number of distinct players pushing it reaches `requiredPushers(playerCount)`; when it locks again its X and Z velocity is zeroed. With rotations locked, a pushed barrier slides instead of tipping. Spec "Push" is amended.
F6. Pushing does not free the RV from sand from rest: the held brake resists up to sand's rolling resistance (about 9200 N), more than four pushers give. The winch (step 6) frees it. Spec table "Vehicles", row "Soft sand", is amended to "the winch frees it".
F7. "Standing on" generalises from the vehicle to any dynamic body: `GroundRef.bodyId` is `'vehicle'` or a prop id. Carrying, take-off velocity and the roof guard (D12, now "top guard") apply to props as to the vehicle. Prediction stays off while `ground` is non-null, as the spec says.
F8. Shove-out applies to any dynamic body overlapping a player: the vehicle first, then props in course order; the line runs away from that body's centre.
F9. A held prop is a kinematic position-based body with collision groups 0 (it collides with nothing and no query sees it), placed each tick at the holder's hold pose after characters move. Released, it becomes dynamic again with its groups restored.
F10. Interact candidates of priority 5 are compared by the angle between the aim direction and the direction from the eye to the candidate box's nearest point to the eye (0 when the eye is inside the box). Ties go to boarding, then props in course order.
F11. The server sends `props` as every prop whose position or rotation changed by more than `PROP_MOVED_EPSILON` since the previous broadcast, and all props in a `full` snapshot. The room, not the world, makes this comparison; `World.snapshot()` lists every prop.
F12. A prop held by any player is not in the predictor (it collides with nothing on the server either).

## Constants (`constants.ts`, block "Props and push")

| Name | Value | Meaning |
|---|---|---|
| `PROP_KINDS` | see below | per kind: `class`, `halfExtents`, `mass`, `friction` |
| `PUSH_FORCE` | 1500 | N per player |
| `PUSH_FORCE_TIPPED` | 4000 | N per player on a vehicle tipped more than 45° |
| `PUSH_MAX_ACCEL` | 10 | m/s²; caps the force on light things: `mass · PUSH_MAX_ACCEL` |
| `PUSH_HEIGHT` | 1.0 | m above the feet, where a player pushes |
| `PUSH_MAX_PUSHERS_VEHICLE` | 4 | pushers counted on the vehicle, in join order |
| `HANDS_RANGE` | 2 | m, from the feet to the nearest point of a prop's box |
| `HOLD_OFFSET` | `vec3(0, 1.1, -0.75)` | m, a held prop's centre in the holder's yaw frame, from the feet |
| `THROW_SPEED` | 7 | m/s along the aim, added to the holder's horizontal velocity (`walk + carry`) |
| `PROP_MOVED_EPSILON` | 1e-4 | m or quaternion component; a smaller change is not sent |

`PROP_KINDS` (deep-frozen; `PropKind = keyof typeof PROP_KINDS`):

| Kind | class | halfExtents | mass | friction |
|---|---|---|---|---|
| `crate` | light | (0.3, 0.3, 0.3) | 15 | 0.6 |
| `barrier` | heavy | (1.0, 0.5, 0.4) | 150 | 0.5 |

Arithmetic check (Rapier averages friction coefficients; ground is 1): barrier on road slides at `0.75 · 150 · 9.81 = 1104 N` < 1500 N, so one pusher moves it when unlocked (2.6 m/s² net). Crate push force `min(1500, 150) = 150 N` against `0.8 · 15 · 9.81 = 118 N` friction: it slides slowly. Lodgy on road: `1500 − 221 = 1279 N` net for one pusher. RV on road: `1500 − 552 = 948 N`, 0.25 m/s². Lodgy on its side: four pushers at 4000 N right it, three do not (scratch experiment with ideal contact; Task 3's scenario test is the real check).

`requiredPushers(playerCount)`: 1 for 0 or 1, 2 for 2–3, 3 for 4 or more. Exported from `push.ts`.

## Test ground additions (`courses/testGround.ts`)

```
props: [
  { id: 'crate-1', kind: 'crate', pose: { pos: (10, 0, 8),  rot: IDENTITY } },
  { id: 'crate-2', kind: 'crate', pose: { pos: (10, 0, 9.5), rot: IDENTITY } },
  { id: 'crate-3', kind: 'crate', pose: { pos: (10, 0, 11), rot: IDENTITY } },
  { id: 'barrier-1', kind: 'barrier', pose: { pos: (-10, 0, 10), rot: IDENTITY } },
]
```

Behind the start (+Z), clear of the driving line, spawn slots, ramp, slopes and sand. `testGround.test.ts` gains: every prop's kind is in `PROP_KINDS`, ids are unique, and each prop rests on ground.

## Modules and signatures

### `shared/src/props.ts` (new)

```ts
export type PropClass = 'light' | 'heavy';
export interface PropSnapshot { id: string; kind: string; pos: Vec3; rot: Quat }   // pos: the box centre
export interface Prop {
  readonly id: string; readonly kind: PropKind; readonly config: PropKindConfig;
  readonly body: RigidBody; readonly colliderHandle: number;
  heldBy: string | null;
  locked: boolean;            // heavy only; always false for light
}
export interface Props {
  all(): Prop[];                                   // course order
  get(id: string): Prop | undefined;
  byCollider(handle: number): Prop | undefined;
  hold(id: string, playerId: string): void;        // F9
  release(id: string, pos: Vec3, rot: Quat, linvel: Vec3): void;   // dynamic again, groups restored, angvel 0
  setLocked(id: string, locked: boolean): void;    // F5; no-op on light props
  resetToSpawn(id: string): void;                  // spawn pose, at rest, released, heavy locked
  killPlane(killPlaneY: number): string[];         // resets unheld props whose centre is below; returns their ids
  snapshot(): PropSnapshot[];                      // every prop, course order
}
export function createProps(rapier: Rapier, physics: RapierWorld, course: BuiltCourse): Props
export function propCentre(placed: Placed, config: PropKindConfig): Vec3   // pose.pos + rotate(rot, (0, half.y, 0))
```

Bodies are dynamic, `setCanSleep(true)`, mass from the kind via `setAdditionalMassProperties` with the box inertia as in `vehicle.ts` (collider density 0), collider `cuboid(half)` with the kind's friction and `groups(GROUP_WORLD, GROUP_WORLD)`. Heavy props start locked.

### `shared/src/push.ts` (new)

```ts
export interface PushIntent { playerId: string; bodyId: 'vehicle' | string; point: Vec3; force: Vec3 }
export function requiredPushers(playerCount: number): number
export function contactPoint(pushPoint: Vec3, centre: Vec3, rot: Quat, half: Vec3): Vec3   // F3
// Rules H1–H3: the force for one player, or null when the move does not point into the surface.
export function pushForce(wish: { x: number; z: number }, pushPoint: Vec3, contact: Vec3, mass: number, tipped: boolean): Vec3 | null
```

### `player.ts` changes

- `GroundRef.bodyId: 'vehicle' | string` (F7). `PlayerState` gains `hands: string | null` (a prop id).
- `createPlayers(rapier, physics, vehicle, props, course)` — the new `props` argument.
- `Players` gains `takePushIntents(): PushIntent[]` (returns and clears the intents gathered by the last `stepOnFoot`), and `holdPose(id): Pose | null` (the hold pose of a player's held prop).
- The world's `touching(feet)` returns the first overlapped dynamic body (`'vehicle'`, a prop id, or null) and whether statics overlap; "statics" means any collider that is neither the chassis nor a prop.

### `interact.ts`

```ts
export type InteractAction =
  | { kind: 'exitSeat' }
  | { kind: 'throw' }
  | { kind: 'board'; seatId: string }
  | { kind: 'pickUp'; propId: string };
export interface InteractCandidate { action: { kind: 'board'; seatId: string } | { kind: 'pickUp'; propId: string }; angle: number }
export function resolveInteract(ctx: { seat: string | null; hands: string | null; candidates: readonly InteractCandidate[] }): InteractAction | null
export function aimAngleToBox(origin: Vec3, dir: Vec3, centre: Vec3, rot: Quat, half: Vec3): number   // F10
```

The existing call shape `{ seat, seatChoice }` is replaced; `interact.test.ts` changes with it.

### `world.ts`

`WorldSnapshot` gains `props: PropSnapshot[]` (every prop). `PlayerSnapshot` gains `hands: string | null`. `World` gains no method: tests read props through `snapshot()` and set prop poses or velocities through a test-only `World.debugBody(id: 'vehicle' | string): RigidBody | undefined`, added to `World` beside `debug()`.

### `protocol.ts`

`PlayerSnapshot.hands: string | null`; `SnapshotMessage.props: PropSnapshot[]` (moved or full, F11). `parseServerMessage` rejects a snapshot whose `props` is not an array of `{ id: string, kind: string, pos: Vec3, rot: Quat }`, or a player whose `hands` is neither null nor a string.

### `predictor.ts`

`Predictor.setProps(props: readonly PropSnapshot[]): void` — creates, moves or removes stand-ins by id: dynamic boxes at gravity scale 0 with the kind's half extents (unknown kinds are skipped), collider `groups(GROUP_WORLD, GROUP_WORLD)`, then two zero-length steps as `setVehicle` does.

### Client

- `net/snapshotBuffer.ts`: keeps a running prop map; a `full` snapshot replaces it, otherwise listed props update it; each stored snapshot holds the merged list. `sample` returns `props: PropSnapshot[]` interpolated by id (lerp `pos`, nlerp `rot`; a prop absent from the older one is taken from the newer). `push(snapshot: SnapshotMessage | WorldSnapshot & { full?: boolean; props })`: the argument type becomes `SnapshotMessage`; existing callers and tests pass one.
- `render/propMesh.ts` (new): `createPropMesh(kind): THREE.Object3D` (crate: brown box; barrier: red-and-white box; unknown: grey box, all sized from `PROP_KINDS` when known), `placePropMesh(mesh, prop)`.
- `game.ts`: draws props from the sample; a prop in a player's `hands` is drawn at that player's drawn hold pose (the predicted position for the local player). Each snapshot: `predictor.setProps(latest merged props minus held ones)` after `setVehicle`.

## Behaviour rules

Push
- H1. A player pushes a body when, during their move this tick, the character controller reported a collision with that body's collider whose `normalY` is below `cos(PLAYER_MAX_SLOPE_DEG)` (a side, not a floor), the player's wish velocity is non-zero, the body is not the player's ground body, and the body is not a held prop.
- H2. Contact point per F3 using the body's current centre, rotation and half extents. The push applies only if `dot(wishDir, normalise(horizontal(contact − pushPoint))) > 0`; if the horizontal part is shorter than 1e-6 it does not apply.
- H3. Force = `wishDir · min(base, mass · PUSH_MAX_ACCEL) · min(1, |wish| / PLAYER_WALK_SPEED)`, horizontal. `base` is `PUSH_FORCE_TIPPED` for the vehicle while `rotate(rot, Y).y < cos 45°`, otherwise `PUSH_FORCE`. One intent per player per body per tick (the first collision with it).
- H4. At tick step 2: for the vehicle, the intents of the first `PUSH_MAX_PUSHERS_VEHICLE` players in join order apply. For a heavy prop, the number of distinct pushing players is compared with `requiredPushers(players in the world)`: at or above it, the prop unlocks for this tick and every intent applies; below it, it is locked (F5) and none applies. A heavy prop with no intents is locked. For a light prop every intent applies. Each intent applies `force · TICK_DT` with `applyImpulseAtPoint`.
- H5. A seated player pushes nothing.

Hands
- K1. Interact on foot, not holding: candidates are boarding (as step 3: `chooseSeat`, angle to the vehicle's box) and each unheld light prop within `HANDS_RANGE` of the feet (nearest point of its box). The smallest angle wins (F10). Priority order is: exit seat, throw, then the candidates.
- K2. Picking up sets `hands` and calls `props.hold`. Two players pressing for one crate on one tick: the earlier in join order gets it.
- K3. Interact while holding throws: release at the hold pose (`feet + rotate(yawQuat, HOLD_OFFSET)`, rotation the yaw quaternion) with velocity `aimDir · THROW_SPEED + (walk + carry, 0)`. If the box at the hold pose would overlap anything in `GROUP_WORLD` (statics, chassis, other props), it is released instead at `feet + (0, PLAYER_HEIGHT + half.y + 0.05, 0)` with the same velocity.
- K4. After characters move (tick step 4), every held prop is placed at its holder's hold pose (`setTranslation`, `setRotation`, velocity zero).
- K5. Boarding while holding releases the prop at the hold pose (K3's fallback applies) with zero velocity, before seating.
- K6. A player who respawns from the kill plane: their held prop returns to its spawn (`resetToSpawn`), `hands` null. `removePlayer`: the held prop is released at the hold pose with zero velocity. `teleportPlayer` keeps the prop in the hands.

Standing, carrying, shove
- G1. `ground` is set when the player is grounded and a collision with the chassis or an unheld prop has `normalY ≥ cos(PLAYER_MAX_SLOPE_DEG)`; `bodyId` is `'vehicle'` or the prop id; `localPos` is in that body's frame. The chassis is checked first.
- G2. Carry and take-off velocity (step 3 rules) use the ground body's velocity at the point. A ground prop that is held or reset this tick clears `ground`.
- G3. Shove-out (F8) and the top guard (D12 generalised) use the overlapped body's centre, rotation and half extents.

Props
- J1. Kill plane (tick step 6): an unheld prop whose centre is below `course.killPlaneY` returns to its spawn at rest; a heavy one locks.
- J2. A locked heavy prop does not move when the vehicle drives into it at 5 m/s (displacement below 0.01 m).
- J3. Snapshot: every prop, course order; `pos` is the box centre.

## Tasks

Each task: tests first, then code; then a Sonnet review. Run `npm test` and `npm run typecheck` before each commit. Every earlier test passes unchanged unless named.

### Task 1 — props and the test ground (`shared`)
Files: `constants.ts`, `props.ts` (new), `props.test.ts` (new), `courses/testGround.ts`, `courses/testGround.test.ts`, `world.ts` (creates `props`, snapshot `props`, J1 in the kill-plane step, dispose order), `world.test.ts`, `index.ts`.
Tests: (1) the test-ground checks above; (2) every prop spawns at its pose and is at rest after 2 s (moved < 0.01 m); (3) a crate dropped from 3 m lands on the ground; (4) a prop teleported below the kill plane (via `debugBody(id).setTranslation`) is back at spawn and at rest after the next world step, and a heavy one is locked; (5) a locked barrier hit by the vehicle (the Lodgy started 8 m away and driven at full throttle into it, placing the barrier on its line with `withProps`) moves less than 0.01 m (J2); (6) `hold` makes the prop collide with nothing (a box dropped onto it falls through) and `release` restores it; (7) the snapshot lists every prop with finite `pos` and `rot`; (8) determinism still passes. Add `withProps(course, props)` to `testRig.ts` beside `withBoxes`.
Existing tests changed: none expected; `world.test.ts` snapshot shape tests gain `props`.
Commit: `feat(shared): props on the test ground and the prop kill plane`.

### Task 2 — standing on props, carry and shove by props (`shared`)
Files: `player.ts`, `world.ts`, `player.test.ts`.
Tests: (1) a player teleported onto the barrier's top stands on it with `ground.bodyId === 'barrier-1'`; (2) a player on a crate that is pushed by a test impulse moves with it (in its frame) — use a crate given a velocity with `setLinvel`; (3) walking off a moving crate keeps its velocity on take-off; (4) a crate thrown (given velocity) into a standing player shoves the player out horizontally, never into a wall; (5) the top guard lifts a player whose feet are within step height below a barrier top onto it; (6) a held prop does not shove anybody and cannot be stood on; (7) every step-3 player test passes unchanged.
Existing tests changed: none (the `GroundRef` type widens).
Commit: `feat(shared): stand on props and be shoved by them`.

### Task 3 — push (`shared`)
Files: `push.ts` (new), `push.test.ts` (new), `player.ts` (intents), `world.ts` (H4 at step 2), `scenarios.test.ts`.
Tests: unit: (1) `requiredPushers` for 0–6; (2) `contactPoint` on an axis-aligned and a rotated box; (3) `pushForce` null when moving away from or along the surface, scaled by input magnitude, capped by `mass · PUSH_MAX_ACCEL`, tipped base. World: (4) one player walking into the parked Lodgy's side for 2 s moves it more than 0.5 m in the push direction; walking away from it moves it less than 0.01 m; (5) five players pushing the Lodgy (placed side by side along its flank, all walking into it) move it no further in 2 s than four (cap; equal within 2%); (6) two pushers move the RV further than one; (7) a player standing on the vehicle's roof walking into nothing applies no push (vehicle moves < 0.01 m); (8) the barrier with 2 players in the world: one pusher leaves it locked (< 0.01 m), two move it more than 0.3 m in 2 s; with 1 player in the world one pusher moves it; it does not rotate; (9) a crate is pushed along by one player. Scenario: (10) a Lodgy rolled 90° onto its side is righted (up·Y > 0.9) within 10 s by four players walking into its roof face, and is not righted in 10 s by one player.
Commit: `feat(shared): players push the vehicle and props`.

### Task 4 — hands (`shared`)
Files: `interact.ts`, `interact.test.ts`, `player.ts`, `world.ts`, `protocol.ts` (`hands` in `PlayerSnapshot` only; the parse check is Task 5), `world.test.ts`, `seats.test.ts` if boarding tests live there.
Tests: (1) `resolveInteract` priority: seated → exit; holding → throw; else the smallest angle; ties to boarding; (2) `aimAngleToBox` is 0 with the eye inside the box, 0 within 1e-9 for a box straight ahead on the aim line, and π/2 within 1e-9 for a box directly beside the eye; (3) interact beside a crate (aiming at it) picks it up; the snapshot's `hands` is its id; the crate follows the hold pose for 60 ticks of walking; (4) a crate out of range is not picked up; aiming at the vehicle beside a crate boards instead; (5) interact again throws: the crate leaves with speed ≥ `THROW_SPEED · 0.9` along the aim and lands more than 3 m away; (6) two players pressing on one tick: the earlier gets it; (7) boarding while holding drops the crate (not held, dynamic) and seats the player; (8) a holder falling below the kill plane: the crate is back at its spawn; (9) `removePlayer` releases it; (10) throwing while facing a wall releases above the head (K3 fallback); (11) a heavy barrier cannot be picked up.
Existing tests changed: `interact.test.ts` (new call shape); `PlayerSnapshot` literals in `protocol.test.ts`, `snapshotBuffer.test.ts`, `overlay.test.ts`, `predictor.test.ts` gain `hands: null`.
Commit: `feat(shared): pick up and throw light debris`.

### Task 5 — protocol, room and snapshot buffer (`shared`, `server`, `client` net)
Files: `protocol.ts`, `protocol.test.ts`, `server/src/room/room.ts`, `server/src/room/server.test.ts` (or a new `room.test.ts`), `client/src/net/snapshotBuffer.ts`, `snapshotBuffer.test.ts`.
Tests: (1) parse rejects bad `props` and bad `hands`, keeps extras; (2) room: the first snapshot to a client is `full` and lists all four props; later snapshots list only props that moved (none at rest, the pushed crate after a push); a client joining later gets a full one; (3) buffer: a full snapshot then a partial one sample to the merged list; a prop is interpolated between its two positions; a later full snapshot replaces the map (a prop missing from it is gone).
Commit: `feat(server): send moved props in snapshots`.

### Task 6 — client drawing and prediction stand-ins (`shared`, `client`)
Files: `predictor.ts`, `predictor.test.ts`, `client/src/render/propMesh.ts` (new), `client/src/game.ts`, `client/src/render/scene.ts` if needed.
Tests: (1) `setProps` places stand-ins that block the predicted player like the server's props (walk into the barrier: same stop within 1e-6 m against `createWorld`); moving a stand-in then walking works; removing one (absent from the list) lets the player pass; unknown kinds are skipped. Drawing is not unit tested (say so in the report).
Commit: `feat(client): draw props and predict around them`.

### Task 7 — RV sand tests, browser test, documents
Files: `vehicle.test.ts`, `e2e/smoke.spec.ts`, `ROADMAP.md`, the spec.
Tests: carried row: for the RV, replace "sand slows it" with (1) "from rest on sand at full throttle it stays within 0.5 m for 10 s" and (2) "entering the sand patch at 12 m/s (placed 5 m before its +Z edge, `setLinvel` 12 m/s forward, full throttle) it crosses: its centre passes the patch's −Z edge within 10 s". The Lodgy keeps the existing test. Smoke: one player walks to `crate-1` (teleport is not available; walk from the spawn: the e2e can hold keys) — if reaching it by keys is unreliable, assert instead that the page draws without errors and the overlay lists 4 props (`props 4`), and say so in the report. The overlay gains a line `props N` (count in the sample).
ROADMAP: step 5 → `done`; delete the step-5 carried row; log F1–F12; update "Runnable today" and Known issues (D11: the barrier and crates give a way onto the roof — not tested, for the owner); the spec amendments of F2, F5, F6.
Run: `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e` (desktop; WebKit is not installed here).
Commits: `test(shared): the RV is bogged on sand from rest and crosses with speed`, `test(e2e): props are drawn`, `docs(roadmap): record step 5`.

## What the owner checks by hand
How pushing feels (strength, the tipped boost), throwing distance, crates on the roof, the barrier's slide.

## Known risks to watch in review
- Character controller collision reports while pressed against a dynamic body: H1 relies on the controller reporting the blocked collision every tick.
- Switching body types (dynamic ↔ kinematic) in Rapier 0.21 and restoring the collision groups.
- Freeing order in `dispose`: players, props, then the physics world.
- Snapshot size grows by the props that move; measured at step 16.

## Amendments after the plan review (binding; where they differ from the text above, they win)

R1. Task 3 tests (4) and (5): tyres' side grip holds the car, so pushes are at the **rear face** (+Z), walking toward −Z. Test (4): one player starting 0.5 m behind the rear face, walking −Z for 2 s, moves the Lodgy more than 0.5 m toward −Z; walking +Z (away) moves it less than 0.01 m. Players overlap each other freely across the 1.76 m rear face.
R2. H4 for the vehicle: the intents of the first `PUSH_MAX_PUSHERS_VEHICLE` players **among those with an intent on the vehicle this tick**, in join order. Test (5): players 1–4 at the same spots in both runs (spread across the rear face), a fifth beside them in the second run; run **1 s**; the displacements agree within 2%.
R3. K5 lives in `Players.setSeat` (seating a player who holds a prop releases it at the hold pose with zero velocity, K3's fallback applying). Interact never boards while holding (throw has priority). Task 4 test (7) calls `setSeat` directly in `player.test.ts`.
R4. Task 6 test (1): the server world has a second, idle player far away (so `requiredPushers(2) = 2` and one pusher leaves the barrier locked).
R5. Files and existing tests to change, in addition to those named:
  - Task 1: `client/src/net/snapshotBuffer.test.ts` (the typed `snapshot()` helper gains `props: []`).
  - Task 2: `player.test.ts` (calls of `createPlayers` gain `createProps(RAPIER, rig.world, course)`; the rig course has no props unless the test adds some).
  - Task 4: `client/src/net/snapshotBuffer.ts` (`copyPlayer` copies `hands`) and its test; `client/src/ui/overlay.ts` `interactHint` and `overlay.test.ts`. The hint passes the local mouse pitch and yaw (new parameters `yaw: number, pitch: number`) and the sampled props; it shows `E to leave the seat`, `E to throw`, `E to board` or `E to pick up`; candidates are built with the same helper the world uses (export `interactCandidates(...)` from `interact.ts`, a pure function over poses, so the client and the server compute them alike).
  - Task 7: `overlay.ts` (`OverlayData.props: number`, line `props    N`), `overlay.test.ts`.
R6. Interact (tick step 1) uses **this tick's** sanitised input yaw and pitch for candidate angles and for the throw direction, not `player.yaw` from the previous tick.
R7. Task 5 room test: `RoomConfig` gains optional `course?: BuiltCourse`, passed to `createWorld` (tests only). The test course is the test ground with `crate-1` lifted 2 m (via `withProps`), so it falls in the first snapshots and then rests. Moved detection compares each prop with the pose **last sent** for it (per room, updated when sent), not with the previous broadcast.
R8. Every Rapier call that should act on a resting body wakes it: `applyImpulseAtPoint(..., true)`, `setEnabledTranslations(..., true)`, `lockRotations(true, true)`, `setBodyType(Dynamic, true)`, `setLinvel(..., true)`.
R9. Shove-out line (F8): stop at statics; keep stepping while the candidate overlaps any dynamic body (vehicle or unheld prop); a free spot overlaps nothing; with none the player goes to a spawn slot.
R10. At step 2, intents are dropped whose body is now held, was reset by the kill plane last tick, or whose player was removed or seated.
R11. Corrections to the text: the crate tumbles when pushed (the contact is at its top edge); that is accepted. In the scratch test with walking pushers three right a Lodgy on its side; test (10) stays four yes, one no; if it fails, stop and report, do not retune.
R12. Task 4 test (5): at pitch 0, the crate's first ground contact is more than 3 m horizontally from the thrower's feet.
R13. K3 thrower velocity: when `ground` is set, the ground body's velocity at the feet plus `walk`; otherwise `walk + carry`.
R14. Task 1 test (5): the Lodgy with a seated driver (via interact, or `setSeat` through the players module) starts with its front face 8 m from the barrier's near face, drives at full throttle into it; the barrier's **horizontal** displacement is below 0.01 m.
R15. Task 3 test (7): a player teleported onto the centre of the parked Lodgy's roof walks toward −Z for 0.5 s; the vehicle moves less than 0.01 m.
R16. `aimAngleToBox` "beside" case: the box's vertical span includes the eye height.
R17. Types: `PropClass`, `PropKind` and `PropKindConfig { class: PropClass; halfExtents: Vec3; mass: number; friction: number }` live in `constants.ts`; no name is exported from two files. `createProps` throws on an unknown kind (course data is ours). The centre of mass is the box centre. `Props.dispose()` removes the bodies; `World.dispose` frees players, props, then the physics world. The snapshot buffer gains `latestProps(): PropSnapshot[]` (merged, newest) for `predictor.setProps`; its `push` takes a `SnapshotMessage`. Prop stand-ins use `setCanSleep(false)`.
R18. Log F13: the push's contact point is the box point nearest `feet + (0, PUSH_HEIGHT, 0)`, not the true contact (spec "Push" amended). Delete the step-5 carried row, whose "use pushing" contradicts F6.
