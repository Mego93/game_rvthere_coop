# Step 10: Service stops, coins, shops and shop menu, final time and side objectives

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`. Sections:
- "Final time"
- "Losing the vehicle: checkpoint restart" (coins and wallet)
- "Coins and shops"
- "Service stops"
- "Side objectives"
- "Hold actions"
- the World API (`world.buy`)
- the client messages table (`buy`)
- "error" (`cannot_buy`)
- "Snapshot" (`coinsLeft`, `wallet`, `coinsCollected`, `coinsTotal`)
- "Client" (the shop menu)
- "Error handling" (refused purchase)
- Testing ("coins and shop", "checkpoints")

ROADMAP carried rows for step 10:
- the record and restore include coins and the wallet;
- service stops adopt the `STOP_*` constants and the pad layout of the step-15 plan;
- exit and spawn-slot validity should include a ray against walls.

This plan fixes interfaces, constants, rules and test cases. Implementers write the tests first, then the code. Where the plan and the spec disagree, or neither answers a question, stop and report.

## Goal

- Coins float on the course. Touching one adds it to the crew's wallet.
- A fuel station's pump and a garage's workbench, held for 3 s with the vehicle parked in the zone, fill the tank or repair the vehicle.
- A shop menu at the fuel station's counter sells items for coins.
- On finishing, the page shows the final time and the stars.

## Constants (`constants.ts`, block "Coins, stops and shops")

| Name | Value | Meaning |
|---|---|---|
| `COIN_RADIUS` | 0.5 | m, the coin's touch sphere |
| `FINAL_RESTART_PENALTY` | 60 | s added per checkpoint restart |
| `FINAL_RESPAWN_PENALTY` | 30 | s added per player respawn |
| `FINAL_COIN_BONUS` | 5 | s taken off per coin left in the wallet |
| `STOP_OPERATE_RANGE` | 2 | m, feet to the operate point (3D) |
| `SHOP_RANGE` | 2 | m, feet to the counter point (3D) |
| `SHOP_PRICES` | `{ jerrycan: 3, toolbox: 3, healthKit: 2 }` | coins; a `Record<ItemKind, number>` |

Prices are starting values for the owner. The three final-time numbers are the spec's.

## Rules

V1. **Coins.**
- The world keeps the ids of the coins still on the course (`coinsLeft`, in course order), `wallet` and `coinsCollected`. All start from the course, with 0 for the two counts. `coinsTotal` is `course.coins.length`.
- A player collects a coin when the distance from the coin's centre (its pose position) to the player's capsule segment is at most `PLAYER_RADIUS + COIN_RADIUS`. The capsule segment runs from `feet + (0, PLAYER_RADIUS, 0)` to `feet + (0, PLAYER_HEIGHT − PLAYER_RADIUS, 0)`.
- The player must be unseated, not downed, and have `respawnIn` null.
- The check runs once per tick after the characters move and before the damage step (J1 of step 9), in join order and coins in course order. A coin is taken by the first player who touches it.
- Collecting removes the id from `coinsLeft` and adds 1 to `wallet` and to `coinsCollected`. It sends `{ kind: 'coin', tick, playerId, pos }`.
- Nothing is collected once the run is won.

V2. **Snapshot.** `WorldSnapshot` gains `coinsLeft: string[]`, `wallet: number`, `coinsCollected: number` and `coinsTotal: number`, sent in every snapshot.

The protocol checks them:
- `coinsLeft` is an array of strings, at most `coinsTotal` long;
- the three numbers are counts (`isCount`);
- `coinsCollected ≤ coinsTotal`.

V3. **Record and restore** (carried row).
- `CheckpointRecord` gains `coinsLeft`, `wallet` and `coinsCollected`.
- A restart restores all three.
- cp-0 records the course's coins with 0 and 0.

V4. **Final time and stars** (new pure module `score.ts`).
- `finalTime({ elapsed, restarts, respawns, wallet }) = max(0, elapsed + 60·restarts + 30·respawns − 5·wallet)`.
- `stars({ restarts, finalTime, targetTime, coinsCollected, coinsTotal, assisted }): [boolean, boolean, boolean]`:
  1. `restarts === 0`;
  2. `finalTime < targetTime`;
  3. `coinsCollected === coinsTotal`, which is true on a course with no coins.
- When `assisted` is true, all three are false. Nothing sets `assisted` until step 11's admin tools, so the world and the page pass `false`.
- `World.status()` gains `wallet`, `coinsCollected`, `coinsTotal` and `finalTime`. `finalTime` is the final time computed from the current values. It stops changing once won, because the timer, the counts and the wallet all freeze (V1, V6).

V5. **Service stops.**
- A stop is **usable** when:
  - the vehicle's centre is inside the stop's `zone` (`insideBox`);
  - for a fuel station, fuel `< 1`; for a garage, health `< 1`.
- `interactCandidates` gains a candidate `{ kind: 'operate', stopId }` for each usable stop whose operate point is within `STOP_OPERATE_RANGE` of the feet. Its angle is the angle to the operate point. `InteractAction` gains `{ kind: 'operate', stopId }`.
- `resolveInteract` picks it like any other candidate. The rules for being seated, holding the hook and full hands come first, as today.
- The interact candidates' context gains `stops: { id, operatePoint, usable }[]`, filled by the world, and by the page for the hint.

V6. **Operate holds.** `Hold` becomes a union:
- `UseHold`: the step 7 and 9 hold, with `action` `'useItem' | 'revive'`;
- `OperateHold`: `{ action: 'operate'; targetId: stopId; progress }`.

The hold rules:
- An `operate` action from the interact resolution starts an operate hold, if the player has no hold running. The press tick counts as the first tick of progress, as for item holds.
- The hold continues while all of these hold:
  - `interact` is held;
  - the stop is still usable;
  - the feet are within `STOP_OPERATE_RANGE`;
  - the player is not seated, downed or teleported.
- Otherwise it ends.
- At completion: a fuel stop sets fuel to 1; a garage sets health to 1. It sends `{ kind: 'use', tick, playerId, pos: operatePoint }`.
- An item hold and an operate hold never run together. A use press while an operate hold runs does nothing, and so does an interact press while an item hold runs.
- Stops are free and reusable. A completed hold needs a fresh press.
- The snapshot's `hold` stays `{ action, targetId, progress }`.

V7. **Shop.** `World.buy(playerId, item: ItemKind): 'ok' | 'cannot_buy'` applies at once when called.

It refuses when any of these is true:
- the player is unknown, seated, downed, or has `respawnIn` set;
- the run is won;
- no fuel stop's `shopCounter` is within `SHOP_RANGE` of the feet;
- `wallet < SHOP_PRICES[item]`;
- no slot is free.

Otherwise it takes the price from the wallet, puts the item in the first free slot, and sends `{ kind: 'buy', tick, playerId, pos: counter }` in the events returned by the next `step`. `coinsCollected` is unchanged.

V8. **Protocol and room.**
- `ClientMessage` gains `{ type: 'buy'; item: ItemKind }`. The parse checks that `item` is a key of `ITEM_KINDS`.
- The room calls `world.buy`. On `'cannot_buy'` it sends `{ type: 'error', reason: 'cannot_buy' }` to that client only.
- `ERROR_REASONS` gains `'cannot_buy'`, if it is missing.
- Buy messages count toward the rate limit like any other message.

V9. **Test ground.**
- **Stop builder.** `segments.ts` exports the stop placement it already does, as `placeStop(id, kind, s: SurfacePoint, side: 1 | -1): { pad: GroundBox; stop: ServiceStop }`. Its existing caller uses it, with no change in output, and the segment tests are the check. This covers the `STOP_*` carried row.
- **Stops.** The test ground uses `placeStop` for two stops:
  - `stop-fuel` (kind `fuel`) on the right of its road (`side 1`) at the surface point `{ pos: (0, 0, −20), yaw: 0, pitch: 0 }`;
  - `stop-garage` (kind `garage`) on the left (`side −1`) at the same point.
  - Their pads join the test ground's `ground`.
- **Coins.** Four coins, `coin-1` to `coin-4`, at `(3, COIN_HEIGHT, −12)`, `(−3, COIN_HEIGHT, −28)`, `(6, COIN_HEIGHT, −36)` and `(−6, COIN_HEIGHT, −44)`.
- **Check the layout.** Before writing tests, the implementer checks that the pads, zones and coins do not overlap these: the vehicle's spawn box at the origin, the cp-1 trigger, the ramp at x = 8 from z = −40, the props and pickups behind the start, and the slope and sand areas. Report any overlap; do not move anything on your own.

V10. **Client.**
- **Coins.** Coins are drawn as gold discs, 0.5 m in radius and turning slowly. Those not in the latest snapshot's `coinsLeft` are hidden.
- **Overlay.** The overlay gains:
  - `coins    W   C/T` after the `time` line, with W the wallet, C collected and T the total;
  - after `FINISHED`: `final    m:ss.s   stars ABC`, where each letter is `*` or `-`, computed with `score.ts` from the latest status and the course's `targetTime`.
- **Hints.** The interact hint for an operate candidate reads `Hold E to refuel` or `Hold E to repair`.
- **Shop menu** (`ui/shopMenu.ts`, DOM):
  - It opens when the local player presses interact while unseated, not downed and within `SHOP_RANGE` of a fuel stop's counter, by the client's own check. The press still goes to the server, as the spec says.
  - It shows three buttons, item name and price (`#shop-jerrycan`, `#shop-toolbox`, `#shop-healthKit`), plus the wallet and a close button.
  - Clicking or tapping a button sends `buy`.
  - On desktop it releases pointer lock while open.
  - It closes on Esc, on leaving `SHOP_RANGE`, on being downed or seated, and on a teleport (the local position jumping more than 2 m between snapshots).
  - A `cannot_buy` error while the game runs shows "Cannot buy" in the menu for 2 s and does not end the game. `main.ts` routes `error` messages with `cannot_buy` to the game instead of the home page.

