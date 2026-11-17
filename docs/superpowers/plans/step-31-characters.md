# Step 31: the six characters and customization

Spec: ROADMAP "Step 31: the six characters (confirmed by the owner)" and the owner's answers: locked to six characters, one per player slot; each is a fixed character wearing its own default outfit, with glasses, sweatshirt, suit and more as changeable add-ons. The photos stay out of the repository: each figure is stylised from clothing and hair, not a likeness. Decisions taken here: the choice is made in the lobby (not in the join message, so a player can change it), each character is used by at most one player in a room, the look reaches other clients through the lobby message (no snapshot change).

## Data (shared, Task 1)

`packages/shared/src/characters.ts` (exported through the package index):
- `CHARACTER_IDS = ['sounile', 'rafael', 'nandan', 'alexander', 'luiz', 'huu']` (frozen), `CharacterId`.
- `GLASSES_CHOICES = ['default', 'none', 'round']`, `TOP_CHOICES = ['default', 'sweatshirt', 'suit']`, `HAT_CHOICES = ['none', 'cap', 'fez']` (frozen). `default` glasses means the character's own (round for rafael and huu, none for the others); `default` top means the character's own outfit.
- `interface Appearance { characterId: CharacterId; glasses: ...; top: ...; hat: ... }`, `isAppearance(value: unknown): value is Appearance`, `defaultAppearance(characterId): Appearance` (`glasses: 'default'`, `top: 'default'`, `hat: 'none'`), `firstFreeCharacter(taken: readonly CharacterId[]): CharacterId | null` (lowest index not taken).
- `CHARACTER_NAMES: Record<CharacterId, string>` (display names `Sounile`, `Rafael`, `Nandan`, `Alexander`, `Luiz`, `Huu`).

## Protocol and server (Task 1)

1. Client message `{ type: 'appearance'; characterId; glasses; top; hat }` (`parseClientMessage` validates every field against the lists; unknown values return null).
2. `LobbyMessage.players[]` entries gain `appearance: Appearance` (`parseServerMessage` validates it; a lobby message without it is rejected). `ERROR_REASONS` gains `'character_taken'`.
3. A player who joins (create or join) gets `defaultAppearance(firstFreeCharacter(taken))` where `taken` is the characters of every player in the room, including held (disconnected) ones; a room is never full of characters before it is full of players (six players, six characters).
4. `Room.setAppearance(player, appearance)`: allowed only in the lobby phase (otherwise error `bad_phase`); refused with `character_taken` when another player in the room (held ones included) has that `characterId`; accepted changes are broadcast with the next lobby message. A reconnecting player keeps their appearance. A kicked or departed player's character is free again.
5. Every other message and all snapshot messages are unchanged; the snapshot size tests stay as they are.

Tests (shared `characters.test.ts`, `protocol.test.ts`, server room tests): the lists and names are complete and frozen; `isAppearance` rejects unknown values and extra characters; `firstFreeCharacter` cases (none taken, gaps, all taken → null); parse accepts and rejects each field; join order 1–6 gives six distinct characters in index order; a seventh join is `room_full` as before; `appearance` changes the broadcast lobby entry; `character_taken` when another player holds it, also when that player is disconnected but held; allowed to keep your own character while changing glasses; refused in `playing` and `results` with `bad_phase`; a reconnecting player keeps the look; a kicked player's character is free for the next join.

## Rendering (client, Task 2)

Files: `packages/client/src/render/characterLooks.ts` (data), `characterRig.ts` (applies a look to the model), `playerMesh.ts` (uses them).

The Kenney model `character.player` (`characters/character-c.glb`) has nodes `leg-left`, `leg-right`, `torso`, `arm-left`, `arm-right`, `head` (head scaled 0.1) and one shared texture. Today torso and arms take the player colour.

