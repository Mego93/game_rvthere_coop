# Step 4: Client prediction of walking and jumping

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md` (sections "Prediction", "shared" (`createPredictor`), "Snapshot", "Player physics"). This plan fixes interfaces, constants, rules and test cases. Implementers write the tests first, then the code. Where the plan and the spec disagree, stop and report (CLAUDE.md, "When something is not specified").

## Goal

The local player's walking and jumping happen on the page at once, using the same movement code as the server, and are corrected when each snapshot arrives. Everything else (seats, shove-out, standing on the vehicle) still comes from the server. After this step the local player no longer lags by 100 ms plus the round trip.

Not in this step: prediction of pushing, hands, props (5 onward), anything on the vehicle or in a seat, and other players (they stay interpolated).

## Decisions made in this plan (log them in `ROADMAP.md` in the last task)

E1. The snapshot's player entry gains `walk`, `carry`, `vy` and `grounded`, so the client can reset the predictor to the server's state exactly. They are sent for every player (the snapshot stays identical for every client). Snapshot size is measured at step 16. Spec section "Snapshot" is amended.
E2. The server's walking code and the predictor's share one function, `stepWalk`, extracted from `player.ts` with no change in behaviour. A test proves the two agree.
E3. The predictor's vehicle stand-in is a **dynamic** box with the vehicle's `halfExtents` and gravity scale 0 (collider at the body origin, `groups(GROUP_WORLD, GROUP_WORLD)`, as in `vehicle.ts`), positioned with `setTranslation` and `setRotation` from the latest snapshot (not the interpolated one), then one zero-length physics step so queries see it, as `createWorld` does. It must not be kinematic or fixed: the walking controller's autostep excludes dynamic bodies only, so a kinematic box can be stepped onto (measured: a running jump ends on a Lodgy-sized roof) and a fixed one is not found after a zero step. The spec's "kinematic stand-ins" is amended.
E4. Prediction is on while the latest snapshot reports the local player unseated and with `ground` null. It is off otherwise, and the player is then drawn from the interpolated snapshot as in step 3. Turning it back on resets the predictor to the snapshot's state.
E6. The predictor's API differs from the spec's: `createPredictor(rapier, course, vehicle)`, `setVehicle(pos, rot)` and `stepPlayer(state, input, previousJump)` replace `createPredictor(rapier, builtCourse)`, `setBodies(snapshot)` and `stepPlayer(state, input)`. The vehicle config is needed for the stand-in's size, the stand-in takes a pose and not a snapshot, and the press needs the previous input. Spec section "shared" is amended.
E5. Known and accepted: when the server consumes two queued inputs in one tick, or repeats an input because the client's was late, the server and the client are one tick apart for a moment; the correction absorbs it. When two inputs are merged, the server's previous jump flag is the OR of both while the client's is the second input's alone, so a press can differ for one tick. The predictor has no shove-out, so mismatches beside a moving vehicle are absorbed too.

## Constants (`constants.ts`, one block "Prediction")

| Name | Value | Meaning |
|---|---|---|
| `PREDICTION_TELEPORT_DISTANCE` | 1 | m; a correction larger than this moves the player at once |
| `PREDICTION_SMOOTH_RATE` | 12 | per second; a smaller correction fades out as `1 − exp(−rate·dt)` per frame |
| `PREDICTION_IGNORE_DISTANCE` | 0.002 | m; a smaller correction is ignored |
| `PREDICTION_MAX_PENDING` | 120 | inputs kept for replay (2 s); older ones are dropped |

## Modules and signatures

### `shared/src/walk.ts` (new)

```ts
export interface WalkState {
  pos: Vec3;                                  // feet
  walk: { x: number; z: number };
  carry: { x: number; z: number };
  vy: number;
  grounded: boolean;
}
export interface WalkEnv {
  controller: RAPIER.KinematicCharacterController;
  collider: RAPIER.Collider;                  // the player's capsule
  groups: number;                             // query groups
}
export interface WalkResult { collisions: ReadonlyArray<{ handle: number; normalY: number }> }
// One tick of rule P3 (jump, gravity, wish acceleration, move). `pressedJump` is the press, `wish` from `wishVelocity`.
export function stepWalk(env: WalkEnv, state: WalkState, pressedJump: boolean, wish: { x: number; z: number }): WalkResult
// Builds the controller with the constants of the "Players on foot" block; used by both createPlayers and the predictor.
export function createWalkController(rapier: Rapier, physics: RapierWorld): RAPIER.KinematicCharacterController
```

`stepWalk` mutates `state` in place. It sets the collider to `pos + PLAYER_HEIGHT/2` before the move and again after it, then does what `move` in `player.ts` does up to and including `state.grounded = …` and the `vy`/`carry` reset on landing, and returns the computed collisions. Staying in `player.ts`: `wishVelocity` and `finite` on the input, `wasOnVehicle`, the `ground` computation from `WalkResult.collisions` (a collision with `vehicle.chassisHandle` and `normalY >= MIN_UP_NORMAL`), and `else if (wasOnVehicle) carry = vehicleVelocityAt(pos)`, run when `!state.grounded` after `stepWalk`. The predictor's capsule is a body-less collider with `groups(GROUP_PLAYER, 0)` and the query groups are `groups(GROUP_WORLD, GROUP_WORLD)`, as on the server. `createPlayers` and the predictor both call `stepWalk`.

### `shared/src/predictor.ts` (new)

```ts
export interface PredictedState { pos: Vec3; walk: { x: number; z: number }; carry: { x: number; z: number }; vy: number; grounded: boolean }
export interface Predictor {
  // Moves the vehicle stand-in to this pose (from the latest snapshot).
  setVehicle(pos: Vec3, rot: Quat): void;
  // One tick: the next state for this input. `previousJump` is the jump button of the input before.
  stepPlayer(state: PredictedState, input: InputFields, previousJump: boolean): PredictedState;
  dispose(): void;
}
export function createPredictor(rapier: Rapier, course: BuiltCourse, vehicle: VehicleConfig): Predictor
export function predictedFrom(player: PlayerSnapshot): PredictedState
```

`stepPlayer` returns a new object and never changes its argument. The press is `input.jump && !previousJump`. Yaw comes from the input. `createPredictor` builds the statics with `buildStatics`, the stand-in (E3) and the capsule, and runs one zero-length step. Inputs are sanitised before use exactly as the server does: `protocol.ts` exports `sanitiseInput(fields: InputFields): InputFields` (clamp moveX/moveY to [−1, 1], clamp pitch, wrap yaw), which `parseInput` also uses, and `stepPlayer` and the reconciler apply it. The predictor keeps its own disposed flag; `stepPlayer` and `setVehicle` throw after `dispose`.

### `PlayerSnapshot` additions (`protocol.ts`, `world.ts`)

```ts
walk: { x: number; z: number }; carry: { x: number; z: number }; vy: number; grounded: boolean;
```

`parseServerMessage` rejects a player entry whose new fields are not finite numbers (vectors with finite `x` and `z`) or a `grounded` that is not a boolean.

### `client/src/prediction/reconciler.ts` (new, pure)

```ts
export interface Reconciler {
  // Stores the input just sent (always) and, while active, predicts one tick with it; returns the predicted state (the last one while inactive).
  record(seq: number, input: InputFields): PredictedState | null;
  // A snapshot arrived with the local player unseated and not on the vehicle: reset to the server's state and replay the inputs after `ackSeq`. The first call activates the reconciler.
  correct(server: PredictedState, ackSeq: number): void;
  // The state to draw: the previous and current predicted positions blended by `alpha` (0 to 1, from the fixed stepper) plus the fading offset; `dt` advances the fade.
  view(dt: number, alpha: number): { pos: Vec3; snapped: boolean } | null;
  // Prediction off (seated, on the vehicle, missing from the snapshot): stop predicting and clear the offset. The recorded inputs are kept.
  suspend(): void;
  readonly active: boolean;
}
export function createReconciler(predictor: Predictor): Reconciler   // inactive until the first correct
```

`FixedStepper` in `loop.ts` gains `alpha(): number` (the accumulator divided by `TICK_DT`, in [0, 1)).

## Behaviour rules

- X1. `stepPlayer` follows rule P3 exactly (jump, gravity every tick, wish acceleration, move, `vy = 0` and `carry = 0` on landing), through `stepWalk`.
- X2. Equivalence: from the same start, with the same inputs on a course with no vehicle in reach, `stepPlayer` and the server's `createWorld` give the same position (within 1e-6 m) after any number of ticks.
- X3. `setVehicle` places a box with the vehicle's `halfExtents`; the predicted player cannot walk through it.
- X4. `correct` sets the predicted state to `server`, discards stored inputs with `seq <= ackSeq` (remembering the last acknowledged input's jump flag as `previousJump`), and replays the rest with `stepPlayer`. The correction is the old predicted position minus the new one (zero on the first call).
- X5. The new offset is the old offset plus the correction. If its length exceeds `PREDICTION_TELEPORT_DISTANCE` it is cleared and the next `view` reports `snapped: true` once. If its length is at most `PREDICTION_IGNORE_DISTANCE` it is cleared (the state is still reset). Otherwise it shrinks by `1 − exp(−PREDICTION_SMOOTH_RATE·dt)` per `view(dt)`.
- X6. `record` keeps at most `PREDICTION_MAX_PENDING` inputs; the oldest are dropped. If `correct`'s `ackSeq + 1` is below the oldest kept `seq` (inputs were dropped), the correction is applied as a snap.
- X7. With a zero correction and `alpha` 1 the drawn position equals the predicted position exactly; with `alpha` 0 it equals the previous tick's.
- X8. `suspend` clears the offset and makes `active` false but keeps the recorded inputs (trimmed by acknowledgement and the cap), and `record` keeps storing them and the last jump flag while inactive; the next `correct` activates and replays everything after `ackSeq`.
- X9. A `correct` whose `ackSeq` is lower than the previous one is ignored entirely.
- X10. Game wiring: each fixed tick the page samples input, sends it with `seq`, and calls `record(seq, input)`. On each snapshot the page calls `predictor.setVehicle` with the snapshot's vehicle pose, then: if the local player's entry exists, with `seat === null` and `ground === null`, `correct(predictedFrom(entry), ackSeq)`, otherwise `suspend()`. The local mesh and the shoulder camera use `view(dt, alpha)` while active (the mesh's yaw is the mouse yaw) and the interpolated snapshot otherwise. Aim (yaw and pitch) always comes from the local mouse.

## Tasks

Each task: tests first, then code; then a Sonnet review. Run `npm test` and `npm run typecheck` before each commit. Every earlier test passes unchanged unless named.

### Task 1 — share the walking step (`shared`)
Files: `walk.ts` (new), `player.ts`, `index.ts`, `walk.test.ts` (new).
Tests: (1) `createWalkController` sets the constants, by behaviour on `withBoxes` geometry: a 0.2 m ledge is stepped and a 0.4 m one is not; a ground box tilted 50° about X is not climbed; (2) `stepWalk` on flat ground from rest for 60 ticks equals the distance of the existing walk test (4.1 to 4.5 m); (3) jump apex 1.15 to 1.3 m; (4) `stepWalk` and a world player given the same inputs agree within 1e-9 m for 300 ticks on the test ground. All existing `player.test.ts`, `world.test.ts` and scenario tests pass **unchanged** — this is a pure refactor.
Commit: `refactor(shared): share the walking step between the server and the predictor`.

### Task 2 — snapshot fields, input sanitiser (`shared`, `client` net, `server` test)
Files: `protocol.ts` (fields; export `sanitiseInput`), `world.ts`, `player.ts` (exposes the fields from `PlayerState` into the snapshot), `client/src/net/snapshotBuffer.ts` (`copyPlayer` copies the new fields, with `walk` and `carry` as new objects), `protocol.test.ts`, `world.test.ts`, `snapshotBuffer.test.ts`, `server/src/room/inputQueue.test.ts`.
Tests: (1) a snapshot's player entry has finite `walk`, `carry`, `vy` and a boolean `grounded`; a walking player's `walk` is non-zero; a jumping player's `vy` is positive at take-off; `grounded` is false in the air; (2) `parseServerMessage` rejects each new field when missing, non-finite or of the wrong type, and keeps unknown extras; (3) determinism test still passes; (4) `sanitiseInput` clamps moveX/moveY, clamps pitch, wraps yaw, and `parseInput` gives the same fields as before; (5) an interpolated player keeps the newer snapshot's `walk`, `carry`, `vy` and `grounded` and does not alias them; (6) the carried test: `ackSeq` through the neutral substitute — after silence long enough for the neutral input, `ackSeq()` still equals the last consumed seq.
Existing tests changed: the `PlayerSnapshot` literals in `protocol.test.ts` (lines about 130 to 132 and wherever `onFoot`, seated and on-vehicle fixtures are built), `client/src/net/snapshotBuffer.test.ts` (about line 106) and `client/src/ui/overlay.test.ts` (about line 40) gain the fields; no assertion changes. `interact.test.ts` has no such literal.
Commit: `feat(shared): send each player's velocity state in the snapshot`.