V11. **The wall-ray carried row** moves to step 16, where stops first stand beside fences. The test ground has no walls.

## Modules and signatures

- `constants.ts`: the block above.
- `score.ts` (new, pure): `finalTime` and `stars`.
- `world.ts`: coins (V1), the snapshot (V2), record and restore (V3), status (V4), operate holds (V6), `buy` (V7).
- `checkpoints.ts`: V3.
- `interact.ts`: V5.
- `holds.ts`: the `Hold` union and an operate-hold step, e.g. `stepOperateHold(hold, input: { interactPressed; interactHeld }, target: string | null, blocked): { hold; completed }`.
- `segments.ts`: `placeStop` (V9).
- `courses/testGround.ts`: V9.
- `protocol.ts`: V2, V8.
- `server/src/room/room.ts` and `server.ts`: V8.
- Client:
  - `render/` — coins;
  - `ui/overlay.ts` — lines and hints;
  - `ui/shopMenu.ts`;
  - `main.ts` — error routing;
  - `game.ts` — the menu wiring, and the coin visibility from `coinsLeft`.

## Existing tests that change (name every other one you change)

- `snapshotBuffer.test.ts` and `protocol.test.ts`: the `WorldSnapshot` and `SnapshotMessage` literals gain the four coin fields.
- `checkpoints.test.ts`: record literals.
- `courses/testGround.test.ts`: its lists of stops, coins and ground pieces.
- `segments.test.ts` and `courses/build.test.ts`: none; they must pass unchanged against `placeStop`.
- `holds.test.ts`: only if the `Hold` union forces literal changes.
- `e2e/smoke.spec.ts`: none expected. Check that no new overlay line starts with `pos`, `tick`, `you`, `server`, `players` or `props`.

