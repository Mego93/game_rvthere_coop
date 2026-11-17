# Lodgy Co-op — Design (spec 1: engine and course 1)

Date: 2026-11-11
Status: revised after an independent review, pending the owner's written review

## Summary

A 3D browser game for up to 6 players, inspired by *RV There Yet?*. One crew shares one physics-driven vehicle and must get it through a campaign of courses inspired by real routes around Marrakech. One player drives; the others ride, then get out to push, winch, clear obstacles, repair and refuel. Courses run from about 10 minutes (course 1) to an hour or more (later courses). Difficulty comes from each course's obstacles.

Players join a room by URL. A small Node server runs the physics authoritatively. Desktop browsers and iPhones (Safari) play in the same room.

## Scope

The project is split into several specs. Each ends in a playable game.

| Spec | Content |
|---|---|
| **1 (this document)** | The whole engine, lobby, two vehicles, the segment system, and course 1: to Marrakech airport (about 10 minutes) |
| 2 | Forks that rejoin; mountain segment types; course 2: to the Ourika valley; course 3: into the Atlas; vehicle power-ups (nitro, sand tyres, reinforced bumper); shortcut gates |
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
- Forks, vehicle power-ups and shortcut gates (spec 2)
- Procedural course generation, courses generated from map data
- Voice or text chat, music
- Android-specific tuning, gamepad support

Spec 4 will add a second vehicle per room. The snapshot and `createWorld` use a single `vehicle` for now; that is accepted and will change then.

## 1. Game rules

### Campaign and goal

- A campaign is an ordered list of courses. Each course has different obstacles and is longer and harder than the one before.
- The goal of a course is to get the vehicle's centre from the start into the finish volume.
- Winning shows the results screen: final time, vehicle, conditions, restarts, respawns, coins and stars. The admin then chooses "Next course", which returns everyone to the lobby with that course selected, or "Back to lobby".
- "Next course" is absent on the campaign's last course. Spec 1 ships one course, so it does not appear in play; it is built and tested with a two-course test campaign.
- The campaign total is the sum of the latest final time for each course finished since the room was created. It is shown only once every course in the campaign has one.
- Nothing is saved. The admin may select any course in the lobby.

### Final time

```
final time = elapsed time
           + 60 s for each checkpoint restart
           + 30 s for each player respawn
           − 5 s for each coin still in the wallet at the finish
```

It never goes below zero. The three numbers are constants.

### Losing the vehicle: checkpoint restart

A run never hard-fails. The vehicle is lost when its health reaches 0 or its centre falls below the kill plane. The admin can also trigger the same restart by hand, for a vehicle stuck beyond rescue. In each case:

- The vehicle returns to the last checkpoint's spawn pose, at rest. All players are placed in the vehicle's spawn slots, unseated, with nothing in their hands.
- Vehicle fuel and health, and each player's health, are restored to their values when that checkpoint was recorded, with a floor of 50% each. Downed players are revived.
- Every prop, obstacle, pickup and coin, the wallet, and every player's inventory return to the state recorded at that checkpoint. Props are restored at rest. A prop that would overlap the vehicle's spawn pose goes to its own spawn point instead.
- A player who joined after the checkpoint gets 100 health and an empty inventory. The recorded inventory of a player who has since left is dropped at the checkpoint's spawn pose.
- The winch detaches and the hook returns to the bumper.
- One checkpoint restart is counted.

A checkpoint sits at the start of every segment. It is recorded the first time the vehicle's centre enters that segment's trigger region. The course start is the first checkpoint, recorded at run start. The last checkpoint is the most recently recorded one.

An empty fuel tank is not a loss. It disables drive until someone refuels.

### Players

Every player is a 3D character who moves freely on foot: walk, jump, sprint, crouch, slide, and stand on anything, including the roof of the moving vehicle.

Roles are not assigned.

- A vehicle has 1 driver seat and at least 5 passenger seats.
- Interact at the vehicle boards it: the driver seat if the player is at the driver door and it is free, otherwise the nearest free seat on any side. With every seat taken, nothing happens.
- Interact while seated exits beside that seat's door. If that spot is blocked, the player exits on the other side, and failing that into a spawn slot.
- With no driver, the vehicle coasts with the brake released.
- A passenger can look around and exit, nothing else.
- Players do not collide with each other.
- Players do not block or push objects by contact. The only force a player applies is the explicit push described under "Crew actions". A vehicle or prop that moves into a player shoves them out of the way.
- **Scale.** Everything at character size is multiplied by `CHARACTER_SCALE` (0.8, in `constants.ts`): the capsule (radius 0.28 m, height 1.44 m), the eye, reaches (hook, hands, board, use, heal), the camera distances, crates (0.48 m), barriers (1.6 m wide), carts, scooters, items and coins. Not scaled: speeds, jump speed, masses and forces, vehicles, the road and its hazards, the winch, the step height (0.3 m) and the ford rock. A jump (about 1.27 m) is unchanged in metres, so it is a larger part of the body than before.
- A character is a capsule body with a sphere head, in one of six fixed colours, with the player's name above it. There is no skeletal animation.

**Stances.** Walking is 4.5 m/s. All the numbers below are starting values; feel is the owner's call.

- **Sprint**: hold Shift while moving forward (`moveY` above 0) to move at 7 m/s. There is no stamina. Sprint is free and forward-only: it does nothing sideways or backwards. It is blocked while anything is in the hands, a prop or the winch hook. In the air the wish speed is the sprint speed while sprint is held with `moveY` above 0.
- **Crouch**: hold C. The capsule is 0.88 m tall instead of 1.44 m (the feet stay put) and the speed is 2.2 m/s. Crouching starts only when grounded and continues while C is held, airborne or not. Releasing C stands up only when the standing capsule fits (the test lifts by the same small amount as the overlap test, and counts the vehicle and props as well as walls and ground); until it fits the player stays crouched. Crouch is refused while a prop is held; the winch hook in the hands does not block it. Jumping while crouched is allowed only when the standing capsule fits. A crouched player in a gap lower than the standing height is not shoved or teleported.
- **Knee slide**: pressing C afresh (the press, not the hold) while sprinting starts a slide when the player is grounded, the slide cooldown is over, and the horizontal speed at the start of the tick is at least 5.5 m/s. "Sprinting" here means Shift held, `moveY` above 0 and not already crouched. A slide is refused while a prop or the hook is held. The slide moves along the direction the player had at the start at 9 m/s, held for 0.35 s, then falls linearly to the crouch speed (2.2 m/s) so that the whole slide lasts 0.8 s (about 5.7 m). The capsule is the crouched one. Steering: the move input bends the slide direction toward the wish direction by at most 0.6 rad/s. The slide ends early when the distance moved in a tick, divided by the tick, is below 1 m/s (a wall), when the player has been off the ground for more than 12 ticks (0.2 s), or when a prop is picked up. When it ends, a cooldown of 1 s runs; the player stays crouched while C is held and stands otherwise (when it fits). Jumping during a slide ends it and keeps the slide's horizontal speed through the air: the air speed is at least that take-off speed until the player lands.
- Boarding is refused during a slide. Boarding, teleports, respawns and restarts reset crouch, slide and cooldown. Crouching changes only where the aim ray starts (the lower eye, see "Conventions"); every reach (hook, hands, board, use) is defined as before. Pushing is by the move input, so a crouched push gives the same force as walking. Fall damage is unchanged, and a slide on the ground does not hurt. Held props and coins use the standing height.
- Touch has a Sprint toggle and no crouch or slide.

