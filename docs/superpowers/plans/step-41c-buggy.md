# Step 41c: Monday part 1, the buggy race and lunch at the camp

**Spec:** `docs/superpowers/specs/2026-11-22-monday-design.md` (the 41c part and "Settled after the builder check"), on top of the merged 41a and 41b.

**Process (owner):** one short Sonnet review for the step; tasks run in parallel where marked. Use TDD and Conventional Commits, and run the full checks before each commit.

## Monday in this step

Day 2 (`STORY_DAYS[2]`) has two goals:

1. `buggy`, label "Buggy race in Agafay". It is a minigame started at the villa gate. The group switches to the `agafay` world in the `buggy` vehicle, and the day clock pauses.
2. `lunch`, label "Lunch at the desert camp". The race's finish leads to the `camp` world. Eating together at the camp table is a free meal (`meal: 'tajine'`; Ishan gets pizza, as on Sunday). Five seconds after the lunch, the group returns to the villa.

The tailor and the souk come in 41d. Until then, the rest of Monday is free time at the villa, then sleep.

## Constants

### The buggy (`packages/shared/src/vehicles.ts`)

- `VehicleId` gains `'buggy'`, a new `VEHICLES.buggy` entry with six seats.
- Targets for the starting values (the plan fixes the targets; the implementer fits the config to them and reports the numbers):

| Target | Value |
|---|---|
| Top speed | 33 m/s (about 120 km/h) |
| 0–100 km/h on flat dirt | 6 ± 0.5 s |
| Grip on dirt and sand | the Lodgy's road grip or better |

- Long suspension travel and a low, wide body. The race world uses this vehicle. The race lobby does not offer it (`VEHICLE_IDS` used by the lobby excludes `buggy`).

### The race (`packages/shared/src/story/buggyRace.ts`)

| Constant | Value |
|---|---|
| `RACE_MEDALS` | gold under target, silver under target × 1.25, bronze otherwise |
| `RACE_HAPPINESS` | `{ gold: 10, silver: 5, bronze: 0 }` |
| `RACE_SLOW_FACTOR` | 2 |
| `RACE_SLOW_HAPPINESS` | −5 (a time over target × 2) |
| `LUNCH_RETURN_SECONDS` | 5 |

### The Agafay course (`packages/shared/src/courses/agafay.ts`)

- Story-only, theme `desert`.
- Hand-built from road segments like the step 40 valley: about 3.5–4 km, with dirt and sand surfaces, hills as crests (jumps), rocks, two tight turns and mud.
- No fuel stops, because the race is short. The buggy is given full fuel and fuel burn is off in this world, as in story worlds.
- `targetTime`: measure the scripted buggy's whole-course time, multiply by 1.3 and round to 5 s. It must fall within 150–210 s. If it does not, change the segment list (not the buggy) until it does, and report the measured time.

### The camp (`packages/shared/src/courses/camp.ts`)

- A story-only walkable world of about 40 × 30 m, like the villa: a tent made of wall boxes, the table spot `kitchen` (id `camp-table`), and the parked buggy.
- `spots` holds only the table.

## Rules

1. **Day definition.** `GoalDef` gains `venue?: string`, the course id of the world where a spot goal is done. Without a venue, the goal is done at the villa. `minigame` gains `'buggyRace'`. `STORY_DAYS[2]` is as above. The `lunch` goal has `venue: 'camp'`, `after: 'buggy'`, `together: true` and `meal: 'tajine'`.
2. **Starting the race.** Using the gate when the `buggy` goal is ready switches to `agafay`. The world is built with vehicle `buggy`, every present player seated (driver first, by join order), and story outing settings: enemies off and the race win on. The clock and needs pause, as in PrimeGolf. Absent friends are at the WC.
3. **The race timer and finish.** The race time is the world's elapsed time at its win. On the win, the director:
   - applies `raceResult(timeSeconds, targetTime): { medal: 'gold' | 'silver' | 'bronze'; happiness: number }` to every present friend;
   - marks `buggy` done;
   - sends the server message `{ type: 'raceResult'; time: number; target: number; medal: string }`;
   - switches to `camp`.

   Restart-checkpoint and the stuck reset work as in the race. Night cannot fall, because the clock is paused.
