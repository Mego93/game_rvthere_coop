# Step 24: Hosting on Cloudflare (Worker + one Durable Object per room)

Owner request (2026-11-15): functionality first, starting with online play on Cloudflare (account just created). Spec: "Running and hosting" ("always-on hosting ... a Durable Object adapter, if chosen, replaces only the `node` adapter"; "one object per room"; "the client derives the WebSocket URL from the page origin"). Code: `packages/server/src/room/` (`createRoomServer(deps, options)`, `Connection`, `ConnectionHandle`, `Timer`, `RoomDeps`, `nouns.ts` `pickNoun`), `packages/server/src/node/` (`listen.ts` caps, message size, address; `static.ts`; `main.ts`), `packages/shared/src/rapier.ts` (`Rapier` type), `constants.ts` (`SOCKET_PATH`, `MAX_CONNECTIONS_PER_ADDRESS`, `CREATE_PER_MINUTE`), `packages/client/src/net/socket.ts` and `main.ts` (where the WebSocket URL is built), `playwright.config.ts`, `e2e/*.spec.ts`.

This plan fixes interfaces, constants, rules and test cases. Implementers write the tests first. Where the plan and the spec disagree, or neither answers a question, stop and report. The step ends at `needs sign-off`: the real deploy needs the owner's Cloudflare login (or an API token given through the credential form).

## Facts (spike, 2026-11-15, local workerd through wrangler 4.162.0, outside the repo) and what it did not prove

- `@dimforge/rapier3d-compat` fails in a Worker: `Wasm code generation disallowed by embedder` (it compiles embedded base64 WebAssembly at runtime). `@dimforge/rapier3d` 0.21.0 (same version, same API, the non-compat package) loads in a Worker when its glue file `rapier_wasm3d.js` is patched to take the wasm as a precompiled module: `import wasmModule from "./rapier_wasm3d_bg.wasm"; import * as bg from "./rapier_wasm3d_bg.js"; const instance = new WebAssembly.Instance(wasmModule, { "./rapier_wasm3d_bg.js": bg }); __wbg_set_wasm(instance.exports); instance.exports.__wbindgen_start?.()`. It has no `init()`; `RAPIER.version()` returned 0.21.0 and a world stepped.
- NOT proven: timings (a Worker's clock does not advance during CPU work, so the spike's "600 steps in 19 ms" is not a measurement), a Durable Object, `setInterval` cadence at 60 Hz, WebSockets, memory. The tick cadence is the gate of Task 1 (H8).
- Cloudflare limits and prices read from the docs (2026-11-15): Durable Objects on Workers Paid ($5 per month): 1 million requests per month included then $0.15 per million; incoming WebSocket messages are billed 20 to 1 and outgoing are free; duration $12.50 per million GB-s with 128 MB billed while active, 400,000 GB-s included; one Object has a soft limit of 1,000 requests per second; CPU 30 s per invocation. Free plan: 100,000 requests per day and 13,000 GB-s per day (about 1.5 hours of one busy 6-player room). A 6-player room at 60 Hz input costs about $0.016 per active hour.
- Why one Object per room: the client sends one input per tick, so a 6-player room sends about 360 messages per second; one Object would reach its soft limit with 3 busy rooms, and one thread's CPU would limit it too.

## Architecture

- One Worker (`packages/worker`): static assets from `packages/client/dist` with single-page-app fallback (`/<noun>` serves `index.html`), and WebSocket upgrades on `SOCKET_PATH`, routed to the Durable Object named after the room's noun (class `GameRoom`, binding `ROOM`). Each Object holds ONE `createRoomServer` with the option `fixedNoun`.
- The room layer gains two small options (R1, R2). The Node adapter is unchanged and ignores the query.
- Rapier: the Worker bundle imports the vendored, patched non-compat build (generated, git-ignored), injected into `createRoomServer` as `rapier` (typed as the `Rapier` type of `@lodgy/shared`; the same API at 0.21.0).

## Files

