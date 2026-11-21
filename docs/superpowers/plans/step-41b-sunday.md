# Step 41b: Sunday

**Spec:** `docs/superpowers/specs/2026-11-21-story-mode-framework-design.md` ("Sunday" and the PrimeGolf section added with this plan), plus the 41a framework as merged.

**Process (owner):** one short Sonnet review for the step; tasks run in parallel where marked. Use TDD and Conventional Commits, and run the full checks before each commit.

## Owner decisions (PrimeGolf talk, 2026-11-21)

1. **Shot:** aim and power meter. Turn to aim, hold to fill the power bar, release, then one tap for curve.
2. **Field and turns (my proposal, accepted):**
   - The field is Topgolf-like: seven rings from 20 to 200 m plus a small jackpot ring.
   - Each friend plays 6 balls, one at a time, in rotation.
   - A scoreboard shows after each ball.
3. **Competition plus a small team bonus.** The best player gains happiness, the worst pays coffee for everyone from his cash, and the team total gives everyone a little happiness.
4. **Getting there:** the gate fades straight to PrimeGolf (no drive) and back to the villa afterwards.
5. **Caveats accepted:**
   - The client measures power (no anti-cheat).
   - The forfeit pays what cash there is; money never goes below zero.
   - Alone, only the team bonus applies.
   - A friend who leaves mid-game has his remaining balls skipped and keeps his score.
   - The reversed airport road is the risky part and is tested hardest.

## Sunday's flow

1. **Morning: the `arrival` world.** The friends start on foot in the arrival hall and fight through obstacles and knife enemies to the rental car stop, where the Lodgy waits. The goal `arrive` is done when every present friend is inside the stop's finish box.
2. **The `airport-home` world:** the `airport-road` stage reversed. It ends at the villa gate. Goal `driveHome`.
3. **The villa**, with these goals in any order:
   - `tajine`: eat the tajine together in the kitchen. It is a free meal for every present friend.
   - `primegolf`: at the gate, after `tajine`.
   - Vibecoding and the rest are free play.
4. **Night:** sleep, as in 41a.

The clock runs from the arrival on, and pauses in PrimeGolf. The day may run past 10 minutes (owner).

## Constants

### PrimeGolf (`packages/shared/src/story/primegolf.ts`)

| Constant | Value |
|---|---|
| `GOLF_BALLS_EACH` | 6 |
| `GOLF_MAX_SPEED` | 62 m/s |
| `GOLF_LAUNCH_PITCH` | 14° |
| `GOLF_CURVE_ACCEL` | 6 m/s² sideways at curve ±1 |
| `GOLF_POWER_CYCLE` | 1.6 s (the bar fills, then empties, while held) |
| `GOLF_BALL_RADIUS` | 0.0215 |
| `GOLF_SETTLE_SECONDS` | 6 (a ball not landed by then counts as a miss) |
| `GOLF_SCOREBOARD_SECONDS` | 2.5 |

`GOLF_RINGS` (distances from the tee in m; centre within radius/3 doubles the points):

| Ring | Distance | Radius | Points |
|---|---|---|---|
| red | 20 | 6 | 10 |
| yellow | 50 | 6 | 15 |
| green | 80 | 6 | 20 |
| blue | 110 | 6.5 | 25 |
| purple | 140 | 6.5 | 30 |
| orange | 170 | 7 | 40 |
| white | 200 | 7 | 50 |
| jackpot | 215 | 2 | 150 |

All rings except the jackpot alternate ±12 m to the side, so that aiming matters. The jackpot is on the centre line.

End-of-game effects:
- `GOLF_BEST_HAPPINESS = 15`.
- The worst player pays `coffee` × present friends from his cash, clamped at his cash.
- Team: every present friend gets happiness `min(10, round(teamAverage / 20))`, where teamAverage is the mean score per present friend.

### The arrival (`packages/shared/src/courses/arrival.ts`)

- An on-foot course of about 260 m:
  - the arrival hall (walls, two crate walls);
  - a pedestrian crossing with gates;
  - the car park (roadblock, debris);
  - the rental car stop at the far end, where the Lodgy is parked and the finish box sits.
- `ARRIVAL_ENEMY_DENSITY = 6`: enemies every `ENEMY_SPACING / 6` ≈ 42 m, with the existing cap of 8 alive.
- Every friend starts with a gun and `GUN_AMMO_START`, and one ammo box lies mid-way.

