# Roadmap

Single source of truth for where the project stands. Update it in the same commit that finishes a step.

- Design: [`docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`](docs/superpowers/specs/2026-11-11-lodgy-coop-design.md)
- Plans: `docs/superpowers/plans/step-N-<slug>.md`, written when a step starts

## Current state

**Current step:** steps 5 and 6 are done and merged to the local `main` (branch `claude/tender-carson-9525v1`; whole-branch reviews clean); steps 7 and 15 are done and merged to the local `main` (whole-branch reviews clean); step 8 (checkpoints) is done (whole-branch review clean); step 9 (player health) is done (whole-branch review clean after small fixes). Step 19a (server hardening, pulled forward from step 19) is done and merged (whole-branch review clean after one fix). The owner still has to check rendering and feel for steps 3 to 9 and 15 and the iPhone load (see "Working notes"). The branch is pushed; `main` is merged locally only.

**Runnable today:** `npm run dev` starts the game server and the page. Create a room on the home page and share its address; everyone who opens it appears as a character beside the same vehicle on the test ground. Players walk (WASD) and jump (Space), board with E at the nearest free seat (the driver's seat if standing at its door), drive from the driver seat, and leave with E. After clicking the canvas, the mouse looks around from a shoulder camera with a crosshair; while seated the camera follows the vehicle. The local player's walking and jumping are predicted on the page and corrected on each snapshot; the debug overlay shows the predicted position (`you`) and the server's (`server`) while prediction is active. Behind the start stand three crates and a heavy barrier: walking into the vehicle or a prop pushes it, E beside a crate picks it up and E again throws it along the aim, players can stand on props, and the barrier slides only while enough players push it (1 with one player, 2 with 2–3, 3 with 4–6). Four players can roll a Lodgy lying on its side back onto its wheels. The hook rests on the front bumper: E there (aiming at the bumper) takes it, E at an anchor (the orange posts) attaches it, E with no anchor near drops it; Q reels in and R reels out, from the driver seat or standing at the bumper. The barrier has an anchor on its top. The vehicle has fuel and health (shown in the overlay): fuel drains with throttle and an empty tank stops drive; hard impacts and lying upside down cost health. Two jerrycans and a toolbox lie behind the start: E picks one up into the first free slot, 1–3 select a slot, G drops it, and holding F for 3 s beside the vehicle refuels or repairs by 50%. The overlay shows the run timer, the checkpoint (`cp 1/2` at the start), restarts and respawns; driving through a checkpoint's trigger records it, and the vehicle's centre entering the finish shows `FINISHED` and stops the timer. A vehicle that falls below the kill plane or whose health reaches 0 restarts with everyone at the last checkpoint, with fuel and health at least 50%, props, items and inventories as they were recorded. Players have 100 health (shown as `health` in the overlay): a fall landing faster than 9 m/s, the vehicle closing on them faster than 5 m/s, or a prop faster than 6 m/s hurts them; at 0 they are downed (lying flat, `DOWNED Ns` counting down from 30) and respawn beside the vehicle at 50, at once if everyone is downed. A health kit (white, behind the start) held with F for 3 s revives a downed teammate in front of you, heals a hurt one by 50, or heals yourself.

## Steps (spec 1: engine and course 1)

Status values: `todo`, `planned` (plan written), `in progress`, `done`, `needs sign-off` (built, awaiting a manual check by the owner).

| # | Step | Status | Branch | Plan | Sign-off |
|---|---|---|---|---|---|
| 1 | Workspace scaffold, Rapier passed into `shared`, test ground, both vehicle configs as boxes, drivable in one tab, keyboard input, text overlay, force-based cable experiment | done | step-1-scaffold-and-drivable-vehicle | [plan](docs/superpowers/plans/step-1-scaffold-and-drivable-vehicle.md) | Automated tests |
| 2 | Server (`room` layer and `node` adapter), validation, rate limit, liveness, home page, create and join by noun, snapshots, interpolation, Playwright test begins | done | step-2-server-rooms-snapshots | [plan](docs/superpowers/plans/step-2-server-rooms-snapshots.md) | Automated tests |
| 3 | Server-side players on foot: movement, moving bodies, shove-out, spawn slots, seats, kill-plane respawn; shoulder camera and crosshair; iPhone load check | done | claude/busy-brown-wkdjue | [plan](docs/superpowers/plans/step-3-players-on-foot.md) | Automated tests |
| 4 | Client prediction of walking and jumping | done | claude/busy-brown-wkdjue, merged on claude/tender-carson-9525v1 | [plan](docs/superpowers/plans/step-4-client-prediction.md) | Automated tests |
| 5 | Push, hands, light debris, heavy obstacles, prop kill plane | done | claude/tender-carson-9525v1 | [plan](docs/superpowers/plans/step-5-push-hands-props.md) | Automated tests |
| 6 | Winch | done | claude/tender-carson-9525v1 | [plan](docs/superpowers/plans/step-6-winch.md) | Automated tests |
| 7 | Vehicle fuel, health and damage; inventory; jerrycans and toolboxes; hold actions | done | claude/tender-carson-9525v1 | [plan](docs/superpowers/plans/step-7-fuel-health-inventory.md) | Automated tests |
| 8 | Checkpoints and restart, vehicle loss, win rule, timer | done | claude/tender-carson-9525v1 | [plan](docs/superpowers/plans/step-8-checkpoints.md) | Automated tests |
| 9 | Player health, damage, downed state, health kits, revival and respawn | done | claude/tender-carson-9525v1 | [plan](docs/superpowers/plans/step-9-player-health.md) | Automated tests |
| 10 | Service stops, coins, shops and shop menu, final time and side objectives | todo | | | Automated tests |
| 11 | Lobby: ready states, configuration, kick, in-run menu, admin tools, results, next course and campaign total, held slots and rejoin | todo | | | Automated tests |
| 12 | HUD: mock-up pass, then compass, minimap, gauges, slots, prompts and downed markers | todo | | | Owner, visual check |
| 13 | Conditions: rain grip, time-of-day and weather visuals | todo | | | Owner, visual check |
| 14 | Touch input, floating joystick, touch UI, landscape layout, web app manifest | todo | | | Owner, on a real iPhone |
| 15 | Segment system: six segment builders and the course builder | done (built in parallel, merged after step 7) | claude/tender-carson-9525v1 | [plan](docs/superpowers/plans/step-15-segments.md) | Automated tests |
| 16 | Course design pass, then course 1 (to the airport); measure snapshot size | todo | | | Owner, by playing it |
| 17 | The RV: mesh and handling pass over course 1 | todo | | | Owner, by playing it |
| 18 | Sound effects | todo | | | Owner |
| 19a | Server hardening: connection caps, slow readers, create limit, solo rooms, rate-limit strikes, stall credit, rate-limited failure reports | done (built in parallel) | step-19a-server-hardening | [plan](docs/superpowers/plans/step-19a-server-hardening.md) | Automated tests |
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
| `COURSE=segment-demo npm run dev` | Runs every room on the segment demo course (every segment type, a fuel stop and a garage) instead of the test ground; combine with `VEHICLE=rv` |
| `TRUST_PROXY=1 npm start` | Behind the Cloudflare Tunnel: counts each player by the `CF-Connecting-IP` header (only from a loopback peer); the start log says whether proxy trust is on. `CREATE_PER_MINUTE` and `MAX_CONNECTIONS_PER_ADDRESS` override the per-address limits (the Playwright config sets both to 1000) |
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
- **Step 4 is unverified by hand:** prediction feel (smoothing, snap) is for the owner to judge on a real connection, since localhost has no latency. Automated tests pass, and the smoke test's desktop project ran in the system Chrome (Playwright's browser download was blocked); the WebKit phone project was not run.
- **Step 5 is unverified by hand:** how pushing feels (strength, the stronger push on a tipped vehicle), throwing distance, the barrier's slide, crates tumbling when pushed (accepted: the push acts at their top edge), climbing onto the roof from a crate or the barrier, and the prop meshes (colours chosen without design). Automated tests pass and the smoke test's desktop project passed in the preinstalled Chromium; WebKit was not run.
- **Step 6 is unverified by hand:** how winching feels, the rope and hook's look, reaching the bumper and anchors with the aim, and dragging the barrier. Automated tests and the desktop smoke test pass.
- **Step 7 is unverified by hand:** fuel duration, crash damage amounts, item meshes and the 3 s hold. The step-7 plan review agent stopped before reporting; the main session ran its probe instead (results in the plan).
- **Step 8 is unverified by hand:** a restart's look (players and vehicle jumping back, a 50 ms glide), the timer and `FINISHED` line.
- **Step 9 is unverified by hand:** the downed pose (lying flat; the name label lies behind the head), the health kit mesh, damage amounts and thresholds (falls, vehicle and prop hits), looking down to revive a close teammate, and the hint texts.
- **Step 15 is unverified by hand:** driving the demo course (joins, alley width for the RV, the bank with the winch, roadworks), and the new meshes (water, palms, boulders, stops). Boulders are drawn on the road edge but have no collider (anchors never do).
- **Session of 2026-11-13 (cloud):** the owner allowed pushing the branch; `main` is merged locally and not pushed.
- **Six-player cost (measured):** about 0.28 ms per tick; a snapshot is about 1.1 KB (about 150 bytes per player), roughly 134 KB/s per room to six clients at 20 Hz. Step 4's four new snapshot fields add roughly 90 bytes per player to that; measure again at step 16.

