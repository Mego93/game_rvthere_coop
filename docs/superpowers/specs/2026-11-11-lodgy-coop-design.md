# Lodgy Co-op — Design

Date: 2026-11-11
Status: approved in brainstorming, pending written review

## Summary

A 3D browser game for 2–6 players, inspired by *RV There Yet?*. One crew shares one physics-driven car, a low-poly Dacia Lodgy lookalike, and must get it from Marrakech's medina to a kasbah in the Atlas foothills. One player drives; the others ride, then get out to push, winch, clear obstacles, repair and refuel. A run lasts 5–10 minutes and is scored by finish time.

Players join by room code. A small Node server runs the physics authoritatively. Desktop browsers and iPhones (Safari) can play in the same room.

## Scope

In scope for this version:

- Co-op mode, one car, one handmade course
- 2–6 players per room, online via room code
- Desktop (keyboard and mouse) and iPhone (touch) controls
- Low-poly flat-shaded visuals built in code

Out of scope:

- Team versus (planned as a later spec; the design must not block a second car per room)
- Accounts, persistence, leaderboards
- Multiple courses, procedural generation
- Voice or text chat
- Audio beyond a few basic effects
- Android-specific tuning and gamepad support
- A scripted bot that proves the course is completable

## 1. Game rules

### Goal

Get the car from the start to the finish volume. The score is elapsed time.

The run is lost if:

- car health reaches 0, or
- the car falls below the course's kill plane.

An empty fuel tank does not end the run. It disables drive until someone refuels.

### Roles

Every player is a character on foot. Roles are not assigned.

- The car has 1 driver seat and 6 passenger seats.
- Interact at a door boards the nearest free seat on that side; interact at the driver door takes the driver seat if free.
- Interact while seated exits next to that door.
- With no driver, the car coasts with the brake released.

### The car

- Handles like an overloaded family MPV: soft suspension, pronounced body roll, low grip, weak on steep climbs.
- Fuel drains in proportion to throttle. At 0 fuel, throttle has no effect.
- Health drops on impacts above a speed threshold and continuously while the car is upside down.
- A flipped car is righted by pushing or winching.
- The model is a recognisable shape without the Dacia name or badge.

### Crew actions

| Action | Behaviour |
|---|---|
| Push | A player walking into the car applies a force along their movement direction. Forces add per player, capped at 4 pushers' worth. |
| Winch | Take the hook from the car's front bumper, carry it to an anchor, interact to attach. Reel in or out from the driver seat or from the winch box on the front bumper. One cable, maximum length 25 m. Interact at the anchor detaches. |
| Repair | Carry a toolbox to the car and hold interact for 3 s to restore 50% health. The toolbox is consumed. |
| Refuel | Carry a jerrycan to the car and hold interact for 3 s to restore 50% fuel. The jerrycan is consumed. |
| Clear | Pick up and throw light debris. Heavy obstacles cannot be carried; they move only when enough players push together or when winched. |

A player carries one item at a time: hook, jerrycan, toolbox or light debris. Boarding the car while carrying drops the item, except the hook, which returns to the bumper.

If the hook is carried beyond cable length, it is pulled from the player's hands and drops.

### Scaling with crew size

- Pickups (jerrycans, toolboxes) are fixed regardless of crew size.
- Heavy obstacles need 2 pushers with a crew of 2–3, and 3 pushers with a crew of 4–6. Crew size is fixed at run start.

### Respawn

- A player below the kill plane respawns next to the car after 3 s.
- A prop below the kill plane returns to its spawn point.
- The car does not respawn.

### Course: Marrakech to the Atlas

Five beats in sequence, each with a checkpoint volume used only for the HUD progress indicator.

1. **Medina exit.** Narrow alley off the square, cluttered with crates, carts and parked scooters. Teaches driving and clearing.
2. **Palmeraie track.** Soft sand between palm trees, where the car bogs down. First winch use; palms are anchors.
3. **Oued crossing.** Shallow rocky riverbed, slow and fuel-hungry. A jerrycan stall stands on the far bank.
4. **Atlas switchbacks.** Narrow mountain road with a drop on one side. A rockfall (heavy obstacles) blocks one hairpin. A toolbox sits at a roadside mechanic's shack.
5. **Final climb.** Steep gravel requiring winch and push together. The finish is the kasbah gate.