### The reversed road (`packages/shared/src/courses/reverse.ts`)

`reverseSegments(segments: readonly SegmentDef[]): SegmentDef[]` returns the segments in reverse order, each driven the other way:
- road `curve` and `slope` are negated;
- every extra's `along` becomes `length − along` (or the span's mirror for spans like mud: `along` becomes `length − along − mudLength`);
- `lateral` and `side` are negated;
- a pit's `gradient` and `gradientOut` swap, and its anchors move to the other exit flat;
- a bank becomes its reverse;
- sand, alley, ford and roadworks extras are mirrored the same way;
- a bridge stays a bridge, and a broken bridge mirrors.

`airport-home` is `{ id: 'airport-home', segments: reverseSegments(airport-road segments), targetTime: 300, ambient: true, corridor: true, theme: 'airport', story-only }`. Its start is the old finish:
- the first segment becomes the flat 80 m start road with the start pickups;
- the last segment is followed by the finish pad, which is where the villa gate is.

`airport-home` and `arrival` are story-only. They are left out of `courseIds()` like `villa`.

## Rules

1. **Day openings.** `DayDef` gains `opening?: { goalId: string; courseId: string }[]`.
   - At the morning of a day with an opening, the director builds the first opening world instead of the villa.
   - Finishing a world marks its goal done and moves to the next.
   - Finishing the last opening world moves to the villa.
   - A day lost during an opening restarts at the first opening world.
