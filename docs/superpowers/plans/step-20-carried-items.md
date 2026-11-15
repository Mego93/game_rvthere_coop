# Step 20: Two carried items (wall ray for exits and spawn slots; touch hint wording)

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`. Read "Conventions", the seat exit rules (exit beside the door, then the other side, then a spawn slot), the spawn-slot rules, and "HUD". Code: `packages/shared/src/player.ts` (`standingSpot`, `findSpawn`, `findExit`, `touching`, `worldGroups`), `groups.ts`, `seats.ts` (`exitPoints`), `packages/client/src/ui/hud/hudModel.ts` (`prompt`), `ui/overlay.ts` (`interactHint`, `useHint`), `ui/touchUi.ts` (button labels `Act` for interact, `Use` for use item).

This plan fixes constants, rules and test cases. Implementers write the tests first. Where the plan and the spec disagree, or neither answers a question, stop and report. This is not an owner sign-off step: it ends at `done` after the checks.

ROADMAP "Carried into later steps" rows covered here: step 16 (exit and spawn-slot ray), step 12 (touch hint wording and the overlay size on a 340 px screen).

## Item 1: a wall between the vehicle and a standing spot

Problem: `standingSpot` only checks that ground exists under the point and the capsule overlaps nothing there. A thin wall between the vehicle and a point lets a point on the far side count as valid, so a player can exit or spawn through a fence (course 1's stop pads sit beside fences).

### Files

- `packages/shared/src/player.ts`: the change.
- `packages/shared/src/constants.ts`: `SPAWN_WALL_RAY_HEIGHT = 0.9` (m above the feet height of the point, the ray's height).
- `packages/shared/src/player.test.ts` and `packages/shared/src/player.spawn.test.ts` (or the file where spawn tests live; the implementer greps `findSpawn` tests): the new tests.

### Rules

W1. `standingSpot(x, z, from)` gains a third parameter `from: Vec3`, the origin of the check (a world point). After it finds valid feet, it casts a ray from `from` raised to the height `feet.y + SPAWN_WALL_RAY_HEIGHT` (the ray keeps `from`'s x and z), horizontally toward `(x, feet.y + SPAWN_WALL_RAY_HEIGHT, z)`. If the ray hits a static wall before reaching the point, the spot is invalid (`null`). Ground boxes, props, the vehicle chassis and other players do not block: the ray filters to walls only (static colliders that are not ground; the implementer finds how `course.walls` are given their groups in `world.ts` or `statics.ts`, and reports it if there is no group that separates walls from ground).
W2. `findExit(seat)` passes the seat's world position (vehicle position plus the seat's local position rotated by the vehicle's yaw frame, as `seatDoorPoint` computes the door but at the seat itself) as `from`.
W3. `findSpawn` passes the vehicle's world position as `from`, for every spawn slot.
W4. A ray of length zero or a `from` that equals the point (both on the same x and z) is not blocked.
W5. Existing behaviour is otherwise unchanged: the fallback spawn at the last checkpoint, the order of slots, the occupied-slot check, the two exit points.
W6. `standingSpot` stays private; no export changes.

### Tests (numbered)

T1 W1/W2: a thin wall (0.1 m thick, 2 m tall) between the seat and the own-side exit point makes `findExit` return the other side's point; a wall on both sides returns `null`.
T2 W1/W3: a thin wall between the vehicle and a spawn slot makes `findSpawn` skip that slot and choose the next one that is not blocked; walls on all slots give the fallback checkpoint spawn.
T3 W1: a wall that does not lie between the vehicle and the point (beside the point, behind the vehicle) changes nothing.
T4 W1: ground boxes and a prop between the vehicle and the point do not block (a prop 1 m tall on the way).
T5 W4: a point directly above or at the seat's x and z is not blocked.
T6 W5: every existing exit and spawn test passes unchanged (the implementer lists any test it had to change; there should be none).
T7: on course 1 (`airport`), at the fuel stop and the garage, with the vehicle parked in the stop zone for each vehicle, `findExit` of each seat and `findSpawn` return points on the vehicle's side of any fence between them and the vehicle (or the point is not behind a wall); assertion: for every returned point, a straight horizontal segment from the vehicle's position to it crosses no wall box of `course.walls` (computed with plain box maths in the test, not Rapier).

## Item 2: touch wording of the HUD prompt

Problem: the HUD prompt on a touch device says `E to board` and `Hold F to refuel`, but the touch buttons are labelled `Act` and `Use`.

### Files

- `packages/client/src/ui/hud/touchWording.ts` and `touchWording.test.ts` (new).
- `packages/client/src/ui/hud/hudModel.ts`: apply it to the prompt when `data.touch`.
- `ROADMAP.md`.

### Rules

K1. `touchWording(hint: string): string`: `E to <x>` becomes `Act to <x>`; `Hold E to <x>` becomes `Hold Act to <x>`; `Hold F to <x>` becomes `Hold Use to <x>`; any other text is returned unchanged; replacement applies at the start of the string only.
K2. In `buildHudModel`, when `data.touch` is true, each of the two hints is passed through `touchWording` before they are joined; the desktop prompt is unchanged. The debug overlay text (`overlayText`, `interactHint`, `useHint`) is not changed: the e2e tests read `E to board` from it.
K3. The overlay's size on a 340 px tall screen: the debug overlay is hidden by default since step 12, so this carried item is moot. Delete that part of the roadmap row and say so in the commit message.

### Tests (numbered)

T8 K1: each of the three patterns, an unchanged hint (`null` input is not allowed by the signature; the model handles null), and a hint with `E` inside the text (for example `E to pick up the jerrycan`: becomes `Act to pick up the jerrycan`; `Press E to` is left alone).
T9 K2: `buildHudModel` with `touch: true` gives `Act to board` and `Hold Use to refuel`, with `touch` false or undefined gives the current wording.

## Tasks

1. Item 1 (T1 to T7).
2. Item 2 (T8, T9).
3. `ROADMAP.md`: delete both carried rows (step 16 ray row, step 12 touch wording row), add a decision line, status `done` for this step (it has no table row: add "Step 20" row), run every check.

Review after each task by a Sonnet reviewer; Opus reviews the whole branch at the end.

## Amendments after the plan review (binding; where they differ from the text above, they win)

R1. The premise "course 1's stop pads sit beside fences" is wrong: `placeStop` only adds a ground pad, the airport's stops are on plain roads with no walls, the only fences are the roadworks' `edgeWall`s, and road and alley ground is exactly as wide as the space between the walls, so `groundBelow` is already null past a wall. Item 1 is therefore a robustness fix for any course with ground beyond a thin wall (future courses; test variants), not a fix for a failure on course 1. T7 is dropped. The ROADMAP row's claim is corrected when the row is deleted (task 3 says so in the decision line).
R2. W1's filter: walls are members of `WORLD|STATIC`, ground of `WORLD|GROUND|STATIC`. Use `groups(GROUP_WORLD, GROUP_STATIC)` for the ray (that skips the chassis, props, players and items) together with a `filterPredicate` (castRay's 8th argument) that rejects colliders whose membership includes `GROUP_GROUND`. No new group, no export change (W6 stands). `solid = true`; the direction is normalised and `maxToi` is the horizontal distance.
R3. W4: a horizontal distance below 1e-6 is not blocked. The ray sits 0.9 m above the point's feet height, so walls lower than 0.9 m do not block; fences (1.2 m) do.
R4. T7 (replacement): on a `testGround` variant whose ground continues past a fence 0.5 m thick and 1.2 m tall, with the Lodgy parked so its centre is 0.9 m from the fence face, the own-side exit point of the Lodgy (reach 1.78 m) lands beyond the fence: `findExit` returns the other side's point; with the same fence on the other side too it returns `null`.
R5. T4 uses the `barrier` prop (1.0 m tall), not a crate, between the vehicle and the point.
R6. T8: the "E inside the text" example is `Hold F to revive Eve` (becomes `Hold Use to revive Eve`) and `Press E to board` (unchanged).
R7. Task 3 also updates the ROADMAP working note that says every hint still names keys (the line about step 3 or the touch hints near "every hint").
