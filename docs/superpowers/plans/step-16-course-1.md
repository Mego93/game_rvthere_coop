# Step 16: Course 1 (to the airport)

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`. Read "Courses and segments", "Collision", "Conventions", and "Service stops". Code: `packages/shared/src/segments.ts` (`SegmentDef`), `courses/build.ts` (`CourseDef`, `buildCourse`), `courses/demo.ts` and `courses/demo.test.ts` (the checks B2 to B8 and "the sand" that already run over the segment demo), `constants.ts` (`CAMPAIGN`, `SAND_APRON`, `SEGMENT_SPAWN_INSET`, `ROAD_WIDTH`).

This plan fixes constants, rules and test cases. Implementers write the tests first. Where the plan and the spec disagree, or neither answers a question, stop and report. This step ends at `needs sign-off`: whether the course is fun is the owner's call, by playing it.

## Course design pass

The spec says the segment list and its numbers are set with the owner in a course design pass. The owner was not available, so this plan fixes a first version from the spec's description (rural track, palm grove, an oued, the city's edge, the airport road; flat; every spec-1 segment type; one fuel station with its shop and one garage; about 10 minutes). The segment list is data in one file, so the owner retunes it without touching code. Decision D-C1 in `ROADMAP.md` records this. The tests below are written over any registered course, not over these numbers, so a retune does not break them.

## Files

- Create `packages/shared/src/courses/airport.ts`: `export const airport: CourseDef`.
- Change `packages/shared/src/courses/index.ts`: register `airport` (built once, like the demo).
- Change `packages/shared/src/constants.ts`: `CAMPAIGN = ['airport']`. `test` and `segment-demo` stay registered as development courses.
- Change `packages/shared/src/courses/demo.test.ts` into `courses.test.ts`, run over `['segment-demo', 'airport']` with `describe.each`, keeping each existing case and its numbering; the demo-only cases (`the registry`: checkpoint per segment, both stops at the demo's ids, `targetTime` 300) stay demo-specific.
- Tests that assume the campaign is `['test', 'segment-demo']` or that the default course is `test`: the implementer greps `CAMPAIGN`, `'segment-demo'` and `courseIds` in `packages/*/src` and `e2e`, changes each to import `CAMPAIGN` or to inject its own courses (the server's `createRoomServer` accepts `courses`), and lists every test it changed in its report. Known: `packages/server/src/room/lobby.test.ts` L7 and L12 (campaign total, "next" selects the second course), `packages/client/src/ui/results.test.ts` if it assumes two courses, and any e2e that starts a run on the default course (the default course becomes `airport`; e2e specs that need the flat test ground choose it through the lobby or `VEHICLE`/course settings the way they do today).
- `ROADMAP.md` and the spec's course table (row 1 reads as built).

## The course (first version; data only)

Heading is straight west-by-compass is irrelevant to the sim; the route is a gentle chain of curves, flat overall (the only slope is the bank and one short `slope` road). Lengths in metres.

| # | Segment | Parameters | Extras |
|---|---|---|---|
| 0 | road | length 120 | start; pickups: jerrycan, toolbox, healthKit beside the road; 4 coins |
| 1 | road | length 360, curve +0.35 rad, debris 4 | 6 coins |
| 2 | road | length 300, curve -0.5 rad, debris 3 | fuel station (side 1, along 150) with its shop |
| 3 | sand | length 140, palms 6 | 5 coins; one pickup (jerrycan) on the apron |
| 4 | road | length 260, curve +0.4 rad | 4 coins |
| 5 | ford | width 24, rocks 8 | the oued; 3 coins |
| 6 | road | length 240, curve -0.3 rad, slope 4, debris 5 | |
| 7 | bank | height 3, gradient 15, anchors 3 | the city's edge |
| 8 | alley | length 160, clutter 0.7 | 4 coins |
| 9 | roadworks | length 120, obstacles 6 | one pickup (toolbox) before it |
| 10 | road | length 300, curve +0.3 rad | garage (side -1, along 150) |
| 11 | road | length 420 | the airport road, then the finish pad the builder adds |

`targetTime` = 600 s. Total length about 2800 m: at an average of 5 m/s (stops, sand, obstacles, winching) that is about 10 minutes; the owner tunes by playing.

Check against the spec and the builder before the plan is reviewed, and report any that fail: a curved road may not neighbour a sloped one (segments 6's neighbours 5 and 7 are not roads, so allowed); `slope` and `curve` on segment 6 together are allowed only if the builder accepts them (the builder rejects a curved road beside a sloped road, not both on one segment; confirm in `segments.ts`); `SEGMENT_MIN_LENGTH` 15.

## Behaviour rules

C1. Course 1 uses all six segment types, has exactly one fuel station (with its shop counter) and exactly one garage, coins, and at least one pickup of each item kind.
C2. Every checkpoint spawn is on a surface that is not sand and not ford water; the RV can start from it. The sand segment's spawn lies on its apron (`SAND_APRON` 50 m of road before the sand, spawn inset `SEGMENT_SPAWN_INSET` 8 m), which gives a run-up of 42 m. A checkpoint restart at the sand therefore starts the RV on the apron.
C3. Both vehicles complete the course: from each segment's checkpoint spawn, with full throttle and a route-following steering controller, the vehicle reaches the end of that segment (the next checkpoint's trigger, or the finish for the last one) within a per-type time limit. Segments that need pushing or the winch for the RV (the roadworks' heavy barriers, if they block it) are excluded from the drive test and instead covered by C4. The Lodgy and the RV are both run; if the RV fails a segment that the spec says it must complete, stop and report with the numbers, do not retune the vehicle.
C4. The roadworks segment can be passed: its heavy obstacles leave a lane at least as wide as the RV's footprint plus `0.5 m` or have an anchor within winch range (25 m) of every blocking obstacle. The ford has a drivable line (B4 already sweeps a lane free of walls; rocks are the exception it excludes, so this plan adds: the same lane swept with the RV's footprint meets no rock centre within the footprint's half width).
C5. Fuel: with `fuel: 1.0` at the start, the Lodgy and the RV reach the fuel station on segment 2 with more than 20% left under the drive test's throttle usage, and a full tank (refilled at the station) reaches the finish. Compute with the drive test's measured consumption; assert the margins, do not tune the drain.
C6. Snapshot size: a test measures the encoded size of a snapshot for 6 players on this course and asserts it is under 2 KB (current measured: about 1.1 KB; the course adds props and coins). Report the number. Also measure ticks per second of `world.step` for 6 players on the airport course and report (no assertion beyond under 4 ms per tick average).
C7. The structural checks B2 to B8 of the demo (ground under every route point, no steps, lane free of walls and props, checkpoints B5, stops B6, ids B7 unique and deterministic, world B8) all pass on `airport`.
C8. The compass and minimap read the route and checkpoints from the built course, so nothing client-side changes; the e2e smoke test starts a run on the default course (now `airport`) and still drives.
C9. `CAMPAIGN` is `['airport']`: finishing it shows the results with the campaign total equal to its final time and no "Next course" button; the lobby lists the development courses `test` and `segment-demo` for the admin only if the lobby already lists every registered course (check `lobby.ts`; do not add a new option).

## Tests (numbered)

T1 C1: type set, stops, coin count and pickup kinds on `airport`.
T2 C2: every checkpoint's spawn surface (from `groundProbe`) is `road` or `gravel`, never `sand` or `riverbed`.
T3 C3: drive test, per segment and per vehicle (parametrised), time limits: road 40 s per 100 m at the vehicle's speed limit, with a floor of 15 s; sand 30 s; ford 40 s; bank 25 s; alley 45 s.
T4 C4: the lane and winch checks.
T5 C5: fuel margins.
T6 C6: snapshot size and tick cost.
T7 C7: the demo's structural cases run over both courses.
T8 C9: server lobby L12 variants for a one-course campaign; `results.ts` shows no Next button for the only course.
T9 e2e: the smoke spec still passes with the default course `airport` (the existing keyboard drive case).

## Tasks

1. Register the course and change `CAMPAIGN`; fix the tests that assumed the old campaign (T8, T9); the `airport` data file with the table above.
2. Parametrise the structural tests over both courses (T1, T2, T7).
3. The drive test (T3, T4) with a route-following controller written in the test rig (`packages/shared/src/testRig.ts` if one exists there; report if the rig lacks what is needed).
4. Fuel and cost measurements (T5, T6).
5. `ROADMAP.md`, spec row, decision D-C1; run every check.

Review after each task by a Sonnet reviewer; Opus reviews the whole branch at the end.
