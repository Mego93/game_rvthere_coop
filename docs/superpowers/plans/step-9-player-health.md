# Step 9: Player health, damage, downed state, health kits, revival and respawn

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`. The sections are:
- "Player health"
- "Hands and inventory" (the health kit rows)
- "Hold actions"
- "Checkpoints and restarts" (player health and late joiners)
- "Snapshot" (`health`, `downed`)
- "event" (`hurt`, `downed`, `revive`, `respawn`)
- "Client prediction" (off while downed)
- Testing, "player health" and "checkpoints"

ROADMAP carried row for step 9: a restart restores player health with the 50% floor, revives downed players, gives late joiners 100 health, with the spec's unit tests.

This plan fixes interfaces, constants, rules and test cases. Implementers write the tests first, then the code. Where the plan and the spec disagree, or neither answers a question, stop and report.

## Goal

Players have 100 health. Falls, the vehicle and fast props hurt them. At 0 they are downed. A teammate revives them with a health kit; otherwise they respawn after 30 s. Everyone downed means everyone respawns. A restart restores player health with a floor. The page shows health and the downed timer.

## Constants (`constants.ts`, block "Player health", after the "Fuel, health and items" block)

| Name | Value | Meaning |
|---|---|---|
| `PLAYER_MAX_HEALTH` | 100 | health of a new player and a late joiner |
| `PLAYER_REVIVE_HEALTH` | 50 | after a revive, a respawn (downed timeout, all downed, kill plane) |
| `PLAYER_RESTART_FLOOR` | 50 | a restart restores at least this |
| `DOWNED_TIMEOUT` | 30 | s before a downed player respawns |
| `FALL_DAMAGE_SPEED` | 9 | m/s landing speed that costs nothing; a jump lands at about 5, a fall from the RV's roof (about 3.5 m) at about 8.3 |
| `FALL_DAMAGE` | 10 | health per m/s above it |
| `VEHICLE_HIT_SPEED` | 5 | m/s relative speed that costs nothing |
| `VEHICLE_HIT_DAMAGE` | 8 | health per m/s above it |
| `PROP_HIT_SPEED` | 6 | m/s relative speed that costs nothing; a thrown crate leaves the hands at 7 |
| `PROP_HIT_DAMAGE` | 5 | health per m/s above it |
| `HIT_COOLDOWN` | 0.5 | s; one body hurts one player at most once in this time |
| `HEALTH_KIT_HEAL` | 50 | health added to a hurt player |
| `HEAL_RANGE` | 2 | m, feet to feet (3D), for a health kit on a teammate |
| `HEAL_AIM_ANGLE` | 0.35 | rad (about 20°); a teammate is near the crosshair when the angle between the aim and the direction from the eye to the teammate's centre is at most this |

All damage values are starting values for the owner to tune. Do not retune them.

`ITEM_KINDS` gains `healthKit: { halfExtents: vec3(0.18, 0.08, 0.14), mass: 2, friction: 0.8 }`.

## Rules

H1. **State.** `PlayerState` gains:
- `health: number`, in 0..100, starting at `PLAYER_MAX_HEALTH`;
- `downed: number | null`, the seconds left before respawn;
- `hitCooldown: Map<string, number>`, from body id to seconds left.

`teleport` and `setSeat` do not change `health` or `downed`.

H2. **Damage** (new module `health.ts`, pure). `damageAbove(speed, threshold, perUnit) = max(0, speed − threshold) · perUnit`. A damage of 0 does nothing and sends no event.

`hurt(player, amount)` applies only when all of these hold:
- the player is not seated;
- the player is not downed;
- `respawnIn` is null;
- the amount is > 0.

It then subtracts the amount, clamps the result at 0, and sends `{ kind: 'hurt', tick, playerId, pos }`. If health reaches 0, the player becomes downed (H5).

H3. **Fall.** In `move`, a tick that ends grounded after starting airborne is a landing. The landing speed is `max(0, −vy)`, using `vy` before the move resolved the contact. The player is hurt by `damageAbove(landing, FALL_DAMAGE_SPEED, FALL_DAMAGE)`.

None of these is a landing: `teleport`, `setSeat`, a respawn, the shove-out's move to a spawn slot, or `liftOntoTop`.

H4. **Hits.** A dynamic body hits a player in either of these cases:
- (a) shove-out finds the body overlapping the player, because the body moved into them;
- (b) the character controller's computed collisions in `move` include the body's collider.

The relative speed is the length of the body's velocity at the player's centre (`linvel + angvel × (centre − bodyCentre)`) minus the player's velocity (`walk + carry` horizontally, `vy` vertically).

The bodies that count:
- The vehicle: damage is `damageAbove(rel, VEHICLE_HIT_SPEED, VEHICLE_HIT_DAMAGE)`.
- A prop that is not held: damage is `damageAbove(rel, PROP_HIT_SPEED, PROP_HIT_DAMAGE)`. A prop a player stands on (its `ground`) does not hit that player.
- Items are not bodies that hit.

A hit applies only when `hitCooldown` has no live entry for that body; it then sets the entry to `HIT_COOLDOWN`, even when the damage was 0. Cooldowns count down by `TICK_DT` each tick and are deleted at ≤ 0.

H5. **Downed.** When a player becomes downed:
- `downed` is set to `DOWNED_TIMEOUT`.
- A held prop is released in place with zero velocity, through the existing release.
- A held hook drops to the ground, as interact with no anchor near does (W2).
- `hold` is cleared.
- `{ kind: 'downed', tick, playerId, pos }` is sent.

While downed:
- The player's input is replaced by neutral input: no walk, jump, interact, drop, use or slot change; `yaw` and `pitch` keep their last values.
- Gravity, shove-out, standing on bodies and the kill plane still apply.
- The player takes no damage and makes no push intents.
- Other players' interact never targets a downed player.

H6. **Downed timer.** Each tick, a downed player's `downed` goes down by `TICK_DT`, unless some player's live `hold` is a health-kit hold whose target is that player (H9). At ≤ 1e-9 the player respawns:
- placed by `findSpawn(id)` through `teleport`;
- `health = PLAYER_REVIVE_HEALTH`, `downed = null`;
- `respawns += 1`;
- `{ kind: 'respawn', tick, playerId, pos }` is sent.

H7. **Everyone downed.** After damage and the timers, if the world has at least one player and every player is downed:
- every player respawns as in H6, in join order, each counted;
- one `respawn` event is sent per player;
- a solo player therefore respawns on the tick they are downed.

A player with `respawnIn` set (below the kill plane) and not downed is not downed for this rule.

H8. **Kill plane.** The existing kill-plane respawn also sets `health = PLAYER_REVIVE_HEALTH` and `downed = null`, and clears `hitCooldown`. A downed player who falls below the kill plane respawns once, by the kill-plane rule, counted once; the downed timer stops while `respawnIn` is set.

H9. **Health kit.** It goes in the inventory like a jerrycan: picked up by interact, dropped by G, used by a 3 s hold.

`useTarget` becomes `useTarget(item, ctx): Target | null`, where `Target = 'vehicle' | string` (a player id). The context is:

```
ctx = {
  self: { id, feet, eye, aim, health },
  vehicle: HoldVehicle,
  players: { id, feet, centre, health, downed }[],
}
```

- `eye` is `feet + (0, PLAYER_HEIGHT · 0.9, 0)`.
- `aim` is the unit vector of `yaw`/`pitch`, the throw's aim.

For a health kit, the order is:
1. the downed teammate in `HEAL_RANGE` and within `HEAL_AIM_ANGLE` with the smallest angle;
2. otherwise the teammate in range, near the crosshair, with `health < PLAYER_MAX_HEALTH`, not downed, with the smallest angle;
3. otherwise `self.id` if `self.health < PLAYER_MAX_HEALTH`;
4. otherwise null.

Ties go to the earlier join order. Seated teammates are not targets.

The jerrycan and toolbox are unchanged.

H10. **Health kit holds.**
- `Hold.targetId` widens to `Target`.
- `stepHold`'s `seated` parameter is renamed `blocked`. The world passes `seated || downed`.
- While a hold runs, the world passes the bound target if it is still valid, else null. `holdTargetValid(hold, ctx)` decides:
  - the vehicle as now;
  - a downed teammate: still downed, in range and near the crosshair;
  - a hurt teammate: not downed, `health < 100`, in range and near the crosshair;
  - self: `health < 100`.
- A hold whose kind of target changes is not valid. For example, a revive whose target respawned or was revived by someone else ends.
- On completion:
  - A downed target gets `health = PLAYER_REVIVE_HEALTH`, `downed = null`, and `{ kind: 'revive', tick, playerId: target, pos }` is sent. The target stands where they lie.
  - A hurt target (a teammate or self) gets `min(100, health + HEALTH_KIT_HEAL)`.
  - In both cases the kit is consumed.

H11. **Record and restart** (the carried row).
- `CheckpointRecord.players` entries gain `health`.
- On a restart, each current player gets one of:
  - `health = max(recorded, PLAYER_RESTART_FLOOR)` when recorded;
  - `PLAYER_MAX_HEALTH` for a player absent from the record (a late joiner).
- Every player also gets `downed = null`, and `hitCooldown` cleared.
- No `revive` event is sent; the `vehicleLost` event covers it.
- A player who joins mid-run starts at `PLAYER_MAX_HEALTH`.

H12. **Order in the tick.** Inside `stepOnFoot`, falls and hits are found and stored as pending damage per player. The world applies them after `stepOnFoot`, in join order, with hits before falls, before the holds step. Then, in this order:
1. holds;
2. the downed timers (H6);
3. the everyone-downed rule (H7);
4. the existing kill plane.

The players module must not import world events. It returns damage as data, e.g. `takeDamage(): { playerId, source: 'fall' | 'vehicle' | 'prop', amount }[]`, cleared by the call like `takePushIntents`.

H13. **Snapshot.** `PlayerSnapshot` gains:
- `health: number`, the server's value rounded down to an integer;
- `downed: number | null`, in seconds.

The protocol parse checks that `health` is finite and in 0..100, and that `downed` is null or finite and ≥ 0.

H14. **Course.**
- `testGround` gains a pickup `healthKit-1` of kind `healthKit` at `(-2, 0, 14)`, next to the jerrycans.
- The segment demo's garage stop gets none. The demo course is unchanged.

H15. **Client.**
- Prediction is on only while the local player is unseated, has `ground` null and `downed` null. When `downed` is not null, the reconciler is suspended as for seated players.
- The overlay's `you` area gains a line `health   N`, and `DOWNED   Ns` while downed, the seconds rounded up.
- The players line shows each player's health after their name.
- The use hint for a health kit names its target: `use: revive <name>`, `use: heal <name>`, or `use: heal yourself`. The overlay uses `useTarget` with the same context, built from the snapshot.
- The downed look is the owner's to check by hand. The capsule stays upright; the mesh may be laid flat by rotating it 90° about its yaw-right axis while `downed` is not null.

## Modules and signatures

- `constants.ts`: the block above; `healthKit` in `ITEM_KINDS`.
- `health.ts` (new, pure):
  - `damageAbove`;
  - `relativeSpeed(bodyLinvel, bodyAngvel, bodyCentre, point, playerVel): number`;
  - `stepDowned(downed: number, paused: boolean): number | 'respawn'`;
  - `everyoneDowned(players: { downed: number | null }[]): boolean`.
- `player.ts`:
  - state fields (H1);
  - landing detection (H3);
  - hit detection (H4);
  - `takeDamage()` (H12);
  - neutral input while downed (H5);
  - `setDowned(id)`: release hands (the hook handled by the world) and set the timer;
  - `revive(id, health)`;
  - `respawn(id)`: findSpawn, teleport, health 50, downed null.
- `holds.ts`: `Target`, `useTarget(item, ctx)`, `holdTargetValid(hold, ctx)`, `stepHold(..., blocked)`.
- `world.ts`:
  - applying damage, the downed timer, everyone-downed, revive and heal completion, hook drop on downed, record and restore health, late joiner health;
  - events `hurt`, `downed`, `revive`.
- `checkpoints.ts`: the record's player health.
- `protocol.ts`: H13.
- `courses/testGround.ts`: H14.
- Client:
  - `game.ts`: the prediction gate;
  - `ui/overlay.ts`: lines and hints;
  - `render/`: the kit's mesh, a red box with a white cross on top, as other item meshes are made; the downed pose.

## Existing tests that change

- `holds.test.ts`: the `useTarget` and `stepHold` calls take the new context and the `blocked` name.
- `overlay.test.ts`: player literals gain `health` and `downed`; the use-hint tests pass the new context.
- `protocol.test.ts`: the player literal gains `health` and `downed`.
- `snapshotBuffer.test.ts`: the player builders gain `health` and `downed`.
- `e2e/smoke.spec.ts`: the props count goes from 7 to 8.
- Any test asserting the test ground's pickup list or count.
- `checkpoints.test.ts`: record literals gain `health`.

List every other file you change for type reasons.

## Tests (numbered)

Pure (`health.test.ts`, `holds.test.ts`):
- P1. `damageAbove` is 0 at and below the threshold and linear above it.
- P2. `relativeSpeed` covers a translating body, a spinning body (the point offset matters), and a player moving with the body (0).
- P3. `stepDowned` counts down, holds when paused, and gives `'respawn'` at the end; boundary at exactly 30 s of ticks.
- P4. `everyoneDowned`: empty is false, all downed is true, one up is false.
- P5. `useTarget` for a health kit:
  - a downed teammate is preferred over a hurt one;
  - the smaller angle wins;
  - out of range is ignored;
  - outside 20° is ignored;
  - a seated teammate is ignored;
  - self when hurt and no teammate qualifies;
  - null at full health with no target;
  - the jerrycan and toolbox unchanged.
- P6. `holdTargetValid`: a revive target revived elsewhere becomes invalid; a heal target healed to 100 becomes invalid; self stays valid while hurt.

World (`health.world.test.ts`, using `createWorld` on the test ground and the `debug*` helpers):
- W1. A fall from 8 m costs `(landing − 9) · 10` within 1 health. A jump costs nothing. A walk off the 1.2 m step costs nothing.
- W2. The vehicle driven into a standing player at 10 m/s hurts them once, about 40 health ± 10. Then nothing more for 0.5 s even while in contact. A seated player in the same vehicle takes nothing.
- W3. A crate thrown at a teammate (7 m/s) costs at most 10. A crate given 12 m/s by `debugBody` hurts.
- W4. Health reaching 0 downs the player:
  - the held crate is released;
  - a held hook is on the ground;
  - input is ignored (walk and jump do nothing);
  - gravity still applies;
  - the `downed` event is sent;
  - further hits do nothing.
- W5. With two players, a downed one respawns at `findSpawn` after exactly 30 s, with 50 health. `respawns` goes up by one and a `respawn` event is sent.
- W6. The timer pauses while a teammate's health-kit hold on them runs. Releasing the hold resumes it.
- W7. A teammate's 3 s health-kit hold on a downed player revives them at 50 where they lie. The `revive` event is sent and the kit is consumed.
- W8. A health kit on a hurt teammate adds 50, capped at 100. With no teammate in front, it heals oneself. At full health with nobody hurt, use does nothing and the kit stays.
- W9. Everyone downed:
  - two players both downed on the same tick respawn at once, `respawns` +2;
  - a solo player downed respawns on that tick.
- W10. A downed player below the kill plane respawns once, after 3 s, with 50 health, counted once.
- W11. Restart:
  - health recorded at 30 is restored to 50 and 80 stays 80;
  - a downed player is revived;
  - a player who joined after the record gets 100;
  - the hit cooldowns are cleared.
- W12. A downed player's hold ends, and they cannot start one. A hurt player's revive hold on a teammate ends when the holder is downed.
- W13. Determinism: two worlds stepped with the same inputs through a fall, a hit, a downed timer and a revive have equal snapshots.

Protocol, room, client:
- C1. Protocol: `health` and `downed` are parsed and checked: missing, negative, over 100, NaN, non-number.
- C2. Overlay:
  - the health line;
  - `DOWNED 30s`, then `29s` after 0.5 s (rounded up);
  - the players line with health;
  - the three hint texts.
- C3. Prediction gate: a snapshot with `downed` set suspends the reconciler. A unit test of the gate function, extracted if it is inline in `game.ts`, e.g. `predictionActive(entry)`.
- C4. Smoke: the overlay shows `health   100` for the local player, and the props count is 8.

## Tasks

1. **Health core.** H1–H3, H5–H8, H11 (record and restore health, late joiners), H12 (falls only), H13's server side (snapshot fields), the constants, `health.ts`, and tests P1, P3, P4, W1, W4 (falls to 0 via a high fall or `debugPlayer().hurt` if one is added — add `debugHurt(id, amount)` to the world's debug API for tests), W5, W9, W10, W11, W13 (falls only).
   - Commit: `feat(shared): players have health, are downed at zero and respawn`.
2. **Hits.** H4, the H12 hits, tests P2, W2, W3, and W13 extended.
   - Commit: `feat(shared): the vehicle and fast props hurt players`.
3. **Health kits.** H9, H10, H14, tests P5, P6, W6, W7, W8, W12.
   - Commit: `feat(shared): health kits heal and revive`.
4. **Protocol, client, browser test.** H13's parse, H15, tests C1–C4; the kit mesh.
   - Commit: `feat(client): show health, the downed timer and health kit hints`.
5. **Documents** (main session):
   - ROADMAP: step 9 → `done`;
   - delete the step-9 carried row;
   - log H1–H15;
   - "Runnable today";
   - spec: the snapshot's `health`/`downed` units; the hit cooldown; the crosshair rule's numbers.

Each task: tests first, then a Sonnet review. Run `npm test` and `npm run typecheck` before each commit, and Playwright in task 4.

## What the owner checks by hand

The downed pose, how damage feels (thresholds and amounts), the revive and heal hints.

## Known risks to watch in review

- The vehicle resting against a player with no relative speed must not hurt them repeatedly: covered by `damageAbove` and the cooldown.
- Shove-out happens before `move`; a body found in both (a) and (b) in one tick counts once, which the cooldown ensures.
- A player standing on the roof of a vehicle that brakes hard: the roof is their `ground`, so it does not hit them. Check that `ground` excludes the vehicle too, not only props.
- A landing on a moving vehicle's roof uses world `vy`. A vehicle bouncing on its suspension must not cause fall damage: the threshold is far above suspension speeds.

## Amendments after the plan review (binding; where they differ from the text above, they win)

Numbers below were measured by a probe against the real world on the test ground with the Lodgy.

J1 (H12, tick order). `stepHolds` stays where it is, before the physics step, and revive and heal completions happen there.

After `players.stepOnFoot`, `vehicle.afterPhysics()` and `winch.afterCharacters(...)`, and immediately before the existing `killPlane(events)`, the world runs these four steps in order:
1. The pending damage from `players.takeDamage()`, in join order, with a player's hits before their fall. A player downed here first has the hook dropped via `releaseHook(id, 'drop')`, then `players.setDowned(id)`.
2. The downed timers (H6). "A live hold" means `player.hold` as `stepHolds` left it this tick.
3. The everyone-downed rule (H7).
4. The existing kill plane.

A player downed on this tick does not count down on this tick, so a player downed at tick T respawns at tick T + 1800.

J2 (H4, what is not a hit). A contact is not a hit when any of these holds:
- (i) its body is the player's `ground` at the start of the tick, or after the move (the vehicle included);
- (ii) it is a computed collision with `normalY ≥ cos(PLAYER_MAX_SLOPE_DEG)` (the player is on top; H3 covers landings);
- (iii) `liftOntoTop` handled the overlap.

The player's velocity is `walk + carry` horizontally and `vy` vertically. When the player had a `ground` at the start of the tick, add that body's full 3D velocity at the feet (linear + angular × (feet − worldCom)).

`v_body(centre) = linvel + angvel × (centre − worldCom)`, where the centre is `feet + (0, PLAYER_HEIGHT/2, 0)`.

J3 (H4, speed of a hit). The speed of a hit is the closing speed `max(0, (v_body(centre) − v_player) · n)`. `n` is the unit normal from the body to the player:
- in case (b), the computed collision's `normal1`;
- in case (a), the shove direction (horizontal, from the body's centre to the feet).

So walking or jumping into a resting vehicle or prop costs nothing; the spec says a prop hurts when it is *moving*. Measured: a Lodgy driven into a standing player at 10 m/s gives 9.93 and 39.5 damage, and a thrown crate gives 7.07 and 5.4. P2 becomes `relativeSpeed(..., n)` and tests the normal: a body sliding past at 10 m/s (n perpendicular) gives 0.

J4 (H4, one contact, one hit). While a body still touches the player (case a or b), its cooldown entry is reset to `HIT_COOLDOWN` each tick. So a vehicle bulldozing a player hurts once until contact has been broken for 0.5 s. This is a starting rule for the owner. Without it, a 10 m/s vehicle shoving a player along (64 of 90 ticks in the probe) downs them in about a second.

J5 (H3, landing speed). `WalkResult` gains `moveVy: number`: the vy the move used, after the jump and gravity. "Starting airborne" means `state.grounded === false` immediately before `stepWalk`, that is, after the ground follow, shove-out and `liftOntoTop`. The landing speed is `max(0, −moveVy)`.

H3's exclusions follow from this with no extra flag: teleport, respawn and the shove-out move set vy to 0, and `liftOntoTop` sets `grounded` before the move.

J6 (H9 context).
- `eye` and `aim` are `aimRay(feet, yaw, pitch)`'s origin and direction.
- `ctx.players` entries are `{ id, feet, health, downed, seated }`. The centre is `feet + (0, PLAYER_HEIGHT/2, 0)`. The caller leaves self out.

J7 (H10, holds).
- `Hold.action` widens to `'useItem' | 'revive'`.
- `stepHold`'s target parameter becomes `{ id: Target; revive: boolean } | null`. A new hold takes `action: target.revive ? 'revive' : 'useItem'`.
- `holdTargetValid` treats a `revive` hold as valid only while its target is downed and in `HEAL_RANGE`. It treats a `useItem` hold on a teammate as valid only while that teammate is not downed, has `health < 100` and is in range.
- The crosshair is checked only at the press, because the spec allows moving within range.
- H6's pause counts only holds with `action === 'revive'` whose `targetId` is the downed player.

J8 (H5, neutral input). In `stepInputsFor`, a downed player's fields become `neutralInput({...NEUTRAL_INPUT, yaw: player.yaw, pitch: player.pitch, slot: player.slot})`, with every press false and no `usePressed`. `previous` still records the raw input, so a button held through the downed time is not a press on revival. `reelInput` skips downed players.

Delete "Other players' interact never targets a downed player". The hook drop is "winch rule W2".

J9 (H1, H6–H8, cooldowns).
- A downed player's hits are not detected and get no cooldown entries.
- Cooldowns count down at the start of `stepOnFoot`, for every player.
- Every respawn (H6, H7, H8) and every restart clears `hitCooldown`.
- In H7, a downed player with `respawnIn` set counts as downed.

J10 (H14). `healthKit-1` is at `(-1, 0, 14)`, after `toolbox-1` in `pickups`. At (−2, 0, 14) it overlapped `toolbox-1`.

J11 (events). Events `hurt`, `downed`, `revive` and `respawn` are returned from `World.step` only. The room still sends no `event` message; that arrives with the HUD and sound at steps 12 and 18. Task 5 replaces decision D7's "until step 9" with this and logs it.

J12 (debug). `World.debugHurt(id: string, amount: number): void` is for tests only. It queues `{ source: 'debug', amount }` into that player's pending damage, which is applied at the J1 point of the next `step`, so its events come out of `step`.

J13 (task split, so every task typechecks).
- Task 1 also covers:
  - `client/src/net/snapshotBuffer.ts` copies `health` and `downed` (+ a test that both survive `sample()`);
  - the `PlayerSnapshot` literals in `predictor.test.ts`, `overlay.test.ts`, `snapshotBuffer.test.ts` and `protocol.test.ts` gain `health: 100, downed: null`;
  - `client/src/render/propMesh.ts` `ITEM_COLOURS` gains `healthKit` with a colour distinct from the jerrycan's (white, `0xf5f5f5`); its final mesh comes in task 4.
- Task 3 also covers: `client/src/ui/overlay.ts`'s `useTarget` call adopts the new context. The hint text changes stay in task 4.

J14 (existing tests that change, in addition to the list above).
- **`items.test.ts`:** the pickup id lists (around lines 35–37, 51, 62) and the last-prop assertion (around 307).
- **`courses/testGround.test.ts`:** the pickup id list (around 71).
- **`checkpoints.test.ts`:**
  - the `recordState` players gain `health` (around 122);
  - the recorded items become `['jerrycan-2', 'toolbox-1', 'healthKit-1']` (around 495);
  - add `['healthKit-1', 'healthKit']` (around 508–511).
- **`predictor.test.ts`:** the player literal (around 314).
- **`player.test.ts`:** the `Hold` literal (around 838).
- **`holds.test.ts`:** every `useTarget` and `stepHold` call.
- **`e2e/smoke.spec.ts`:** the props case title becomes "four props and four pickups", and it expects `props    8`.

The players line is not changed. H15's "players line shows health" is dropped, so the smoke cases that read it stay as they are.

J15 (H15 formats).
- The health lines go in the overlay's `if (local)` block, directly after `slots`:
  - `health   N`;
  - then `DOWNED   Ns` while downed, with the seconds rounded up.
- The hints follow the existing style:
  - `Hold F to revive <name>`;
  - `Hold F to heal <name>`;
  - `Hold F to heal yourself`.
- C4 matches `/^health   100$/m`. The vehicle line already contains `health 100%`.

J16 (tests pinned).
- **C2:**
  - `downed` 30 → `DOWNED   30s`;
  - 29.5 → `30s`;
  - 29.01 → `30s`;
  - 29 → `29s`;
  - 0.01 → `1s`.
- **W1:**
  - Feet teleported to (5, 8.02, 20): health becomes 65 (damage 34.3 ± 0.5; impact vy 12.43 m/s).
  - Feet at (5, 4.22, 20) (8.99 m/s): no damage.
  - Feet at (5, 5.02, 20): damage 8.1 ± 0.5.
  - A jump in place: none.
  - Walking off the top edge of the 12° ramp at (8, 1.24, −65.7) toward −Z, a 1.24 m drop: none.
- **W2:**
  - The Lodgy is at rest at its spawn, with p2 at (0, 0.02, −7); `debugBody('vehicle').setLinvel((0, 0, −10))`.
  - p2 is hit once at about tick 26, with damage 39.5 ± 1.5.
  - While the vehicle keeps shoving p2 there is no further damage (J4).
  - Separately, a player walking at full speed into the parked Lodgy, and jumping into it, takes nothing (J3).
- **W3:**
  - p1, holding a crate at (0, 0.02, 20) with yaw 0 and pitch 0, throws at p2 at (0, 0.02, 18): damage 5.4 ± 1 (more than 0).
  - A crate placed with its centre at (0, 1.0, 16.5) and linvel (0, 0, 12) toward p2 at (0, 0.02, 18): damage 30 ± 2. If the measured value differs, report it rather than change the threshold.
- **W4:** down the player with `debugHurt(id, 100)`, or by a fall from (5, 20.02, 20) (107.8 damage).
- **W5, W9 and W10:** each has a second player who is not downed.
- **W9 additions:**
  - p1 downed at tick T and p2 at T+5 both respawn at T+5, `respawns` +2;
  - with p1 downed and p2 removed, p1 respawns on the next step.
- **W11:**
  - a player who joined after the record and was hurt to 40 has 100 after the restart;
  - a crate hit at tick T, a restart at T+1, and a second 12 m/s crate at T+5 hurts.
- **W2's seated case** stays, but it is trivially true.

J17 (H13). The health shown is rounded down, so a player with health between 0 and 1 shows 0 while not downed. This is accepted. `health` is parsed as a finite number in 0..100, not as an integer.

J18 (constants comment). `FALL_DAMAGE_SPEED`: a jump lands at about 4.8 m/s, a fall from the RV's roof (2.9 m) at about 7.5, and from the Lodgy's (1.5 m) at about 5.4.

J19 (carried row). Step 11 gains the spec's held-slot health rules: a rejoin keeps health, and a downed rejoin counts as a respawn. Until then, "every connected player" means the world's players. Task 5 adds the row.
