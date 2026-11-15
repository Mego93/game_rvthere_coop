# Step 24: Hosting on Cloudflare (Worker + Durable Object)

Owner request (2026-11-15): functionality first, starting with online play on Cloudflare (account just created). Spec: "Running and hosting" ("always-on hosting ... a Durable Object adapter, if chosen, replaces only the `node` adapter"; "the client derives the WebSocket URL from the page origin"). Code: `packages/server/src/room/` (`createRoomServer(deps, options)`, `Connection`, `ConnectionHandle`, `Timer`, `RoomDeps`), `packages/server/src/node/` (`listen.ts` caps, message size, address, `static.ts`, `main.ts`), `packages/shared/src/rapier.ts` (`Rapier` type), `packages/shared/src/constants.ts` (`SOCKET_PATH`, `MAX_CONNECTIONS`, `MAX_CONNECTIONS_PER_ADDRESS`, `CREATE_PER_MINUTE`).

This plan fixes interfaces, constants, rules and test cases. Implementers write the tests first. Where the plan and the spec disagree, or neither answers a question, stop and report. The step ends at `needs sign-off`: the real deploy needs the owner's Cloudflare login (or an API token given through the credential form).

## Facts established by a spike (2026-11-15, local workerd via wrangler 4, outside the repo)

- `@dimforge/rapier3d-compat` fails in a Worker: `Wasm code generation disallowed by embedder` (it compiles embedded base64 WebAssembly at runtime).
- `@dimforge/rapier3d` 0.21.0 (the non-compat package, same version and API) works when its glue file `rapier_wasm3d.js` is patched to take the wasm as a precompiled module: `import wasmModule from "./rapier_wasm3d_bg.wasm"; const instance = new WebAssembly.Instance(wasmModule, { "./rapier_wasm3d_bg.js": bg }); __wbg_set_wasm(instance.exports); instance.exports.__wbindgen_start?.()`. It has no `init()`. A test world stepped 600 times in 19 ms.
- Durable Object limits and prices (read from the Cloudflare docs on 2026-11-15): requests 1 million per month included on Workers Paid ($5 per month) then $0.15 per million, with incoming WebSocket messages billed 20:1 and outgoing free; duration $12.50 per million GB-s with 128 MB billed while active; 400,000 GB-s per month included; one Object soft limit 1,000 requests per second; CPU 30 s per invocation. A 6-player room at 60 Hz input costs about $0.016 per active hour.

## Architecture

- One Worker (`packages/worker`): static assets from `packages/client/dist` with single-page-app fallback (so `/<noun>` serves `index.html`), and WebSocket upgrades on `SOCKET_PATH` routed to ONE Durable Object named `hub` (class `GameHub`) that holds one `createRoomServer`, so all rooms live in the hub. (Per-room objects would need splitting the room server and are out of scope; one Object handles about 30 busy rooms by the 0.4 ms per tick measurement; documented.)
- The room layer is unchanged. The adapter implements `Connection`, `Timer`, the clock and the random function for the Workers runtime.
- Rapier: the Worker imports the vendored, patched non-compat build (a generated, git-ignored folder, produced by a script), passed to `createRoomServer` as `rapier` (cast to the `Rapier` type: same API at 0.21.0).

## Files

