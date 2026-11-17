# Step 32: solid, uneven terrain; mud; more obstacles and decor

Owner feedback (2026-11-17, after the in-game screenshots): "terrain does not have any relief, it's plain; vary height, make it uneven a lot; add sloppy dirt to slow; add more things to the decor; also more obstacles. We also fall in the void when out of bounds."

Today the physical ground is the road (10 m) plus a flat shoulder box 25 m wide on each side, so 30 m from the centre line. The far terrain in the client is visual only and sits below the shoulders, so a player or vehicle that leaves the shoulders falls through it to the kill plane (respawn after 3 s). This step makes the land beside the road solid and uneven, walls it in with a ridge, adds mud patches that slow vehicles, adds static rock obstacles on the road, and doubles the decor.

**The amendments T1–T18 at the end (from the Opus plan review) replace any line above that they contradict.**

## Conventions and constants (shared `constants.ts`)

`d` is the horizontal distance from a point to the course's route polyline (the centre line).
- `CORRIDOR_INNER = 29` m: the solid terrain starts 1 m under the shoulder edge (shoulders end at `ROAD_WIDTH / 2 + SHOULDER_WIDTH = 30` m).
- `CORRIDOR_BLEND_END = 40` m: relief ramps in between 34 and 40 m.
- `CORRIDOR_RELIEF = 5` m: the largest height of the relief (bumps and hollows), reached at `d = 60` m.
- `CORRIDOR_RIDGE_START = 100` m, `CORRIDOR_RIDGE_END = 116` m, `CORRIDOR_RIDGE_HEIGHT = 14` m: a boundary ridge rising with a smoothstep (steepest slope about 53°, above `PLAYER_MAX_SLOPE_DEG` 45).
- `CORRIDOR_OUTER = 124` m: the solid terrain ends here.
- `OUT_OF_BOUNDS = 126` m: beyond this a player or vehicle is out of bounds (rule 6).
- `CORRIDOR_CELL = 4` m, `CORRIDOR_TILE_CELLS = 64` (one heightfield per 256 m tile).
- `CORRIDOR_SMOOTH = 60` m: half the window of the smoothed route height used as the terrain's base.
- Surface `mud`: `SURFACES.mud = { grip: 0.55, rolling: 0.22 }`; the corridor surface is `sand`.
- `MUD_MIN_LENGTH = 12`, `MUD_MAX_LENGTH = 20` m.

## Files

- `packages/shared/src/corridor.ts` (new): `buildCorridor(course: BuiltCourse, seed: number): Corridor`, `corridorHeightAt(corridor, x, z): number | null`, `interface Corridor { tiles: CorridorTile[]; minY: number }`, `interface CorridorTile { x0: number; z0: number; cols: number; rows: number; cell: number; heights: Float32Array }` (row-major, `(rows + 1) * (cols + 1)` heights), plus a pure `routeFrame(course)` helper (nearest-segment search over the route with a bounding-box index, the route surface height at each route point and its smoothed value) that the client may reuse.
- `packages/shared/src/statics.ts` / `world.ts`: one Rapier heightfield collider per tile, in the ground collision groups, surface `sand` through `surfaceOf`; the out-of-bounds rule.
- `packages/shared/src/courses/build.ts`: `BuiltCourse.corridor` built lazily on first use (the `marrakech` course is already built lazily); `killPlaneY` becomes `min(lowest ground, corridor.minY) - KILL_PLANE_BELOW`.
- `packages/shared/src/segments.ts`: hazard `{ kind: 'mud'; along: number; length: number }` and hazard `{ kind: 'rocks'; along: number; side: -1 | 1 }`.
- `packages/shared/src/courses/marrakech.extras.ts`: `MUD_PLAN` and `ROCKS_PLAN`; `scripts/route/buildMarrakech.ts` regenerates the course.
- `packages/client/src/render/terrain.ts` and `decorScatter.ts`: draw the corridor from the shared heights; far terrain meets the ridge; denser decor on the corridor.

## Behaviour rules