- `packages/server/src/room/types.ts`, `server.ts`, `nouns.ts` and their tests (R1, R2, R3); `packages/server/package.json` gains `"exports": { "./room": "./src/room/index.ts" }` with a new `src/room/index.ts` re-exporting `createRoomServer`, the room types, `nouns`, `report` and `RESERVED_PATHS`.
- `packages/client/src/net/socketUrl.ts` (new, pure) and its test; `socket.ts` and `main.ts` use it (R4).
- New workspace `packages/worker`: `package.json` (`@lodgy/worker`; dependencies `@dimforge/rapier3d` exactly `0.21.0`, `@lodgy/server`, `@lodgy/shared`; devDependencies `wrangler` exactly `4.162.0` and `@cloudflare/workers-types`), `wrangler.jsonc`, `tsconfig.json` (`lib: ["ES2022"]`, types `@cloudflare/workers-types` only, no DOM), `src/index.ts` (Worker `fetch`, the only file that imports the vendored build), `src/room.ts` (`GameRoom` logic, takes `rapier` as an injected value), `src/claim.ts`, `src/admission.ts`, `src/address.ts`, `src/workerTimer.ts` and tests for each, `src/vendor.d.ts` (`declare module '*/vendor/rapier3d/rapier.js'` typed as the `Rapier` namespace).
- Root `scripts/vendorRapier.mjs` and `scripts/vendorRapier.test.mjs` (the root vitest include matches `scripts/**/*.test.mjs`). Root `package.json` scripts: `build:worker`, `dev:worker`, `check:worker`, `deploy:cf`; `typecheck` gains `tsc -p packages/worker`.
- `playwright.cf.config.ts`, `docs/hosting-cloudflare.md`, `.gitignore` (`packages/worker/vendor/`, `.wrangler/`), `ROADMAP.md`, the spec's "Running and hosting" paragraph, decision D-HOST1.

## `packages/worker/wrangler.jsonc` (the whole file; the implementer adjusts only paths)

```jsonc
{
  "name": "lodgy-coop",
  "main": "src/index.ts",
  "compatibility_date": "2025-11-01",
  "assets": {
    "directory": "../client/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/ws"]
  },
  "durable_objects": { "bindings": [{ "name": "ROOM", "class_name": "GameRoom" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["GameRoom"] }],
  "observability": { "enabled": true }
}
```
`/ws` must equal `SOCKET_PATH` (a test asserts it).

## Rules