- New workspace `packages/worker`: `package.json` (`@lodgy/worker`, devDependency `wrangler` pinned to the version used in the spike's lockfile entry, dependency `@dimforge/rapier3d` 0.21.0 exact), `wrangler.jsonc`, `src/index.ts` (Worker `fetch`), `src/hub.ts` (`GameHub`), `src/admission.ts` (+ test), `src/address.ts` (+ test), `src/workerTimer.ts` (+ test), `scripts/vendor-rapier.mjs`, `tsconfig.json`, `README` is NOT created (docs go in `docs/hosting-cloudflare.md`).
- `package.json` (root): scripts `build:worker` (vendor Rapier; build client), `dev:worker` (`wrangler dev --local` on port 8787 with the e2e limits), `deploy:cf` (build, then `wrangler deploy`).
- `playwright.cf.config.ts` (new): runs the Chromium desktop project against `http://localhost:8787` with `webServer: npm run dev:worker`, `reuseExistingServer: false`, `testMatch` the existing specs `smoke`, `touch`, `reconnect` (tests that need Node-only knobs are tagged `@node-only` and excluded with `grepInvert`; the implementer lists them).
- `docs/hosting-cloudflare.md` (new): owner-facing setup and deploy steps, costs, limits.
- `.gitignore`: `packages/worker/vendor/`, `.wrangler/`.
- `tsconfig` root and `npm run typecheck` include the worker package with `@cloudflare/workers-types` (devDependency).
- `ROADMAP.md`, the spec's "Running and hosting" paragraph, decision D-HOST1.

## Rules

H1. `scripts/vendor-rapier.mjs` copies `node_modules/@dimforge/rapier3d` to `packages/worker/vendor/rapier3d` and patches `rapier_wasm3d.js` exactly as in the spike; it is idempotent, fails loudly if the glue file's text is not the expected shape (so a Rapier upgrade cannot silently break it), and prints the version. `wrangler.jsonc` aliases nothing else; the Worker imports `../vendor/rapier3d/rapier.js` as a namespace.
H2. No runtime import of `@dimforge/rapier3d-compat` may reach the Worker bundle: if `packages/shared` or `packages/server/src/room` imports it at runtime in non-test code, the build aliases it to the vendored build (`wrangler.jsonc` `alias`) and a test (a bundle check: `wrangler deploy --dry-run --outdir` and a search of the output for `base64` wasm markers or the string `rapier3d-compat`) asserts it is absent. If it is only a type import, say so.
H3. `src/index.ts`: for a request whose path is `SOCKET_PATH` and which has `Upgrade: websocket`, it forwards the request (with the client's address header kept) to the `hub` object (`env.HUB.get(env.HUB.idFromName('hub'))`); any other request is served from the assets binding (the config uses `assets.not_found_handling = "single-page-application"` and `run_worker_first = [SOCKET_PATH]`).
H4. `GameHub`: on an upgrade it applies admission (H5), creates a `WebSocketPair`, accepts the server side (`server.accept()`, NOT the hibernation API, because the room ticks in memory), builds a `Connection` over it (`send` = `socket.send`, `close` = `socket.close`), calls `roomServer.connect(connection, address)`, forwards `message` events (text only; a binary message closes with code 1003) and `close` / `error` events to the handle, and returns `101` with the client side.
H5. Admission (`admission.ts`, pure): given the current connection counts, the client's address and the limits (`total` default `MAX_CONNECTIONS`, `perAddress` default `MAX_CONNECTIONS_PER_ADDRESS`), returns `'ok'` or `'full'` (HTTP 503) or `'busy'` (429 per address); the counts are kept in the hub and decremented exactly once per connection on close or error. The address is the `CF-Connecting-IP` header (always present on Cloudflare); locally it falls back to `127.0.0.1`. Message size over `MAX_MESSAGE_BYTES` (4096, shared with the Node adapter: move the constant into `@lodgy/shared` if it is local to `listen.ts`, a change both adapters use) closes with code 1009.
H6. `Timer` for Workers (`workerTimer.ts`): `every(seconds, fn)` wraps `setInterval` and returns a stop function. The hub keeps the intervals only while needed: when the connection count is 0 and `roomServer.roomCount()` is 0 it must stop every interval and start them again on the next connect, so an idle Object is evicted and costs nothing. Implementation: the timer registry counts active intervals; the hub calls `timer.pause()` / `timer.resume()` (extra methods on the adapter's own timer object, not on the room layer's `Timer` interface).
H7. Clock and random: `clock = () => performance.now() / 1000` (monotonic), `random = Math.random` (the room layer uses it for nouns only, never the simulation). Note in the doc that Workers clocks only advance at I/O; the tick count comes from timers, so a tick is counted by timer callbacks as on Node.
H8. Tick cadence: a test with the local worker (the cf Playwright config) reads the debug overlay's `tick` twice 5 s apart and asserts at least 270 ticks passed (a 60 Hz sim with tolerance), so a throttled Durable Object timer is caught.
H9. Environment values: `wrangler.jsonc` `vars` carry no secrets; the e2e limits (`CREATE_PER_MINUTE`, `MAX_CONNECTIONS_PER_ADDRESS`) are passed to `dev:worker` as `--var` so the specs can create many rooms, and are read in `hub.ts` with the same validation as `main.ts` (`positiveInteger`).
H10. Failure reporting: errors from the room server go to `console.error` with the `source` string (the Workers log), rate-limited the way `report.ts` already does if its helper can be reused without Node imports (the `report` module imports nothing from Node per the existing `roomImports.test.ts`).
H11. The page needs no change: it derives the WebSocket URL from `location` (`wss` on https). `index.html` and the assets under `public/` are served as is.
H12. Deploy doc: `docs/hosting-cloudflare.md` states, in order: what the owner needs (a Cloudflare account, the Workers Paid plan recommended, Node 22), `npx wrangler login` on their computer, `npm run deploy:cf`, the resulting `https://<name>.<subdomain>.workers.dev` address and how to share a room link, how to read logs (`npx wrangler tail`), costs and limits (the numbers above), how to roll back (`npx wrangler rollback`), and that rooms live in memory and end when the Object is evicted or redeployed.

## Tests (numbered)

T1 admission: ok under both caps; `full` at the total cap; `busy` at the per-address cap; decrement frees a slot; a close followed by an error decrements once.
T2 address: `CF-Connecting-IP` is used when present; otherwise `127.0.0.1`; an invalid value (not an IP) falls back to `127.0.0.1`.
T3 workerTimer: `every` ticks about on schedule with fake timers; stop works; `pause()` clears all intervals and `resume()` restarts them with their original periods; no interval is left after pause.
T4 vendor script: running it twice gives the same result; it patches the glue exactly once; it throws on an unexpected glue file (given a fixture).
T5 bundle check (H2): the dry-run output contains no `rapier3d-compat` and no inline base64 wasm.
T6 hub, with fake sockets (the hub's logic split from the Workers globals so it runs in Vitest): upgrade accepted and handed to the room server; binary frames closed with 1003; oversized text closed with 1009; counts decrement on close; interval timers pause when idle (T3 + H6).
T7 e2e on the worker (`playwright.cf.config.ts`): the smoke spec's two-player case passes against `wrangler dev`; the reconnect spec passes; the cadence test of H8.
T8 existing tests: `npm test`, `npm run typecheck`, `npm run build` and the Node e2e pass unchanged.

## Tasks

1. Workspace, vendor script, `wrangler.jsonc`, `index.ts` with a stub hub, assets serving: `wrangler dev` serves the game page and rejects WebSocket until the hub exists (T4, T5).
2. The hub, admission, address, timer, constants moved to `@lodgy/shared` if needed (T1, T2, T3, T6, H4 to H10).
3. `playwright.cf.config.ts` and the e2e against the local worker, with a fixed list of `@node-only` exclusions (T7, T8).
4. `docs/hosting-cloudflare.md`, root scripts, `.gitignore`, `ROADMAP.md`, spec paragraph, decision D-HOST1, every check.

Review after each task by a Sonnet reviewer; Opus reviews the whole branch at the end.
