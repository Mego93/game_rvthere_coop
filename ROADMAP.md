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
| 1 | Workspace scaffold, Rapier world, test ground, drivable Lodgy from a vehicle config, keyboard input, force-based cable experiment | todo | | | Automated tests |
| 2 | Server, rooms at `/<noun>`, snapshots, interpolation: two tabs see the same vehicle | todo | | | Automated tests |
| 3 | On-foot players with prediction, shoulder camera and crosshair, boarding and seats | todo | | | Automated tests |
| 4 | Push, hands, props and clearing | todo | | | Automated tests |
| 5 | Winch | todo | | | Automated tests |
| 6 | Vehicle fuel and health, inventory, jerrycans and toolboxes, checkpoints and restart, win rule | todo | | | Automated tests |
| 7 | Player health, damage, downed state, health kits, revival and respawn | todo | | | Automated tests |
| 8 | Lobby: ready states, admin controls and tools, course and vehicle selection, kick, results, next course, session tokens | todo | | | Automated tests |
| 9 | Service stops, coins, shops, final time and side objectives | todo | | | Automated tests |
| 10 | HUD: mock-up pass, then compass, minimap, gauges, slots and prompts | todo | | | Owner, visual check |
| 11 | Conditions: time of day and weather | todo | | | Owner, visual check |
| 12 | Touch input, floating joystick, touch UI, landscape layout, web app manifest | todo | | | Owner, on a real iPhone |
| 13 | Segment system with forks, course design pass, course 1 (to the airport) | todo | | | Owner, by playing it |
| 14 | The RV: config, mesh, handling pass over course 1 | todo | | | Owner, by playing it |
| 15 | Sound effects | todo | | | Owner |
| 16 | Reconnect polish, single-container deployment | todo | | | Owner |

## Later specs

Not designed yet. Each gets its own spec when spec 1 is done.

| Spec | Content |
|---|---|
| 2 | Mountain segment types; course 2 (Ourika valley); course 3 (Atlas); vehicle power-ups; shortcut gates |
| 3 | Longer courses (1 hour or more) |
| 4 | Team versus |

## How to run and test

Filled in by step 1, once the workspace exists.

## Known issues

None yet.

## Decisions log

Decisions made after the spec was written. Change the spec too when a decision alters the design.

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