Anchors are palm trunks, boulders and stone milestones, each visibly marked. Palette: ochre walls, red earth, green palms.

Surface types affect tyre grip and rolling resistance: road, sand, riverbed, gravel.

## 2. Architecture

### Repository

npm workspaces, TypeScript throughout.

| Package | Responsibility | Depends on |
|---|---|---|
| `shared` | Simulation, course data, message types, constants | `@dimforge/rapier3d-compat` |
| `server` | Rooms, WebSocket transport, runs the sim, broadcasts snapshots, serves the built client | `shared`, `ws` |
| `client` | Rendering, input, HUD, lobby, interpolation, prediction | `shared`, `three`, Vite |

### `shared`

The simulation is a pure module with no network or rendering code.

```ts
const world = createWorld(course, { crewSize });
world.addPlayer(id); world.removePlayer(id);
world.step(inputsByPlayer);   // advances one fixed tick
world.snapshot();             // serialisable state
world.status();               // 'running' | 'won' | 'lost', plus elapsed time
```

One file per concern:

- `vehicle` — Rapier raycast vehicle, surface grip, fuel, health, seats
- `player` — capsule character controller, carry state, respawn
- `winch` — hook, anchor attach, cable as a length-limited rope joint, reel
- `interact` — resolves what interact does for a player this tick
- `props` — light debris, heavy obstacles, pickups
- `course` — static data: terrain heightmap, surface map, colliders, anchors, spawn points, checkpoint and finish volumes, kill plane
- `rules` — win and lose conditions, timer
- `protocol` — message types and validators

Interact priority, highest first, when several targets are in range:

1. Exit seat (if seated)
2. Attach hook to anchor (if carrying the hook)
3. Repair or refuel (if carrying a toolbox or jerrycan, at the car)
4. Release carried item (if carrying): light debris is thrown forward along the player's facing; a jerrycan, toolbox or hook is dropped at the player's feet
5. Take hook, pick up item
6. Detach hook at anchor
7. Board car

### `server`

- A room has a 4-letter code, up to 6 players and a phase: `lobby → playing → finished`. The player who creates the room is host and starts the run. If the host leaves, the longest-connected player becomes host.
- Each room owns one world, stepped at a fixed 60 Hz. A snapshot is broadcast at 20 Hz.
- A room is deleted when it has no connected players.
- No database. Identity is a display name plus the room code.
- One process serves the built client and the WebSocket on the same port (default 3000).

### Protocol

JSON over WebSocket.

Client to server:

- `create { name }`
- `join { code, name }`
- `start {}`
- `input { seq, moveX, moveY, yaw, jump, interact, throttle, steer, brake, reel }`

Server to client:

- `lobby { code, players, hostId, phase }`
- `snapshot { tick, ackSeq, car, players, props, cable, fuel, health, elapsed, checkpoint }`
- `end { result, elapsed }`
- `error { reason }` with reasons `unknown_room`, `room_full`, `run_finished`, `bad_message`

Binary encoding is deferred until snapshot size is measured as a problem.

### `client`

- `net` — socket, reconnect, snapshot buffer, interpolation 100 ms in the past for the car, other players, props and cable
- `prediction` — the local on-foot character runs the `shared` player code each frame and reconciles against `ackSeq`. A seated player is attached to the interpolated car.
- `input` — a device-agnostic layer producing the `input` message fields. Two sources: keyboard and mouse, and touch. The source is chosen by pointer capability at load.
- `render` — Three.js scene built from the same course data the server uses; low-poly meshes built in code
- `ui` — plain HTML and CSS overlay for lobby, HUD (fuel, health, timer, checkpoint, interact prompt), reconnect overlay and end screen. No UI framework.

### Controls

| Action | Desktop | iPhone |
|---|---|---|
| Move / steer | WASD | Left virtual joystick |
| Look | Mouse (pointer lock) | Drag on right half of screen |
| Interact | E | Button |
| Jump / brake | Space | Button (label changes when seated) |
| Throttle, reverse | W, S when driving | Joystick up, down when driving |
| Reel in, out | Q, R | Two buttons, shown only when reeling is possible |