## Known issues

- A braked vehicle creeps at under 0.1 m/s on the steep (25°) reference slope. The wheel model causes it; a scenario test bounds it.
- The production bundle is about 4.9 MB (1.8 MB gzip) since step 4 brought Rapier back into the page.
- An upturned vehicle or an RV on its side cannot be righted: it is lost only when its health reaches 0 or it falls below the kill plane, which restarts the run at the last checkpoint. Lying upside down costs health, so an upturned vehicle is lost after a while and the run restarts; an RV on its side with health left has no restart button until step 11's in-run menu (`restartCheckpoint()` is ready for it) (W8, owner to confirm). A Lodgy on its side is righted by four pushers; an RV stuck on sand is winched out.
- Reloading the page, or losing the connection, returns the player to the name form. Joining again usually makes a new player, because the server removes a disconnected player at once; if the server has not yet seen the old connection close, the same tab takes its old place back. Held slots arrive at step 11 and automatic reconnection at step 19.
- The RV cannot pull away from rest on sand, by the owner's decision (it is how a heavy road-going motorhome behaves): sand's rolling resistance (0.25 × its weight, about 9200 N) exceeds its engine force (7500 N), so it stays put in either direction until it is pushed or winched out. Arriving with speed it crosses: by arithmetic it loses about 0.45 m/s² and a 30 m patch costs it under 2 m/s from 15 m/s, not yet confirmed by a test. The Lodgy crawls through. For the RV the tests are "from rest on sand it stays within 0.5 m for 10 s" and "entering the sand patch at 12 m/s it crosses"; the winch (step 6) gets it out.
- After the server discards a backlog of inputs, the view holds the newest snapshot until the clock offset converges (5% per snapshot).
- The roof is reached from a crate or the barrier (D11); nobody has checked it by hand, and no test covers it.
- A prop reset by the kill plane returns to its spawn even if something now stands there; the overlap can push bodies apart hard. A checkpoint restart sends a prop that would overlap the vehicle to its own spawn, but a prop held at the record is recorded at its course spawn and may overlap another prop there.
- Across a restart (and a kill-plane respawn) the page blends bodies from their old place to the new one over one snapshot interval, so they glide for 50 ms instead of jumping (visual, for the owner); the restart tick's snapshot still shows the last throttle and steer.
- Reviving or healing a teammate closer than about 1.9 m needs looking down at them: the crosshair rule measures 20° from the eye to the teammate's centre (owner to judge).
- A body touching a player keeps its hit cooldown alive, so a vehicle a player leans on and that then accelerates into them does not hurt until contact breaks for 0.5 s (J4, owner to judge).
- A restart before the first checkpoint gives every player 100 health and an empty inventory: cp-0 is recorded when the room is created, before anyone joins, so everyone counts as a late joiner. Step 11's run start should record cp-0 with the players present.
- A downed player below the kill plane can still be revived; the kit is spent and the kill-plane respawn follows.
- While downed, a player's name label stays above where the head would be standing.
- After a restart the vehicle settles onto its suspension at about 0.06 m/s for a moment, as it does when a room is created.
- Items restored or dropped at a restart are not checked against the vehicle's box; items collide with statics only, so one inside the chassis stays there until picked up.
- A hook dropped by a player standing on the barrier falls through to the ground under it: the drop ray finds ground colliders only (W2).
- Boarding while holding the hook stows it, but interact always drops the hook first, so that path is a guard with no test.
- A long run-up over the test ground's ramp costs the Lodgy up to 2% health on landing (impact threshold 4 m/s per tick change, a starting value).
- Dropped items collide with ground and walls only: they fall through the vehicle and props.
- A ford rock reads as "airborne" to the wheel that rides on it (rocks are walls, not ground), so that wheel uses road grip for the tick.
- A fifth pusher on the vehicle adds a little over four: the controller's contact flickers, and the cap counts the first four players pushing on each tick.
- Shove-out runs at a fixed height, so shoving uphill on a slope can overlap the ground and send the player to a spawn slot.
- A vehicle faster than about 22 m/s can lift a jumping player onto its roof (roof guard, D12).
- The client interpolates through teleports, so after exiting a seat or respawning a player's mesh slides for one interval (visual, for the owner).
- A quick double tap 16 ms apart can lose the second press because the world remembers the merged input.

