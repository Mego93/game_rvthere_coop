# Step 30: animated lobby and chat

Spec: ROADMAP "Step 30: lobby and chat". Owner's wording: "The menu lobby is too simple; add some animations, with responsive content, and if possible a chat, both in game and in the lobby." Decisions taken here (the open questions): chat is text plus a row of quick phrases (for phones), and in the game it is hidden until opened; a few recent lines show as fading toasts.

**The amendments Q1–Q12 at the end (from the plan review) replace any line above that they contradict.**

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

## Amendments from the plan review (Q1–Q12)

- Q1 The server `chat` message is `{ type: 'chat'; id: number; playerId: string; name: string; text: string; at: number }`. `id` is a per-room counter starting at 1, never reset by `toLobby`/`next`; `at` is `Math.floor(now)` of the server clock (time since process start) and is opaque: the client never compares it with its own clock. `parseServerMessage` gets a `case 'chat'` checking `isCount(id)`, `isText(playerId)`, `isText(name)`, `isText(text)`, `isCount(at)`.
- Q2 Client dedupe is by `id` (ignore `id <= lastSeenId`); each line is stamped with the client's receive time for toasts and unread. This replaces the (playerId, text, at) dedupe and the `recent(now)` use of `at`.
- Q3 Room API: `Room.chat(player: RoomPlayer, text: string, now: number): void`; `server.ts` handles `case 'chat': if (!session.room || !session.player) return; session.room.chat(session.player, message.text, now)` (a pre-join chat is silently ignored, unlike other commands; stated on purpose). The token bucket lives on `RoomPlayer` (`chatTokens`, `chatAt`) so a reconnect does not refill it. Broadcast skips non-connected players as it already does; they get history when they rejoin. History goes only to the joiner, in `catchUp`, after welcome, lobby and results, oldest first; an empty history sends nothing, so the pinned `['welcome','lobby']` and `['welcome','lobby','results']` tests stay. Add a test of that order with non-empty history.
- Q4 Constants: `CHAT_PHRASES = Object.freeze([...] as const)` in `constants.ts`, exported through the package index. A tab or a ZWJ in the text is rejected by the forbidden-character rule (so multi-part emoji are rejected); the spec says so.
- Q5 Keyboard: `createKeyboardSource` in `input/keyboard.ts` ignores `claim`, `onKeyDown` and `onKeyUp` for events whose target is INPUT, SELECT or TEXTAREA (test in `keyboard.test.ts`). The chat-open flag joins `anyOpen()` in `game.ts` so `inputFrozen` and `menuInput` give neutral input and the pointer-lock click is gated; `createGame` gets a `chatOpen` view field and `setChatOpen(open)` like `setControlsOpen`. The suspension test targets `inputFrozen(chatOpen || ..., phase)` (the real helper in `ui/shopMenu.ts`; `buildInput` does not exist).
- Q6 `T` (desktop): ignored when the target is an input, on `repeat`, with a modifier, when the run menu, shop, help or tutorial is open, or when the phase is not `playing`. Opening calls the game's `releaseLock()` first (so no run menu opens), then `setChatOpen(true)` and focuses the input. Esc inside chat uses a capture-phase window keydown listener with `stopImmediatePropagation` (as `controls.ts` and `tutorial.ts`), registered after them so help and the tutorial close first. Enter with empty text closes the panel; Enter with text sends and closes. Closing does not re-request pointer lock (a click does, as for the menus). H and M do not fire while the chat input is focused (existing behaviour).
- Q7 Tests that change: `controls.ts` gets `KeyT` in `EXTRA_CODES` and a row `{ group: 'Game', keys: ['KeyT'], action: 'Open chat' }`; the Escape row mentions chat; `tutorial.test.ts` pins the step ids, so the chat key is added to the text of the existing `help` step only (no new step); `main.ts` `onMessage` gets `case 'chat'`.
- Q8 Ownership: `createChatLog` and `createChatSender` live in `main.ts` scope beside `lobby`, `results` and `helpPanel`, outlive `game`, and are cleared when the room is left. The log receives chat even before the first `lobby` message. CSS stays inline as a `STYLE` per component: `ui/chat.ts` for the in-game panel and toasts, `lobby.ts` for the lobby.
- Q9 In-game DOM: panel and toasts sit outside `#touch-ui` (which has `pointer-events: none`), z-index 15 (above touch-ui 10, below lobby 20). On a phone the input sits at the top of the screen under the safe-area inset, so the keyboard never covers it; in landscape the input stays visible. The phone button `#touch-chat` is made like `touch-menu` (`make('touch-chat', 'Chat', ...)`), placed `right: calc(12px + 56px + 8px + env(safe-area-inset-right))`, at least 44 px high, `TouchUi.onChat(handler)`, hidden outside `playing` like the menu button, an unread dot via a class like `button.on`. Focus of the input happens synchronously in the touch handler (iOS). In the results phase there is no chat panel; the toasts still show.
- Q10 Input attributes: font-size at least 16 px (no iOS zoom), `autocomplete="off"`, `autocapitalize="sentences"`, `enterkeyhint="send"`, `maxlength=120`; the client counts code points and trims before sending (it validates with the server's rules, so an in-game `bad_message` cannot happen from the UI). In the lobby the input scrolls into view on focus and `#lobby` keeps `overflow-y: auto`.
- Q11 Parallel conflict: Task 3 builds the two-column grid and an empty chat slot, `<section id="lobby-chat">` with `grid-area: chat`, and makes `show()` in `lobby.ts` diff players by `playerId` (reusing the `li`, adding a class only for a new id or a changed ready state, a leave class before removal) with the previous view kept in the `createLobby` closure; Task 2 only fills `#lobby-chat` and adds `LobbyHandlers.onChat`. Task 2 starts after both Task 1 and Task 3 are merged into the branch. Check `lobby.test.ts` and the Playwright e2e specs for pinned lobby DOM before Task 3 and name what changes.
- Q12 Worker: no change (confirmed by the review); Task 1 still runs the worker typecheck and tests.
