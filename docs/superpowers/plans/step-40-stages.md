# Step 40: five stages

Spec: `docs/superpowers/specs/2026-11-18-stages-and-round3-design.md`, Part B and "Owner decisions (2026-11-18)". The owner asked for no heavy reviews: each task gets one short Sonnet review, and there is no Opus plan or branch review.

## Goal

Five short courses, about 2 to 4 km each:

1. Desert, cut from the start of the route.
2. Bridge and forest, hand-built.
3. Mountains, the real Ourika road with its climb stretched ×3.
4. City, cut from the route.
5. City to airport, cut from the route.

They can be played one at a time from the lobby, or chained as one run with a single timer, a single restart count and one results screen at the airport. Fuel, health and coins carry over between stages in a chained run. The 22 km `marrakech` course stays, labelled "Full route".

## Constants (`packages/shared/src/constants.ts` unless noted)

**Stage ids and campaign**
- `STAGE_IDS = ['desert', 'valley', 'mountain', 'city', 'airport-road']`.
- `CAMPAIGN = STAGE_IDS`.
- The existing course id `airport` (the step 16 course) keeps its id. `airport-road` is the new stage 5.

**Stage lengths**
- `STAGE_MIN_LENGTH = 2000` and `STAGE_MAX_LENGTH = 4200`, in m of route.

**Cut stages** (desert, city, airport-road), all lengths in m along the built `marrakech` route:
- `desert`: from 0 to about `DESERT_TO = 3400`.
- `city`: from about `total − 7000` to about `total − 3500`.
- `airport-road`: from about `total − 3500` to the finish.
- Each cut point moves to the nearest segment boundary where both neighbouring segments are plain roads: not inserted, not sloped, with no stop.

**Mountains**
- `MOUNTAIN_CLIMB_SCALE = 3`.
- `MOUNTAIN_MAX_SLOPE = 14` degrees (that is `BIG_HILL_SLOPE`).
- `MOUNTAIN_ANCHOR_SLOPE = 10` degrees: a straight at or above this gets two boulders, placed as `hillSegments` places them.
- `MOUNTAIN_FLAT_LINK = 15` m: the flat straight put between a curve and a sloped straight.

**Bridges**
- `BRIDGE_RAVINE_DEPTH = 8` m.
- `BRIDGE_RAIL_HEIGHT = 1.1`.
- `BRIDGE_RAIL_THICKNESS = 0.3`.
- `BRIDGE_ABUTMENT = 6` m: the solid deck at each end, over the bank.
- `WATER_DEPTH_BELOW_ROAD = 6.5`: the water plane is drawn this far under the deck.

**Enemies**
- `CourseDef.enemyDensity`, a number: events every `ENEMY_SPACING / enemyDensity`.
- It replaces the `course.id === 'marrakech'` test in `world.ts`.
- `marrakech` keeps its city share by a new `CourseDef.enemyCityShare` (0.3); `city` has `enemyDensity: 2`.

## Rules

### Courses

**C1. `CourseDef` fields.** It gains these optional fields:
- `theme?: 'desert' | 'valley' | 'mountain' | 'city' | 'airport'`
- `label?: string`
- `enemyDensity?: number`
- `enemyCityShare?: number`

Labels:
- `marrakech`: "Full route"
- the stages: "1 Desert", "2 Bridge and forest", "3 Mountains", "4 City", "5 To the airport"
- `segment-demo`, `airport` and `test-ground` keep their ids as labels.

All five stages have `corridor: true` and `ambient: true`.

**C2. Cut stages.** `sliceCourse(segments, inserted, from, to)` returns the whole segments between the two snapped cut points. It lives in `packages/shared/src/courses/stages.ts`.
- The first segment of each slice becomes a flat 80 m start road carrying the three start pickups, as in `marrakech`'s first segment.
- The last segment of each slice is followed by the finish pad, as for every course.
- The fuel stops, hazards, mud, rocks, pickups and coins inside the slice are kept as they are.
- The `desert` theme is `desert`, `city` is `city`, and `airport-road` is `airport`. On `airport`, the decor's city zone covers the first 40 %.

