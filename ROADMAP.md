# Roadmap

Single source of truth for where the project stands. Update it in the same commit that finishes a step.

- Design: [`docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`](docs/superpowers/specs/2026-11-11-lodgy-coop-design.md)
- Plans: `docs/superpowers/plans/step-N-<slug>.md`, written when a step starts

## Current state

**Current step:** step 2 is planned. Next action: implement the step 2 plan with subagents.

**Runnable today:** `npm run dev` opens a page where the Lodgy (or the RV, with `?vehicle=rv`) drives around the test ground. The simulation runs in the page; there is no server yet.

## Steps (spec 1: engine and course 1)

Status values: `todo`, `planned` (plan written), `in progress`, `done`, `needs sign-off` (built, awaiting a manual check by the owner).

| # | Step | Status | Branch | Plan | Sign-off |
|---|---|---|---|---|---|
| 1 | Workspace scaffold, Rapier passed into `shared`, test ground, both vehicle configs as boxes, drivable in one tab, keyboard input, text overlay, force-based cable experiment | done | step-1-scaffold-and-drivable-vehicle | [plan](docs/superpowers/plans/step-1-scaffold-and-drivable-vehicle.md) | Automated tests |
| 2 | Server (`room` layer and `node` adapter), validation, rate limit, liveness, home page, create and join by noun, snapshots, interpolation, Playwright test begins | planned | | [plan](docs/superpowers/plans/step-2-server-rooms-snapshots.md) | Automated tests |
| 3 | Server-side players on foot: movement, moving bodies, shove-out, spawn slots, seats, kill-plane respawn; shoulder camera and crosshair; iPhone load check | todo | | | Automated tests |
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
| `npm test` | Runs all unit and scenario tests once |
| `npm run test:watch` | Runs tests on every change |
| `npm run typecheck` | Typechecks every package, config and experiment |
| `npm run dev` | Starts the client at `http://localhost:5173/`, also reachable from other devices on the same Wi-Fi |
| `npm run build` | Builds the client into `packages/client/dist` |
| `npm run experiment:cable` | Re-runs the winch cable experiment and prints its table |

In the page: WASD to drive, Space to brake. Add `?vehicle=rv` to the address for the RV.

## Known issues

- A braked vehicle creeps at under 0.1 m/s on the steep (25°) reference slope. The wheel model causes it; a scenario test bounds it.
- The production bundle is about 4.9 MB because Rapier's WebAssembly is inlined. Acceptable for now.
- With the starting values the RV cannot move off from rest on sand: sand's rolling resistance (0.25 × its weight, about 9200 N) exceeds its engine force (7500 N). The Lodgy crawls. The test "sand slows it" passes for the RV at zero distance. The owner decides whether the RV should bog down completely; the test gets an explicit bound either way once decided.

## Carried into later steps

Findings from the step 1 review that belong to a later step. Each step's plan must cover its own rows, and the step deletes them when done.

| Step | Item |
|---|---|
| 2 | Decide how Node runs `shared`: its `exports` point at TypeScript source with extensionless imports, which Node cannot resolve natively, so the server needs a runner or a bundle (a new dependency) |
| 2 | Give each package its own tsconfig before `@types/node` arrives, so that DOM and Node globals do not typecheck inside `shared` |
| 2 | Add `World.dispose()` to free the Rapier world; rooms and restarts discard worlds |
| 2 | Reject non-finite numbers in the input validator, with a test, and coerce them to 0 in `world.step`: one `NaN` throttle freezes the vehicle permanently |
| 2 | Use `Object.hasOwn` in `getCourse` and `getVehicleConfig`: ids such as `constructor` currently pass |
| 2 | Build the inputs map in join order (the driver is its first entry until step 3), and use a neutral input that keeps `yaw`, `pitch` and `slot` |
| 2 | Make the shared constant objects read-only (`IDENTITY`, `AXIS_X`, `AXIS_Y`, `NEUTRAL_INPUT`, `VEHICLES`, `testGround`): one process will share them across rooms |
| 2 | Rename `MAX_CATCHUP_STEPS` to mark it as the client's value when the server's (3) is added |
| 2 | Rewrite `overlayText` to take snapshot data instead of a `World`, and guard the fixed stepper against `NaN` and negative frame times |
| 3 | Keyboard source: call `preventDefault` for game keys; test opposite keys on every axis, key repeat and `dispose` |
| 6 | Use the tension formula of `experiments/cable/cable.experiment.ts` exactly, or re-run the sweep. Test near the stall angle as well as at 25°, add a test tying stiffness to reel speed, and test the 25 m maximum length and the test ground's anchor |
| 7 | A vehicle at rest reports a vertical speed of about −0.06 m/s; impact thresholds and "at rest" checks must allow for it |
| 8 | Test the test ground's ramp, finish and trigger boxes when checkpoints first use them |

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