## Tests (numbered)

Pure:
- S1. `finalTime`:
  - 100 s with nothing added gives 100;
  - 1 restart, 2 respawns and 3 coins give 100 + 60 + 60 − 15 = 205;
  - a large wallet clamps the result at 0.
- S2. `stars`:
  - each star on its own;
  - `finalTime` equal to `targetTime` does not earn star 2;
  - a course with no coins earns star 3;
  - `assisted` gives all false.
- S3. `interactCandidates`:
  - a usable fuel stop in range gives an `operate` candidate;
  - a full tank gives none;
  - a vehicle outside the zone gives none;
  - out of range gives none;
  - a garage with health 1 gives none.
- S4. The operate-hold step:
  - the press binds;
  - it completes after exactly 3 s;
  - releasing interact resets it;
  - a stop that is no longer usable resets it;
  - being blocked resets it;
  - a fresh press is needed after completion.

World (`stops.world.test.ts`, test ground):
- S5. Coins:
  - walking through `coin-1` collects it once, with a `coin` event, `wallet` 1 and `coinsCollected` 1, and the id leaves `coinsLeft`;
  - a seated player passing through (the vehicle driven through, a passenger aboard) collects nothing;
  - a downed player collects nothing;
  - two players touching one coin on the same tick: the first in join order gets it.
