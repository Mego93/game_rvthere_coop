# Step 16: Course 1 (to the airport)

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`. Read "Courses and segments", "Collision", "Conventions", and "Service stops". Code: `packages/shared/src/segments.ts` (`SegmentDef`, `buildRoad`, `addExtras`), `courses/build.ts` (`CourseDef`, `buildCourse`), `courses/demo.ts` and `courses/demo.test.ts` (checks B2 to B8 and "the sand" that already run over the segment demo), `testRig.ts`, `constants.ts` (`CAMPAIGN`, `SAND_APRON`, `SEGMENT_SPAWN_INSET`, `ROAD_WIDTH`, `FORD_ROCK_LATERAL`), `packages/server/src/room/room.ts` (`CAMPAIGN` use), `packages/client/src/ui/results.ts`.

This plan fixes constants, rules and test cases. Implementers write the tests first. Where the plan and the spec disagree, or neither answers a question, stop and report. This step ends at `needs sign-off`: whether the course is fun is the owner's call, by playing it.

## Course design pass

The spec says the segment list and its numbers are set with the owner in a course design pass. The owner was not available, so this plan fixes a first version from the spec's description (rural track, palm grove, an oued, the city's edge, the airport road; flat; every spec-1 segment type; one fuel station with its shop and one garage; about 10 minutes). The segment list is data in one file, so the owner retunes it without touching code. Decision D-C1 in `ROADMAP.md` records this. The tests are written over any registered course, not over these numbers, so a retune does not break them.

## Builder limits that shape the list (from the code)

- A segment with a `stop` must be a straight, flat road (`curve` 0, `slope` 0).
- A road cannot both curve and slope; a curved road may not neighbour a sloped one.
- Every checkpoint spawn is 8 m (`SEGMENT_SPAWN_INSET`) into its segment. A sand segment starts with 50 m (`SAND_APRON`) of road, so its spawn is on road with 42 m of run-up. A ford has no approach, so its spawn is on riverbed.
- Ford rocks sit at lateral ±`FORD_ROCK_LATERAL` (1 m). Roadworks barriers are 2 m wide at lateral -3, 0, 3 with fences at ±5, so the gaps are 1 m: the passage is by pushing a barrier (step 5), never by driving through a gap.

## Files

- Create `packages/shared/src/courses/airport.ts`: `export const airport: CourseDef`, with a small local helper `coinsAlong(count, length)` (evenly spaced `along` from 15 to `length - 15`, `lateral` alternating -2.5 and 2.5).
- `courses/index.ts`: register `airport`, built once.
- `constants.ts`: `CAMPAIGN = ['airport']`. `test` and `segment-demo` stay registered as development courses.
- `packages/server/src/room/room.ts` and the `createRoomServer` options: add `campaign?: readonly string[]` to the room config, defaulting to `CAMPAIGN`; the room uses it for the default course (`campaign[0]`), `next` and `campaignTotal` instead of the constant. `packages/client/src/ui/results.ts`: `resultsView(message, isAdmin, campaign = CAMPAIGN)`.
- Rename `courses/demo.test.ts` to `courses/courses.test.ts`, run the structural cases (B2 to B8) over `['segment-demo', 'airport']` with `describe.each`; the registry cases that name the demo's ids stay demo-specific.
- Tests changed because the default course and campaign change (the implementer greps `CAMPAIGN`, `'segment-demo'`, `courseId: 'test'` and `courseIds` in `packages/*/src` and `e2e`, runs the whole suite, and lists every test it changed; this list is the starting point and may be incomplete): server `room/lobby.test.ts` (the `setup(true)` helper and every test that starts without configuring a course, the L12 campaign-total tests and the `bad_phase` test after them, tests asserting `courseId: 'test'`), `room/room.test.ts` (L32 injects `courses.test`), `room/events.test.ts`, `room/server.test.ts` (expects `courseId: 'test'`), `node/server.test.ts` (L197 to L230, drives to the finish on the test ground), `room/roomFailure.test.ts` and `room/roomBuildFailure.test.ts` (check), shared `courses/demo.test.ts` (the `courseIds` list), client `ui/results.test.ts` (`showNext` for `test`), `e2e/smoke.spec.ts` (the "props 8" assertion at about L239). Server test helpers pass `campaign: ['test', 'segment-demo']`, so the existing campaign tests keep their meaning; node `server.test.ts` sends `configure courseId: 'test'` before starting where it needs the test ground. e2e specs that need the test ground choose it through the lobby, the way they select a vehicle today.
- `ROADMAP.md` and the spec's course table (row 1 reads as built).

## The course (first version; data only)

Lengths in metres. Straight roads carry stops; curved roads never do.

| # | Segment | Parameters | Extras |
|---|---|---|---|
| 0 | road | length 120 | start; pickups: jerrycan (along 30, lateral -3), toolbox (30, 3), healthKit (40, 0), clear of the spawn slots; `coinsAlong(4, 120)` |
| 1 | road | length 360, curve +0.35, debris 4 | `coinsAlong(6, 360)` |
| 2 | road | length 300, curve -0.5, debris 3 | |
| 3 | road | length 200 | fuel stop (side 1, along 100) with its shop |
| 4 | sand | length 140, palms 6 | `coinsAlong(5, 140)`; pickup jerrycan on the apron (along 20, lateral -3) |
| 5 | road | length 260, curve +0.4 | `coinsAlong(4, 260)` |
| 6 | ford | width 24, rocks 8 | the oued; `coinsAlong(3, 24)` |
| 7 | road | length 60, slope 4 | |
| 8 | bank | height 3, gradient 15, anchors 3 | the city's edge |
| 9 | alley | length 160, clutter 0.7 | `coinsAlong(4, 160)` |
| 10 | roadworks | length 120, obstacles 6 | pickup toolbox (along 10, lateral 3) |
| 11 | road | length 300 | garage stop (side -1, along 150) |
| 12 | road | length 300, curve +0.3 | |
| 13 | road | length 220 | the airport road; the builder adds the finish pad |

`targetTime` 600 s. Total about 2,600 m before the pad: about 9 to 10 minutes at 5 m/s. The owner tunes by playing. If `buildCourse` rejects any row, stop and report the error instead of changing the list.

## Behaviour rules

C1. Course 1 uses all six segment types; has exactly one fuel station (with its shop counter) and exactly one garage; has coins; has at least one pickup of each item kind.
C2. No checkpoint spawn is on sand. (The ford's spawn is on riverbed, which is allowed.) The sand segment's spawn is on its apron.
C3. Both vehicles complete the course, tested on the terrain only (`createRig`: ground and walls, no props). A driver controller in the test drives each vehicle: pure pursuit with a 12 m lookahead along `course.route`, steering proportional to the heading error, full throttle. The implementer calibrates the controller (gain, lookahead), never the vehicle. For each segment, from its checkpoint spawn, the vehicle's centre must enter the next checkpoint's trigger box (the finish box for the last segment) within `15 + routeLength / (0.3 × maxSpeed)` seconds, where `routeLength` is that segment's route length and `maxSpeed` is the vehicle's config value. The roadworks segment is excluded (it blocks by design, C4). If the RV fails a segment, stop and report the segment, the time and the speed trace; do not retune the vehicle or the limit.
C4. Roadworks: structural only. Its barriers, fences and pickup are placed, the barriers are heavy obstacles, and the lane left of the barriers at lateral ±4 is closed by the fences (that is, no free lane of the RV's width exists), so the passage is pushing, covered by the step 5 tests. The ford: a lane at lateral ±3 m along the segment has no rock centre within the RV's half width plus 0.5 m (the existing B4 excludes rocks).
C5. Fuel: a continuous drive from the fuel-stop segment's checkpoint spawn to the finish, with the C3 controller and a full tank, leaves more than 5% fuel for each vehicle. Also a drive from the start to the fuel stop with a full tank leaves more than 20%. If the RV fails either, stop and report the numbers (the station may move); do not tune the drain. This test drives each leg as one continuous run (not per segment) so it includes the standing starts only once.
C6. Snapshot size: a test encodes one full `snapshot` message with 6 players on this course (as the room sends it) and reports its byte length; it asserts under 4 KB. It also reports the average cost of `world.step` for 6 players over 300 ticks and asserts under 4 ms. If either is over, stop and report the number.
C7. The structural checks B2 to B8 pass on `airport` (ground under every route point, no steps, lane free of walls and props, checkpoints, stops, unique and deterministic ids, a working world), including that pickups and coins keep clear of every checkpoint's spawn slots.
C8. The client needs no change: the compass, the minimap and the lobby read the built course.
C9. With a one-course campaign, `next` returns `bad_phase`, every finish sets `campaignTotal` to that run's final time, and `resultsView` shows no Next button. The lobby already lists every registered course to everyone and only the admin can change it; that does not change.

## Tests (numbered)

T1 C1: type set, stops, coins, pickup kinds on `airport`.
T2 C2: no checkpoint spawn surface (from `groundProbe`) is `sand`.
T3 C3: drive test per segment and per vehicle (both configs), parametrised.
T4 C4: roadworks structure; ford lane.
T5 C5: fuel margins.
T6 C6: snapshot size and tick cost.
T7 C7: the structural cases over both courses.
T8 C9: server tests with `campaign: ['airport']` (finish gives `campaignTotal` equal to the final time, `next` is `bad_phase`) and the existing two-course campaign tests with `campaign: ['test', 'segment-demo']`; `resultsView` with a one-course and a two-course campaign.
T9 e2e: `smoke.spec.ts` and the other specs pass with the default course `airport` (the keyboard drive case still drives; the "props 8" assertion adapts).

## Tasks

1. `campaign` option on the room and `resultsView`, fixing every test that depended on the old campaign (T8). The whole suite passes before the course is added.
2. The `airport` file, registration, `CAMPAIGN` change, the structural tests over both courses (T1, T2, T7), and the e2e (T9).
3. The drive test (T3, T4) with the controller in the test code.
4. Fuel and cost measurements (T5, T6).
5. `ROADMAP.md`, spec row, decision D-C1, the "Six-player cost" working note; run every check.

Review after each task by a Sonnet reviewer; Opus reviews the whole branch at the end.