## Carried into later steps

Findings from reviews that belong to a later step. Each step's plan must cover its own rows, and the step deletes them when done.

| Step | Item |
|---|---|
| 10 | The checkpoint record and restore include coins and the wallet (step 8, Q11) |
| 16 | Every sand segment must give the RV a run-up: it cannot start from rest on sand, and a stop on sand (a service stop, a checkpoint restart) would trap it. The spec's rule that the RV completes every segment includes this |
| 10 | Service stops adopt the `STOP_*` constants and the pad layout of the step-15 plan (T7), or change both together |
| 10 | Exit and spawn-slot validity should include a ray from the player's pivot to the point against walls (moved from step 15: stop pads sit beside fences) |
| 11 | Held slots keep a player's health on rejoin, and a downed rejoin is a respawn (counted); until then "every connected player" in the everyone-downed rule is the world's players (step 9, J19) |
| 11 | Record cp-0 when the run starts, with the players present (today it is recorded at room creation, so a restart before cp-1 heals everyone to 100) |
| 11 | `COURSE` (step 15) is replaced by the lobby's course choice |
| 11 | `lobby` gains `timeOfDay` and `weather`; held slots replace the immediate removal of a disconnected player; the admin's choice replaces `VEHICLE` |
| 11 | Names are only trimmed and length-checked: control and invisible characters and look-alike letters pass, and a newline in a name forges lines in the debug overlay on other players' pages. A throw in the page's `lobby` handler leaves the page blank |
| 14 | The home form on a real iPhone: no zoom when a field is focused, and the form scrolls with the keyboard open in landscape (its shadow is clipped when it overflows). Checked so far in Chromium and WebKit only |
| 19 | The page does not reconnect by itself after the socket closes; it returns to the name form |
| 19 | The one-command start behind the tunnel must set `TRUST_PROXY=1`; without it every player shares cloudflared's address and the server allows 12 connections and 5 room creations a minute in total. Per-address caps on IPv6 are not grouped by /64. Raw TCP connections that never finish their headers count against no cap (Node's 60 s header timeout is the only limit) |
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
| 2026-11-13 | `respawn`, `hurt`, `downed` and `revive` events come from `World.step` only; the room sends no `event` message until the HUD and sound steps (12, 18) (D7, amended at step 9, J11) | There is no `event` message yet |
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
| 2026-11-13 | The snapshot's player entry gains `walk`, `carry`, `vy` and `grounded`, sent for every player (E1) | The client resets its predictor to the server's exact state; the snapshot stays identical for every client |
| 2026-11-13 | The server's walking code and the predictor's share one function, `stepWalk` (E2) | One implementation cannot drift; a test proves the two agree |
| 2026-11-13 | The predictor's vehicle stand-in is a dynamic box at gravity scale 0, not kinematic or fixed (E3) | The walking controller's autostep excludes only dynamic bodies, so a kinematic box could be stepped onto; a fixed one is not found after a zero step |
| 2026-11-13 | Prediction is on while the latest snapshot reports the local player unseated with `ground` null; turning it on resets to the snapshot (E4) | Seats, shove-out and standing on the vehicle stay the server's |
| 2026-11-13 | Known and accepted: the server and client can be one tick apart when the server merges or repeats inputs, and the predictor has no shove-out; a jump held through an input stall long enough for the neutral substitute is a new press on the server but not on the client; corrections absorb it (E5) | Rare, small and smoothed |
| 2026-11-13 | The predictor's API is `createPredictor(rapier, course, vehicle)`, `setVehicle(pos, rot)`, `stepPlayer(state, input, previousJump)` (E6) | The stand-in needs the vehicle's size and a pose, and the jump press needs the previous input |
| 2026-11-13 | The predictor's `setVehicle` needs two zero-length steps | Rapier 0.21: the first zero step after moving a body removes its collider from the old place but does not insert it at the new one |
| 2026-11-13 | Inputs are always recorded, also while prediction is suspended; prediction resumes by replaying everything after `ackSeq` | The first correction after a seat or a ride must not lose the inputs sent meanwhile |
| 2026-11-13 | The drawn position is blended between the previous and current predicted positions by the stepper's alpha, plus the fading offset | Smooth movement at frame rates above the 60 Hz tick |
| 2026-11-13 | Prop kinds are a table in `constants.ts` (crate: light, 15 kg; barrier: heavy, 150 kg); a prop's pose is the centre of its box's bottom face (F1) | One table for the server, the predictor and the client |
| 2026-11-13 | A player's push is 1500 N, capped at the mass times 10 m/s², along the move input; on a vehicle tipped more than 45° it is 4000 N (F2) | 1500 N cannot roll a Lodgy on its side even with four pushers, and a larger constant everywhere would launch a level Lodgy |
| 2026-11-13 | The push's contact point is the box point nearest to the feet plus 1 m; "into the surface" is a positive dot product with the horizontal direction to it (F3, F13) | Deterministic and testable; the controller's true contact point varies along the capsule |
| 2026-11-13 | Push intents are found while moving characters and applied as impulses at step 2 of the next tick (F4) | Keeps the spec's tick order; one tick of delay |
| 2026-11-13 | A heavy obstacle never rotates; locked, its X and Z translations are locked too and its X and Z velocity is zeroed (F5) | A pushed barrier would otherwise tip instead of sliding |
| 2026-11-13 | Pushing does not free the RV from sand from rest; the winch does (F6) | The held brake resists up to sand's rolling resistance (about 9200 N), more than four pushers give |
| 2026-11-13 | Standing, carrying, take-off velocity, shove-out and the top guard apply to every dynamic body, vehicle and props alike (F7, F8) | One rule for anything a player can stand on or be hit by |
| 2026-11-13 | A held prop is a kinematic body that collides with nothing, placed each tick at the holder's hold pose (F9) | It must not shove the vehicle or the holder |
| 2026-11-13 | Interact candidates of equal priority are compared by the angle from the aim to each box's nearest point to the eye; ties go to boarding, then props in course order (F10) | The spec's "closest to the aim" needed a measure for boxes |
| 2026-11-13 | The room sends each prop whose pose changed by more than 1e-4 since it was last sent, and every prop in a full snapshot (F11) | Comparing with the last sent pose stops slow drift from being lost |
| 2026-11-13 | Props held by any player are left out of the predictor (F12) | They collide with nothing on the server either |
| 2026-11-13 | A player who loses their ground body keeps its velocity at that point as carry, even when the controller still reports grounded | Walking off a moving crate's edge reported grounded with no contact for one tick and lost the velocity |
| 2026-11-13 | Seating a player who holds a prop releases it at the hold pose; interact never boards while holding, because throwing comes first | The spec's "boarding drops debris" can only happen through a seat change |
| 2026-11-13 | Interact uses the tick's own input yaw and pitch for aim | The stored yaw is updated later in the tick |
| 2026-11-13 | The cable's tension is the experiment's formula unchanged; an obstacle gets the opposite impulse at its anchor point (W1) | The experiment validated the values for that formula only |
| 2026-11-13 | The hook is a point, not a body; dropped, it lies on the ground found by a downward ray, or is stowed if there is none (W2) | No physics needed for a hook nobody holds |
| 2026-11-13 | A heavy prop's anchor point is set per kind (the barrier's is its top face); a static anchor's attach point is 0.5 m above its pose (W3, V12) | Both kinds of anchor attach the same way |
| 2026-11-13 | Hook, anchor and winch-box ranges are measured from the chest (feet + 1 m), 2 m (W4) | One reach for every winch interaction |
| 2026-11-13 | The reel comes from the driver if non-zero, else the first player in join order at the winch box; it shortens only below the cap (W5) | The spec's "driver wins", made deterministic |
| 2026-11-13 | Reeling in stows a ground hook at once; reeling does nothing while stowed or held (W6) | The spec's "reeling in retracts it" |
| 2026-11-13 | A heavy obstacle's lock is decided once per tick, before any impulse: unlocked with enough pushers or a taut cable (W7, V2) | A locked body loses an impulse, so the unlock must come first |
| 2026-11-13 | A cable at the front bumper cannot right a rolled vehicle; an RV on its side or any upturned vehicle needs a checkpoint restart (W8, owner to confirm) | Measured: no roll of the RV with anchors 12 m to either side, low or high; the Lodgy rolls only from the floor side |
| 2026-11-13 | A held hook beyond 25 m from the mount is pulled from the hands; a ground hook beyond 25 m is stowed (W9) | The spec's two length rules, checked after characters move |
| 2026-11-13 | Test-ground anchors: one on the steep slope 39 m up, one 10 m beyond the sand patch (W10) | The climb and sand scenarios need anchors in reach |
| 2026-11-13 | The board candidate's aim angle is measured to the chosen seat, not to the vehicle's box (W11) | Aiming at the bumper otherwise boarded instead of taking the hook |
| 2026-11-13 | The world owns the hook in a player's hands: it stows or drops the hook before seating, respawn and removal (V6) | The winch is created after the players and must stay consistent with their hands |
| 2026-11-13 | Step 15 (segments) runs in parallel with steps 7–14 in a separate worktree | Owner allowed independent work in parallel; segments add modules and touch little else |
| 2026-11-13 | Segments are built in their own frame (entry at the origin facing −Z) and chained by translation and yaw; ground is boxes; overlap only at yaw changes; checkpoint at every segment start; ids `s<i>-<kind>-<n>`; stops only on flat straight roads; sand starts with 50 m of road; `COURSE` selects a course until the lobby (step-15 plan S1–S12, T1–T17) | Planned with the review's fixes so later steps (8, 10, 11, 16) can rely on them |
| 2026-11-13 | Fuel and vehicle health are fractions in [0, 1]; fuel burns `fuelBurn · |throttle|` per second (Lodgy a full tank in 240 s at full throttle, RV 160 s); an empty tank stops drive only (I1, I2) | The spec's "in proportion to throttle" with the RV at 1.5 times |
| 2026-11-13 | An impact is a run of ticks whose velocity change (gravity removed) exceeds 0.5 m/s; its sum above 4 m/s costs 0.04 health per m/s; upside down drains 0.02 per second (I3, I4) | Measured: driving, braking and resting never exceed 0.29 m/s per tick; wall hits scale with speed |
| 2026-11-13 | Items are dynamic boxes in their own collision group that collide with statics only; they travel in the snapshot's `props` list; dropped items get `item-N` ids; the room sends a full snapshot when the set of ids changes (I6, I7) | The spec's "collide with static geometry only", and a way for pages to drop removed items |
| 2026-11-13 | Using an item is a 3 s hold bound at the press of `use` to the selected item and its target; it resets on release, an invalid or out-of-range target, a slot or item change, seating or teleport; the press tick counts as the first tick (I8, I9) | The spec's hold rules made exact |
| 2026-11-13 | A disconnected player's items drop at a spawn slot, stacked 0.3 m apart; respawn keeps the inventory (I11) | Until held slots arrive at step 11 |
| 2026-11-13 | Step 15 decisions found while building: a curved road next to a sloped road is refused; a bank takes only its boulder count; boulders pair every 2 m (at most 8); palms are spread over the whole sand segment; ford rocks, alley clutter and road debris start after the checkpoint spawn's clearance; the finish trigger is a constant | Each found by a review or a failing B5 check; none changes the spec's behaviour |
| 2026-11-13 | Step 7 review fixes: item use targets only known kinds; the shove-out's move to a spawn slot clears a hold; gauges round down so 100% means full | Whole-branch review of step 7 |
| 2026-11-13 | Step 8 whole-branch review clean; minor points logged as known issues | Opus review, all four checks passed |
| 2026-11-13 | Step 8: checkpoints are recorded when the vehicle's centre enters a higher trigger (cp-0 at creation, no event); a restart (kill plane, health 0, or `restartCheckpoint()`) restores the vehicle at the spawn with fuel and health floored at 50%, props and items at their recorded centres (a prop overlapping the vehicle's box goes to its own spawn), inventories without the slot, then places players after two zero-length steps; the timer counts integer ticks and the winning tick; a restart tick never wins; the snapshot gains `elapsed`, `checkpoint`, `checkpointCount`, `restarts`, `respawns`, `won`; the room sends full snapshots after any `vehicleLost` (K1–K9, Q1–Q20) | The spec's checkpoint and win rules made exact; `won` amends the spec's snapshot |
| 2026-11-13 | Step 19a: client address from the socket, or `CF-Connecting-IP` with `TRUST_PROXY=1` and a loopback peer; connections capped at 360 and 12 per address before the upgrade (503); send buffer over 1 MiB terminates; 5 creates per address per 60 s; a room only its creator joined dies 30 s after emptying (owner's call: 10 s would delete it while the link is shared); 4 over-limit windows in 8 s closes; a timer gap over 1 s credits the excess; reports once per source per 10 s with a suppressed count, and connection failures report as `connection:<noun>`, HTTP server errors as `http`; dead peers are destroyed 1 s after close; takeover by map (A1–A9, B1–B15) | Pulled forward from step 19 to run beside steps 8–14; the spec's server rules amended |
| 2026-11-13 | Step 9: players have 100 health; damage from falls (above 9 m/s, 10 per m/s), the vehicle (closing speed above 5 m/s along the contact normal, 8 per m/s) and unheld props (above 6 m/s, 5 per m/s); one body hurts a player once per continuous contact plus 0.5 s; the player's ground body, on-top contacts and the move to a spawn slot never hurt; at 0 the player is downed (neutral input, hands dropped, no damage) for 30 s, paused while a revive hold runs on them; everyone downed respawns at once; respawns and restarts give 50 (restart: the recorded value with a floor of 50, late joiners 100); health kits revive or heal +50 by a 3 s hold, the target chosen at the press (downed teammate, hurt teammate, self; within 2 m and 20° of the aim) and kept while in range; damage is applied after the characters move, before the kill plane (H1–H15, J1–J19) | The spec's player-health rules made exact; damage values are starting values for the owner |
