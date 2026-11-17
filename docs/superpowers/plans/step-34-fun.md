# Step 34: emotes, a quick phrase, the tajine, random weather

Owner feedback (2026-11-17): "add some emotes like 67, dab like; add a fast chat text 'le mal est fait'; add tajine as items for speed; random weather." Owner's answers: the tajine speeds the player on foot; random weather is a lobby option and changes during the run.

**The amendments U1–U16 at the end (from the Opus plan review) replace any line above that they contradict.**

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

## Amendments from the Opus plan review (U1–U16)

- U1 Weather setting in messages: `LobbyMessage.weather` and `ResultsMessage.weather` become `WeatherSetting` (`isWeatherSetting` in both parsers; `rules.ts` `resultsOf` takes the setting). The results screen shows the setting (`Random`). The client's look uses `lobby.weather` only when it is a concrete weather; with `random` it starts `clear` and snaps (no blend) to the first snapshot's `weather`. The rain audio loop follows the current weather. Tests that change: protocol.test (lobby/results weather cases), server lobby.test (W3 and the configure cases), client lobby.test.
- U2 Eating is a hold, like the other items: `useTarget('tajine')` returns the eater's own id when on foot (not seated, not downed); `holdTargetValid` accepts a self-targeted tajine hold at any health; `stepHolds` handles `completed.item === 'tajine'` first (consume, set the timer, emit `eat`), so it never reaches the vehicle or patient branches; `useHint` returns "Hold F to eat"; the touch Use button appears for it. Tests extended: holds.test, overlay.test, touchView.test, useContext.test.
- U3 Names and signatures: `Room.emote(player: RoomPlayer, emote: Emote, now: number): void`, `server.ts` `case 'emote'` ignored before join like chat; `World.canEmote(playerId: string): boolean` (on foot, not seated, not downed, `respawnIn === null`, not holding a prop or item in hand); the timer is `PlayerState.tajine: number` in player.ts; `WalkInput.speedScale: number` (1 or `TAJINE_SPEED`) used by `stepWalk` and by `PredictedState`/`fromSnapshot`; `shared/src/weather.ts` exports `weatherSchedule(seed: number, ticks: number): { tick: number; weather: Weather }[]` keyed to world ticks; `Vehicle.setGripScale(scale: number)`; client pure functions `emoteWheelAllowed(state)`, `emotePose(emote, t): Record<'torso' | 'arm-left' | 'arm-right' | 'head', { x: number; y: number; z: number }>` (Euler radians), `weatherBlend(t): number`; `playEmote(mesh, emote, now)` in playerMesh.ts.
- U4 New event kind `eat` in `EVENT_KINDS`; `SOUND_OF_EVENT.eat = 'use'`; toast "Tajine! Faster for 15 s" (eventToast toast list and soundMap test E4 change).
- U5 Shop: the tajine is not for sale: `SHOP_ITEMS = ['jerrycan', 'toolbox', 'healthKit']`, `SHOP_PRICES: Record<ShopItem, number>`, and `buy` accepts only `SHOP_ITEMS` (protocol.test S14 and stops.world.test change).
- U6 Records and tests for the new item: `ITEM_MODEL_KEYS.tajine = 'item.tajine'`, `ITEM_LABELS` (both files) "Tajine", `SLOT_ICONS` a tajine icon, minimap `.item.tajine` colour `#c2662d`, the procedural fallback draws a small terracotta cone on a dish; manifest `item.tajine` size = `longest(ITEM_KINDS.tajine.halfExtents)`; propMesh.test T4 `NATIVE_LONG.tajine` exempt (x and z tie); hudModel.test labels; airport course test T1 asserts the original three kinds (fixed pickups unchanged).
- U7 Drop mix order: jerrycan [0, 0.2), toolbox [0.2, 0.5), healthKit [0.5, 0.85), tajine [0.85, 1), so every seeded jerrycan drop is unchanged; itemDrops.test kind loop and sum change; marrakech.itemSize.test `KINDS` adds tajine.
- U8 shared chat.test pins the phrases: it becomes the nine phrases.
- U9 Weather blend: numeric `Look` fields (fog colour, near, far, sky colour, sun intensity, background intensity, exposure) lerp over `WEATHER_BLEND`; discrete fields (sky id, `hdriBackground`) switch at the blend's midpoint; `Conditions` always builds the rain system and takes `setLook(look, blend)`, rain fading by opacity. environment.ts and conditions.ts change, with their tests.
- U10 Snapshot `weather` is on `WorldSnapshot` and in the parser, present in every snapshot while the room's setting is `random`, absent otherwise. The schedule runs on world ticks (paused with the room, stopped after the win); a checkpoint restart keeps the current weather; `restartCourse` keeps the run number and so replays the same schedule.
- U11 Emote input: `KeyB` in `EXTRA_CODES` and a `CONTROLS` row "Emote wheel"; the wheel joins `anyOpen()`; opening it exits pointer lock like chat; Escape closes the wheel first (capture listener); the wheel does not open while seated; `touch-emote` joins `showMenuButton`; tutorial `caps` stays `['H']`, the help text mentions B and the touch text mentions Emote. The game is landscape-only on phones (the rotate prompt), so the button at the chat button's left is clear of the compass.
- U12 Order with step 32: step 34 is implemented on its own branch now and merges main after step 32 lands; the merged toast list is `['checkpoint', 'goatHit', 'scooterHit', 'outOfBounds', 'eat']`. Step 32's out-of-bounds move is not a respawn, so the tajine timer survives it.
- U13 Emote poses (Euler radians, applied after `mixer.update`, replacing the clip's rotation of those nodes with a weight that ramps in and out over 0.2 s): sixSeven: both arms x = −1.4 ± 0.4 × sin(2π·2t) in opposite phase; dab: head x = 0.5, y = 0.5; arm-left x = −1.7, z = 0.7; arm-right z = −2.3; wave: arm-right z = −2.6 + 0.35 × sin(2π·2t); dance: torso z = 0.17 × sin(2π·1.5t), arms x = ±0.7 × sin(2π·1.5t). An emote is refused while carrying anything (U3); in first person the player does not see their own emote (accepted).
- U14 Tajine edge cases: walk, sprint and walking while carrying are boosted; crouch, slide, push and the hit cap are not. Downed, respawn, restart, `restartCourse`, admin skip and a rejoin into a held slot clear the timer.
- U15 Weather seed: `mixSeed(itemSeed, WEATHER_SEED_SALT)` with `WEATHER_SEED_SALT = 0x57ea`.
- U16 Emote cooldown uses the room clock with the chat's 1e-6 allowance and is kept on `RoomPlayer` (it survives a reconnect). The lobby's weather select shows labels: Clear, Rain, Sandstorm, Random.
