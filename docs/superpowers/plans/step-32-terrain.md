# Step 32: solid, uneven terrain; mud; more obstacles and decor

Owner feedback (2026-11-17, after the in-game screenshots): "terrain does not have any relief, it's plain; vary height, make it uneven a lot; add sloppy dirt to slow; add more things to the decor; also more obstacles. We also fall in the void when out of bounds."

Today the physical ground is the road (10 m) plus a flat shoulder box 25 m wide on each side, so 30 m from the centre line. The far terrain in the client is visual only and sits below the shoulders, so a player or vehicle that leaves the shoulders falls through it to the kill plane (respawn after 3 s). This step makes the land beside the road solid and uneven, walls it in with a ridge, adds mud patches that slow vehicles, adds static rock obstacles on the road, and doubles the decor.

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
4. ROADMAP, spec, full checks, push, PR, merge.

## Not in this step

Bumps on the road itself (more hills are course data and cost fuel; a later step), new decor models (step 33), colliders on decor, deformable mud, mud on the player.
