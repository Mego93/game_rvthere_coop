# Roadmap

Single source of truth for where the project stands. Update it in the same commit that finishes a step.

- Design: [`docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`](docs/superpowers/specs/2026-11-11-lodgy-coop-design.md)
- Plans: `docs/superpowers/plans/step-N-<slug>.md`, written when a step starts

## Current state

**Current step:** step 3 is done (branch `claude/busy-brown-wkdjue`, merge to `main` pending). Next action: write the plan for step 4. The owner still has to check the rendering, the feel and the iPhone load (see "Working notes").

**Runnable today:** `npm run dev` starts the game server and the page. Create a room on the home page and share its address; everyone who opens it appears as a character beside the same vehicle on the test ground. Players walk (WASD) and jump (Space), board with E at the nearest free seat (the driver's seat if standing at its door), drive from the driver seat, and leave with E. After clicking the canvas, the mouse looks around from a shoulder camera with a crosshair; while seated the camera follows the vehicle.

## Steps (spec 1: engine and course 1)

Status values: `todo`, `planned` (plan written), `in progress`, `done`, `needs sign-off` (built, awaiting a manual check by the owner).

| # | Step | Status | Branch | Plan | Sign-off |
|---|---|---|---|---|---|
| 1 | Workspace scaffold, Rapier passed into `shared`, test ground, both vehicle configs as boxes, drivable in one tab, keyboard input, text overlay, force-based cable experiment | done | step-1-scaffold-and-drivable-vehicle | [plan](docs/superpowers/plans/step-1-scaffold-and-drivable-vehicle.md) | Automated tests |
| 2 | Server (`room` layer and `node` adapter), validation, rate limit, liveness, home page, create and join by noun, snapshots, interpolation, Playwright test begins | done | step-2-server-rooms-snapshots | [plan](docs/superpowers/plans/step-2-server-rooms-snapshots.md) | Automated tests |
| 3 | Server-side players on foot: movement, moving bodies, shove-out, spawn slots, seats, kill-plane respawn; shoulder camera and crosshair; iPhone load check | done | claude/busy-brown-wkdjue | [plan](docs/superpowers/plans/step-3-players-on-foot.md) | Automated tests |
| 4 | Client prediction of walking and jumping | todo | | | Automated tests |
| 5 | Push, hands, light debris, heavy obstacles, prop kill plane | todo | | | Automated tests |
| 6 | Winch | todo | | | Automated tests |
| 7 | Vehicle fuel, health and damage; inventory; jerrycans and toolboxes; hold actions | todo | | | Automated tests |
| 8 | Checkpoints and restart, vehicle loss, win rule, timer | todo | | | Automated tests |
| 9 | Player health, damage, downed state, health kits, revival and respawn | todo | | | Automated tests |
| 10 | Service stops, coins, shops and shop menu, final time and side objectives | todo | | | Automated tests |
| 11 | Lobby: ready states, configuration, kick, in-run menu, admin tools, results, next course and campaign total, held slots and rejoin | todo | | | Automated tests |
| 12 | HUD: mock-up pass, then compass, minimap, gauges, slots, prompts and downed markers | todo | | | Owner, visual check |
| 13 | Conditions: rain grip, time-of-day and weather visuals | todo | | | Owner, visual check |
| 14 | Touch input, floating joystick, touch UI, landscape layout, web app manifest | todo | | | Owner, on a real iPhone |
| 15 | Segment system: six segment builders and the course builder | todo | | | Automated tests |
| 16 | Course design pass, then course 1 (to the airport); measure snapshot size | todo | | | Owner, by playing it |
| 17 | The RV: mesh and handling pass over course 1 | todo | | | Owner, by playing it |
| 18 | Sound effects | todo | | | Owner |
| 19 | Reconnect polish, WebGL context-loss reload, Cloudflare Tunnel setup, always-on hosting decision | todo | | | Owner |

## Later specs

Not designed yet. Each gets its own spec when spec 1 is done.

| Spec | Content |
|---|---|
| 2 | Forks that rejoin; mountain segment types; course 2 (Ourika valley); course 3 (Atlas); vehicle power-ups; shortcut gates |
| 3 | Longer courses (1 hour or more) |
| 4 | Team versus |

## How to run and test

Requires Node 22.12 or later. Node 23 and 25 work but print an `EBADENGINE` warning on install, because Vitest lists only the even-numbered releases.

| Command | What it does |
|---|---|
| `npm install` | Installs every package in the workspace |
| `npx playwright install chromium webkit` | Downloads the two browsers the smoke test uses; needed once |
| `npm run dev` | Starts the game server on port 3000 and the page with live reload. Open the address Vite prints, normally `http://localhost:5173/`; it also prints the address for other devices on the same Wi-Fi |
| `npm start` | Builds the page and serves everything on one port, `http://localhost:3000/`. This is the mode for play sessions and for the tunnel |
| `npm test` | Runs all unit, scenario and server integration tests once |
| `npm run test:watch` | Runs tests on every change |
| `npm run e2e` | Runs the browser smoke test; it starts its own server on port 3100 |
| `npm run typecheck` | Typechecks every package, config, experiment and the smoke test |
| `npm run build` | Builds the client into `packages/client/dist` |
| `npm run experiment:cable` | Re-runs the winch cable experiment and prints its table |

Set `PORT` to change the server's port when using `npm start`; `npm run dev` expects port 3000, because the page's proxy is fixed to it. Set `VEHICLE=rv` to run every room with the RV: `VEHICLE=rv npm run dev`.

In the page: WASD to walk, Space to jump, E to board or leave a seat, click the canvas and move the mouse to look. Seated in the driver seat: WASD to drive, Space to brake. Nobody is seated at the start; press E beside the vehicle.

## Working notes (for every session)

What step 2 cost and what changed because of it. Estimates are rough, plus or minus 50%.

- **Step 2:** about 5 hours of active execution plus planning, and the usage limit was hit twice (about three 5-hour windows). Roughly 45 subagent runs and 2.6 million tokens, nearly all on Sonnet. Seven of ten tasks needed a fix round, and every one traced back to a gap in the plan. The largest cost was the main session (Fable) writing and verifying all the code before the subagents copied it.
- **From step 3:** plans fix interfaces, constants, numbered rules and numbered test cases, and contain no finished code; a plan is reviewed once by Opus before implementation. See `CLAUDE.md`, "Plans" and "Models".
- **Time per task:** a clean task takes about 5 minutes (implementation 1 to 1.5, review 1.5 to 2.5). A fix round adds 15 to 25 minutes, mostly designing and checking the fix.
- **Remaining steps, active hours each:** steps 3, 5, 7, 11, 15 about 7 to 9; steps 4, 6, 8, 9, 10, 12, 14, 16, 19 about 4 to 6; steps 13, 17, 18 about 2 to 3. In total about 80 to 110 hours, or 25 to 35 five-hour windows, not counting the owner's own time on the sign-off steps (12, 13, 14, 16, 17, 18).
- **Where to look for savings:** let Sonnet write the code (done from step 3), review the plan before implementing (done from step 3), and run the dispatch-and-verify loop on a cheaper model while Fable keeps planning and designing fixes.
- **Waiting on the owner:** the real-iPhone checks. Open for step 3: the page loads over the same Wi-Fi on a real iPhone, renders, and shows both players (nobody has tried it; only WebKit with an iPhone viewport ran in the smoke test). Touch controls follow at step 14.
- **Step 3 is unverified by hand:** rendering and game feel (walking, jumping, the shoulder camera, how the characters look, the crosshair) and the iPhone load were not checked; they are for the owner. Automated tests pass. The smoke test ran in Chromium only in the session that wrote it (Playwright's browser download was blocked there, so the system Chrome was used); the WebKit phone project was not run.

## Known issues

- A braked vehicle creeps at under 0.1 m/s on the steep (25°) reference slope. The wheel model causes it; a scenario test bounds it.
- The production bundle is about 0.5 MB. It returns to about 5 MB at step 4, when client prediction brings Rapier back into the page.
- A vehicle that has rolled over or is stuck cannot be recovered yet: create a new room. Pushing arrives at step 5, the winch at step 6 and checkpoint restart at step 8.
- Reloading the page, or losing the connection, returns the player to the name form. Joining again usually makes a new player, because the server removes a disconnected player at once; if the server has not yet seen the old connection close, the same tab takes its old place back. Held slots arrive at step 11 and automatic reconnection at step 19.
- The RV cannot pull away from rest on sand, by the owner's decision (it is how a heavy road-going motorhome behaves): sand's rolling resistance (0.25 × its weight, about 9200 N) exceeds its engine force (7500 N), so it stays put in either direction until it is pushed or winched out. Arriving with speed it crosses: by arithmetic it loses about 0.45 m/s² and a 30 m patch costs it under 2 m/s from 15 m/s, not yet confirmed by a test. The Lodgy crawls through. The test "sand slows it" passes for the RV at zero distance and is replaced in the rows below.
- The local player is drawn from interpolated snapshots, so it lags its own input by the interpolation delay until client prediction arrives in step 4.
- Nobody can climb onto the vehicle's roof yet (D11): the Lodgy's roof is 1.5 m up and a jump reaches 1.27 m. Props at step 5 give players something to climb.

## Carried into later steps

Findings from reviews that belong to a later step. Each step's plan must cover its own rows, and the step deletes them when done.

| Step | Item |
|---|---|
| 4 | The page no longer bundles Rapier; prediction brings it back, and the bundle size with it |
| 4 | Snapshot buffer: after the server discards a backlog the view holds the newest snapshot until the offset converges (5% per snapshot). Test `ackSeq` through the neutral substitute |
| 5 | The RV is bogged on sand from rest by design: replace the test "sand slows it" for the RV with "from rest on sand it stays within 0.5 m for 10 s" and "entering the sand patch at 12 m/s it crosses", and use pushing and the winch to get it out |
| 6 | Use the tension formula of `experiments/cable/cable.experiment.ts` exactly, or re-run the sweep. Test near the stall angle as well as at 25°, add a test tying stiffness to reel speed, and test the 25 m maximum length and the test ground's anchor |
| 7 | A vehicle at rest reports a vertical speed of about −0.06 m/s; impact thresholds and "at rest" checks must allow for it |
| 8 | Test the test ground's ramp, finish and trigger boxes when checkpoints first use them |
| 16 | Every sand segment must give the RV a run-up: it cannot start from rest on sand, and a stop on sand (a service stop, a checkpoint restart) would trap it. The spec's rule that the RV completes every segment includes this |
| 11 | `lobby` gains `timeOfDay` and `weather`; held slots replace the immediate removal of a disconnected player; the admin's choice replaces `VEHICLE` |
| 11 | Names are only trimmed and length-checked: control and invisible characters and look-alike letters pass, and a newline in a name forges lines in the debug overlay on other players' pages. A throw in the page's `lobby` handler leaves the page blank |
| 14 | The home form on a real iPhone: no zoom when a field is focused, and the form scrolls with the keyboard open in landscape (its shadow is clipped when it overflows). Checked so far in Chromium and WebKit only |
| 19 | The page does not reconnect by itself after the socket closes; it returns to the name form |
| 19 | The server caps rooms (50) but not connections: add a cap on connections in total and per address when the server is exposed through the tunnel (behind it, the address is in the `CF-Connecting-IP` header), and stop sending to a socket whose send buffer keeps growing |
| 19 | Room exhaustion: 50 connections that each create a room and leave hold the server at `server_full` for 60 s. Limit `create` per address, or give a room nobody else joined a short timeout |
| 19 | Server hardening left for hosting: a client that alternates a flood second and a quiet second is never closed, and the rate limit's boundaries are untested; an event-loop stall of about 4 s drops every connection as silent, and the liveness boundaries are untested; `close()` does not call `closeAllConnections`, and a binary frame gets `close` not `terminate`; static file failures are not reported; a timer callback that throws on every tick reports 120 times a second; HTTP cases untested (400, HEAD, 503, a wrong WebSocket path); a takeover scans every session |
| 19 | Page lifecycle left for reconnection: `socket.ts` gives no close code and can deliver messages after `close()`; there is no timeout for a socket that never opens or a server that never answers; the snapshot buffer has no reset (one is made per connection); `game.stop()` does not dispose Three.js resources; the WebGL failure is not logged. `scripts/dev.mjs` signals only `npm`, so a crash can leave child processes on ports 3000 and 5173 |

## Decisions log

Decisions made during the design and afterwards. Change the spec too when a decision alters the design.

| Date | Decision | Why |
|---|---|---|
| 2026-11-11 | Plans are written one step at a time, not all up front | Later steps depend on how earlier code turns out |
| 2026-11-11 | One branch per step, merged to `main` when its tests pass | Lets local and cloud sessions work without colliding |
| 2026-11-11 | The game is a campaign of courses built from reusable segments, split across several specs | Courses range from 10 minutes to over an hour; hand-sculpting each is not realistic |
| 2026-11-11 | Losing the vehicle restarts from the last checkpoint with a 60 s penalty; runs never hard-fail | A full restart is too punishing on long courses |
| 2026-11-11 | Difficulty belongs to the course; the vehicle (Lodgy or RV) is a free choice | Owner's decision |
| 2026-11-11 | Rooms are addressed by a unique noun in the URL, with a ready-up lobby and an admin | Owner's decision |
| 2026-11-11 | Spec 1 gains fuel stations, garages, time bonuses, side objectives, time of day and weather; power-ups and shortcut gates go to spec 2 | Owner asked for all of them; the last two need longer courses to matter |
| 2026-11-11 | Heavy-obstacle pusher count follows connected players; the admin can restart from the last checkpoint | Avoids soft-locks when players leave or the vehicle is stuck |
| 2026-11-11 | Players have 100 health, a downed state and revival; a 3-slot inventory; coins and shops replace time bonuses | Owner's decision |
| 2026-11-11 | Courses are inspired by real routes (airport, Ourika, Atlas), handmade from segments, with forks that rejoin | Owner's decision; generating from map data was rejected as too heavy |
| 2026-11-11 | The winch cable is a capped spring-and-damper force, not a physics joint | A hard joint pulling a raycast vehicle is the likeliest source of instability |
| 2026-11-11 | Scenario tests encode handling expectations as measurable assertions | Gives implementers a pass or fail target for what would otherwise be feel |
| 2026-11-11 | The owner's real start coordinates are kept out of the repository | Privacy |
| 2026-11-11 | Hosting is Cloudflare: Tunnel from the owner's machine first; Containers or Durable Objects decided at step 16. Room logic stays free of Node and `ws` | Owner chose Cloudflare; keeps both always-on options open |
| 2026-11-11 | An independent review of the spec was run and its critical and important findings were fixed | Requirement that implementers never have to guess |
| 2026-11-11 | Forks moved to spec 2 | Costliest course-builder feature, used once in course 1 |
| 2026-11-11 | Using an item is its own button (`use`), separate from interact | With an item selected, interact could no longer board, pick up or use a pump |
| 2026-11-11 | Build order grew to 19 steps: players split from prediction, segment system split from course 1, lobby moved after the features it configures | Review found steps too large or ahead of their dependencies |
| 2026-11-12 | The winch force cap is a fraction of the vehicle's weight, and cable stiffness scales with mass | Experiment in `experiments/cable/RESULTS.md`; a fixed cap would let the winch lift the Lodgy outright |
| 2026-11-12 | Winch stiffness has an upper limit set by the reel speed | Same experiment: too stiff a cable hits the cap every other tick and halves the reel speed |
| 2026-11-12 | The test ground gains its props, obstacles, stops and coins in the steps that first simulate them | Avoids placing data nothing reads yet |
| 2026-11-12 | All four wheels are driven on both vehicles | Keeps slope behaviour dependent on engine force alone |
| 2026-11-12 | Friction, stopped-speed and suspension-force values moved from `vehicle.ts` and `statics.ts` into `constants.ts` | Whole-branch review: the spec allows no tuning literals outside the two tuning files |
| 2026-11-12 | The server runs from its TypeScript source with `tsx`; there is no server build step | `shared` exports its source, which Node cannot load by itself; a bundle step waits for the hosting decision at step 19 |
| 2026-11-12 | Liveness uses `ping` and `pong` messages, not WebSocket ping frames | Keeps the room layer independent of the transport; a frozen page stops answering, which is the case to detect |
| 2026-11-12 | The WebSocket endpoint is `/ws`; input `seq` starts at 1, so an `ackSeq` of 0 means none | Left open by the spec; both sides need the same answer |
| 2026-11-12 | Shared course, vehicle and constant objects are frozen at run time | One server process runs many rooms from the same objects |
| 2026-11-12 | A room with nobody connected is paused | Saves the cost of simulating an empty room and avoids a burst of catch-up ticks on return |
| 2026-11-12 | `VEHICLE=rv` selects the RV for every room until the lobby exists | Keeps the RV drivable for handling work before step 11 |
| 2026-11-12 | The server holds at most 50 rooms and refuses `create` beyond that with `server_full` | Found in review: each room is a physics world, and nothing bounded how many one visitor could create |
| 2026-11-12 | A connection that throws is dropped and a room whose simulation throws is closed; both are reported and the other rooms carry on | Found in review: one error inside the tick stopped every room |
| 2026-11-12 | A test checks the room layer's imports | Found in review: the room tsconfig cannot stop an import of `ws`, which brings Node's types in with it |
| 2026-11-13 | The Node adapter contains every failure it can: file read errors, server errors, and exceptions in socket and timer callbacks are reported and the process carries on | Found in review: any one of them ended the process, and every room with it |
| 2026-11-13 | The page checks every server message with `parseServerMessage` and drops what fails; an error reason it does not know is shown as a general refusal, and unknown fields are kept | Found in review: the page may be older than the server, and one snapshot without finite numbers spoiled the interpolation until a reload |
| 2026-11-13 | The smoke test's phone project runs in WebKit, the engine of Safari, with an iPhone 14 viewport and touch | Asked for by the owner during step 2. It is not Safari on a real iPhone, which stays the owner's check at step 14 |
| 2026-11-13 | A room leaves the server's list before its world is freed, and a failed free is reported, not retried | Whole-branch review: a disposal that threw would have been tried again on every tick, stopping every room after it |
| 2026-11-13 | The `ErrorReason` type is derived from the `ERROR_REASONS` list | Whole-branch review: the page turns a reason missing from the list into `bad_message`, so the two must not drift apart |
| 2026-11-13 | Spawn slots are not shared: a slot is valid only when no other player stands within two body radii of it, so players take successive slots (D1) | Without it every player would stack in slot 0 |
| 2026-11-13 | Nobody is seated at the start of a run; a player boards with interact, so "the first player drives" no longer holds (D2) | Seats need the interact button, and boarding by choice is the design |
| 2026-11-13 | Press detection (jump, interact, drop) lives in the world: a press is a button true now and false in that player's previous tick input; the input queue merges taps (D3) | A tap that falls between two ticks must not be lost; this replaces the carried rows about `fresh` and merging |
| 2026-11-13 | `World` gains `addPlayer`, `removePlayer` and `teleportPlayer`; `teleportPlayer` serves tests now and checkpoint restarts at step 8 (D4) | The spec listed the first two only |
| 2026-11-13 | The camera's wall pull-in is computed on the client by a ray against the course's ground and wall boxes (D5) | No physics on the client before step 4 |
| 2026-11-13 | While seated the camera is the existing vehicle follow camera (D6) | It is what "orbits the vehicle" means until the HUD and camera passes |
| 2026-11-13 | `respawn` events from `World.step` are ignored by the room until step 9 (D7) | There is no `event` message yet |
| 2026-11-13 | The shove-out search runs along one line away from the vehicle's centre and may not pass through static geometry; with no free place the player goes to a spawn slot (D8) | A sideways search could put a player on the far side of a wall |
| 2026-11-13 | `createWorld` and `createRig` take an optional `BuiltCourse` that replaces the id's course (D9) | Tests add walls and ledges |
| 2026-11-13 | Seat ids are `driver`, `seat1` to `seat5` (D10) | They cannot be confused with player ids `p1` to `p6` |
| 2026-11-13 | There is no way onto the vehicle's roof from the ground yet; tests use `teleportPlayer` (D11) | The Lodgy's roof is 1.5 m up, a jump reaches 1.27 m; props at step 5 give a way up |
| 2026-11-13 | Roof guard: a player whose feet are inside the vehicle's footprint, no deeper than the step height below its roof face (vehicle up within 45° of world up), is lifted onto the roof instead of shoved sideways (D12) | Found in Task 5: a rising roof pushed a falling player off the edge |
| 2026-11-13 | `createWorld` runs one zero-length physics step so queries work before the first tick | Spawn rays and overlap tests ran against an empty query pipeline |
| 2026-11-13 | A ground collision group (`GROUP_GROUND`) separates ground boxes from walls and the chassis; the spawn ray uses it | The spawn ray hit walls and the chassis and found no floor under slots next to them |
| 2026-11-13 | Plan test Q1-6 (the input queue's unmerged-last rule) is unobservable through the public API and is not tested; the rule stays as a defence | A two-input take always leaves at least two inputs queued |
| 2026-11-13 | The wheel-ray filter (N1) now matters only for seated capsules | Shove-out removes standing players from under the wheels before the next ray |
| 2026-11-13 | The keyboard ignores game keys pressed with Ctrl, Meta or Alt held | Ctrl+R and similar browser shortcuts must keep working |
