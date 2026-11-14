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

## Amendments after the plan review (binding; where they differ from the text above, they win)

These facts were probed in headless Chromium:
- `page.route` does not intercept WebSockets.
- `page.routeWebSocket` with `connectToServer()` can close the socket from the server side.
- `context.setOffline(true)` stops traffic on an open socket without closing it, and makes new sockets fail at once.
- `WEBGL_lose_context` exists, and `getContext('webgl2')` returns the page's existing context.
- `location.reload()` keeps sessionStorage.
- Vitest includes only `packages/*/src/**/*.test.ts`.

Q1 (P3t replaced). Browser tests run in the `desktop` project only (`test.skip(testInfo.project.name !== 'desktop')`), with a 45 s timeout. Pages A and B each have their own browser context.
- **(a) Silent drop.**
  1. `contextB.setOffline(true)`, wait 10 s, then `setOffline(false)`.
  2. `#reconnect` becomes visible with "Reconnecting…", then hidden.
  3. B's players line shows `Badr …` again.
  4. A's players line shows two players again, checked with `expect.poll`; it showed one while B's slot was held.
- **(b) Server closes the socket.**
  1. Before `goto`, page B installs `page.routeWebSocket(/\/ws$/, ws => { current = ws; ws.connectToServer(); })`.
  2. In the run, call `current.close({ code: 1001 })`.
  3. `#reconnect` shows, and B is back in the run under the same name.
- **(c) Unreachable.**
  1. `contextB.setOffline(true)`, and leave it offline.
  2. Within 40 s, B shows `#home` with "The connection to the server was lost."

The `?test` hooks are deleted, here and in "Known risks".

Q2 (P3, refusals during a reconnect).
- Until an attempt receives `welcome`, any `error` on the attempt socket feeds `'refused'` into P2. The page then closes that socket itself and shows the home page with `errorText(reason)`.
- `playerId` is set to `''` at the drop and is set again by `welcome`.
- A server restart, or a discarded room, therefore ends with "There is no room with that name."
- **Spec decision (logged):** a rejoin whose `welcome.playerId` differs from the old one is treated as `'refused'`. This happens when the slot was kicked, or expired on the server first. The page closes the socket and shows the home page with "Your place in the room was lost." It never silently becomes a new player.

Q3 (P1 interface).
```
openSocket(url: string, handlers: SocketHandlers, deps: SocketDeps = browserDeps): GameSocket
interface SocketDeps { createSocket(url: string): WebSocketLike; now(): number; setTimer(fn: () => void, ms: number): number; clearTimer(id: number): void }
WebSocketLike = { readyState: number; send(data: string): void; close(code?: number): void; addEventListener(type: 'open' | 'message' | 'close', fn: (event: any) => void): void }   // open is readyState === 1
```
- `onClose(info: { code: number; byPage: boolean })` is called exactly once per socket.
- `byPage` is true only when `GameSocket.close()` was called. In that case `onClose` runs synchronously inside `close()`, with code 1000.
- The open timeout (4000) and server silence (4001) are reported synchronously, with `byPage: false`.
- After any report, native events from that socket are ignored: no further open, message or close.

P1t adds two cases:
- `close()` reports `{ code: 1000, byPage: true }` once, and a later native close reports nothing.
- The ping reset case advances the clock past 6 s in total, with a ping before the 6 s mark.

Q4 (P2 state).
```
type ReconnectState = { kind: 'idle' } | { kind: 'joined' } | { kind: 'reconnecting'; droppedAt: number; failures: number } | { kind: 'gaveUp' }
export const RECONNECT_IDLE: ReconnectState
```
Transitions:
- `'joined'` from any state goes to `joined`, with `'none'`.
- `'dropped'` in `joined` goes to `reconnecting { droppedAt: now, failures: 0 }`, with `connectAt: now + DELAYS[0]`. In any other state it gives `'none'`.
- `'attemptFailed'` in `reconnecting` sets `failures + 1`, and `t = now + DELAYS[min(failures + 1, 4)]`. It gives `connectAt: t` if `t <= droppedAt + RECONNECT_WINDOW`, otherwise `'giveUp'`.
- `'kicked'`, `'refused'` and `'left'` in any state go to `gaveUp`, with `'giveUp'`.

In `main.ts`, events come from these sources:
- `'dropped'`: a close of the joined socket.
- `'attemptFailed'`: a close or timeout of an attempt socket before its `welcome`.
- `'left'`: any close by the page itself (the something-wrong path, the WebGL-unavailable path, the context-loss reload).

Constants are derived from shared: `RECONNECT_WINDOW = HELD_SLOT_TIMEOUT` and `SERVER_SILENCE = SILENCE_TIMEOUT`.

