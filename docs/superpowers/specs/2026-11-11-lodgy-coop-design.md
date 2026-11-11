# Lodgy Co-op — Design (spec 1: engine and course 1)

Date: 2026-11-11
Status: revised after brainstorming, pending written review

## Summary

A 3D browser game for up to 6 players, inspired by *RV There Yet?*. One crew shares one physics-driven vehicle and must get it through a campaign of courses inspired by real routes around Marrakech. One player drives; the others ride, then get out to push, winch, clear obstacles, repair and refuel. Courses run from about 10 minutes (course 1) to an hour or more (later courses). Difficulty comes from each course's obstacles.

Players join a room by URL. A small Node server runs the physics authoritatively. Desktop browsers and iPhones (Safari) play in the same room.

## Scope

The project is split into several specs. Each ends in a playable game.

| Spec | Content |
|---|---|
| **1 (this document)** | The whole engine, lobby, two vehicles, the segment system with forks, and course 1: to Marrakech airport (about 10 minutes) |
| 2 | More segment types (mountain hairpins, long climbs); course 2: to the Ourika valley; course 3: into the Atlas; vehicle power-ups (nitro, sand tyres, reinforced bumper); shortcut gates |
| 3 | Longer courses (1 hour or more) |
| 4 | Team versus |

In scope for spec 1:

- Co-op campaign structure, with one course shipped
- Up to 6 players per room, joined by URL. The game is designed for 2–6; a solo run is allowed and completable.
- Lobby with ready states and admin controls
- Two vehicles, Lodgy and RV, chosen freely
- Checkpoint restart when the vehicle is lost
- Player health, downed state and revival
- A 3-slot inventory per player
- Coins, shops, fuel stations and garages, three side objectives per course
- Time of day and weather, chosen in the lobby
- HUD with compass, minimap and crosshair
- Desktop (keyboard and mouse) and iPhone (touch) controls
- Low-poly flat-shaded visuals built in code
- Basic sound effects

Out of scope for spec 1:

- Accounts, persistence, leaderboards, saved campaign progress
- Procedural course generation, courses generated from map data
- Vehicle power-ups and shortcut gates (spec 2)
- Voice or text chat, music
- Android-specific tuning, gamepad support

The design must not block a second vehicle per room (spec 4).

## 1. Game rules

### Campaign and goal

- A campaign is an ordered list of courses. Each course has different obstacles and is longer and harder than the one before.
- The goal of a course is to get the vehicle from the start into the finish volume.
- Winning shows the results screen: final time, vehicle, conditions, restarts, respawns, coins and stars. The admin then moves the room to the next course, which returns everyone to the lobby with that course selected.
- After the last course, the results screen shows the campaign total.
- Nothing is saved. The admin may select any course in the lobby.

### Final time

```
final time = elapsed time
           + 60 s for each checkpoint restart
           + 30 s for each player respawn
           − 5 s for each coin still in the wallet at the finish
```

It never goes below zero. The four numbers are constants.

### Losing the vehicle: checkpoint restart

A run never hard-fails. The vehicle is lost when its health reaches 0 or it falls below the kill plane. The admin can also trigger the same restart by hand, for a vehicle stuck beyond rescue. In each case:

- The vehicle returns to the last checkpoint's spawn pose. All players are placed beside it, unseated, with nothing in their hands.
- Vehicle fuel and health, and each player's health, are restored to their values when that checkpoint was recorded, with a floor of 50% each. Downed players are revived.
- Every prop, obstacle, pickup and coin, the wallet, and every player's inventory return to the state recorded at that checkpoint. A player who joined after the checkpoint gets an empty inventory.
- The winch detaches and the hook returns to the bumper.
- One checkpoint restart is counted.

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
- Players do not block or push objects by contact. The only force a player applies is the explicit push described under "Crew actions". A vehicle or prop that moves into a player shoves them out of the way.
- A character is a capsule body with a sphere head, in one of six fixed colours, with the player's name above it. There is no skeletal animation.