### Task 3 — predictor (`shared`)
Files: `predictor.ts` (new), `predictor.test.ts` (new), `index.ts`, `constants.ts` (prediction block).
Tests: X1 to X3 and: (1) X2: on open flat ground, the predictor and a `createWorld` player (the vehicle parked at the course start; the player is teleported to (20, 0.02, −100), well clear of the sand patch, ramp and slopes) agree within 1e-6 m after 600 ticks of a scripted input sequence (walk, strafe, jump, stop), with the predictor's stand-in at the same vehicle pose; (2) a wall box (via `withBoxes` course) stops the predicted player as it stops the server's; (3) the stand-in blocks: `setVehicle` at a pose in front of the player and walking into it stops with the feet's horizontal distance to the box face between `PLAYER_RADIUS` and `PLAYER_RADIUS + 0.05`; moving the stand-in then walking again works (the zero-length step); a running jump at the parked stand-in's side ends beside it, not on the roof, and matches `createWorld` within 1e-6 m (kinematic stand-ins fail this); (4) `stepPlayer` does not change its argument; (5) `predictedFrom` copies (mutating the result changes nothing in the snapshot); (6) after `dispose`, `stepPlayer` and `setVehicle` throw.
Commit: `feat(shared): predictor for the local player's walking and jumping`.