Rules:
1. `CHARACTER_LOOKS: Record<CharacterId, Look>` with `{ top, trousers, hair: { style: 'bald' | 'short' | 'wavy' | 'swept' | 'long'; colour }, facial: 'none' | 'moustache' | 'beard', outfit: 'halfzip' | 'jacket' | 'sweater' | 'cardigan' | 'hoodie' | 'tee', trim?: colour }` per the roadmap list: sounile black half-zip, light jeans, short dark hair, moustache; rafael bald, dark jacket over a dark tee, olive trousers, short beard, round glasses by default; nandan dark navy sweater with a collared shirt, beige trousers, dark wavy hair; alexander cream cardigan with red trim, olive trousers, short dark hair; luiz black hoodie, beige trousers, light swept hair; huu black tee, dark longer hair, round glasses by default. Colours are hex strings valid for the existing `PLAYER_COLOUR_PATTERN`.
2. `applyLook(model, appearance)`: legs get the trousers material; torso and arms get the top colour (`sweatshirt` grey `#8a8f98`, `suit` charcoal `#2b2f3a` with a white collar strip and a dark tie, otherwise the character's); the head keeps its texture. Hair, moustache, beard, glasses (two thin dark rings and a bridge), cap and fez are small boxes or cylinders parented to the `head` node (so they follow animation), in head-local units: the implementer measures the head's bounding box in the loaded model first and derives sizes from it. Details of the outfit (collar, zip, cardigan trim, hood, jacket lapel) are boxes on the torso. Everything that is added is flat-shaded, casts shadows, and uses a small shared material set per colour.
3. `createPlayerMesh(name, colour, appearance?)`: with an appearance the figure uses it; without one (the capsule fallback and old callers) behaviour is unchanged. The player colour remains for the lobby swatch, the minimap and the HUD; it no longer tints the shirt when an appearance is given.
4. The game keeps each player's appearance from the last `lobby` message by `playerId` and rebuilds a player's mesh when it changes (only possible in the lobby phase) or when it first becomes known.
5. Disposal: every added geometry and material is freed with the mesh (the existing dispose path), and shared materials are not disposed twice.
6. A model-free fallback stays valid (the capsule figure ignores the look).

Tests: `characterLooks.test.ts` (catalogue complete for every id, colours valid, rafael and huu have round glasses by default and the others do not, defaults match the roadmap list), `characterRig.test.ts` (structure: for each character the built rig has the expected named parts, glasses present only when chosen or default, hat parts only with a hat, `suit` adds the collar and tie, the part count of the six characters is bounded, disposal frees what was added, shared materials survive one disposal of one mesh), `playerMesh` tests keep passing. Looks, proportions and the feel are left to owner sign-off; screenshots of all six are taken for the report.

## Lobby picker (client, Task 3, parallel with Task 2)

1. In the lobby panel, a "Your character" section: six cards (name, a small swatch of its top colour, a lock mark and the holder's name when taken by someone else); tapping a free card sends `appearance` with the new `characterId` and keeps the other choices. The own card is highlighted.
2. Three option rows: glasses (Default / None / Round), top (Default / Sweatshirt / Suit), hat (None / Cap / Fez), as segmented buttons of at least 44 px; each sends `appearance`.
3. Optimistic UI: the chosen values show at once and are replaced by the server's lobby entry when it arrives; on `character_taken` the choice reverts and a short note shows.
4. A small preview canvas of the chosen character (the same `createPlayerMesh` rig, slowly turning, static under `prefers-reduced-motion`), sized to fit above the cards on a phone. If the preview needs a second WebGL context that proves too costly or unreliable, render it with a single shared offscreen render into a 2D canvas, or defer the preview and report it; the picker works without it.
5. Players listed in the lobby show their character name beside their own name.
6. The section lives inside `#lobby-panel` or a new section placed by the lobby grid (not in `#lobby-chat`); at 320 px there is no horizontal scroll; every control is at least 44 px.
7. Pure logic with tests first: `pickerView(lobbyMessage, localId)` giving the six cards (`state: 'own' | 'free' | 'taken'`, `holderName`) and the option rows' current values, plus the optimistic merge rule (a pending local choice is kept until the server's echo shows it).

## Tasks and order

1. Task 1 (shared, server), Sonnet review.
2. Tasks 2 and 3 in parallel in separate worktrees after Task 1 is merged on the branch; each gets a Sonnet review; Task 3 may touch `lobby.ts`, Task 2 `playerMesh.ts`, `main.ts` and `game.ts`: if both need `main.ts`, Task 3 only adds the `onAppearance` handler and Task 2 the appearance map.
3. ROADMAP row 31 → `needs sign-off`, decision line, spec section, full checks, push, PR, merge. Send screenshots of all six characters.

## Not in this step

Unlocking with coins, more items, colour pickers, a second model, animations per outfit, saving the choice between sessions (the server keeps it for the room only; the client may remember the last pick in `localStorage` as a convenience if cheap, with a try/catch).