### Player health

- A player has 100 health. It does not regenerate.
- A player is hurt by: landing from a fall above a speed threshold; being hit by the vehicle above a relative speed threshold; being hit by any prop moving above a speed threshold. Damage scales with the speed above the threshold.
- A seated player takes no damage.
- At 0 health the player is **downed**: they lie where they fell, cannot move or act, drop what is in their hands, keep their inventory, and take no further damage.
- A teammate revives a downed player by using a health kit on them. The player gets up with 50 health.
- If nobody revives them within 30 s, the player **respawns** beside the vehicle with 50 health, and one respawn is counted.
- If every connected player is downed at once, all respawn immediately. A solo player therefore respawns as soon as they are downed.
- A player below the kill plane respawns beside the vehicle after 3 s with 50 health, and one respawn is counted. What was in their hands returns to its spawn point (the hook to the bumper).

### Hands and inventory

A player has two separate things:

| | Holds | Capacity |
|---|---|---|
| Hands | The winch hook, or one piece of light debris | One thing |
| Inventory | Jerrycans, toolboxes, health kits | Three slots, one item each |

- Picking up a jerrycan, toolbox or health kit puts it in the first free slot. With no free slot, it cannot be picked up.
- One slot is selected at a time. Interact uses the selected item when a valid target is in range.
- Drop puts the selected item on the ground at the player's feet.
- Boarding the vehicle while holding debris drops it; while holding the hook returns it to the bumper. Inventory stays with the player.
- When a player disconnects, their inventory items drop where they stood.

Item effects, each needing interact held for 3 s, each consuming the item:

| Item | Target | Effect |
|---|---|---|
| Jerrycan | The vehicle | Fuel +50% |
| Toolbox | The vehicle | Health +50% |
| Health kit | A downed teammate | Revives at 50 health |
| Health kit | A hurt teammate, or oneself if no teammate is targeted | Health +50 |

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

Course geometry (alley width, hairpin radius) is sized so the RV fits.

### Crew actions

| Action | Behaviour |
|---|---|
| Push | A player walking into the vehicle or a light prop applies a force along their movement direction. On the vehicle, forces add per player, capped at 4 pushers' worth. |
| Winch | Take the hook from the front bumper, carry it to an anchor, interact to attach. Reel in or out from the driver seat or the winch box on the front bumper. See "Winch". |
| Repair, refuel | Use a toolbox or jerrycan on the vehicle, or bring the vehicle to a garage or fuel station. |
| Clear | Pick up and throw light debris. Heavy obstacles cannot be carried; they move only when enough players push together or when winched. |

- A heavy obstacle needs several players pushing it at the same time: 1 when one player is connected, 2 for 2–3 connected players, 3 for 4–6. The count follows the players currently connected. With fewer pushers it does not move at all.
- Pickups and coins are fixed per course regardless of crew size.
- A prop below the kill plane returns to its spawn point.

### Winch

The cable is force-based. There is no physics joint.

- The hook rests on the front bumper. While a player holds it, the cable pays out freely up to 25 m. A hook carried beyond that is pulled from the player's hands and drops.
- The hook attaches to an anchor: a marked static anchor, or the anchor point that every heavy obstacle has.
- Attaching sets the cable length to the current distance between hook and bumper.
- A slack cable has no effect. A taut cable pulls its two ends together with a spring-and-damper force, capped at the maximum winch force. Under a load above the cap the cable stretches; it never breaks.
- Reeling in shortens the cable at a constant speed. Reeling out lengthens it, up to 25 m.
- Attached to a static anchor, reeling in pulls the vehicle. Attached to a heavy obstacle, it drags the obstacle toward the vehicle if the vehicle is braked or heavier.
- The winch alone stalls on a steep enough slope; throttle and pushing add to it.
- The driver can reel, and so can a player on foot within interact range of the winch box.
- Interact at the attached anchor detaches the hook into that player's hands.
- Reeling in while the hook lies on the ground retracts it to the bumper.
- The cable is drawn as a rope from bumper to hook. It does not collide with anything.

