# Step 38: round-3 fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner's round-3 fixes on the current game: fewer Souleymans, a mixed asphalt/dirt road with bumps, goat herds and scooter riders, coins only on foot, an admin mode (fly, infinite items), a camera toggle, and a faster Lodgy with a dashboard and body bobbing.

**Architecture:** Shared rules (surfaces, course data, ambient herds, coins, admin flight, vehicle tuning) change on server and predictor together; the client adds the toggle, dashboard, bobbing and meshes. Course data changes apply to `marrakech` now; the five stages (step 40) reuse them.

**Tech Stack:** TypeScript, Rapier, Three.js, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-stages-and-round3-design.md` (part A) and `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`.

## Global Constraints

- Conventions of the main spec (units m, s, kg; yaw; 60 Hz tick; ids).
- Lodgy: 0 to 100 km/h (27.78 m/s) in 10 s ± 1 s on flat asphalt with full throttle (owner); the RV is unchanged.
- Snapshots stay valid for the existing client code paths; new fields are optional.
- Admin mode is server-authoritative, available to the room admin only, and marks the run `assisted`.
- Owner process: one short review per task; no Opus plan or branch review for this step.

## Review Focus

1. A player standing in the RV's living area (on foot, not seated) while the vehicle drives through coins: must not collect them (the owner's "coins can be picked when in car"). Test in Task 2.
2. Admin flight ending (toggle off mid-air): the admin falls normally and lands; no stuck state. Test in Task 2.
3. A goat herd crossing while the vehicle is fast: each goat counts its own hit once; the animal cap holds. Test in Task 2.
4. Dirt stretches and bumps under both vehicles: the RV still crosses every bump and dirt stretch of `marrakech` at cruising speed without getting stuck or launched (no airborne for more than 0.3 s). Test in Task 1.
5. Camera toggle while seated, on foot, downed and after respawn: the view always matches the chosen mode, and the choice survives a new run. Test in Task 4.

---

### Task 1: road surface, bumps and Souleyman save points (shared)

**Files:**
- Modify: `packages/shared/src/constants.ts`, `packages/shared/src/segments.ts`, `packages/shared/src/course.ts`, `packages/shared/src/courses/build.ts`, `packages/shared/src/courses/marrakech.extras.ts`, `scripts/route/buildMarrakech.ts`, `packages/shared/src/courses/marrakech.generated.ts` (regenerated), client `render/scene.ts` (`SURFACE_COLOURS`), `render/groundTextures.ts` (`SURFACE_TEXTURE`), `render/souleyman.ts`
- Test: `packages/shared/src/segments.test.ts`, `packages/shared/src/courses/marrakech.extras.test.ts`, a new `packages/shared/src/courses/marrakech.road.drive.test.ts`, `packages/client/src/render/souleyman.test.ts`

**Interfaces:**
- Produces: `Surface` gains `'dirt'`, `SURFACES.dirt = { grip: 0.7, rolling: 0.06 }`; road `SegmentDef` gains `surface?: 'road' | 'dirt'` (default road) and `bumps?: number` (count of bumps on the segment); `Checkpoint` gains `figure?: true`; constants `BUMP_HEIGHT = 0.12`, `BUMP_LENGTH = 1.6`, `SOULEYMAN_SPACING = 2000`, `DIRT_SHARE = 0.35`.

Rules:
1. A dirt road segment draws its road boxes with surface `dirt` (shoulders unchanged).
2. A bump is a static ground box across the road's width, `BUMP_LENGTH` along, its top `BUMP_HEIGHT` above the road, surface of its segment; bumps are spread evenly along the segment with at least `spawnClear` from each end and never on a hazard span, mud, rocks or stop.
3. On `marrakech`, `planExtras` marks straight and curved road segments as dirt in runs (seeded by the course id, about `DIRT_SHARE` of the road length, runs 150–600 m) and gives straights ≥ 60 m 1–3 bumps, excluding stops, hazards, pits, hills and the first/last segment; the fuel chain and every existing placement stay as they are (regenerate; existing tests decide).
4. `figure: true` on the first checkpoint and on the first checkpoint after every `SOULEYMAN_SPACING` m of route; all checkpoints still save as today; the client draws Souleyman, and plays the greeting toast and sound, only at `figure` checkpoints.

- [ ] Step 1: tests first: dirt segment boxes have surface dirt; bump boxes count, height, clearances (rule 2); marrakech dirt share 0.30–0.40 of road length, runs within 150–600 m; `figure` checkpoints spaced 2000 ± one segment, first included; `souleymanPlacements` only for figure checkpoints; both vehicles drive every dirt run and bump of marrakech at 12 m/s without stopping and with no airborne spell over 0.3 s.
- [ ] Step 2: run them, see them fail. Step 3: implement. Step 4: run the full test suite and typecheck. Step 5: commit.

### Task 2: herds, riders, coins on foot, admin mode (shared, server)

**Files:**
- Modify: `packages/shared/src/constants.ts`, `ambient.ts`, `animals.ts`, `protocol.ts`, `world.ts`, `player.ts`, `walk.ts`, `predictor.ts`, `packages/server/src/room/room.ts`, `server.ts`
- Test: `ambient.test.ts`, `animals.world.test.ts`, a new `coins.world.test.ts`, a new `admin.world.test.ts`, `protocol.test.ts`, server `lobby.test.ts` or a new `admin.test.ts`

**Interfaces:**
- Produces: `AmbientEvent.count?: number` (goats only, 3–6), `AMBIENT_SPACING = 80`, `AMBIENT_MAX_GOATS = 18`; `AnimalSnapshot` unchanged (each goat is its own entry); `ADMIN_TOOLS` gains `'fly'` and `'infinite'` (toggles); `PlayerSnapshot.flying?: true`; `RunResults` marks assisted when either was ever on; constants `ADMIN_FLY_SPEED = 12`, `ADMIN_FLY_VERTICAL = 6`.

Rules:
1. Herds: a goat event spawns `count` goats (seeded 3–6) spaced 1.2 m apart across the crossing, each its own animal with its own hit; the director's cap counts goats.
2. Coins: a player collects a coin only when on foot (not seated, not downed, not respawning) and not standing inside the vehicle's bounds (a player riding in the RV's living area does not collect).
3. Admin `fly` toggle: the admin's player ignores gravity and world collisions; walk input moves horizontally at `ADMIN_FLY_SPEED`, jump climbs and crouch descends at `ADMIN_FLY_VERTICAL`; seated admin cannot fly; toggling off drops the player normally; the predictor applies the same rule from `flying`.
4. Admin `infinite` toggle: item uses by the admin do not consume the item; refuel/repair at stops are free for the crew while on.
5. Both toggles are refused for non-admins (`not_admin`), allowed only in `playing`, and set the run's assisted flag.

- [ ] Step 1: tests first: herd spawning and per-goat hits; cap at 18; coin not collected by a seated player, a player inside the RV's bounds, or a downed player, collected on foot; fly up/down/horizontal speeds, no collision with a wall, landing after toggle off, predictor equals server; infinite keeps the item; non-admin refused; assisted set; protocol parse of the new tools and `flying`; snapshot size test limits raised only if needed (name them).
- [ ] Steps 2–5 as Task 1.

### Task 3: faster Lodgy (shared)

**Files:**
- Modify: `packages/shared/src/vehicles.ts`
- Test: `packages/shared/src/vehicle.test.ts` (new acceleration case); existing course and drive tests that pin times are re-measured and named.

Rules:
1. Lodgy `maxSpeed = 33` m/s (about 120 km/h); `engineForce` chosen so a flat-asphalt full-throttle start reaches 27.78 m/s in 10 s ± 1 s (the test fixes the result, the implementer finds the force and reports it); grip and brakes adjusted only if the vehicle test shows loss of control (report).
2. The RV is unchanged.

- [ ] Step 1: the acceleration test; Step 2 fail; Step 3 tune; Step 4 full suite (report every existing test whose numbers changed and why); Step 5 commit.

### Task 4: camera toggle, dashboard, bobbing, riders (client)

**Files:**
- Create: `packages/client/src/ui/hud/dashboard.ts` (+ test), `packages/client/src/render/bodyBob.ts` (+ test)
- Modify: `packages/client/src/game.ts`, `main.ts`, `ui/controls.ts`, `ui/touchUi.ts`, `ui/hud/hud.ts`, `render/vehicleMesh.ts`, `render/animalMeshes.ts`, `render/scene.ts`, `render/groundTextures.ts`
- Test: `dashboard.test.ts`, `bodyBob.test.ts`, `controls.test.ts`, the hudLayout e2e (dashboard box included)

**Interfaces:**
- Produces: `gearbox(speed: number, throttle: number): { gear: number; rpm: number }` with gear tops (m/s) `[8, 14, 20, 27, 34]`, idle 900, redline 7000 (rpm rises linearly from 1,500 at a gear's bottom to 6,500 at its top; neutral/standing → idle); `speedKmh(speed: number): number` (rounded); `bodyBob(prevVel: Vec3, vel: Vec3, dt: number, speed: number): { pitch: number; roll: number; lift: number }` (pitch from longitudinal acceleration, roll from lateral, clamped ±0.06 rad; lift a small speed-based sway ≤ 0.03 m); `game.setFirstPerson(on: boolean)`.

Rules:
1. Key V (and a touch "View" button in the top row) toggles first/third person at any time; the choice is remembered in localStorage (try/catch) and applies to the next run.
2. While seated in the driver's seat, the HUD shows a dashboard: speed in km/h and a rev counter with the gear, placed by the step 35 rules (bottom right on desktop, under the vehicle panel on touch), passing the hudLayout overlap test.
3. The vehicle body mesh pitches, rolls and lifts by `bodyBob`; the follow and first-person cameras add a speed-scaled shake of at most 0.02 m.
4. Scooters (ambient and props) carry a seated rider figure (the blocky character in a neutral outfit).
5. Dirt is drawn with a dirt texture distinct from asphalt and sand; bumps are visible as low ridges.

- [ ] Step 1: tests for `gearbox` (standing → idle, 5 m/s → gear 1, 30 m/s → gear 5, rpm within 900–7000), `speedKmh`, `bodyBob` (clamps, zero at rest), the V toggle in controls; Step 2 fail; Step 3 implement; Step 4 full suite and the hudLayout e2e; Step 5 commit; screenshots of the dashboard, a dirt stretch with bumps, a herd, a scooter rider, first person.

### Task 5: ROADMAP, spec, checks, push, PR, merge

- [ ] ROADMAP row 38 → `needs sign-off` with a decision line; main spec notes for dirt, bumps, Souleyman spacing, herds, coins, admin mode, camera toggle, Lodgy speed, dashboard; full checks; push, PR, merge (owner's standing request).
