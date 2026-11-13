# Lodgy Co-op

3D browser co-op game for up to 6 players: one shared physics-driven vehicle (Lodgy or RV), a campaign of courses inspired by routes around Marrakech, desktop and iPhone. Authoritative Node server; rooms are joined by a noun in the URL.

## Start here

1. Read `ROADMAP.md` for the current step and its status.
2. Read the design spec linked there. It is the source of truth for behaviour.
3. Read the current step's plan in `docs/superpowers/plans/` if one exists.

This file is self-contained on purpose: cloud sessions see only the repo, not the owner's machine-level instructions or memory.

## Workflow

- One build step per branch, named `step-N-<slug>`. Merge to `main` when its tests pass and its review is clean. This holds for owner sign-off steps too: they merge, and their status is `needs sign-off`.
- A step's plan is written when the step starts, not earlier.
- Tick plan checkboxes as tasks land. Update `ROADMAP.md` in the commit that finishes a step.
- Steps marked for owner sign-off in `ROADMAP.md` end at `needs sign-off`, never `done`, until the owner confirms.
- If implementation forces a design change, update the spec and add a line to the decisions log in `ROADMAP.md`.
- The order for a step: write the plan, have it reviewed, wait for the owner's go-ahead, implement task by task with a review after each task, review the whole branch, fix what that review requires, run every check afresh, merge to `main`. Push only when the owner says so.
- If a usage limit or an agent failure interrupts the work, resume it once the limit resets, from where it stopped, without waiting to be asked. Resume a failed subagent; do not start a new one for the same work.

## Plans

- A plan fixes file paths, exported names and signatures, constants, numbered behaviour rules and numbered test cases. It does not contain finished code: the implementers write the tests and the code, tests first. (Steps 1 and 2 used plans with finished code; from step 3 on they do not, to lower cost.)
- Check a plan's numbers against the constants, the vehicle configs and the course geometry before it is reviewed. Every fix round in step 2 came from a gap in the plan.
- A plan names every existing test that a task must change.

## When something is not specified

Implementers do not guess and do not redesign.

- The spec's "Conventions" section (units, axes, yaw, tick, ids) applies to all code.
- If the plan and the spec do not answer a question, or contradict each other, stop and report the question to the main session. Do not pick an answer silently.
- Do not change a type, message or function signature that another module already uses unless the plan says to.
- Tuning values: use the starting value the plan gives. Do not retune to make something feel better; feel is the owner's call.

## Models

- Design and planning (specs, plans, roadmap decisions): the main session, on Fable.
- Implementation: subagents on Sonnet 5.5 (`model: "sonnet"`), one task at a time from the plan.
- Review after each task, and re-review of a fix: subagents on Sonnet 5.5.
- Review of a plan before it is implemented, and of the whole branch before it is merged: a subagent on Opus at medium effort (`model: "opus"`, `effort: "medium"`).
- No subagent runs on Fable. Always name the model when starting a subagent: one started without a model inherits the main session's.

## Stack

npm workspaces, TypeScript. Packages: `shared` (simulation, Rapier), `server` (a `room` layer that imports nothing from Node or `ws`, plus a `node` adapter), `client` (Vite, Three.js). Tests: Vitest; Playwright for the smoke test. Use npm only.

Commands are listed in `ROADMAP.md` under "How to run and test" once step 1 creates the workspace.

## Commits

Conventional Commits with a required scope: `<type>(<scope>): <description>`.

- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`, `perf`, `ci`
- Scopes: `shared`, `server`, `client`, `e2e`, `experiments`, `spec`, `plan`, `roadmap`, `repo`, `deps`

## Verification

- Tests are mandatory for any behavioural change in `shared`, `server`, and the client's `net`, `prediction` and `input` modules and its HUD maths (compass, minimap). Write the test first.
- Run the full test command before every commit, and report failures with their output.
- Before calling a step done: run the tests, get a code review from a reviewer subagent, and fix every critical and important finding.
- Rendering and game feel cannot be verified by tests. Say so and leave them for owner sign-off.

## Never commit

`.env*`, `*.pem`, `*.key`, `*.p12`, `token.json`, `service-account*.json`, cookies files.

## Code style

Comment only when the reason is not obvious from the code, in one line. No docblocks.
