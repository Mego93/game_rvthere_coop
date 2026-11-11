# Lodgy Co-op — Design (spec 1: engine and course 1)

Date: 2026-11-11
Status: revised after brainstorming, pending written review

## Summary

A 3D browser game for 2–6 players, inspired by *RV There Yet?*. One crew shares one physics-driven vehicle and must get it through a campaign of Marrakech-themed courses. One player drives; the others ride, then get out to push, winch, clear obstacles, repair and refuel. Courses run from about 10 minutes (course 1) to an hour or more (later courses). Difficulty comes from each course's obstacles.

Players join a room by URL. A small Node server runs the physics authoritatively. Desktop browsers and iPhones (Safari) play in the same room.

## Scope

The project is split into several specs. Each ends in a playable game.

| Spec | Content |
|---|---|
| **1 (this document)** | The whole engine, lobby, two vehicles, the segment system, and course 1 (about 10 minutes) |
| 2 | More segment types; courses 2 and 3 (about 20–30 minutes each) |
| 3 | Long courses (1 hour or more) |
| 4 | Team versus |

In scope for spec 1:

- Co-op campaign structure, with one course shipped
- Up to 6 players per room, joined by URL. The game is designed for 2–6; a solo run is allowed.
- Lobby with ready states and admin controls
- Two vehicles, Lodgy and RV, chosen freely
- Checkpoint restart when the vehicle is lost
- Desktop (keyboard and mouse) and iPhone (touch) controls
- Low-poly flat-shaded visuals built in code
- Basic sound effects

Out of scope for spec 1:

- Accounts, persistence, leaderboards, saved campaign progress
- Procedural course generation
- Voice or text chat, music
- Android-specific tuning, gamepad support
- A scripted bot that proves a course is completable

The design must not block a second vehicle per room (spec 4).

## 1. Game rules

### Campaign and goal

- A campaign is an ordered list of courses. Each course has different obstacles and is longer and harder than the one before.
- The goal of a course is to get the vehicle from the start into the finish volume. The score is elapsed time, including penalties.
- Winning shows the results screen (time, vehicle, restarts). The admin then moves the room to the next course, which returns everyone to the lobby with that course selected.
- After the last course, the results screen shows the campaign total.
- Nothing is saved. The admin may select any course in the lobby.

### Losing the vehicle: checkpoint restart

A run never hard-fails. The vehicle is lost when its health reaches 0 or it falls below the kill plane. The admin can also trigger the same restart by hand, for a vehicle stuck beyond rescue. In each case:

- The vehicle returns to the last checkpoint's spawn pose. All players are placed beside it, unseated and empty-handed.
- Fuel and health are restored to their values when that checkpoint was recorded, with a floor of 50% each.
- Every prop, obstacle and pickup returns to the state recorded at that checkpoint: its position and whether it was consumed. The winch detaches and the hook returns to the bumper.
- 60 seconds are added to the elapsed time.

A checkpoint sits at the start of every segment. It is recorded the first time the vehicle's centre enters that segment. The course start is the first checkpoint, recorded at run start.

An empty fuel tank is not a loss. It disables drive until someone refuels.

### Players

Every player is a 3D character who moves freely on foot: walk, jump, climb on anything the physics allows, including the roof of the moving vehicle. Riding on the roof has no special handling; physics decides.

Roles are not assigned.

- A vehicle has 1 driver seat and at least 5 passenger seats.
- Interact at a door boards the nearest free seat on that side; interact at the driver door takes the driver seat if free.
- Interact while seated exits beside that door.
- With no driver, the vehicle coasts with the brake released.
- A passenger can look around and exit, nothing else.
- A player below the kill plane respawns next to the vehicle after 3 s. Anything they carried returns to its spawn point (the hook to the bumper).
- Players have no health and cannot be hurt. A vehicle or prop that moves into a player shoves them out of the way.
- Players do not block or push objects by contact. The only force a player applies is the explicit push described below.
- A character is a capsule body with a sphere head, in one of six fixed colours, with the player's name above it. There is no skeletal animation.

### Vehicles

