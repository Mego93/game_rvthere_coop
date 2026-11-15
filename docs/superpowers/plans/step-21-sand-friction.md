# Step 21: Less friction on sand, so the RV can cross it (solo included)

Owner request (2026-11-15, repeated three times): "make it less stressful to friction (make it easier so even solo can happen but coop harder)". This is the owner's tuning call; CLAUDE.md's rule against retuning for feel does not apply to it.

Code: `packages/shared/src/constants.ts` (`SURFACES`, `SAND_APRON`), `vehicle.ts` (resistance = `surface.rolling × mass × GRAVITY`, wheel friction slip = `config.grip × surface.grip × gripScale`), `vehicles.ts` (RV: mass 3750 kg, `engineForce` 7500 N), `courses/airport.ts` (sand segment, now 30 m), `courses/drive.test.ts`, `courses/courses.test.ts`, and the roadmap's known issue "The RV cannot pull away from rest on sand".

This plan fixes constants, rules and test cases. Implementers write the tests first. Where the plan and the spec disagree, or neither answers a question, stop and report. This step ends at `needs sign-off`: whether the sand feels right is the owner's call.

## Arithmetic

The RV's engine force is 7500 N and its weight is 3750 × 9.81 = 36,788 N, so it can overcome rolling resistance only below 7500 / 36,788 = 0.204 of its weight. Sand is 0.25 today (resistance 9,197 N, so the RV cannot pull away and stops about 38 m into sand after the apron's run-up). With 0.15 the resistance is 5,518 N and the net forward force at full throttle is about 1,980 N, an acceleration of about 0.53 m/s² from rest. The Lodgy is also helped. The wheel's tyre grip on sand (`grip` 0.6) is unchanged and the implementer checks that it does not cap the force.

## Rules

