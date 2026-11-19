# Step 39: combat and power-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cartoon handguns on foot, enemies on foot with knives who run at players and slip, and four power-ups (Treedent gum, fromage blanc, Koke Zero, tajine).

**Architecture:** Server-authoritative: shots are server hitscan rays, enemies are a director-driven list like the animals, power-ups are items with timers on the player. The client predicts nothing new except the player's speed (Treedent), shows tracers, enemy meshes and HUD timers.

**Tech Stack:** TypeScript, Rapier, Three.js, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-stages-and-round3-design.md` (part C) and the main spec.

## Global Constraints

- Owner: players shoot, on foot only; enemies attack on foot with knives, run at you, can slip and fall; a bit cartoon. No friendly fire.
- Item names in game (owner): Treedent (gum), Koke Zero, fromage blanc, tajine.
- Power-ups (design): Treedent = walk and sprint ×1.35 for 15 s (today's tajine boost moves to it); fromage blanc = shield absorbing up to 30 damage for 30 s; Koke Zero = shots deal ×2 damage for 20 s; tajine = heals 40. None is sold in the shop.
- Admin `infinite` gives infinite ammo too.
- Owner process: one short review for the step.

## Constants (shared `constants.ts`)

`GUN_DAMAGE = 34`, `GUN_COOLDOWN = 0.3` s, `GUN_RANGE = 60` m, `GUN_AMMO_START = 12`, `AMMO_BOX_ROUNDS = 12`, `AMMO_MAX = 48`; `ENEMY_HEALTH = 100`, `ENEMY_RUN_SPEED = 5.5`, `ENEMY_KNIFE_DAMAGE = 10`, `ENEMY_KNIFE_RANGE = 1.3`, `ENEMY_KNIFE_COOLDOWN = 1.0`, `ENEMY_SLIP_SECONDS = 1.2`, `ENEMY_SLIP_CHANCE = 0.15` (per second while running; 1 on mud or dirt the first time), `ENEMY_MAX_ALIVE = 8`, `ENEMY_SPACING = 250` m of route, `ENEMY_SPAWN_AHEAD = 110`, `ENEMY_DESPAWN_BEHIND = 80`, `ENEMY_KNOCK_SPEED = 3` m/s, `ENEMY_VEHICLE_DAMAGE = 0.02`; `TREEDENT_SPEED = 1.35`, `TREEDENT_SECONDS = 15`, `SHIELD_HP = 30`, `SHIELD_SECONDS = 30`, `KOKE_MULTIPLIER = 2`, `KOKE_SECONDS = 20`, `TAJINE_HEAL = 40`.

## Rules

1. Items: `ITEM_KINDS` gains `treedent`, `fromageBlanc`, `kokeZero`, `ammo` (an ammo box) and `gun`; `tajine` changes from the speed boost to `TAJINE_HEAL` (the step 34 speed timer is renamed to `treedent` everywhere: player state, snapshot field `treedent?`, predictor, HUD). Each power-up is eaten or drunk with the existing self hold (like the tajine today); using an ammo box adds `AMMO_BOX_ROUNDS` (capped at `AMMO_MAX`) and is consumed. The drop mix becomes jerrycan 0.18, toolbox 0.22, healthKit 0.15, tajine 0.12, treedent 0.08, fromageBlanc 0.08, kokeZero 0.07, ammo 0.10 (jerrycan stays first so seeded jerrycan bands shrink only from the top; re-measure the jerrycan rate and report).
2. Guns: every player starts each run with a gun, held outside the three inventory slots (a separate `gun: boolean` on the player, true at run start) with `ammo` = `GUN_AMMO_START`; it is used with a new input `fire?: boolean` (left click, touch Fire button) only on foot (not seated, downed, flying or respawning) and while not carrying a prop; a shot is a server ray from the eye along yaw and pitch up to `GUN_RANGE`, blocked by world geometry and the vehicle, hitting the first enemy; cooldown `GUN_COOLDOWN`; damage `GUN_DAMAGE` ×`KOKE_MULTIPLIER` while Koke Zero runs; ammo −1 per shot unless admin infinite; no friendly fire; events `shot` (from, to, hit?) for tracers and sound.
3. Enemies: a seeded plan (like the animals) of events every `ENEMY_SPACING` m on corridor and non-corridor courses alike (twice as dense in the last 30 % of `marrakech`, the city), spawned `ENEMY_SPAWN_AHEAD` m ahead of the vehicle at the road edge, at most `ENEMY_MAX_ALIVE`; kinematic bodies moved by the server (no physics push), states `idle`, `run`, `attack`, `slip`, `down`, `dead`. An enemy runs at the nearest player on foot within 40 m at `ENEMY_RUN_SPEED` on the ground (ground probe as the animals), attacks within `ENEMY_KNIFE_RANGE` every `ENEMY_KNIFE_COOLDOWN` for `ENEMY_KNIFE_DAMAGE` (the shield absorbs first), slips per rule (falls for `ENEMY_SLIP_SECONDS`, then gets up), is knocked `down` by the vehicle above `ENEMY_KNOCK_SPEED` (vehicle health −`ENEMY_VEHICLE_DAMAGE`, the enemy is removed after 2 s), dies at 0 health (removed after 2 s), and is removed `ENEMY_DESPAWN_BEHIND` m behind the vehicle. Seated players are never targeted. Restart, respawn and skip clear and re-arm like the animals.
4. Snapshot: optional `enemies?: { id, x, y, z, yaw, state }[]` (positions rounded to 0.01) like `animals`; players gain optional `ammo?`, `gun?`, `shield?` (remaining HP), `koke?`, `treedent?` (seconds, rounded up to 0.1). Full-snapshot size test limit raised if needed (report).
5. Client: a cartoon handgun model on the player when on foot, crosshair, left click / touch Fire button (bottom right, 56 px, only on foot), tracer lines and a hit flash, enemy figures built from the blocky character in local dress with a knife (Sketchfab knife model), run/stab/slip/fall/down poses, HUD ammo count and power-up timers (icons with seconds), toasts for eating/drinking, sounds reused where possible. Item models from Sketchfab (most downloaded usable: gum pack, fromage blanc pot, cola can, ammo box, handgun, knife), optimised and credited like step 33.

## Tests

1. Power-ups: each item's effect, duration, refresh, consumption, shield absorption order, Koke doubling, tajine heal capped at 100; drop mix sums to 1; protocol fields parse.
2. Guns: a shot hits an enemy in line of sight and not one behind a wall or the vehicle; cooldown; ammo use and infinite; refused while seated, downed, flying, carrying; no damage to players.
3. Enemies: spawn, cap, chase the nearest on-foot player, knife damage and cooldown, shield first, slip timing (mud always), vehicle knock with vehicle damage, death after hits (3 normal, 2 with Koke), despawn, restart re-arm, seated players ignored; snapshot list.
4. Predictor parity with `treedent` (renamed field).
5. Client: tracer, HUD timers and ammo (pure view functions), Fire button gating; screenshots.

## Tasks

1. Task 1 (shared, server): power-ups and the tajine/treedent rename, ammo item, guns and `fire`, enemies, snapshot fields; tests 1–4. (One agent, three commits in this order.)
2. Task 2 (assets, in parallel with Task 1, scratchpad only): Sketchfab sourcing of the six item models, optimised with `scripts/assets/optimizeGlb.mjs`, delivered as files ready to copy.
3. Task 3 (client, after 1 and 2): rule 5; test 5.
4. ROADMAP, spec, checks, short review, push, PR, merge.
