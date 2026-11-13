# Step 6: Winch

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md` (sections "Winch", "Hands and inventory", "Interact resolution", "Snapshot", "Push" (heavy obstacles), "Scenario tests"). Cable values and formula: `experiments/cable/RESULTS.md` and `experiments/cable/cable.experiment.ts`. This plan fixes interfaces, constants, rules and test cases. Implementers write the tests first, then the code. Where the plan and the spec disagree, or neither answers a question, stop and report (CLAUDE.md, "When something is not specified").

## Goal

The hook rests on the front bumper. A player takes it, carries it (the cable pays out up to 25 m), and attaches it to a marked anchor or a heavy obstacle's anchor point. The driver, or a player on foot at the winch box, reels in or out. The cable is a capped spring and damper, exactly as in the experiment. The page draws the hook and the rope.

Not in this step: health, fuel and damage (7), checkpoint restarts (8), events (9), the HUD prompts (12).

## Decisions made in this plan (log them in `ROADMAP.md` in the last task)

W1. The cable's tension is the experiment's formula, unchanged: with `from` the winch mount in world space, `to` the hook's attach point, `dir = normalise(to − from)`, `stretch = |to − from| − length`, `rate = −dot(vFrom − vTo, dir)` (`vFrom` the vehicle's velocity at the mount, `vTo` the anchor end's velocity: 0 for a static anchor, the obstacle's velocity at its anchor point otherwise), `tension = stretch > 0 ? clamp(k·stretch + c·rate, 0, cap) : 0`, `k = WINCH_STIFFNESS_PER_KG · mass`, `c = 2 · WINCH_DAMPING_RATIO · mass · sqrt(WINCH_STIFFNESS_PER_KG)`, `cap = WINCH_FORCE_PER_WEIGHT · mass · GRAVITY` (mass is the vehicle's). The vehicle gets the impulse `dir · tension · TICK_DT` at the mount; an obstacle gets the opposite impulse at its anchor point.
W2. The hook is not a physics body. On the ground it is a point found by a downward ray (ground group) from the release point; with no ground within `HOOK_DROP_RAY` it is stowed.
W3. A heavy prop kind has an anchor point in its own frame (`PROP_KINDS[kind].anchor`, null for light kinds): the barrier's is the centre of its top face, `(0, 0.5, 0)`. A static anchor's attach point is `pose.pos + (0, ANCHOR_HEIGHT, 0)`.
W4. Ranges: the winch box is the winch mount; "in range" of the winch box, an anchor point or the ground hook is the distance from the player's feet plus `(0, PUSH_HEIGHT, 0)` (the chest) to the point, at most `HOOK_RANGE`. Aim angles to a point use `aimAngleToBox` with zero half extents.
W5. The reel runs at tick step 2, after pushes, using this tick's tension: reel in shortens the cable by `WINCH_REEL_SPEED · TICK_DT` unless the tension is at the cap, down to `WINCH_MIN_LENGTH`; reel out lengthens it, up to `WINCH_MAX_LENGTH`. The reel input is the driver's `reel` if non-zero, otherwise the first player in join order on foot, in range of the winch box and with non-zero `reel`.
W6. Reeling in while the hook lies on the ground stows it at once. Reeling has no effect while the hook is stowed or held.
W7. A heavy obstacle with the hook attached is unlocked on every tick on which the cable is taut (`stretch > 0`), in addition to the push rule (H4 of step 5).
W8. The spec's scenario "a flipped RV is righted by the winch" is dropped. Measured before planning (a scratch run with the experiment's formula, the RV on its side, anchors on either side, low and high): a cable at the front bumper cannot roll the RV, nor the Lodgy except from one side. An RV on its side is recovered by the admin's checkpoint restart (step 8). Spec "Vehicles" (row "Pushing": "righting it needs the winch") and "Scenario tests" are amended; the owner confirms.
W9. The hook in the hands is drawn and simulated at the holder's hold pose (`holdPoseAt`, step 5). Carried beyond `WINCH_MAX_LENGTH` from the mount, it is pulled from the hands and drops (W2); a ground hook beyond `WINCH_MAX_LENGTH` from the mount is stowed. Both checks run after characters move (tick step 4), in that order, so a hook pulled beyond reach is stowed on the same tick.
W10. Test-ground anchors: `anchor-1` stays; `anchor-2` sits on the steep slope 39 m up (`slopePose('steep', 39).pos`); `anchor-3` at `(20, 0, −55)`, 10 m beyond the sand patch.

## Constants (`constants.ts`, block "Winch"; the existing six winch constants stay)

| Name | Value | Meaning |
|---|---|---|
| `HOOK_RANGE` | 2 | m, from the chest to the winch box, an anchor point or a ground hook |
| `ANCHOR_HEIGHT` | 0.5 | m above a static anchor's pose, where the hook attaches |
| `HOOK_DROP_RAY` | 50 | m, the downward search for ground under a dropped hook |

`PROP_KINDS` gains `anchor: Vec3 | null` per kind: crate `null`, barrier `vec3(0, 0.5, 0)`.

## Modules and signatures

### `shared/src/winch.ts` (new)

```ts
export type CableState = 'stowed' | 'held' | 'ground' | 'attached';
export interface CableSnapshot { state: CableState; holderId: string | null; anchorId: string | null; hookPos: Vec3; length: number; reel: -1 | 0 | 1 }
export interface CableEnd { point: Vec3; velocity: Vec3 }
// W1, pure.
export function cableTension(from: CableEnd, to: CableEnd, length: number, vehicleMass: number): { tension: number; dir: Vec3; stretch: number }
// W5, pure: the new length.
export function reelLength(length: number, reel: -1 | 0 | 1, atCap: boolean): number
export interface Winch {
  state(): CableSnapshot;
  // Interact outcomes (called by the world's interact resolution).
  take(playerId: string): void;            // from the bumper or the ground → held
  attach(anchorId: string): void;          // held → attached; length = current distance mount→attach point
  detach(playerId: string): void;          // attached → held by that player
  release(): void;                         // attached → stowed (at the winch box)
  drop(at: Vec3): void;                    // held → ground (W2)
  stow(): void;                            // any → stowed
  // Tick step 2: forces and reel. `reel` per W5; returns whether the attached obstacle (if any) is taut.
  applyForces(reel: -1 | 0 | 1): { tautObstacle: string | null };
  // Tick step 4: hook follows its holder (W9) and the length checks.
  afterCharacters(holdPose: (playerId: string) => Pose | null): void;
  // An obstacle was reset by the kill plane: detach and stow if it held the hook.
  onPropReset(propId: string): void;
}
export function createWinch(rapier: Rapier, physics: RapierWorld, vehicle: Vehicle, props: Props, course: BuiltCourse): Winch
export function anchorPoint(id: string, course: BuiltCourse, props: Props): Vec3 | null   // W3; a static anchor id or a heavy prop id
```

Anchor ids: static anchors use their course id; obstacle anchors use the prop id.

### `interact.ts`

`InteractAction` gains `{ kind: 'attachHook'; anchorId: string }`, `{ kind: 'dropHook' }`, `{ kind: 'takeHook' }`, `{ kind: 'detachHook' }`, `{ kind: 'releaseHook' }`. `resolveInteract` context gains `holdsHook: boolean` (true when `hands === 'hook'`) and `attachCandidates: InteractCandidate[]` (attachHook actions with angles). Priority: exit seat; attach (holding the hook, smallest angle among anchors in range); release what is in the hands (`throw` for a prop, `dropHook` for the hook); then the smallest angle among takeHook (stowed: winch box in range; ground: hook in range), pickUp, detachHook (attached: attach point in range), releaseHook (attached: winch box in range), board. Ties: board, takeHook, detachHook, releaseHook, then props in course order. `interactCandidates` takes the cable snapshot and the anchors (static and obstacle attach points) and returns these candidates; the client hint uses it too (texts: `E to attach the hook`, `E to drop the hook`, `E to take the hook`, `E to unhook`, `E to release the hook`).

### `player.ts`, `world.ts`

- `PlayerState.hands` is `'hook' | string | null`. Prop ids never equal `'hook'`: `createProps` throws on it, as on `'vehicle'`.
- Boarding while holding the hook stows it (inside `setSeat`, like K5). Respawn from the kill plane stows it. `removePlayer` while holding drops it at the feet (W2). `teleportPlayer` keeps it.
- The world creates the winch after props and players; tick order: (1) interact, (2) pushes, then `winch.applyForces(reel)` and W7's unlock, then vehicle drive, (3) physics, (4) characters, held props, `winch.afterCharacters`, (6) kill planes with `winch.onPropReset` for reset props.
- `WorldSnapshot` gains `cable: CableSnapshot`.

### `protocol.ts`

`SnapshotMessage.cable` (from `WorldSnapshot`). `parseServerMessage` rejects a snapshot without a valid `cable` (state one of the four, `holderId` and `anchorId` string or null, `hookPos` Vec3, `length` finite, `reel` −1, 0 or 1), and accepts `hands: 'hook'` (already a string).

### Client

- `net/snapshotBuffer.ts`: `cable` copied; `sample` interpolates `hookPos` and `length` when both snapshots have the same state, otherwise takes the newer.
- `render/winchMesh.ts` (new): `createWinchMesh(): THREE.Group` holding a hook (small box) and a rope (a `THREE.Line` of two points); `placeWinchMesh(group, mount: Vec3, hook: Vec3, visible: boolean)`. The mount is the drawn vehicle's winch mount; the hook is at `hookPos`, or at the holder's drawn hold pose when held (local player predicted), or at the mount when stowed (rope hidden).
- Overlay: a line `cable    <state> <length 1 decimal> m` and the new hint texts.
- Input: `reel` from Q (in, 1) and R (out, −1) already exists; nothing to change.

## Behaviour rules

- C1. W1 tension; the vehicle and an obstacle receive equal and opposite impulses; a static anchor receives nothing.
- C2. While attached and not at the cap, reel in shortens the cable at `WINCH_REEL_SPEED`; at the cap it does not shorten; never below `WINCH_MIN_LENGTH` or above `WINCH_MAX_LENGTH`.
- C3. Held: no force. Pays out freely; W9 beyond the maximum.
- C4. Ground: no force; picked up by interact in range; stowed by reel in (W6) or by W9.
- C5. Attaching sets `length` to the current mount-to-attach-point distance; attaching needs that distance at most `WINCH_MAX_LENGTH`.
- C6. Interact at the attach point (attached) detaches into that player's hands (empty hands needed); interact at the winch box (attached) releases and stows.
- C7. The driver's non-zero reel wins over a player at the box (W5).
- C8. An obstacle reset by the kill plane while the hook is attached to it: the hook is stowed.
- C9. A seated passenger's reel does nothing; a driver's reel works in every cable state per W5/W6.

## Tasks

Each task: tests first, then code; then a Sonnet review. Run `npm test` and `npm run typecheck` before each commit. Every earlier test passes unchanged unless named.

### Task 1 — cable maths and the winch module (`shared`)
Files: `constants.ts`, `winch.ts` (new), `winch.test.ts` (new), `props.ts` (`anchor` field use, `'hook'` id refused), `props.test.ts`, `courses/testGround.ts` (W10), `courses/testGround.test.ts`.
Tests: (1) `cableTension`: slack gives 0; stretch gives `k·stretch` with ends at rest; capped at `cap`; a closing rate lowers tension, an opening one raises it; never negative; (2) `reelLength` in/out/0, at cap, min and max; (3) a `createWinch` on a rig (vehicle on flat road, anchor 10 m ahead): attach sets the length to the distance; reeling in for 3 s pulls the vehicle more than 2 m toward the anchor; the applied force never exceeds the cap (measure the vehicle's acceleration × mass in the cable direction, allowing rolling resistance); (4) anchor points: static and barrier (top centre, moving with the barrier); (5) test ground: the three anchors exist, `anchor-2` lies on the steep slope's surface within 0.05 m, `anchor-3` is 10 m beyond the patch.
Commit: `feat(shared): the winch cable`.

### Task 2 — hook in the hands and interact (`shared`)
Files: `interact.ts`, `interact.test.ts`, `player.ts`, `world.ts`, `world.test.ts` (or `winch.test.ts` for world-level cases), `protocol.ts` (`cable` in the type only).
Tests: (1) priority and ties per the interact section; (2) a player beside the bumper takes the hook; the snapshot shows `hands: 'hook'`, cable `held`; (3) walking 10 m away keeps it held, `hookPos` at the hold pose; (4) interact with no anchor in range drops it: `ground`, `hookPos` on the ground below; (5) interact beside the ground hook takes it again; (6) beside `anchor-1` (vehicle placed within 25 m via a course override or by teleporting the player and parking the vehicle with `debugBody`) interact attaches: `attached`, `anchorId 'anchor-1'`, `length` equals the distance within 1e-3; (7) carried to 26 m from the mount the hook leaves the hands and is stowed on that tick (W9); (8) a ground hook 26 m away (vehicle moved with `debugBody`) is stowed; (9) detach at the anchor gives the hook to that player; release at the winch box stows; (10) boarding while holding stows; respawn stows; `removePlayer` drops; (11) an interact by a player holding a crate never takes the hook (throws first).
Existing tests changed: `interact.test.ts` (new context fields), callers of `interactCandidates` (`overlay.ts`, `world.ts`).
Commit: `feat(shared): carry and attach the winch hook`.

### Task 3 — reel, obstacles and scenarios (`shared`)
Files: `world.ts`, `winch.ts`, `push.ts` or `world.ts` (W7), `winch.test.ts`, `scenarios.test.ts`, `vehicle.test.ts` (carried RV sand row).
Tests: (1) W5 reel: the driver reels in; a player at the box reels when no driver reels; the driver's input wins when both reel; a passenger's reel does nothing; a player out of range of the box does nothing; (2) W6: reel in with the hook on the ground stows it; (3) a barrier attached and reeled with the vehicle braked (driver holding Space) is dragged toward the vehicle more than 1 m in 10 s; with the cable slack it stays locked; (4) C8: the barrier reset by the kill plane stows the hook; (5) the cap: attached to a static anchor 10 m ahead with the vehicle braked by its driver (Space held) and reel in held, the cable does not shorten while the tension is at the cap (length stays within 0.02 m over 2 s while the tension equals the cap). Scenarios (both vehicles, using `anchor-2`): (6) each vehicle starting 8 m up the steep slope, braked by nobody, with the hook attached to `anchor-2` and reel in held by the driver, reaches 30 m along within 30 s; (7) during that climb and after a 5 s braked stall then release, the vehicle's speed never exceeds 1.5 m/s and its spin never exceeds 0.5 rad/s; (8) a test tying stiffness to reel speed (carried row): at the planned constants the spring alone reaches the cap at a stretch greater than twice one tick of reel travel (`cap / k > 2 · WINCH_REEL_SPEED · TICK_DT`); (9) carried rows: the 25 m maximum length (attach refused beyond it, reel out stops at it) and the test ground's anchors; (10) the RV from rest on the sand patch with the hook on `anchor-3`, reeling in and full throttle, leaves the patch's −Z edge within 40 s (F6 carried row). If any scenario fails with the planned constants, stop and report with measurements; do not retune.
Commit: `feat(shared): reel the winch and drag obstacles`.

### Task 4 — protocol, client drawing, overlay (`shared`, `client`)
Files: `protocol.ts`, `protocol.test.ts`, `client/src/net/snapshotBuffer.ts` and its test, `client/src/render/winchMesh.ts` (new), `client/src/game.ts`, `client/src/ui/overlay.ts`, `overlay.test.ts`, `client/src/render/scene.ts` (static anchors drawn with a marked post: keep the existing post, add a white band at `ANCHOR_HEIGHT`).
Tests: parse accepts a valid `cable` and rejects each bad field; the buffer interpolates `hookPos` within one state and takes the newer across a state change; overlay lines and hints. Drawing is not unit-tested (say so).
Commit: `feat(client): draw the winch hook and rope`.

### Task 5 — browser test and documents
Files: `e2e/smoke.spec.ts`, `ROADMAP.md`, the spec.
Smoke: the overlay shows `cable    stowed` and the page has no errors (walking to the bumper by keys is not reliable). ROADMAP: step 6 → `done`; delete the step-6 carried rows; log W1–W10; update "Runnable today" (Q reel in, R reel out; E at the bumper takes the hook); known issues. Spec: W8 amendments, the interact priority list gains drop/attach wording if needed.
Run: `npm test`, `npm run typecheck`, `npm run build`, the smoke test (desktop, `npx playwright test -c e2e.local.config.ts --trace off`).
Commits: `test(e2e): the cable is shown`, `docs(roadmap): record step 6`.

## What the owner checks by hand
How winching feels, the rope's look, reaching anchors, dragging the barrier.

## Known risks to watch in review
- Impulses on the obstacle while it is locked (W7 must unlock first, in the same tick, before the impulse).
- The hook's hold pose on the server and the client must agree (`holdPoseAt`).
- Determinism: the reel source and interact contention in join order.