The admin picks the vehicle in the lobby. Vehicles differ in look and handling but carry no difficulty label.

| | Lodgy | RV |
|---|---|---|
| Size | Compact MPV | Longer, wider, taller camper |
| Mass | Baseline | About 2.5 times heavier |
| Tipping | Rolls but recovers | High centre of gravity |
| Climbing | Weak on steep slopes | Needs the winch on any real slope |
| Fuel burn | Baseline | About 1.5 times |
| Pushing | Crew can shove it free | Barely moves; righting it needs the winch |
| Turning circle | Tight | Wide |

Common to both:

- Fuel drains in proportion to throttle. At 0 fuel, throttle has no effect.
- Health drops on impacts above a speed threshold and continuously while upside down.
- A flipped vehicle is righted by pushing or winching.
- Same winch, same health pool.
- Models are recognisable shapes without any manufacturer's name or badge.

Course geometry (alley width, ledge width, hairpin radius) is sized so the RV fits.

### Crew actions

| Action | Behaviour |
|---|---|
| Push | A player walking into the vehicle or a light prop applies a force along their movement direction. On the vehicle, forces add per player, capped at 4 pushers' worth. |
| Winch | Take the hook from the front bumper, carry it to an anchor, interact to attach. Reel in or out from the driver seat or the winch box on the front bumper. One cable, maximum length 25 m. See "Winch" below. |
| Repair | Carry a toolbox to the vehicle and hold interact for 3 s to restore 50% health. The toolbox is consumed. |
| Refuel | Carry a jerrycan to the vehicle and hold interact for 3 s to restore 50% fuel. The jerrycan is consumed. |
| Clear | Pick up and throw light debris. Heavy obstacles cannot be carried; they move only when enough players push together or when winched. |

- A player carries one item at a time: hook, jerrycan, toolbox or light debris.
- Boarding while carrying drops the item, except the hook, which returns to the bumper.
- A hook carried beyond cable length is pulled from the player's hands and drops.
- Pickups are fixed per course regardless of crew size.
- A heavy obstacle needs several players pushing it at the same time: 1 when one player is connected, 2 for 2–3 connected players, 3 for 4–6. The count follows the players currently connected. With fewer pushers it does not move at all.
- A prop below the kill plane returns to its spawn point.

### Winch

- The hook rests on the front bumper. While a player carries it, the cable pays out freely up to 25 m.
- The hook attaches to an anchor: a marked static anchor, or the anchor point that every heavy obstacle has.
- Attaching sets the cable length to the current distance between hook and bumper.
- The cable only limits the maximum distance between its ends. A slack cable has no effect.
- Reeling in shortens the cable at a constant speed, pulling with at most a fixed winch force. Reeling out lengthens it, up to 25 m.
- Attached to a static anchor, reeling in pulls the vehicle. Attached to a heavy obstacle, it drags the obstacle toward the vehicle if the vehicle is braked or heavier.
- The driver can reel, and so can a player on foot within interact range of the winch box.
- Interact at the attached anchor detaches the hook into that player's hands.
- Reeling in while the hook lies on the ground retracts it to the bumper.

### Courses and segments

A course is an ordered list of segments. A segment is a reusable piece of route with configurable obstacles. Segments join end to end; each declares an entry and an exit (position, heading, elevation), and the course builder places each segment's entry on the previous segment's exit.

Segment types in spec 1:

| Type | Content | Parameters |
|---|---|---|
| `road` | Plain road, optionally curved or sloped | length, curve, slope, light debris count |
| `alley` | Narrow walled street cluttered with crates, carts, parked scooters | length, clutter density |
| `sand` | Soft sand between palm trees; the vehicle bogs down | length, palm (anchor) count |
| `ford` | Shallow rocky riverbed, slow and fuel-hungry | width, rock count |
| `hairpin` | Mountain switchback with a drop on one side | turn count, rockfall (heavy obstacles) on or off |
| `climb` | Steep gravel slope | length, gradient, anchor count |

Any segment may also place pickups (jerrycan, toolbox) and anchors.