Q5 (P3, hard bound). When reconnecting begins, a deadline timer is set for `droppedAt + RECONNECT_WINDOW + SOCKET_OPEN_TIMEOUT`. When it fires, the page closes any attempt socket that is still open and gives up with "The connection to the server was lost."

Q6 (kicked). On `error { kicked }`, `main.ts`:
1. sets `closeReason = errorText('kicked')`;
2. feeds `'kicked'` into P2;
3. calls `socket.close()` itself.

Q7 (P4 helpers, in `session.ts`, with unit tests).
- `saveRejoin(store, { room, name, at })`.
- `takeRejoin(store, room: string | null): { name: string } | null`. It reads the value, checks the JSON shape and `cleanRoom`, and clears it by writing `''`.
- `lastAutoReload(store): number | null` and `markAutoReload(store, at)`, under the separate key `lodgy.reloadedAt`, which is never cleared on load.

On `webglcontextlost` while in a room:
- If `now − lastAutoReload < 10 s`, close the socket (`'left'`) and show the home page with "The 3D view was lost. Reload the page to continue."
- Otherwise save both keys and reload.

On `webglcontextlost` outside a room: set `renderer = null`, so the next run makes a new renderer.

On load with a valid rejoin:
- show `#reconnect`, and send `join` once;
- any failure shows the home page with the name filled in and the error, with no retry;
- a page hide during this never shows the overlay or starts an attempt (`pagehide` flag).

Session tests:
- S1: round trip.
- S2: the wrong room returns null and clears the value.
- S3: malformed JSON returns null.
- S4: the reload time survives `takeRejoin`.

P4t: in the run, call `page.evaluate(() => document.querySelector('canvas#game').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext())` and wait for `load`. B is then back in the run under the same name, the name form was never filled, and `lodgy.rejoin` is empty.

Q8 (P3, nothing sent while reconnecting).
- The attempt socket lives in its own variable. `socket`, which UI handlers and `game` use, is null from the drop until `welcome`.
- `#reconnect` is `position: fixed; inset: 0; z-index: 30` and blocks pointer input, with `role="status"`.
- Every socket handler in `main.ts` first checks that its socket is still the current socket or the attempt socket.

Q9 (P5). A `disposeScene(scene)` helper in `render/` disposes geometries, materials and material maps (including the player sprite's `CanvasTexture`). It is tested in node: every geometry and material gets at least one `dispose` call, and the scene ends with no children.

Q10 (P6).
- `process.kill(-pid)` is wrapped in a try/catch for ESRCH.
- Detached children get `stdio: ['ignore', 'inherit', 'inherit']`.
- SIGHUP is handled like SIGINT.
- Windows keeps `child.kill()`. Note that `npm.cmd` needs `shell: true` on current Node; the share script uses it on Windows.

Q11 (P7).
- **Location.** The pure functions live in `scripts/shareLib.mjs`, so importing them starts nothing. Their tests are in `scripts/shareLib.test.mjs`. `vitest.config.ts` gains `'scripts/**/*.test.mjs'` in `include`, and is named as a changed file.
- **`parseShareArgs(argv, env): { port: number } | { error: string }`.** `--port N` overrides `env.PORT`, which defaults to 3000. A port that is not an integer from 1 to 65535 is an error.
- **`tunnelUrl(line)`.** It matches `/https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/`. cloudflared logs to stderr; the script reads stderr and stdout line by line with `readline`.
- **Tests, P7t:**
  - the box line gives the URL;
  - the "Requesting new quick Tunnel…" line gives null;
  - an `api.trycloudflare.com` error line gives null;
  - an empty line gives null;
  - the port precedence and invalid-port cases.
- **Starting the server.** The script spawns `npm start` with `TRUST_PROXY=1` and `PORT`. That always builds the client, so the script never serves a stale one.
- **Missing cloudflared.** It is detected with `spawn('cloudflared', ['--version'])` and an `ENOENT` error event. The script then prints `brew install cloudflared` (macOS) and Cloudflare's downloads page, and notes that a quick tunnel refuses to start when `~/.cloudflared/config.yml` exists.

Q12 (task 4, documents).
- Delete the carried rows about reconnecting and page lifecycle.
- Cut the `TRUST_PROXY` row down to the IPv6 /64 and header-timeout items, and keep it for the hosting decision.
- Amend the spec:
  - §3 "Disconnects": delays, open timeout, page-side silence, the hard bound, give-up texts, and the lost-place rule.
  - "Camera and rendering": the reload guard and the auto-join.
  - "Running and hosting": `npm run share`, the quick tunnel, and `TRUST_PROXY=1`.
- Log the changes in the decisions log.
- Add Safari's back/forward cache restore to the owner's checks.

"Existing tests that change": none. No test covers `openSocket`, and the e2e reload test is unaffected.
