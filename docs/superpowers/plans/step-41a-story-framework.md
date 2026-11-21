# Step 41a: the story mode framework

**Spec:** `docs/superpowers/specs/2026-11-21-story-mode-framework-design.md` (approved 2026-11-21), plus `docs/superpowers/specs/2026-11-18-story-mode-design.md` for the characters, traits and items.

**Scope.** This step builds the story framework and a short test day. The test day exercises every part of the framework so it can be played end to end. Sunday (the on-foot arrival, the reversed airport road, the tajine, PrimeGolf) is step 41b, after its own PrimeGolf design talk.

**Process (owner).** One short Sonnet review for the whole step, with no Opus plan or branch review. Tasks run in parallel where marked. Each task is TDD with Conventional Commits, and runs the full checks before each commit.

## Global constraints

- **Race mode is unchanged.** Every existing test passes unchanged except where a task names a test it changes.
- **Server authority.** The story director runs in the server's `room` layer. It imports nothing from Node or `ws`, just like the rest of `room`.
- **Friends.** The week is keyed by `CharacterId` (`packages/shared/src/characters.ts`: `sounile`, `rafael`, `nandan`, `alexander`, `luiz`, `huu`).
- **Money.** Amounts are whole dirhams. Each friend's bank starts at `STORY_BANK_START = 2000`, and their cash starts at 0.
- **Name.** The in-game name of the stock-picking app is "Fake Republic".
- **Tuning.** The tuning values below are starting values. Do not retune; feel is the owner's call.

## Constants (`packages/shared/src/story/constants.ts`)

**Day and clock**

| Constant | Value | Meaning |
|---|---|---|
| `STORY_DAY_SECONDS` | 600 | Real seconds from morning to night. |
| `STORY_MORNING_HOUR` | 8 | Shown clock time at morning (08:00). |
| `STORY_NIGHT_HOUR` | 23 | Shown clock time at night (23:00). |

**Needs** (0–100 each)

| Constant | Value |
|---|---|
| `NEED_START` | `{ health: 100, food: 80, happiness: 70, tiredness: 10 }` |
| `FOOD_FALL_PER_SECOND` | 0.1 (60 per day) |
| `HUNGER_BELOW` | 25 |
| `HUNGER_HEALTH_PER_SECOND` | 0.2 |
| `TIRED_RISE_PER_SECOND` | 0.06 (36 per day) |
| `TIRED_SLOW_ABOVE` | 80 |
| `TIRED_SLOW_FACTOR` | 0.85 (walk and sprint) |
| `SLEEP_TIREDNESS` | 10 |
| `MISSED_GOAL_HAPPINESS` | −10 per present friend |
| `GOAL_DONE_HAPPINESS` | +5 per present friend |

**Vibecoding**

| Constant | Value |
|---|---|
| `VIBECODE_TICK` | 10 s at a laptop gives happiness +5 and tiredness +4 |

**Traits**

| Constant | Value | Meaning |
|---|---|---|
| `RAPH_FOOD_FACTOR` | 1.5 | Rafael's food falls 1.5× faster. |
| `RAPH_ANGER_PER_SECOND` | 1 | Rafael's anger rise per second while his food is below 30. |
| `RAPH_ANGER_FALL_PER_SECOND` | 2 | Rafael's anger fall per second otherwise. |
| `SACHA_SPEND_WINDOW` | 120 s | Since Alexander's last phone purchase. Outside it, his happiness falls 1 per 20 s. |
| `HUU_PHRASE_WINDOW` | 90 s | Since Huu's last "le mal est fait" phrase. Outside it, his happiness falls 1 per 20 s. |
| `LOUIS_COMPLAIN_COOLDOWN` | 20 s | Each complaint raises Luiz's happiness by 2. |
| `COFFEE_FAST` | ×1.25 for 60 s, then ×0.85 for 30 s | Coffee effect for everyone; Luiz's "caffeine" meter shows it. |
| `SUNIL_CODE_FALL_PER_SECOND` | 1/6 | Sounile's code bar fall per second. A vibecode tick refills 25. At 0 his health falls 0.2 per second. |

**Fake Republic and down time**

| Constant | Value | Meaning |
|---|---|---|
| `FAKE_REPUBLIC_BELOW` | 200 | Shown when cash + bank is under this. |
| `FAKE_REPUBLIC_OUTCOMES` | `[0, 300, 600, 1000]` | Paid into the bank. |
| `FAKE_REPUBLIC_WEIGHTS` | `[0.25, 0.35, 0.25, 0.15]` | Chance of each outcome. Once per day per friend. Never negative. |
| `STORY_DOWN_LOSE_SECONDS` | 60 | A friend downed this long without a revive loses the day. |