Surface types affect tyre grip and rolling resistance: road, sand, riverbed, gravel. A surface is a property of a ground collider; the wheel takes the surface of the collider under it. Surfaces do not affect players. Water in a ford is visual only, with no buoyancy or current.

**Course 1, "Marrakech to the kasbah", about 10 minutes:**

1. `alley` — medina exit. Teaches driving and clearing.
2. `sand` — palmeraie track. First winch use.
3. `ford` — oued crossing, with a jerrycan stall on the far bank.
4. `hairpin` — Atlas switchbacks with a rockfall, and a toolbox at a mechanic's shack.
5. `climb` — final climb needing winch and push together. The finish is the kasbah gate.

Short `road` segments link them. Anchors are palm trunks, boulders and stone milestones, each visibly marked. Palette: ochre walls, red earth, green palms.

Exact lengths, gradients and obstacle counts are set in a course design pass at the start of the course step, once the vehicles drive.

### Collision

Collision stays simple throughout:

- Terrain is a heightfield per segment. Walls, props, obstacles and vehicles use boxes; players use capsules. No mesh colliders.
- The winch cable is a straight line from bumper to anchor. It does not collide with terrain, props or players. It is drawn as a sagging rope.

## 2. Architecture

### Repository

npm workspaces, TypeScript throughout.

| Package | Responsibility | Depends on |
|---|---|---|
| `shared` | Simulation, vehicle and course data, message types, constants | `@dimforge/rapier3d-compat` |
| `server` | Rooms, WebSocket transport, runs the sim, broadcasts snapshots, serves the built client | `shared`, `ws` |
| `client` | Rendering, input, audio, HUD, lobby, interpolation, prediction | `shared`, `three`, Vite |

### Conventions

Every package follows these, so that code written separately agrees.

- Units: metres, seconds, kilograms, radians.
- Axes: right-handed, +Y up. Forward is −Z and right is +X in a vehicle's or player's local frame.
- Yaw: rotation about +Y. Yaw 0 faces −Z; positive yaw turns left.
- The simulation tick is fixed at 1/60 s on the server and in client prediction. The client advances its simulation with a fixed-step accumulator, independent of frame rate.
- Players, props, anchors and seats have string ids that are stable for a run.
- Every tuning number comes from `constants` or a vehicle config. No tuning literals elsewhere.
- The simulation uses no randomness.
- TypeScript strict mode, ES modules.
- UI text is in English.

### `shared`

The simulation is a pure module with no network or rendering code.

```ts
const world = createWorld({ courseId, vehicleId });
world.addPlayer(id); world.removePlayer(id);
world.step(inputsByPlayer);   // advances one fixed tick
world.snapshot();             // serialisable state
world.status();               // 'running' | 'won', elapsed, restarts, checkpoint
```

One file per concern:

- `constants` — every tuning number (speeds, masses, forces, ranges, thresholds). Starting values are set in each step's plan and tuned by play.
- `vehicles` — one config per vehicle: dimensions, mass, centre of gravity, engine force, grip, fuel burn, seat and door positions, winch mount
- `vehicle` — Rapier raycast vehicle driven by a config; surface grip, fuel, health, seats. No per-vehicle branches.
- `player` — capsule character controller, carry state, respawn
- `winch` — hook, anchor attach, cable as a length-limited rope joint, reel
- `interact` — resolves what interact does for a player this tick
- `props` — light debris, heavy obstacles, pickups
- `segments` — one builder per segment type; each returns heightfield, surface map, colliders, anchors, prop spawns, entry and exit
- `courses` — course definitions as data (ordered segment list with parameters), and the builder that chains segments
- `checkpoints` — records state at each checkpoint, performs the restart
- `rules` — win condition, vehicle-lost detection, timer and penalties
- `protocol` — message types and validators

**Built course.** A `courseId` resolves to a `BuiltCourse`: ground colliders with their surfaces, wall and prop colliders, anchors, prop and pickup spawns, checkpoints with spawn poses, the finish volume and the kill plane. This type is the contract between course data and everything else. Until the segment system exists (step 9), the test ground is a hand-written `BuiltCourse`; the segment builder later produces the same type.