### Task 4 — reconciler and stepper alpha (`client`)
Files: `prediction/reconciler.ts`, `prediction/reconciler.test.ts`, `loop.ts`, `loop.test.ts`.
Tests use a fake predictor (a pure function stepping `pos.x += input.moveY` so the arithmetic is exact) and the real one in two integration cases. X4: after `correct(server, ackSeq=3)` with inputs 1..6 recorded, the predicted state is the server state plus inputs 4..6; X5: a 0.5 m correction fades (after 0.25 s the offset is `0.5·exp(−12·0.25)` ≈ 0.0249 within 1e-3); a correction arriving while an offset still fades adds to it; a 1.5 m correction snaps (`snapped` true once, then false); a 0.001 m correction is ignored but the state is still reset; X6: 121 recorded inputs keep 120, and a `correct` whose inputs were dropped snaps; X7 with `alpha` 0, 0.5 and 1; X8: suspend then record 10 inputs, then `correct` replays the ones after `ackSeq`; X9: a lower `ackSeq` is ignored; first `correct` activates with no offset; the jump flag: replay with the acknowledged input holding jump does not re-jump (the press needs a release); an `ackSeq` of 0 replays everything; reset to the same state with no pending inputs changes nothing. Integration: with the real predictor, a script of 120 inputs, a server state taken from the predictor itself at tick 60, `correct` leaves the final position unchanged within 1e-9 m. `loop.test.ts`: `alpha()` is 0 after a whole step and 0.5 after half a step.
Commit: `feat(client): reconcile the predicted player with each snapshot`.