### Coins and shops

- Coins are floating collectibles, many of them placed off the easy path: on a ledge, behind an obstacle, across a gap.
- A player on foot collects a coin by touching it. No interact is needed.
- Coins go into one wallet shared by the crew.
- A shop stands at every fuel station. A player on foot interacts with the counter to open the shop menu and buy a jerrycan, a toolbox or a health kit, which goes into their inventory. Buying needs enough coins and a free slot. Prices are constants.
- Each coin left in the wallet at the finish takes 5 s off the final time, so spending is a choice.

### Service stops

A segment may contain service stops. Each has a marked parking zone and a point a player operates on foot.

| Stop | Use | Effect |
|---|---|---|
| Fuel station | With the vehicle in the zone, a player holds interact at the pump for 3 s | Fuel to 100% |
| Garage | With the vehicle in the zone, a player holds interact at the workbench for 3 s | Vehicle health to 100% |

Stops are free and can be used any number of times.

### Side objectives

Each course awards up to three stars, shown on the results screen only:

1. Finish with no checkpoint restart.
2. Finish with a final time under the course's target time, set in the course data.
3. Collect every coin.

A run in which an admin tool was used (see "Lobby") earns no stars and is marked as assisted on the results screen.

### Conditions

The admin picks the time of day and the weather in the lobby. They apply to the whole run.

| Setting | Values | Effect |
|---|---|---|
| Time of day | dawn, midday, sunset, night | Visual only: sun angle, sky and light colour. At night the vehicle's headlights are on and each player carries a small light. |
| Weather | clear, rain, sandstorm | Rain multiplies tyre grip on every surface by a constant below 1 and shows rainfall. A sandstorm limits how far players can see with fog and has no physical effect. |

Defaults are midday and clear.

### Courses and segments

A course is built from segments. A segment is a reusable piece of route with configurable obstacles. Each declares an entry and an exit (position, heading, elevation), and the course builder places each segment's entry on the previous one's exit.

A course definition is an ordered list whose entries are either a segment or a **fork**. A fork holds two branches, each a list of segments, for example short and hard against long and easy. Both branches start at the fork's entry and must end at the same exit pose. The builder rejects a course whose branches do not meet within a tolerance. The crew chooses a branch by driving into it.

Segment types in spec 1:

| Type | Content | Parameters |
|---|---|---|
| `road` | Plain road, optionally curved or sloped | length, curve, slope, light debris count |
| `alley` | Narrow walled street cluttered with crates, carts, parked scooters | length, clutter density |
| `sand` | Soft sand between palm trees; the vehicle bogs down | length, palm (anchor) count |
| `ford` | Shallow rocky riverbed, slow and fuel-hungry | width, rock count |
| `bank` | Short steep earth or gravel bank | height, gradient, anchor count |
| `roadworks` | Road blocked by heavy obstacles and barriers | length, obstacle count |

Any segment may also place pickups, anchors, service stops and coins.

Surface types affect tyre grip and rolling resistance: road, sand, riverbed, gravel. A surface is a property of a ground collider; the wheel takes the surface of the collider under it. Surfaces do not affect players. Water in a ford is visual only, with no buoyancy or current.

**Courses are inspired by real routes.** Each follows a real route's general direction and landmarks in order, heavily compressed, and is handmade from segments. Nothing is generated from map data. The owner's real start point lies east of Marrakech; its coordinates are not stored in the repository.

| Course | Route | Spec |
|---|---|---|
| 1 | From the start point west to Marrakech airport: rural track, palm grove, an oued, the city's edge, the airport road. Flat terrain. About 10 minutes. | 1 |
| 2 | To the Ourika valley | 2 |
| 3 | Into the Atlas | 2 |

