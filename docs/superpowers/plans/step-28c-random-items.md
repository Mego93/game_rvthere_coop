# Step 28c: random item drops (items that appear as you approach)

This plan fixes names, rules and test cases. Implementers write the tests first. Where the plan and the spec disagree, or neither answers a question, stop and report. All numbers are starting values (feel is the owner's); the step ends at `needs sign-off`. It reuses the step 28b director pattern (`ambient.ts`, `routeAlong.ts`, the `ambient` world option) and the world's existing `items.drop` and `items.take`.

## Decisions already taken (owner, 2026-11-15) and rulings (2026-11-17)

- The owner asked for items and bonuses that spawn at random positions along the course, seeded per run, "same thing" as the animals (appear when close).
- Ruling: the course's fixed pickups stay (the fuel and repair guarantees of steps 16 to 27 depend on them). On top of them a director drops **bonus items** (jerrycan, toolbox, health kit) beside the road ahead of the vehicle, so the road feels alive and a missed stop has a second chance. Coins stay fixed (their positions are course data the client already has; moving them would need a snapshot list: out of scope).
- Ruling: the seed is per run: `hashSeed(courseId) XOR runSeed`, where `runSeed` is the room's run counter (the first run of a room is run 1, a retry is run 2, and so on), so two runs of the same room differ and tests can pass a fixed seed.
- Ruling: drops never replace a course pickup: they keep 40 m away from any course pickup, stop, hazard, terrain, hill or pit (the animal plan's blocked spans plus the pickups), and from each other by 150 m.
- Ruling: kind mix by need, not blind chance: 45 % jerrycan, 25 % toolbox, 30 % health kit; but at least one jerrycan in every three consecutive drops (the plan builder enforces it), because the RV burns about half a tank per km.

## Rules

R1. **Plan** (`packages/shared/src/itemDrops.ts`, new, pure; reuse `mulberry32`, `hashSeed`, `eligibleSpans` from `ambient.ts`): `planItemDrops(seed, routeLength, blocked, pickupAlongs): ItemDropEvent[]` with `ItemDropEvent = { id: number; along: number; side: -1 | 1; lateral: number; kind: ItemKind }`. One drop about every `ITEM_DROP_SPACING` (400 m) of eligible route (jittered by `ITEM_DROP_JITTER`, 60 m), never inside a blocked span or within `ITEM_DROP_PICKUP_CLEAR` (40 m) of an existing pickup, at least `ITEM_DROP_MIN_GAP` (150 m) apart; `lateral` is `ROAD_WIDTH / 2 + 1.5` on the event's side (on the shoulder, off the lane); kind drawn from the mix with the jerrycan rule. No `Math.random`, no Map or Set iteration.
R2. **Director** (`itemDrops.ts`, pure): `createItemDirector(plan)` and `stepItemDirector(state, { vehicleAlong, existing }): { drop: ItemDropEvent[]; forget: number[] }` where `existing` is the set of live drop ids still in the world (an item that was picked up, killed by the kill plane or lost to a checkpoint restore is forgotten). Drop when the vehicle is within `ITEM_DROP_AHEAD` (150 m) before an unfired event and fewer than `ITEM_DROP_MAX_ALIVE` (6) drops are alive. Remove an unclaimed drop (call `items.take`) when the vehicle is more than `ITEM_DROP_BEHIND` (100 m) past it. `rearm(state, vehicleAlong)`: events within `AMBIENT_REARM_CLEAR` (60 m) ahead of the vehicle or behind it stay fired, later ones re-arm (restart, fall-respawn, skip).
R3. **World integration** (`world.ts`): `WorldOptions.itemDrops?: boolean` (default off) and `WorldOptions.itemSeed?: number`; with `itemDrops` on, the world builds the plan from `course.ambient.blocked` (the same spans as the animals) and the pickup positions, and each tick before the physics step runs the director and calls `items.drop(kind, at)` with `at` from `routeIndex.pointAt` and a downward ground ray (the animals' method) then records the returned id in the director's live set. The item ids are `item-N` (the existing counter), so every existing item rule applies (pick up, drop, kill plane removes dropped items, the snapshot lists them in `items`). A taken or killed drop is forgotten by the director through `existing`. Restart, checkpoint restore and `skipCheckpoint` call `rearm`; `items.restore` recreates the recorded items, and a drop that the restore does not list is simply forgotten (test it). Bonus drops are bounded: at most `ITEM_DROP_MAX_ALIVE` drops alive, and the full-snapshot rule (an item id appearing or vanishing makes the next broadcast full) costs one full snapshot per drop or removal, about one every 25 s of driving at 15 m/s: measure the bandwidth in T8.
R4. **Room**: `createRunWorld` passes `itemDrops: course.ambient !== undefined` and `itemSeed: hashSeed(course.id) ^ runNumber` where `runNumber` starts at 1 and increases with each run started in the room (restart of a run keeps its number; a retry from results or a new run increments it); the worker goes through the same code. A different `runNumber` gives a different layout.
R5. **Client**: nothing new is needed for drawing (items already come in the `items` snapshot list and are drawn by kind); a one-line HUD toast "Supplies ahead" is out of scope. Existing item meshes, pickup prompts and the minimap markers (check whether the minimap draws items from the snapshot) behave as for any item.
R6. **Constants**: `ITEM_DROP_SPACING` 400, `ITEM_DROP_JITTER` 60, `ITEM_DROP_PICKUP_CLEAR` 40, `ITEM_DROP_MIN_GAP` 150, `ITEM_DROP_AHEAD` 150, `ITEM_DROP_BEHIND` 100, `ITEM_DROP_MAX_ALIVE` 6, `ITEM_DROP_MIX` { jerrycan 0.45, toolbox 0.25, healthKit 0.30 }, each with a one-line unit comment.

## Tests (numbered)

T1. `planItemDrops`: deterministic for a seed and different for another seed; spacing and gaps hold; none in a blocked span or within 40 m of a pickup; every drop on the shoulder side; kind mix within 10 % over the real `marrakech` plan; every window of three consecutive drops holds a jerrycan; the count is within 10 % of eligible length / 400 (measure it on `marrakech` and put the number in the test).
T2. Director: drop at 150 m ahead and not before; the maximum alive holds (a capped event fires later if the vehicle is still before it); a picked-up or killed drop is forgotten and its slot frees; removal at 100 m behind through `items.take`; `rearm` semantics (60 m); two directors fed the same inputs have equal state.
T3. World: with `itemDrops` on and an explicit plan (a test option `itemPlan` or a built straight course), the item appears in `world.snapshot().items` at the right place, on the ground and off the lane; a player can pick it up like any item; a restart or `skipCheckpoint` with a live drop does not throw and the director stays consistent with `items.restore`; two worlds with the same seed have equal snapshots over 20 s; with the default (off) nothing changes and every existing test passes.
T4. Interaction with fixed pickups: the course pickup set is unchanged (ids, positions) with the drops on; a drop never overlaps a course pickup.
T5. Room: two runs of the same room (the second after a retry) get different drop layouts; the same run number in two rooms gives the same layout; results, stars and final time rules are unchanged.
T6. Fuel economy: a scripted RV drive of the worst fuel gap on `marrakech` with the drops on and one jerrycan picked (a teleport of the picker is allowed) leaves more fuel than without it (a sanity test that the bonus helps; the gap figures of step 27 stay the baseline).
T7. Snapshot size: the `marrakech` full snapshot with 6 players, 9 animals and the maximum drops alive stays under 26 KB (state the measured number; the step 28b limit was 25 KB with no drops and 24.8 KB measured: if the real figure is over 25 KB, raise the asserted limit and record it in the ROADMAP; each drop is about 150 bytes).
T8. Performance (a measure test): the director adds under 0.1 ms per tick; the plan builds in under 50 ms; the full-snapshot rate caused by drops is at most one per 10 s of driving at 15 m/s (computed from the plan).

## Existing tests that change

- Tests that enumerate `WorldOptions` or snapshot items are unaffected (the option is off by default). `animals.world.test.ts` and the room ambient test may need the new option left off; nothing else changes.
- The step 28b size test (24,789 bytes, limit 25 KB) is kept as is with drops off.

## Tasks

1. **Plan and director, pure** (R1, R2, R6, T1, T2).
2. **World and room integration** (R3, R4, T3 to T6, T8).
3. **Size, docs and checks** (T7), `ROADMAP.md`, the spec (a paragraph after Animals), every check.

Review after each task by a Sonnet reviewer; Opus reviews the plan and the whole branch when the weekly limit resets (Nov 19); the standing owner request is to merge at the end of each step.

## Out of scope

Random coins, random positions for the course's fixed pickups, new item kinds, a supply HUD toast, per-kind prices, parkour (28d).
