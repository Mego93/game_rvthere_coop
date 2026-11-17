# Step 28d: parkour sections on `marrakech`

Spec: the owner feedback of 2026-11-15 (ROADMAP "owner feedback"): "some crazy/parkour that will make use of all items". Built on 28a (hills, pits, `hillSegments`, `planInserts`) and the existing hazards and pickups. No new segment type, no new prop kind, no protocol change.

**The amendments at the end (P1–P12, from the plan review) replace any line above that they contradict.**

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

## Amendments from the plan review (P1–P12)

- P1 Counts: RUBBLE_RUN has 6 segments, CREST_AND_PULL 6 (P4), PIT_GAUNTLET 7: 19 in all. Each insert also splits a straight, so the course grows by 16 to 22 segments depending on the shifts. No code pins a count of 277; `marrakech.terrain.test.ts` (pins 48 and a 260 comment), `marrakech.route.test.ts` (inserted length 33, pit count 6) and the generated-file check take the numbers the final shifts give, and the report names each.
- P2 Snapshot size: the sections add about 16 props (gates 4, crateWall 6, roadblock 3, debris 3), about 3.4 KB at about 212 bytes each; the full snapshot would pass 27 KB (the limit is a test number, not a protocol rule; it was raised before at steps 16 and 25). Decision: drop the debris from PIT_GAUNTLET (13 props, about 2.8 KB) and raise the two full-snapshot limits (`marrakech.snapshotSize.test.ts` 25,000 and `marrakech.itemSize.test.ts` 27,000) to 30,000 and 32,000. The item-size test's drops-add-at-most-1.5-KB check stays. The report gives the measured sizes; the owner may ask for fewer props.
- P3 Fuel chain: `scripts/route/searchTerrain.ts` must call `planExtras` in its cost (feasibility first, then largest gap), so a shift set that makes the chain throw is never chosen. Bounds relaxed for the three parkour entries only: shift and placement distance up to `MAX_TERRAIN_DISTANCE` (1300 m); the existing 200 m bounds for the other entries stay and the tests carry the exception. The search may move any other terrain entry within 1300 m too if no feasible set exists otherwise; the report lists every shift that moved and why.
- P4 CREST_AND_PULL becomes `hillSegments(BIG_HILL_SLOPE)` followed by road 40 with a jerrycan pickup (along 20, lateral 3): the 14° climb carries the big hill's boulders (so the winch use is real) and the run is level (60 m up and 60 m down). The 8° idea and the section's own crest boulder are dropped. The crest is the jump; its air time is only measured.
- P5 Hazard positions: gates `along` = midpoint of `hazardRange('gates', 70)` rounded to 0.1 (12.7 is valid); crateWall and roadblock `along` 20 on their 40 m roads. RUBBLE_RUN's pickups move to along 20 (toolbox, lateral -3) and 28 (healthKit, lateral 3), at least 8 m beyond the spawn at along 8.
- P6 Rule 3 is replaced by: a pickup lies at least 8 m from a segment's checkpoint spawn and inside the lane.
- P7 Placement point 3 is replaced by: `planExtras` leaves the parkour segments alone because they are inserted (`skip`); the sections' own hazards and pickups survive (the review verified this).
- P8 Rule 5 and the planner text are replaced by: no change to `ambient.ts` or `itemDrops.ts`. `ambient.blocked` is derived in `buildCourse` from the segments (non-road or sloped segments, stops, hazard spans, debris, 60 m margin) and `planItemDrops` adds pickups ±40 m. CREST_AND_PULL and PIT_GAUNTLET are fully blocked; RUBBLE_RUN's last flat 15 m is not. Test 5 asserts: no ambient event or drop inside a section except on RUBBLE_RUN's end flat, and `ambient.test.ts`'s pinned `ELIGIBLE_LENGTH` (15581.4) takes the new value.
- P9 `placeTerrain`: only the line `deep: g.name === 'deepPit'` changes, to also accept `parkourPit`. A `clearance` constrains an insert only against inserts placed before it, so the clearance test is: each parkour section is at least 120 m (150 m for `parkourPit`) from every section placed before it, and every earlier-placed terrain span is at least that far from it.
- P10 Existing tests that change, each named in the report: `marrakech.terrain.test.ts` (pit counts 8 shallow-or-deep by type, the 120 m terrain-to-terrain check excludes gaps inside a parkour section, group counts, the 200 m bounds exception), `marrakech.course.test.ts` ("the five of the plan" filters out inserted segments; "never sits on inserted terrain" excludes the sections' own hazards), `marrakech.drive.test.ts` (`groups` and the kinds `toEqual`; `sampleSegments` includes the sections' road segments, checked for the time budget), `marrakech.measure.test.ts` (the RV leg must still reach through RUBBLE_RUN's roadblock: skip or push it like the airport's, and say which), `ambient.test.ts`, `marrakech.route.test.ts`.
- P11 Test 3 reuses the winch helper from `pit.test.ts`; the RV winch drives are done on PIT_GAUNTLET's deep pit and CREST_AND_PULL's climb only if the helper supports them within the time budget, otherwise those two RV checks are reported as not run and left to the owner. Lodgy drives all three without the winch.
- P12 Task 1 also updates the `MARRAKECH_INSERTED` comment in `scripts/route/buildMarrakech.ts` to mention the parkour sections.