Course 1 uses every spec 1 segment type and has one fork, one fuel station with its shop, and one garage. Anchors are palm trunks, boulders and stone milestones, each visibly marked. Palette: ochre walls, red earth, green palms.

The landmarks, the segment list, and all lengths, gradients and counts for course 1 are set with the owner in a course design pass at the start of the course step, once the vehicles drive.

### Collision

Collision stays simple throughout:

- Ground is one or more heightfields or boxes per segment. Walls, props, obstacles and vehicles use boxes; players use capsules. No mesh colliders.
- The winch cable collides with nothing.

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
- Yaw: rotation about +Y. Yaw 0 faces −Z; positive yaw turns left. Pitch: positive looks up.
- The simulation tick is fixed at 1/60 s on the server and in client prediction. The client advances its simulation with a fixed-step accumulator, independent of frame rate.
- Players, props, anchors, seats, stops and coins have string ids that are stable for a run.
- Every tuning number comes from `constants` or a vehicle config. No tuning literals elsewhere.
- The simulation uses no randomness.
- TypeScript strict mode, ES modules.
- UI text is in English.

### `shared`

The simulation is a pure module with no network or rendering code.

```ts
const world = createWorld({ courseId, vehicleId, weather });
world.addPlayer(id); world.removePlayer(id);
world.step(inputsByPlayer);   // advances one fixed tick; returns the tick's events
world.buy(playerId, item);    // shop purchase; returns ok or a refusal reason
world.admin(action);          // 'restartCheckpoint' | 'skipCheckpoint' | 'refill'
world.snapshot();             // serialisable state
world.status();               // 'running' | 'won', elapsed, restarts, respawns, coins, finalTime, stars, assisted
```

One file per concern:

- `constants` — every tuning number. Starting values are set in each step's plan and tuned by play.
- `vehicles` — one config per vehicle: dimensions, mass, centre of gravity, engine force, grip, fuel burn, seat and door positions, winch mount
- `vehicle` — Rapier raycast vehicle driven by a config; surface grip, weather grip, fuel, health, seats. No per-vehicle branches.
- `player` — capsule character controller, hands, respawn
- `health` — player damage, downed state, revival, respawn timers
- `inventory` — slots, selection, pick-up, drop, item use
- `winch` — hook, anchor attach, force-based cable, reel
- `interact` — resolves what interact does for a player this tick
- `props` — light debris, heavy obstacles, pickups
- `stops` — fuel stations, garages, shops
- `coins` — coins and the wallet
- `segments` — one builder per segment type
- `courses` — course definitions as data, and the builder that chains segments and forks
- `checkpoints` — records state at each checkpoint, performs the restart
- `rules` — win condition, vehicle-lost detection, timer, final time and stars
- `protocol` — message types and validators

**Built course.** A `courseId` resolves to a `BuiltCourse`: ground colliders with their surfaces, wall and prop colliders, anchors, prop and pickup spawns, service stops, coins, checkpoints with spawn poses, the route as a 2D line for the minimap, the finish volume, the kill plane and the target time. This type is the contract between course data and everything else. Until the segment system exists, the test ground is a hand-written `BuiltCourse`; the segment builder later produces the same type.

**Player physics.** A player is a kinematic character controller.

- A player standing on a moving body is carried with it.
- A player overlapped by a moving vehicle or prop is moved out along the shortest direction.
- Dynamic bodies ignore players in the physics solver. Pushing is an explicit force applied by `player` to the vehicle, a light prop or a heavy obstacle the player walks into.

**Interact resolution.** `interact` exposes a pure function from a player's state and the nearby world to the action interact would perform. The server uses it to act; the client uses it on interpolated state to show the prompt. A target is in range when it lies within the interact radius of the player. Among in-range targets of the same priority, the one closest to the crosshair wins, meaning the smallest angle from the camera's aim direction.

