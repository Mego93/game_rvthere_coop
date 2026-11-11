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
| 1 | Workspace scaffold, Rapier world, test ground, drivable Lodgy from a vehicle config, keyboard input, winch stability experiment | todo | | | Automated tests |
| 2 | Server, rooms at `/<noun>`, snapshots, interpolation: two tabs see the same vehicle | todo | | | Automated tests |
| 3 | On-foot players with prediction, boarding and seats | todo | | | Automated tests |
| 4 | Push, carry, props and clearing | todo | | | Automated tests |
| 5 | Winch | todo | | | Automated tests |
| 6 | Fuel, health, repair, refuel, checkpoints and restart, win rule, HUD | todo | | | Automated tests |
| 7 | Lobby: ready states, admin controls, course and vehicle selection, kick, results, next course, session tokens | todo | | | Automated tests |
| 8 | Touch input, touch UI, landscape layout, web app manifest | todo | | | Owner, on a real iPhone |
| 9 | Segment system, course design pass, course 1 | todo | | | Owner, by playing it |
| 10 | The RV: config, mesh, handling pass over course 1 | todo | | | Owner, by playing it |
| 11 | Sound effects | todo | | | Owner |
| 12 | Reconnect polish, single-container deployment | todo | | | Owner |

## Later specs

Not designed yet. Each gets its own spec when spec 1 is done.

| Spec | Content |
|---|---|
| 2 | More segment types; courses 2 and 3 (about 20–30 minutes each) |
| 3 | Long courses (1 hour or more) |
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
