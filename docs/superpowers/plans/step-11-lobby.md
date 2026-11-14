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