Interact priority, highest first:

1. Exit seat (if seated)
2. Attach hook to anchor (if holding the hook)
3. Use the selected inventory item on a valid target in range
4. Operate a service stop: pump or workbench with the vehicle in its zone, or a shop counter
5. Release what is in the hands: light debris is thrown along the camera's aim; the hook is dropped at the player's feet
6. Take the hook; pick up debris into the hands or an item into the inventory
7. Detach hook at anchor
8. Board vehicle

### `server`

- **Rooms.** A room's identity is a unique noun, drawn at creation from a built-in word list and unused by any live room (for example `tagine`, `camel`). If the list is exhausted, a number is appended. The room lives at `/<noun>`.
- **Phases.** `lobby → playing → results → lobby`.
- **Admin.** The player who creates the room.
- **Players.** Up to 6. Display names are 1–16 characters and unique within a room; a taken name is refused.
- **Session token.** Each client generates a random token with `crypto.getRandomValues` (not `randomUUID`, which browsers disable on plain `http` LAN addresses) and keeps it in session storage. Each tab is therefore a separate player, and a reload keeps its identity.
- **Slots.** When a player disconnects, their character is removed at once but their slot (name, colour, admin status) is held for 30 s. Rejoining with the same token within that time restores the slot. After 30 s the slot is freed, and if it was the admin's, the admin role passes to the longest-connected player.
- **Simulation.** Each room in `playing` owns one world, stepped at a fixed 60 Hz. A snapshot is broadcast at 20 Hz.
- **Inputs.** The server keeps a queue of at most 8 inputs per player, dropping the oldest on overflow, and consumes one per tick. With an empty queue it repeats the last input, which never counts as a new button press.
- A room is deleted when it has had no connected players for 60 s.
- No database.
- One process serves the built client and the WebSocket on the same port (default 3000). Any path that is not a static file serves the client, which reads the noun from the URL.

### Lobby

The lobby is a waiting room.

- Everyone sees the room link, the player list with ready states, and the selected course, vehicle, time of day and weather.
- Each player has a Ready toggle. Ready states reset whenever the room returns to the lobby.
- The admin selects the course, vehicle, time of day and weather, can kick a player, and can start once every other player is ready. The admin needs no ready state and may start alone.
- A kicked player returns to the home page and may rejoin by the link.
- A player who opens the link during `playing` joins the run directly, if the room has fewer than 6 players, and spawns next to the vehicle.
- During `playing`, the admin can restart from the last checkpoint, restart the course, or return the room to the lobby.
- **Admin tools.** During `playing`, the admin can also skip the vehicle and crew to the next checkpoint, or refill the vehicle's fuel and health. These exist for testing courses. Using either marks the run as assisted.
- On the results screen the admin chooses "Next course" (absent on the last course) or "Back to lobby".

The home page (`/`) offers "Create room" and a field to enter a room's noun. Opening `/<noun>` asks for a display name, pre-filled from the last one used, then joins. A noun with no live room shows an error with a link to the home page.

### Protocol

JSON over WebSocket.

Client to server:

- `create { name, token }`
- `join { room, name, token }`
- `ready { ready }`
- `configure { courseId, vehicleId, timeOfDay, weather }` (admin)
- `kick { playerId }` (admin)
- `start {}`, `restartCheckpoint {}`, `restartCourse {}`, `toLobby {}`, `next {}` (admin)
- `adminTool { tool }` with `skipCheckpoint` or `refill` (admin)
- `buy { item }`
- `input { seq, moveX, moveY, yaw, pitch, jump, interact, reel, slot, drop }`

The client sends one `input` per simulation tick, with `seq` increasing by 1. Field meanings:

