# Step 28d: parkour sections on `marrakech`

Spec: the owner feedback of 2026-11-15 (ROADMAP "owner feedback"): "some crazy/parkour that will make use of all items". Built on 28a (hills, pits, `hillSegments`, `planInserts`) and the existing hazards and pickups. No new segment type, no new prop kind, no protocol change.

## Goal

Three hand-composed sections (`parkour` inserts) in the `marrakech` course. Between them they use every item and tool at least once on purpose: jerrycan (fuel), toolbox (repair), health kit (revive), winch (boulder anchors), crates (a wall to clear or push), barriers (gates, roadblock). A section is a run of ordinary segments placed with the same machinery as the hills and pits.

## Sections (constants in `packages/shared/src/courses/parkour.ts`)

All lengths are segment `length` in m. Every section starts and ends with a flat 15 m road (like `hillSegments`).

- `RUBBLE_RUN` (target 0.10): flat 15; road 70 with `gates` (count 4, along from `hazardRange`); road 40 with `crateWall`; road 40 with `roadblock`; road 40 with `pickups` toolbox (along 10, lateral -3) and healthKit (along 20, lateral 3); flat 15. Uses barriers, crates, toolbox, health kit.
- `CREST_AND_PULL` (target 0.43): flat 15; road length 60/cos(8°) at slope 8; crest flat 15 with one boulder anchor (`boulder`, along 7.5, lateral -(ROAD_WIDTH/2 - BOULDER_EDGE_INSET)); road at slope -14 over a 60 m run (the steep side: the jump); flat 40 with a jerrycan pickup (along 20, lateral 3); flat 15. A vehicle that tops the crest above about 12 m/s leaves the ground. Uses the winch (crest boulder) and jerrycan.
- `PIT_GAUNTLET` (target 0.72): flat 15; flat 40 with a jerrycan pickup (along 20, lateral -3); `SHALLOW_PIT`; road 30 with `debris` 3 (crates in the lane); `DEEP_PIT`; road 40 with a healthKit pickup (along 20, lateral 3); flat 15. Uses the winch (deep pit boulders), crates, jerrycan, health kit.

Exports: `RUBBLE_RUN`, `CREST_AND_PULL`, `PIT_GAUNTLET` as `SegmentDef[]`, and `PARKOUR_TOOLS: Record<string, readonly ParkourTool[]>` (the tools each section is meant to use: `'jerrycan' | 'toolbox' | 'healthKit' | 'winch' | 'crate' | 'barrier'`), used only by tests.

## Placement

1. `MARRAKECH_TERRAIN` gains three entries after the existing ones: `parkour` 0.10 and 0.43 (clearance `TERRAIN_HAZARD_CLEAR`) and `parkourPit` 0.72 (clearance `TERRAIN_DEEP_CLEAR`, because it holds a deep pit). `MARRAKECH_TERRAIN_SHIFTS` gets three more entries, starting at 0.
2. `placeTerrain` marks a span `deep` for both `deepPit` and `parkourPit`; `TERRAIN_NAMES` includes the new names. Fuel stops and the planned hazards keep the existing clearances around these spans.
3. `planExtras` already skips pickups and hazards on terrain segments only through the terrain clearance; the sections' own pickups and hazards are set on the defs, so `planExtras` must not overwrite them: it only touches road segments that are `straight` and not inserted (inserted indexes are in `skip`), which the parkour segments are. Check that no random pickup, coin or stop lands on a parkour segment (test 5).
4. Re-run `scripts/route/searchTerrain.ts` to find the shifts that keep the fuel chain within 1.5 km; regenerate `marrakech.generated.ts` with `scripts/route/buildMarrakech.ts`. Targets stay within `MAX_TERRAIN_DISTANCE`.
5. Ambient animals and item drops keep their margins: `ambient.blocked` already covers hazards, pickups and terrain spans; add the parkour spans to whatever the 28b/28c planner reads for terrain (it reads spans from the placement), so no animal or drop appears inside a section. If the planners read only named spans, extend them to the new names.

## Rules

1. Each section is valid: `buildCourse` accepts the course (no curved road beside a sloped one, minimum lengths, hazard ranges, debris gap).
2. No tool is a requirement for Lodgy: it can drive every section without the winch. The RV needs the winch only at the deep pit (28a) and may need it at the crest; no section blocks the road completely except the roadblock, which can be pushed (heavy barrier, several players) or winched.
3. The items in a section lie on the road lane inside the section, never on a segment a stop or checkpoint shares with a hazard.
4. A checkpoint is still one per segment; the sections add 5 + 5 + 7 = 17 segments (course 260 → 277). Snapshot size is re-measured (test 6).

## Tests (write first)

1. `parkour.test.ts`: each section builds (`buildSegment` per def, `buildCourse` of a course made of one section between two flat roads); the three together cover all six tools in `PARKOUR_TOOLS`, and each claimed tool really appears in the built section's props, pickups or anchors.
2. `marrakech.course.test.ts` (changed): the built course holds the three sections in order, at the targets within `MAX_TERRAIN_DISTANCE`, each clear of every other terrain span by the clearances above; segment count 277.
3. `marrakech.drive.test.ts` (changed, or a new `marrakech.parkour.drive.test.ts`): a scripted Lodgy drives each section start to end without the winch, within a time bound, with no kill-plane reset; the RV does the same on `RUBBLE_RUN` and, with the winch, on `CREST_AND_PULL` and `PIT_GAUNTLET` (reuse the 28a harness for the deep pit).
4. `marrakech.measure.test.ts` (changed): the fuel-stop chain gap still ≤ 1.5 km and the RV worst remaining fuel is re-measured; report both in the task report (the 27.6 % figure may move).
5. A test that no random pickup, coin, stop or garage is on a parkour segment, and no ambient event or drop plan entry is inside a section.
6. `marrakech.snapshotSize.test.ts` / `marrakech.itemSize.test.ts` (changed numbers, if any): full snapshot ≤ 27 KB with six drops; report the new figures.
7. Existing tests that pin the segment count, the placement list or the generated file hash are updated to the new numbers; the task names each one it changed.

## Tasks

1. Task 1 (shared): `parkour.ts`, placement entries, `placeTerrain` change, searchTerrain rerun, regenerate the course, tests 1, 2, 4, 5, 7.
2. Task 2 (shared): drive tests (3), snapshot sizes (6), ambient/drop margin check (rule 5), jump-crest measurement (exit speed and air time at the crest for both vehicles; report only, no retune).
3. Task 3: ROADMAP row 28d `needs sign-off`, decision line (sections, fuel chain result, what the crest measured), spec "Course" paragraph on parkour sections.

## Not in this step

A gap jump (a missing stretch of ground), a ramp prop, new items, scoring. Feel of the crest, the section lengths and the item placement are the owner's call.
