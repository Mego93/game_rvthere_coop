# Step 4: Client prediction of walking and jumping

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md` (sections "Prediction", "shared" (`createPredictor`), "Snapshot", "Player physics"). This plan fixes interfaces, constants, rules and test cases. Implementers write the tests first, then the code. Where the plan and the spec disagree, stop and report (CLAUDE.md, "When something is not specified").

## Goal

The local player's walking and jumping happen on the page at once, using the same movement code as the server, and are corrected when each snapshot arrives. Everything else (seats, shove-out, standing on the vehicle) still comes from the server. After this step the local player no longer lags by 100 ms plus the round trip.

Not in this step: prediction of pushing, hands, props (5 onward), anything on the vehicle or in a seat, and other players (they stay interpolated).

## Decisions made in this plan (log them in `ROADMAP.md` in the last task)

E1. The snapshot's player entry gains `walk`, `carry`, `vy` and `grounded`, so the client can reset the predictor to the server's state exactly. They are sent for every player (the snapshot stays identical for every client). Snapshot size is measured at step 16. Spec section "Snapshot" is amended.
E2. The server's walking code and the predictor's share one function, `stepWalk`, extracted from `player.ts` with no change in behaviour. A test proves the two agree.
E3. The predictor's vehicle stand-in is a kinematic box with the vehicle's `halfExtents`, positioned from the latest snapshot (not the interpolated one), as the spec says. Like the server's world, the predictor runs one zero-length physics step after moving it so queries see the new position.
E4. Prediction is on while the latest snapshot reports the local player unseated and with `ground` null. It is off otherwise, and the player is then drawn from the interpolated snapshot as in step 3. Turning it back on resets the predictor to the snapshot's state.
E5. Known and accepted: when the server consumes two queued inputs in one tick, or repeats an input because the client's was late, the server and the client are one tick apart for a moment; the correction absorbs it. The predictor has no shove-out, so mismatches beside a moving vehicle are absorbed too.

## Constants (`constants.ts`, one block "Prediction")

| Name | Value | Meaning |
|---|---|---|
| `PREDICTION_SNAP_DISTANCE` | 1 | m; a correction larger than this moves the player at once |
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

`stepWalk` does exactly what `move` in `player.ts` does up to and including `state.grounded = …` and the `vy`/`carry` reset on landing; ground detection on the vehicle, the carry on walk-off and `placeCollider` stay in `player.ts`, which reads `WalkResult.collisions`. `createPlayers` and the predictor both call it.

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

`stepPlayer` returns a new object and never changes its argument. The press is `input.jump && !previousJump`. Yaw comes from the input.

### `PlayerSnapshot` additions (`protocol.ts`, `world.ts`)

```ts
walk: { x: number; z: number }; carry: { x: number; z: number }; vy: number; grounded: boolean;
```

`parseServerMessage` rejects a player entry whose new fields are not finite numbers (vectors with finite `x` and `z`) or a `grounded` that is not a boolean.

### `client/src/prediction/reconciler.ts` (new, pure)

```ts
export interface Reconciler {
  // Records the input just sent and predicts one tick with it; returns the new predicted state.
  record(seq: number, input: InputFields): PredictedState;
  // A snapshot arrived: reset to the server's state and replay the inputs after `ackSeq`.
  correct(server: PredictedState, ackSeq: number): void;
  // The state to draw: predicted position plus the fading correction offset; `dt` advances the fade.
  view(dt: number): { pos: Vec3; snapped: boolean };
  // Prediction off (seated, on the vehicle): forget everything.
  suspend(): void;
  readonly active: boolean;
}
export function createReconciler(predictor: Predictor, start: PredictedState): Reconciler
```

## Behaviour rules

- X1. `stepPlayer` follows rule P3 exactly (jump, gravity every tick, wish acceleration, move, `vy = 0` and `carry = 0` on landing), through `stepWalk`.
- X2. Equivalence: from the same start, with the same inputs on a course with no vehicle in reach, `stepPlayer` and the server's `createWorld` give the same position (within 1e-6 m) after any number of ticks.
- X3. `setVehicle` places a box with the vehicle's `halfExtents`; the predicted player cannot walk through it.
- X4. `correct` sets the predicted state to `server`, discards stored inputs with `seq <= ackSeq` (keeping the last acknowledged input's jump flag as `previousJump`), and replays the rest with `stepPlayer`. The difference between the old and new predicted positions is the correction.
- X5. A correction larger than `PREDICTION_SNAP_DISTANCE` is applied at once (`view().snapped` is true for that call and the offset is cleared). One at or below `PREDICTION_IGNORE_DISTANCE` is ignored. Anything between becomes an offset (old minus new position) that shrinks by `1 − exp(−PREDICTION_SMOOTH_RATE·dt)` per `view(dt)`.
- X6. `record` keeps at most `PREDICTION_MAX_PENDING` inputs; the oldest are dropped.
- X7. With a zero correction the drawn position equals the predicted position exactly.
- X8. `suspend` clears the pending inputs and the offset and makes `active` false; the next `correct` makes it true again with nothing to replay.
- X9. Game wiring: each fixed tick the page samples input, sends it with `seq`, and calls `record(seq, input)` if the reconciler is active. On each snapshot the page sets the stand-in with `setVehicle` (the snapshot's vehicle), then, if the local player's entry has `seat === null` and `ground === null`, calls `correct(predictedFrom(entry), ackSeq)`, otherwise `suspend()`. The local mesh and the shoulder camera use `view()` while active, and the interpolated snapshot otherwise. Aim (yaw and pitch) always comes from the local mouse.

## Tasks

Each task: tests first, then code; then a Sonnet review. Run `npm test` and `npm run typecheck` before each commit. Every earlier test passes unchanged unless named.

### Task 1 — share the walking step (`shared`)
Files: `walk.ts` (new), `player.ts`, `index.ts`, `walk.test.ts` (new).
Tests: (1) `createWalkController` sets the constants (check by behaviour: a 0.2 m ledge is stepped, a 0.4 m one is not; 50° slope climbs not); (2) `stepWalk` on flat ground from rest for 60 ticks equals the distance of the existing walk test (4.1 to 4.5 m); (3) jump apex 1.15 to 1.3 m; (4) `stepWalk` and a world player given the same inputs agree within 1e-9 m for 300 ticks on the test ground. All existing `player.test.ts`, `world.test.ts` and scenario tests pass **unchanged** — this is a pure refactor.
Commit: `refactor(shared): share the walking step between the server and the predictor`.

### Task 2 — snapshot fields (`shared`, tests)
Files: `protocol.ts`, `world.ts`, `player.ts` (exposes the fields from `PlayerState` into the snapshot), `protocol.test.ts`, `world.test.ts`.
Tests: (1) a snapshot's player entry has finite `walk`, `carry`, `vy` and a boolean `grounded`; a walking player's `walk` is non-zero; a jumping player's `vy` is positive at take-off; `grounded` is false in the air; (2) `parseServerMessage` rejects each new field when missing, non-finite or of the wrong type, and keeps unknown extras; (3) determinism test still passes.
Existing tests changed: fixtures in `protocol.test.ts` (`onFoot` and the others), `interact.test.ts`, `client/src/net/snapshotBuffer.test.ts`, `client/src/ui/overlay.test.ts` — wherever a `PlayerSnapshot` literal is built, add the fields; no assertion changes.
Commit: `feat(shared): send each player's velocity state in the snapshot`.