| Field | On foot | As driver |
|---|---|---|
| `moveX`, `moveY` in [−1, 1] | Strafe and forward, relative to `yaw` | Steer and throttle; negative `moveY` reverses |
| `yaw`, `pitch` | Camera aim | Camera aim (no effect on the vehicle) |
| `jump`, boolean, held | Jumps on the press | Brakes while held |
| `interact`, boolean, held | Instant actions fire on the press. Hold actions need 3 s; releasing cancels. | Exits on the press |
| `reel`: −1 out, 0, 1 in | Works within range of the winch box | Works always |
| `slot`: 0, 1 or 2 | Selected inventory slot | Same |
| `drop`, boolean | Drops the selected item on the press | No effect |

Server to client:

- `lobby { room, players, adminId, phase, courseId, vehicleId, timeOfDay, weather }`
- `snapshot { tick, ackSeq, vehicle, players, props, cable, coins, wallet, elapsed, checkpoint, restarts, respawns }`
- `event { kind }` for one-off moments that drive sound and HUD: `impact`, `checkpoint`, `vehicleLost`, `pickup`, `use`, `hookAttach`, `hookDetach`, `coin`, `buy`, `hurt`, `downed`, `revive`, `respawn`
- `results { courseId, vehicleId, timeOfDay, weather, elapsed, restarts, respawns, coins, finalTime, stars, assisted, campaignTotal? }`
- `error { reason }` with reasons `unknown_room`, `room_full`, `name_taken`, `kicked`, `not_admin`, `bad_message`, `cannot_buy`

`vehicle` carries its pose, fuel and health. Each player entry carries pose, health, downed state and timer, hands, inventory and selected slot, plus the id of the body the player stands on or sits in, if any, and the position relative to it.

A snapshot is identical for every client except `ackSeq`, the last input sequence number the server consumed for that client.

Binary encoding and sending only changed props are deferred until snapshot size is measured as a problem. Long courses (spec 3) are expected to need the second.

### `client`

- `net` — socket, reconnect, snapshot buffer, interpolation 100 ms in the past for the vehicle, other players, props and cable
- `prediction` — predicts the local player's walking and jumping only
- `input` — a device-agnostic layer producing the `input` message fields. Two sources: keyboard and mouse, and touch. The source is chosen by pointer capability at load.
- `render` — Three.js scene built from the same course data the server uses; low-poly meshes built in code; lighting, sky, fog and rain from the room's conditions
- `audio` — Web Audio playback of sound effects, driven by snapshots and `event` messages
- `ui` — plain HTML and CSS overlay for home, lobby, HUD, shop menu, reconnect overlay and results. No UI framework.

### Prediction

- Only the local player's walking and jumping are predicted. Picking up, inventory, health, seating, pushing and everything else come from the server.
- The client holds a local Rapier world with the course's static colliders, plus kinematic stand-ins for the vehicle and props, positioned from the interpolated snapshot.
- On each snapshot the client resets the local player to the server's state and replays the inputs after `ackSeq`. Small corrections are smoothed and large ones snap; both thresholds are constants.
- While the snapshot reports the local player as seated, downed, or standing on the vehicle or a prop, prediction is off. The player is drawn from the snapshot, relative to that body. Input lag while riding on the roof is accepted.

### Camera and rendering

- On foot, the camera sits behind and above the player's shoulder and moves closer when a wall is in the way. Seated, it orbits the vehicle.
- If the WebGL context is lost, as iOS does to background tabs, the client reloads the page and rejoins with its session token.

### HUD

| Position | Content |
|---|---|
| Top centre | Compass: a heading strip with a marker toward the next checkpoint |
| Top left | Minimap: the course's stylised route, the vehicle, players, service stops and checkpoints |
| Top right | Vehicle fuel and health, timer, wallet |
| Bottom left | The player's own health |
| Bottom right | The three inventory slots, with the selected one highlighted |
| Centre | A small cross-shaped crosshair, with the interact prompt and hold progress beneath it |

On touch devices the joystick floats over the left half and the action buttons sit beside the inventory slots. The exact arrangement on both devices is settled in a mock-up pass with the owner at the start of the HUD step.