The camera is third-person follow in both cases.

### iPhone specifics

- Landscape only; portrait shows a "rotate your phone" prompt.
- HUD and buttons respect safe-area insets.
- A web app manifest and Apple meta tags allow "Add to Home Screen" for a fullscreen view, since iPhone Safari offers no fullscreen API to pages.
- Device pixel ratio is capped at 2 and shadows are disabled on touch devices.
- Double-tap zoom, text selection and pull-to-refresh are suppressed on the game canvas.

### Running and hosting

The same build runs three ways with no design difference:

- Local machine, same Wi-Fi: players open `http://<LAN-IP>:3000`
- Local machine plus a tunnel (Cloudflare Tunnel, ngrok), which also provides `https`
- A single small container on a host such as Fly.io or Railway

The client derives the WebSocket URL from the page origin (`ws` for `http`, `wss` for `https`).

## 3. Error handling

- **Bad input.** The server validates every message's shape and clamps numeric ranges. Malformed messages get `bad_message` and are dropped. A socket sending more than 120 messages per second is closed.
- **Join failures.** Unknown code, full room and finished run each return a specific error that the lobby displays.
- **Disconnects.** The client shows a reconnecting overlay and retries with backoff for 30 s, rejoining the same room under the same name. The server removes a dropped player's character immediately; a carried item drops, and a vacated driver seat frees. A rejoining player spawns next to the car.
- **Mid-run joins.** A new player may join a room in `playing` phase if it has fewer than 6 players. Obstacle thresholds keep the crew size fixed at run start.
- **Tick overrun.** The server runs at most 3 catch-up steps per loop iteration and discards the remaining backlog.
- **Physics escapes.** Handled by the kill-plane rules above.
- **Server restart.** Rooms are in memory; a restart ends all runs.
- **iOS backgrounding.** Safari suspends the socket when the page is hidden. On return, the client follows the normal reconnect path.

## 4. Testing

Runner: Vitest in all packages.

`shared` (headless, against the real Rapier world):

- vehicle: throttle moves the car; fuel drains with throttle; empty tank disables drive; impact above the threshold reduces health; upside-down drains health; grip differs by surface
- seats: one driver; boarding takes the nearest free seat; exit places the player beside the door
- winch: attaches only within range of an anchor; cable length never exceeds 25 m; reeling in pulls the car toward the anchor; over-length hook drops
- interact: priority order holds when several targets are in range; one carried item at a time
- push: force adds per player and respects the cap; heavy obstacles move only at the crew-size threshold
- repair and refuel: restore 50%, consume the item, require the full hold
- rules: finish volume wins; zero health loses; car below kill plane loses; players and props respawn
- determinism: the same input sequence produces the same snapshot

`server`:

- room lifecycle: create, join, full, rejoin, host handover, empty cleanup
- message validation and rate limit, using a fake socket

`client`:

- snapshot interpolation
- prediction reconciliation
- input layer: keyboard and touch sources produce the same `input` fields

End to end: one Playwright smoke test opens two pages, creates and joins a room, starts a run and asserts both receive snapshots. A second run of it uses an iPhone viewport with touch emulation to check the touch UI appears.

Rendering, game feel and course tuning are checked by hand, including on a real iPhone.

## 5. Build order

Each step ends in something runnable. Progress is tracked in `ROADMAP.md`. Each step gets its own plan, written when the step starts, and its own branch. Steps 7, 8 and 9 need a manual sign-off from the owner because game feel and real-device behaviour cannot be tested automatically.

1. Workspace scaffold, Rapier world, flat ground, drivable car in one browser tab with the sim running locally. The device-agnostic input layer starts here with the keyboard source.
2. Server, rooms, snapshots and interpolation: two tabs see the same car.
3. On-foot players with prediction, boarding and seats.
4. Push, carry, props and clearing.
5. Winch.
6. Fuel, health, repair, refuel, win and lose rules, HUD.
7. Touch input source, touch UI, landscape and safe-area layout, web app manifest. Verified on an iPhone over LAN.
8. The Marrakech course: terrain, surfaces, five beats, meshes and palette.
9. Lobby polish, reconnect, single-container deployment.
