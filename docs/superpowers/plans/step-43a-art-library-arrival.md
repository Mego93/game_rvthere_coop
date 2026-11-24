# Step 43a: the prop library, the dressing rules, uneven walkable ground, and the arrival rebuilt

**Spec:** `docs/superpowers/specs/2026-11-23-world-art-pass-design.md` (approved 2026-11-24).

**Process (owner):** one short Sonnet review per step. Tasks run in parallel where the table below marks them. TDD, Conventional Commits, and the full checks before each commit. The step ends at `needs sign-off`: the owner judges the look on a real iPhone.

## Global constraints

- **Race mode.** It does not change in this step. Existing race tests pass unchanged.
- **Physics truth.** The walkable ground is real physics, built in `shared` and used by both the server and the client. Nothing is drawn that cannot be stood on, and nothing solid is invisible except the colliders behind real models.
- **The arrival contract.** These stay the same: course id `arrival`, `finishBy: 'players'`, the story goals `arrive` and `driveHome`, and story-only registration. Everything else in the arrival may change. Each rewritten test is named in the task report.
- **Models.** Sketchfab only: the most downloaded usable model (CC0 or CC BY); if that one is unusable, the most reliable usable one. Every model is credited and has its logos neutralised.
- **Phone budgets.**

| Budget | Phone | Desktop |
|---|---|---|
| Extra download for the arrival's new props and buildings | at most 6 MB | at most 6 MB |
| Placed prop instances | at most 600 | at most 1,500 |
| Draw distance for props | 90 m | 220 m |
| Per-model triangles | the existing checks; named exceptions as today | the existing checks; named exceptions as today |

## Part 1: the prop library (client)

**L1. Theme sets.** `packages/client/src/render/propLibrary.ts` exports `PROP_THEMES: Record<PropTheme, PropEntry[]>`, where:
- `PropTheme` is `'airport' | 'city' | 'souk' | 'desert' | 'forest' | 'mountain' | 'villa' | 'golf'`;
- `PropEntry` is `{ key: ModelKey; role: PropRole; size: number; weight: number; phone: boolean }`;
- `PropRole` is `'clutter' | 'roadside' | 'wall' | 'crowd' | 'landmark' | 'building'`.

43a fills only the `airport` theme. The other themes are declared empty and are filled in 43c and 43d.

**L2. The airport theme.** It has at least 25 props, all from Sketchfab, including:
- luggage trolleys, suitcases, benches, bollards, planters with palms, palm trees;
- a taxi, a minibus, parked cars, an airport sign or wayfinding totem;
- a kiosk or café stand, rubbish bins, barriers, cones;
- lamp posts, a fountain, flags, an arrivals board, a shuttle bus stop;
- people standing (crowd role, static, no colliders).

Buildings:
- one terminal building, the landmark, with a pitched or diamond-pattern roof;
- a car park structure;
- a rental car office.

## Part 2: the dressing rules (client)

**R1.** `dressMap(course: BuiltCourse, theme: PropTheme, seed: number, opts: { phone: boolean }): PropPlacement[]` lives in `packages/client/src/render/dressMap.ts`.
- It is deterministic per seed.
- It places props from the theme by role, with these densities:
  - `clutter` at 4 per 100 m² of walkable ground near paths;
  - `roadside` every 6–10 m along the edges of the route or paths;
  - `wall` along wall boxes;
  - `crowd` 1 per 150 m², kept away from the route.
- It honours the phone cap and draw distance.

**R2. Clearances.**
- No prop overlaps the route corridor (1.5 m either side of the walk line), a spot, a checkpoint, a finish box, a stop, a hazard or the vehicle spawn.
- No prop sits on a slope steeper than 30°.
- Props have no colliders, except a prop whose entry says `solid`. On the arrival these are none.

**R3. Rendering.** Instanced rendering: one instanced mesh per model per map. `dressMap`'s placements feed `createPropLayer(scene, placements, manifest)` in `render/propLayer.ts`.

## Part 3: uneven walkable ground (shared)

**G1. The `GroundPatch` type.** `BuiltCourse` gains `terrain?: GroundPatch[]`. A patch is:

```
{ id; x0; z0; cell: number; cols; rows; heights: number[]; surface: Surface }
```

The heights are row-major. Patches never overlap.

`statics.ts` builds one Rapier heightfield collider per patch, as it does for corridor tiles, with `FIX_INTERNAL_EDGES`. The client draws the same heights with the same surface textures as today.