**Prices (dirhams)**

| Item | Price |
|---|---|
| fromageBlanc | 15 |
| kokeZero | 10 |
| treedent | 8 |
| nutellaCrepe | 25 |
| tajine | 80 |
| water | 5 |
| tea | 10 |
| coffee | 15 |

Pizza from the chef is free and only for Nandan. Sacha's phone shop has three items: tcgPack 150, shirt 600, suit 1500.

## Behaviour rules

### Week state (pure, `packages/shared/src/story/week.ts`)

**W1. The `Week` type:**

```
{ version: 1; day: number; clock: number;
  friends: Record<CharacterId, FriendState>;
  goals: GoalState[]; finishedDays: number[];
  morning: Week | null }
```

**W2. The `FriendState` type:**

```
{ health; food; happiness; tiredness;
  cash; bank;
  anger; code; caffeine: { fast: number; slow: number };
  lastSpend; lastPhrase; lastComplain;
  fakeRepublicDay: number | null;
  items: ItemKind[] }
```

**W3.** `newWeek(): Week` starts at day 1 with every friend at `NEED_START`, cash 0 and bank 2000.

**W4.** `stepNeeds(week, dt, present: CharacterId[], activity: Partial<Record<CharacterId, Activity>>): Week` applies the rates above to present friends only. Absent friends are frozen. `Activity` is `'idle' | 'vibecoding' | 'exerting'`; exerting doubles the tiredness rise.
- It applies the traits for Rafael (food factor and anger), Alexander, Huu, Sounile and the coffee effect.
- Hunger costs health below `HUNGER_BELOW`.

**W5.** The interactions are pure functions returning a new `Week`, or a refusal reason:
- `eat(week, id, item)`: food, health and power-up effects come from the existing item rules, and the tajine heals.
- `buy(week, id, item)`: refused when cash is short.
- `withdraw(week, id, amount)`: moves bank to cash; refused beyond the bank.
- `phoneBuy(week, id, shopItem)`: Alexander's shop; sets `lastSpend`.
- `sayPhrase(week, id, now)`
- `complain(week, id, now)`: refused within the cooldown.
- `vibecodeTick(week, id)`
- `fakeRepublic(week, id, pick: 0|1|2, rand)`: refused unless cash + bank is under 200 and not yet used today. `pick` only changes the shown chart. The outcome comes from `rand` with the weights.

**W6.** `endDay(week, missed: string[]): Week`:
- applies `MISSED_GOAL_HAPPINESS` per missed goal to present friends;
- sets tiredness to `SLEEP_TIREDNESS`;
- adds the day to `finishedDays`;
- moves to the next day with clock 0 and `morning` set to a copy of the result.

**W7.** `loseDay(week): Week` returns the copy in `week.morning` (the week as it was this morning).

**W8.** `serialiseWeek` / `parseWeek` produce and read JSON. `parseWeek` returns null for an unknown version or a malformed value.

### Days and goals (`packages/shared/src/story/days.ts`)

**D1. The `GoalDef` type:**

```
{ id; label; kind: 'spot' | 'outing'; spot?: SpotKind;
  courseId?: string; needs?: CharacterId[]; together?: boolean;
  after?: string }
```

- `together` means every present friend must stand within 3 m of the spot.
- A goal is skipped if any friend in `needs` is absent.

**D2.** `STORY_DAYS: Record<number, DayDef>`. The day's goals come from this table. 41a ships only day 0, the test day, reachable from the lobby only in dev builds and tests. Its goals:
1. `vibecode` (spot laptop, any friend);
2. `eat` (spot kitchen, together);
3. `outing` (courseId `desert`, the Lodgy at the gate, `after: eat`);
4. `sleep`, which is implicit and not a goal.

### The villa world (shared, `packages/shared/src/courses/villa.ts`)

**V1.** `villa` is a `BuiltCourse` of about 80 × 60 m.
- **Ground:** flat ground boxes, with no corridor and no ambient.
- **House:** a single-storey house made of wall boxes with door gaps, and a pool. The pool is a sunken box with a low wall that players can step out of: a step under `PLAYER_STEP_HEIGHT` 0.3 on one side.
- **Terrace and grounds:** the terrace, the lawn, the pickleball court (floor box), the gym pavilion (wall boxes with a door gap) and the gate.
- **Lodgy:** the Lodgy is placed at the gate as the course's vehicle spawn.
- **No race:** no checkpoints beyond `cp-0`, no finish, no coins and no hazards.

