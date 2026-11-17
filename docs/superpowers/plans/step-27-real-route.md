# Step 27: the real route (the `marrakech` course)

This plan fixes names, rules and test cases. Implementers write the tests first and the code. Where the plan and the spec disagree, or neither answers a question, stop and report. All numbers are starting values (feel is the owner's); the step ends at `needs sign-off`.

## Decisions already taken (owner, 2026-11-15)

- The full real route, about 22 km, from the villa (start) to Marrakech airport (finish). Driving time is the owner's to judge; the course's `targetTime` is a starting value.
- The `airport` course stays as it is (2.6 km). It becomes a shorter practice course and keeps every existing test that names it. The new course is `marrakech` and becomes the campaign and the room default.
- Privacy: the repo stores the route only as local metres, the first point at the origin. No latitude, no longitude, no villa photos, no place names beyond "villa" and "airport". The raw OSRM file stays out of the repo.
- Attribution: route geometry comes from OpenStreetMap contributors (ODbL). A new `CREDITS.md` at the repo root credits it, and the lobby footer or about line names it (Task 4).

## Rules

R1. **Route data.** `packages/shared/src/courses/marrakech.route.ts` exports `MARRAKECH_ROUTE: readonly (readonly [x: number, z: number])[]`: the route resampled every 20 m, in metres, first point `[0, 0]`, x to the east and -z to the north at the start (the course frame faces -Z at the start, so the generator rotates the route so the first 60 m run along -Z). Rounded to 0.1 m. The raw OSRM response is not committed.

R2. **Generator.** `scripts/route/buildMarrakech.ts` (run with `npx tsx`, not part of the build) reads `MARRAKECH_ROUTE` and writes `packages/shared/src/courses/marrakech.generated.ts`, exporting `MARRAKECH_SEGMENTS: SegmentDef[]` (committed output, header comment says it is generated). The generator is deterministic.

R3. **Fitting.** The generator turns the polyline into `road` segments with a `curve` (total yaw in radians, as the builder defines it: yaw 0 faces -Z and a positive curve turns toward -X, so a turn toward +X is negative) and a `length`:
 - heading is taken over 20 m steps; a run is a straight while the absolute turn per 20 m step is below 1.5 degrees, a curve otherwise; a curve segment never changes the sign of its turn;
 - every segment length is at least `SEGMENT_MIN_LENGTH` (15 m): shorter runs are merged into the neighbour; the merged result is then re-fitted so the total heading change of the segment equals the heading change of the real run it covers;
 - a curve's `length` is at least `|curve| / ROAD_MAX_PIECE_YAW * ROAD_PIECE_LENGTH` (10 degrees per 10 m piece, so the tightest turn has a 57 m radius): where the real turn is sharper (a junction, a roundabout) the segment is stretched to that length and the generator reports the stretch in metres;
 - a curved road is never next to a sloped one (the builder rejects it): this step has no slopes;
 - a segment is at most 400 m; longer straights are split.
 The generator prints: segment count, total length, the largest distance between the generated centre line and the real route (after matching by arc length), the largest stretch and the end-point error. The numbers go in the decision line.

R4. **Inserted terrain** (the real road is all paved; the owner wants the old variety kept). The generator inserts, on straights only and never inside a curve, these segments at fixed fractions of the route length, by replacing a straight of at least the segment's length (the inserted segment is the same length as the stretch it replaces, the ford and bank excepted, see below): `sand` (60 m, palms 4) at 0.20, `alley` (160 m, clutter 0.7) at 0.38, `roadworks` (120 m, obstacles 6) at 0.52 and again at 0.86, `ford` (width 24, rocks 8) at 0.64 followed by `road` slope 4 length 60 and `bank` (height 3, gradient 15, anchors 3) as in `airport`. The ford and bank add height and length; the generator re-bases the route so that later segments continue from the new exit (the generated centre line is the course's own, the real route is the guide). If no straight of the needed length exists within 300 m of the target fraction, the generator takes the nearest one and reports the distance.

R5. **Hazards** from step 25: `crateWall` at 0.12, `gates` (count 4) at 0.30, `roadblock` at 0.45, `crateWall` at 0.72, `roadblock` at 0.93. Each goes on a straight of at least the hazard's footprint (`HAZARD_END_CLEARANCE` and `HAZARD_MIN_GAP` from the constants apply); never on a segment that also holds a stop or an inserted terrain.