**G2. Steps and ramps** stay boxes (`GroundBox`), so that stairs and kerbs are crisp. A heightfield cell is at most 2 m. The slope between neighbouring cells is at most 25° wherever players must walk, so that `PLAYER_STEP_HEIGHT` and the controller can climb it.

**G3. Height helper.** `terrainHeightAt(course, x, z): number | null` lives in `packages/shared/src/terrain.ts`. Spawns and props use it.

## Part 4: the arrival rebuilt (shared and client)

**A1. Layout.** An airport district of about 220 × 160 m.

| Area | What it holds |
|---|---|
| Terminal (landmark) | Its doors face the forecourt, with three exits: left, centre and right. Players start inside the arrivals hall. |
| Forecourt | Palm rows and planters, 1–1.5 m of height change: gentle mounds and two short stair flights. |
| Taxi lane | Cars, a minibus, bollards, and the crossing gates from 41b reused. |
| Car park | A raised level about 3.5 m up, reached by a ramp and stairs, with parked cars as cover. |
| Rental stop | In the far corner, with the parked Lodgy and the finish box. |

**A2. Routes.** There are at least three routes from the start to the rental stop:
- through the car park (the raised level);
- along the taxi lane;
- around the back of the terminal, along a service road.

**A3. Cover and items.**
- Cover comes from the parked cars and the planters (solid boxes under the models).
- The ammo box is moved to the forecourt.
- One extra ammo box is on the raised car park.

**A4. Enemies.** Enemies stay at `ARRIVAL_ENEMY_DENSITY` and keep following the friend furthest back (41b). Their spawn points are along all three routes, at least 25 m from the start.

**A5. Terrain.** The ground is `GroundPatch` heightfields plus box stairs and ramps. The terminal, the car park and the rental office are real models over invisible box colliders.

## Tests (write first)

### Shared

1. `terrain.test.ts`:
   - A course with a patch builds a heightfield collider whose ray heights match `terrainHeightAt` to within 1 cm.
   - A player stands on and walks up a 20° patch slope.
   - A 35° slope is refused by the builder (it throws).
   - Patches never overlap.
2. `courses/arrival.test.ts`, rewritten. Each changed test is named.
   - The course builds and is story-only, with `finishBy: 'players'`.
   - The finish box contains the Lodgy.
   - Each of the three routes is walkable: a grid walk with the step limit, including the stairs and the ramp to the raised car park.
   - Enemy spawns lie along all three routes, at least 25 m from the start.
   - The two ammo boxes are reachable.
   - A real-physics walk from start to finish ends in `won`.
   - A vehicle dropped on the forecourt does not fall through.

### Client

3. `dressMap.test.ts`:
   - The output is deterministic for a given seed.
   - Densities stay within ±20 % of R1 on the arrival.
   - The phone cap of 600 and the phone draw distance hold.
   - No placement violates the R2 clearances (route, spots, finish, spawn).
   - No prop sits on a slope over 30°.
4. `propLibrary.test.ts`:
   - The airport theme has at least 25 entries.
   - Every key exists in the model manifest.
   - Every model is credited.
5. Changed tests: `modelManifest.test.ts`, `sketchfabAssets.test.ts` and `credits.test.ts` (new keys, files and credits).
6. Download budget: the sum of the arrival's new model files is at most 6 MB.

### Review focus (each pinned by a test above)

- A prop spawned on a slope or inside a collider.
- A route blocked by props or cover.
- A player stuck at a patch edge or a stair seam.
- The phone over its prop cap.
- The finish box unreachable from one of the routes.

## Tasks

| Task | Package | Order | Covers |
|---|---|---|---|
| 1 | assets | first; parallel with 2 | The airport theme from Sketchfab: at least 25 props and 3 buildings, optimised, credited, plus a contact sheet. `picks.md` lists the role and size of each model. |
| 2 | shared | first; parallel with 1 | G1–G3, tests 1 |
| 3 | shared | after 2 | A1–A5, test 2 |
| 4 | client | after 1 and 3 | L1–L2, R1–R3, terrain rendering, the arrival scene with real buildings, tests 3–6. Screenshots: the terminal, the forecourt, the raised car park, each route, a fight, and the phone. |
| 5 | main session | last | The ROADMAP row for 43a set to `needs sign-off` with a decision line; one short Sonnet review; push, PR and merge. |

## Not in this step

- The characters (43b).
- The race maps (43c).
- The villa, camp and PrimeGolf (43d).
- The other prop themes beyond `airport`, which are declared empty here.