F1. `SURFACES.sand.rolling` changes from 0.25 to 0.15 (a starting value; the owner tunes it). Nothing else in `SURFACES` changes (road 0.015, gravel 0.05, riverbed 0.15).
F2. The RV pulls away from rest on sand: from a standstill on sand at full throttle it reaches 2 m/s within 10 s.
F3. The RV crosses a sand segment with the apron's run-up and keeps going: `drive.test.ts`'s RV case for the sand passes with the sand at 140 m (see F5).
F4. Sand still costs something: for both vehicles, the steady speed at full throttle on a long flat sand patch is lower than on road (a surface effect remains).
F5. `courses/airport.ts`: the sand segment (index found by type) goes back to its first design: length 140, palms 6, coins `coinsAlong(5, 140)` (the along values of that helper count the 50 m apron, as before). The apron pickup stays. Every structural test over the airport (B2 to B8, C7 coin clearance, ids) passes with it.
F6. The bank stays winch-only for the RV (the spec: the RV fails a medium slope unaided; gravity along a 15° slope is 0.26 of its weight, more than its engine can overcome, which friction does not change). A solo driver can winch from the seat (the driver's reel works). `RV_NEEDS_WINCH` is unchanged.
F7. Co-op difficulty is unchanged and already scales with the crew: a heavy barrier needs 1 pusher with 1 player, 2 with 2 to 3 players, 3 with 4 to 6. No change.
F8. Tests that assumed the old resistance (the RV stays put on sand, "sand slows it" for the RV at zero distance, any expectation of a stall distance) are changed to the new behaviour; the implementer greps `sand`, `SURFACES` and `rolling` across `packages/*/src` and `experiments/`, runs the whole suite, and lists every test changed. Do not weaken a test to pass: replace the expectation with F2 to F4.
F9. `ROADMAP.md`: delete the known issue "The RV cannot pull away from rest on sand, by the owner's decision" and the course-1 note about stalling in sand (change that note to the bank and roadworks only); update the working note numbers if the experiment changes (`npm run experiment:rv`), the course table row in decision D-C1 (sand 140 m again), and add a decision line for this step.

## Tests (numbered)

T1 F1/F2: the RV from rest on a sand test patch reaches 2 m/s within 10 s (replaces the old "stays put" test).
T2 F4: Lodgy and RV steady speed on sand is below that on road.
T3 F3/F5: the RV's per-segment drive of the airport's sand segment passes at 140 m within `timeLimit`.
T4 F5: the structural tests over the airport pass with the 140 m sand.
T5: all other drive tests (every segment but the roadworks for both vehicles, the bank for the Lodgy; 50% fuel for the RV) still pass; the fuel margins (C5) still pass; the implementer reports the new fuel numbers, which can only improve.

## Tasks

1. `SURFACES.sand.rolling`, the tests that assumed the old value (F1, F2, F4, F8, T1, T2).
2. The airport sand back to 140 m and its drive and structural tests (F3, F5, T3, T4, T5).
3. `ROADMAP.md` (F9) and every check.

Review after each task by a Sonnet reviewer; Opus reviews the whole branch at the end.

## Amendments after the plan review (binding; where they differ from the text above, they win)

A1. F5 is replaced: the airport's sand segment goes from 30 m to **60 m** (palms 4, coins and the apron pickup unchanged: the along values 58 and 70 still fall on the sand). Reason: fuel burns per second at full throttle; on 140 m of sand the RV settles near 4 m/s and spends about 34 s there (13.7 s today), costing about 0.126 of a tank and taking the RV's C5 margin from 12.3% to about 0%. Each extra metre of sand costs about 0.0014 of a tank for the RV; 60 m should leave about 8%. The C5 test keeps its 5% threshold. If the RV's C5 leg fails with 60 m, stop and report the numbers; do not lower the threshold or the length silently. T3 and T4 apply to 60 m.
A2. F8's list (found by the review): `packages/shared/src/vehicle.test.ts` ~L113 "from rest on sand ... stays bogged within 0.5 m for 10 s" breaks: replace it with T1. `vehicle.test.ts` ~L101, the Lodgy's "sand slows it to less than half the distance covered on road" (3 s) probably breaks: replace it with T2. These pass unchanged and must keep passing: `vehicle.test.ts` ~L120 (enters at 12 m/s), `scenarios.test.ts` ~L234, `courses.test.ts` ~L323 "the sand" (the demo's 30 m sand), `testGround.test.ts`, `world.test.ts`. Nothing in the server, client or e2e depends on sand values. The implementer still greps and runs the whole suite and lists every change.
A3. T2 (F4) is built like this: a 200 m sand slab made with `withBoxes` on the test ground; measure `forwardSpeed()` after 6 s from rest at full throttle on road and on sand; require sand speed below 0.5 times road for the RV (estimated 2.2 against 7.7 m/s) and below 0.8 times road for the Lodgy. T1 (F2): from `settled(rv, ON_SAND)` (the existing helper; 25 m of sand ahead), `forwardSpeed()` reaches 2 m/s within 10 s while staying on the patch (the RV covers about 18 m in 10 s).
A4. Traction: Rapier limits each wheel's friction to `frictionSlip × suspension force`; for the RV that is about 0.96 of its weight (about 35 kN, about 26 kN in rain), and the net applied force is about 1,980 N, so grip does not cap it. This replaces "the implementer checks".
A5. The spec is updated in task 3: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md` line ~158 (the vehicle table: both columns for sand; the Lodgy no longer "slows to a crawl", the RV "slows a lot but pulls away"), line ~260 ("the vehicle bogs down" becomes "slows the vehicle"), and a decision line in `ROADMAP.md`.
A6. F9 adds these ROADMAP edits: the working note "cannot cross more than about 30 m of sand" (line ~104), the known issue about winching an RV stuck on sand (line ~120), and mark the earlier decision "Pushing does not free the RV from sand" (line ~234) as superseded by this step. Note for the owner: sand's rolling resistance now equals the riverbed's (0.15); only the grip differs (0.6 against 0.7).
A7. Run `courses.test.ts` first after changing the sand length: later commits tightened its structural tests.