**Player physics.** A player is a kinematic character controller.

- A player standing on a moving body is carried with it.
- A player overlapped by a moving vehicle or prop is moved out along the shortest direction.
- Dynamic bodies ignore players in the physics solver. Pushing is an explicit force applied by `player` to the vehicle, a light prop or a heavy obstacle the player walks into.

**Interact resolution.** `interact` exposes a pure function from a player's state and the nearby world to the action interact would perform. The server uses it to act; the client uses it on interpolated state to show the prompt. A target is in range when it lies within the interact radius of the player; no aiming is needed. Among targets of the same priority, the nearest wins.

Interact priority, highest first, when several targets are in range:

1. Exit seat (if seated)
2. Attach hook to anchor (if carrying the hook)
3. Repair or refuel (if carrying a toolbox or jerrycan, at the vehicle)
4. Release carried item (if carrying): light debris is thrown forward along the player's yaw; a jerrycan, toolbox or hook is dropped at the player's feet
5. Take hook, pick up item
6. Detach hook at anchor
7. Board vehicle

### `server`

- **Rooms.** A room's identity is a unique noun, drawn at creation from a built-in word list and unused by any live room (for example `tagine`, `camel`). If the list is exhausted, a number is appended. The room lives at `/<noun>`.
- **Phases.** `lobby → playing → results → lobby`.
- **Admin.** The player who creates the room. If the admin leaves, the longest-connected player becomes admin.
- **Players.** Up to 6. Display names are 1–16 characters and unique within a room; a taken name is refused.
- **Session token.** Each client generates a random token with `crypto.getRandomValues` (not `randomUUID`, which browsers disable on plain `http` LAN addresses) and keeps it in session storage. Each tab is therefore a separate player, and a reload keeps its identity.
- **Slots.** When a player disconnects, their character is removed at once but their slot (name, colour, admin status) is held for 30 s. Rejoining with the same token within that time restores the slot. After 30 s the slot is freed, and if it was the admin's, the admin role passes on.
- **Simulation.** Each room in `playing` owns one world, stepped at a fixed 60 Hz. A snapshot is broadcast at 20 Hz.
- **Inputs.** The server keeps a queue of at most 8 inputs per player, dropping the oldest on overflow, and consumes one per tick. With an empty queue it repeats the last input, which never counts as a new button press.
- A room is deleted when it has had no connected players for 60 s.
- No database.
- One process serves the built client and the WebSocket on the same port (default 3000). Any path that is not a static file serves the client, which reads the noun from the URL.

### Lobby

The lobby is a waiting room.

- Everyone sees the room link, the player list with ready states, and the selected course and vehicle.
- Each player has a Ready toggle. Ready states reset whenever the room returns to the lobby.
- The admin selects the course and vehicle, can kick a player, and can start once every other player is ready. The admin needs no ready state and may start alone.
- A kicked player returns to the home page and may rejoin by the link.
- A player who opens the link during `playing` joins the run directly, if the room has fewer than 6 players, and spawns next to the vehicle.
- During `playing`, the admin can restart from the last checkpoint, restart the course, or return the room to the lobby.
- On the results screen the admin chooses "Next course" (absent on the last course) or "Back to lobby".

The home page (`/`) offers "Create room" and a field to enter a room's noun. Opening `/<noun>` asks for a display name, pre-filled from the last one used, then joins. A noun with no live room shows an error with a link to the home page.

### Protocol

JSON over WebSocket.

Client to server:

- `create { name, token }`
- `join { room, name, token }`
- `ready { ready }`
- `configure { courseId, vehicleId }` (admin)
- `kick { playerId }` (admin)
- `start {}`, `restartCheckpoint {}`, `restartCourse {}`, `toLobby {}`, `next {}` (admin)
- `input { seq, moveX, moveY, yaw, jump, interact, reel }`

The client sends one `input` per simulation tick, with `seq` increasing by 1. Field meanings:

