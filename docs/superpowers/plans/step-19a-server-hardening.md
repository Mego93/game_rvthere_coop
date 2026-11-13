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
