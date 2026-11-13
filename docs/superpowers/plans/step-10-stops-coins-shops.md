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
