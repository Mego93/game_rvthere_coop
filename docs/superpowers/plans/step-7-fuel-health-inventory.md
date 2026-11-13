# Step 7: Vehicle fuel, health and damage; inventory; jerrycans and toolboxes; hold actions

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md` (sections "Vehicles" (common rules), "Hands and inventory", "Hold actions", "Collision", "Interact resolution", "Snapshot", "Protocol" (input `use`, `slot`, `drop`)). This plan fixes interfaces, constants, rules and test cases. Implementers write the tests first, then the code. Where the plan and the spec disagree, or neither answers a question, stop and report (CLAUDE.md, "When something is not specified").

## Goal

The vehicle has fuel and health. Fuel drains with throttle and an empty tank disables drive. Health drops on hard impacts and while upside down. Players carry up to three items: jerrycans and toolboxes lie on the test ground, interact picks one up into the first free slot, 1–3 select a slot, G drops the selected item, and holding F for 3 s beside the vehicle uses it (+50% fuel or +50% health). The page draws the items and shows fuel, health, slots and hold progress in the debug overlay.

Not in this step: vehicle loss at 0 health and checkpoint restarts (8), health kits and player health (9), pumps and workbenches (10), events (9), the real HUD (12).

## Decisions made in this plan (log them in `ROADMAP.md` in the last task)

I1. Fuel and vehicle health are fractions in [0, 1]; the page shows them as percentages. Both start at 1.
I2. Fuel burn per vehicle config: `fuelBurn`, the fraction of a full tank per second at full throttle (Lodgy `1/240`, RV `1/160`, about 1.5 times). Each tick `fuel −= |throttle| · fuelBurn · TICK_DT`, where `throttle` is the driver's clamped input, also in reverse. At 0 fuel the drive force is zero (braking and steering still work) and nothing burns.
I3. Impact detection: each tick after the physics step, `jolt = |v − vPrev − g·TICK_DT|` with `g = (0, −GRAVITY, 0)` and `v` the chassis linear velocity. Consecutive ticks with `jolt > VEHICLE_JOLT_FLOOR` form one impact whose size is the sum of their jolts; when a tick falls back to or below the floor, an impact larger than `VEHICLE_IMPACT_SPEED` costs `(size − VEHICLE_IMPACT_SPEED) · VEHICLE_IMPACT_DAMAGE` health. The floor keeps driving, braking, suspension and the resting jitter (carried row: about −0.06 m/s vertical at rest, a jolt below 0.01 m/s per tick) from counting.
I4. Upside down: while the chassis up vector's Y is below 0, health drains by `VEHICLE_UPSIDE_DOWN_DRAIN` per second.
I5. Health clamps at 0 and nothing else happens at 0 until step 8.
I6. Items are a table `ITEM_KINDS` in `constants.ts` (kind → half extents, mass, friction). An item in the world is a dynamic box that collides with static geometry only: a new collision group `GROUP_STATIC` is given to ground and wall colliders; an item's collider is `groups(GROUP_ITEM, GROUP_STATIC)` and the statics' filter gains `GROUP_ITEM`. Players, the vehicle, props and the hook ignore items. Items appear in the snapshot's `props` list with their item kind; the predictor skips them (their kinds are not in `PROP_KINDS`).
I7. Course pickups keep their course ids; a dropped item gets the id `item-N` from a world counter starting at 1. Picking an item up removes its body. The room sends a `full` snapshot to every client on any tick where the set of prop and item ids changed, so pages drop removed items (F11 gains this case).
I8. Using an item is a hold action of `HOLD_DURATION`. It binds at the press of `use` to the selected slot's item and its target; a jerrycan's target is the vehicle in `USE_RANGE` (feet to the nearest point of the vehicle's box) with fuel below 1; a toolbox's is the vehicle in range with health below 1. With no valid target the press does nothing.
I9. A hold resets when `use` is released, the target stops being valid or leaves range, the selected slot changes or its item changes, the player is seated or teleported (respawn included). On completion the effect applies (`+ITEM_REFUEL` or `+ITEM_REPAIR`, clamped to 1), the item is consumed, and the hold ends; a new hold needs a new press.
I10. Drop (`drop` pressed, on foot): the selected slot's item leaves the inventory and appears at `feet + (0, DROP_HEIGHT, 0)` at rest. A seated player cannot drop.
I11. `removePlayer`: inventory items drop at the first valid spawn slot (`findSpawn`), stacked `DROP_HEIGHT` apart upward. Respawn keeps the inventory.
I12. Interact (priority 5) gains `pickUpItem` candidates: unheld items within `HANDS_RANGE` of the feet (nearest point of the box), only with a free slot; angle as for props; ties after props, items in id order (course pickups in course order, then dropped items by counter).

## Constants (`constants.ts`, block "Fuel, health and items")

| Name | Value | Meaning |
|---|---|---|
| `VEHICLE_JOLT_FLOOR` | 0.5 | m/s per tick; a smaller jolt is not part of an impact |
| `VEHICLE_IMPACT_SPEED` | 4 | m/s; impacts up to this cost nothing |
| `VEHICLE_IMPACT_DAMAGE` | 0.04 | health per m/s above the threshold |
| `VEHICLE_UPSIDE_DOWN_DRAIN` | 0.02 | health per second while upside down |
| `HOLD_DURATION` | 3 | s |
| `USE_RANGE` | 2 | m, feet to the nearest point of the vehicle's box |
| `ITEM_REFUEL` | 0.5 | fuel added by a jerrycan |
| `ITEM_REPAIR` | 0.5 | health added by a toolbox |
| `DROP_HEIGHT` | 0.3 | m above the feet where a dropped item appears |
| `ITEM_KINDS` | see below | per kind: `halfExtents`, `mass`, `friction` |

| Kind | halfExtents | mass | friction |
|---|---|---|---|
| `jerrycan` | (0.12, 0.25, 0.2) | 20 | 0.8 |
| `toolbox` | (0.25, 0.12, 0.12) | 10 | 0.8 |

`ItemKind = keyof typeof ITEM_KINDS`. Vehicle configs gain `fuelBurn`: Lodgy `1/240`, RV `1/160`.

Arithmetic: a full tank lasts 240 s (Lodgy) and 160 s (RV) at full throttle. Hitting a wall at 15 m/s stops the chassis over a few ticks with jolts far above the floor: size ≈ 15, damage ≈ 0.44. Full braking from speed is `12000 / 1500 = 8 m/s²`, 0.13 m/s per tick, under the floor.

## Test ground additions

```
pickups: [
  { id: 'jerrycan-1', kind: 'jerrycan', pose: { pos: (-4, 0, 14), rot: IDENTITY } },
  { id: 'jerrycan-2', kind: 'jerrycan', pose: { pos: (-3, 0, 14), rot: IDENTITY } },
  { id: 'toolbox-1',  kind: 'toolbox',  pose: { pos: (-2, 0, 14), rot: IDENTITY } },
]
```

Pose as for props: the centre of the box's bottom face. `testGround.test.ts`: kinds in `ITEM_KINDS`, ids unique across props, pickups and anchors, each resting on ground.

## Modules and signatures

### `groups.ts`
`GROUP_STATIC = 0x0008`, `GROUP_ITEM = 0x0010`. `statics.ts`: ground is `groups(GROUP_WORLD | GROUP_GROUND | GROUP_STATIC, GROUP_WORLD | GROUP_ITEM)`, walls `groups(GROUP_WORLD | GROUP_STATIC, GROUP_WORLD | GROUP_ITEM)`. Every other collider is unchanged.

### `items.ts` (new)
```ts
export interface ItemEntity { id: string; kind: ItemKind; body: RigidBody }
export interface Items {
  all(): ItemEntity[];                      // course pickups in course order, then dropped by counter
  get(id: string): ItemEntity | undefined;
  take(id: string): ItemKind | null;        // removes the body; null if absent
  drop(kind: ItemKind, at: Vec3): string;   // new body at rest at `at` (box centre = at + half.y), returns `item-N`
  snapshot(): PropSnapshot[];               // { id, kind, pos (box centre), rot }
  dispose(): void;
}
export function createItems(rapier: Rapier, physics: RapierWorld, course: BuiltCourse): Items
```
Items fall below the kill plane? They collide with statics only, so they rest; one below the kill plane returns to its spawn if it is a course pickup and is removed if dropped (J1 extended; test it).

### `holds.ts` (new)
```ts
export interface Hold { action: 'useItem'; targetId: 'vehicle'; slot: 0 | 1 | 2; item: ItemKind; progress: number }   // progress 0..1
export function useTarget(item: ItemKind | null, feet: Vec3, vehicle: { pos: Vec3; rot: Quat; half: Vec3; fuel: number; health: number }): 'vehicle' | null   // I8, pure
// One tick of a player's hold: returns the new hold (or null) and whether it completed this tick.
export function stepHold(hold: Hold | null, input: { usePressed: boolean; useHeld: boolean; slot: 0 | 1 | 2 }, inventory: readonly (ItemKind | null)[], target: 'vehicle' | null, seated: boolean): { hold: Hold | null; completed: Hold | null }
```
`stepHold` is pure: it starts on a press with a valid target, advances by `TICK_DT / HOLD_DURATION`, resets per I9 (teleport resets are done by the world clearing the hold), and returns `completed` on the tick progress reaches 1.

### `vehicle.ts`
`VehicleState` gains `fuel: number; health: number`. `Vehicle` gains `fuel()`, `health()`, `addFuel(amount)`, `repair(amount)` (both clamp to [0, 1]), and `afterPhysics(): void` (I3 and I4, called at tick step 5). Drive uses I2. `createRig` vehicles behave as before when fuel is full (every existing vehicle and scenario test passes unchanged, except the fuel scenario below).

### `player.ts`, `world.ts`
- `PlayerState` gains `inventory: [ItemKind | null, ItemKind | null, ItemKind | null]`, `slot: 0 | 1 | 2`, `hold: Hold | null`.
- World tick: (1) interact (with `pickUpItem`), drop, slot select (`slot` from input every tick), hold step and completion; (2) pushes, cable, drive with fuel; (3) physics; (4) characters; (5) `vehicle.afterPhysics()`; (6) kill planes for players, props and items.
- Teleport, respawn and seating clear the hold.
- `WorldSnapshot.props` includes items (after props). `PlayerSnapshot` gains `inventory`, `slot`, `hold: { action, targetId, progress } | null`.

### `interact.ts`
`InteractAction` gains `{ kind: 'pickUpItem'; itemId: string }`. `interactCandidates` ctx gains `items: readonly PropSnapshot[]` (item kinds only) and `freeSlot: boolean`. Hint text `E to pick up the jerrycan` / `the toolbox`.

### `protocol.ts`
`VehicleState` checks gain finite `fuel` and `health`; player entries check `inventory` (array of 3, each null or a known item kind… or any string, kept for newer servers: accept strings), `slot` 0–2, `hold` null or `{ action: string, targetId: string, progress: finite }`.

### `server/src/room/room.ts`
I7: when the set of ids in `snapshot.props` differs from the previous broadcast's, every client gets `full: true` with all props.

### Client
- `render/propMesh.ts`: jerrycan (red box) and toolbox (blue box) sized from `ITEM_KINDS`.
- Overlay: `fuel     NN%   health NN%`, `slots    [jerrycan] - toolbox` (selected in brackets, empty `-`), `hold     NN%` while holding; hints `Hold F to refuel` / `Hold F to repair` when `useTarget` is valid for the selected item, after the interact hint.
- Input: 1–3, G and F already exist in the keyboard source; nothing to change.

## Behaviour rules
- U1. I2 fuel. U2. I3 impacts, I4 upside down, I5. U3. I6–I7 items. U4. I8–I9 holds. U5. I10 drop, I11 remove. U6. I12 interact.
- U7. Picking up puts the item in the first free slot; with none free it is not a candidate.
- U8. Two players pressing for one item on one tick: the earlier in join order gets it.

## Tasks

Each task: tests first, then code; then a Sonnet review. Run `npm test` and `npm run typecheck` before each commit. Every earlier test passes unchanged unless named.

### Task 1 — fuel and vehicle health (`shared`)
Files: `constants.ts`, `vehicles.ts`, `vehicle.ts`, `vehicle.test.ts`, `scenarios.test.ts`, `world.ts` (afterPhysics at step 5; snapshot fuel/health), `protocol.ts` (VehicleState type only), and every `VehicleState` literal in tests (`protocol.test.ts`, `snapshotBuffer.test.ts`, `overlay.test.ts`, `predictor.test.ts` if any — grep).
Tests: (1) fuel drains at `fuelBurn · |throttle|` per second (half throttle half rate; reverse burns; zero throttle none); (2) at 0 fuel full throttle does not move the vehicle from rest (< 0.05 m in 3 s) and steering/braking still work while coasting; (3) `addFuel`/`repair` clamp; (4) at rest on flat ground for 10 s health stays 1 (both vehicles); driving 100 m on road at full throttle and braking to a stop: health stays 1; (5) driving into a wall (via `withBoxes`) at full throttle from 30 m costs health, and from 60 m costs more (the faster impact); a 2 m/s roll into the wall costs nothing; (6) upside down (rolled 180° about Z, at rest) for 10 s loses `10 · VEHICLE_UPSIDE_DOWN_DRAIN` within 0.01; (7) health never below 0. Scenario: (8) a full tank lasts 240 ± 2 s (Lodgy) and 160 ± 2 s (RV) at full throttle while circling (steer 1) on the test ground.
Commit: `feat(shared): vehicle fuel, health and impact damage`.

### Task 2 — items and the inventory (`shared`)
Files: `groups.ts`, `statics.ts`, `items.ts` (new), `items.test.ts` (new), `courses/testGround.ts` (+ test), `player.ts`, `world.ts`, `interact.ts` (+ test), `protocol.ts` (types), the `PlayerSnapshot` literals named in Task 1's grep.
Tests: (1) items rest on the ground; the vehicle drives through an item without moving it (item displacement < 0.01 m and the vehicle's speed unchanged within 0.1 m/s); a player walks through one; (2) interact beside a jerrycan picks it up into slot 0; the next item goes to slot 1; with three items no candidate (interact boards or does nothing); (3) slot selection follows input; (4) drop puts the selected item at the feet as `item-1`, then `item-2`; a seated player cannot drop; (5) two players, one item, one tick: the earlier gets it; (6) `removePlayer` drops their items at a spawn slot; (7) a dropped item below the kill plane is removed; a course pickup below it returns to its spawn; (8) the snapshot lists items in `props` after props, and the player's `inventory` and `slot`.
Commit: `feat(shared): items and the inventory`.

### Task 3 — holds and item use (`shared`)
Files: `holds.ts` (new), `holds.test.ts` (new), `world.ts`, `player.ts`.
Tests: unit `stepHold`/`useTarget` for every I8–I9 case; world: (1) a player beside the vehicle with fuel 0.3 holding F for 3 s with a jerrycan: fuel 0.8, the jerrycan gone, `hold` null; (2) released at 2 s: nothing; (3) walking out of range resets; (4) a full tank: the press does nothing; (5) toolbox with health 0.4 → 0.9; (6) switching slots mid-hold resets; (7) boarding mid-hold resets; (8) after completion, holding F does not start another (a fresh press does); (9) the snapshot shows `hold.progress` rising.
Commit: `feat(shared): hold actions and item use`.

### Task 4 — protocol, room, client
Files: `protocol.ts`, `protocol.test.ts`, `server/src/room/room.ts`, `room.test.ts`, `client/src/net/snapshotBuffer.ts` (copy the new player and vehicle fields) and test, `client/src/render/propMesh.ts`, `client/src/ui/overlay.ts`, `overlay.test.ts`, `client/src/game.ts`.
Tests: parse accepts and rejects the new fields; room: picking up an item makes the next snapshot full for every client and the item is absent; overlay lines and hints.
Commit: `feat(client): show fuel, health, slots and items`.

### Task 5 — browser test and documents
Smoke: the overlay shows `fuel     100%` and three empty slots; no page errors. ROADMAP: step 7 → `done`; delete the step-7 carried row; log I1–I12; "Runnable today"; known issues. Spec: nothing to amend unless an implementation forced it.
Commits: `test(e2e): fuel and slots are shown`, `docs(roadmap): record step 7`.

## What the owner checks by hand
Fuel feel, crash damage amounts, item meshes, the hold timing.

## Known risks to watch in review
- I3 on ramps and kerbs: a landing must not cost health unless hard; the floor and threshold are starting values (feel is the owner's).
- Removing an item's body while a snapshot refers to it; the full-snapshot rule.
- Collision groups: no existing collider may change behaviour (every earlier test is the check).
