# Step 25: Obstacles on the road, a solo-completable proof, stuck recovery, a controls help

Owner request (2026-11-15): do the functionality items (a bot proves the course can be finished solo, an unstick/recovery action, a controls pass) and "have more dynamic maps, with obstacles etc". Course 1 today is mostly empty road with a few crates, which reads as flat. Code: `packages/shared/src/segments.ts` (`SegmentDef`, `buildRoad`, `evenSlots`, `offsetFrom`), `constants.ts` (`PROP_KINDS`, `ROAD_WIDTH`, roadworks constants), `courses/airport.ts`, `courses/drive.test.ts`, `courses/driveRig.ts`, `checkpoints.ts`, `world.ts`, `packages/client/src/ui/`.

This plan fixes names, rules and test cases. Implementers write the tests first. Where the plan and the spec disagree, or neither answers a question, stop and report. Do not retune physics constants for feel; the starting values below are the owner's to adjust at sign-off. The step ends at `needs sign-off`.

## Part A: more obstacles (maps feel alive)

All obstacles are existing prop kinds (`crate` light 15 kg, `barrier` heavy 150 kg), so the server, snapshot and client already handle them. New: a `hazards` list on the `road` segment def, each entry placed by along-distance in the segment's own frame.

H1. `SegmentDef` road gains `hazards?: Hazard[]`, `Hazard = { kind: 'chicane'; along: number; count: number } | { kind: 'crateWall'; along: number } | { kind: 'roadblock'; along: number }`. The existing `debris` option stays.
H2. `chicane`: `count` (2 to 6) heavy barriers placed alternately left and right of the centre line, 14 m apart along the road starting at `along`, each offset 2.6 m from the centre (so the free gap between a barrier's inner edge and the road centre is wide enough for the RV, see H6). The barriers are pushable by the heavy-obstacle rule as today, so a driver can also bash through at a cost in health.
H3. `crateWall`: a 3 by 2 stack of crates (6 light crates) across the right half of the lane at `along`, leaving the left half free. Crates are pushable and a good coin of fun at speed.
H4. `roadblock`: a row of 3 heavy barriers across the full road at `along` with 3 m spacing (the roadworks rule, one row), no gap. It needs the existing heavy-obstacle pushers or the winch; the road's edge walls are NOT added, so no new rules apply. Use it once per course at most.
H5. Validation: hazards must lie inside the segment after the spawn inset and before the last 8 m; hazards must be at least 20 m apart (chicane counts its whole length, `(count - 1) * 14`); every hazard is checked against `SEGMENT_MIN_LENGTH`. Violations throw like the other segment checks.
H6. The RV (width 2.3 m, `VEHICLES.rv.halfExtents`) and the Lodgy both fit through a chicane gap without touching: the gap along the lateral axis between a barrier's inner edge and the opposite barrier's inner edge, projected on the route, is at least vehicle width + 1.0 m. The implementer computes this from `PROP_KINDS.barrier.halfExtents`, `ROAD_WIDTH` and the 2.6 m offset and reports the numbers; if it does not hold, change the 2.6 m offset in the plan's favour of the bigger value and report, do not shrink the vehicles.
H7. Course changes in `airport.ts`: add `hazards` to the long roads only, never to a road next to a stop, ford or bank: the 360 m curved road gets one `crateWall` at 150, the 300 m road gets a `chicane` (count 4, along 90) and a `crateWall` at 240, the final 300 m road gets a `roadblock` at 120. Stay clear of coin positions (coins use `coinsAlong`; the existing C7 coin clearance test must pass: move a hazard 5 m, never remove coins).
H8. The tuned course must still satisfy every existing structural test (`courses.test.ts`, `shoulders.test.ts`), the fuel margins (`airport.measure.test.ts`) and the per-segment drive tests (`drive.test.ts`, both vehicles). A `crateWall` and a `chicane` must be passable by the drive controller without winch; the `roadblock` is the one place a pusher or the winch is needed. If the drive controller cannot pass a chicane, report the numbers; do not weaken the test.

## Part B: a solo run is provably possible

S1. A solo finish test in `courses/drive.test.ts` or a new `courses/solo.test.ts`: one player, the Lodgy, drives the whole airport course segment by segment with the pure-pursuit controller (as `drive.test.ts` does) within the course's target time times 2, and the course `finished` flag is true. Where a segment needs a human on foot (the roadblock; the RV on the bank, `RV_NEEDS_WINCH`), the test performs the same scripted action the existing winch and push tests use, by a single player, and the test documents which actions it takes. If a segment cannot be completed by one player at all, stop and report which and why: that is a design finding for the owner, not a test to weaken.
S2. The same for the RV with 50% fuel (the existing RV drive setup), reporting the margin.

## Part C: stuck recovery

R1. A "flip and reset" action: the vehicle driver (or any seated player) holds `R` for 1.5 s to put an upturned or stuck vehicle back at the last checkpoint with the crew placed as for a checkpoint restart. The vehicle must be slower than 1 m/s and either upside down (up vector below 0.3) or have made less than 1 m of progress in 8 s while the driver holds the throttle. It costs the existing restart penalty (60 s, spec). It does not need admin rights. Without the conditions the hold does nothing and the HUD prompt says why in a short line.
R2. It reuses the checkpoint restart path (`restartCheckpoint`); the new input is a `reset` button in the input frame. A new button is a protocol change: add it to `shared/src/protocol.ts` input type as an optional boolean (absent means false) so old clients keep working, plus its parser tests.
R3. Tests (shared/server): `reset` honoured when upside down and slow; ignored when upright and moving; the penalty is added once; a held button across many ticks fires once until released.
R4. The client binds `R` (desktop) and a Reset button in the touch menu that appears only when the reset conditions hold (the model has a `canReset` flag in the HUD model, with a test for the model).

## Part D: a controls help

K1. A "Controls" panel opened by `H` (desktop) and a `?` button in the touch menu, listing every binding for walking, driving, the winch, items, reset, the debug overlay F3 and the credits link. The list is built from one constant table `CONTROLS` in `packages/client/src/ui/controls.ts` with a test that every key in the keyboard input's bindings appears in the table (so help cannot drift from input). The panel reuses the credits panel's open/close pattern (Escape and backdrop close).

## Files

- `packages/shared/src/segments.ts`, `constants.ts` (hazard spacing/offset constants), `courses/airport.ts`, `courses/solo.test.ts` (new), `courses/drive.test.ts`, `protocol.ts`, `world.ts` (reset), their tests.
- `packages/server/src/room/*` (forward `reset` like other buttons; tests as needed).
- `packages/client/src/input/*` (R binding), `ui/hud/hudModel.ts`, `ui/controls.ts` and test, `ui/hud/touchUi.ts`.
- `ROADMAP.md` (step row, decision lines, known issues), the spec's vehicle/obstacle and controls sections (one sentence each).

## Tests (numbered)

T1 H1/H5: the validation errors (overlap, too near the end, count out of range). T2 H2: a chicane places count barriers alternating sides at 14 m. T3 H3: a crateWall places 6 crates in the right half. T4 H4: a roadblock places 3 barriers across the road. T5 H6: gap arithmetic is asserted from the constants. T6 H7/H8: airport structural, coin clearance, fuel and per-segment drives pass. T7 S1/S2: solo finish for Lodgy and RV. T8 R1/R3: reset rules. T9 R2: protocol parse with and without `reset`. T10 R4: HUD model `canReset`. T11 K1: controls table covers every binding. T12 e2e: `H` opens and Escape closes the panel; the page still boots.

## Tasks

1. Part A (H1 to H8) with its tests. 2. Part B (S1, S2). 3. Part C (R1 to R4). 4. Part D (K1) and the e2e. 5. `ROADMAP.md`, spec sentences, decision lines and every check.

Review after each task by a Sonnet reviewer; Opus reviews the whole branch at the end.