- S6. A coin is collected at a distance of `0.85 − ε` from the capsule segment and not at `0.85 + ε`.
- S7. Restart: coins collected after cp-1 return, and the wallet goes back to its cp-1 value. Coins collected before cp-1 stay collected.
- S8. Fuel stop:
  - park the vehicle in `stop-fuel`'s zone (`debugBody` teleport, at rest) at fuel 0.3;
  - stand at the operate point and hold interact for 3 s: fuel is 1 and the `use` event is sent;
  - with the vehicle outside the zone: nothing happens;
  - at fuel 1: no candidate.
- S9. Garage: the same with health.
- S10. An operate hold and an item hold do not run together, either way round.
- S11. Shop:
  - with 3 coins, at the counter, `buy('jerrycan')` is `'ok'`; the wallet goes to 0, the item lands in the first free slot, and the `buy` event comes from the next step;
  - each refusal returns `'cannot_buy'` and changes nothing: too few coins, full inventory, out of range, seated, downed, won;
  - buying at a garage is refused, because it has no counter.
- S12. `status().finalTime` matches `finalTime` of the current values, and stops changing after the win.
- S13. Determinism: two worlds with a coin pickup, a buy and an operate hold give equal snapshots.

Protocol, room, client:
- S14. Protocol:
  - `buy` is parsed, and an unknown item is rejected;
  - the snapshot coin fields are checked: a non-array, a non-count, and `coinsCollected > coinsTotal`.
- S15. Room: a refused buy sends `error cannot_buy` to that client only; an accepted buy sends no error.
- S16. Overlay:
  - the coins line;
  - the `final` line after the win, with the stars, for one restart and all coins;
  - the operate hints.
- S17. Shop menu, as a pure part extracted from the DOM, e.g. `shopMenuState(prev, inputs)`:
  - it opens on an interact press in range;
  - it closes on leaving range, being downed, being seated, a teleport, or Esc;
  - it stays closed when the press is out of range.
- S18. Smoke: the overlay shows `coins    0   0/4`.

## Tasks

1. **Coins, score, record.** V1–V4, `score.ts`, the coins of V9 (coins only), S1, S2, S5–S7, S12, S13 (coins only).
   - Also: the snapshot literals in the client tests, and `snapshotBuffer.ts`, which must copy the new top-level fields (with a test).
   - Commit: `feat(shared): coins fill a shared wallet and the final time is scored`.
