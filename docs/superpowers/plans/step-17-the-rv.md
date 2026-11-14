# Step 17: The RV

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`. Read the vehicle table (Lodgy and RV differences), "every segment is completable by the RV starting from 50% fuel", and "Testing". Code: `packages/client/src/render/vehicleMesh.ts`, `packages/shared/src/vehicles.ts` (the `rv` config: `halfExtents` 1.15 × 1.2 × 3.4, wheels, seats), the step 16 drive tests in `packages/shared/src/courses/` and `docs/superpowers/plans/step-16-course-1.md`.

This plan fixes rules and test cases. Implementers write the tests first. Where the plan and the spec disagree, or neither answers a question, stop and report. This step ends at `needs sign-off`: how the RV looks and handles is the owner's call, by playing course 1.

## Scope

The spec's step 17 is "the RV: mesh and handling pass over course 1". Per CLAUDE.md, implementers do not retune to make something feel better: feel is the owner's call. So:

- **Mesh:** the RV gets a proper motorhome look, built from boxes, in place of the plain box.
- **Handling pass:** this step measures how the RV (as configured today) behaves over course 1 and records the numbers for the owner. It changes no vehicle constant. If a measurement shows the RV cannot do what the spec requires, the step stops and reports the numbers; the owner decides the change.

## Files

- `packages/client/src/render/vehicleMesh.ts`: `createVehicleMesh(config)` builds the RV from the parts in M1 when `config.id === 'rv'`; the Lodgy keeps its current look.
- `packages/client/src/render/vehicleMesh.test.ts` (new).
- `packages/shared/src/courses/courses.test.ts` (from step 16): the RV drive test also runs with 50% fuel.
- `ROADMAP.md`: a working note "RV measurements" and the status.

## Behaviour rules

M1. The RV mesh is a group of boxes: a cargo body (the rear 65% of the length, full height), a cab (the front 35%, 20% lower than the body, with a bonnet step), a dark windscreen on the front face as now, dark side windows on both sides of the cab and the body, a rear panel, a roof vent, a dark front bumper, and wheels with dark wheel arches. Colours: cream body (the current `0xefe6d2`), a stripe of terracotta (`0xc1623f`) along both sides, dark glass (`0x1f2937`), tyres (`0x111827`). The front (-Z) stays marked by the windscreen so the direction is readable.
M2. Every part lies inside the vehicle's collision box expanded by 0.15 m on every side (the roof vent may rise 0.15 m above). The wheels sit where the config puts them (`wheelX`, `wheelY - suspensionRest`, `wheelZ`), as now. The group's origin is the vehicle's centre, as now, so `placeVehicleMesh` is unchanged.
M3. `createVehicleMesh('lodgy')` produces exactly what it does today (the existing tests, if any, pass; no change to the Lodgy).
M4. Mesh disposal: `disposeScene` already disposes geometries and materials of any group; the RV mesh creates no textures and no shared module-level materials that a disposal could break (each part makes its own material, as `part` does).
M5. RV completability at 50% fuel: for every segment of `airport` except the roadworks, the RV starting at the segment's checkpoint spawn with fuel 0.5 reaches the next checkpoint (the finish for the last segment), using the step 16 controller and time limit. This is a variant of the step 16 drive test (fuel parameter), not a new controller.
M6. Handling measurements (recorded, not asserted beyond M5): for the RV and the Lodgy on `airport`: top speed reached on the first road segment; time from standstill to 10 m/s on road; speed at the end of the sand segment, entering with the speed reached from the apron; time through the ford; and time through the bank. Written by a script `experiments/rv/rv.measurements.ts` that prints a table (like `experiments/cable`), run with `npm run experiment:rv`. The script uses the same rig and controller as the drive tests (import them from a shared test helper; if they live inside a test file, move them to `packages/shared/src/courses/driveRig.ts` and import from both; the step 16 tests change only their import).

## Tests (numbered)

T1 M1/M2: for the RV config, every child mesh of the group has a bounding box inside the collision box expanded by 0.15 m (0.15 m above for the roof vent); the group has a windscreen child at the front (-Z) face; wheel positions equal the config's.
T2 M3: for the Lodgy config the group has the same children (count, sizes, positions) as before the change (snapshot the numbers the existing function produces).
T3 M4: disposing the RV group with `disposeScene` leaves no mesh un-disposed (use the existing disposal test's approach).
T4 M5: the RV completes every segment of `airport` except the roadworks with fuel 0.5.
T5 M6: the script runs without error under `npm run experiment:rv` (smoke-run in the step's checks, not a unit test).

## Tasks

1. RV mesh (M1 to M4, T1 to T3).
2. `driveRig.ts` extraction if needed, the 50% fuel drive test (M5, T4), and the measurement script (M6, T5).
3. `ROADMAP.md`: the status `needs sign-off`, the measurements table as a working note, the decision D-RV1 (handling not retuned; owner decides after playing), the spec row; run every check.

Review after each task by a Sonnet reviewer; Opus reviews the whole branch at the end.
