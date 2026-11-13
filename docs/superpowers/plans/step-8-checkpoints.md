# Step 8: Checkpoints and restart, vehicle loss, win rule, timer

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md` (sections "Losing the vehicle: checkpoint restart", "Campaign and goal", "Player health" (kill-plane respawn counted), "shared" (`restartCheckpoint`, `status`, tick order), "Snapshot", "Unit tests" (checkpoints, tick order, rules)). This plan fixes interfaces, constants, rules and test cases. Implementers write the tests first, then the code. Where the plan and the spec disagree, or neither answers a question, stop and report (CLAUDE.md, "When something is not specified").

## Goal

The run has a timer, checkpoints and a finish. Entering a checkpoint's trigger records the run's state there. Losing the vehicle (health 0, or its centre below the kill plane) restarts from the last checkpoint with the state recorded there; a world call does the same by hand (the admin's button arrives at step 11). Reaching the finish wins: the timer stops and the snapshot says so.

Not in this step: player health, downed players and health-kit revival (9; the restart's player-health and revive rules are written here as hooks that step 9 fills), coins and the wallet (10), final time, stars and the results screen (10, 11), the admin tools `skipCheckpoint` and `refill` (11), events sent to clients (9).

## Decisions made in this plan (log them in `ROADMAP.md` in the last task)

K1. `cp-0` is recorded when the world is created (run start). A checkpoint with a higher index is recorded the first time the vehicle's centre is inside its trigger box (oriented box test). Checkpoints are recorded in any order the vehicle reaches them, but a checkpoint whose index is not higher than the last recorded one is never recorded again; "the last checkpoint" is the most recently recorded one.
K2. A record holds: the checkpoint's index; the vehicle's fuel and health; every prop's pose (held props: their current pose); every item in the world (id, kind, pose); every player's inventory and selected slot, by player id. Step 9 adds player health; step 10 adds coins and the wallet.
K3. Restart (lost vehicle or `restartCheckpoint()`), in this order:
  1. The winch is stowed; held props are released; every hold is cleared; push intents are dropped.
  2. The vehicle is placed at the checkpoint's spawn pose (raised by its ride height along the pose's up) with zero linear and angular velocity; its fuel and health become `max(recorded, RESTART_FLOOR)`; its impact tracking restarts (no impact from the teleport).
  3. Props return to their recorded poses at rest (heavy ones locked). A prop whose recorded box would overlap the vehicle's box at the spawn pose returns to its own course spawn instead.
  4. Items: every item body is removed; the recorded items are recreated with their recorded ids, kinds and poses, at rest. The `item-N` counter is not rewound.
  5. Players, in join order: unseated, placed in spawn slots around the vehicle (the existing `findSpawn`), at rest, hands empty. A player present in the record gets the recorded inventory and slot; a player who joined after the record gets an empty inventory and slot 0. A player in the record who has since left: their recorded items are dropped (as new items) at the checkpoint's spawn pose, stacked `DROP_HEIGHT` apart upward from `DROP_HEIGHT`.
  6. `restarts += 1`; the world returns a `restart` event for that tick.
K4. Tick order gains steps 7–9 after the kill planes: (7) record a checkpoint if one was entered; (8) if the vehicle is lost, restart; (9) if the vehicle was not lost this tick and its centre is inside the finish box, the run is won. Once won, the timer stops and steps 7–9 no longer run; the simulation keeps stepping (players can still walk) until step 11's results phase takes over.
K5. The timer: `elapsed` counts `TICK_DT` per tick from run start while not won. It keeps running through restarts (the 60 s penalty is added in the final time at step 10, not to `elapsed`).
K6. A player's kill-plane respawn counts one respawn (`respawns += 1`), as the spec's player-health section says; step 9 adds the downed-respawn counts.
K7. The snapshot gains `elapsed`, `checkpoint` (index of the last recorded), `checkpointCount`, `restarts`, `respawns`, and `won: boolean`. `won` is not in the spec's snapshot: it lets the page show the finish before step 11's results message exists. Spec section "Snapshot" is amended.
K8. The room sends a `full` snapshot to every client on the tick after a `restart` event (the spec's "after any restart").
K9. `World` gains `restartCheckpoint(): void` (the spec's API) and `status(): { state: 'running' | 'won'; elapsed: number; restarts: number; respawns: number }`.

## Constants (`constants.ts`, block "Checkpoints")

| Name | Value | Meaning |
|---|---|---|
| `RESTART_FLOOR` | 0.5 | fuel and vehicle health restored at least to this |

## Modules and signatures

### `shared/src/checkpoints.ts` (new)
```ts
export interface CheckpointRecord {
  index: number;
  fuel: number; health: number;
  props: Map<string, Pose>;
  items: { id: string; kind: ItemKind; pose: Pose }[];
  players: Map<string, { inventory: (ItemKind | null)[]; slot: 0 | 1 | 2 }>;
}
export function insideBox(point: Vec3, box: Box): boolean        // oriented box test, pure
export function enteredCheckpoint(course: BuiltCourse, vehicleCentre: Vec3, lastIndex: number): number | null   // K1, pure: the highest-index checkpoint above lastIndex containing the point, or null
```
`items.ts` gains `restore(list)` (removes every body, recreates the given ones with their ids) and `poses()` for the record; `props.ts` gains `placeAtRest(id, pose)` (release if held, pose, zero velocities, heavy locked); `vehicle.ts` gains `resetTo(pose: Pose, fuel: number, health: number)` (pose with ride height, zero velocities, impact baseline reset); `player.ts`' `Players` gains `restoreInventory(id, inventory, slot)`.

### `world.ts`
K3–K5, K9, snapshot fields (K7). `removePlayer` keeps the departed player's record entry (the record is not changed by removal).

### `protocol.ts`
Snapshot checks: `elapsed` finite ≥ 0; `checkpoint`, `checkpointCount`, `restarts`, `respawns` counts; `won` boolean.

### Room
K8. Client overlay: `time     m:ss.s   cp 1/2   restarts 0   respawns 0`, and `FINISHED` on its own line when `won`.

## Behaviour rules
- R1 K1 recording; R2 K3 restart; R3 K4 tick order and win; R4 K5 timer; R5 K6 respawn count; R6 K7 snapshot; R7 K8 full snapshot after restart.

## Tasks

Each task: tests first, then code; then a Sonnet review. Run `npm test` and `npm run typecheck` before each commit. Every earlier test passes unchanged unless named.

### Task 1 — recording, timer, win (`shared`)
Files: `constants.ts`, `checkpoints.ts` (new), `checkpoints.test.ts` (new), `world.ts`, `protocol.ts` (types), `scenarios.test.ts`, and every `WorldSnapshot`/`SnapshotMessage` literal broken by the new fields (grep; list them).
Tests: `insideBox` (axis-aligned and rotated); `enteredCheckpoint` (none, one, skipping to a higher one, never a lower or equal); world: (1) `cp-0` recorded at creation (`checkpoint` 0); (2) driving into `cp-1`'s trigger records it once (one `checkpoint` event; re-entering does nothing); (3) `elapsed` equals ticks × `TICK_DT` within 1e-9; (4) the vehicle's centre entering the finish wins, `elapsed` then stays fixed, `status().state === 'won'`, the snapshot's `won` true; (5) a respawn from the kill plane counts one; (6) carried row: the scripted driver of the existing scenario (two players board, the driver drives the Lodgy down the course) now also records `cp-1` and wins within 40 s; the test ground's ramp: the Lodgy at full throttle from z = −40 at x = 8 crosses the ramp and lands upright (up·Y > 0.9 one second after landing).
Commit: `feat(shared): checkpoints are recorded and the finish wins`.

### Task 2 — restart (`shared`)
Files: `world.ts`, `vehicle.ts`, `props.ts`, `items.ts`, `player.ts`, `winch.ts` if needed, `checkpoints.test.ts`.
Tests (each restart via both causes unless noted): (1) the vehicle pushed below the kill plane (`debugBody`) restarts at the last checkpoint's spawn at rest, `restarts` 1, a `restart` event; (2) health 0 (`debugVehicle().repair(-1)`) restarts; fuel recorded at 0.3 is restored to 0.5, recorded 0.8 stays 0.8; (3) `restartCheckpoint()` restarts and counts; (4) props: a crate moved after the record returns to its recorded pose at rest; a crate moved onto the vehicle's spawn box before the record returns to its own spawn; a held crate is released; (5) items: one picked up after the record is back on the ground and gone from the inventory; one picked up before stays in the inventory; one dropped after is removed; (6) players: seated players are unseated into spawn slots; hands empty; hook stowed (attached before the restart); holds cleared; a late joiner has an empty inventory; a departed player's recorded jerrycan appears at the checkpoint spawn pose; (7) tick order: a course override whose finish box lies below the kill plane under a gap — the vehicle entering it is lost that tick and does not win; (8) determinism: two worlds given the same inputs through a restart give equal snapshots.
Commit: `feat(shared): restart from the last checkpoint`.

### Task 3 — protocol, room, client
Files: `protocol.ts` (+test), `server/src/room/room.ts` (+test: a restart makes the next snapshot full for every client), `client/src/net/snapshotBuffer.ts` (copy the new top-level fields from the newer snapshot; +test), `client/src/ui/overlay.ts` (+test), the `WorldSnapshot` literals in client tests.
Commit: `feat(client): show the timer, checkpoints and the finish`.

### Task 4 — browser test and documents
Smoke: the overlay shows `time` rising and `cp 0/2`. ROADMAP: step 8 → `done`; delete the step-8 carried row; log K1–K9; "Runnable today"; spec amendment K7.
Commits: `test(e2e): the timer runs`, `docs(roadmap): record step 8`.

## What the owner checks by hand
A restart's look (players and vehicle jumping back), the timer, the finish.

## Known risks to watch in review
- Restart ordering: items and props restored before players are placed (spawn slots test for overlap with props).
- A restart on the same tick as a kill-plane respawn or a hold completion.
- Predicted local player after a restart: the reconciler snaps (correction above 1 m).

## Amendments after the plan review (binding; where they differ from the text above, they win)

Q1. Restart step 4b: after the vehicle, props and items are placed, the world runs two zero-length physics steps (timestep 0, then `TICK_DT` restored) so queries see the new poses (Rapier 0.21, as in the predictor), then places players. Task 2 test (6) asserts no player capsule overlaps the vehicle or a restored crate, and test (1) that health is unchanged and velocities stay zero over the 10 ticks after a restart.
Q2. `restartCheckpoint()` sets a pending flag; tick step 8 restarts if the vehicle is lost or the flag is set, and the event comes from `step()`. It does nothing once won. Test: the restart happens on the next `step` and its event is returned there.
Q3. The record stores each prop's and item's body **centre** and rotation (`centre`, `rot`), not the bottom-face pose; `props.placeAtRest(id, centre, rot)` and `items.restore(list)` set the body centre directly. `items.restore` recreates items in the recorded order (course pickups first, then by counter); the record takes its list from `items.snapshot()` (no separate `poses()`).
Q4. A prop held at record time is recorded at its course spawn (centre per `propCentre`), like `resetHeld` on a respawn. Test (4) covers it.
Q5. `checkpoints.ts` gains a pure `boxesOverlap(a: Box, b: Box): boolean` (oriented, separating axis, touching is not overlapping), tested axis-aligned, rotated and separated on a cross axis; K3 step 3 uses it against the vehicle's box at the spawn pose (centre raised by `rideHeight` along the pose's up, `config.halfExtents`).
Q6. `Players` gains `setFallbackSpawn(pos: Vec3)`; the world calls it on every record with the checkpoint's spawn position, so "no valid slot" falls back to the last checkpoint (the spec's rule). Test.
Q7. K3 step 5 order: first, for every player in join order, the hook is stowed (`releaseHook(id, 'stow')`), hands cleared, holds cleared and `respawnIn` cleared (no respawn counted); then every player is unseated; then each is placed with `setSeat(id, null, findSpawn(id))` in join order. Test: a player mid kill-plane respawn at a restart is placed in a slot and `respawns` does not change.
Q8. The selected slot is owned by the client (the input sets it each tick): the record and `restoreInventory` hold the inventory only.
Q9. Events: every restart emits `{ kind: 'vehicleLost', tick }` (also a manual one); recording a checkpoint after creation emits `{ kind: 'checkpoint', tick, pos }` with the vehicle's centre; none at creation.
Q10. K8: the room keeps whether any tick since its last broadcast returned a `vehicleLost` event; the next broadcast is then full for every client and `lastSent` is cleared and refilled as when ids change. Room test: a `course` override whose cp-0 spawn sits over a gap (no ground below), so the vehicle falls below the kill plane; after the restart the next snapshot is full for every client.
Q11. Task 4 adds carried rows to `ROADMAP.md`: step 9 — a restart restores player health with the 50% floor, revives downed players, gives late joiners 100 health, with the spec's unit tests; step 10 — the record and restore include coins and the wallet.
Q12. Tests to change: `client/src/net/snapshotBuffer.test.ts` (typed `SnapshotMessage` builders) in Task 1; `protocol.test.ts` snapshot literal and `overlay.test.ts` literals in Task 3; `scenarios.test.ts` scripted driver: loop until `status().state === 'won'` and assert `cp-1` was recorded.
Q13. Test (7): a course override with `finish` centred at y = −30, half height 5 (top at −25, below `killPlaneY` −20); the vehicle is moved there with `debugBody().setTranslation`; it is lost, not won. Variant: `repair(-1)` on the tick the vehicle enters the normal finish: lost, not won.
Q14. Task 2 test (4) "a crate on the vehicle's spawn box": `withProps(testGround, [crate-9 at (8, 0, −40)])`; before recording cp-1, teleport crate-9 onto (0, 0.3, −50); move the vehicle with `debugBody` to (5, 0.95, −50) inside cp-1's trigger so cp-1 records (with crate-9 overlapping the spawn box); then restart: crate-9 is at its own spawn (8, 0.3, −40).
Q15. Task 1 test (6) ramp uses `createRig` (in a World the x = 8 path crosses cp-1 and the finish). "Crosses": some tick with no wheel in contact at z < −60; "landing": the first later tick with at least two wheels in contact; at landing + 60 ticks up·Y > 0.9.
Q16. `elapsed = runTicks · TICK_DT` from an integer count; the winning tick counts. After a win nothing restarts.
Q17. Task 2 tests name their cause: (1) kill plane, (2) health 0, (3) manual; (4)–(6) use the manual restart after recording cp-1 via a `debugBody` teleport into its trigger.
Q18. Module split as in the spec: `rules.ts` (new) holds the pure win check, vehicle-lost check and timer helpers; `checkpoints.ts` holds the record, `enteredCheckpoint`, `insideBox`, `boxesOverlap`; `world.ts` wires them.
Q19. Overlay: `cp N/M` shows the last recorded index + 1 (cp 1/2 at the start); time `m:ss.s` floors to tenths; the snapshot buffer gains `latestStatus(): { elapsed, checkpoint, checkpointCount, restarts, respawns, won } | null`.
Q20. Recording (step 7) runs before the lost check (step 8), as the spec orders: a vehicle entering a trigger on the tick its health reaches 0 records that checkpoint at health 0 and restarts there at 0.5. Accepted.