R6. **Fuel and garages.** A fuel stop on a straight of at least 200 m (the stop at `along` 100) every 2 km on average, never more than 2.6 km apart (the RV burns a full tank in 160 s at full throttle: about 4 km at 25 m/s), alternating sides; a garage every 5 km, at least 600 m from the nearest fuel stop. The generator picks, for each target distance, the nearest straight of 200 m or more within 400 m; if none exists it reports the gap and the step stops (does not silently exceed 2.6 km). Jerrycans: one pickup pair after each fuel stop is not needed; keep the pickups of `airport` in the first 120 m segment and add one jerrycan, one toolbox and one health kit every 1.5 km on a straight, lateral +-3.

R7. **Coins** every 250 m on average on straights, alternating lateral -2.5 and 2.5, like `coinsAlong` (copy the helper into the generator; do not import from `airport.ts`).

R8. **Start and finish.** Segment 0 is a straight `road` of 80 m (the villa lane; the real route turns about 90 degrees at 80 m; pickups as in `airport` segment 0, at along 30 and 40; coins use the 80 m length). The course ends with a straight of at least 120 m; the finish pad is the builder's. No villa or airport scenery in this step (the owner's photos are not in the repo).

R9. **Course registration.** `courses/marrakech.ts` exports `marrakech: CourseDef` with `id: 'marrakech'`, the generated segments and `targetTime: 1800`. `courses/index.ts` (or wherever `courseIds()` is built) registers it. `CAMPAIGN` becomes `['marrakech']`. The room default is the campaign's first course. `airport` stays registered.

R10. **Size and speed.** The built course has at most 9,000 ground boxes. `buildCourse(marrakech)` completes in under 3 s on the CI machine, a `World` can be created from it, and one `World.step` after creation takes under 50 ms. If a limit fails, report the numbers and stop; do not thin the road.

R11. **Minimap.** The HUD minimap currently fits the whole route into its circle (`mapViewFor`). For a route longer than 3 km it shows a window of 600 m radius centred on the local vehicle (or player on foot), the route line clipped to the window, the finish arrow pinned to the circle edge as other off-map markers are today. Routes of 3 km or less behave as before. Pure functions, tested in `minimap.test.ts`.

R12. **Results and HUD copy.** The lobby and results already read the course id and `targetTime` from the course; no copy names a distance. `results.ts` keeps working with the one-course campaign.

## Tests (numbered)

T1. `marrakech.route.ts`: first point `[0, 0]`, every step is 20 m (+-0.1), at least 1,000 points, total length 22.18 km +-0.3 %, every number rounded to 0.1, no key or comment containing `lat`, `lon` or a coordinate pair.
T2. Generator (as a pure function `fitRoute(route)` exported from `packages/shared/src/courses/fit.ts`, tested with Vitest by a fixed small polyline): straights stay straight, a quarter circle gives one curve segment of `curve` = +-pi/2 and the length rule of R3, a sharp corner is stretched and reported, a run shorter than 15 m is merged, determinism (two runs give equal output).
T3. Generated segments: every segment type is valid for `buildCourse`; no curved road next to a sloped one; lengths in [15, 400] except the ford and bank; the sum of lengths is within 1 % of the real route after the inserted terrain's net change.
T4. Fidelity: the largest distance between the generated centre line and the real route is at most 60 m, and the end-point error at most 150 m (starting values; if the real figures are worse, report them and stop for the owner). A2 replaces the limits; the deviation is the nearest-point distance (the arc-matched figure is informational).
T5. Inserted terrain: the course contains `sand`, `alley`, `roadworks` (2), `ford`, `bank`, each at its fraction of the route +-300 m; none follows or precedes a curve inside its own footprint.
T6. Hazards: five hazards at their fractions +-300 m; each segment with a hazard has no stop and no inserted terrain; the existing hazard rules (`HAZARD_MIN_GAP`, end clearance) hold.
T7. Fuel: the gaps between consecutive fuel stops are all at most 2.6 km, the first stop is within 2.6 km of the start, the last is within 2.6 km of the finish; garages at most 6 km apart and 600 m from fuel stops; every stop segment is a straight of at least 200 m.
T8. Pickups and coins: every pickup kind appears at least every 1.5 km; the coin count is within 10 % of length / 250 m; ids are unique.
T9. Size and speed (R10), measured.
T10. A scripted solo drive (`driveWorld`, the Lodgy, full throttle, steering from a pure pursuit helper that follows `course.route`) reaches the finish within `targetTime` on a world built from `marrakech`, with fuel refills simulated by setting the tank to full at each stop (the stops themselves are tested by T7). If the drive cannot be scripted in a reasonable test time (more than 60 s of real time), the test drives the first 3 km and the last 3 km only, from the checkpoints; report which.
T11. `CAMPAIGN` equals `['marrakech']`; `courseIds()` contains `airport`, `marrakech`, `segment-demo`, `test`; a room made with no config starts `marrakech`.
T12. Minimap (R11): a 22 km route gives a 600 m window centred on the vehicle; the route line is clipped; a 2.6 km route gives the old whole-route view (the existing tests pass unchanged); the finish marker pins to the edge when out of the window.
T13. `CREDITS.md` names OpenStreetMap contributors and the ODbL; the lobby shows a one-line credit with a link (a client test of the view model, not a screenshot).
T14. End-to-end (desktop and phone): the existing smoke tests run on `test` or `airport`; add one smoke test that starts a `marrakech` room, drives forward 5 s and sees the vehicle move and the minimap render (skipped if it takes more than 60 s on CI).