**C3. Valley.** `VALLEY_SEGMENTS` in `stages.ts` is hand-built, about 2.6 km. Curves are total turn in radians.
1. `road` 80 with the three start pickups.
2. `road` 200, `curve` 0.5.
3. `bridge` 60.
4. `road` 160, `curve` −0.6, `surface` `dirt`.
5. `ford`, `width` 12, `rocks` 4.
6. `road` 180, with a fuel stop (side 1, along 90).
7. `hillSegments(HILL_SLOPE)`.
8. `road` 150, `curve` 0.4.
9. `bridge` 80, `broken: true`.
10. `road` 200, `curve` −0.5, `surface` `dirt`, with `mud` 16 at along 100.
11. `road` 250, `bumps` 3, with a toolbox (along 60, lateral −3) and a jerrycan (along 180, lateral 3).
12. `bridge` 120.
13. `road` 200, `curve` 0.3.
14. `road` 150.

Coins are added every 250 m by the existing coin rule, or by hand at along/2 on each road of at least 150 m if the planner cannot be reused. The task reports which it used.

**C4. Mountains.** `scripts/route/buildOurika.ts` reads the route (local metres x, z and height y per point) from `packages/shared/src/courses/ourika.route.ts` and writes `ourika.generated.ts`.
- `ourika.route.ts` is generated once from the scratchpad `ourika/osrm.json` and `profile.json`, keeping the last 3500 m.
- It is projected to local metres with the same projection as `marrakech.route.ts`, and its first point is the origin.
- It carries only public road geometry, credited to "OpenStreetMap contributors (ODbL), SRTM via OpenTopoData".

The build runs in this order:
1. `fitRoute` on x, z.
2. Each straight's slope is `atan(MOUNTAIN_CLIMB_SCALE × Δheight / length)` over its span, clamped to ±`MOUNTAIN_MAX_SLOPE` and rounded to 0.1°.
3. A `MOUNTAIN_FLAT_LINK` straight is inserted wherever a curve meets a sloped straight. `buildCourse` refuses a curve next to a slope, and curves stay flat.
4. Straights of 10° or more get the boulder anchors.
5. `planExtras` runs with seed `'mountain'` for fuel, pickups, coins, mud and rocks.
6. The last segment ends at a flat 80 m road before the finish pad. This is the kasbah square, where the client draws the kasbah model.

The report gives the total climb (expected about +150 to +230 m after clamping), the slope histogram and the segment count.

**C5. Bridge segment.** A new segment type: `{ type: 'bridge'; length: number; broken?: true } & SegmentExtras`. It is built in `segments.ts`.
- **Deck and railings.**
  - The deck is a flat road over `length`, with railings on both sides as wall boxes `BRIDGE_RAIL_HEIGHT` high.
  - A walker cannot step over them: they are taller than the step height. Check this against the player step constant and report it.
- **Broken bridge.**
  - The middle of a broken bridge is the deep pit's profile: its depth, gradients and floor (`DEEP_PIT`), with its 6 boulders in the exit flat.
  - The railings continue over the pit. The vehicle needs the winch, as in a deep pit.
- **Ravine.**
  - The segment marks a `ravine` span on the built course (`BuiltCourse.ravines: { from: number; to: number }[]`).
  - `corridor.ts` sinks the land under that span by `BRIDGE_RAVINE_DEPTH` over the whole corridor width, except `BRIDGE_ABUTMENT` m at each end, with banks of at most 35°.
  - The road's own ground boxes stay; the bridge deck is the road.
  - The T3 under-road margin test excludes ravine spans.
- **Falling.** Falling into the ravine ends at the kill plane: the vehicle is restarted at the checkpoint, and a player is respawned, as today.
  - The kill plane is checked relative to the route height: it must sit under the ravine floor. If `KILL_PLANE_BELOW` (20) does not, the task stops and reports it.
- **Not allowed on a bridge:** stops, mud, rocks or bumps. `buildCourse` throws.

**C6. Registry.** `courses/index.ts` builds the five stages lazily, like `marrakech`. `courseIds()` lists the stages first, in order, then `marrakech`, then the rest.

### Chained run

**R1. Settings.** `RoomSettings` gains `chain: boolean` (default false).
- `configure` accepts it only when `courseId` is a stage id; otherwise it is forced to false.
- With `chain` true, Start always begins at `desert`, whatever `courseId` is set.

