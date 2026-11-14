# Step 11: Lobby, ready states, configuration, kick, in-run menu, admin tools, results, next course and campaign total, held slots and rejoin

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`. Read these sections:
- "Campaign and goal"
- "Final time"
- "Side objectives"
- "Conditions" (the values only; their effects come at step 13)
- `server` (Phases, Players, Held slots, Admin, Simulation)
- "Lobby" (In-run menu, Admin tools, Home page and joining)
- "Protocol" (every client message, `lobby`, `results`, `error`)
- "Menus"
- the World API (`restartCheckpoint`, `adminTool`, `skipCheckpoint`)
- Testing ("rooms", "lobby")

ROADMAP carried rows for step 11:
- `COURSE` is replaced by the lobby's choice.
- `lobby` gains `timeOfDay` and `weather`.
- Held slots replace the immediate removal.
- The admin's choice replaces `VEHICLE`.
- Names: control and invisible characters, and a newline forging overlay lines.
- A throw in the page's `lobby` handler blanks the page.
- Held slots keep health; a downed rejoin is a respawn.
- cp-0 is recorded at run start with the players present.
- The touch menu button.

This plan fixes interfaces, constants, rules and test cases. Implementers write the tests first, then the code. Where the plan and the spec disagree, or neither answers a question, stop and report.

## Goal

A room starts in the lobby. Players ready up and the admin configures and starts the run. During the run every player can open a menu, and the admin's menu has the restart, lobby, kick and admin-tool actions. Finishing shows the results with the stars and the campaign total. A player who drops keeps their slot for 30 s.

## Constants (`constants.ts`, block "Lobby")

| Name | Value | Meaning |
|---|---|---|
| `TIMES_OF_DAY` | `['dawn', 'midday', 'sunset', 'night'] as const` | `TimeOfDay` type from it |
| `WEATHERS` | `['clear', 'rain', 'sandstorm'] as const` | `Weather` type from it |
| `DEFAULT_TIME_OF_DAY` | `'midday'` | |
| `DEFAULT_WEATHER` | `'clear'` | |
| `HELD_SLOT_TIMEOUT` | 30 | s a disconnected player's slot is kept |
| `CAMPAIGN` | `['test', 'segment-demo']` | course ids in campaign order; step 16 replaces it with the real campaign |

`VEHICLE_IDS` comes from the vehicle configs (`lodgy`, `rv`). The default course is `CAMPAIGN[0]` and the default vehicle `lodgy`.

## Rules

### World (shared)

R1. **Run start.** `World.recordStart(): void` re-records cp-0 with the current players, overwriting the record made at creation. The room calls it after adding the players at `start`. This covers the carried row: a restart before cp-1 no longer heals everyone to 100.

R2. **Held players.**
- `World.removePlayer(id, mode: 'leave' | 'hold' = 'leave')`. `'leave'` is today's behaviour: the inventory drops at a spawn slot. `'hold'` removes the character, drops the hands (as today), frees the seat, and keeps `{ health, downed, inventory }` in a held map.
- `World.addPlayer(id)` for a held id restores from the held map:
  - It is placed by `findSpawn` with the held health and inventory.
  - If the player was downed, they are placed with `PLAYER_REVIVE_HEALTH` instead, and `respawns` goes up by 1, as for any respawn (frozen after the win, as in step 10 M5).
  - The entry leaves the held map.
- `World.releaseHeld(id)` drops a held player's inventory at a spawn slot (stacked as in I11) and forgets them.
- On a restart, a held entry is treated like a present player: its health becomes `max(recorded, PLAYER_RESTART_FLOOR)` (100 if not recorded), `downed` is cleared, and its inventory becomes the recorded one. A held id missing from the record keeps its inventory and gets 100 health.
- The everyone-downed rule (H7) counts only present players.

R3. **Admin tools.** `World.adminTool(tool: 'skipCheckpoint' | 'refill'): boolean` returns whether it did anything.
- `refill` sets fuel and health to 1.
- `skipCheckpoint` moves the vehicle to the next checkpoint's spawn pose and places every present player in spawn slots, unseated with empty hands. This reuses restart's placement steps, without restoring state from a record. It keeps fuel, health, inventories, props, items, coins and wallet as they are. It then records that checkpoint with the current state and sends a `checkpoint` event.
- On the last checkpoint `skipCheckpoint` does nothing and returns false.
- When the tool did something, the world sets `assisted = true`. `status()` and the snapshot gain `assisted: boolean`. The protocol checks it as a boolean.
- Neither tool does anything once the run is won.

R4. **Results data.** A pure function in `rules.ts`:

```
resultsOf(status: WorldStatus, course: { id: string; targetTime: number }, config: { vehicleId; timeOfDay; weather }): Omit<ResultsMessage, 'type' | 'campaignTotal'>
```

It fills the spec's `results` fields, using `stars(...)` with `assisted`.

### Room and server

R5. **Phases.** A room starts in `lobby` with no world.
- `start` creates the world from the room's configuration, adds every connected player in join order, adds held slots as held entries, calls `recordStart`, and enters `playing`.
- `playing` → `results` happens on the first tick whose `status().state` is `'won'`. The world then stops stepping and is kept, frozen, until it leaves `results`.
- `toLobby`, and `next`, dispose of the world and enter `lobby`. Every `ready` resets to false.
- `restartCourse` replaces the world with a fresh one, as if `start` were run again. It stays in `playing` and `assisted` resets.

R6. **Configuration.** The room keeps `{ courseId, vehicleId, timeOfDay, weather }`, defaulting to `CAMPAIGN[0]`, `lodgy`, `midday` and `clear`.
- `configure` sets all four. It is refused with `bad_message` when any value is unknown: `courseId` not in `courseIds()`, `vehicleId` not a vehicle, and time or weather not in their lists. It does not reset ready states.
- `ServerOptions` and `RoomServerOptions` lose `courseId` and `vehicleId` as run-wide settings. `main.ts` stops reading `COURSE` and `VEHICLE`, which covers the carried rows.
- Tests that need another course pass a room-level `course` override through `RoomServerOptions`, as today's tests do. List the files that change.

R7. **Client messages.** These are exactly as the spec's protocol table. Each refusal is an `error` to that client only, and no other effect.
- `ready { ready: boolean }` (lobby).
- `configure { courseId, vehicleId, timeOfDay, weather }` (admin, lobby).
- `kick { playerId }` (admin, any phase; kicking oneself or an unknown id is `bad_message`).
- `start {}` (admin, lobby, every other *connected* player ready, else `not_ready`; the admin may start alone).
- `restartCheckpoint {}`, `restartCourse {}` and `adminTool { tool }` (admin, `playing`).
- `toLobby {}` (admin, `playing` or `results`).
- `next {}` (admin, `results`, and the course is in `CAMPAIGN` and not its last; otherwise `bad_phase`). `next` sets `courseId` to the next campaign course and enters `lobby`.
- `input` outside `playing` is ignored, and `buy` outside `playing` is `cannot_buy`.

R8. **The `lobby` message.**
- It gains `timeOfDay` and `weather`.
- `phase` is the real phase.
- `players` lists every slot, including held ones, with `ready` and `connected`.
- It is sent to everyone whenever any of it changes: a join, a leave, a hold, a release, a ready change, configure, a phase change, an admin change or a kick.

R9. **Joining by phase.**
- **Lobby:** the player is added to the list only.
- **Playing:** the player is added to the world, at 100 health with an empty inventory, or restored if held (R2). They get a full snapshot.
- **Results:** the player is added to the list and sent the room's last `results` message. They get no character; the world is frozen.

The 6-slot limit counts held slots. A held slot's name stays reserved.

R10. **Held slots.**
- When a connection closes or is dropped, its slot becomes held and is marked `connected: false`. In `playing` and `results` the world gets `removePlayer(id, 'hold')`.
- A `join` with the same token within `HELD_SLOT_TIMEOUT` restores the slot: same `playerId`, colour, admin status and ready state. In `playing` it calls `addPlayer(id)` (R2).
- After `HELD_SLOT_TIMEOUT` the slot is freed: removed from the list, `releaseHeld(id)` is called if a world exists, and the name is released.
- The existing takeover (a `join` whose token matches a connected slot) is unchanged.
- An empty room's deletion timer counts connected players only, as today.

R11. **Admin handover.** The creator is the admin. When the admin's slot is freed (hold expiry or kick), the role passes to the connected player who has been connected the longest. Each slot keeps a `connectedSince`, set on join and on every rejoin. If nobody is connected, the role passes to the next player who joins. A held admin stays admin until the slot is freed.

R12. **Kick.**
- The kicked connection gets `error { reason: 'kicked' }` and is then closed by the server.
- Its slot is freed at once (no hold). If a world exists, `removePlayer(id, 'leave')` is called, so the inventory drops at a spawn slot.
- `ERROR_REASONS` must contain `kicked`, `not_admin`, `not_ready` and `bad_phase`; add any that are missing.

R13. **Results and the campaign total.**
- Entering `results` sends to everyone `{ type: 'results', ...resultsOf(...), campaignTotal? }`.
- The room keeps `finished: Map<courseId, finalTime>`, the latest final time of each course finished since the room was created.
- `campaignTotal` is the sum over `CAMPAIGN` when every campaign course has an entry. Otherwise it is omitted.
- The protocol parses the `results` message: counts, finite times, three booleans in `stars`, and `assisted` boolean.

R14. **Names** (carried row). A name is refused with `bad_message` when, after trimming, it contains any character in the Unicode categories Cc, Cf, Co, Cn, Zl or Zp. Use `/[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u`. This applies to `create` and `join`, on the server and in the home form. Look-alike letters still pass; that is logged as a known limit.

### Client

R15. **Phase routing** (`main.ts`). On each `lobby` message:
- `lobby`: show the lobby screen and stop any running game.
- `playing`: hide the lobby and results screens and start the game, if it is not running.
- `results`: keep the game drawn (frozen) and show the results screen when the `results` message arrives.

The whole `lobby` handler is wrapped in a `try/catch`. On a throw it logs the error, closes the socket, and shows "Something went wrong" on the home page, which covers the carried row.

R16. **Lobby screen** (`ui/lobby.ts`, DOM, with a pure `lobbyView(message, localId)` for the tests). It shows:
- the room link with a Copy button;
- the player list: colour, name, "admin", ready or not ready, and "(disconnected)" for held slots, with a Kick button per other player for the admin;
- the four settings: selects for the admin and plain text for others;
- a Ready toggle for non-admins;
- a Start button for the admin, enabled only when every other connected player is ready.

Element ids:

| Element | Id |
|---|---|
| Lobby screen | `#lobby` |
| Copy link | `#lobby-copy` |
| Ready toggle | `#lobby-ready` |
| Start button | `#lobby-start` |
| Course | `#lobby-course` |
| Vehicle | `#lobby-vehicle` |
| Time of day | `#lobby-time` |
| Weather | `#lobby-weather` |
| Player list | `#lobby-players` |

Errors (`not_admin`, `not_ready`, `bad_phase`) show in `#lobby-error`.

R17. **In-run menu** (`ui/runMenu.ts`).
- **Opening:** Esc opens it during `playing` when the shop menu is closed. Esc again closes it. On touch, a `#touch-menu` button in the touch UI opens it (carried row).
- **While open:** pointer lock is released (the pointer gate), and the client sends neutral input (as the shop menu does, spec "Menus").
- **Contents for everyone:** Resume.
- **Contents for the admin:** Restart from checkpoint, Restart course, Return to lobby, Skip checkpoint, Refill, and a Kick list. Each sends its message and closes the menu.
- **Ids:** `#run-menu`, `#run-resume`, `#run-restart-checkpoint`, `#run-restart-course`, `#run-to-lobby`, `#run-skip`, `#run-refill`.
- **Mutual exclusion:** the shop menu and the run menu never show together. Opening one closes the other.

R18. **Results screen** (`ui/results.ts`, with a pure `resultsText(message, vehicleNames)`). It shows:
- the final time `m:ss.s`;
- the vehicle and the conditions;
- restarts, respawns, coins `W kept, C/T collected`;
- the stars as three ★/☆;
- "assisted" when assisted;
- the campaign total when present.

For the admin it also shows "Next course" (`#results-next`, only when the course is in `CAMPAIGN` and not last) and "Back to lobby" (`#results-lobby`).

R19. **Kicked.** On `error kicked`, the page shows the home page with "You were removed from the room." It does not reconnect; there is no automatic reconnect yet.

R20. **Overlay controls line.** Add `Esc menu` to the desktop controls line. The touch line is unchanged; the menu button is visible.

## Modules and signatures

- **`constants.ts`:** the block above.
- **`world.ts`:** `recordStart`, `removePlayer(id, mode)`, held entries in `addPlayer`, `releaseHeld`, restart handling of held entries, `adminTool`, and `assisted`. **`checkpoints.ts`:** unchanged, unless held entries need it.
- **`rules.ts`:** `resultsOf`.
- **`protocol.ts`:** the new client messages, `ResultsMessage`, the `lobby` fields, `assisted` in the snapshot, the name rule, and the `ERROR_REASONS` additions.
- **`server/src/room/room.ts`:** phases, configuration, world lifecycle, held slots, admin, kick, results, campaign total.
- **`server/src/room/server.ts`:** the message cases, names, rejoin by token within the hold time.
- **`server/src/node/main.ts`:** drop `COURSE`/`VEHICLE`.
- **`client`:** `main.ts` routing, `ui/lobby.ts`, `ui/runMenu.ts`, `ui/results.ts`, `ui/home.ts` (the name rule, the kicked text), `ui/touchUi.ts` (`#touch-menu`), and `game.ts` (the run menu's neutral input and pointer gate, shared with the shop menu).

## Existing tests that change (implementers list every file they touch and why)

- **Server room and node tests** that expect a snapshot or a world right after `join`. These are `room.test.ts`, `server.test.ts`, `roomFailure.test.ts`, `node/server.test.ts`, `node/failure.test.ts` and `node/hardening.test.ts`. Each must now `start` the run first. Add a helper in `room/testing.ts`, `startRun(client)`, that sends `start` from the admin's fake client.
- **Tests that set `courseId` or `vehicleId` on the server options:** change them to room configuration or a `course` override.
- **`e2e/smoke.spec.ts` and `e2e/touch.spec.ts`:** after creating a room, the admin presses `#lobby-start`. A joining second player presses `#lobby-ready` before the admin starts. Add a helper and keep every existing assertion.
- **`world.test.ts` and the step 7 I11 tests:** `removePlayer(id)` keeps `'leave'` as its default, so they pass unchanged.

## Tests (numbered)

World:
- L1. `recordStart`: a player hurt to 40 before cp-1, with the vehicle then lost, is restored to 50 by the floor, not 100.
- L2. Held players:
  - hold, then add, restores health and inventory;
  - a downed hold, then add, gives 50 health and `respawns` +1;
  - `releaseHeld` drops the inventory at a spawn slot;
  - a restart while held updates the held entry from the record;
  - the everyone-downed rule ignores held entries.
- L3. `adminTool`:
  - `refill` sets fuel and health to 1, sets `assisted`, and returns true;
  - `skipCheckpoint` moves to cp-1, records it, sends the event and sets `assisted`;
  - `skipCheckpoint` on the last checkpoint returns false and leaves `assisted` false;
  - nothing happens after the win.
- L4. `resultsOf` fills every field; with `assisted` all stars are false.

Room and server (fake connections, fake clock):
- L5. Phases:
  - a new room is in `lobby` and sends no snapshots;
  - `start` by the admin with nobody else enters `playing`, and snapshots follow;
  - the vehicle reaching the finish enters `results` and sends `results` once, after which the world stops stepping;
  - `toLobby` returns to `lobby` with readiness reset.
- L6. Refusals, one test per row of the protocol table:
  - a non-admin `configure`, `start`, `kick`, `restartCheckpoint`, `restartCourse`, `adminTool`, `toLobby` or `next` gets `not_admin`;
  - a message in the wrong phase gets `bad_phase`;
  - `start` with a connected non-ready player gets `not_ready`, while a held non-ready player does not block it;
  - an unknown configuration value gets `bad_message`.
- L7. `configure` changes all four values, is announced in `lobby`, and keeps ready states. The run uses the configured course and vehicle.
- L8. Held slots:
  - a disconnect marks `connected: false`;
  - a rejoin by token within 30 s gets the same `playerId`, colour and admin status, and in `playing` the same health and inventory;
  - after 30 s the slot is freed, the name can be taken again, and the inventory drops in the world;
  - held slots count toward 6.
- L9. Admin handover:
  - the admin's hold expires and the longest-connected player becomes admin;
  - with nobody connected, the next joiner becomes admin.
- L10. Kick:
  - the target gets `error kicked` and is closed, and the slot is freed at once;
  - their items drop in `playing`;
  - kicking oneself gets `bad_message`;
  - this works in every phase.
- L11. Joining by phase: in `lobby` there is no snapshot; in `playing` a full snapshot and a character; in `results` the `results` message.
- L12. Results and the campaign total:
  - finishing `test` gives no `campaignTotal`;
  - `next` selects `segment-demo` and enters `lobby`;
  - finishing it gives `campaignTotal` equal to the sum;
  - finishing `test` again replaces its entry (the latest);
  - `next` on the last course gets `bad_phase`.
  - Use a short course override so the finish is reachable by `debugBody` teleport.
- L13. `restartCheckpoint`, `restartCourse` and `adminTool` through the room have their effects. `restartCourse` resets `restarts`, `respawns`, coins and `assisted`.
- L14. Names: `"a\u0000b"`, `"a\nb"`, `"a​b"` and `" "` are refused; `"Amal"` and `"Ünal"` pass.
- L15. `input` in `lobby` is ignored, and `buy` in `lobby` gets `cannot_buy`.

Protocol:
- L16. Every new client message parses, and malformed variants are rejected. `results` parses, and malformed variants are rejected. `lobby` requires `timeOfDay` and `weather` from the lists.

Client (pure parts):
- L17. `lobbyView`:
  - admin and non-admin controls;
  - Start enabled only when all other connected players are ready;
  - held players shown as disconnected, and they do not block Start.
- L18. `resultsText`: every field, the star glyphs, assisted, the campaign total present or absent, and Next shown only when allowed.
- L19. Run-menu state:
  - Esc opens and closes it;
  - it never opens with the shop menu open, and opening it closes the shop menu;
  - the admin and non-admin item lists;
  - input is neutral while it is open.

Browser:
- L20. Two pages: create, join, the second presses Ready, the admin starts, and both receive snapshots. This is the spec's browser test.
- L21. Admin flow: start, open the menu with Esc, Skip checkpoint, drive to the finish (hold W, polling the overlay's `pos` until z < −100), and the results screen shows "assisted", after which Back to lobby shows the lobby. If driving 50 m is flaky within the timeout, report it and keep the test to the menu and the skip.

## Tasks

1. **World and protocol.** R1–R4 and R13's parse, with the protocol messages and the name rule (R14) in `protocol.ts`. Tests L1–L4, L14 (protocol part) and L16.
   - Commit: `feat(shared): run start, held players, admin tools and results data`.
2. **Room: phases, configuration and results.** R5–R9 and R13, with `main.ts` dropping `COURSE`/`VEHICLE`. Tests L5–L7, L11–L13 and L15. Also adapt the existing server tests with `startRun`.
   - Commit: `feat(server): rooms have a lobby, a run and results`.
3. **Room: held slots, admin and kick.** R10–R12 and R14 (server). Tests L8–L10 and L14.
   - Commit: `feat(server): held slots, admin handover and kick`.
4. **Client.** R15–R20, with the home form name rule and the kicked text. Tests L17–L21, plus updating the existing e2e flows to start the run.
   - Commit: `feat(client): the lobby, the in-run menu and the results screen`.
5. **Documents (main session).**
   - ROADMAP: step 11 → `done`; delete the step-11 carried rows; log R1–R20; update "Runnable today" and "How to run" (no `COURSE`/`VEHICLE`; choose in the lobby).
   - Spec: `assisted` in the snapshot, `recordStart`, `removePlayer` modes, `releaseHeld`, R14's name rule, and the `CAMPAIGN` placeholder.

Each task: tests first, then a Sonnet review. Run `npm test` and `npm run typecheck` before each commit, and Playwright in task 4.

## What the owner checks by hand

- The lobby's look.
- The in-run menu.
- The results screen.
- Kick and rejoin in real browsers.
- Copying the link.

## Known risks to watch in review

- The world is created at `start`, not at room creation. Every path that touched the world before (join, input, buy, snapshot broadcast) must handle "no world".
- A run that ends in `results` while a player is mid-hold or mid-menu. The client's menus must close on the phase change.
- Room tests that relied on a world existing at join time. Adapt them; don't weaken them.

## Amendments after the plan review (binding; where they differ from the text above, they win)

A probe against the real world measured these times: a Lodgy at rest at cp-1, boarded, at full throttle, wins after 6.47 s, with its centre at z = −98.11. The whole scripted course takes 9.98 s.

N1 (R5, input queues). At `start` from `lobby`:
- every player's input queue is replaced with a fresh one, and `sentFull` is set false;
- the room's `lastSent` prop map is cleared;
- the room's `tick` and `startTime` are reset to now.

`restartCourse` keeps the queues, because the client's game keeps running and its `seq` keeps rising.

N2 (R5, ticks across worlds). Snapshot and event ticks run on without a break across the worlds of one room. The room adds to each world's tick the number of ticks its earlier worlds ran, so `snapshot.tick` never decreases within a room. After `restartCourse`, the next snapshot is full for everyone, as after a restart.

N3 (L1 replaced). L1. `recordStart`:
1. Set p1's inventory to `['jerrycan', null, null]` (`debugSetInventory`) and hurt p1 to 40. Step, then call `recordStart`.
2. Lose the vehicle before cp-1. p1 comes back at 50 health (40 raised to the floor) with the jerrycan.
3. Control, without the `recordStart` call: p1 comes back at 100 health with an empty inventory.
4. A player added after `recordStart` gets 100 health and an empty inventory.

N4 (test access to courses and the world).
- `RoomServerOptions.courses?: Readonly<Record<string, BuiltCourse>>`, tests only. It replaces the course of each id it lists, and is passed down as `RoomConfig.courses`.
- `RoomServer.debugWorld(noun: string): World | null`, tests only.
- For L5 and L12, tests build "finish at start" variants of `test` and `segment-demo`: the course with `finish` set to cp-0's trigger box, so the run is won on its first tick.
- `results.courseId` and the `finished` key are the room's configured `courseId`, never `course.id`.
- R6's phrase "as today's tests do" is void.

N5 (L21 replaced). The drive goes like this:
1. Skip checkpoint.
2. Wait for the hint `E to board`. The admin is placed in the first spawn slot at cp-1, beside the driver door.
3. Tap E, then hold W.
4. Wait up to 20 s for `#results` to be visible. It shows "assisted".
5. Back to lobby shows `#lobby`.

N6 (the `Room` interface).
```
RoomConfig: { noun: string; courses?: Readonly<Record<string, BuiltCourse>> }   // courseId/vehicleId removed
RoomPlayer gains: ready: boolean; connected: boolean; connectedSince: number; heldSince: number | null
Room gains:
  phase(): Phase
  hold(player, now): void                   // replaces remove() for a closed or dropped connection
  rejoin(player, connection, now): Connection | null   // held or connected slot; returns the old connection, if any
  expireHeld(now): void                     // called on the server's tick; frees slots with now - heldSince >= HELD_SLOT_TIMEOUT
  kick(by, playerId): ErrorReason | null    // on success the server sends 'kicked' to the target and closes it
  setReady(player, ready): ErrorReason | null
  configure(by, settings: RoomSettings): ErrorReason | null
  start(by) / restartCheckpoint(by) / restartCourse(by) / adminTool(by, tool) / toLobby(by) / next(by): ErrorReason | null
  debugWorld(): World | null                // tests only
```
- `testing.ts` gets `startRun(client: FakeClient)`, which sends `{ type: 'start' }`.
- `room.test.ts` calls `room.start(admin)` instead.
- A kick frees the slot through its own path.
- `RoomSettings` is `{ courseId; vehicleId; timeOfDay; weather }`.

N7 (existing tests that change; this replaces the plan's list).
- Task 1a/1b. These break typecheck as soon as the protocol changes.
  - `shared/src/protocol.test.ts`:
    - add `timeOfDay`/`weather` to the `lobby` fixture and `assisted` to the `snapshot` fixture;
    - the "unknown reason" case uses `"kicked"` today; change it to `"banned"`.
  - `client/src/net/snapshotBuffer.test.ts`: the snapshot fixture gains `assisted: false`.
  - `client/src/ui/overlay.test.ts`: the `lobby` fixture gains the two fields.
  - `server/src/room/room.ts`: `broadcastLobby` sends the defaults for the two fields.
  - `server/src/room/server.test.ts`: the first test's exact `lobby` gains the two fields.
  - `client/src/ui/home.ts`: `ERROR_TEXT` gains the four new reasons.
- Task 2a.
  - `server.test.ts`:
    - call `startRun` first in the tests that expect snapshots or a world (around lines 335, 348, 360, 379, 389, 400, 432, 466, 486, 499, 512, 528 and 764);
    - delete "runs the configured vehicle" and "unknown course or vehicle refused at creation";
    - the first test expects `phase: 'lobby'`.
  - `room.test.ts`: every test calls `room.start(admin)` after the joins.
  - `roomFailure.test.ts`: the two tests that count snapshots start the room first.
  - `node/server.test.ts`:
    - delete "a server started with a course id";
    - in the input test, amal sends `start` first.
  - `node/listen.ts`: `ServerOptions` loses `vehicleId`/`courseId`.
- Task 3. The `server.test.ts` tests that assume a disconnect removes the slot at once (around lines 181, 192, 202, 553, 615 and 715) are rewritten:
  - the slot is listed with `connected: false` until `HELD_SLOT_TIMEOUT`, then removed;
  - the admin handover happens after the slot expires.
- Task 4a/4b.
  - `overlay.test.ts`: the exact desktop controls line gains `Esc menu`.
  - `e2e/touch.spec.ts`:
    - the touch UI appears only after Start, and `menu` joins the visible buttons;
    - the four run tests start the run first.
  - `e2e/smoke.spec.ts`:
    - the 11 run tests start the run first; the three that stay on the home page or in the lobby are unchanged;
    - in the two-player test, Badr presses Ready and then Amal presses Start;
    - the mid-run join test joins after the start, so no Ready is needed there.

N8 (R5, held slots at start). Held slots are not added to the world at `start`. A held slot that rejoins during `playing` is added by `addPlayer(id)`. For an id with no held entry, that makes a new player at 100 health with an empty inventory. `forgetHeld` of an id with no held entry does nothing.

N9 (R2, restart). On a restart, each held entry is restored like a present player:
- health `max(recorded, PLAYER_RESTART_FLOOR)`, or 100 if not recorded;
- `downed` cleared;
- inventory set to the recorded one, or empty if not recorded.

Held ids are skipped by the departed-player drop. A held player's rejoin as a respawn queues a `respawn` event. R2's `releaseHeld` is renamed `forgetHeld`, because `player.ts` already has an internal `releaseHeld`.

N10 (R3, skipCheckpoint). Factor a helper `placeCrew(index, fuel, health)` out of `restart`. It runs these steps in order:
1. `winch.stow()`.
2. For each player: `releaseHook(id, 'stow')`, `setHands(id, null)`, `hold = null`, `respawnIn = null`.
3. `takePushIntents()`, then unseat everyone.
4. `vehicle.resetTo(cp.spawn, fuel, health)`.
5. Two zero-length physics steps.
6. For each player: `setSeat(id, null, findSpawn(id))` and `hitCooldown.clear()`.
7. `resetLastTick = ∅`, `cableTension = 0`.

`restart` calls it, with the props, items and coins restore between steps 4 and 5. `skipCheckpoint` calls it with `vehicle.fuel()` and `vehicle.health()`.

Rules for `skipCheckpoint`:
- A downed player stays downed and keeps their timer.
- A prop whose box overlaps the vehicle's new spawn box goes to its own spawn. Other props and items stay where they are.
- It applies at once, as `buy` does. Its `checkpoint` event goes into `queuedEvents`, stamped `tick + 1`.
- The room makes the next snapshot full for everyone when `adminTool('skipCheckpoint')` returns true (spec: "full … after any restart or skip").

`refill` returns true whenever the run is not won, even when the tank and health are already full.

N11 (L3's last-checkpoint case). Record cp-1 by placing the vehicle in its trigger with `debugBody` and stepping. Then `skipCheckpoint` returns false and `assisted` stays false.

N12 (R5, the win sequence and sends).
- On the win tick the room stops stepping, even if more ticks are due in that update. It then sends, in order: a snapshot at once (outside the 20 Hz cadence), `lobby` with `phase: 'results'`, and `results`.
- No snapshots are sent in `lobby` or `results`.
- A join or rejoin in `results` gets `welcome`, then `lobby`, then the stored `results`.
- Held slots are skipped for sends.
- The pause and empty checks in `update` count connected players only.

N13 (R7, refusals and validation).
- `configure`, `adminTool` and the other new messages are shape-checked in `parseClientMessage`:
  - course ids against `courseIds()`;
  - vehicles against `VEHICLE_IDS`;
  - times and weathers against their lists.
- Anything malformed gets `bad_message` before any other check.
- The room then checks, in this order:
  1. `not_admin`;
  2. `bad_phase`;
  3. `not_ready`, or `bad_message` (an unknown or own `playerId` for `kick`).
- A lobby or admin message from a connection that is not in a room gets `bad_message`.
- The admin may send `ready`; it is stored and ignored.
- Kicking a held slot frees it, with no message sent.
- R11's "next player who joins" includes a held player who rejoins.
- R10's rejoin keeps the slot's name and ignores the name in the `join`.

N14 (client: routing, errors and Esc).
- Phase `results` with no running game (a player who joined during results) shows only the results screen.
- `not_admin`, `not_ready`, `bad_phase` and `bad_message` received while in a room go to `#lobby-error` when the lobby is showing, and are logged otherwise. They never reach the home page.
- On `error kicked`, set the close text to "You were removed from the room." and do not call `home.setError`.
- An Esc that closes the shop menu does not open the run menu.
- Every menu closes when the phase leaves `playing`.
- Losing pointer lock during `playing` opens the run menu, when no menu is open and the game did not release the lock itself. Browsers may swallow the Esc that releases the lock. The owner judges this behaviour.

N15 (client pure APIs and ids).
- `resultsView(message: ResultsMessage, isAdmin: boolean): { lines: string[]; showNext: boolean; showLobby: boolean }`. It replaces `resultsText`.
- `runMenuState(prev, event: 'esc' | 'button' | 'resume' | 'shopOpened' | 'phaseLeft', shopOpen: boolean): { open: boolean }`.
- `runMenuItems(isAdmin: boolean): string[]`.
- While either menu is open, input is `menuInput(shopOpen || runOpen, …)`.
- Element ids:
  - kick buttons: `#lobby-kick-<playerId>` and `#run-kick-<playerId>`;
  - the room link: `#lobby-link`;
  - the touch menu button: `#touch-menu`.
- Labels: the vehicles are 'Lodgy' and 'RV' (a client constant); courses are shown by id.

N16 (more tests).
- L22 (task 2b, `node/server.test.ts`): create, join, ready, start, board, then hold the throttle until `results` arrives, which takes about 10 s. The test timeout is 30 s. This is the spec's integration test.
- L8 adds, at room level: a downed player's rejoin gives 50 health and `respawns` +1.

N17 (task split, replacing "Tasks" 1, 2 and 4).
- 1a. World: R1–R3 (N3, N8–N11). Tests L1–L3.
- 1b. Protocol and rules: R4, R13's parse, R14, and the task 1 fixture changes in N7. Tests L4, L14 (parse) and L16.
- 2a. Room lifecycle: phases, configure, ready, start, toLobby, restartCourse, join by phase, N1, N2, N4, N6, N12 and N13, the options and `main.ts`, and adapting the existing tests (N7). Tests L5–L7, L11 and L15.
- 2b. Results: the results message, the campaign total, `next`, and the restartCheckpoint and adminTool wiring. Tests L12, L13 and L22.
- 3. Held slots, admin and kick, as before.
- 4a. Routing, the lobby screen, the kicked text, the e2e start helper and all e2e adaptations. Tests L17 and L20.
- 4b. The run menu, `#touch-menu` and the controls line. Test L19.
- 4c. The results screen. Tests L18 and L21.

The commit messages per task are the implementer's, in the plan's style.

N18 (minor).
- Add `export const VEHICLE_IDS = Object.keys(VEHICLES) as VehicleId[]` to `vehicles.ts`.
- L14 uses escapes: `"a\u0000b"`, `"a\nb"`, `"a​b"`, `"a b"`. A bare `" "` is trimmed away.
- R14 lives in `cleanName` (task 1b), so the home form gets it as well. A name refused for a character gets its own home text: "Names cannot contain control or invisible characters."
- R4's config type is `{ vehicleId: string; timeOfDay: TimeOfDay; weather: Weather }`.
- Assisted runs count toward `campaignTotal`.
- `WorldOptions` gains `weather` at step 13, not now.
- Task 5's spec edits also rewrite the build-order note about `VEHICLE=rv` before the lobby.

N19 (found in the branch review: rebuilding the world without limit).
- New constant `WORLD_REBUILD_COOLDOWN = 1`, in s.
- A `start` or `restartCourse` that arrives less than that long after the room last built a world is refused with `bad_phase`.
- `configure` with no change in its settings, and `ready` with no change, do not broadcast `lobby`.

Without this, an admin could rebuild a world (0.8–1.7 ms each) at up to 120 messages per second.