**Spawn slots.** Each vehicle config lists six positions around the vehicle. A slot is valid when it has ground beneath it, nothing overlapping it, and no other player (not the one being placed) standing within two body radii of it horizontally; so players placed one after another take successive slots. Whenever a rule says "beside the vehicle" or "in a spawn slot", the player goes to the first valid slot; if none is valid, to the last checkpoint's spawn pose. A run starts with all players in spawn slots.

### Player health

- A player has 100 health. It does not regenerate.
- A player is hurt by: landing from a fall above a speed threshold; being hit by the vehicle above a relative speed threshold; being hit by any prop moving above a speed threshold. Damage scales with the speed above the threshold.
- A seated player takes no damage.
- The speed of a hit is the closing speed along the contact normal, so walking into a resting vehicle or prop costs nothing. The player's own horizontal speed counts as at most a walk (4.5 m/s) for this, so sprinting or sliding into a resting body costs nothing either. One body hurts a player at most once per continuous contact; contact must break for 0.5 s before it can hurt again. The body a player stands on never hurts them.
- At 0 health the player is **downed**: they lie where they fell, cannot move or act, drop what is in their hands, keep their inventory, and take no further damage. Being downed ends a slide and clears its cooldown but leaves a crouch alone, so a player downed under a low ceiling stands up through the headroom test as soon as the standing capsule fits. A downed player still falls, can be shoved, and is subject to the kill plane.
- A teammate revives a downed player by using a health kit on them. The player gets up with 50 health.
- If nobody revives them within 30 s, the player **respawns** beside the vehicle with 50 health, and one respawn is counted. The 30 s timer pauses while a teammate's revive hold is running on them.
- If every connected player is downed at once, all respawn immediately, and one respawn is counted for each. A solo player therefore respawns as soon as they are downed.
- A player below the kill plane respawns beside the vehicle after 3 s with 50 health, and one respawn is counted. What was in their hands returns to its spawn point (the hook to the bumper).

### Hands and inventory

A player has two separate things:

| | Holds | Capacity |
|---|---|---|
| Hands | The winch hook, or one piece of light debris | One thing |
| Inventory | Jerrycans, toolboxes, health kits | Three slots, one item each |

- Picking up a jerrycan, toolbox or health kit puts it in the first free slot. With no free slot, it cannot be picked up.
- One slot is always selected.
- **Use** is a separate button from interact. Holding it for 3 s uses the selected item on its target and consumes the item.
- Drop puts the selected item on the ground at the player's feet. A seated player cannot drop.
- Boarding the vehicle while holding debris drops it; while holding the hook returns it to the bumper. Inventory stays with the player.
- When a player's slot is freed after a disconnect, their inventory items drop at a spawn slot.

| Item | Valid target | Effect |
|---|---|---|
| Jerrycan | The vehicle, in range, with fuel below 100% | Fuel +50% |
| Toolbox | The vehicle, in range, with health below 100% | Health +50% |
| Health kit | A teammate in range and near the crosshair who is downed | Revives at 50 health |
| Health kit | A teammate in range and near the crosshair with health below 100; otherwise oneself if below 100 | Health +50 |

With no valid target, use does nothing. A downed teammate is preferred over a hurt one. "In range" for a health kit is within 2 m (feet to feet) and "near the crosshair" is within 20° of the aim, measured from the eye to the teammate's centre; the crosshair is checked when the hold starts, range while it runs.

### Hold actions

Using an item and operating a pump or workbench are hold actions of 3 s.

- A hold binds to its action and target at the press.
- Progress resets when the button is released, when the target stops being valid or leaves range, or when the player is downed, seated or teleported. Moving within range is allowed.
- A completed hold needs a fresh press to start another.

### Vehicles

The admin picks the vehicle in the lobby. Vehicles differ in look and handling but carry no difficulty label.

