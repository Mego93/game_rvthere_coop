# Five stages and the round-3 fixes: design

Status: draft for the owner's approval (2026-11-18). Builds on the main spec `2026-11-11-lodgy-coop-design.md`.

## Intent and why

After playing steps 32–35 the owner said the single 22 km road is too long and too plain: too many Souleymans, the road itself never uneven, too few obstacles, lonely goats, riderless scooters, a Lodgy that feels slow and flat. They want a main game made of five short stages, each packed with mechanics (holes, bridges, mountains, uneven and slippery roads, enemies), playable as one chained run or one stage at a time. A separate story mode (7 days of the real trip) comes later and will reuse these stages; it is out of scope here.

Success: a run is 15–25 minutes in five distinct places, each stage feels busy and different, the Lodgy feels fast and alive, and the obstacles cannot be skipped.

## Goals

1. Round-3 fixes to the current game (part A).
2. Five stages as five courses chained in the campaign, each 3–5 minutes of driving (part B).

## Non-goals

The story mode (days, stats, traits, minigames); combat or weapons for players; new vehicles; Paris and Dubai (set aside).

## Anti-goals

- A long uniform drive (what exists today).
- Obstacles that can be driven round (the step 32 banks and walls stay the rule).
- Losing the real places: stages that were real on the trip stay real.

## Constraints

- Six players, one shared vehicle, authoritative server, phones (iPhone landscape) and desktop; Cloudflare Durable Objects (128 MB per isolate, CPU per request).
- Snapshot size limits (full snapshot under 32 KB with drops and animals); per-tick world step near today's cost.
- The project's workflow (plan, Opus review, Sonnet tasks with reviews, Opus branch review, merge after each step).

## Approaches (for the stages)

- A. Cut the real route into five stretches: real, cheap, but the route is flat (no mountains, no forest).
- B. Hand-build five stages with the segment builder: most freedom, most work, loses the real places.
- C. Mixed (chosen by the owner): stages 1, 4 and 5 are real stretches of the villa→airport route; stage 3 is the real Ourika valley road (fetched like the main route, so it truly climbs; the story's Thursday reuses it); stage 2 is hand-built around bridges and a river.

## Part A: round-3 fixes (owner decisions in bold, the rest are my calls)

1. **Fewer Souleymans**: he stands only at stage starts and at one mid-stage save point per stage, not at every segment checkpoint. Checkpoints still exist per segment (silent, for restarts); only the saving-figure ones show him. (My call: the toast and sound play only at his checkpoints.)
2. **Uneven, mixed road**: the road itself alternates asphalt with dirt stretches (a new `dirt` surface: lower grip, some rolling resistance, a different texture) and gets gentle bumps and dips (small slope changes and a few road-level holes) so it is never flat for long. Mud patches stay.
3. **More obstacles**: denser hazards per kilometre, **goats in herds** (3–6 crossing together), **scooters with a rider** (a seated figure on each scooter mesh), plus parked cars and carts narrowing the lane in the city.
4. **No coins from inside the car**: a seated player never collects coins; only players on foot do.
5. **Admin mode**: the room admin can toggle a mode that lets them fly (free movement up/down, no gravity, no collisions with the world while flying), have infinite items (using an item does not consume it) and refuel/repair at will. Server-authoritative; other players see the admin flying. (My call: it is off by default, shown with a badge, and never counted in results.)
6. **First/third person toggle**: a key (V on desktop, a button on phones) switches the camera between first person and third person, on foot and in the vehicle. Reuses the step 26 first-person camera.
7. **Faster, livelier Lodgy**: higher top speed and acceleration (my call: about +40 % top speed, tuned so it still handles the stages), a dashboard with a speedometer and a rev counter with gears (simulated automatic gearbox from wheel speed), suspension bobbing of the body and a little camera shake at speed.

## Part B: five stages

| # | Stage | Source | Ground and look | Mechanics |
|---|---|---|---|---|
| 1 | Desert | real stretch from the villa | sand and dirt tracks, dunes | holes, mud, goat herds, rocks |
| 2 | Bridge and forest | hand-built | river valley, palms and trees | bridges (some broken: crates or the winch to cross), a ford, a river to avoid |
| 3 | Mountains | real Ourika road | narrow climbing road, hairpins, drops, rain | steep climbs (winch anchors), rockfalls, slippery dirt, tight passing |
| 4 | City | real stretch in Marrakech | streets and alleys | scooters with riders, traffic, parked cars, roadblocks, enemies on foot |
| 5 | City to airport | real stretch | a faster road out of town | final obstacles, the airport finish |

- Each stage is its own course (3–5 minutes of driving, about 2–4 km), with the step 32 solid land, banks and walls, and its own decor (desert, valley, mountain, city).
- The campaign chains them (desert → airport) as today's "next" flow; the lobby can start any single stage. Fuel, health and coins carry over between stages in a chained run (my call; restarting a stage alone starts full).
- **Enemies** (my call, to be confirmed by the owner): people on foot, not combat: they step into the road, grab onto the vehicle to slow it, or snatch an item from a player on foot; players push them away (the existing push) and the vehicle knocks them aside like animals (a small health cost). They appear in the city and near the stage-3 villages.
- Bridges are a new segment type (deck over a gap or river, railings; a broken bridge has a gap that crates, a plank prop or the winch must solve).

## What is left to the builder (the plans)

Exact constants (speeds, grip, densities), segment lists per stage, the Ourika route fetch, enemy behaviour details, the dashboard's look within the step 35 theme, test lists, and the order of tasks (part A first, then the stages one by one).

## Open with the owner

- Enemy behaviour as proposed above (not combat).
- Whether fuel, health and coins carry over between stages in a chained run.