R1. Room layer, `RoomServerOptions.fixedNoun?: string`: when set, the server hosts at most that one room: `create` uses `fixedNoun` as the room's noun (instead of `pickNoun`) and answers `server_full` if it already exists; `join` of any other noun answers `unknown_room`; `roomCount()` is 0 or 1. Not set: behaviour unchanged (every existing test passes untouched).
R2. `RoomServerOptions.maxRooms?: number` (default the current cap, 50): the room cap, a number the Node adapter keeps passing as today; the Worker passes 1 through `fixedNoun`. (If `maxRooms` is already an existing option or constant, reuse it and say so.)
R3. `nouns.ts` gains `nounCandidates(random): Generator<string>`: the same order as `pickNoun` (start at a random word, wrap through all words, then the numbered variants) so `pickNoun` can be written on top of it; tests: determinism per seed, never repeats within one generator, never yields a reserved path.
R4. `socketUrl(location, intent)` (pure): `https:` becomes `wss:`, `http:` becomes `ws:`, the path is `SOCKET_PATH`, the query is `?create=1` for creating a room, `?noun=<noun>` for joining one (the noun from the home form, the page path, or the room being reconnected to); the noun is validated against `/^[a-z]+\d*$/` before use, else the intent falls back to no query. The Node server ignores the query. Tests: each combination, a bad noun, `localhost` with a port.
R5. `src/index.ts`: a request to `SOCKET_PATH` without `Upgrade: websocket` gets 426; with it: if `?noun=` is a valid noun, route to `env.ROOM.get(env.ROOM.idFromName(noun))`; if `?create=1`, allocate a noun (R6) and route there; otherwise 400. Every other request goes to `env.ASSETS.fetch(request)`. The request keeps its headers (`CF-Connecting-IP` survives `stub.fetch`).
R6. Allocation (`claim.ts`, `allocate(candidates, tryClaim, attempts = 20)`): for each candidate noun in `nounCandidates` order, `tryClaim(noun)` sends a request to that Object (`/claim`); the Object answers `free` or `taken` and, if free, marks itself claimed for 15 s (a timestamp) so two simultaneous creators cannot get the same noun; the Worker then forwards the WebSocket upgrade to the same Object with the noun. The claim is released when the first socket connects. After `attempts` failures the Worker answers 503. Tests: the Object's claim logic (free, taken while claimed, free again after 15 s, taken while it has a live room), and `allocate` with a fake that is taken for the first N candidates.
R7. `GameRoom` (a Durable Object class whose logic lives in `src/room.ts`, constructed with an injected `rapier`, `clock`, `random`, a timer and an `onError`): on an upgrade it applies admission (R8), creates a `WebSocketPair`, accepts the server side with `server.accept()` (NOT the hibernation API: the room ticks in memory), builds a `Connection` (`send` = `socket.send`, `close` = `socket.close`), calls `roomServer.connect(connection, address)`, forwards text `message` events to the handle (a binary message closes with 1003), forwards `close` and `error` events (decrementing the count exactly once), and returns `101` with the client side. The server side is wrapped with the Node adapter's `contain` idea: an exception in a handler or timer callback goes to `onError` and closes that connection, never the Object.
R8. Admission (`admission.ts`, pure): with the live counts, the address and the limits (total per Object default 12 players plus spectators headroom: `MAX_CONNECTIONS_PER_ROOM = 12`, per address `MAX_CONNECTIONS_PER_ADDRESS`), returns `ok`, `full` (503) or `busy` (429). The address is `CF-Connecting-IP`, else `127.0.0.1`, an invalid value also `127.0.0.1` (valid means it parses as IPv4 or IPv6 by a small pure check). Message size: over `MAX_MESSAGE_BYTES` (4096; move the constant from `listen.ts` into `@lodgy/shared` so both adapters use it) measured as UTF-8 bytes (`TextEncoder`), closes with 1009. Known limits (documented in the doc, not fixed): the per-address cap is per room, not global; every IPv6 address counts as separate; global abuse protection and the creation rate limit are Cloudflare's WAF rate-limiting rule on `/ws` and the Durable Objects spending limit, set in the dashboard by the owner (the doc gives the steps).
R9. Timer and idleness (`workerTimer.ts`): `every(seconds, fn)` wraps `setInterval` (callbacks run through `contain`) and returns a stop function; the adapter object also has `pause()` (clears every interval, remembers periods) and `resume()` (restarts them). After every timer callback and on every close, `GameRoom` checks `connectionCount === 0 && roomServer.roomCount() === 0` and calls `pause()`; `resume()` is called before `roomServer.connect` on a new socket. An Object with no connections and no room therefore has no timers and is evicted. A reset Object closes all its sockets: players see the page's reconnect flow, then "the room no longer exists" (a clear message, already the case for `unknown_room`); every `wrangler deploy` also ends every room. The doc says both.
R10. Clock and random: `clock = () => performance.now() / 1000`, `random = Math.random` (used for nouns only). The doc notes that a Worker's clock advances at I/O, so the tick count comes from timers.
R11. Environment values: `vars` carry no secrets. The e2e limits (`CREATE_PER_MINUTE`, `MAX_CONNECTIONS_PER_ADDRESS`) arrive as `--var` flags in `dev:worker` and are validated like `main.ts` does. A GET on `/ws` without an upgrade returns 426 on both servers (the Node one already does).
R12. Static serving differs from the Node server (documented, accepted): Cloudflare sets its own cache headers and content types; single-page-app fallback replaces `static.ts`'s reserved-path handling (the Worker routes `/ws` first). Origin is not checked on the WebSocket (no cookies or auth exist; same as Node; decision recorded).
R13. `scripts/vendorRapier.mjs` copies `node_modules/@dimforge/rapier3d` to `packages/worker/vendor/rapier3d` and patches `rapier_wasm3d.js` exactly as in the Facts; it is idempotent, throws if the glue file does not have the expected text (a Rapier upgrade cannot silently break it) and prints the version. `build:worker` runs the vendor script then `npm run build` for the client. Only `src/index.ts` imports the vendored build; `src/room.ts` and all tests inject `@dimforge/rapier3d-compat` (the existing tests' choice), so Vitest never loads a `.wasm`.
R14. `@dimforge/rapier3d-compat` is imported at runtime only by `node/listen.ts` and the client, never by `shared`, `room` or the worker (they import it as a type only); `check:worker` runs `wrangler deploy --dry-run --outdir <tmp>` and fails if the output contains the string `rapier3d-compat`. It is not part of `npm test` (it needs the wrangler binary); it is part of the step's checks.
R15. `docs/hosting-cloudflare.md` states, in order: what the owner needs (a Cloudflare account, Workers Paid recommended, Node 22), `npx wrangler login` on their computer, `npm run deploy:cf`, the resulting `https://lodgy-coop.<subdomain>.workers.dev` address and how to share a room link, `npx wrangler tail` for logs, costs and limits (the numbers above, including the Free plan's daily quota), `npx wrangler rollback`, the WAF rate-limit rule and the spending-limit steps (R8), what players see when the Object is reset or a deploy happens (R9), and that rooms live in memory.

## Tests (numbered)

T1 room layer: `fixedNoun` (R1: create takes the noun, a second create is `server_full`, join of another noun is `unknown_room`, `roomCount` 0 or 1) and `maxRooms` (R2); every existing room test passes untouched.
T2 `nounCandidates` (R3) and `pickNoun` unchanged in behaviour.
T3 `socketUrl` (R4) and its use in `socket.ts`/`main.ts` (the existing net tests pass).
T4 admission and address (R8): caps, decrement once, invalid IP, UTF-8 size (a multi-byte message under 4096 characters but over 4096 bytes is refused).
T5 claim (R6): the Object's claim logic and `allocate`.
T6 `workerTimer` (R9): schedule with fake timers, stop, `pause()` clears everything and `resume()` restores the periods.
T7 `GameRoom` logic with fake sockets (R7, R9): upgrade accepted and handed to the room server; binary closed 1003; oversized closed 1009; a throwing handler closes only that connection; counts decrement once; the timers pause when idle and resume on the next connect.
T8 vendor script (R13): twice gives the same result; patches once; throws on a fixture with an unexpected glue file.
T9 worker config: `wrangler.jsonc` parses (strip comments), `assets.run_worker_first` equals `[SOCKET_PATH]`, the binding names match the code.
T10 bundle check (R14), run by `check:worker`.
T11 e2e against `wrangler dev` (`playwright.cf.config.ts`): the two-player smoke case, the reconnect spec, and the cadence gate (H8): read the debug overlay's `tick` twice, 5 s apart, and require at least 270 ticks. `webServer.command` is `npm run build:worker && npm run dev:worker`, `url: http://localhost:8787/`, `timeout: 180000`, `reuseExistingServer: false`, env `WRANGLER_SEND_METRICS=false`; `dev:worker` is `wrangler dev --local --port 8787 --var CREATE_PER_MINUTE:1000 --var MAX_CONNECTIONS_PER_ADDRESS:1000` run from `packages/worker`. Tests excluded with the tag `@node-only` (added to their titles) because Cloudflare's assets answer differently: `touch.spec` "the manifest and the icons are served with their types" (exact `application/manifest+json; charset=utf-8`) and `smoke` E7 (the content type of the `.md` sound licence); the implementer lists any further test that fails for a reason that is a Cloudflare difference, not a bug, and changes nothing else.
T12 existing: `npm test`, `npm run typecheck` (now including the worker), `npm run build` and the Node e2e pass unchanged.

## Tasks

1. Gate task, the cadence: `packages/worker` workspace, vendor script (T8), `wrangler.jsonc` (T9), the `GameRoom` skeleton with a real room server ticking one room, `index.ts` routing, and the cadence gate H8 (T11 cadence only) running on `wrangler dev`. If the cadence is under 270 ticks in 5 s, STOP and report the numbers (the plan changes then: per-room DOs with a 30 Hz tick or Containers).
2. The room layer options and nouns (R1 to R3, T1, T2) and the client URL builder (R4, T3).
3. The worker logic: admission, address, claim, workerTimer, `GameRoom`, `index.ts` complete (R5 to R11, T4 to T7).
4. `playwright.cf.config.ts` and the e2e on the worker (T11), exclusions tagged, `check:worker` (T10).
5. `docs/hosting-cloudflare.md`, root scripts, `.gitignore`, `ROADMAP.md`, spec paragraph, decision D-HOST1, every check.

Review after each task by a Sonnet reviewer; Opus reviews the whole branch at the end.
