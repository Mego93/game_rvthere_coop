# Step 29: Souleyman

Spec: ROADMAP "Step 29: Souleyman" and the owner's answer "one look at every checkpoint, saves on arrival (greeting and sound)". Client only: no change to `shared`, `server` or the protocol. The existing checkpoint mechanism and `checkpoint` event stay as they are.

## Decisions

- One look: every checkpoint shows the same figure, named Souleyman. He is a marker that triggers on arrival, not something to talk to.
- No Sketchfab model: the owner has not supplied a token (the credential request was interrupted), so Souleyman is a blocky procedural figure like the goat (`animalMeshes.ts`): a long robe (djellaba) with a hood, a turban, a beard, arms at the sides. Swapping in a downloaded CC0 or CC-BY model later changes only `createSouleymanMesh`. Open question for the owner, recorded in the ROADMAP.
- The blue checkpoint box is removed from `scene.ts`; the finish box stays. The minimap and the compass still show the next checkpoint (unchanged).

## Files

- `packages/client/src/render/souleyman.ts` (new): `createSouleymanMesh(): THREE.Group` (origin at the feet, facing -z, about 1.8 m tall before CHARACTER_SCALE; use `CHARACTER_SCALE` from shared so he matches the players), `souleymanPlacements(checkpoints: readonly Checkpoint[]): { x: number; z: number; y: number; yaw: number }[]`, `SOULEYMAN_LATERAL` (m from the road centre line: `ROAD_WIDTH / 2 + 1.5`), `SOULEYMAN_GREETING` (`'Souleyman: Saved. Bonne route!'`).
- `packages/client/src/render/scene.ts`: remove the checkpoint box line; add one Souleyman group per placement.
- `packages/client/src/ui/hud/eventToast.ts` and its caller: on the `checkpoint` event show the greeting as a toast (the existing sound mapping for `checkpoint` stays).

## Rules

1. A placement stands on the right-hand side of the road at the checkpoint (right of the checkpoint's spawn heading), `SOULEYMAN_LATERAL` from the centre line, at the checkpoint's along position, on the checkpoint's ground height (the spawn pose's y), facing the road centre (yaw turned a quarter turn toward the road).
2. Placement reads only `Checkpoint.spawn` (pose, yaw from its quaternion). It does not read the trigger box.
3. He is static: no animation, no collision body, no snapshot data.
4. The greeting toast shows once per `checkpoint` event, for the existing toast duration; no toast when the course has no checkpoint events (restart does not emit one).
5. The scene disposes his geometry and materials with the rest (existing `disposeScene` path); one shared material set for all instances is fine.
6. Marrakech has about 280 checkpoints: instancing is not needed, but the meshes must stay within the existing `marrakech.perf.test.ts` budget; if that fails, merge each figure's boxes into one geometry per colour.

## Tests (write first; the client's HUD maths and net/prediction/input rules do not cover this, so these are for the maths and structure)

1. `souleyman.test.ts`: `souleymanPlacements` for a straight checkpoint at yaw 0 puts him at lateral `SOULEYMAN_LATERAL` to the right with y equal to the spawn's y; for a checkpoint with yaw 90° the offset rotates with it; one placement per checkpoint, same order.
2. The placement faces the road centre (the figure's -z points to the centre line) for two yaws.
3. `createSouleymanMesh`: height equals about 1.8 × CHARACTER_SCALE within 5 %, all children cast shadows, the group has a hood, a turban and a robe by name.
4. `scene` test (existing scene/disposeScene tests): `createScene` on a small course adds no mesh with the old blue checkpoint colour and adds one Souleyman group per checkpoint; `disposeScene` leaves no live geometry from him.
5. `eventToast` test: a `checkpoint` event yields the greeting text; other events unchanged.
6. `marrakech.perf.test.ts` stays green (rule 6).

## Task

One task (implementer on Sonnet), then a Sonnet review, then ROADMAP row 29 → `needs sign-off` with a decision line (procedural figure, no model, the open Sketchfab question), spec "Checkpoints" note, full checks, push, PR, merge. Rendering and feel cannot be verified by tests: left to the owner.
