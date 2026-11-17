# Step 34: emotes, a quick phrase, the tajine, random weather

Owner feedback (2026-11-17): "add some emotes like 67, dab like; add a fast chat text 'le mal est fait'; add tajine as items for speed; random weather." Owner's answers: the tajine speeds the player on foot; random weather is a lobby option and changes during the run.

## Constants (shared `constants.ts`)

- `CHAT_PHRASES` gains `'Le mal est fait'` as the ninth phrase.
- `EMOTES = ['sixSeven', 'dab', 'wave', 'dance']` (frozen), `EMOTE_SECONDS = 2.5`, `EMOTE_COOLDOWN = 3` s per player.
- `ITEM_KINDS.tajine = { halfExtents: vec3(0.2, 0.12, 0.2) × CHARACTER_SCALE, mass: 3, friction: 0.8 }`.
- `TAJINE_SPEED = 1.35` (multiplies walk and sprint speed), `TAJINE_SECONDS = 15`; eating another refreshes the timer to 15 s (no stacking).
- Item drop mix (step 28c) becomes jerrycan 0.20, toolbox 0.30, health kit 0.35, tajine 0.15. Fixed pickups are unchanged.
- `WEATHER_SETTINGS = [...WEATHERS, 'random']`; `RoomSettings.weather` and the `configure` message take a `WeatherSetting`; the world still runs on a concrete `Weather`.
- `WEATHER_CHANGE_MIN = 150`, `WEATHER_CHANGE_MAX = 300` s between changes; `WEATHER_BLEND = 10` s for the client's look transition.

## Behaviour rules

1. Quick phrase: the ninth phrase appears in the lobby and in-game chat phrase rows like the others (it is ordinary chat text; the server accepts it as any text).
2. Emote: client message `{ type: 'emote'; emote: Emote }`. The room accepts it from a joined player in the `playing` phase who is on foot (not seated, not downed, not respawning), at most once per `EMOTE_COOLDOWN` per player (silent drop otherwise), and broadcasts server message `{ type: 'emote'; playerId: string; emote: Emote }` to every connected player, the sender included. No snapshot field; a player who joins later does not see a running emote.
3. The client plays the emote on that player's figure for `EMOTE_SECONDS` (procedural node animation on the Kenney model's `torso`, `arm-left`, `arm-right`, `head` nodes, blended over the idle/walk clip): sixSeven = both forearms raised palms up, alternating up and down twice per second (the "6-7" gesture); dab = head tucked into the bent left arm, right arm straight up and out at 45°; wave = right arm up, waving; dance = side sway with arms alternating. Moving more than 1 m or boarding cancels it. The capsule fallback ignores emotes.
4. Input: desktop key `B` opens an emote wheel (four choices, click or 1–4, Esc closes; game input suspended while open like the chat panel); phone: an `Emote` button beside the `Chat` button (same rules: `playing` only, 44 px) opens the same wheel. Controls table and tutorial `help` text mention `B`.
5. Tajine: a pickup item like the others (inventory slot, hold, drop, throw). Using it (the existing `use`) while on foot eats it: the item is consumed, the player's `tajine` timer is set to `TAJINE_SECONDS`, event `eat`. While the timer runs, walk and sprint speeds are multiplied by `TAJINE_SPEED`; seated, the timer still runs down but nothing else changes. Restart, respawn and checkpoint restore clear the timer. Using it while seated does nothing (the item stays).
6. The player snapshot gains an optional `tajine?: number` (seconds left, rounded to 0.1, absent at 0) so the client predictor runs at the boosted speed; the predictor uses it like the server.
7. Random weather: when the room's setting is `random`, each run gets a seeded schedule (`mixSeed(hashSeed(course id), runNumber)`, the 28c seed): the first weather is drawn from `WEATHERS` with weights clear 0.5, rain 0.3, sandstorm 0.2, and each change happens after a uniform 150–300 s and draws a different weather with the same weights renormalised. The world's current weather drives rain grip as today (`gripScale` updated on each change). The snapshot gains an optional `weather?: Weather` field sent in every full snapshot and in a delta when it changes; the client blends its sky, fog and rain look over `WEATHER_BLEND` s. A fixed weather setting behaves exactly as today.
8. The lobby weather select lists `Random` after the three weathers; the default stays as today.
9. The server rate limiter still counts every message first; emote and chat do not share a bucket.

## Tests (write first)

1. Shared: `CHAT_PHRASES` has 9 entries ending with the phrase; `EMOTES`, `WEATHER_SETTINGS` lists; parse of `emote` (accept the four, reject others and extra keys stripped), of `configure` with `random`, of the server `emote` message, of snapshots with `tajine` and `weather` (optional, validated).
2. Server: emote relayed to all in `playing`; refused silently in `lobby`/`results`, when seated, downed, respawning, or within the cooldown; one per 3 s passes.
3. World: eating a tajine consumes the item, sets 15 s, raises walk and sprint speed by 1.35 (measured over 2 s on flat ground), runs out after 15 s, refreshes on a second tajine, is cleared by restart and respawn, does nothing while seated.
4. Predictor: with `tajine` in the snapshot, the predicted position matches the server's within the existing tolerance.
5. Item drops: the mix with tajine sums to 1; the measured jerrycan rate stays as recorded in step 28c (re-measure and report).
6. Weather: the schedule for a fixed seed is deterministic; changes fall within 150–300 s; consecutive weathers differ; grip changes with rain; a fixed setting never changes; the snapshot carries the field only when random is set.
7. Client: the emote wheel opens with `B` only in `playing` and suspends input (logic test of the gating function); the emote animation function returns the node rotations at sample times for each emote (pure function test); the weather blend factor over 10 s (pure).

## Tasks

1. Task 1 (shared, server): constants, protocol, emote relay, tajine item and timer, drop mix, random weather schedule and snapshot field; tests 1–6.
2. Task 2 (client): phrase, emote wheel and buttons, emote animations, tajine model (`item.tajine`, shipped in step 33) and eat sound/toast, predictor boost, weather blend; test 7; screenshots of each emote and the wheel.
3. ROADMAP, spec, checks, push, PR, merge.