### Task 3 — predictor (`shared`)
Files: `predictor.ts` (new), `predictor.test.ts` (new), `index.ts`, `constants.ts` (prediction block).
Tests: X1 to X3 and: (1) X2: the predictor and a `createWorld` player (vehicle parked far away: the player is teleported to the test ground's open area) agree within 1e-6 m after 600 ticks of a scripted input sequence (walk, strafe, jump, stop); (2) a wall box (via `withBoxes` course) stops the predicted player as it stops the server's; (3) the stand-in blocks: `setVehicle` at a pose in front of the player and walking into it stops within 0.05 m of the box face; moving the stand-in then walking again works (the zero-length step); (4) `stepPlayer` does not change its argument; (5) `predictedFrom` copies (mutating the result changes nothing in the snapshot); (6) `dispose` frees the world and calling `stepPlayer` afterwards throws.
Commit: `feat(shared): predictor for the local player's walking and jumping`.

### Task 4 — reconciler (`client`)
Files: `prediction/reconciler.ts`, `prediction/reconciler.test.ts`.
Tests use a fake predictor (a pure function stepping `pos.x += input.moveY` so the arithmetic is exact) and the real one in two integration cases. X4: after `correct(server, ackSeq=3)` with inputs 1..6 recorded, the predicted state is the server state plus inputs 4..6; X5: a 0.5 m correction fades (after 0.25 s the offset is `0.5·exp(−12·0.25)` ≈ 0.025 within 1e-3), a 1.5 m correction snaps (`snapped` true once, then false), a 0.001 m correction is ignored; X6: 121 recorded inputs keep 120; X7; X8; the jump flag: replay with the acknowledged input holding jump does not re-jump (press needs a release); a late snapshot (ackSeq lower than before) does not rewind the pending list below the last ack; an `ackSeq` of 0 replays everything; reset to the same state with no pending inputs changes nothing. Integration: with the real predictor, a script of 120 inputs, a server state taken from the predictor itself at tick 60, `correct` leaves the final position unchanged within 1e-9 m.
Commit: `feat(client): reconcile the predicted player with each snapshot`.

### Task 5 — game wiring and Rapier on the page (`client`)
Files: `main.ts` (`await RAPIER.init()` before the first game; import from `@dimforge/rapier3d-compat`), `game.ts`, `ui/overlay.ts`, `ui/overlay.test.ts`, `index.html` only if needed.
Scope: rule X9. Overlay gains two lines when the local player is predicted: `you      x y z   (predicted)` and `server   x y z`, formatted like the existing position line; they are omitted while suspended. Pure overlay lines are tested; the wiring is not unit tested (say so in the report).
Tests: overlay lines for predicted, suspended and before-first-snapshot.
Check: `npm run build` succeeds; record the bundle size in the report (expected about 5 MB, the Known-issues row).
Commit: `feat(client): predict the local player's movement`.

### Task 6 — browser test and documents
Files: `e2e/smoke.spec.ts`, `ROADMAP.md`, the spec.
Scope: a smoke case: one player walks forward by holding W for 1 s, releases, waits 500 ms; the overlay's `you` position and `server` position agree within 0.3 m, and the player has moved by more than 3 m; no page errors (existing watcher). Also a case with the player seated: the `you` line is absent.
ROADMAP: step 4 → `done`; delete the step-4 carried rows (bundle size noted in Known issues as now true; the snapshot-buffer rows except what is still open); log E1 to E5; update "Runnable today"; note in Working notes that feel (smoothing, snap) is for the owner to judge on a real connection, since localhost has no latency. Spec: amend "Snapshot" (E1) and "Prediction" (E3, E4).
Run: `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e` (desktop only if WebKit cannot be installed; say so).
Commits: `test(e2e): the local player is predicted`, `docs(roadmap): record step 4`.

## What the owner checks by hand
How walking feels on a real connection with latency (try a phone on the same Wi-Fi or a throttled connection): no rubber-banding on ordinary movement, corrections smooth, a snap only after a real jump in position (respawn). Report as unverified.

## Known risks to watch in review
- `stepWalk`'s extraction must not change server behaviour: the whole step-3 suite is the check.
- Rapier in the page: bundle size, and `RAPIER.init()` before the world is built (the same `import` is used by the server tests).
- The jump press needs the previous input's jump flag: a replay that forgets it re-jumps.
- The predictor's zero-length physics step must not move the stand-in or the player.