### Sound

Effects only: engine loop, impact, winch loop, hook attach, pickup, item use, coin, purchase, hurt, downed, revive, checkpoint, vehicle lost, rain loop, UI click, win. Files come from a CC0 pack (Kenney's audio packs are the first candidate), found and downloaded by the implementer; their licence is recorded in the repo. Engine pitch follows throttle and speed. Audio unlocks on the player's first tap or click, as iOS requires.

### Controls

| Action | Desktop | iPhone |
|---|---|---|
| Move / steer | WASD | Floating joystick: it appears under the left thumb wherever it touches the left half of the screen |
| Look | Mouse (pointer lock) | Drag on right half of screen |
| Interact | E | Button |
| Jump / brake | Space | Button (label changes when seated) |
| Throttle, reverse | W, S when driving | Joystick up, down when driving |
| Reel in, out | Q, R | Two buttons, shown only when reeling is possible |
| Select slot | 1, 2, 3 | Tap the slot |
| Drop item | G | Long-press the slot |

### iPhone specifics

- The joystick and buttons are written by hand, with no library. Joystick and look-drag work at the same time (multi-touch).
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
- **Refused purchase.** Too few coins, no free slot, or no shop in range returns `cannot_buy`.
- **Disconnects.** The client shows a reconnecting overlay and retries with backoff for 30 s, rejoining with its session token. The server removes a dropped player's character immediately; what they held and carried drops, and a vacated driver seat frees. The slot is held for 30 s. A rejoining player spawns next to the vehicle with 100 health and an empty inventory.
- **Stuck vehicle.** A vehicle that is wedged, or out of fuel with no way to refuel, is not detected automatically. The admin uses "restart from checkpoint".
- **Tick overrun.** The server runs at most 3 catch-up steps per loop iteration and discards the remaining backlog.
- **Physics escapes.** Handled by the kill-plane rules: players respawn, props return to spawn, the vehicle triggers a checkpoint restart.
- **Server restart.** Rooms are in memory; a restart ends all runs.
- **iOS backgrounding.** Safari suspends the socket when the page is hidden. On return, the client follows the normal reconnect path.

## 4. Testing

Runner: Vitest in all packages. Tests are written before the code they cover.

### Unit tests

`shared` (headless, against the real Rapier world):

- vehicle: throttle moves it; fuel drains with throttle; empty tank disables drive; impact above the threshold reduces health; upside-down drains health; grip differs by surface; both vehicle configs load and drive
- seats: one driver; boarding takes the nearest free seat; exit places the player beside the door
- player physics: carried by a moving body; shoved out of a vehicle that moves into them; contact alone moves nothing
- player health: each damage source; no damage while seated; downed at 0; revive at 50; respawn after 30 s; all downed respawn at once; kill plane respawn; respawns counted
- inventory: fills the first free slot; refuses when full; selection; drop; each item's use, hold time and effect; items drop on disconnect
- winch: attaches only within range of an anchor; the pull never exceeds the force cap; reeling in pulls the vehicle toward the anchor; reel-out stops at 25 m; over-length hook drops; a heavy obstacle can be dragged; a grounded hook retracts
- interact: priority order; the target nearest the crosshair wins within a priority
- push: force adds per player and respects the cap; a heavy obstacle moves only at the pusher count for the connected players
- input: a repeated input does not re-trigger a press; hold actions cancel on release; the queue drops the oldest on overflow
- service stops: work only with the vehicle in the zone; restore to 100%; require the full hold; reusable
- coins and shop: collected by touch; shared wallet; purchase needs coins, a free slot and range; refusals
- segments and forks: every type builds; entries and exits are consistent; a chained course has no gap or overlap at joins; a fork whose branches do not meet is rejected
- checkpoints: entering a segment records state once; a restart restores the vehicle, player health, props, coins, wallet and inventories, detaches the winch and counts one restart
- rules: finish volume wins; final time formula with its floor; each star's condition; assisted runs earn no stars
- weather: rain lowers grip on every surface; sandstorm and time of day change nothing in the simulation
- determinism: the same input sequence produces the same snapshot

`server`:

- rooms: unique noun allocation, create, join, full, taken name, rejoin by token within 30 s, slot freed after 30 s, admin handover, kick, empty-room cleanup
- lobby: ready states, start refused until all others are ready, admin-only messages refused from others, phase transitions including `next`
- message validation and rate limit, using a fake socket

`client`:

- snapshot interpolation
- prediction reconciliation
- input layer: keyboard and touch sources produce the same `input` fields
- compass bearing and minimap projection

### Scenario tests

These stand in for judgements of feel. Each is a headless simulation run with a measurable assertion, repeated for both vehicles where it applies. The gradients, times and counts are constants set when the step is planned and changed only by the owner.

- The Lodgy climbs the reference gentle slope unaided and fails the reference steep slope unaided.
- Each vehicle climbs the reference steep slope with the winch within a time limit.
- The RV fails the reference medium slope unaided.
- A flipped Lodgy is righted by the stated number of pushers within a time limit; a flipped RV is righted by the winch.
- Winching never produces a vehicle speed or spin above a sanity limit.
- A vehicle at rest on flat ground stays at rest for 10 s.
- A full tank lasts within a stated range of driving time at full throttle.
- A scripted driver completes the test ground from start to finish.
- For every built course: each checkpoint's spawn pose rests on ground, the route is continuous from start to finish along each branch, and every service stop's zone fits the RV.

### Integration tests

- **Server and protocol.** A real server on a local port and two WebSocket clients: create, join by noun, ready, start, send inputs until the scripted driver finishes the test ground, receive `results`. Also: a disconnect and rejoin mid-run, a checkpoint restart, a purchase.
- **Browser.** A Playwright test opens two pages, creates a room, joins by its URL, readies up, starts a run and asserts both receive snapshots and show every HUD element. It runs once at a desktop viewport and once at an iPhone viewport with touch emulation, where it also asserts the joystick and buttons appear.

Visuals, sound, game feel, the course's fun and real-iPhone behaviour are checked by the owner.

## 5. Build order

Each step ends in something runnable. Progress is tracked in `ROADMAP.md`. Each step gets its own plan, written when the step starts, and its own branch. Steps 10 to 16 need a manual sign-off from the owner because visuals, game feel, sound and real-device behaviour cannot be tested automatically.

Steps 1 to 12 run on a flat test ground with a ramp, reference slopes, a sand patch, an anchor, a few props, a fuel station with a shop, a garage and a few coins.

1. Workspace scaffold, Rapier world, test ground, drivable Lodgy from a vehicle config, in one browser tab with the sim running locally. Keyboard input source. Includes a throwaway experiment that finds stable starting values for the force-based cable at both vehicle masses.
2. Server, rooms at `/<noun>`, snapshots and interpolation: two tabs see the same vehicle.
3. On-foot players with prediction, shoulder camera and crosshair, boarding and seats.
4. Push, hands, props and clearing.
5. Winch.
6. Vehicle fuel and health, inventory, jerrycans and toolboxes, checkpoints and restart, win rule.
7. Player health, damage, downed state, health kits, revival and respawn.
8. Lobby: ready states, admin controls and tools, course and vehicle selection, kick, results, next course, session tokens.
9. Service stops, coins, shops, final time and side objectives.
10. HUD: mock-up pass, then compass, minimap, gauges, slots and prompts.
11. Conditions: time of day and weather.
12. Touch input source, floating joystick, touch UI, landscape and safe-area layout, web app manifest. Verified on an iPhone over LAN.
13. Segment system with forks, course design pass, and course 1.
14. The RV: config, mesh and handling pass over course 1.
15. Sound effects.
16. Reconnect polish and single-container deployment.
