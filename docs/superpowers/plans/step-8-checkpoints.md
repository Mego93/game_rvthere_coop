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
