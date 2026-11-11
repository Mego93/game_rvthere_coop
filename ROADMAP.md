# Roadmap

Single source of truth for where the project stands. Update it in the same commit that finishes a step.

- Design: [`docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`](docs/superpowers/specs/2026-11-11-lodgy-coop-design.md)
- Plans: `docs/superpowers/plans/step-N-<slug>.md`, written when a step starts

## Current state

**Current step:** none started. Next action: write the plan for step 1.

**Runnable today:** nothing; the repo holds documents only.

## Steps

Status values: `todo`, `planned` (plan written), `in progress`, `done`, `needs sign-off` (built, awaiting a manual check by the owner).

| # | Step | Status | Branch | Plan | Sign-off |
|---|---|---|---|---|---|
| 1 | Workspace scaffold, Rapier world, drivable car in one tab, keyboard input source | todo | | | Automated tests |
| 2 | Server, rooms, snapshots, interpolation: two tabs see the same car | todo | | | Automated tests |
| 3 | On-foot players with prediction, boarding and seats | todo | | | Automated tests |
| 4 | Push, carry, props and clearing | todo | | | Automated tests |
| 5 | Winch | todo | | | Automated tests |
| 6 | Fuel, health, repair, refuel, win and lose rules, HUD | todo | | | Automated tests |
| 7 | Touch input, touch UI, landscape layout, web app manifest | todo | | | Owner, on a real iPhone |
| 8 | Marrakech course: terrain, surfaces, five beats, meshes, palette | todo | | | Owner, by playing it |
| 9 | Lobby polish, reconnect, single-container deployment | todo | | | Owner |

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
