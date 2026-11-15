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