| Field | On foot | As driver |
|---|---|---|
| `moveX`, `moveY` in [−1, 1] | Strafe and forward, relative to `yaw` | Steer and throttle; negative `moveY` reverses |
| `yaw` | Camera yaw | Camera yaw (no effect on the vehicle) |
| `jump`, boolean, held | Jumps on the press | Brakes while held |
| `interact`, boolean, held | Instant actions fire on the press. Repair and refuel need it held for 3 s; releasing cancels. | Exits on the press |
| `reel`: −1 out, 0, 1 in | Works within range of the winch box | Works always |

Server to client:

- `lobby { room, players, adminId, phase, courseId, vehicleId }`
- `snapshot { tick, ackSeq, vehicle, players, props, cable, fuel, health, elapsed, checkpoint, restarts }`
- `event { kind }` for one-off moments that drive sound and HUD: `impact`, `checkpoint`, `vehicleLost`, `pickup`, `repair`, `refuel`, `hookAttach`, `hookDetach`
- `results { courseId, vehicleId, elapsed, restarts, campaignTotal? }`
- `error { reason }` with reasons `unknown_room`, `room_full`, `name_taken`, `kicked`, `not_admin`, `bad_message`

A snapshot is identical for every client except `ackSeq`, the last input sequence number the server consumed for that client. Each player entry carries the id of the body the player stands on or sits in, if any, and the player's position relative to it.

Binary encoding and sending only changed props are deferred until snapshot size is measured as a problem. Long courses (spec 3) are expected to need the second.

### `client`

- `net` — socket, reconnect, snapshot buffer, interpolation 100 ms in the past for the vehicle, other players, props and cable
- `prediction` — predicts the local player's walking and jumping only; see "Prediction" below
- `input` — a device-agnostic layer producing the `input` message fields. Two sources: keyboard and mouse, and touch. The source is chosen by pointer capability at load.
- `render` — Three.js scene built from the same course data the server uses; low-poly meshes built in code
- `audio` — Web Audio playback of sound effects, driven by snapshots (engine pitch from throttle and speed, winch loop while reeling) and by `event` messages
- `ui` — plain HTML and CSS overlay for home, lobby, HUD (fuel, health, timer, checkpoint progress, interact prompt), reconnect overlay and results. No UI framework.

### Prediction

- Only the local player's walking and jumping are predicted. Picking up, carrying, seating, pushing and everything else come from the server.
- The client holds a local Rapier world with the course's static colliders, plus kinematic stand-ins for the vehicle and props, positioned from the interpolated snapshot.
- On each snapshot the client resets the local player to the server's state and replays the inputs after `ackSeq`. Small corrections are smoothed and large ones snap; both thresholds are constants.
- While the snapshot reports the local player as seated or standing on the vehicle or a prop, prediction is off. The player is drawn from the snapshot, relative to that body. Input lag while riding on the roof is accepted.

### Camera and rendering

- On foot, the camera follows behind the player and moves closer when a wall is in the way. Seated, it orbits the vehicle.
- If the WebGL context is lost, as iOS does to background tabs, the client reloads the page and rejoins with its session token.

### Sound