| | Lodgy | RV |
|---|---|---|
| Size | Compact MPV | Longer, wider, taller camper |
| Mass | Baseline | About 2.5 times heavier |
| Tipping | Rolls but recovers | High centre of gravity |
| Climbing | Weak on steep slopes | Needs the winch on any real slope |
| Soft sand | Slows a lot, and still drives | Slows a lot (rolling resistance 0.15 of its weight against its engine's 0.20), but pulls away from rest and crosses it |
| Fuel burn | Baseline | About 1.5 times |
| Pushing | Crew can shove it free | Barely moves; an RV on its side cannot be righted and needs a checkpoint restart |
| Turning circle | Tight | Wide |

Common to both:

- Fuel drains in proportion to throttle. At 0 fuel, throttle has no effect.
- Health drops on impacts above a speed threshold, scaled by the speed above it, and continuously while upside down.
- A Lodgy on its side is righted by pushing. An upturned vehicle, or an RV on its side, is recovered by a checkpoint restart (any seated player can hold X for it): a cable at the front bumper cannot roll a vehicle.
- Same winch, same health pool.
- Models are recognisable shapes without any manufacturer's name or badge.

Course geometry is sized so the RV fits, and every segment is completable by the RV starting from 50% fuel.

### Crew actions

| Action | Behaviour |
|---|---|
| Push | A player walking into the vehicle or a prop pushes it. See "Push". |
| Winch | Take the hook from the front bumper, carry it to an anchor, interact to attach. Reel in or out from the driver seat or the winch box on the front bumper. See "Winch". |
| Repair, refuel | Use a toolbox or jerrycan on the vehicle, or bring the vehicle to a garage or fuel station. |
| Clear | Pick up and throw light debris. Heavy obstacles cannot be carried; they move only when enough players push together or when winched. |

- Pickups and coins are fixed per course regardless of crew size.
- A prop below the kill plane returns to its spawn point, at rest.

### Push

- The push is a horizontal force along the player's move input, applied at the contact point: the point of the object's box nearest to the player's push point, a fixed height above the feet. It applies only while the input points into the surface. A player's force is a constant, capped at the object's mass times a maximum acceleration, so light debris is not launched.
- On the vehicle, forces add per player, capped at 4 pushers' worth (the first 4 in join order among those pushing it that tick). Because the force acts at the contact point, pushing can roll a flipped vehicle upright. While the vehicle is tipped more than 45° from upright, each player's push uses a larger constant, so four players can roll a Lodgy lying on its side back onto its wheels; an upturned vehicle or a tipped RV needs a checkpoint restart, which any seated player can trigger by holding X (see Stuck vehicle).
- A player standing on an object applies no push to it.
- A heavy obstacle is locked in place. It unlocks only while enough players push it at once, or while the cable attached to it is taut. The count is 1 when one player is connected, 2 for 2–3 connected players, 3 for 4–6, and follows the players currently connected. The vehicle cannot shove a locked obstacle. A heavy obstacle never rotates: unlocked, it slides.

### Winch

The cable is force-based. There is no physics joint.

- The hook rests on the front bumper. While a player holds it, the cable pays out freely up to 30 m (the rope is drawn red from 26 m as a warning). A hook carried beyond that is pulled from the player's hands and drops.
- The hook attaches to an anchor: a marked static anchor, or the anchor point that every heavy obstacle has.
- Attaching sets the cable length to the current distance between hook and bumper.
- A slack cable has no effect. A taut cable pulls its two ends together with a spring-and-damper force, capped at the maximum winch force. Under a load above the cap the cable stretches; it never breaks.
- The maximum winch force is a fixed fraction of the vehicle's weight, and the cable's stiffness and damping scale with the vehicle's mass, so both vehicles winch up the same slopes at the same speed.
- Reeling in shortens the cable at a constant speed, down to a minimum length. The cable does not shorten while its tension is at the cap. Reeling out lengthens it, up to 30 m.
- Attached to a static anchor, reeling in pulls the vehicle. Attached to a heavy obstacle, it drags the obstacle toward the vehicle if the vehicle is braked or heavier.
- The winch alone stalls on a steep enough slope; throttle and pushing add to it.
- The driver can reel, and so can a player on foot within interact range of the winch box. If both reel at once, the driver's input wins.
- Interact at the attached anchor detaches the hook into that player's hands. Interact at the winch box while the hook is attached releases it and returns it to the bumper.
- A hook lying on the ground can be picked up. Reeling in retracts it to the bumper. It retracts by itself if it lies more than 30 m from the bumper.
- If the obstacle the hook is attached to is reset by the kill plane, the hook detaches and returns to the bumper.
- The cable is drawn as a rope from bumper to hook. It collides with nothing.

### Coins and shops

- Coins are floating collectibles, many of them placed off the easy path: on a ledge, behind an obstacle, across a gap.
- A player on foot who is not downed collects a coin by touching it. No button is needed.
- Coins go into one wallet shared by the crew.
- A shop stands at every fuel station. A player on foot interacts with the counter to open the shop menu and buy a jerrycan, a toolbox or a health kit, which goes into their inventory. Buying needs enough coins, a free slot, and the player within range of the counter. Prices are constants.
- Each coin left in the wallet at the finish takes 5 s off the final time, so spending is a choice.

### Service stops

A segment may contain service stops. Each has a marked parking zone and a point a player operates on foot.

| Stop | Use | Effect |
|---|---|---|
| Fuel station | With the vehicle's centre in the zone and fuel below 100%, a player holds interact at the pump for 3 s | Fuel to 100% |
| Garage | With the vehicle's centre in the zone and health below 100%, a player holds interact at the workbench for 3 s | Vehicle health to 100% |

Stops are free and can be used any number of times.

### Side objectives

Each course awards up to three stars, shown on the results screen only:

1. Finish with no checkpoint restart.
2. Finish with a final time under the course's target time, set in the course data.
3. Collect every coin on the course. A course with no coins earns this star.

A run in which an admin tool was used (see "Lobby") earns no stars and is marked as assisted on the results screen.

### Conditions

The admin picks the time of day and the weather in the lobby. They apply to the whole run.

| Setting | Values | Effect |
|---|---|---|
| Time of day | dawn, midday, sunset, night | Visual only: sun angle, sky and light colour. At night the vehicle's headlights are on and each player carries a small light. |
| Weather | clear, rain, sandstorm | Rain multiplies tyre grip on every surface by a constant below 1 and shows rainfall. A sandstorm limits how far players can see with fog and has no physical effect. |

Defaults are midday and clear.

### Courses and segments

A course is an ordered list of segments. A segment is a reusable piece of route with configurable obstacles. Each declares an entry and an exit (position, heading, elevation), and the course builder places each segment's entry on the previous one's exit. Courses in spec 1 are a single road with no branching.

Segment types in spec 1:

| Type | Content | Parameters |
|---|---|---|
| `road` | Plain road, optionally curved or sloped | length, curve, slope, light debris count, hazards (`gates`, `crateWall`, `roadblock`) |
| `alley` | Narrow walled street cluttered with crates, carts, parked scooters | length, clutter density |
| `sand` | Soft sand between palm trees; the vehicle slows down | length, palm (anchor) count |
| `ford` | Shallow rocky riverbed, slow and fuel-hungry | width, rock count |
| `bank` | Short steep earth or gravel bank | height, gradient, anchor count |
| `pit` | A flat approach, a descent, a flat floor, a climb and a flat exit; the exit may be steeper than the descent | depth, gradient (descent), optional gradientOut (at most 33 degrees), floor (at least 4 m), anchor count |
| `roadworks` | Road blocked by heavy obstacles and barriers | length, obstacle count |

Any segment may also place pickups, anchors, service stops and coins.

Surface types affect tyre grip and rolling resistance: road, sand, riverbed, gravel. A surface is a property of a ground collider; the wheel takes the surface of the collider under it. Surfaces do not affect players. Water in a ford is visual only, with no buoyancy or current.

**Courses are inspired by real routes.** Each follows a real route's general direction and landmarks in order, heavily compressed, and is handmade from segments. Nothing is generated from map data. The owner's real start point lies east of Marrakech; its coordinates are not stored in the repository.

| Course | Route | Spec |
|---|---|---|
| 1 | From the start point west to Marrakech airport: rural track, palm grove, an oued, the city's edge, the airport road. Flat terrain. About 10 minutes. |

The campaign's course is now `marrakech` (step 27): the real driving route from the villa to Marrakech airport, about 21.4 km as built (224 segments, generated from the route stored as local metres in `marrakech.route.ts`; route data from OpenStreetMap contributors, ODbL, credited in `CREDITS.md` and the lobby). Sand, an alley, two roadworks, a ford and a bank are inserted on straights; the step 25 hazards sit on five segments; 19 fuel stops (gaps up to 1.29 km) and 5 garages. The target time is 30 minutes. `airport` (2.6 km) stays as a short practice course. The minimap shows a 600 m window around the player on routes over 3 km. Step 28a adds, on straights and clear of stops and hazards, three hills (a 60 m climb and descent at 8 degrees, both vehicles pass), one big hill (14 degrees with boulder anchors on the climb, the RV cannot climb it without the winch), four shallow pits (0.6 m deep, both vehicles drive through) and two deep pits (2 m deep, descent 15 degrees, exit 28 degrees, six boulders on the exit: the RV is trapped and needs the winch with full throttle while reeling; the Lodgy drives out in about 6 s). 1 |
| 2 | To the Ourika valley | 2 |
| 3 | Into the Atlas | 2 |

Course 1 uses every spec 1 segment type and has one fuel station with its shop and one garage. Anchors are palm trunks, boulders and stone milestones, each visibly marked. Palette: ochre walls, red earth, green palms.

The landmarks, the segment list, and all lengths, gradients and counts for course 1 were first set without the owner (decision D-C1 in `ROADMAP.md`), from this description and measurements of both vehicles; the owner adjusts them after playing it. The list is data in `packages/shared/src/courses/airport.ts`.

### Collision

Collision stays simple throughout:

- Ground is one or more heightfields or boxes per segment. Walls, props, obstacles and vehicles use boxes; players use capsules. No mesh colliders.
- Pickups and dropped items are dynamic boxes that collide with static geometry only.
- The winch cable collides with nothing.

## 2. Architecture

### Repository

npm workspaces, TypeScript throughout.

| Package | Responsibility | Depends on |
|---|---|---|
| `shared` | Simulation, vehicle and course data, message types, constants | `@dimforge/rapier3d-compat` |
| `server` | Rooms, lobby, simulation loop and snapshots (`room` layer); WebSocket transport and static serving (`node` adapter) | `shared`, `ws` (adapter only) |
| `client` | Rendering, input, audio, HUD, lobby, interpolation, prediction | `shared`, `three`, Vite |

### Conventions

Every package follows these, so that code written separately agrees.

- Units: metres, seconds, kilograms, radians.
- Axes: right-handed, +Y up. Forward is −Z and right is +X in a vehicle's or player's local frame.
- Yaw: rotation about +Y. Yaw 0 faces −Z; positive yaw turns left. Pitch: positive looks up.
- Compass: in the world frame, north is −Z and east is +X (the sun rises in the east; the HUD compass uses the same).
- A player's aim is a ray from the eye above the player's position, along yaw and pitch. The eye is 1.28 m above the feet standing and 0.76 m crouched or sliding, the same on the server and the client. The server and the client compute it the same way; the camera's actual position plays no part.
- "In range" of a box-shaped object (vehicle, obstacle, counter) is measured to the nearest point of the box, not its centre.
- The simulation tick is fixed at 1/60 s on the server and in client prediction. The client advances its simulation with a fixed-step accumulator, independent of frame rate, with at most 5 catch-up steps per frame.
- Players, props, anchors, seats, stops and coins have string ids that are stable for a run. Ids of things created mid-run come from a counter, never from randomness.
- Every tuning number comes from `constants` or a vehicle config. No tuning literals elsewhere.
- The simulation uses no randomness and no wall clock.
- TypeScript strict mode, ES modules.
- UI text is in English. Player-supplied text is inserted as text, never as HTML.

### `shared`

The simulation is a pure module with no network or rendering code. The caller initialises Rapier and passes it in, so `shared` never loads WebAssembly itself.

```ts
const world = createWorld(rapier, { courseId, vehicleId, weather? }, builtCourse?);   // weather defaults to clear (rain multiplies tyre grip by RAIN_GRIP); the optional course replaces the id's, for tests
world.addPlayer(id);               // a new player at 100 health, or a held entry restored (a downed one rejoins as a counted respawn)
world.teleportPlayer(id, pos);     // places a player; used by tests and checkpoint restarts
world.step(inputsByPlayer);        // advances one fixed tick; returns the tick's events
world.buy(playerId, item);         // shop purchase; returns 'ok' or 'cannot_buy'; the room sends `error cannot_buy` to that client, and the page shows it in the shop menu, never on the home page
world.restartCheckpoint();         // the admin's manual restart; not an admin tool
world.adminTool(tool);             // 'skipCheckpoint' | 'refill'; returns whether it did anything, and marks the run assisted when it did; a skip also returns a carried prop to its spawn
world.recordStart();               // re-records the course start with the players present (the room calls it at start)
world.removePlayer(id, mode);      // 'leave' drops the inventory; 'hold' keeps health, downed and inventory for a rejoin
world.forgetHeld(id);              // a held slot expired or was kicked: its inventory drops at a spawn slot (removePlayer(id, 'leave') on a held id does the same)
world.snapshot();                  // serialisable state, including `assisted`
world.status();                    // { state: 'running' | 'won', elapsed, restarts, respawns, wallet, coinsCollected, coinsTotal, finalTime, assisted }

const predictor = createPredictor(rapier, builtCourse, vehicleConfig);   // used by the client only
predictor.setVehicle(pos, rot);    // positions the vehicle stand-in
predictor.setProps(props);         // creates, moves or removes prop stand-ins by id; props held by a player are left out
predictor.stepPlayer(state, input, previousJump) // returns the next player state; the press is jump && !previousJump
```

Restarting the course is not a world operation: the server discards the world and creates a new one.

`skipCheckpoint` moves the vehicle and crew to the next checkpoint's spawn pose and records that checkpoint with the current state. On the last checkpoint it does nothing. `refill` sets vehicle fuel and health to 100%.

One file per concern:

- `constants` — every tuning number. Starting values are set in each step's plan and tuned by play.
- `vehicles` — one config per vehicle: dimensions, mass, centre of gravity, engine force, grip, fuel burn, seat and door positions, spawn slots, winch mount
- `vehicle` — Rapier raycast vehicle driven by a config; surface grip, weather grip, fuel, health, seats. No per-vehicle branches.
- `player` — capsule character controller, hands, push, respawn
- `health` — player damage, downed state, revival, respawn timers
- `inventory` — slots, selection, pick-up, drop, item use
- `holds` — hold-action binding, progress and cancellation
- `winch` — hook, anchor attach, force-based cable, reel
- `interact` — resolves what interact does for a player this tick
- `props` — light debris, heavy obstacles, pickups, dropped items
- `stops` — fuel stations, garages, shops
- `coins` — coins and the wallet
- `segments` — one builder per segment type
- `courses` — course definitions as data, and the builder that chains segments
- `checkpoints` — records state at each checkpoint, performs the restart
- `rules` — win condition, vehicle-lost detection, timer, final time and stars
- `protocol` — message types and validators

**Built course.** A `courseId` resolves to a `BuiltCourse`. It holds:

- ground colliders with their surfaces; wall colliders
- props, pickups, anchors, service stops and coins, each with an id, a `kind` that tells the client what to draw (crate, cart, palm, boulder and so on) and a spawn pose
- decor: things with a `kind` and a pose but no collider
- checkpoints, each with a trigger region and a spawn pose
- the route as a 2D line for the minimap
- the finish volume, the kill plane and the target time

This type is the contract between course data and everything else: the server simulates it and the client both renders it and builds its prediction world from it. Until the segment system exists, the test ground is a hand-written `BuiltCourse` with at least two checkpoints and a finish; the segment builder later produces the same type.

**Tick order.** Each tick runs in this order:

1. Read inputs; resolve interact, use, drop and reel
2. Apply forces: drive, push, cable
3. Physics step
4. Move characters
5. Collect coins touched this tick (step 10)
6. Apply damage
7. Kill-plane resets for players and props
8. Record a checkpoint if one was entered
9. Check for a lost vehicle and restart if so
10. Check for a win, only if the vehicle was not lost this tick

When two players compete for the same thing on one tick, players are processed in the order they joined the run and the first wins.

**Player physics.** A player is a kinematic character controller. The engine's controller neither carries a character on a moving body nor pushes one out of a body that moved into it; `player` implements both.

- While a player stands on a body, their position is kept in that body's local frame and re-derived each tick before their own movement is applied. They slide off only past the maximum slope angle.
- A player who leaves a moving body, by jumping or walking off, keeps that body's horizontal velocity at that point while airborne.
- A player overlapped by a moving vehicle or prop is moved out horizontally, along one line away from that body's centre, and never into static geometry or through it: the line from the old position to the new one crosses no static collider. If no free position is found, the player goes to a spawn slot.
- Roof guard: when a player's feet are inside the vehicle's footprint and no deeper than the player step height below its roof face (the vehicle's up within 45° of world up), the player is lifted onto the roof instead of being shoved sideways. A rolled vehicle's up-facing side has no guard.
- Dynamic bodies ignore players in the physics solver, and wheel raycasts ignore players.

**Interact resolution.** `interact` exposes a pure function from a player's state and the nearby world to the action interact would perform. The server uses it to act; the client uses it on snapshot state to show the prompt. Among in-range targets of the same priority, the one closest to the player's aim wins, meaning the smallest angle from the aim ray.

Interact priority, highest first:

1. Exit seat (if seated)
2. Attach hook to anchor (if holding the hook)
3. Operate a service stop: a pump or workbench whose conditions are met, or a shop counter
4. Release what is in the hands: light debris is thrown along the aim; the hook is dropped at the player's feet
5. Whichever of these is closest to the aim: take the hook from the bumper or the ground; pick up debris or an item; detach the hook at its anchor; release the attached hook at the winch box; board the vehicle

### `server`

The `room` layer holds all room, lobby and simulation-loop logic. It talks to an abstract connection (send, close, on message) and takes its clock, timer and random source as parameters. It imports nothing from Node or `ws`. The `node` adapter wires it to HTTP static serving, `ws` sockets, real timers and an initialised Rapier.

- **Rooms.** A room's identity is a unique noun, drawn at creation from a built-in word list and unused by any live room (for example `tagine`, `camel`). If the list is exhausted, a number is appended. No noun matches a static file path. The room lives at `/<noun>`.
- **Phases.** `lobby → playing → results → lobby`.
- **Players.** Up to 6 slots. Display names are trimmed, 1–16 characters, contain no control, format, private-use, unassigned or line/paragraph-separator characters, and are unique within a room ignoring case; a taken name is refused.
- **Player id.** The server assigns each slot a `playerId`, stable across a rejoin, and tells the client in `welcome`.
- **Session token.** Each client generates a random token with `crypto.getRandomValues` (not `randomUUID`, which browsers disable on plain `http` LAN addresses) and keeps it in session storage. Each tab is therefore a separate player, and a reload keeps its identity. A token is never sent to any other client.
- **Held slots.** When a player disconnects, their character is removed at once: what was in their hands drops, and a vacated driver seat frees. The slot (name, colour, admin status, health, downed state, inventory) is held for 30 s, still counts toward the 6, and keeps its name reserved.
  - Rejoining with the same token within 30 s restores the slot. The player spawns beside the vehicle with the health they had. If they were downed, the rejoin is a respawn: 50 health, one respawn counted.
  - After 30 s the slot is freed and its inventory drops at a spawn slot.
  - A `join` whose token matches a slot that is still connected replaces the old connection at once.
- **Admin.** The player who creates the room. When the admin's slot is freed, the role passes to the longest-connected player; if nobody is connected, to the next player who joins.
- **Liveness.** The server sends each connection a `ping` message every 2 s, which the client answers with `pong`, and treats 6 s without any message from a connection as a disconnect. When the server's own timer finds more than 1 s since its previous run (an event-loop stall), the excess is credited to every connection last heard before that run, so a stall alone drops nobody.
- **Simulation.** Each room in `playing` owns one world, stepped at a fixed 60 Hz. A snapshot is broadcast at 20 Hz. The loop runs at most 3 catch-up steps per iteration and discards the remaining backlog. A room with nobody connected is paused: its world keeps its state, and no ticks are owed when someone returns.
- **Inputs.** The server keeps a queue of at most 8 inputs per player, dropping the oldest on overflow. It consumes one per tick, or two when the queue holds more than 3. With an empty queue it repeats the last input, which never counts as a new button press. After 15 ticks with no new input it substitutes a neutral input: axes at 0, buttons released, reel 0, aim unchanged.
- **Rate limit.** Messages beyond 120 per second from one connection are dropped. A connection that stays over the limit for 3 s is closed, and so is one over the limit in 4 one-second windows within 8 s (a client alternating floods and quiet seconds).
- A room is deleted when it has had no connected players for 60 s; a room that nobody but its creator ever joined (by token) is deleted after 30 s.
- **Room limit.** The server holds at most 50 rooms. A `create` beyond that is refused with `server_full`, and so is a sixth successful `create` from one client address within 60 s. The node adapter also caps WebSocket connections at 360 in total and 12 per address (refused with HTTP 503 before the upgrade), drops a socket whose send buffer exceeds 1 MiB, and frees a dropped peer's slot within 1 s. Behind the Cloudflare Tunnel (`TRUST_PROXY=1`), the address is `CF-Connecting-IP` when the socket peer is loopback.
- **Failures.** A connection whose socket throws is dropped. A room whose simulation throws is closed and its players are disconnected. Both are logged, and the other rooms carry on. Each source of failure reports at most once per 10 s, with the count of reports suppressed since its last one.
- No database.
- One process serves the built client and the WebSocket on the same port (default 3000). Any path that is not a static file serves the client, which reads the noun from the URL. The WebSocket endpoint is `/ws`.

### Lobby

The lobby is a waiting room.

- Everyone sees the room link, the player list with ready states, and the selected course, vehicle, time of day and weather.
- Each player has a Ready toggle. Ready states reset whenever the room returns to the lobby. Changing the configuration does not reset them.
- The admin selects the course, vehicle, time of day and weather, and can start once every other connected player is ready. The admin needs no ready state and may start alone.
- The admin can kick a player in any phase. A kicked player returns to the home page, does not reconnect automatically, and may rejoin by the link.
- A player who opens the link during `playing` joins the run directly, if a slot is free, and spawns beside the vehicle. A player who joins during `results` sees the results.
- **In-run menu.** During `playing`, every player can open a menu (Esc, or a button on touch). For the admin it offers: restart from the last checkpoint, restart the course, return to the lobby, kick, and the admin tools.
- **Admin tools.** Skip the vehicle and crew to the next checkpoint, or refill the vehicle's fuel and health. These exist for testing courses. Using either marks the run as assisted.

**Home page and joining.**

- The home page (`/`) asks for a display name, pre-filled from the last one used, and offers "Create room" and a field to enter a room's noun.
- Creating a room happens over the socket; the client then changes the address to `/<noun>` without reloading.
- Opening `/<noun>` directly asks for a display name, then joins.
- A noun with no live room shows an error with a link to the home page.

### Protocol

JSON over WebSocket.

Client to server:

| Message | Allowed | Refusal |
|---|---|---|
| `create { name, token }` | Not yet in a room | `bad_message`, `server_full` |
| `join { room, name, token }` | Not yet in a room | `unknown_room`, `room_full`, `name_taken` |
| `ready { ready }` | `lobby` | `bad_phase` |
| `configure { courseId, vehicleId, timeOfDay, weather }` | Admin, `lobby` | `not_admin`, `bad_phase` |
| `kick { playerId }` | Admin, any phase | `not_admin` |
| `start {}` | Admin, `lobby`, all others ready | `not_admin`, `bad_phase`, `not_ready` |
| `restartCheckpoint {}`, `restartCourse {}`, `adminTool { tool }` | Admin, `playing` | `not_admin`, `bad_phase` |
| `toLobby {}` | Admin, `playing` or `results` | `not_admin`, `bad_phase` |
| `next {}` | Admin, `results`, not the last course | `not_admin`, `bad_phase` |
| `buy { item }` | `playing`, player on foot within range of a shop counter | `cannot_buy` |
| `input { … }` | `playing` | Ignored in other phases |
| `pong {}` | Any time, in answer to `ping` | Never refused |

Every message is validated for shape and its numbers are clamped. A malformed message gets `bad_message` and is dropped.

`input { seq, moveX, moveY, yaw, pitch, jump, interact, use, reel, slot, drop, reset?, sprint?, crouch? }`. The client sends one per simulation tick, with `seq` starting at 1 and increasing by 1.

| Field | On foot | As driver |
|---|---|---|
| `moveX`, `moveY` in [−1, 1] | Strafe and forward, relative to `yaw` | Steer and throttle; negative `moveY` reverses |
| `yaw`, `pitch` | Aim | Camera only (no effect on the vehicle) |
| `jump`, boolean, held | Jumps on the press | Brakes while held |
| `interact`, boolean, held | Instant actions fire on the press. Pump and workbench are hold actions. | Exits on the press |
| `use`, boolean, held | Hold action: uses the selected item | No effect |
| `reel`: −1 out, 0, 1 in | Works within range of the winch box | Works always |
| `slot`: 0, 1 or 2 | Selected inventory slot | Same |
| `drop`, boolean | Drops the selected item on the press | No effect |
| `sprint?`, boolean, held (absent means false) | Sprint, see "Players" | No effect |
| `crouch?`, boolean, held (absent means false) | Crouch, and with a sprint the slide | No effect |
| `reset?`, boolean, held (absent means false) | No effect | Any seated player: held 1.5 s while the vehicle is tipped, out of fuel or stuck, it restarts from the last checkpoint |

`sprint` and `crouch` are levels, not taps: when the server skips an input they are not ORed across the skipped ones (only taps such as `jump` are). The press that starts a slide is read from two consecutive inputs, as for `jump`.

Server to client:

- `welcome { playerId, room }` — to the joining connection only, after a successful `create` or `join`
- `lobby { room, phase, players, adminId, courseId, vehicleId, timeOfDay, weather }` — to everyone, in every phase, whenever any of it changes. Each player entry has `playerId`, `name`, `colour`, `ready`, `connected`.
- `snapshot` — see below
- `event { kind, tick, playerId?, pos? }` — to everyone, for one-off moments that drive sound and HUD. Kinds: `impact`, `checkpoint`, `vehicleLost`, `pickup`, `use`, `hookAttach`, `hookDetach`, `coin`, `buy`, `hurt`, `downed`, `revive`, `respawn`.
- `results { courseId, vehicleId, timeOfDay, weather, elapsed, restarts, respawns, wallet, coinsCollected, coinsTotal, finalTime, stars, assisted, campaignTotal? }`
- `ping {}` — to every connection, every 2 s
- `error { reason }` with reasons `unknown_room`, `room_full`, `name_taken`, `kicked`, `not_admin`, `not_ready`, `bad_phase`, `bad_message`, `server_full`, `cannot_buy`

**Snapshot.**

```
snapshot {
  tick, ackSeq, full,
  vehicle { pos, rot, linvel, throttle, steer, fuel, health, resetReady? },   // resetReady: true while a seated player could reset; absent means false
  players [ {
    playerId, pos, yaw, health,                         // health 0..100, rounded down
    walk: { x, z }, carry: { x, z }, vy, grounded,   // the walking state the predictor resets to
    stance?: 'crouch' | 'slide',                      // absent means standing
    slide?: { ticks, cooldown, air, dirX, dirZ, launch? },   // present only while a slide, its cooldown or a slide jump's launch speed runs
    downed:  seconds left | null,
    seat:    seatId | null,
    ground:  { bodyId, localPos } | null,
    hands:   'hook' | propId | null,
    inventory: [item | null, item | null, item | null], slot,
    hold:    { action, targetId, progress } | null
  } ],
  props [ { id, kind, pos, rot } ],
  cable { state, holderId, anchorId, hookPos, length, reel },
  coinsLeft [ coinId ], wallet, coinsCollected, coinsTotal,
  elapsed, checkpoint, checkpointCount, restarts, respawns, won, assisted
}
```

- `ackSeq` is the last input sequence number the server consumed for the receiving client, or 0 before any. Everything else is identical for every client.
- `walk`, `carry`, `vy` and `grounded` are the player's walking state, sent for every player so that the snapshot stays identical for every client. The client resets its predicted player to them.
- `stance` is `crouch` or `slide`; absent means standing, and a value this version does not know is read as standing. `slide` is sent for every player so that the snapshot stays identical for every client: `ticks` is the whole ticks left in the slide, `cooldown` the whole ticks left of the cooldown, `air` the ticks spent off the ground during the slide, `dirX` and `dirZ` the slide direction, and `launch` (present while greater than 0) the take-off speed of a slide jump. The counts are whole non-negative integers and the rest finite, so that the predictor and the server agree exactly. Remote players are drawn lower when crouched and tilted back when sliding.
- `seat` and `ground` are separate: a seated player has a `seat`; a player standing on the vehicle, a prop or an obstacle has a `ground`.
- `cable.state` is `stowed`, `held`, `ground` or `attached`.
- `won` is true once the vehicle's centre has entered the finish; it lets the page show the finish before the results message exists (step 8, K7). `checkpoint` is the index of the last recorded checkpoint; the page shows it as index + 1.
- `props` lists only props that moved since the previous snapshot. A snapshot with `full` set lists every prop; it is sent to a client when it joins and to everyone after any restart or skip.

Binary encoding is deferred until snapshot size is measured as a problem. Snapshot size is measured when course 1 is built.

### `client`

- `net` — socket, reconnect, snapshot buffer, interpolation 100 ms in the past for the vehicle, other players, props and cable
- `prediction` — predicts the local player's walking, jumping, crouching and sliding only
- `input` — a device-agnostic layer producing the `input` message fields. Two sources: keyboard and mouse, and touch. The source is chosen by pointer capability at load.
- `render` — Three.js scene built from the `BuiltCourse`; low-poly meshes built in code, chosen by each element's `kind`; lighting, sky, fog and rain from the room's conditions
- `audio` — Web Audio playback of sound effects, driven by snapshots and `event` messages
- `ui` — plain HTML and CSS overlay for home, lobby, HUD, shop menu, in-run menu, reconnect overlay and results. No UI framework.

### Prediction

- Only the local player's walking, jumping, crouching and sliding are predicted. The server and the predictor run the same `stepWalk`, so stance, slide and speed agree; the reconciler tracks the crouch press beside the jump press when it replays inputs. Picking up, inventory, health, seating, pushing and everything else come from the server.
- The client holds a prediction world built by `createPredictor` from the course's static colliders, plus stand-ins for the vehicle and props. The vehicle's stand-in is a dynamic box with the vehicle's half extents and gravity scale 0, not a kinematic or fixed one: the walking controller's autostep excludes only dynamic bodies, so a kinematic box could be stepped onto, and a fixed one is not found by queries after being moved. It is moved with `setTranslation` and `setRotation` from the latest snapshot, not the interpolated one, followed by two zero-length physics steps (in Rapier 0.21 the first zero step after moving a body removes its collider from the old place and the second inserts it at the new one). The headroom test for standing up runs against these stand-ins, so it sees the vehicle and props as the server does. Other players are not in it.
- On each snapshot the client resets the local player to the server's state and replays the inputs after `ackSeq`. Small corrections are smoothed and large ones snap; both thresholds are constants. The client records every input it sends, also while prediction is off; when prediction resumes it replays everything after `ackSeq`. The drawn position is blended between the previous and the current predicted position by the fixed stepper's alpha, plus the fading correction.
- Prediction is on while the latest snapshot reports the local player unseated with `ground` null, and off otherwise; turning it on resets the predictor to the snapshot's state. It is off while the player is seated, downed, or standing on the vehicle or a heavy obstacle. The player is then drawn from the snapshot, relative to that body. Input lag while riding on the roof is accepted.
- Mismatches next to a moving vehicle are expected and are absorbed by the correction smoothing.

### Menus

- The shop menu and the in-run menu exist only on the client. Interact at a shop counter opens the shop menu; the server does nothing with that press.
- While a menu is open, pointer lock is released and the client sends neutral input.
- **Tutorial.** A short card sequence (Move and jump, Sprint crouch and slide, Board and seats, Drive, The winch, Items, Reset a stuck vehicle, Help) with Next, Back and Skip; its key caps and key words are built from the controls table, so they cannot drift, and on touch it uses the touch button names. It opens by itself the first time the player reaches the lobby in a page load, unless the flag `lodgy.tutorial.done` is set in `localStorage` (read and written in try/catch; if storage fails it shows once per page load). Finishing or skipping sets the flag; Escape counts as Skip. It can be opened again from a Tutorial entry in the lobby and in the run menu. While it is open the game takes no input, like any menu.
- The shop menu closes on Esc, on leaving the counter's range, on being downed, and on any teleport.

### Camera and rendering

- On foot, the camera sits behind and above the player's shoulder and moves closer when a wall is in the way. Seated, it orbits the vehicle. For now the seated camera is the vehicle follow camera behind the vehicle. The eye on foot eases between the standing and crouched heights (0.1 s).
- An optional first-person prototype is on with `?fp` in the URL or `localStorage` `lodgy.fp` = `1`. It is off by default and not listed in the controls. Third person stays the default; the findings and the recommendation are in `docs/research/first-person.md`.
- If the WebGL context is lost, as iOS does to background tabs, the client reloads the page and rejoins with its session token, without showing the name form. It reloads at most once per 10 s; a second loss within that time returns to the home page with "The 3D view was lost. Reload the page to continue."

### HUD

| Position | Content |
|---|---|
| Top centre | Compass: a heading strip with a marker toward the next checkpoint, or the finish after the last one |
| Top left | Minimap: the course's stylised route, the vehicle, players, service stops and checkpoints |
| Top right | Vehicle fuel and health, timer, wallet; while seated, a seat chip (`#hud-seat`) with the seat's label |
| Bottom left | The player's own health |
| Bottom right | The three inventory slots, with the selected one highlighted |
| Centre | A small cross-shaped crosshair, with the interact or use prompt and hold progress beneath it |
| Under the compass | On boarding, a toast (`#hud-seat-toast`) for 2.5 s: "You are the Driver" or "You are in the rear left seat" |

Seat labels: `driver` Driver, `seat1` Front passenger, `seat2` Middle left, `seat3` Middle right, `seat4` Rear left, `seat5` Rear right. On boarding, a translucent ring in the player's colour marks their seat in the world for 2 s, fading out. Names do not float over seated players: the seat chip and the ring cover it.

A downed teammate shows a marker above them with their remaining time, visible through walls. A downed player sees their own timer in the centre.

On touch devices the joystick floats over the left half and the action buttons sit beside the inventory slots. The arrangement above was built without a mock-up pass (decision D-HUD1 in `ROADMAP.md`) and is adjusted at the owner's sign-off. The HUD was then restyled (decision D-HUD2): translucent panels, icons, key-cap prompts and a circular minimap, with the same positions. A plain text debug overlay with the same values stays, hidden unless `F3` is pressed or `localStorage` `lodgy.debug` is `1`.

### Sound

Effects only: engine loop, impact, winch loop, hook attach, pickup, item use, coin, purchase, hurt, downed, revive, checkpoint, vehicle lost, rain loop, UI click, win. Files are CC0, from OpenGameArt (Kenney's packs mirrored there, and other CC0 authors; kenney.nl itself was unreachable from the build environment), in `packages/client/public/sounds/` with their sources in `LICENSE.md`. One-shots are MP3; the three loops are mono WAV so they repeat without a gap. Engine pitch follows throttle and speed. Audio unlocks on the player's first tap, click or key (on `pointerup`, `touchend`, `click` or `keydown`, as iOS requires) and resumes after an interruption. M or the in-run menu mutes it.

### Controls

| Action | Desktop | iPhone |
|---|---|---|
| Move / steer | WASD | Floating joystick: it appears under the left thumb wherever it touches the left half of the screen |
| Look | Mouse (pointer lock) | Drag on right half of screen |
| Interact | E | Button |
| Use item | F | Button, shown only when the selected item has a valid target |
| Jump / brake | Space | Button (label changes when seated) |
| Sprint | Shift (hold, moving forward) | A Sprint toggle button |
| Crouch, slide | C (hold; press while sprinting to slide) | None: touch has no crouch or slide |
| Throttle, reverse | W, S when driving | Joystick up, down when driving |
| Reel in, out | Q, R | Two buttons, shown only when reeling is possible |
| Reset a stuck vehicle | X (hold 1.5 s) | A button on touch, shown only when it can act |
| Controls help | H | A `?` entry in the run menu on touch |
| Select slot | 1, 2, 3 | Tap the slot |
| Drop item | G | Long-press the slot |
| Menu | Esc | Button |

### iPhone specifics

- The joystick and buttons are written by hand, with no library. Joystick and look-drag work at the same time (multi-touch).
- Landscape only; portrait shows a "rotate your phone" prompt.
- HUD and buttons respect safe-area insets.
- A web app manifest with its start address set to `/`, and Apple meta tags, allow "Add to Home Screen" for a fullscreen view, since iPhone Safari offers no fullscreen API to pages.
- Device pixel ratio is capped at 2 and shadows are disabled on touch devices.
- Double-tap zoom, text selection and pull-to-refresh are suppressed on the game canvas.

### Running and hosting

Hosting uses Cloudflare.

- **During development and for play sessions:** the server runs on the owner's machine. Players on the same Wi-Fi open `http://<LAN-IP>:3000/<noun>`. Players elsewhere use a Cloudflare Tunnel, which gives the local server a public `https` address while it runs. `npm run share` starts the server with `TRUST_PROXY=1` behind a quick tunnel (no account; `cloudflared` must be installed) and prints the address.
- **Always-on hosting** is decided at the last build step, between Cloudflare Containers (the same Node process in a container) and Workers with Durable Objects (one object per room). The choice is made then, against the platform's limits and pricing at that time. A Durable Object adapter, if chosen, replaces only the `node` adapter.

Hosting on Cloudflare is built (decision D-HOST1 in `ROADMAP.md`, setup in `docs/hosting-cloudflare.md`): a Worker plus one Durable Object per room, using the same room layer. The client derives the WebSocket URL from the page origin (`ws` for `http`, `wss` for `https`). The server runs from its TypeScript source with `tsx`; there is no server build step.

## 3. Error handling

- **Bad input.** Covered by the protocol table: validation, clamping, refusal reasons and the rate limit.
- **Join failures.** Unknown room, full room and taken name each return a specific error that the client displays.
- **Refused purchase.** Too few coins, no free slot, or no shop counter in range returns `cannot_buy`.
- **Disconnects.** The client shows a reconnecting overlay and retries after 0.5, 1, 2, 4 and then every 8 s, for 30 s from the drop, rejoining with its session token. A socket that does not open within 8 s counts as a failed attempt, and the page itself closes a connection that has heard nothing from the server for 6 s. It gives up at most 38 s after the drop. It does not retry after `kicked` or `replaced` (the server sends `replaced` to a connection whose slot another connection with the same token took over, as a duplicated tab does: "This room was opened in another tab."), or after a refusal (`unknown_room`, `room_full`, `name_taken`); a rejoin that comes back as a different player (the slot expired or was kicked) is treated as a refusal: "Your place in the room was lost." The server follows the held-slot rules.
- **Silent connections.** A connection that stops sending, such as a backgrounded iPhone, gets neutral input after 15 ticks and is dropped after 6 s.
- **Stuck vehicle.** A vehicle that is tipped, out of fuel, or has moved under 1 m in 8 s with the throttle held, and is slower than 1 m/s, can be reset by any seated player holding X for 1.5 s: a checkpoint restart with the usual penalty. The admin can still restart from the menu.
- **Physics escapes.** Handled by the kill-plane rules: players respawn, props return to spawn, the vehicle triggers a checkpoint restart.
- **Server restart.** Rooms are in memory; a restart ends all runs.

## 4. Testing

Runner: Vitest in all packages. Tests are written before the code they cover.

### Unit tests

`shared` (headless, against the real Rapier world):

- vehicle: throttle moves it; fuel drains with throttle; empty tank disables drive; impact above the threshold reduces health in proportion; upside-down drains health; grip differs by surface; both vehicle configs load and drive
- seats: driver door takes the driver seat; otherwise the nearest free seat; full vehicle refuses; exit beside the door, then the other side, then a spawn slot; boarding drops debris and stows the hook
- spawn slots: first valid slot; fallback to the checkpoint when none is valid
- stance: walk, sprint and crouch speeds; sprint needs forward input, ground and empty hands; sprint and crouch are refused while a prop is held
- slide: start rule (sprint, fresh crouch press, speed, cooldown), the speed profile, steering, early end on a wall or in the air, the cooldown, the slide jump keeping its speed through the air, the prediction agreeing with the server on a scripted sprint, crouch and slide path
- headroom: a crouched player stays crouched under a low ceiling and stands when it fits; a crouched player in a low tunnel is not shoved
- hit clamp: sprinting or sliding into a resting vehicle or prop costs 0 health
- player physics: carried by a moving body in its local frame; keeps the body's velocity on take-off; shoved out horizontally and never into a wall; contact alone moves nothing; players pass through each other
- player health: each damage source; no damage while seated; downed at 0; revive at 50; respawn after 30 s; the timer pauses during a revive hold; all downed respawn at once and each is counted; kill-plane respawn
- inventory: fills the first free slot; refuses when full; selection; drop; no drop while seated; each item's valid target, including full tank and full health being invalid; downed teammate preferred
- holds: bind at the press; reset on release, on an invalid target, on leaving range, on being downed or teleported; a fresh press is needed after completion
- winch: attaches only within range of an anchor; the pull never exceeds the force cap; the cable does not shorten at the cap; reeling in pulls the vehicle toward the anchor; minimum and maximum length; over-length hook drops; a heavy obstacle can be dragged; a grounded hook retracts, and retracts by itself beyond 30 m; release at the winch box; detach when the obstacle is reset; the driver's reel wins
- interact: priority order; the target nearest the aim wins within a priority; range is measured to the nearest point of a box
- push: applied at the contact point and only into the surface; adds per player and respects the cap; rights a flipped Lodgy; none from a player standing on the object; a heavy obstacle stays locked below the pusher count and against the vehicle
- press detection: a repeated input does not re-trigger a press
- tick order: two players taking one item on the same tick; a vehicle lost on the tick it reaches the finish does not win
- service stops: need the vehicle's centre in the zone and a gauge below 100%; restore to 100%; reusable
- coins and shop: collected by touch; not while seated or downed; shared wallet; purchase needs coins, a free slot and range; refusals
- segments: every type builds; entries and exits are consistent; a chained course has no gap or overlap at joins
- checkpoints: entering a trigger region records state once; a restart restores the vehicle, player health with its 50% floor, props at rest, coins, wallet and inventories; downed players are revived; a late joiner gets 100 health and an empty inventory; a departed player's inventory drops at the spawn; the winch detaches; one restart is counted
- admin: `skipCheckpoint` moves and records, and does nothing on the last checkpoint; `refill`; both set `assisted`; `restartCheckpoint` does not
- rules: finish volume wins; final time formula with its floor; each star's condition; assisted runs earn no stars
- weather: rain lowers grip on every surface; sandstorm and time of day change nothing in the simulation
- props: return to spawn at rest from the kill plane
- determinism: the same input sequence produces the same snapshot

`server` (against the `room` layer with a fake connection, clock and random source; no test of room logic opens a socket or waits on real time):

- rooms: unique noun allocation, create, join, `welcome`, full, taken name ignoring case, held slot counting toward the limit, rejoin by token within 30 s with health kept, a downed rejoin counted as a respawn, slot freed after 30 s with inventory dropped, a second connection replacing the first, admin handover including an empty room, kick in each phase, empty-room cleanup
- lobby: ready states, start refused until all connected others are ready, each refusal reason in the protocol table, phase transitions including `next` and the campaign total, using a two-course test campaign
- inputs: queue overflow drops the oldest; two consumed per tick above 3; neutral input after 15 ticks; silence for 6 s disconnects; a vacated driver seat frees
- message validation and the rate limit
- mid-run join, including into a full room, and a join during results
- snapshots: `full` on join and after a restart; only moved props otherwise

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
- A Lodgy on its side is righted by the stated number of pushers within a time limit, and not by one.
- The winch alone climbs a 33° slope and stalls on a 36° one, for both vehicles, without exceeding the speed and spin limits.
- Winching never produces a vehicle speed or spin above a sanity limit, including when a stalled cable is suddenly freed.
- A vehicle at rest on flat ground stays at rest for 10 s.
- A player standing on the roof of a vehicle driving at speed stays on it, and lands back on it after a jump.
- A full tank lasts within a stated range of driving time at full throttle.
- A scripted driver completes the test ground from start to finish.
- For every built course: each checkpoint's spawn pose and the vehicle's spawn slots there rest on ground, the route is continuous from start to finish, and every service stop's zone fits the RV.

### Integration tests

- **Server and protocol.** A real server on a local port and two WebSocket clients: create, join by noun, ready, start, send inputs until the scripted driver finishes the test ground, receive `results`. Also: a disconnect and rejoin mid-run, a checkpoint restart, a purchase.
- **Browser.** A Playwright test opens two pages, creates a room, joins by its URL, readies up, starts a run and asserts both receive snapshots and show every HUD element. It runs once at a desktop viewport and once at an iPhone viewport with touch emulation, where it also asserts the joystick and buttons appear. It starts at step 2 with what exists then and grows with each step.

Visuals, sound, game feel, the course's fun and real-iPhone behaviour are checked by the owner.

## 5. Build order

Each step ends in something runnable. Progress is tracked in `ROADMAP.md`. Each step gets its own plan, written when the step starts, and its own branch.

Steps 1 to 15 run on a flat test ground with a ramp, reference slopes, a sand patch, an anchor, a heavy obstacle, a few props, a fuel station with a shop, a garage, a few coins, two checkpoints and a finish. Each of these is added to the test ground by the step that first simulates it.

Since step 11 a room starts in the lobby, and the course, vehicle, time of day and weather are the admin's choice there. The campaign is `['test', 'segment-demo']` (`CAMPAIGN` in `constants.ts`) until step 16 builds the real courses.

| # | Step | Sign-off |
|---|---|---|
| 1 | Workspace scaffold. Rapier passed into `shared`. Test ground as a `BuiltCourse`. Both vehicle configs, each drawn as boxes. Drivable in one browser tab with the sim running locally. Keyboard input source. Text overlay for debugging. A throwaway experiment that finds stable starting values for the force-based cable at both vehicle masses. | Tests |
| 2 | Server: `room` layer and `node` adapter, message validation, rate limit, liveness, tick overrun. Home page with name prompt, create and join by noun, `welcome`. Snapshots and interpolation: two tabs see the same vehicle, driven by the first player's input. Playwright test begins. | Tests |
| 3 | Players on foot, simulated on the server only: movement, standing on moving bodies, shove-out, spawn slots, seats and boarding, kill-plane respawn. Shoulder camera and crosshair. The page is also opened once on an iPhone over LAN to confirm it loads, renders and receives snapshots. | Tests |
| 4 | Client prediction of walking and jumping. | Tests |
| 5 | Push, hands, light debris, heavy obstacles, prop kill plane. | Tests |
| 6 | Winch. | Tests |
| 7 | Vehicle fuel and health, vehicle damage, inventory, jerrycans and toolboxes, hold actions. | Tests |
| 8 | Checkpoints and restart, vehicle loss, win rule, timer. | Tests |
| 9 | Player health, damage, downed state, health kits, revival and respawn. | Tests |
| 10 | Service stops, coins, shops and shop menu, final time and side objectives. | Tests |
| 11 | Lobby: ready states, configuration, kick, in-run menu, admin tools, results, next course and campaign total, held slots and rejoin. Weather and time of day are selectable and carried to the run; their effects come at step 13. | Tests |
| 12 | HUD: compass, minimap, gauges, slots, prompts and downed markers. | Owner, visual check |
| 13 | Conditions: rain grip, and the visuals for time of day and weather. | Owner, visual check |
| 14 | Touch input source, floating joystick, touch UI, landscape and safe-area layout, web app manifest. | Owner, on a real iPhone |
| 15 | Segment system: the six segment builders and the course builder. | Tests |
| 16 | Course design pass with the owner, then course 1. Snapshot size is measured. | Owner, by playing it |
| 17 | The RV: mesh and handling pass over course 1 (built as a mesh and measurements; no handling constant changed). | Owner, by playing it |
| 18 | Sound effects. | Owner |
| 19 | Reconnect polish, WebGL context-loss reload, Cloudflare Tunnel setup with a documented one-command start, and the always-on hosting decision. | Owner |
