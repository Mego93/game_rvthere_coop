# Step 30: animated lobby and chat

Spec: ROADMAP "Step 30: lobby and chat". Owner's wording: "The menu lobby is too simple; add some animations, with responsive content, and if possible a chat, both in game and in the lobby." Decisions taken here (the open questions): chat is text plus a row of quick phrases (for phones), and in the game it is hidden until opened; a few recent lines show as fading toasts.

## Protocol and server (Task 1)

Constants (`packages/shared/src/constants.ts`): `CHAT_MAX_LENGTH = 120` (characters after trim), `CHAT_BURST = 4` messages, `CHAT_REFILL_SECONDS = 1.5` (one message back per 1.5 s), `CHAT_HISTORY = 30` lines kept per room, `CHAT_PHRASES` (frozen list of 8 short strings, in this order: `Ready!`, `Wait for me`, `Go go go`, `Slow down`, `Need fuel`, `Need a repair`, `Use the winch`, `Thanks!`), shown by the client; the server accepts any valid text.

Messages (`protocol.ts`):
- client: `{ type: 'chat'; text: string }`.
- server: `{ type: 'chat'; playerId: string; name: string; text: string; at: number }` where `at` is the room clock in whole seconds. Added to `ServerMessage`, `parseClientMessage`, `parseServerMessage` and the `ERROR_REASONS` list only if a new reason is needed (rule 4: none is).

Behaviour rules:
1. `parseClientMessage` accepts `chat` when `text` is a string whose trimmed value is 1 to `CHAT_MAX_LENGTH` characters (counted by code points) and has no forbidden character (`hasForbiddenNameCharacter`, which also bars control characters and newlines); the parsed text is the trimmed one. Anything else returns null (the existing bad-message path).
2. The room relays an accepted chat to every connected player (including the sender) in every phase (lobby, playing, results), tagged with the sender's `playerId` and current name, never trusting a client-supplied name.
3. Rate limit per player: a token bucket of `CHAT_BURST` tokens refilling one per `CHAT_REFILL_SECONDS`, on the room clock. A message with no token is dropped silently (no error, no strike). The existing connection-level rate limiter still counts every message first.
4. The room keeps the last `CHAT_HISTORY` chat messages. A player who joins, or reconnects with a token, receives the history right after `welcome`, oldest first, as ordinary `chat` messages. History survives the lobby, the run and the results of the same room, and is dropped with the room.
5. A message from a player who is not seated in the room (not yet joined) is ignored like any other pre-join message.
6. No change to the world, snapshots or `input`. The worker (Durable Object) must need no change: Task 1 confirms by running the worker typecheck and its tests, and reports if it does.

Tests (shared `protocol.test.ts`, server `room` tests): parse accepts and trims; rejects empty, whitespace-only, 121 characters, 120 characters accepted, a newline, a control character, a non-string; code-point counting (an emoji counts as 1); relay to all players in lobby, playing and results; name and id come from the server; burst of 4 passes and the 5th is dropped, then one passes after 1.5 s of room clock; history of 31 messages keeps the last 30 in order; a reconnecting player gets the history once; a pre-join chat is ignored; a spoofed `name` field in the client message has no effect.

## Client chat (Task 2, after Task 1)

Files: `packages/client/src/ui/chat.ts` (state and view model, no DOM), `chat.test.ts`, the chat DOM beside `lobby.ts` and the in-game overlay, `net/socket.ts` message plumbing, CSS where the other panels keep theirs.

Rules:
1. `createChatLog(limit)` keeps the last 50 lines `{ playerId, name, text, at, own }`, dedupes the history replay after a reconnect (same playerId, text and `at` ignored), and exposes `unread` (lines since the panel was last open) and `recent(now)` (lines younger than 6 s, at most 3, for the in-game toasts).
2. `createChatSender()` throttles the client the same way as the server (burst 4, one per 1.5 s, local clock) and returns false when blocked, so the input shows "slow down" instead of sending.
3. Lobby: a chat panel (log, text input with `maxlength` 120, send button, the eight quick phrases as buttons) beside the player cards on desktop and below them on a phone. Enter sends.
4. In game: hidden by default. `T` (desktop) or a chat button (phone, in the touch UI's top row) opens a panel with the input and the phrases; while it is open, game input is suspended (no movement, driving or action keys reach `input`) and the pointer is released as the existing menus do; Enter sends and closes, Esc closes. When closed, up to 3 recent lines show as fading toasts at the left edge, and the button shows an unread dot.
5. Names and texts are always set with `textContent`, never as HTML. A line from the local player is styled as own.
6. The controls panel (H) and the tutorial list the new key.

Tests: `chat.test.ts` covers rules 1 and 2 (limit 50, dedupe, unread counting, recent window and cap, throttle). Input suspension (rule 4) gets a test in the client's input module tests: while chat is open `buildInput` yields neutral input. The DOM and layout are left to owner sign-off.

## Animated, responsive lobby (Task 3, independent of 1 and 2)

CSS-first, no new dependency, no change to `lobbyView` behaviour or the protocol.
1. A background of slowly drifting layers (sky gradient, a repeating dune or skyline strip, a small Lodgy or RV silhouette driving across), pure CSS keyframes, paused under `prefers-reduced-motion: reduce` (the static layers stay).
2. Player cards slide and fade in when a player joins (a class added once per new `playerId`), a short pulse when the ready state changes, and a fade when a player leaves or disconnects; the admin card carries a badge.
3. Settings (course, vehicle, time of day, weather) change with a short transition; the Start button pulses when it becomes enabled.
4. Layout: two columns (players and settings | chat) at 900 px and wider, one column below it; tap targets at least 44 px on a phone; no horizontal scroll at 320 px width; safe-area insets respected on iPhone.
5. The existing lobby tests keep passing unchanged. A new `lobbyAnimation.test.ts` covers the one piece of logic: `newPlayerIds(previous, next)` and `readyChanged(previous, next)` (pure functions exported from `lobby.ts` or a new module) used to decide which cards animate.
Rendering and feel are left to owner sign-off; a Playwright screenshot of the lobby at 1280 x 800 and 390 x 844 (and at 320 wide for the no-scroll check) is taken for the report, not committed.

## Tasks and order

1. Task 1 (shared, server): protocol, constants, room relay, history, tests. Sonnet implementer, then a Sonnet review.
2. Task 3 (client CSS and pure helpers) in parallel with Task 1, in its own worktree; its review.
3. Task 2 (client chat) after Task 1 is merged into the branch; its review.
4. ROADMAP row 30 → `needs sign-off`, decision line, spec section (messages, limits, history, in-game behaviour), full checks, push, PR, merge.

## Not in this step

Moderation, muting, private messages, emotes, profanity filtering, chat persistence beyond the room, a spectator chat, sound for chat.
