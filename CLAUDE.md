# Lodgy Co-op

3D browser co-op game for 2–6 players: one shared physics-driven car, Marrakech-themed course, desktop and iPhone. Authoritative Node server, room codes.

## Start here

1. Read `ROADMAP.md` for the current step and its status.
2. Read the design spec linked there. It is the source of truth for behaviour.
3. Read the current step's plan in `docs/superpowers/plans/` if one exists.

This file is self-contained on purpose: cloud sessions see only the repo, not the owner's machine-level instructions or memory.

## Workflow

- One build step per branch, named `step-N-<slug>`. Merge to `main` when its tests pass.
- A step's plan is written when the step starts, not earlier.
- Tick plan checkboxes as tasks land. Update `ROADMAP.md` in the commit that finishes a step.
- Steps marked for owner sign-off in `ROADMAP.md` end at `needs sign-off`, never `done`, until the owner confirms.
- If implementation forces a design change, update the spec and add a line to the decisions log in `ROADMAP.md`.

## Models

- Design and planning (specs, plans, roadmap decisions): the main session, on Fable.
- Implementation: subagents on Sonnet 5.5 (`model: "sonnet"`), one task at a time from the plan.

## Stack

npm workspaces, TypeScript. Packages: `shared` (simulation, Rapier), `server` (Node, `ws`), `client` (Vite, Three.js). Tests: Vitest; Playwright for the smoke test. Use npm only.

Commands are listed in `ROADMAP.md` under "How to run and test" once step 1 creates the workspace.

## Commits

Conventional Commits with a required scope: `<type>(<scope>): <description>`.

- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`, `perf`, `ci`
- Scopes: `shared`, `server`, `client`, `e2e`, `spec`, `plan`, `roadmap`, `repo`, `deps`

## Verification

- Tests are mandatory for any behavioural change in `shared`, `server`, and the client's `net`, `prediction` and `input` modules. Write the test first.
- Run the full test command before every commit, and report failures with their output.
- Before calling a step done: run the tests, get a code review from a reviewer subagent, and fix every critical and important finding.
- Rendering and game feel cannot be verified by tests. Say so and leave them for owner sign-off.

## Never commit

`.env*`, `*.pem`, `*.key`, `*.p12`, `token.json`, `service-account*.json`, cookies files.

## Code style

Comment only when the reason is not obvious from the code, in one line. No docblocks.