4. **Lunch at the camp.** In the `camp` world, spot events complete pending goals whose `venue` is `camp`, exactly as villa spot goals do (together, with the free meal). When `lunch` is done, the group returns to the villa after `LUNCH_RETURN_SECONDS`.
5. **Days with no definition.** Day 3 and later still show "coming soon". Monday's goals are only these two until 41d.

## Tests (write first)

### Shared

1. `story/buggyRace.test.ts`. `raceResult` boundaries:
   - just under target is gold;
   - exactly target is silver;
   - under target × 1.25 is silver;
   - target × 1.25 is bronze;
   - target × 2 is bronze with 0;
   - just over target × 2 is bronze with −5.
2. `vehicles.buggy.test.ts`:
   - the buggy has 6 seats and is not offered in the lobby;
   - the measured 0–100 on flat dirt is 6 ± 0.5 s;
   - the top speed is reached within 1 m/s of 33;
   - the grip on sand is at least the Lodgy's road grip;
   - the Lodgy's own numbers are unchanged (pin the existing Lodgy measurement).
3. `courses/agafay.test.ts`:
   - the course builds, is story-only and has no fuel stops;
   - the scripted buggy drives it start to finish with no kill-plane reset;
   - the target time is the measured time × 1.3, rounded to 5 s, and lies within 150–210 s;
   - it has at least three crests where the buggy leaves the ground (airtime above 0.2 s).
4. `courses/camp.test.ts`: the camp builds, is story-only, and the table spot can be reached on foot from the spawn (a grid walk, as in `villa.test.ts`).
5. `story/days.test.ts` (changed): Monday's definition, the `venue` field, and `after` gating.

### Server

6. `room.story.test.ts` (new cases):
   - the gate starts the race only on day 2, with everyone seated in the buggy;
   - the clock is paused during the race;
   - the win applies the medal happiness, sends `raceResult` and switches to the camp;
   - lunch together at the camp table is free with 0 cash and returns to the villa after 5 s;
   - a disconnect mid-race keeps the race going;
   - a camp spot event never completes a villa goal, and the reverse never happens either.
7. `protocol.test.ts` (changed): `raceResult`.

### Client

8. Client tests:
   - the race HUD view, which is pure: the timer text and the medal text;
   - the result panel view;
   - the hudLayout e2e with the race HUD at 667 px and on desktop.

### Review focus (each pinned in test 6)

- A race finished with only one friend present.
- Every player leaving mid-race and rejoining: the race resumes with the timer continuing.
- Night falling while the group is at the camp: the group goes to the villa, and lunch counts as missed.

## Tasks

| Task | Package | Runs | Covers |
|---|---|---|---|
| 1 | shared | first, parallel with 4 | the buggy vehicle, `buggyRace.ts`, `agafay`, `camp`; tests 1–4 |
| 2 | shared and server | after 1 | `venue`, Monday's `DayDef`, the director's race and camp flow, `raceResult`; tests 5–7 |
| 3 | client | after 2 | see below |
| 4 | assets | parallel from the start | see below |
| 5 | main session | last | ROADMAP row 41c as `needs sign-off` plus a decision line, one short Sonnet review, then push, PR and merge |

**Task 3 (client):**
- the buggy model in the vehicle renderer: seats, wheels and suspension visuals, reusing the vehicle rig;
- Agafay rendering with the desert theme, tents and camels beside the road;
- the camp scene;
- the race HUD: a big timer and the target time;
- the result panel with the medal;
- test 8;
- screenshots: the buggy, a jump, the result, the camp lunch and a phone shot.

**Task 4 (assets):** from Sketchfab, the most downloaded usable model for each of the following (CC0 or CC BY, phone budget, credited, logos neutralised):
- an off-road dune buggy with an open frame. Six seats are unlikely: take the best buggy and say so, and the client adds a rear bench in code;
- a Berber tent;
- a camel;
- a low Moroccan table with cushions.

## Not in this step

The tailor, the souk and the drive to Marrakech (41d). Racing against each other. Leaderboards.
