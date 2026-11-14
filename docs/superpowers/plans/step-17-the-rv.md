# Step 17: The RV

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`. Read the vehicle table (Lodgy and RV differences), "every segment is completable by the RV starting from 50% fuel", and "Testing". Code: `packages/client/src/render/vehicleMesh.ts`, `packages/shared/src/vehicles.ts` (the `rv` config: `halfExtents` 1.15 × 1.2 × 3.4, wheels, seats), the step 16 drive tests in `packages/shared/src/courses/` and `docs/superpowers/plans/step-16-course-1.md`.

This plan fixes rules and test cases. Implementers write the tests first. Where the plan and the spec disagree, or neither answers a question, stop and report. This step ends at `needs sign-off`: how the RV looks and handles is the owner's call, by playing course 1.

## Scope

The spec's step 17 is "the RV: mesh and handling pass over course 1". Per CLAUDE.md, implementers do not retune to make something feel better: feel is the owner's call. So:

- **Mesh:** the RV gets a proper motorhome look, built from boxes, in place of the plain box.
- **Handling pass:** this step measures how the RV (as configured today) behaves over course 1 and records the numbers for the owner. It changes no vehicle constant. If a measurement shows the RV cannot do what the spec requires, the step stops and reports the numbers; the owner decides the change.

## Files

- `packages/client/src/render/vehicleMesh.ts`: `createVehicleMesh(config)` builds the RV from the parts in M1 when `config.id === 'rv'`; the Lodgy keeps its current look. Every part sets `mesh.name`.
- `packages/client/src/render/vehicleMesh.test.ts` (new).
- `packages/shared/src/courses/driveRig.ts` (new, created in this step by moving the step 16 drive controller out of the test file): `timeLimit(routeLength: number, maxSpeed: number): number` (`15 + routeLength / (0.3 * maxSpeed)`), `driveSegment(rapier, vehicleId: string, course: BuiltCourse, segmentIndex: number, opts?: { fuel?: number }): { reached: boolean; seconds: number; trace: { t: number; speed: number; fuel: number }[] }`. The fuel is set through `rig.vehicle.resetTo(spawn, fuel, 1)`. The step 16 test file `courses/courses.test.ts` changes only its imports.
- `experiments/rv/rv.experiment.ts` (new): the measurements script. `package.json`: add `"experiment:rv": "vitest run --config experiments/vitest.config.ts --reporter=verbose experiments/rv"` and append `experiments/cable` to the `experiment:cable` script so the two do not run each other's files.
- `ROADMAP.md`: a working note "RV measurements" and the status.

## Behaviour rules

M1. The RV mesh is a group of named boxes, in the vehicle's frame (origin at its centre, front at -Z). With `h = (1.15, 1.2, 3.4)`:
- `body`: the cargo body, z from -1.02 to 3.4, full height (y from -1.2 to 1.2), full width.
- `cab`: z from -3.4 to -1.02, y from -1.2 to 0.72 (80% of the height), full width. No separate bonnet.
- `windscreen`: dark, 2.07 wide, 0.7 tall, 0.1 deep, centred at (0, 0.30, -3.43) on the cab's front face (as now, in the dark glass colour).
- `window` ×4: dark, 0.05 deep, 1.0 long × 0.5 tall: two on each side, one in the cab (z -2.2, y 0.25) and one in the body (z 1.0, y 0.4), flush against the side faces (x = ±1.17).
- `rear`: a slightly darker panel 2.0 × 1.6 × 0.05 on the rear face (z 3.42, y 0.0).
- `vent`: a roof vent 0.8 × 0.15 × 0.8 at (0, 1.275, 0.8).
- `bumper`: dark 2.3 × 0.3 × 0.3 at (0, -0.95, -3.40) (so it stays inside the M2 envelope).
- `stripe` ×2: terracotta, 0.03 deep, 4.0 long × 0.3 tall on both sides along the body and cab, at y -0.3, z 0, x = ±1.17.
- `arch` ×4: dark, 0.3 wide × 0.4 tall × 1.0 long, centred at x = ±1.15, y = -1.0, z = ±2.3 (the wheel's z, `wheelZ`).
- `wheel` ×4: 0.25 × 0.8 × 0.8, at (±wheelX, wheelY - suspensionRest, ±wheelZ) = (±1.05, -1.40, ±2.3), as the Lodgy's are placed.
Colours: body and cab cream `0xefe6d2`, stripes terracotta `0xc1623f`, glass `0x1f2937`, rear panel `0xcfc6b2`, tyres, arches and bumper `0x111827`.
M2. Every named part except `wheel` lies inside the collision box expanded by 0.15 m on each side (so |x| ≤ 1.30, |y| ≤ 1.35, |z| ≤ 3.55), except `vent`, whose top may reach y = 1.5. Wheels are checked only against the config (centre and size as in M1), because they hang below the collision box as the Lodgy's do. The group's origin is the vehicle's centre, so `placeVehicleMesh` is unchanged.
M3. `createVehicleMesh(lodgy)` produces exactly what it does today: children in this order, body 1.76 × 1.1 × 4.5 at the origin; windscreen 1.584 × 0.33 × 0.1 at (0, 0.275, -2.28); wheels 0.25 × 0.66 × 0.66 at (±0.78, -0.70, ±1.40) in the order x = -, +, with z = -, + inside each (-,-), (-,+), (+,-), (+,+) as the existing loops produce. Parts of the Lodgy also get names (`body`, `windscreen`, `wheel`), which changes no geometry.
M4. Disposal: each part makes its own geometry and material, as `part` does; no textures and no module-level shared materials.
M5. RV completability at 50% fuel: for every segment of `airport` except the roadworks, `driveSegment` with `fuel: 0.5` for the RV reaches the next checkpoint (the finish for the last segment) within `timeLimit`. Fuel matters only at zero, so this is in effect a drain check. If the step 16 drive fails the bank for the RV (the spec says the RV needs the winch on any real slope), stop and report; the owner decides whether the bank is excluded.
M6. Handling measurements (recorded, not asserted beyond M5), for the RV and the Lodgy on `airport`, with the same controller and no per-vehicle recalibration; the script must not tune it:
- Top speed on road: the maximum speed of `driveSegment` on segment 0 (road 120) extended by continuing through segments 0 to 1 from the start (continuous run).
- Time to 10 m/s: from the standstill at segment 0's spawn, the first time the speed reaches 10 m/s.
- Sand exit speed: a continuous run from segment 3's checkpoint spawn to segment 5's checkpoint trigger; the speed at the moment the vehicle's centre passes the end of segment 4 (the next checkpoint's trigger).
- Ford time: `driveSegment` seconds for segment 6.
- Bank time: `driveSegment` seconds for segment 8.
It prints a table (vehicle × measurement) and fails only on an exception.

## Tests (numbered)

T1 M1/M2: for the RV config, each named child's `Box3.setFromObject` (after `group.updateMatrixWorld()`) lies inside the M2 envelope (the vent's top at most 1.5); the windscreen is at z = -3.43 and has the dark colour; the wheels' centres and sizes equal the config's; the children's names match M1 exactly (counts: body 1, cab 1, windscreen 1, window 4, rear 1, vent 1, bumper 1, stripe 2, arch 4, wheel 4). No renderer is used.
T2 M3: the Lodgy's children match the numbers in M3.
T3 M4: after `disposeScene`, every geometry and material of the RV group is disposed (the approach of `disposeScene.test.ts`).
T4 M5: the RV completes every segment of `airport` except the roadworks at fuel 0.5.
T5 M6: `npm run experiment:rv` runs and prints the table (run in the step's checks).

## Tasks

1. RV mesh (M1 to M4, T1 to T3).
2. `driveRig.ts` extraction, the 50% fuel test (M5, T4) and the measurement experiment with its scripts (M6, T5). Needs step 16's drive test to exist.
3. `ROADMAP.md`: the status `needs sign-off`, the measurements table as a working note, the decision D-RV1 (handling not retuned; the owner decides after playing), the spec row; run every check.

Review after each task by a Sonnet reviewer; Opus reviews the whole branch at the end.