2. **Service stops.** V5, V6, V9 (`placeStop` and the two stops), S3, S4, S8–S10, S13 extended.
   - Commit: `feat(shared): fuel stations and garages refill the vehicle`.
3. **Shop.** V7, V8, S11, S14, S15.
   - Commit: `feat(server): buy items at a fuel station's shop`.
4. **Client.** V10, S16–S18.
   - Commit: `feat(client): coins, the shop menu and the final time`.
5. **Documents** (main session).
   - ROADMAP:
     - step 10 → `done`;
     - delete the three step-10 carried rows; move the wall-ray row to step 16;
     - log V1–V11;
     - update "Runnable today".
   - Spec:
     - star 3 on a coinless course;
     - the shop's error routing;
     - `World.status` fields.

Each task: tests first, then a Sonnet review. Run `npm test` and `npm run typecheck` before each commit, and Playwright in task 4.

## What the owner checks by hand

The coin look and placement, the stop and shop flow, the shop menu's look, and the prices.

## Known risks to watch in review

- Interact at a pump while standing near the vehicle's door: the smaller angle decides between boarding and operating. Check that a player at the operate point, aiming at the pump, gets `operate`.
- The shop menu and pointer lock: closing the menu must not leave the mouse unlocked with no hint. The existing "click to look" behaviour covers it.
- `coinsLeft` in every snapshot costs about 10 bytes per coin. Measure it at step 16.

## Amendments after the plan review (binding; where they differ from the text above, they win)

The angles and positions below come from a probe run against the real `interactCandidates` and the `placeStop` formula.

M1 (V5, the interact tier; spec "Interact resolution" priority 3).
- Stop candidates form their own tier. `resolveInteract` resolves in this order:
  1. Seated → `exitSeat`.
  2. Holding the hook → the attach candidate with the smallest angle.
  3. Otherwise → the stop-tier candidate (`operate` or `shop`) with the smallest angle. This applies even with the hook or debris in the hands.
  4. Then, with the hook in hand → `dropHook`; with debris → `throw`.
  5. Otherwise → the smallest angle among the rest, as today.
- `interactCandidates` returns stop-tier candidates whatever `hands` holds, but never while seated. `splitCandidates` returns them as a third list, `stopCandidates`, and `resolveInteract` gains a `stopCandidates` parameter.
- Within the tier, ties go to the earlier stop in course order, with `operate` before `shop`.
- Test S3b: `resolveInteract` picks `operate` over `board` even when the board angle is smaller, over `throw` with debris in the hands, and over `dropHook`. It picks `attachHook` over `operate`.
- This replaces the known risk "the smaller angle decides". Without it, a player at the pump boards a vehicle parked near the zone's outer edge.

M2 (V5a, the shop counter).
- `interactCandidates` adds `{ kind: 'shop', stopId }` for each fuel stop whose counter box (M4) is within `SHOP_RANGE` of the feet. Its angle is measured to the counter box's centre. `InteractAction` gains `{ kind: 'shop'; stopId: string }`.
- When `resolveInteract` returns `shop`, the world does nothing: no hold, no event, no other action.
- The context's `stops` entries are `{ id, kind, operatePoint, shopCounter, usable }`.
- V10's menu opening becomes: it opens when the local player's interact press resolves to `shop`. The client decides this with `resolveInteract` on its own state: the latest snapshot, the predicted feet when prediction is on, and the input's aim. This is the same resolution the hint uses.
- S17 gains a case: an interact press at a usable pump's operate point, aiming at the pump, does not open the menu.

M3 (V6, holds).
- Types:
  - `Hold` keeps its name and shape (the item hold).
  - Add `OperateHold = { action: 'operate'; targetId: string; progress: number }` and `PlayerHold = Hold | OperateHold`.
  - `PlayerState.hold` becomes `PlayerHold | null`.
  - `stepHold`, `pressTarget` and `holdTargetValid` keep their signatures, so `holds.test.ts` does not change.