**V2.** `BuiltCourse` gains `spots?: Spot[]`. A spot is `{ id; kind: SpotKind; pos: Vec3; radius: number }`, and `SpotKind` is `'kitchen' | 'chef' | 'laptop' | 'bed' | 'couch' | 'board' | 'atm' | 'shop' | 'gate'`.
- **Placement:** 6 laptops and 6 beds; the couch has 6 seat points.
- **Location:** the ATM and the shop are just outside the gate.

**V3.** The world gains a story option:
- `createWorld(..., { story: true })` disables the race win, fuel use and coins.
- The input `use` near a spot emits a new event `{ kind: 'spot'; playerId; spotId; spotKind }`.
- The director acts on that event; the world never changes needs.

### The story director (server, `packages/server/src/room/story.ts`)

**S1. Story mode.** `RoomSettings` gains `mode: 'race' | 'story'` (default `race`). In story mode, Start loads the saved week, or `newWeek()`, and builds the villa world.

**S2. Present and absent friends.** The present friends are the characters of the connected players.
- **At the villa:** absent friends are drawn on the couch. The snapshot gains `absent: CharacterId[]`, and the client places their figures on the couch seats.
- **Outside the villa:** a toast "X is at the WC" goes out once per outing.

**S3. Clock and needs.** Every tick advances `week.clock` by `dt` except inside a minigame world (none in 41a). The director calls `stepNeeds`. Activity is `vibecoding` while a player holds `use` at a laptop, and `exerting` while sprinting or driving.

**S4. Spot events.**

| Spot | What happens |
|---|---|
| kitchen | eats the cheapest food, paid from cash |
| chef | pizza, Nandan only |
| laptop | a vibecode tick every 10 s held |
| atm | withdraws 500 or the rest of the bank |
| shop | opens the shop menu |
| board | shows the goals |
| bed | at night only, sleep |
| gate | starts the outing goal whose `after` is satisfied |

A spot that completes a goal marks it done and gives `GOAL_DONE_HAPPINESS`.

**S5. Outings.** Starting an outing switches the room to the outing's stage world, with every present player seated as at a stage start. This reuses step 40's switch: the `stage` message (`index` 0, `of` 1) and the carry.
- **Carry in:** the carry gains each friend's needs. Stage health maps to the friend's health.
- **Return:** reaching the stage's finish, or night, switches back to the villa with the needs written back. The outing goal is then done.

**S6. Night.** When the clock reaches `STORY_DAY_SECONDS`:
- **Outside the villa:** the group is returned to the villa.
- **At the villa:** players get the prompt "Go to bed". When every present player has used a bed, or 60 s have passed after night, `endDay` runs and the room returns to the lobby with a day summary. This is a new server message:

```
{ type: 'daySummary'; day; done: string[]; missed: string[]; skipped: string[] }
```

**S7. Losing the day.** A present friend downed for `STORY_DOWN_LOSE_SECONDS` loses the day. `loseDay` runs, and the room shows "Day lost" and rebuilds the villa at the morning.

**S8. Rafael's anger.** When his anger reaches 100, his shots can hit allies until his food is at 30 or more. This is the only friendly fire.

**S9. Saving.** Saving goes through the store interface `WeekStore { load(noun): Promise<string | null>; save(noun, json): Promise<void> }`, passed to `createRoom` in `RoomConfig.weekStore` (default: in memory).
- **When it saves:** at `endDay`, at `loseDay`, and when the room empties.
- **Progress inside a day:** it is not kept; loading resumes at the morning.
- **Cloudflare:** the worker implements the store with `state.storage`.
- **Resetting:** the admin can send `{ type: 'resetWeek' }` from the lobby.

**S10. Lobby.** The lobby message gains `story?: { day: number; finishedDays: number[] }` when `mode` is `story`.

### Client

**C1. Lobby.** A mode toggle (Race / Story), admin-only. In story mode the lobby shows the day number and the finished days, plus a "Reset week" button behind a confirm. The day 0 test day appears only with `?storytest`.

**C2. HUD in story mode.**
- The four needs as small icon bars, beside the existing health bar.
- Cash and bank.
- The clock as hh:mm from 08:00 to 23:00.
- The trait meter, if any: Raph's anger is hidden (shown only as a red face at 80+); Sunil's code bar is hidden; Louis shows caffeine.
- A goal list, collapsed on phones into a "Goals" button.
- All of it uses the step 35 theme tokens and must pass the hudLayout overlap test at 667 px.

