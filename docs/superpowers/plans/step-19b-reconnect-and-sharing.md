# Step 19b: Reconnection, WebGL context-loss reload, page lifecycle, and the one-command shared start

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`. Read these sections:
- "Error handling" (Disconnects)
- "Client", the parts on `net` (reconnect) and `ui` (the reconnect overlay)
- the WebGL context-loss line
- "Running and hosting"
- the `server` section's held slots, which step 11 built

ROADMAP carried rows for step 19:
- The page does not reconnect.
- The one-command start behind the tunnel must set `TRUST_PROXY=1`.
- Page lifecycle: socket close codes, messages after `close()`, timeouts, Three.js disposal, logging the WebGL failure, and `dev.mjs` leaving children.

Step 19a (server hardening) is done. The always-on hosting decision is the owner's and is not in this plan.

This plan fixes interfaces, constants, rules and test cases. Implementers write the tests first, then the code. Where the plan and the spec disagree, or neither answers a question, stop and report.

This step ends at `needs sign-off`. The owner checks the tunnel and a real phone backgrounding.

## Goal

- A dropped connection shows "Reconnecting…" and rejoins within 30 s, keeping the player's slot.
- A lost WebGL context reloads the page and rejoins by itself.
- Sockets and games clean up fully.
- `npm run share` starts the server behind a Cloudflare quick tunnel and prints the public link.

## Constants (`packages/client/src/net/reconnect.ts`, exported)

| Name | Value | Meaning |
|---|---|---|
| `RECONNECT_WINDOW` | 30 | s from the drop to giving up; matches `HELD_SLOT_TIMEOUT` |
| `RECONNECT_DELAYS` | `[0.5, 1, 2, 4, 8]` | s between attempts; the last repeats |
| `SOCKET_OPEN_TIMEOUT` | 8 | s; a socket not open by then is closed and counts as a failed attempt |
| `SERVER_SILENCE` | 6 | s with no message from the server (pings come every 2 s) before the page closes the socket itself |

## Rules

P1. **Socket** (`net/socket.ts`).
- `onClose(info: { code: number; byServer: boolean })` replaces `onClose()`. `byServer` is false when the page called `close()`.
- After `close()` is called, no further `onMessage` or `onOpen` is delivered.
- A socket that has not opened within `SOCKET_OPEN_TIMEOUT` is closed and reported once with code 4000.
- Once open, if no message has arrived for `SERVER_SILENCE`, the page closes the socket and reports code 4001.
- The socket takes a clock and timer parameter (`now(): number`, `setTimer(fn, ms)`, `clearTimer(id)`), so tests can drive it with a fake WebSocket class.

P2. **Reconnect state** (pure, `net/reconnect.ts`):

```
reconnectStep(state, event, now): { state, action }
```

- **Events:** `'joined'`, `'dropped'`, `'attemptFailed'`, `'kicked'`, `'refused'`, `'left'`.
- **Actions:** `'none'`, `{ connectAt: number }`, `'giveUp'`.
- **Rules:**
  - A `'dropped'` while joined starts reconnecting at `now` and schedules the first attempt at `now + RECONNECT_DELAYS[0]`.
  - Each `'attemptFailed'` schedules the next delay. The last delay repeats.
  - When the next attempt would start after `droppedAt + RECONNECT_WINDOW`, the action is `'giveUp'`.
  - `'joined'` returns to joined.
  - `'kicked'`, `'refused'` (`unknown_room`, `room_full` or `name_taken` on a rejoin) and `'left'` give up at once, with no retry.

P3. **Page wiring** (`main.ts`).
- **On a drop:** when the socket closes while the page is in a room, and the close was not from `kicked` or the page itself:
  - Stop the game; its world is gone anyway.
  - Keep the screen state.
  - Show `#reconnect` with the text "Reconnecting…" over everything.
  - Run P2.
- **Each attempt** opens a new socket and sends `join { room, name, token }`, with the same token, so the server restores the held slot.
- **On `welcome`**, hide `#reconnect` and route the following `lobby` message as usual. In `playing` a fresh game starts and gets a full snapshot.
- **On `giveUp`**, show the home page with the close text:
  - "The connection to the server was lost." after the window;
  - the error's text after a refusal.
- **Kicked:** a kicked player never reconnects (spec).
- **While reconnecting**, the page sends nothing else.

P4. **WebGL context loss.**
- On the canvas's `webglcontextlost` event, the page saves `{ room, name }` to session storage under `lodgy.rejoin` and calls `location.reload()`.
- On load, if `lodgy.rejoin` names the room in the current URL, the page clears it and joins at once with the saved name. It does not show the name form.
- A failure to create the WebGL renderer is logged with `console.error` as well as shown.

