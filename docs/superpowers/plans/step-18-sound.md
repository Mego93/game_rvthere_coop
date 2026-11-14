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