- Rules:
  - A use press while an operate hold runs starts no item hold.
  - An interact press that resolves to `operate` while an item hold runs starts no operate hold.
  - Every other interact action (board, throw, pick up, the hook) works as today, and still ends a running hold by the existing rules. `holds.test.ts` test 7, "boarding mid-hold resets it", must pass unchanged.

M4 (shop range to the counter's box; spec Conventions).
- New constant `SHOP_COUNTER_HALF = vec3(0.6, 0.5, 0.3)`: the counter box's half extents. The box is centred 0.5 m above `shopCounter` and unrotated.
- "Within `SHOP_RANGE`" means `distanceToBox(feet, SHOP_COUNTER_HALF, centre, IDENTITY) ≤ SHOP_RANGE`. `scene.ts` draws the counter from the constant.

M5 (V4, final time freezes). Once the run is won, respawns still happen but are no longer counted: `respawns` freezes at the win tick, in the snapshot and in `status()`. S12 becomes: after the win, a solo player is downed (`debugHurt` 200) and respawns, and neither `respawns` nor `status().finalTime` changes.

M6 (V12, event ticks). Every new event carries the tick its step produces:
- The operate completion's `use` event is raised in `stepHolds` and uses `tick + 1`, like `revive`.
- The coin check runs after `tick += 1` and uses `tick`. It runs after `winch.afterCharacters` and before `stepHealth`.
- A `buy` event queued by `world.buy` carries `tick + 1` as at the call, and the next `step` returns it first.

S5 and S11 assert that the stamped tick equals `world.snapshot().tick` after that step.

M7 (existing tests and files that change, replacing the list above).
- Task 1:
  - `snapshotBuffer.test.ts`: the snapshot literal, and the `latestStatus` expectation.
  - `protocol.test.ts`: the snapshot literal.
  - `checkpoints.test.ts`: the `recordState` literal.
  - `overlay.test.ts`: the `run()` helper's `RunStatus`.
  - `RunStatus` gains `wallet`, `coinsCollected` and `coinsTotal`.
  - `SnapshotBuffer` gains `latestCoinsLeft(): string[]`, empty before any snapshot.
- Task 2:
  - `interact.test.ts`: both `base` contexts gain `stops: []`, and the `resolve` helper gains `stopCandidates: []`.
  - `courses/testGround.test.ts`: the lists.
- Task 3: `client/src/ui/home.ts` gains `cannot_buy: 'You cannot buy that here.'` in `ERROR_TEXT`. Without it, typecheck fails.
- Task 4:
  - `overlay.test.ts`: the `OverlayData` literals gain `stops: readonly ServiceStop[]` and `targetTime: number`.
  - `e2e/smoke.spec.ts` gains the S18 case.

M8 (module layout, as in the spec).
- `finalTime` and `stars` go in `rules.ts`, not a new `score.ts`.
- New `coins.ts` exports `coinTouched(feet: Vec3, coinPos: Vec3): boolean`, with a pure test at ε = 0.01 m for S6.
- New `stops.ts` exports `stopUsable(stop: ServiceStop, vehicleCentre: Vec3, fuel: number, health: number): boolean`. The world and the page both call it.
- S3 tests `stopUsable` with these cases:

  | Stop | Vehicle centre | Fuel | Health | Usable |
  |---|---|---|---|---|
  | fuel | in zone | 0.5 | | true |
  | fuel | in zone | 1 | | false |
  | fuel | 0.01 m outside the zone | | | false |
  | garage | | | 1 | false |
  | garage | | 1 | 0.5 | true |

- S3 also tests `interactCandidates` with `usable` true and false, and with the player in and out of `STOP_OPERATE_RANGE`.

M9 (V10, shop menu).
- While the menu is open, the fixed stepper sends `neutralInput(last)` with the aim and slot kept, and still records it for the reconciler (spec "Menus").
- Two new constants: `SHOP_MENU_TELEPORT = 2` (m between consecutive snapshots of the local player) and `SHOP_ERROR_SECONDS = 2`.
- `Game` gains `showShopError(): void`. `main.ts` routes an `error` with reason `cannot_buy` to it when `game` is not null, and drops it otherwise. It never goes to the home page. The error is ignored while the menu is closed.
- S17 adds a case: an input sampled while the menu is open is neutral.

M10 (V8, room).
- `Room` gains `buy(player: RoomPlayer, item: ItemKind): 'ok' | 'cannot_buy'`, which calls `world.buy`.
- `server.ts` gains a case `'buy'`:
  - not in a room → refuse with `cannot_buy`;
  - `room.buy` returns `'cannot_buy'` → refuse with `cannot_buy` to that session only.
- S15 lives in `server/src/room/server.test.ts`, with fake connections, and also covers a `buy` sent before `join`, which gets `cannot_buy`.
- The parse uses `Object.hasOwn(ITEM_KINDS, item)`. S14 rejects `item: 'toString'`.
- `ERROR_REASONS` gains `'cannot_buy'`. It is not there today. `parseServerMessage` maps unknown reasons to `bad_message`, so this lands in task 3 together with the server change.

M11 (V9, geometry).
- Positions, from `placeStop` at s = (0, 0, −20) with yaw 0:

  | Stop | Pad | Zone | Operate point | Counter |
  |---|---|---|---|---|
  | fuel | x 5..13, z −28..−12 | x 5.5..10.5, z −25..−15 | (11.5, 0, −20) | (11.5, 0, −22) |
  | garage | x −13..−5 | x −10.5..−5.5 | (−11.5, 0, −20) | none |

- The ramp is at x = 8 from z = −60. The plan's "−40" was wrong.
- The fuel pad overlaps the sand slab by 1 m (x 12–13, z −28 to −15). This is known and accepted: the sand slab sits on top.
- The pads are appended after the existing ground pieces, so `ground[0]` stays the main slab (`world.test.ts` reads it). The pads are coplanar with the main slab; that is accepted on the test ground.
- Both vehicles fit inside the zone.
- `placeStop` assumes yaw 0 for the counter offset, as its only callers use it. Add a one-line note.
- S11 reaches a wallet of 3 by teleporting the player onto `coin-1`, `coin-2` and `coin-3`, stepping once after each.
- `coin-1` is about 0.65–0.92 m from the line a player walks straight forward from the vehicle's right slot. No test may expect a wallet of 0 after such a walk.

M12 (documents and the owner's checks).
- The decisions-log line for V11 says that `COURSE=segment-demo` already places stops beside fences, so the demo course is exposed to the wall-ray issue until step 16.
- The operate angle is measured to a point at ground level, while the drawn pump is 1.4 m tall. Add this to the owner's hand checks.
- Task 5 adds the coin check's place in the tick order to the spec.

M13 (found in task 2: aiming at the pump). With the operate angle measured to the ground-level operate point, a player standing at the pump and aiming ahead resolves to the fuel counter's `shop` candidate, which does nothing on the server. They have to look straight down to refuel.

The fix is to aim at what is drawn:
- New constant `STOP_POST_HEIGHT = 1.4`, in m. It is the height of the drawn pump or workbench post, and `scene.ts` draws the post from it.
- The `operate` candidate's angle is measured to `operatePoint + (0, STOP_POST_HEIGHT / 2, 0)`.
- The `shop` candidate's angle stays measured to the counter box's centre.
- Range checks are unchanged: they stay feet to point, and feet to box.
- Test: a player at the operate point, aiming level toward the post, gets `operate`; the same player aiming level at the counter gets `shop`.

This is done in task 3. The world tests that use `pitch = −π/2` may keep it, but one test aims level.
