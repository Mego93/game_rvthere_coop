# Step 19a: Server hardening (the carried step-19 rows, pulled forward)

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md` (sections "server" (rate limit, liveness, room limit, failures), "Running and hosting"). ROADMAP "Carried into later steps", the four rows for step 19 about connections, room exhaustion, server hardening and page lifecycle (this plan covers the first three; the page-lifecycle row stays with step 19's reconnection work). This plan fixes interfaces, constants, rules and test cases. Implementers write the tests first, then the code. Where the plan and the spec disagree, or neither answers a question, stop and report.

This work runs **in parallel with steps 8–14** (owner's permission, 2026-11-13). It touches only `packages/server` and `constants.ts` (one appended block). Implementers work in a separate git worktree on branch `step-19a-server-hardening`; the main session merges. Step 19 keeps the tunnel, the one-command start, reconnection, the WebGL reload and the hosting decision.

## Goal

The server stays up and fair when exposed through a tunnel: connections are capped in total and per address, slow readers are dropped, room creation is limited per address, a rate-limit evader is closed, an event-loop stall does not drop everyone, and every failure is reported once rather than flooding the log.

## Decisions made in this plan (log them in `ROADMAP.md` in the last task)

A1. Client address: the socket's remote address; when the environment variable `TRUST_PROXY=1` is set (behind the Cloudflare Tunnel), the first value of the `CF-Connecting-IP` header when present. The room layer receives it as `Connection.address: string`.
A2. Caps on WebSocket upgrades (checked before the upgrade completes; refused with HTTP 503 and no body): `MAX_CONNECTIONS` in total, `MAX_CONNECTIONS_PER_ADDRESS` per address.
A3. A socket whose `bufferedAmount` exceeds `MAX_SEND_BUFFER` bytes after a send is terminated (a reader that cannot keep up).
A4. Room creation per address: at most `CREATE_PER_MINUTE` `create` messages per address in any 60 s window; beyond, `create` is refused with `server_full`. A room in which nobody but its creator ever joined, and that is now empty, is deleted after `SOLO_ROOM_TIMEOUT` instead of `EMPTY_ROOM_TIMEOUT`.
A5. Rate limit strikes: besides the spec's rule (3 s continuously over the limit), a connection over the limit in `RATE_LIMIT_STRIKES` of the last `RATE_LIMIT_STRIKE_WINDOW` whole seconds is closed. Spec "Rate limit" is amended.
A6. Event-loop stall: when the room server's timer callback finds more than `STALL_GRACE` seconds since its previous run, it adds the excess to every session's `lastHeard` before checking liveness, so a stall alone never drops a connection. Spec "Liveness" is amended.
A7. Failure reports are rate-limited per source: the same source (a string key: `timer`, `static`, `socket`, `room:<noun>`) reports at most once per `REPORT_INTERVAL` seconds, with a count of the suppressed reports in the next one.
A8. `RunningServer.close()` also calls `http.closeAllConnections()`; a binary frame gets `terminate()`, not `close()`; static file failures (other than not-found) are reported (A7, source `static`) and answered with 500.
A9. Takeover lookup (a `join` whose token matches a connected slot) uses a map from player to session instead of scanning every session.

## Constants (`constants.ts`, block "Server hardening")

| Name | Value | Meaning |
|---|---|---|
| `MAX_CONNECTIONS` | 300 | WebSocket connections in total |
| `MAX_CONNECTIONS_PER_ADDRESS` | 12 | per client address (two families at most behind one address) |
| `MAX_SEND_BUFFER` | 1048576 | bytes queued to one socket before it is dropped |
| `CREATE_PER_MINUTE` | 5 | `create` messages per address per 60 s |
| `SOLO_ROOM_TIMEOUT` | 10 | s; an empty room nobody else ever joined |
| `RATE_LIMIT_STRIKES` | 3 | over-limit seconds … |
| `RATE_LIMIT_STRIKE_WINDOW` | 6 | … within this many seconds closes the connection |
| `STALL_GRACE` | 1 | s between timer runs before the excess counts as a stall |
| `REPORT_INTERVAL` | 10 | s between reports from one source |

## Modules and signatures

- `room/types.ts`: `Connection` gains `address: string`. `RoomDeps.onError` becomes `onError(error: unknown, source: string)`; reporting goes through a new `room/report.ts`: `createReporter(onError, clock): (source: string, error: unknown) => void` (A7).
- `room/rateLimit.ts`: A5 in `createRateLimiter` (the `hit(now)` signature is unchanged).
- `room/server.ts`: A4 (a per-address create log keyed by `Connection.address`; solo rooms), A6, A9.
- `room/room.ts`: tracks whether anyone but the creator ever joined (`everJoinedByOthers(): boolean`).
- `node/listen.ts`: A1–A3, A8; upgrades handled with `noServer: true` and `http.on('upgrade')` so caps are checked first. `ServerOptions.trustProxy?: boolean` (from `TRUST_PROXY` in `main.ts`).
- `node/static.ts`: reports failures (A8).

Every existing server test must pass with only these mechanical changes: fake connections gain `address` (default `'test'`), and `onError` fakes accept the second argument. List the files changed for that.

## Tests (numbered)

Room layer (fake clock, connections, timer):
- T1. Rate limiter: exactly 120 messages in a second pass, the 121st drops; 3 s continuously over closes at the start of the 4th over-limit second and not before (boundary); alternating flood and quiet seconds closes on the 3rd flood second within 6 s; flood seconds 7 s apart never close.
- T2. Liveness: 6 s of silence drops (boundary: 5.99 s does not); a timer gap of 4 s (stall) with all clients silent during it drops nobody; a client silent for 6 s of real (non-stalled) time is still dropped after a stall.
- T3. Create limit: the 6th `create` from one address within 60 s is refused with `server_full`; another address can still create; after 60 s the first can create again.
- T4. Solo room: a room whose creator leaves and that nobody else joined is deleted after 10 s; a room someone else joined lasts 60 s empty.
- T5. Reports: a timer callback that throws on every tick produces one report per 10 s with a suppressed count; distinct sources are independent.
- T6. Takeover still works and does not depend on session order (two sessions, token match on the second).

Node adapter (real sockets on port 0):
- T7. The 13th connection from one address gets 503; the 301st in total gets 503 (with the constants injected lower for the test via `ServerOptions` overrides `caps?: { total: number; perAddress: number }`).
- T8. `TRUST_PROXY`: with it on, `CF-Connecting-IP` decides the address (two different headers from the same socket address are counted separately); with it off, the header is ignored.
- T9. A binary frame terminates the socket (the close event comes with code 1006).
- T10. HTTP: `HEAD /` gives 200 with no body; `GET /ws` without an upgrade gives 400 or 426 (whatever `ws` answers — assert not 200); a WebSocket to a wrong path (`/nope`) is refused; a static read failure (a directory as the client folder file, or an injected failing reader) gives 500 and one report.
- T11. `close()` resolves while an idle keep-alive HTTP connection is open (closeAllConnections).
- T12. Send buffer: a fake socket whose `bufferedAmount` reads above the cap after a send is terminated (unit test of the send wrapper, exported as `sendOrDrop(socket, data, cap)`).

## Tasks

1. Room layer: A4–A7, A9, T1–T6 (`room/*`, constants). Commit `feat(server): harden the room server against floods, stalls and room exhaustion`.
2. Node adapter: A1–A3, A8, T7–T12 (`node/*`). Commit `feat(server): cap connections and drop slow readers`.
3. Documents (main session): ROADMAP rows replaced, A1–A9 logged, spec "Rate limit" and "Liveness" amended, "How to run" gains `TRUST_PROXY`.

Each task: tests first; then a Sonnet review. Run `npm test` and `npm run typecheck` before each commit.

## Known risks to watch in review
- `noServer` upgrades must still serve the same path and payload limit; the existing server tests are the check.
- A6 must not let a genuinely silent client live longer than 6 s of non-stalled time.

## Amendments after the plan review (these override the body above)

B1 (A5, T1, constants). `RATE_LIMIT_STRIKES` = 4, `RATE_LIMIT_STRIKE_WINDOW` = 8. A strike is the first over-limit message of a limiter window, recorded at that window's start time. The connection is closed when the number of strikes with time > now − `RATE_LIMIT_STRIKE_WINDOW` reaches `RATE_LIMIT_STRIKES`. The spec's 3 s rule stays. T1 becomes:
- exactly 120 messages in a window pass, and the 121st drops;
- a continuous flood closes on the first over-limit message of the 4th consecutive over-limit window, and not before;
- floods in alternate windows (0, 2, 4, 6 s) close on the 4th flood;
- floods 3 s apart (0, 3, 6, 9 s) never close.

The two existing tests in `room/rateLimit.test.ts`, "a second within the limit forgives earlier bursts" and "a silent second forgives earlier bursts", are rewritten so that the gap between the two bursts is at least 9 s (bursts at 0–1 s and 9–10 s). They still show that the 3 s rule forgives, and they no longer trip the strikes.

B2 (A4, tests). `room/testing.ts`: `connectFakeClient(server, address = 'test')`. These existing tests in `room/server.test.ts` change:
- "create is refused once the server holds the most rooms…": each host gets a distinct address.
- "an empty room is deleted after the timeout, and not before" and "a room that someone rejoins is not deleted": a guest with a different token joins before the room empties, so the 60 s timeout still applies.

B3 (A2, A4, e2e). `ServerOptions` gains `limits?: { createPerMinute?: number; perAddress?: number; total?: number }`. This replaces T7's `caps`. `main.ts` reads optional overrides from `CREATE_PER_MINUTE` and `MAX_CONNECTIONS_PER_ADDRESS`. `playwright.config.ts` `webServer.env` sets both to `1000`, and the change also covers `e2e.local.config.ts`, which inherits the setting. Task 2 runs `npx playwright test -c e2e.local.config.ts --trace off` and every smoke case must pass.

B4 (A7, T5).
- The signature is `onError(error: unknown, source: string, suppressed: number)` for both `RoomDeps.onError` and `ServerOptions.onError`. `suppressed` counts the reports from that source dropped since its last report. If no later report from the source arrives, that count is never sent; this is accepted.
- There is one reporter. `startServer` creates it with `createReporter(options.onError, clock)` around the server's `onError`. `contain`, the static server and the room layer all use it, and the room layer gets it as `deps.onError(error, source)`.
- The room layer passes sources through and does not rate-limit again.
- `listen.ts` uses distinct sources: `socket:message`, `socket:close`, `timer`, `static` and `upgrade`. `node/failure.test.ts` keeps passing because message and close failures have different sources; if it needs any edit, list it.
- T5 is a unit test of `createReporter` with a fake clock.
- The room layer's own sources are `room:<noun>`.

B5 (A6, T2).
- The excess is gap − `STALL_GRACE`.
- It is added only to sessions whose `lastHeard` ≤ the previous timer run's time, and the result is capped at now.
- T2 gains a case: after a `stall()`, a message arrives before the next timer run, then the client is silent. It is dropped 6 s after that message, not later.

B6 (T10, routing).
- A non-upgrade request to `SOCKET_PATH` gets 426.
- An upgrade to any other path gets `HTTP/1.1 400 Bad Request`, and the socket is destroyed. With `noServer`, the upgrade handler checks the path itself.
- T10 drops "whatever ws answers" and asserts 426 and 400.
- T10 also covers the two answers `static.ts` already gives: an undecodable path gets 400, and an unbuilt client gets 503.

B7 (A8, static).
- The seam is `serveStatic(root, request, response, report, open = defaultOpen)`. `open(path)` resolves to a readable stream once its `open` event has fired, or rejects.
- `writeHead(200)` happens only after `open` resolves.
- `ENOENT` and `ENOTDIR` (from `stat` or `open`) mean not-found and get 404. Any other error is reported with source `static` and answered with 500.
- T10 injects the failure with an `open` that rejects with an `EIO` error. Do not use chmod: the tests run as root.

B8 (T11). The test opens a raw `net` socket and sends a partial request, `GET / HTTP/1.1\r\n` with no blank line, so the connection is not idle. `close()` must still resolve; only `closeAllConnections` ends that connection.

B9 (A2, A3, upgrade details).
- **Counting.** Caps are checked in the `upgrade` handler. The count goes up in the `handleUpgrade` callback and down on that socket's `close`.
- **Refusal.** Write `HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`, then destroy the socket. Before writing anything, attach `socket.on('error', () => {})` to the raw socket.
- **Payload limit.** The `noServer` `WebSocketServer` keeps the existing `maxPayload`.
- **`sendOrDrop`.** It takes `socket: { readyState: number; OPEN: number; bufferedAmount: number; send(data: string): void; terminate(): void }`.

B10 (I7). The address is not added to `Connection`. Instead `RoomServer.connect(connection, address: string)` takes it, and it is kept on the server's session. `room.ts` never sees it. This touches only the callers of `connect` (`node/listen.ts` and `room/testing.ts`). `onError` fakes need no change.

B11 (A4 details).
- `everJoinedByOthers()` becomes true on an `add` whose token differs from the creator's token.
- `SOLO_ROOM_TIMEOUT` = 30. Ten seconds would delete a room while its creator is in Messages sharing the link. The value is the owner's call and is logged as such.
- Only creates that succeed count toward the limit.
- An entry expires when now − its time ≥ 60.
- An address with no live entries is removed from the map.

B12 (A1).
- `CF-Connecting-IP` is trusted only when `TRUST_PROXY=1` and the socket's remote address is loopback (`127.0.0.1` or `::1`).
- Addresses are normalised by stripping a leading `::ffff:`.
- `main.ts` logs whether proxy trust is on at start.
- T8 adds a case: with trust on, a header from a non-loopback address is ignored. The test cannot make a non-loopback socket, so this is a unit test of an exported `clientAddress(remote, headers, trustProxy)`.
- Per-address caps on IPv6 are not grouped by /64; this is a known limit.

B13 (constants).
- `MAX_CONNECTIONS` = 360, which leaves room for players still on the home page and for takeovers.
- The block goes directly under `MAX_ROOMS` in `constants.ts`, not at the end of the file, to avoid conflicts with the steps running in parallel.

B14 (Task 3 additions).
- Spec "Rooms" (the 60 s deletion; solo rooms), "Room limit" (create limit per address) and "Failures" (one report per source per 10 s, with the suppressed count) are also amended.
- ROADMAP notes that step 19's one-command start must set `TRUST_PROXY=1`.

B15 (merge order). 19a merges to `main` before step 11 starts. Step 11 rewrites the join and takeover code in `room/server.ts` and `room.ts`.