**C3. Phone menu** (key P, plus a touch button):
- money;
- ATM history;
- the shop (Alexander only);
- Fake Republic, shown only under 200 dirhams. It offers three fake stocks, then a 3 s animated chart that ends at the outcome.

**C4. Villa rendering.** Walls, pool water and the terrace use the existing materials and the new models from task 5. Spot markers are shown as a small icon above each spot within 6 m.

**C5. New buttons and prompts.**
- **Complain button** (Luiz, key C): shows a speech bubble with a random complaint from a list of 12 in English.
- **"Le mal est fait":** reuses the existing step 34 quick phrase. Saying it updates `lastPhrase`.
- **Absent friends:** their figures sit on the couch seats.

### Assets (task 5, in parallel)

Search Sketchfab for the most downloaded usable model (CC0 or CC BY, phone budget; take the most reliable usable one when the top one is not usable). Credit and optimise them as in step 40. The list:
- couch;
- kitchen island;
- dining table and chairs;
- bed;
- laptop;
- pool lounger;
- parasol;
- olive tree;
- ATM;
- small shop front;
- pickleball net;
- gym equipment (one piece).

## Tests (write first)

1. `story/week.test.ts`:
   - W3: start values.
   - W4: rates over 60 s, absent friends frozen, every trait, coffee.
   - W5: each interaction, its refusals, and Fake Republic once per day, weighted and never negative.
   - W6: end of day.
   - W7: lose returns this morning.
   - W8: round trip, plus null for a bad version.
2. `story/days.test.ts`:
   - A goal is skipped when a needed friend is absent.
   - `after` gating.
   - A `together` goal is done only with all present friends near.
3. `villa.test.ts`:
   - The course builds, with no race elements.
   - Spot counts.
   - A player spawned in the house can walk to every spot (raycast along a straight path, or a scripted walk).
   - A player can climb out of the pool.
4. `world.story.test.ts`:
   - `use` at a spot emits the `spot` event.
   - No win, fuel use or coins with `story: true`.
5. `room.story.test.ts`, with small injected courses and a memory `WeekStore`:
   - S1–S9, one case each.
   - Rafael's friendly fire happens only when his anger is at 100.
   - A save round trip across two rooms with the same noun.
6. `protocol.test.ts` (changed):
   - `mode`, `resetWeek` and `daySummary`.
   - The lobby's `story` and the snapshot's `absent`.
7. Worker: `storyStore.test.ts`, the store backed by a fake storage.
8. Client tests:
   - The needs HUD view (pure).
   - The clock text.
   - Fake Republic shown or hidden.
   - The complaint list.
   - The lobby mode toggle.
   - hudLayout e2e with the story HUD (desktop and the 667 px phone).
9. Existing tests that change: fixtures gaining `mode: 'race'` (each named in the task report). No test is skipped.

## Review focus

1. A player disconnects during an outing. Their friend becomes absent at once, the outing continues, and the friend's needs freeze at the values reached.
2. Two players pick the same friend: refused as today (`character_taken`).
3. The room empties mid-day and someone opens it later: the week resumes at that morning. A save written mid-switch never holds half a day.
4. Night falls exactly as a stage is won: one return to the villa, not two.
5. A `parseWeek` of corrupt storage gives a fresh week and a server log line, never a crash.

Each of these gets a case in `room.story.test.ts` (1, 3 and 4), `lobby.test.ts` (2) or `story/week.test.ts` (5).

## Tasks

| Task | Package | Runs | Covers |
|---|---|---|---|
| 1 | shared | first | W1–W8, D1–D2, tests 1, 2 and review focus 5 |
| 2 | shared | after 1, parallel with 3 | V1–V3, tests 3 and 4 |
| 3 | server and worker | after 1, parallel with 2 | S1–S10, tests 5–7 and review focus 1–4 |
| 4 | client | after 2 and 3 | C1–C5, test 8, plus screenshots |
| 5 | assets | parallel from the start | the asset list |
| 6 | main session | last | below |

Task 4's screenshots: the villa at morning, the HUD, the phone with Fake Republic, absent friends on the couch, the day summary, and one phone shot.

Task 6:
- ROADMAP rows 41a and 41b, plus the performance row ("used only if needed");
- 41a set to `needs sign-off`;
- a decision line;
- one short Sonnet review;
- push, PR and merge.

## Not in this step

- Sunday and PrimeGolf (41b).
- The other days.
- Minigame worlds. The clock pause exists but is tested only with a stub.
- Sacha's outfit picker (Monday).
- The Atacadão.