1. Height. For a point at distance `d` with nearest route point height `r` (the ground top on the route) and smoothed height `s` (mean of `r` over the route within `CORRIDOR_SMOOTH` m along it):
   - `d < 34`: `min(r, s) - 0.05` (always under the shoulder top, so the shoulder wins the wheel ray and the player's feet; pits, the ford and hills do not dent or lift the land).
   - `34 ≤ d < 40`: blends from that to `s + relief(x, z, d)` with a smoothstep.
   - `40 ≤ d < 100`: `s + relief(x, z, d)`; relief is deterministic value noise (two octaves, wavelengths about 70 m and 22 m, seeded by `hashSeed(course.id)`) scaled from 0 at `d = 34` to `CORRIDOR_RELIEF` at `d = 60` and kept there.
   - `100 ≤ d ≤ 124`: the relief value at the ridge foot plus `CORRIDOR_RIDGE_HEIGHT × smoothstep((d - 100) / 16)`, flat from 116 m.
   The function is shared and deterministic; server and client compute identical heights.
2. Tiles cover every point with `CORRIDOR_INNER ≤ d ≤ CORRIDOR_OUTER`; a tile with no such point is not built. Heights inside a tile at points with `d < CORRIDOR_INNER` use the `d < 34` rule (so they stay under the road and shoulders), and points with `d > CORRIDOR_OUTER` keep the ridge-top height.
3. Where two route stretches come within `2 × CORRIDOR_OUTER` of each other (switchbacks), a point takes its nearest route point; the ridge of one stretch may cut the other's land, and the road of the other always stays on top (rule 1's clamp applies to whichever route point is nearest, and the road and shoulder boxes stay above). The implementer reports any place on `marrakech` where a ridge crosses a shoulder or road, with the along distance, and does not invent a fix.
4. Physics: one fixed heightfield collider per tile, friction `COURSE_FRICTION`, surface `sand`, collision groups as the shoulders; no change to the road, shoulder, wall and prop colliders.
5. The wheel ray, the player controller and items (drops, thrown items) treat the corridor as ground. Item drops and animals keep their own placement rules (lateral 6.5 m and the road), unchanged.
6. Out of bounds: each tick, a player whose horizontal distance to the route exceeds `OUT_OF_BOUNDS` (and is not seated) is moved to the nearest route point, `ROAD_WIDTH / 2 + 8` m to the side they left on, 1 m above the shoulder top, velocity zero, with no damage and no respawn delay (an event `outOfBounds` for the client toast). A vehicle whose centre exceeds `OUT_OF_BOUNDS` counts as lost (the existing checkpoint restart, penalty included).
7. Mud (hazard on a straight road segment): a ground box the road's width wide and `length` long, `STOP_PAD_LIFT` above the road top, surface `mud`. It is static and is never in a snapshot. Players walk over it normally.
8. Rocks (hazard on a straight road segment): two static boulders (the existing `boulder` anchor kind, so they can take the winch hook) on one side of the lane, side `side`, at lateral `side × 2.5` and `side × 4.2`, 3 m apart along; the free lane is at least `2 × RV half width + 1.2` m. Never on a stop, a hazard, an inserted segment, within 40 m of a mud patch or a checkpoint spawn.
9. `MUD_PLAN` places 10 patches and `ROCKS_PLAN` 12 groups on `marrakech` by route fraction, with the same machinery as `HAZARD_PLAN` (nearest fitting straight); lengths alternate 12, 16, 20 m. The fuel chain and every existing placement stay valid (the generated course is regenerated and the existing tests decide).
10. Client: inside `CORRIDOR_OUTER` the terrain mesh uses the shared tile heights (one mesh per tile, frustum culled); outside, the existing far terrain is drawn at the ridge-top height plus its gentle noise, never above the corridor inside it. Decor: double the scatter density on the corridor (rocks, shrubs, palms, cacti; existing models only) and place each item on the corridor height; nothing on the road or shoulders that is not there today; larger rocks get no collider (visual only).
11. Snapshot messages do not change; the full-snapshot size tests stay as they are.
12. Cost bounds for `marrakech`: at most 700,000 heights in all; building the corridor takes at most 2 s on the server in tests; the world step stays within the existing 3 ms budget test.

## Tests (write first)

1. `corridor.test.ts`: heights are deterministic; for 2,000 sampled points with `d < 34` the height is at least 0.05 m below the route height; the relief stays within `±CORRIDOR_RELIEF` of `s` for `40 ≤ d < 100`; the ridge's steepest sampled slope exceeds 45°; every sampled point with `29 ≤ d ≤ 124` lies in a tile; the height count and the build time stay within rule 12 (build time measured, reported, asserted at 2 s).
2. World: a player walks off the shoulder and 40 m out at five places (a straight, the inner and the outer side of a curve, beside the deep pit, on the big hill) and stands on the corridor for 5 s with no respawn.
3. World: a player pushing outward from `d = 90` for 10 s never passes `d = 118`.
4. World: a player placed at `d = 130` is back at `d ≈ 13` within one tick with an `outOfBounds` event; a vehicle placed at `d = 130` triggers the checkpoint restart.
5. World: the Lodgy drives 50 m off-road onto the corridor and back onto the road without falling; its wheels report `sand` there.
6. Mud: the wheels report `mud` on a patch; driving straight over a 16 m patch at 12 m/s loses at least 20 % of the speed; both vehicles cross every `marrakech` patch from 12 m/s without stopping (drive test).
7. Rocks: the free lane is at least the rule 8 width at every group; the RV drives through each `marrakech` group (drive test).
8. Client: the terrain mesh height matches `corridorHeightAt` within 0.05 m at 200 sampled vertices; outside the corridor the far terrain is never above the ridge top within 8 m of `CORRIDOR_OUTER`.
9. Existing tests that change (course segment counts, the extras report, the generated-file equality, the ambient eligible length, the item drops eligible length, kill-plane values) are named in each task's report.