2. **On-foot finish.** A `BuiltCourse` with `finishBy: 'players'` is won when every alive present player is inside the finish box, not by the vehicle. The arrival's vehicle is parked inside the finish, unseated. There is no fuel use.
3. **Free meals.** `GoalDef` gains `meal?: StoryItemKind`. Completing a `together` goal that has `meal` gives every present friend that meal's effect for free. Sunday's `tajine` goal uses `meal: 'tajine'`.
4. **Minigame goals.** `GoalDef.kind` gains `'minigame'`, with `minigame: 'primegolf'`. Using the gate when its `after` is done fades to the `primegolf` world. The clock pauses there (41a's pause). The game's end returns the group to the villa and marks the goal done.
5. **PrimeGolf state** is pure and lives in `story/primegolf.ts`:
   - `startGolf(present: CharacterId[]): GolfState` builds the turn order in character order, with 6 balls each.
   - `golfTurn(state)` returns whose turn it is.
   - `scoreLanding(pos: {x, z}, rings): { ring: string | null; points: number }` scores a landing.
   - `recordBall(state, id, points): GolfState` records a ball.
   - `skipFriend(state, id)` skips a friend's remaining balls.
   - `golfResults(state, week): Week` applies the end effects and returns the new week.
6. **A shot.**
   - **Client message:** `{ type: 'golfShot'; yaw: number; power: number; curve: number }`, where power is in [0, 1] and curve is in [−1, 1]. It is accepted only from the player whose turn it is, and only when no ball is in flight.
   - **Physics:** the server launches a Rapier dynamic sphere from the tee at `power × GOLF_MAX_SPEED`, at `GOLF_LAUNCH_PITCH`, on heading `yaw`, with a sideways acceleration of `curve × GOLF_CURVE_ACCEL` until it first touches the ground.
   - **Landing:** the first ground contact is scored with `scoreLanding`. A ball not landed after `GOLF_SETTLE_SECONDS` scores 0.
   - **Snapshot:** it carries `golf?: { turn: CharacterId | null; ball: Vec3 | null; scores: Record<CharacterId, number[]> }`.
   - **Events:** `golfLand { pos, ring, points }` and `golfEnd { scores }`.
7. **PrimeGolf world.**
   - The course `primegolf` holds:
     - the bay (a mat, a screen and a waiting area behind it);
     - a 240 × 80 m field;
     - ring targets, which are visual only (scoring is by position);
     - no vehicle use.
   - Players not on turn are free to walk in the waiting area. The player on turn is placed at the tee and cannot move while aiming.

## Tests (write first)

### Shared (`packages/shared/src`)

1. `story/primegolf.test.ts`:
   - The turn order, and 6 balls each.
   - `scoreLanding` scores each ring, the centre double, the jackpot, a miss and the ring edges.
   - `skipFriend` skips the friend's remaining balls.
   - The results:
     - best +15;
     - the worst pays coffee for everyone, clamped at his cash and never below zero;
     - the team bonus formula;
     - a single player gets only the team bonus.
2. `world.golf.test.ts`:
   - A shot is accepted only from the player on turn, and refused while a ball is in flight.
   - A full-power straight shot lands between 170 and 230 m.
   - A curve of +1 lands to the right of a straight shot.
   - A landing is scored once.
   - A ball that never lands counts as a miss.
3. `courses/reverse.test.ts`:
   - Reversing twice gives back the original defs.
   - The reversed `airport-road` builds.
   - Its route is the original route reversed, within 0.5 m after aligning the start to the original finish.
   - Every extra lies within its segment and on the correct side.
   - The fuel chain gap of `airport-home` is at most `FUEL_MAX_GAP`.
4. `courses/reverse.drive.test.ts`:
   - Lodgy drives `airport-home` segment by segment, the way the step 40 stage drive tests do.
   - It has no kill-plane reset on the drivable segments.
5. `courses/arrival.test.ts`:
   - The course builds and is story-only.
   - The rental stop's finish box contains the Lodgy.
   - A scripted walker reaches the finish from the start (grid walk as in `villa.test.ts`).
   - An enemy plan exists at the arrival density.
   - `finishBy: 'players'` wins only when all alive present players are inside the box.
6. `story/days.test.ts` (changed): Sunday's day definition, its opening, the `meal` goal, and `after` gating for `primegolf`.

### Server

7. `room.story.test.ts` (new cases):
   - The Sunday opening runs arrival → airport-home → villa.
   - Losing the day in an opening restarts at the arrival.
   - The tajine meal is given to the present friends.
   - The gate starts PrimeGolf only after the tajine.
   - The clock is paused in PrimeGolf.
   - A full golf game with 2 players ends with the results applied and the group back at the villa.
   - A disconnect mid-golf skips that friend's balls.

### Client

8. Client tests:
   - The power meter (pure: the fill cycle and the release value).
   - The scoreboard view.
   - Aim input to the `golfShot` message.
   - The hudLayout e2e with the golf HUD at 667 px and on desktop.
9. `protocol.test.ts` (changed): `golfShot`, `golfLand`, `golfEnd`, and the snapshot's `golf`.

### Existing tests and review focus

10. Existing tests that change are named in each report. Day 1 now plays Sunday, and the test day stays as day 0 for tests and `?storytest`.

Review focus (each pinned in test 7 or 2):
- Night falling in an opening world: the group goes to the villa, `arrive`/`driveHome` stay unfinished and count as missed.
- A shot sent by a player not on turn.
- Every player leaving mid-golf.
- A ball landing exactly on a ring's edge.

## Tasks

| Task | Package | Order | Covers |
|---|---|---|---|
| 1 | shared | first; parallel with 2 and 5 | `reverse.ts`, `airport-home`, `arrival.ts`, `finishBy`; tests 3, 4 and 5 |
| 2 | shared | first; parallel with 1 and 5 | `story/primegolf.ts`, the `primegolf` course, golf in the world (shot, ball, landing, snapshot, events), the protocol; tests 1, 2 and 9 |
| 3 | server | after 1 and 2 | day openings, the meal, minigame goals and Sunday's `DayDef`; tests 6 and 7 |
| 4 | client | after 3 | see below |
| 5 | assets | parallel from the start | see below |
| 6 | main session | last | see below |

**Task 4 (client):**
- the arrival and `airport-home` rendering (airport theme);
- the golf HUD: power meter, aim arrow, curve tap and scoreboard;
- the ball and its trail, the follow camera, and the ring targets;
- tests 8;
- screenshots: the arrival fight, the reversed road, the tajine, a golf shot in flight, the scoreboard, the results, and a phone shot.

**Task 5 (assets):** from Sketchfab, the most downloaded usable model of each (CC0 or CC BY, phone budget, credited):
- golf ball;
- golf club (driver);
- driving-range target flag or ring;
- the bay (mat and screen, or a booth);
- airport terminal facade (for the arrival hall);
- rental car sign or booth.

**Task 6 (main session):**
- ROADMAP row 41b set to `needs sign-off`, with a decision line;
- the Story mode toggle shown to everyone (no longer only with `?storytest`), since Sunday exists;
- one short Sonnet review;
- push, PR and merge.

## Not in this step

- Monday to Saturday.
- Driving to PrimeGolf (the gate fades straight there).
- Betting on golf.
- A real airport map.