P5. **Disposal.** `game.stop()` disposes every geometry and material in the game's scene and removes the scene's children. The shared renderer stays, and is not disposed between runs.

The snapshot buffer is created per game, so it needs no reset. That covers the carried row's buffer item by design.

P6. **dev.mjs.** Children are spawned in their own process group (`detached: true`). `stopAll` kills each group (`process.kill(-pid)`), so ports 3000 and 5173 are freed when either side stops. Windows keeps today's `child.kill()`.

P7. **`npm run share`** (`scripts/share.mjs`).
- It builds the client if `packages/client/dist` is missing.
- It starts the server with `TRUST_PROXY=1` and `PORT` (default 3000).
- It then runs `cloudflared tunnel --url http://localhost:<PORT>`, a quick tunnel that needs no account.
- It prints the `https://….trycloudflare.com` address it reads from cloudflared's output.
- It stops both when either exits.
- If `cloudflared` is not on the `PATH`, it prints how to install it, and does not start the server.
- Option parsing and URL extraction are pure functions with tests: `parseShareArgs(argv, env)` and `tunnelUrl(line): string | null`.

P8. **Documents.** "How to run" gains `npm run share`, with the note that it sets `TRUST_PROXY=1`. This covers the carried row.

## Modules and signatures

Client:
- `net/socket.ts`: P1.
- `net/reconnect.ts` (new): P2 and the constants.
- `main.ts`: P3 and P4.
- `index.html`: `#reconnect`.
- `game.ts`: P5.

Other:
- `scripts/dev.mjs`: P6.
- `scripts/share.mjs` (new) and `scripts/share.test.mjs`, or a `.ts` test under a package. Choose what the repo's test setup runs, and say which.
- Root `package.json`: the `share` script.

## Existing tests that change

- Any test of `openSocket`'s `onClose` signature. Grep for it and name the files.
- `e2e` tests: none expected.

## Tests (numbered)

- P1t. Socket, with a fake WebSocket class and a fake clock:
  - `onClose` gets the code and `byServer`;
  - no message is delivered after `close()`;
  - the open timeout gives code 4000 once;
  - server silence gives code 4001;
  - pings reset the silence timer.
- P2t. `reconnectStep`:
  - the delay sequence and its repeat;
  - giving up at the window boundary (an attempt scheduled exactly at 30 s is still made; one after it is not);
  - `kicked`, `refused` and `left` give up at once;
  - `joined` resets.
- P3t. Browser:
  - Two pages in a run. The test closes page B's socket from the page side with `page.evaluate`, through a test hook `window.__lodgyDropSocket()` that exists only when the URL has `?test`.
  - `#reconnect` shows, then hides.
  - Page B is back in the run under the same player name, and page A's players line still shows two players.
  - A second case: the server is unreachable, simulated by blocking `/ws` with `page.route`. The page shows the home page with "The connection to the server was lost." within 35 s, so the test timeout is 45 s.
- P4t. Browser, using the `?test` hook `window.__lodgyLoseContext()`, which calls `WEBGL_lose_context.loseContext()`:
  - the page reloads and is back in the run under the same name, without the name form.
- P7t. `parseShareArgs` and `tunnelUrl`. The latter uses a sample cloudflared log line, plus non-matching lines.

## Tasks

1. **Socket and reconnect logic.** P1 and P2, with tests P1t and P2t.
   - Commit: `feat(client): the socket times out and reconnecting is a pure state machine`.
2. **Page wiring.** P3, P4 and P5, with tests P3t and P4t.
   - Commit: `feat(client): reconnect after a drop and reload after a lost WebGL context`.
3. **Scripts.** P6 and P7, with test P7t.
   - Commit: `feat(repo): npm run share starts the server behind a quick tunnel`.
4. **Documents** (main session).
   - ROADMAP: step 19 → `needs sign-off` (the tunnel on the owner's machine and the hosting decision remain).
   - Delete the three carried rows.
   - Log P1–P8.
   - Update "How to run" and "Runnable today".

Each task: tests first, then a Sonnet review. Run `npm test` and `npm run typecheck` before each commit, and Playwright in task 2.

## What the owner checks by hand

- `npm run share` on their machine with cloudflared installed.
- A friend joining by the printed link.
- An iPhone backgrounded for 10 s, then returning: it reconnects, or reloads after a context loss.
- Wi-Fi toggled off and on mid-run.
- The always-on hosting decision.

## Known risks to watch in review

- A reconnect attempt that races a late `close` from the previous socket. Each socket's handlers must be ignored once that socket is replaced.
- `location.reload()` loops if the context is lost straight after load. Allow at most one automatic reload per 10 s: store the time in `lodgy.rejoin` and skip the reload if the stored time is within 10 s.
- The `?test` hooks must not exist in normal use.