## Existing tests that change

- `courses.test.ts` line 32: the sorted course ids list gains `marrakech`.
- Any test that reads `CAMPAIGN` or the room default expecting `airport` (grep `CAMPAIGN`, `'airport'` in `room`, `results.test.ts`, `server` tests and the e2e specs); each one moves to `marrakech` only if it tests the default, and keeps `airport` where it tests the course itself.
- `minimap.test.ts` gains the T12 cases; its existing cases stay as they are.

## Tasks

1. **Route data and generator** (R1 to R4, T1 to T5). Stop and report after the fit numbers (R3) for review before Task 2: if the largest deviation exceeds 60 m or the end-point error 150 m, the main session decides.
2. **Hazards, stops, pickups, coins and the course registration** (stops and hazards skip the inserted terrain: `MARRAKECH_INSERTED` in `marrakech.generated.ts` lists the indexes of sand, alley, roadworks, ford, the slope road and bank) (R5 to R9, T6 to T8, T11), with the size and speed measurement (R10, T9).
3. **Scripted drive and the minimap window** (R11, T10, T12).
4. **Credits, e2e and docs** (R12, T13, T14), `ROADMAP.md` (row 27 to `needs sign-off`, decision line with the generator numbers, the spec's Course section naming `marrakech` and the minimap window), every check.

Review after each task by a Sonnet reviewer; Opus reviews the plan before Task 1 and the whole branch at the end (both owed after the weekly limit resets, Nov 19, 14:00 UTC; the owner may waive them).

## Out of scope (steps 28 to 31)

Goats, scooters, random items, holes, hills, parkour (28); Souleyman and the checkpoint look (29); the lobby and chat (30); characters and customisation (31); the villa and airport scenery. Checkpoints stay one per segment for now (about 100); step 29 replaces them.

## Amendments after the plan review (a Sonnet stand-in review; the Opus plan review is owed after Nov 19; binding; where they differ from the text above, they win)

A1 (fuel; replaces R6 and T7). The RV's top speed is 15 m/s and it burns a tank in 160 s, so a full tank is at most 2.4 km; measured at the airport it used about 1.9 km per tank (ROADMAP "Course 1 cost"). The spec requires every segment to be completable by the RV from 50 % fuel. So: a fuel stop at least every 1.2 km (target 1.0 km), about 18 to 22 stops; garages about every 4 km at least 200 m from a fuel stop; each stop on a straight segment of at least 60 m with the stop at the segment middle (the builder needs `along - 8 >= 0` and `along + 8 <= length`, flat). The generator picks, for each target, the nearest straight of 60 m or more within 300 m; if the gap between stops would exceed 1.5 km it reports and stops. T7: every gap between consecutive fuel stops, from the start and to the finish, is at most 1.5 km; a measured RV drive with `driveRun` (as `airport.measure.test.ts`) from 50 % fuel completes each gap with at least 20 % left, and the Lodgy likewise. Owner confirms the stop count at sign-off.

A2 (fit; replaces R3's end rules, T3 and T4). A literal fit drifts 550 m at the end and adds 4 % length because 28 corners need stretching by 960 m in total. The generator is closed-loop: it fits each curve, then re-aims each following straight at the real route's next junction point (heading re-based to the real heading) and absorbs the stretch by shortening following straights, never below 15 m. Starting limits (replace 60 m and 150 m): largest centre-line deviation 200 m (measured to the nearest real point; the figure matched by arc length is only reported, because stretching makes it an along-track artifact), end-point error 100 m, total length within 5 % of the real route. If the generator cannot meet them it reports the figures and Task 1 stops for the owner (this is the expected gate). The 400 m maximum is a plan rule (the builder has none): straights over 400 m are split, which adds about 10 segments.

A3 (T1). The route resampled at exact 20 m chords is 22.18 km (the dense route is 22.30 km; chords cut the bends): T1 says 22.18 km +-0.3 %.

A4 (built lengths; R4, T3). Built lengths: sand 110 m (50 m apron + 60 m), alley 160, roadworks 120, ford group (ford 24 + road slope 4 of 60 m + bank about 36) about 120 m. The ford group raises everything after it by about 7.2 m, as in `airport`. An inserted segment replaces a straight run of at least its built length; the leftover on each side is 0 or at least 15 m; the generator may not insert into a straight that holds a stop or a hazard. T3's total-length check is against the real route plus the inserts' net change, within the A2 limit.

A5 (insert and hazard positions; T5, T6). Straights of 160 m or more are scarce (only 18 of 200 m or more). Fractions are targets: the generator takes the nearest suitable straight and reports the distance; the checks allow up to 1.3 km from the target. Hazards may also sit on curved roads (the builder accepts it; `airport` does this). Footprints: crateWall and roadblock need a segment of at least 22 m; gates (count 4) need at least 65 m (`along` from 11.72 m, footprint 42.64 m, 8 m end clearance). A stop segment may not hold a hazard.

A6 (checkpoints). The fit gives about 290 segments, so about 290 checkpoints, not 100. To keep the count down the generator merges a curve run of one step (20 m) into its neighbour when the turn is under 3 degrees, and merges two adjacent curves of opposite sign shorter than 40 m. The HUD hides checkpoint markers on the minimap when the route is longer than 3 km (A8). Step 29 replaces checkpoints.

A7 (build cost; R10, T9). `courses/index.ts` builds every course when the module loads. `marrakech` is built lazily on the first `getCourse('marrakech')` (and `getCourseDef` copies it the same way), so importing `@lodgy/shared` does not pay for it. T9 also measures the import time of `@lodgy/shared` (unchanged within 50 ms) and the client's merge of the ground (`groundMerge`) and decor scatter on the 22 km course within a budget the implementer measures and reports (starting limit 2 s each). `marrakech` is excluded from the generic `DEFS` list in `courses.test.ts` (`groundHeightAt` is a linear scan and would run for hours over 22 km); it gets its own tests T1 to T12. `defs.test.ts`, `segmentRanges` and any course-id list get the new id.

A8 (minimap; R11, T12). `hud.ts` builds the map view and the route path once; windowing needs a per-frame view and a clipped path (or an SVG transform), and `renderMap` uses the moving view. For routes over 3 km: stops, coins, checkpoints and other players outside the window are hidden (not pinned); only the finish is pinned to the circle edge. Name `hud.ts` and `hudModel.ts`; add a HUD test for the hiding rule. The existing minimap tests pass unchanged.

A9 (T10). The scripted drive allows `2 * targetTime`. It runs the Lodgy and the RV, per segment from its checkpoint (as `drive.test.ts` does, with `RV_NEEDS_WINCH` for the bank), each from 50 % fuel. A full end-to-end drive is a measurement only, not a CI test, because 22 km at 15 m/s is about 90,000 ticks.

A10 (coins, pickups; T8). Coin count within 10 % of length / 250 m, straights only, skipping segments shorter than 30 m; pickups at most 1.5 km plus 400 m of slack apart.

A11 (tests that change). Add: `defs.test.ts` (the new id), `e2e/smoke.spec.ts` comment at line 63 and the test near line 408 that names the default course (the default is now `marrakech`; specs that need the test ground keep selecting it in the lobby). Where the generator tests live: `packages/shared/src/courses/fit.test.ts` with `fit.ts` in `packages/shared/src/courses/` (the generator script in `scripts/route/` imports it), so `npm test` covers it.

A12 (owner). ROADMAP row 27's "Open" scale question is closed by the owner's answer of 2026-11-15 (the full 22 km); the row and the section are updated in Task 4.
