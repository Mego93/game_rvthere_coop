# Five stages and the round-3 fixes: design

Status: draft for the owner's approval (2026-11-18), updated with the owner's answers. Builds on the main spec `2026-11-11-lodgy-coop-design.md`.

## Intent and why

After playing steps 32–35 the owner said the single 22 km road is too long and too plain: too many Souleymans, the road itself never uneven, too few obstacles, lonely goats, riderless scooters, a Lodgy that feels slow and flat. They want a main game made of five short stages, each packed with mechanics (holes, bridges, mountains, uneven and slippery roads, enemies), playable as one chained run or one stage at a time. A separate story mode (7 days of the real trip) comes later and will reuse these stages; it is out of scope here.

Success: a run is 15–25 minutes in five distinct places, each stage feels busy and different, the Lodgy feels fast and alive, and the obstacles cannot be skipped.

## Goals

1. Round-3 fixes to the current game (part A).
2. Five stages as five courses chained in the campaign, each 3–5 minutes of driving (part B).

## Non-goals

The story mode (days, stats, traits, minigames); new vehicles; Paris and Dubai (set aside).

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
5. **Admin mode**: the room admin can toggle a mode that lets them fly (free movement up/down, no gravity, no collisions with the world while flying), have infinite ammo and infinite items (using an item does not consume it) and refuel/repair at will. Server-authoritative; other players see the admin flying. (My call: it is off by default, shown with a badge, and never counted in results.)
6. **First/third person toggle**: a key (V on desktop, a button on phones) switches the camera between first person and third person, on foot and in the vehicle. Reuses the step 26 first-person camera.
7. **Faster, livelier Lodgy**: 0 to 100 km/h in about 10 s on flat asphalt (owner), with a top speed above 100 km/h, tuned so it still handles the stages, a dashboard with a speedometer and a rev counter with gears (simulated automatic gearbox from wheel speed), suspension bobbing of the body and a little camera shake at speed.

## Part B: five stages

| # | Stage | Source | Ground and look | Mechanics |
|---|---|---|---|---|
| 1 | Desert | real stretch from the villa | sand and dirt tracks, dunes | holes, mud, goat herds, rocks |
| 2 | Bridge and forest | hand-built | river valley, palms and trees | bridges (some broken: crates or the winch to cross), a ford, a river to avoid |
| 3 | Mountains | real road from the Ourika valley to Kasbah Bab Ourika (owner), ending in tight, steep village lanes | narrow climbing road, hairpins, drops, rain | steep climbs (winch anchors), rockfalls, slippery dirt, tight passing |
| 4 | City | real stretch in Marrakech | streets and alleys | scooters with riders, traffic, parked cars, roadblocks, enemies on foot |
| 5 | City to airport | real stretch | a faster road out of town | final obstacles, the airport finish |

- Each stage is its own course (3–5 minutes of driving, about 2–4 km), with the step 32 solid land, banks and walls, and its own decor (desert, valley, mountain, city).
- The campaign chains them (desert → airport) as today's "next" flow; the lobby can start any single stage. Fuel, health and coins carry over between stages in a chained run (my call; restarting a stage alone starts full).
- **Enemies and combat** (owner: players shoot on foot; enemies attack on foot with knives, run at you and can slip; a bit cartoon): see Part C.
- Bridges are a new segment type (deck over a gap or river, railings; a broken bridge has a gap that crates, a plank prop or the winch must solve).

## Part C: combat and power-ups

Owner's answers: players shoot, on foot; enemies are people on foot who attack with knives, run at you, and can slip and fall; the tone is a bit cartoon. New power-up items (owner): Trident gum (speed), fromage blanc (shield), Coke Zero (double damage), tajine (health; it replaces the step 34 tajine speed boost, Trident takes over speed).

1. **Guns** (my calls): each player can carry one cartoon handgun as an inventory item (picked up at stage starts and from drops), aimed with the existing aim; a shot is a server-side hitscan ray with a short cooldown (about 0.3 s), limited ammo shown in the HUD (ammo pickups in drops; infinite in admin mode). Not usable while seated (owner: on foot). No friendly fire (the story mode's angry Raph is a later, separate rule).
2. **Enemies** (owner and my calls): spawned by a director like the animals (ahead of the vehicle, more in the city and the stage-3 villages), each with a little health (two or three hits). They run at the nearest player on foot, attack with a knife in melee (a small health cost per hit, a short cooldown), sometimes slip and fall (a cartoon stumble for about a second, a chance on each sprint and always on mud or dirt), and are knocked down by the vehicle (which costs the vehicle a little health, like animals). A downed player is revived as today. Enemies never enter the vehicle; seated players are safe from knives (they can still run you off the road by standing in it).
3. **Power-ups**: Trident gum: walk and sprint ×1.35 for 15 s (today's tajine rule moves to it); fromage blanc: a shield that absorbs the next damage up to 30 health for 30 s; Coke Zero: the player's shots deal double damage for 20 s; tajine: heals 40 health. All four are inventory items used with the existing hold, appear in item drops, and are not sold in the shop (my call).
4. Snapshot: enemies are a list like the animals (position, yaw, state); players gain optional `ammo`, `shield` and effect timers; new events for shots, hits, slips.

## Assets

For every new model, prop, character, decor and texture (bridge, river, forest trees, mountain village houses, Kasbah Bab Ourika, city cars, scooter riders, enemies, knife, handgun, Trident gum, fromage blanc, Coke Zero, tajine, ammo box, dashboard), search Sketchfab and pick the most downloaded or viewed model that is CC0 or CC BY (owner: most downloaded/viewed; licence and the phone size budget still apply), optimised like step 33 and credited. Where the most downloaded one is not usable, the most reliable usable one is taken (owner: "take the most reliable").

## What is left to the builder (the plans)

Exact constants (speeds, grip, densities), segment lists per stage, the Ourika route fetch, enemy behaviour details, the dashboard's look within the step 35 theme, test lists, and the order of tasks (part A first, then the stages one by one).

## Owner decisions (2026-11-18)

- Keep the 22 km `marrakech` course as an extra "Full route" course; stages 1, 4 and 5 are new short courses cut from fitting parts of the route.
- Stage 3 follows the real road to Kasbah Bab Ourika: fetched from OSRM (Tnine Ourika centre → Kasbah Bab Ourika, 6.7 km) with SRTM 30 m heights from OpenTopoData (848 → 952 m, flat for 3 km then climbing, steepest about 15 % near the kasbah). The stage uses the last 3.5 km, with the climb stretched about ×3 (to about +200 m, grades of about 10–20 %) so it reads as mountains (owner's choice); stored as local metres like the main route, credited (OpenStreetMap, SRTM/OpenTopoData).
- Chained run: one timer and one restart count across the five stages, one results screen at the airport; fuel, health and coins carry over; props and items reset per stage; a failure restarts at the last checkpoint.
- Combat as in Part C; power-ups as listed.

## Process (owner)

No heavy reviews: each step gets one short Sonnet review of its tasks; the Opus plan and whole-branch reviews are skipped unless a step is risky.

## Builder's calls already made

The 32 KB snapshot limit is a test number (raised if needed); admin mode marks the run assisted, works on foot, flies through the world; the Lodgy's speed is one constant and the RV is unchanged; falling into a river or a bridge gap restarts at the checkpoint, the winch has anchors at bridge ends; road bumps are small slope pieces and holes are shallow pits; silent checkpoints save as today and the compass points at the next checkpoint; existing tests may be changed as needed.
