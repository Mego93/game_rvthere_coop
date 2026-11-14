# Step 18: Sound effects

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`. Read:
- "Sound": the effect list, CC0 files with their licence recorded, engine pitch, and audio unlock on the first tap or click;
- the `event` server message;
- the Client modules (`audio`).

ROADMAP decision D7, as amended at step 9, J11: the room sends no `event` message until the HUD and sound steps. This step adds it.

This plan fixes interfaces, constants, rules and test cases. Implementers write the tests first, then the code. Where the plan and the spec disagree, or neither answers a question, stop and report. This step ends at `needs sign-off`, because how it sounds is the owner's call.

## Goal

The page plays these effects:
- engine loop
- impact
- winch loop
- hook attach
- pickup
- item use
- coin
- purchase
- hurt
- downed
- revive
- checkpoint
- vehicle lost
- rain loop
- UI click
- win

They come from CC0 files committed to the repo, with their licence recorded. Engine pitch follows throttle and speed. Audio starts on the first tap or click.

## Files and licence

S0. Sound files come from **OpenGameArt.org only**, and only from entries whose licence is **CC0**. kenney.nl refuses automated requests from this environment. Many of Kenney's packs are mirrored on OpenGameArt as CC0; prefer those.

- **Download.** Download into a new, empty folder under the scratchpad. Never run anything from inside it.
- **Formats.** Pick `.ogg` files, or `.wav` converted with no tools other than what is installed. Safari plays neither Ogg Vorbis nor Ogg Opus reliably, so every file must also exist as `.mp3` or `.m4a`, or be committed as `.wav` if it is small. Check which converters exist (`ffmpeg --version`). If none exist, use `.wav` files under 300 KB each.
- **Location.** Commit the chosen files to `packages/client/public/sounds/`. Stay under 3 MB in total.
- **Licence record.** Add `packages/client/public/sounds/LICENSE.md`. For each file it lists the file name, the source page URL, the author, and "CC0 1.0". Effects that come from one pack may share a line.
- **Missing effects.** If no CC0 file fits an effect, leave it out, list it in the report, and the code skips it. Do not use any non-CC0 file.

## Rules

A1. **Server events.**
- The room sends `{ type: 'event', kind, tick, playerId?, pos? }` to every connected player, for each event returned by `World.step` and for queued events (buy, skip). This applies only in `playing`.
- The protocol parses `event`. `kind` is one of the spec's kinds plus `'use'`: `impact`, `checkpoint`, `vehicleLost`, `pickup`, `use`, `hookAttach`, `hookDetach`, `coin`, `buy`, `hurt`, `downed`, `revive` and `respawn`.
- Events the world does not yet emit are allowed by the parser but not produced. The spec's `impact`, `pickup`, `hookAttach` and `hookDetach` may not be emitted today. Check `world.ts`, then add emission for each of these four at its existing code point, with a test. Fix each one: `impact` where vehicle damage is applied above the threshold, `pickup` on picking up a prop or item, and `hookAttach` and `hookDetach` in the winch actions.
- Events from a tick are sent right after that tick, not batched with the snapshot. Decision D7 is amended.

A2. **Audio module** (`client/src/audio/`).
- `createAudio(ctxFactory): Audio` exposes:
  - `unlock(): void`, called on the first `pointerdown` or `keydown`;
  - `play(kind, opts?: { at?: Vec3; volume?: number }): void`;
  - `setLoop(name: 'engine' | 'winch' | 'rain', on: boolean, params?: { rate?: number; volume?: number })`;
  - `setListener(pos: Vec3, forward: Vec3)`;
  - `dispose()`.
- It uses the Web Audio API. Each buffer is decoded once, on first need after unlock.
- Positional sounds use a `PannerNode`, with `distanceModel 'inverse'`, `refDistance 3` and `rolloffFactor 1`. Non-positional sounds are UI click, win, purchase and coin.
- Before unlock, nothing plays and nothing throws.
- A missing file is skipped with one `console.warn`.

A3. **Mapping** (pure: `soundFor(event, localId): { kind; positional: boolean } | null`).

| Event | Sound | Notes |
|---|---|---|
| `impact` | impact | |
| `checkpoint` | checkpoint | |
| `vehicleLost` | vehicle lost | |
| `pickup`, `buy` | pickup, purchase | |
| `use` | item use | |
| `hookAttach`, `hookDetach` | hook attach | |
| `coin` | coin | |
| `hurt` | hurt | |
| `downed` | downed | |
| `revive` | revive | |
| `respawn` | none | |

Win plays once when the local status first shows `won`.

The UI click plays on lobby, menu, shop and results buttons.

A4. **Loops.**
- **Engine:** on while a run is playing and the vehicle exists. Rate is `0.6 + 0.9 · clamp(|speed| / maxSpeed, 0, 1) + 0.2 · |throttle|`. Volume is 0.35 when seated and 0.2 on foot. It is positional at the vehicle.
- **Winch:** on while the cable state is `attached` and `reel ≠ 0`, or while the length changes faster than 0.05 m per frame. Positional at the bumper.
- **Rain:** on while the run's weather is `rain`. Volume 0.3, non-positional.
- All loops stop in `game.stop()`.

These are starting values for the owner.

A5. **Settings.** A mute toggle (`M`, and a button in the run menu) is stored in localStorage under `lodgy.muted`, behind the existing try/catch storage wrapper.

## Modules and signatures

- `shared/src/protocol.ts`: the `EventMessage` type and its parse.
- `shared/src/world.ts`: the missing emissions in A1.
- `server/src/room/room.ts`: broadcast.
- `client/src/audio/audio.ts`, `soundMap.ts` and `engine.ts`; `engine.ts` holds `engineRate(speed, maxSpeed, throttle)`.
- `client/src/main.ts`: unlock listeners, event routing to the game.
- `client/src/game.ts`: the loops and the listener.
- `client/src/ui/runMenu.ts`: the mute item.
- `public/sounds/` with `LICENSE.md`.

## Tests (numbered)

- E1. Protocol: `event` parses for every kind; an unknown kind and a missing tick are rejected.
- E2. World: each newly emitted event kind (A1) appears on the tick it happens, stamped with that tick:
  - an impact above the threshold, using the existing impact setup;
  - a prop pickup and an item pickup;
  - a hook attach and a hook detach.
- E3. Room: events from a tick reach every connected client as `event` messages; none are sent in `lobby` or `results`; held slots get none.
- E4. `soundFor` covers every row of the A3 table.
- E5. `engineRate`: speed 0 with no throttle gives 0.6; at max speed with full throttle it gives 1.7; reverse speed uses its absolute value.
- E6. `createAudio` with a fake `AudioContext`:
  - play before unlock does nothing;
  - after unlock it decodes once per kind and plays;
  - a missing buffer warns once;
  - the loops start and stop;
  - `setListener` sets the listener's position and orientation;
  - mute sets the gain to 0.
- E7. Smoke: the page loads `sounds/LICENSE.md` with status 200, and after a click and Start there are no page errors. Headless Chromium plays nothing audible, which is fine.

## Tasks

1. **Events.** A1 and tests E1–E3.
   - Commit: `feat(server): the room sends game events`.
2. **Files.** S0: choose, download, convert if possible, commit the files and `LICENSE.md`. Report every file with its source.
   - Commit: `chore(client): CC0 sound effects`.
3. **Audio.** A2–A5 and tests E4–E7.
   - Commit: `feat(client): sound effects and the engine loop`.
4. **Documents** (main session).
   - ROADMAP: step 18 → `needs sign-off`; log the decisions and the D7 amendment; update "Runnable today".
   - Add the owner's checks: volumes, which sounds, engine pitch, and audio on iPhone after the first tap.

Each task: tests first, then a Sonnet review. Run `npm test` and `npm run typecheck` before each commit, and Playwright in task 3.

## Known risks to watch in review

- **Safari formats.** Safari cannot decode Ogg Vorbis, so the files must be MP3, M4A or WAV.
- **iOS unlock.** The context must be resumed inside the gesture handler itself.
- **Event volume.** Six players hurt by one crate send six `hurt` events. That is acceptable.
- **Late events.** An event for a tick the page has not drawn yet plays a little early. That is acceptable.

## Amendments after the plan review (binding; where they differ from the text above, they win)

R1 (A2, unlocking on iPhone). `unlock()` is called from listeners that main.ts adds once, on `window` with `{ capture: true }`, for `pointerup`, `touchend`, `click` and `keydown`.
- Inside the handler, synchronously: create the AudioContext through the factory if none exists yet, then call `resume()`.
- The listeners stay for the page's life. A call does nothing while `ctx.state === 'running'`, and resumes the context otherwise, for example after an iOS interruption.
- Every promise is caught.

R2 (A1, emissions). The spec's kinds already include `use`. The world must add five emissions:
- **`impact`:**
  - `Vehicle.afterPhysics(): number` returns the impact speed that caused damage this tick (above `VEHICLE_IMPACT_SPEED`), or 0.
  - When it is above 0, world.ts pushes `{ kind: 'impact', tick, pos: vehicle centre }`, with no playerId. `tick` is already incremented at that point.
- **`pickup`:**
  - Only when `players.pickUp` returns true, or `items.take` returns non-null.
  - playerId is the player who picked up; pos is the centre of the prop or item before the pickup.
- **`hookAttach`:**
  - Only when `winch.attach` returns true.
  - pos is `winch.state().hookPos`.
- **`hookDetach`:**
  - Only for the player actions `detachHook` and `releaseHook`.
  - pos is the hook position before the change.
- **`use` for items:**
  - When an item hold completes on the vehicle, or heals a player who is not downed, `stepHolds` pushes `{ kind: 'use', tick: tick + 1, playerId: user, pos }`.
  - pos is the vehicle centre for the vehicle, or the patient's pos for a heal. A revive keeps `revive` only.

These stay silent: prop resets, the stow during `placeCrew`, `takeHook`, `dropHook`, and a ground hook being reeled in.

`resolveInteracts` takes `events`. `const events = queuedEvents.splice(0)` moves above that call, so queued events still come first.

The rule for ticks: every event returned by `step` has `tick === snapshot().tick` when the snapshot is read after that step. Events raised before `tick += 1` use `tick + 1`.

R3 (A1, the room).
- The room sends exactly what `World.step` returns, in order, inside `stepOnce`. It sends them right after the step, and before the won check and `enterResults`.
- Each is sent as `{ type: 'event', ...event, tick: event.tick + tickOffset }`.
- It never sends from `buy`, `adminTool` or `addPlayer`. `broadcast()` already skips held slots.

The ROADMAP decision of 2026-11-13 (D7, J11) is replaced by: "the room sends `event` messages". "Not batched with the snapshot" is a new decision. `lobby.test.ts` L5 must stay unchanged.

R4 (tests E2 and E3, made concrete).
- **E2 adds:**
  - Raise the vehicle about 6 m above its rest pose with `debugBody('vehicle').setTranslation`, then step. Exactly one `impact` arrives, on the tick health first drops, stamped `snapshot().tick`.
  - A vehicle at rest for 10 s gives no `impact`.
  - A jerrycan used on the vehicle gives one `use`, and so does a health-kit heal.
  - A prop pickup and an item pickup each give `pickup`.
  - An attach gives `hookAttach`, and a detach gives `hookDetach`.
- **E3 becomes:**
  - (a) `debugWorld(room).debugHurt('p1', 10)` gives every connected client exactly one `event` of kind `hurt`. It arrives before the next snapshot, stamped with the tick that ran.
  - (b) A held slot gets no events, and gets none of the missed ones after it rejoins.
  - (c) No `event` follows the results of the winning tick.
  - (d) After `restartCourse`, an event's tick equals the tick of the next snapshot.
- **These tests must stay green unchanged:**
  - in `world.test.ts`, the `[]` expectations at lines 106, 343 and 366;
  - `checkpoints.test.ts` (7);
  - `stops.world.test.ts` lines 551 and 806;
  - `lobby.test.ts` L5.

R5 (audio lifetime and routing).
- main.ts creates one audio instance per page, at load, and passes it to `createGame`. `game.stop()` turns every loop off but does not dispose the audio.
- main.ts `onMessage` handles `case 'event': game?.onEvent(message)`, and the `Game` interface gains `onEvent(message: EventMessage): void`.
- Events that arrive while there is no game are dropped, and missed events are never replayed. The client plays an event when it arrives and ignores its `tick`.

R6 (the A2 and A3 interface).
```
export type SoundName = 'impact'|'hookAttach'|'pickup'|'use'|'coin'|'purchase'|'hurt'|'downed'|'revive'|'checkpoint'|'vehicleLost'|'click'|'win'
export type LoopName = 'engine'|'winch'|'rain'
export const SOUND_FILES: Record<SoundName | LoopName, string | null>   // absolute /sounds/... paths; null = no file
createAudio(deps: { createContext: () => AudioContext; load: (url: string) => Promise<ArrayBuffer> }): GameAudio
GameAudio: unlock(); play(name: SoundName, opts?: { at?: Vec3; volume?: number }); setLoop(name: LoopName, on: boolean, params?: { rate?: number; volume?: number; at?: Vec3 }); setListener(pos, forward); setMuted(muted: boolean); dispose()
```
`setLoop` is idempotent and is called every frame.

The A3 table maps event kinds to names: `buy` → `purchase`, and `hookDetach` → `hookAttach`.

R7 (positional or not).
- An event whose `playerId === localId` plays non-positional.
- Other events play positional at `pos`.
- An event with no `pos` plays non-positional.
- `coin`, `purchase`, `click` and `win` always play non-positional.
- E4 covers the local, remote and missing-pos cases.

R8 (formats).
- **One-shots:** MP3 only, mono, 44.1 kHz, 96 kbps.
- **Loops:** engine, winch and rain are re-encoded as mono 16-bit WAV, at most 300 KB each, because MP3 padding puts a gap in a looped buffer.
  - Use 22.05 kHz where that is needed to fit.
  - Trim rain to a clean loop of about 6 s.
  - Remove the three loop MP3s.
- No `.ogg` files.
- `static.ts` gains `.wav: audio/wav` and `.md: text/markdown; charset=utf-8`, with the content-types test extended.
- Task 2's committed files are reworked this way in task 3. Update `LICENSE.md` to match.

R9 (loops).
- **Winch:** on while the latest snapshot's `cable.state === 'attached' && cable.reel !== 0`. It plays positional at the vehicle's `winchMount` in world space.
- **Engine:**
  - `speed` is `dot(linvel, rotate(rot, (0,0,-1)))` of the interpolated vehicle.
  - `maxSpeed` is `vehicleConfig.maxSpeed`, also when reversing.
  - `throttle` is the snapshot's `vehicle.throttle`.
  - "Seated" means the local player has any seat.
  - It plays only while `lobby.phase === 'playing'`.
- **Pure decisions:** `winchOn(cable)` and `rainOn(weather)` go in `engine.ts`, with tests.

R10 (the mute control).
- `RunMenu` gains `setMuted(muted)`, and its handlers gain `onMute()`. A `#run-mute` button always renders after the items.
- `runMenuItems` and its tests are unchanged.
- The `M` key is ignored when typing in an input, select or textarea, and when ctrl, meta or alt is held.
- The muted state is saved through the main.ts `storage()` wrapper as `lodgy.muted`. Add `savedMuted` and `saveMuted` to session.ts, with a test.

R11 (details).
- **Decoding:** on unlock, fetch and decode every non-null file.
  - A play before its buffer is ready is skipped, not queued.
  - A failed fetch or decode warns once for that name and is never retried.
- **Listener:** use `positionX`/`forwardX` when present, otherwise `setPosition`/`setOrientation`. The E6 fake covers both.
- **Panning:** `panningModel 'equalpower'`.
- **Click:** one capture `click` listener on `document` matches `#lobby button, #run-menu button, #shop-menu button, #results button`.
- **Win:** plays on a false-to-true change of `won` within one game. The first snapshot does not count.
- **E6 loops:**
  - the first `setLoop(on)` after unlock creates one source with `loop = true`;
  - repeated calls update its rate and gain, without making a new source;
  - `off` stops it;
  - nothing is created before unlock.
- **E7:** after Create and Start, `page.waitForResponse(/\/sounds\/.+\.(mp3|wav)$/)` returns 200, and every audio promise is caught.
- **E1:** also rejects a non-vec3 `pos` and a non-text `playerId`, and accepts both when absent.
- **Task 4:**
  - The spec's Sound paragraph becomes "CC0 files from OpenGameArt (kenney.nl is unreachable from the build environment)".
  - The owner's checks add the iPhone ring/silent switch.
