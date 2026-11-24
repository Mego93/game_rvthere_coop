# World art pass: nothing blocky, every map rich

Status: approved by the owner (2026-11-24). This design comes before the souk and tailor step (41d), so that those maps are built rich from the start.

## Intent

The owner finds the maps too simple. The Sunday arrival, for example, is a flat straight corridor of boxes. Every map, in story mode and in the Lodgy race mode, should look and feel like a real place:

- uneven ground;
- many props and items;
- real Sketchfab assets everywhere, with nothing blocky left;
- maps that play well, "like Dust 2": invented layouts built for play, inspired by the real places' look, with several routes, height changes, cover and landmarks.

The characters become non-blocky as well, with real animations. A final refactoring and performance step closes the series.

## Owner decisions (2026-11-23)

1. **Layouts:** invented and built to play well, inspired by the real places' look (Dust 2 as the reference for feel), not real map data.
2. **Scope:** every map, including the Lodgy race mode: the five stages, the Full route, `airport` and `segment-demo`, plus every story map (arrival, villa, camp, PrimeGolf, and the souk and tailor to come).
3. **Approach:** a shared library of Sketchfab props per theme, with dressing rules that place them on every map, plus a few hand-placed landmarks per map and real uneven ground on the walkable maps.
4. **Nothing blocky:**
   - Search Sketchfab for as many props as needed to replace every box-made or blocky asset.
   - Box-built buildings and walls become real building models. The boxes stay as invisible colliders.
5. **Characters:** the six friends, the enemies, the sellers and other NPCs become non-blocky human models with real animations, if possible.
6. **A final step** for refactoring and performance (load time and frame rate on phones), no longer only "if needed".

## Approaches

1. **A shared prop library plus dressing rules (chosen).**
   - Each theme gets 20–40 Sketchfab props. The themes are airport, city, souk, desert, forest, mountain, villa and golf.
   - Rules dress every map: dense near the play area and lighter further out.
   - Each map also gets a few hand-placed landmarks.
   - Walkable maps get uneven ground.
   - Phones show fewer props at a distance.
   - One system serves every map, including future ones.
2. **Hand-dress each map.** Most control, but slow: each map starts from zero. Rejected.
3. **Swap the models only.** Quick, but it fixes neither the emptiness nor the flat ground. Rejected.

## The design

### Prop library (client and assets)

- **Content:** a manifest of themed prop sets. Each prop has a key, a model, a real-world size, a theme, a role and a phone flag. The roles are `ground clutter`, `roadside`, `wall dressing`, `crowd`, `landmark` and `building`.
- **Picking models:**
  - From Sketchfab, the most downloaded usable model: CC0 or CC BY, credited, with logos neutralised.
  - If that is not usable, take the most reliable usable one.
  - The owner asks for as many props as it takes to leave nothing blocky.
- **Budgets:**
  - Each theme's props together stay within a download budget the plan sets, so phones still load quickly.
  - Each model stays within the existing per-model triangle and size checks, with documented exceptions.
- **Existing models:** Sketchfab models already in the game are kept. Code-built or box-made visuals are replaced.

### Dressing rules

- **Coverage:** every map is dressed from its theme by rules, deterministic per map (seeded).
- **Spacing:** props never block the route, a spot, a fuel stop, a checkpoint or a hazard. The existing clearance rules from steps 32 and 40 apply, and the plan extends them.
- **Density:** high near where players are (the road edge, the walkable area) and lower further out.
- **Phones:** a lower cap and a shorter draw distance. Instancing keeps the draw calls low.
- **Colliders:** props have no colliders, except where the plan says otherwise (for example, stall counters in the souk, which work as cover).

### Landmarks and buildings

- **Landmarks:** each map gets 2–5 hand-placed landmarks, so players always know where they are. Examples: the terminal with its diamond roof, a fountain, a mosque tower, the kasbah, a big palm.
- **Box-built visuals become real models:** the airport hall, the villa house, the camp tent, the PrimeGolf bay and the race courses' fences and barriers. Their physics boxes stay, invisible.

### Uneven ground on the walkable maps

- The walkable maps (arrival, villa grounds, camp, PrimeGolf and the souk) get real uneven ground:
  - gentle slopes;
  - steps and ramps up to raised areas;
  - sunken areas;
  - kerbs.
- Every spot, goal and route stays reachable on foot, and the existing walk tests are kept.
- The step height stays `PLAYER_STEP_HEIGHT`.

### Layouts that play well