**R2. Next stage.** In a chained run, winning a stage that is not the last does not enter results. Instead the room:
1. reads `carryOut()` from the finished world;
2. builds the next stage's world with `createRunWorld`;
3. calls `next.applyCarry(carry)`;
4. broadcasts a new server message `{ type: 'stage'; courseId: string; index: number; of: number }`;
5. sends a full snapshot.

The phase stays `playing`.

**R3. Carry.** `World.carryOut()` returns:
- vehicle fuel and health;
- each player's health, ammo and gun;
- the coins collected;
- elapsed time and restarts.

`applyCarry` sets them on the new world: fuel, health and ammo are clamped to the maximums, and the coins count is added to `coinsCollected`. Elapsed time and restarts continue from the carried values, so the timer runs across stages. Props, items, power-up timers and drops do not carry.

**R4. Restarts in a chain.** "Restart checkpoint" is unchanged. "Restart course" in a chained run restarts the current stage with the carry it began with: the run keeps the values from the start of that stage. The restart count goes up.

**R5. Results.** The results at the end of `airport-road` in a chained run:
- give one final time for the whole run (`resultsOf` with the summed target time of the five stages);
- record it in `finished` under the id `'run'`;
- set `campaignTotal` to that time.

A single stage played alone keeps today's results and "Next" flow (`CAMPAIGN` is now the stages).

**R6. Joining mid-chain.** A player who joins or rejoins during a chained run gets the current stage's lobby state and full snapshot. A `stage` message is sent to them too, so the client builds the right course.

### Client

**V1. Lobby.**
- The course select shows labels, not ids.
- A "Run all five stages" checkbox shows when a stage is selected; it is admin-only, like the other settings.
- The lobby warm-up warms `desert` when chain is on.

**V2. Stage message.** On `stage`, the client:
- tears down the course scene and builds the new course;
- shows a banner for 3 s ("Stage 2 of 5: Bridge and forest"), styled with the step 35 theme;
- keeps the HUD and the player state.

The build reuses the sliced warm-up generators so the frame does not freeze for more than one long task on desktop.

**V3. Themes.** `scatterDecor` reads `def.theme`:
- `desert`: sand ground tint, dunes, scrub and palms, no city.
- `valley`: green ground, dense trees (the new tree models), river water under bridges.
- `mountain`: rock and scrub, mountain houses in clusters, the kasbah model on the last flat.
- `city`: the city table along the whole course, plus parked cars at the road edge. Parked cars are decor only, outside the lane, with no colliders.
- `airport`: city for the first 40 %, then the road table.

A course with no theme keeps today's behaviour, including `marrakech`.

**V4. Water.** Under each ravine span, a flat translucent water plane is drawn at `WATER_DEPTH_BELOW_ROAD` under the deck, with a slow scrolling normal. Phones draw no reflections.

**V5. Bridge look.** The deck is wooden planks and the railings are wooden posts. Any textures come from the existing texture set or the new assets.

### Assets (one task, in parallel)

Search Sketchfab for each of the following and pick the most downloaded usable model (CC0 or CC BY, within the phone budget). If that one is not usable, take the most reliable usable one. Optimise as in steps 33 and 39, credit each one, and send a contact sheet.

1. Two forest trees: a pine and a broadleaf.
2. A mountain village house (adobe).
3. A kasbah (a landmark, at most 1.5 MB).
4. Two parked cars, one of them a small hatchback.
5. A plank bridge or wooden railing piece. If there is none, the bridge is built from boxes with a wood texture.

## Tests (write first)

**Courses and the bridge**
1. `stages.test.ts`:
   - Each stage builds with `buildCourse`, and its length is within `STAGE_MIN_LENGTH`–`STAGE_MAX_LENGTH`.
   - Each cut stage starts and ends at a plain-road boundary.
   - Every stage has at least one fuel stop, and a fuel chain gap of at most `FUEL_MAX_GAP` including the start and finish ends.
   - `courseIds()` order.
2. `bridge.test.ts`:
   - The bridge builds; its railings are walls on both sides.
   - A broken bridge has the deep pit profile and 6 boulders.
   - A stop or mud on a bridge throws.
   - The `ravines` span equals the segment's along range.