### Task 5 — game wiring and Rapier on the page (`client`)
Files: `main.ts`, `game.ts`, `ui/overlay.ts`, `ui/overlay.test.ts`.
Scope: rule X10. Signatures: `Game.pushSnapshot(snapshot: SnapshotMessage)` (it needs `ackSeq`); `GameView` gains `rapier: Rapier`; `Game.stop()` also calls `predictor.dispose()`; `OverlayData` gains `predicted: Vec3 | null` and `server: Vec3 | null` (the latest, not the interpolated, snapshot's position of the local player). Overlay lines when `predicted` is non-null: `you      x y z   (predicted)` and `server   x y z`, formatted like the existing position line; omitted otherwise. The local mesh is placed from `view()` with the mouse yaw.
`main.ts`: `const rapierReady = RAPIER.init()` once at module load; the home page's create and join wait for it (a second `lobby` during the wait cannot start two games); a failed init shows a clear message on the home page, as the WebGL failure path does.
Tests: pure overlay lines for predicted, suspended and before-first-snapshot. The wiring is not unit tested (say so in the report).
Check: `npm run build` succeeds; record the bundle size in the report (expected about 5 MB, the Known-issues row).
Commit: `feat(client): predict the local player's movement`.

### Task 6 — browser test and documents
Files: `e2e/smoke.spec.ts`, `ROADMAP.md`, the spec.
Scope: a smoke case: one player walks forward by holding W for 1 s, releases, waits 500 ms; the overlay's `you` position and `server` position agree within 0.3 m, and the player has moved by more than 3 m; no page errors (existing watcher). Also a case with the player seated: the `you` line is absent.
ROADMAP: step 4 → `done`; delete the step-4 carried rows (bundle size noted in Known issues as now true; the snapshot-buffer rows except what is still open); log E1 to E5; update "Runnable today"; note in Working notes that feel (smoothing, snap) is for the owner to judge on a real connection, since localhost has no latency. Spec: amend "Snapshot" (E1), "Prediction" (E3, E4: dynamic stand-in at zero gravity) and the `createPredictor` lines in "shared" (E6). Replace the Known-issues row about the local player being drawn from interpolated snapshots; delete the whole step-4 carried row group (the snapshot-buffer items were done in step 3, the `ackSeq` test is Task 2; keep the note that after the server discards a backlog the view holds the newest snapshot until the offset converges, as a Known issue). Note the four new fields add roughly 90 bytes per player to the measured 150. Set step 4's status to `in progress` in the first commit of the step and to `done` at the end.
Run: `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e` (desktop only if WebKit cannot be installed; say so).
Commits: `test(e2e): the local player is predicted`, `docs(roadmap): record step 4`.

## What the owner checks by hand
How walking feels on a real connection with latency (try a phone on the same Wi-Fi or a throttled connection): no rubber-banding on ordinary movement, corrections smooth, a snap only after a real jump in position (respawn). Report as unverified.

## Known risks to watch in review
- `stepWalk`'s extraction must not change server behaviour: the whole step-3 suite is the check.
- Rapier in the page: bundle size, and `RAPIER.init()` before the world is built (the same `import` is used by the server tests).
- The jump press needs the previous input's jump flag: a replay that forgets it re-jumps.
- The predictor's zero-length physics step must not move the stand-in or the player.