- The arrival is rebuilt as a small airport district, so that it is no longer a straight line:
  - the terminal with several exits;
  - the forecourt with palm rows;
  - a taxi lane;
  - a raised car park with ramps;
  - the rental stop in a far corner, reached through the car park or around the back.
- Two or three routes run between the start and the finish, with cover and some height.
- The same rules apply to the souk and the tailor street when 41d builds them.

### Characters

- **Models:** non-blocky human models with real animations, from Sketchfab (CC0 or CC BY), or one shared rigged base with an animation set if no single source covers them all.
- **Animations needed:** idle, walk, run, jump, crouch, sit, drive, carry, the hold for items, aim and shoot with the handgun, a downed pose, revive, the four emotes, the golf swing, the knife attack, slip and fall, and death.
- **Recognising each friend (owner: B):** the new models keep skin colour, hair and beard (several hair and beard models per friend), glasses, top or clothes and their colours, and hat. Eyes and smile stop being options: each friend gets a fixed face texture instead.
- **Enemies and NPCs:** enemies, sellers and other NPCs use the same base with different clothes.
- **Fallback:** if no usable model or animation source covers what the game needs, the builder reports what is missing before replacing anything. The blocky figures stay until a replacement is complete.

### Final step: refactoring and performance

At the end of the series:

- measure load time and frame rate on phone and desktop for every map;
- refactor where the measurements miss the budgets, and remove dead code;
- tidy the modules that grew large (`world.ts`, `room.ts`, `story.ts`, `game.ts`).

The race mode must not get slower.

## Order (steps)

| Step | What |
|---|---|
| 43a | The prop library and dressing rules, the arrival rebuilt as the showcase (layout, uneven ground, landmarks, buildings) |
| 43b | The characters: new models and animations for the friends, enemies and NPCs |
| 43c | The race maps: the five stages, the Full route, `airport` and `segment-demo` dressed and de-blocked |
| 43d | The story maps: the villa, camp and PrimeGolf upgraded |
| 41d | The tailor and the souk, built to the new standard |
| 44 | Final refactoring and performance |

## Settled after the builder check (my calls)

**Uneven ground**
- It is a new shared ground type for the walkable maps: a heightfield or ramps and steps built in `shared`, used by the server physics and the client alike, like the step 32 corridor.
- Vehicles can drive on it where a map has one.
- No client-only fakery: what you see is what you stand on.

**The arrival may change**
- Its layout, spawn, enemy spawns and the rental-stop position may all change.
- These stay as they are:
  - the course id `arrival`;
  - `finishBy: 'players'`;
  - the goal ids;
  - the story flow.
- Its tests are rewritten to the new layout, and each changed test is named.

**Budgets** (the plan sets the numbers; the owner signs off on a real iPhone)
- Each map's extra download stays under a per-map cap.
- Phones get a prop cap and a shorter draw distance.
- Exceptions to the per-model checks are named one by one in the tests, as they are today.

**Assets**
- Agents search and download from Sketchfab through the API, as in steps 33–41.
- Each model is credited, and logos are neutralised.

**Characters**
- Animations are chosen on the client from the snapshot state the game already sends: seated, carrying, aiming, downed, emotes, golf turn, enemy state.
- No protocol change unless a plan names one.

**Density**
- Each plan sets a target, such as props per 100 m of road, or per 100 m² of walkable ground. The target is checked by a test.
- The owner judges the look. Each step (43a–43d) ends at `needs sign-off`.

**Order and existing steps**
- Step 44 replaces step 42 on the roadmap.
- 41d (the souk and the tailor) waits until 43a–43d land, so it is built to the new standard.
- The race-mode speed baseline is measured at the start of 43c, and 44 must not be slower than it.

## Goals, non-goals and anti-goals

**Goals:**
- No blocky asset visible anywhere.
- Every map dense and uneven.
- Recognisable landmarks.
- Phones stay playable.

**Non-goals:**
- Real map data for the walkable maps.
- New gameplay beyond what the layouts need.

**Anti-goals:**
- A map so cluttered that the route or a goal is hard to find.
- Phones dropping below playable frame rates.
- Props blocking a vehicle or a player in a way the old map did not.
- Characters losing what makes each friend recognisable.

## Left to the builder (the plans)

- The per-theme prop lists and their budgets.
- The dressing rule numbers.
- The exact arrival layout.
- The character source and the mapping of the customisation options.
- The performance budgets and measurements.
- The test lists.