Effects only: engine loop, impact, winch loop, hook attach, pickup, repair and refuel, checkpoint, vehicle lost, UI click, win. Files come from a CC0 pack (Kenney's audio packs are the first candidate) and are chosen when the sound step starts; their licence is recorded in the repo. Audio unlocks on the player's first tap or click, as iOS requires.

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

- Local machine, same Wi-Fi: players open `http://<LAN-IP>:3000/<noun>`
- Local machine plus a tunnel (Cloudflare Tunnel, ngrok), which also provides `https`
- A single small container on a host such as Fly.io or Railway

The client derives the WebSocket URL from the page origin (`ws` for `http`, `wss` for `https`).

## 3. Error handling

- **Bad input.** The server validates every message's shape and clamps numeric ranges. Malformed messages get `bad_message` and are dropped. Admin-only messages from another player get `not_admin`. A socket sending more than 120 messages per second is closed.
- **Join failures.** Unknown room, full room and taken name each return a specific error that the client displays.
- **Disconnects.** The client shows a reconnecting overlay and retries with backoff for 30 s, rejoining with its session token. The server removes a dropped player's character immediately; a carried item drops and a vacated driver seat frees. The slot is held for 30 s. A rejoining player spawns next to the vehicle.
- **Stuck vehicle.** A vehicle that is wedged, or out of fuel with no jerrycan left, is not detected automatically. The admin uses "restart from checkpoint".
- **Tick overrun.** The server runs at most 3 catch-up steps per loop iteration and discards the remaining backlog.
- **Physics escapes.** Handled by the kill-plane rules: players respawn, props return to spawn, the vehicle triggers a checkpoint restart.
- **Server restart.** Rooms are in memory; a restart ends all runs.
- **iOS backgrounding.** Safari suspends the socket when the page is hidden. On return, the client follows the normal reconnect path.

## 4. Testing

Runner: Vitest in all packages.

`shared` (headless, against the real Rapier world):

- vehicle: throttle moves it; fuel drains with throttle; empty tank disables drive; impact above the threshold reduces health; upside-down drains health; grip differs by surface; both vehicle configs load and drive
- seats: one driver; boarding takes the nearest free seat; exit places the player beside the door
- winch: attaches only within range of an anchor; cable length never exceeds 25 m; reeling in pulls the vehicle toward the anchor; over-length hook drops
- interact: priority order holds when several targets are in range; one carried item at a time
- push: force adds per player and respects the cap; a heavy obstacle moves only at the pusher count for the connected players; a heavy obstacle can be winched
- player physics: carried by a moving body; shoved out of a vehicle that moves into them; contact alone moves nothing
- input: a repeated input does not re-trigger a press; hold actions cancel on release; the queue drops the oldest on overflow
- repair and refuel: restore 50%, consume the item, require the full hold
- segments: every type builds; entry and exit are consistent; a chained course has no gap or overlap at joins
- checkpoints: entering a segment records state once; vehicle lost, or an admin restart, restores the vehicle pose, fuel and health with the 50% floor, restores every prop to its recorded state, detaches the winch and adds 60 s
- rules: finish volume wins; players and props respawn from the kill plane
- determinism: the same input sequence produces the same snapshot

`server`:

- rooms: unique noun allocation, create, join, full, taken name, rejoin by token within 30 s, slot freed after 30 s, admin handover, kick, empty-room cleanup
- lobby: ready states, start refused until all others are ready, admin-only messages refused from others, phase transitions including `next`
- message validation and rate limit, using a fake socket

`client`:

- snapshot interpolation
- prediction reconciliation
- input layer: keyboard and touch sources produce the same `input` fields

End to end: one Playwright smoke test opens two pages, creates a room, joins by its URL, readies up, starts a run and asserts both receive snapshots. A second run uses an iPhone viewport with touch emulation to check the touch UI appears.

Rendering, sound, game feel and course tuning are checked by hand, including on a real iPhone.

## 5. Build order

Each step ends in something runnable. Progress is tracked in `ROADMAP.md`. Each step gets its own plan, written when the step starts, and its own branch. Steps 8 to 12 need a manual sign-off from the owner because game feel, sound and real-device behaviour cannot be tested automatically.

Steps 1 to 8 run on a flat test ground with a ramp, a sand patch, an anchor and a few props.

1. Workspace scaffold, Rapier world, test ground, drivable Lodgy from a vehicle config, in one browser tab with the sim running locally. Keyboard input source. Includes a throwaway experiment proving that a rope joint can winch a raycast vehicle stably at the RV's mass.
2. Server, rooms at `/<noun>`, snapshots and interpolation: two tabs see the same vehicle.
3. On-foot players with prediction, boarding and seats.
4. Push, carry, props and clearing.
5. Winch.
6. Fuel, health, repair, refuel, checkpoints and restart, win rule, HUD.
7. Lobby: ready states, admin controls, course and vehicle selection, kick, results, next course, session tokens.
8. Touch input source, touch UI, landscape and safe-area layout, web app manifest. Verified on an iPhone over LAN.
9. Segment system, course design pass, and course 1.
10. The RV: config, mesh and handling pass over course 1.
11. Sound effects.
12. Reconnect polish and single-container deployment.