3. `corridor` (changed): under a ravine span, the land is at least `BRIDGE_RAVINE_DEPTH − 0.5` below the route, except at the abutments. The T3 margin test excludes ravines.

**Drive tests**
4. `ourika.test.ts`:
   - The generated mountain course has no curve next to a slope.
   - Every slope is at most 14°, and straights of 10° or more have boulders.
   - The total climb is within 120–260 m.
   - The route data holds no point far from the Ourika road: the first point is the origin, and the length is within ±5 % of 3500 m.
5. `stages.drive.test.ts` (scripted Lodgy, reusing `driveRig`):
   - Lodgy drives `desert`, `city` and `airport-road` start to finish within the time bound, with no kill-plane reset.
   - On `valley`, it crosses the whole bridges, and is stopped at the broken bridge without the winch. With the winch, using the `pit.test.ts` helper, it gets through.
   - On `mountain`, Lodgy climbs every straight under 10° without help.
   - The RV runs only on `valley`'s broken bridge with the winch. If the helper cannot do this within the budget, the task reports it as not run.

**World, room and client**
6. `world.carry.test.ts`:
   - `carryOut` and `applyCarry` round-trip fuel, health, ammo, coins, elapsed time and restarts, with clamping.
   - Props, items and power-ups do not carry.
7. `room.chain.test.ts`:
   - Chain is accepted only on a stage.
   - Start begins at `desert`.
   - Winning a stage sends `stage` and keeps `playing`.
   - The final results come only after `airport-road`, with one summed time and `campaignTotal`.
   - Restart course keeps the carry the stage began with.
   - A rejoin mid-chain gets `stage`.
8. `protocol.test.ts` (changed): `configure` with `chain`, the `stage` message's validation, and an unknown course id refused as today.
9. Client tests:
   - `lobby` labels and the chain checkbox.
   - The `stage` handling (a pure function picking the banner text).
   - `scatterDecor` themes (counts per theme, no city on `desert`, parked cars outside the lane).
   - The water plane placement from `ravines`.
10. `world.ts` enemies: `enemyDensity` doubles the events, and `marrakech`'s count is unchanged (the `enemyCityShare` field replaces the id test).

**Snapshot sizes and changed tests**
11. Snapshot-size tests (new or changed): the full snapshot for each stage stays within the `marrakech` limits.
12. Existing tests that change, each named in the task's report:
    - every room test that relies on the default course being `marrakech` (the default is now `desert`): `room.test.ts`, `lobby.test.ts`, `room.corridor.test.ts`, `room.ambient.test.ts`, `room.itemDrops.test.ts`, and the others listed by `grep -l campaign`;
    - `results.test.ts`;
    - `marrakech.course.test.ts`, where it pins `CAMPAIGN`.

    Where a test needs `marrakech` itself, it passes `campaign: ['marrakech']` or sets the course explicitly. No test is skipped.

## Tasks

These tasks run in parallel where marked.

1. **Task 1 (shared, first):** C1, C2, C6, the `CAMPAIGN` change and the enemy density fields, with tests 1 (cut stages and order only), 10 and 12.
2. **Task 2 (shared, after 1, parallel with 3 and 4):** C4, the mountains, with test 4 and test 5's mountain part.
3. **Task 3 (shared, after 1, parallel with 2 and 4):** C5 and C3, the bridge, ravine and valley, with tests 2, 3, test 1's valley part, and test 5's valley and cut-stage parts.
4. **Task 4 (shared and server, after 1, parallel with 2 and 3):** R1–R6, with tests 6, 7 and 8.
5. **Task 5 (assets, parallel from the start):** the asset list and contact sheet.
6. **Task 6 (client, after 2–5):** V1–V5, with test 9 and test 11, plus screenshots of each stage (desktop, and a phone shot of one stage) and of the stage banner.
7. **Task 7 (main session):** the ROADMAP row 40 as `needs sign-off`, a decision line, the spec's "As built" note, the full checks, one short Sonnet review, then push, PR and merge.

## Not in this step

- Moving car traffic in the city: the scooters and parked cars stand in for it.
- A river beside the road (water only under bridges).
- Rockfalls, rain tied to the mountains (random weather already exists), and planks to carry.
- Story mode (step 41).

The look and feel of each stage, the climb, and the bridge and water look are for the owner to judge.
