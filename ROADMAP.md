# Roadmap

Single source of truth for where the project stands. Update it in the same commit that finishes a step.

- Design: [`docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`](docs/superpowers/specs/2026-11-11-lodgy-coop-design.md)
- Plans: `docs/superpowers/plans/step-N-<slug>.md`, written when a step starts

## Current state

**Current step:** none started. Next action: write the plan for step 1.

**Runnable today:** nothing; the repo holds documents only.

## Steps (spec 1: engine and course 1)

Status values: `todo`, `planned` (plan written), `in progress`, `done`, `needs sign-off` (built, awaiting a manual check by the owner).

| # | Step | Status | Branch | Plan | Sign-off |
|---|---|---|---|---|---|
| 1 | Workspace scaffold, Rapier passed into `shared`, test ground, both vehicle configs as boxes, drivable in one tab, keyboard input, text overlay, force-based cable experiment | todo | | | Automated tests |
| 2 | Server (`room` layer and `node` adapter), validation, rate limit, liveness, home page, create and join by noun, snapshots, interpolation, Playwright test begins | todo | | | Automated tests |
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

Filled in by step 1, once the workspace exists.

## Known issues

None yet.

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