## Tasks

1. Task 1 (shared): constants, `corridor.ts`, `BuiltCourse.corridor`, heightfield colliders, out-of-bounds rule, kill plane; tests 1–5.
2. Task 2 (shared, after Task 1): `mud` surface and hazard, `rocks` hazard, the plans, course regeneration; tests 6, 7, 9.
3. Task 3 (client, after Task 1, parallel with Task 2): corridor mesh, far terrain, decor; test 8; screenshots of the road from the vehicle, a curve, the ridge and a mud patch.
4. ROADMAP, spec, full checks, push, PR, merge (the owner's standing request: push, open a PR and merge after every step).

## Not in this step

Bumps on the road itself (more hills are course data and cost fuel; a later step), new decor models (step 33), colliders on decor, deformable mud, mud on the player.

## Amendments from the Opus plan review (T1–T18)

- T1 Opt-in: the corridor exists only on courses whose `CourseDef` sets `corridor: true` (like `ambient`); only `marrakech` sets it. Without it nothing changes (no tiles, no out-of-bounds rule), so `testGround` and the custom test courses keep working.
- T2 No lazy field: `corridorOf(course: BuiltCourse): Corridor | null`, cached in a module `WeakMap<BuiltCourse, Corridor>`; one build per isolate, shared by every run world, the predictor and the renderer. `buildCourse`, `deepFreeze` and `killPlaneY` stay as they are; a test asserts `corridor.minY > killPlaneY + 10`.
- T3 Under the road at sags: for `d < 34` a vertex takes the minimum route height `r` within ±(`CORRIDOR_CELL` × √2 + 1) m along the route of its nearest point, minus 0.05. Test: at 1 m steps along every pit, hill, bank and the ford, the triangulated collider height (Rapier's triangulation, T5) is at least 0.04 m under the road top, and under the shoulder top on both sides.
- T4 Hills: for `d < 34` use that `r`-based value (not `min(r, s)`), and blend to `s + relief` over 34–40 m; so there is no drop at the shoulder edge on hills (the big-hill crest would otherwise drop 5.7 m).
- T5 Rapier layout (checked on rapier3d-compat 0.21): `ColliderDesc.heightfield(nrows, ncols, heights, scale)` takes `(nrows + 1) × (ncols + 1)` heights column-major (rows run along Z, columns along X, index `zi + xi × (nrows + 1)`), `scale = (ncols × cell, 1, nrows × cell)`, centred on the collider: translation `(x0 + cols × cell / 2, 0, z0 + rows × cell / 2)`. Each cell splits along the (x1, z0)–(x0, z1) diagonal; `corridorHeightAt` and the client mesh use the same diagonal. Use `HeightFieldFlags.FIX_INTERNAL_EDGES` if the installed version has it. `CorridorTile.heights` is stored in Rapier's layout.
- T6 Tiles: `CORRIDOR_TILE_CELLS = 32` (128 m tiles; about 609,000 heights on `marrakech`, within the 700,000 bound). Tiles keep the ridge-top height out to `OUT_OF_BOUNDS + 4` = 130 m (there is no void between the land's end and the out-of-bounds line).
- T7 Algorithm: per tile, collect the route segments whose bounding boxes lie within `CORRIDOR_OUTER + 8 +` the tile diagonal, and scan only those for the nearest point. `r` per route vertex comes from shared code (move the client's `surfaceYAt`/`routeHeights` into shared, the client then imports them), interpolated at the projection onto the polyline; `s` per route vertex is precomputed. Build time bound: 2 s in Node tests (report the measured value); test 1 asserts it.
- T8 Relief: value noise on a lattice of 35 m and 11 m with weights 0.7 and 0.3 (sum ≤ 1, so within ±`CORRIDOR_RELIEF`), a hash of the lattice coordinates and `hashSeed(course.id)`, smoothstep interpolation; the steepest sampled relief slope stays at or below 20° (asserted). Rule 1's ridge foot reads: `s + relief(x, z)` at full amplitude.
- T9 Ridge: keep 100–116 m but `CORRIDOR_RIDGE_HEIGHT = 16`, so the steepest sampled slope on the 4 m grid is above 55°. Test 3 runs against the real collider with the player jumping as well.
- T10 Obstacles stay obstacles (my call, the owner may overrule): around every place that blocks or slows the road on purpose (roadblock, gates, crate wall, rocks, mud, the bank, the deep pits, the ford, the alley, the roadworks), the corridor rises into a berm from `d = 31` to `d = 40`, 3 m above the road top, steepest slope above 55°, along the obstacle's span plus 20 m each way, blending back over 20 m. Vehicles and players cannot go round on the sand there. A test drives the Lodgy at each kind's berm and asserts it stays on the road side.
- T11 Rocks need colliders: each rock is a `walls` box `ROCK_HALF = (0.8, 0.6, 0.7)` (the drawn boulder) plus an anchor entry (they take the hook). Rocks get `hazardSpan` `[along - 0.7, along + 3.7]`, mud `[along, along + length]`; both follow `hazardRange`'s spawn and end clearance (`spawnClear`), `HAZARD_MIN_GAP` against other hazards and debris; the mud box is `ROAD_THICKNESS` thick and needs a segment at least `length + 2 × spawnClear`.
- T12 Placement: mud and rocks only on straights (`!def.curve`, no slope), never on a segment with a stop, a hazard, a pickup, or (rocks) coins; they are planned after coins and pickups, so the coins, pickups and extras report do not move. `MUD_PLAN` and `ROCKS_PLAN` are passed through `ExtrasOptions` (only `marrakech` uses them; the synthetic `longCourse` tests are unaffected). Rocks block ambient events (their span joins the blocked spans with the 60 m margin, so animals never cross between boulders); mud does not (exclude it in `build.ts`).
- T13 Out of bounds: the land ends at 130 m (T6) and the rule fires beyond `OUT_OF_BOUNDS = 126` m. It skips seated players and players with `respawnIn !== null`. A downed player is moved and stays downed; a held winch hook is stowed (`releaseHook(id, 'stow')`), a carried prop or item is dropped where the player was, a hold in progress is cancelled. It is not a respawn (no counter). The landing point: nearest route point, lateral `ROAD_WIDTH / 2 + 8` to the side left, height from `groundHeightBelow`; if no ground (alley, ford) or the point is inside a wall or on a stop pad, `players.findSpawn` beside the vehicle. A route index (`routeAlong`) is always built on corridor courses, with a per-player hint. The vehicle case sets `restartPending` (no change to `vehicleLost`'s signature).
- T14 Event and typing: the new event kind `outOfBounds` is added to `EVENT_KINDS` (protocol tests) and the client's `soundMap.ts` / event toast map (text "Back to the road"). Task 2 adds `mud` to `SURFACE_COLOURS` (`scene.ts`) and `SURFACE_TEXTURE` (`groundTextures.ts`; reuse the riverbed or gravel texture tinted darker). Rule 11 reads: snapshot shape unchanged, one new event kind.
- T15 Client cost: the predictor shares the cached corridor (no second build). Terrain tile meshes are built lazily within the decor radius (350 m desktop, 200 m touch) like `decorChunks`, Uint16 indices per tile, and disposed when far. Far terrain: cells whose four vertices all have `d < CORRIDOR_OUTER + 57` are skipped; tile meshes cover their full squares (ridge top beyond 124 m) with a 2 m vertical skirt; far terrain height is the nearest ridge top plus its noise × smoothstep((d − 124) / 100). A client build-time test bounds `corridorOf` plus the first meshes at 3 s in Node.
- T16 Decor: the `hills` mesas move to `d ≥ CORRIDOR_OUTER + 10`; decor between 30 m and 124 m stays visual only (no colliders, accepted for this step, noted in the decisions log); doubling the density respects the existing caps (3,000 desktop, 1,200 touch) by filling the new corridor band first.
- T17 Durable Object: a room test builds two `marrakech` run worlds and logs WASM memory growth and the first-build time; the first corridor build must be excused by the stall detector (check `lastBuild`/`STALL_GRACE`; if not, extend the grace for the first run and say so).
- T18 Existing tests that will change (each task names the ones it touches): `marrakech.course.test.ts` T6 (the five planned hazards: filter to the original kinds), `build.ambient.test.ts` (blocked spans, the open-route bound), `marrakech.ambient.measure.test.ts` T10, the `itemDrops` world, perf and room tests, the extras report and generated-file tests, `marrakech.drive.test.ts` "the sample" (hazard kinds), `marrakech.measure.test.ts` T9, protocol event-kind tests, client `terrain.test.ts` and `marrakech.perf.test.ts`.
