import { deepFreeze, vec3, type Vec3 } from './math';

export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;
export const GRAVITY = 9.81;
// Most simulation steps run in one frame (client) or one loop iteration (server); the rest of the backlog is dropped.
export const CLIENT_MAX_CATCHUP_STEPS = 5;
export const SERVER_MAX_CATCHUP_STEPS = 3;
// The server broadcasts a snapshot every this many ticks: 20 per second.
export const SNAPSHOT_EVERY_TICKS = 3;
// The client draws the world this many seconds in the past, between two snapshots.
export const INTERPOLATION_DELAY = 0.1;
// How many snapshots the client keeps: two seconds' worth.
export const SNAPSHOT_BUFFER_SIZE = 40;
// Fraction by which each late snapshot pulls the client's estimate of the server clock back.
export const CLOCK_OFFSET_SMOOTHING = 0.05;

// Everything at character size is its base size times this; vehicles, road, speeds, masses and forces are not scaled.
export const CHARACTER_SCALE = 0.8;

export const MAX_PLAYERS = 6;
export const NAME_MAX_LENGTH = 16;
export const PLAYER_COLOURS = deepFreeze(['#e4572e', '#17bebb', '#ffc914', '#76b041', '#a05cdc', '#f28cb1'] as const);

// Per-player input queue on the server.
export const INPUT_QUEUE_MAX = 8;
// Above this many queued inputs the server consumes two per tick to catch up.
export const INPUT_QUEUE_FAST_ABOVE = 3;
// After this many ticks with no new input the server substitutes a neutral input.
export const NEUTRAL_AFTER_TICKS = 15;

// Seconds between pings, and seconds of silence after which a connection counts as gone.
export const PING_INTERVAL = 2;
export const SILENCE_TIMEOUT = 6;
// Messages per second allowed from one connection, and seconds over the limit before it is closed.
export const RATE_LIMIT_PER_SECOND = 120;
export const RATE_LIMIT_CLOSE_AFTER = 3;
// Seconds a room survives with nobody connected.
export const EMPTY_ROOM_TIMEOUT = 60;
// Rooms the server holds at once; each one is a physics world.
export const MAX_ROOMS = 50;

// Server hardening
// WebSocket connections in total; leaves room for players still on the home page and for takeovers.
export const MAX_CONNECTIONS = 360;
// Per client address (two families at most behind one address).
export const MAX_CONNECTIONS_PER_ADDRESS = 12;
// Connections one room object accepts (6 players plus spectators and takeovers).
export const MAX_CONNECTIONS_PER_ROOM = 12;
// No valid message is anywhere near this size; larger ones close the connection.
export const MAX_MESSAGE_BYTES = 4096;
// Bytes queued to one socket before it is dropped as a reader that cannot keep up.
export const MAX_SEND_BUFFER = 1048576;
// `create` messages one address may send in any 60 s.
export const CREATE_PER_MINUTE = 5;
// Seconds an empty room survives when nobody but its creator ever joined (the owner's call).
export const SOLO_ROOM_TIMEOUT = 30;
// A connection with this many over-limit seconds within the window is closed.
export const RATE_LIMIT_STRIKES = 4;
export const RATE_LIMIT_STRIKE_WINDOW = 8;
// Seconds between timer runs before the excess counts as a stall.
export const STALL_GRACE = 1;
// Seconds between failure reports from one source.
export const REPORT_INTERVAL = 10;
// Seconds the server waits for a peer to answer a close frame before dropping the socket.
export const SOCKET_CLOSE_TIMEOUT = 1;

export type Surface = 'road' | 'sand' | 'riverbed' | 'gravel';

// grip multiplies the vehicle's tyre grip; rolling is resistance as a fraction of the vehicle's weight.
export const SURFACES: Record<Surface, { grip: number; rolling: number }> = deepFreeze({
  road: { grip: 1, rolling: 0.015 },
  gravel: { grip: 0.8, rolling: 0.05 },
  riverbed: { grip: 0.7, rolling: 0.15 },
  sand: { grip: 0.6, rolling: 0.15 },
});

export const REFERENCE_SLOPES_DEG = deepFreeze({ gentle: 8, medium: 15, steep: 25 } as const);
export type ReferenceSlope = keyof typeof REFERENCE_SLOPES_DEG;

// Friction coefficient of every ground and wall collider.
export const COURSE_FRICTION = 1;
// Friction coefficient of the vehicle's chassis box, which touches things only when the vehicle tips or scrapes.
export const CHASSIS_FRICTION = 0.5;
// Below this speed (m/s) the vehicle counts as stopped when deciding whether resistance holds it.
export const VEHICLE_STOPPED_SPEED = 0.1;
// Each wheel's suspension can push with at most this many times the vehicle's weight.
export const MAX_SUSPENSION_FORCE_PER_WEIGHT = 4;

// Winch cable starting values, from experiments/cable/RESULTS.md. Used from build step 6.
// Stiffness in N/m per kilogram of vehicle; the tension cap is a fraction of the vehicle's weight.
export const WINCH_STIFFNESS_PER_KG = 150;
export const WINCH_DAMPING_RATIO = 1;
export const WINCH_FORCE_PER_WEIGHT = 0.65;
export const WINCH_REEL_SPEED = 1;
export const WINCH_MIN_LENGTH = 1.5;
export const WINCH_MAX_LENGTH = 30;
// m, from which the winch rope is drawn red as a warning that the hook is about to leave the hands.
export const WINCH_WARN_LENGTH = 26;
// m, from the chest to the winch box, an anchor point or a ground hook.
export const HOOK_RANGE = 2 * CHARACTER_SCALE;
// m above a static anchor's pose, where the hook attaches.
export const ANCHOR_HEIGHT = 0.5;
// m, the downward search for ground under a dropped hook.
export const HOOK_DROP_RAY = 50;

// Players on foot.
export const PLAYER_RADIUS = 0.35 * CHARACTER_SCALE;
export const PLAYER_HEIGHT = 1.8 * CHARACTER_SCALE;
export const PLAYER_EYE_HEIGHT = 1.6 * CHARACTER_SCALE;
export const PLAYER_WALK_SPEED = 4.5;
export const PLAYER_SPRINT_SPEED = 7.0;
export const PLAYER_CROUCH_SPEED = 2.2;
export const PLAYER_CROUCH_HEIGHT = 1.1 * CHARACTER_SCALE;
export const PLAYER_CROUCH_EYE_HEIGHT = 0.95 * CHARACTER_SCALE;
// The knee slide: starts from a sprint, keeps its speed for a while, then falls to the crouch speed.
export const PLAYER_KNEESLIDE_SPEED = 9.0;
// s at PLAYER_KNEESLIDE_SPEED, out of PLAYER_KNEESLIDE_TIME.
export const PLAYER_KNEESLIDE_HOLD = 0.35;
export const PLAYER_KNEESLIDE_TIME = 0.8;
// m/s of horizontal speed needed to start one.
export const PLAYER_KNEESLIDE_MIN_SPEED = 5.5;
export const PLAYER_KNEESLIDE_COOLDOWN = 1.0;
// rad/s the slide's direction may turn toward the wish direction.
export const PLAYER_KNEESLIDE_STEER = 0.6;
// A slide ends when it moves slower than this (a wall), or after this many ticks in the air.
export const PLAYER_KNEESLIDE_STOP_SPEED = 1;
export const PLAYER_KNEESLIDE_AIR_TICKS = 12;
export const PLAYER_GROUND_ACCEL = 40;
export const PLAYER_AIR_ACCEL = 10;
export const PLAYER_JUMP_SPEED = 5;
// Not scaled: the roof guard uses it, and 0.24 would tie with the ford rock's 0.24 m height.
export const PLAYER_STEP_HEIGHT = 0.3;
export const PLAYER_SNAP_DISTANCE = 0.3 * CHARACTER_SCALE;
export const PLAYER_MAX_SLOPE_DEG = 45;
export const PLAYER_SLIDE_SLOPE_DEG = 50;
export const PLAYER_CONTROLLER_OFFSET = 0.02;
// A capsule is lifted this much when tested for overlap, so standing on the ground is not an overlap.
export const PLAYER_OVERLAP_LIFT = 0.05;
// Height above a standing spot's feet of the ray that checks for a wall between the vehicle and the spot.
export const SPAWN_WALL_RAY_HEIGHT = 0.9 * CHARACTER_SCALE;
export const PLAYER_KILL_RESPAWN_DELAY = 3;
export const BOARD_RANGE = 2 * CHARACTER_SCALE;
export const DRIVER_DOOR_RANGE = 1.5;
export const SEAT_EXIT_DISTANCE = 0.9;
export const SHOVE_STEP = 0.1;
export const SHOVE_MAX_DISTANCE = 4;
// Client only.
export const LOOK_SENSITIVITY = 0.0025;
export const CAMERA_DISTANCE = 3.2 * CHARACTER_SCALE;
export const CAMERA_SHOULDER = 0.6 * CHARACTER_SCALE;
export const CAMERA_MIN_DISTANCE = 0.4 * CHARACTER_SCALE;
export const CAMERA_WALL_MARGIN = 0.2 * CHARACTER_SCALE;

// Prediction (client).
// A correction larger than this (m) moves the player at once.
export const PREDICTION_TELEPORT_DISTANCE = 1;
// Per second; a smaller correction fades out as 1 - exp(-rate * dt) per frame.
export const PREDICTION_SMOOTH_RATE = 12;
// A correction smaller than this (m) is ignored.
export const PREDICTION_IGNORE_DISTANCE = 0.002;
// Inputs kept for replay: two seconds' worth.
export const PREDICTION_MAX_PENDING = 120;

export const PLAYER_COLOUR_PATTERN = /^#[0-9a-f]{6}$/;

// Props and push.
export type PropClass = 'light' | 'heavy';
export interface PropKindConfig {
  class: PropClass;
  halfExtents: Vec3;
  mass: number;
  friction: number;
  // Where the winch hook attaches, in the prop's own frame from its centre; null for light props.
  anchor: Vec3 | null;
}

export const PROP_KINDS = deepFreeze({
  crate: { class: 'light', halfExtents: vec3(0.3 * CHARACTER_SCALE, 0.3 * CHARACTER_SCALE, 0.3 * CHARACTER_SCALE), mass: 15, friction: 0.6, anchor: null },
  barrier: { class: 'heavy', halfExtents: vec3(1.0 * CHARACTER_SCALE, 0.5 * CHARACTER_SCALE, 0.4 * CHARACTER_SCALE), mass: 150, friction: 0.5, anchor: vec3(0, 0.5 * CHARACTER_SCALE, 0) },
  cart: { class: 'light', halfExtents: vec3(0.5 * CHARACTER_SCALE, 0.4 * CHARACTER_SCALE, 0.8 * CHARACTER_SCALE), mass: 40, friction: 0.6, anchor: null },
  scooter: { class: 'light', halfExtents: vec3(0.3 * CHARACTER_SCALE, 0.45 * CHARACTER_SCALE, 0.6 * CHARACTER_SCALE), mass: 30, friction: 0.6, anchor: null },
} satisfies Record<string, PropKindConfig>);
export type PropKind = keyof typeof PROP_KINDS;

// N per player.
export const PUSH_FORCE = 1500;
// N per player on a vehicle tipped more than 45 degrees.
export const PUSH_FORCE_TIPPED = 4000;
// Degrees from world up beyond which a vehicle counts as tipped.
export const PUSH_TIPPED_DEG = 45;
// m/s^2; caps the force on light things at mass times this.
export const PUSH_MAX_ACCEL = 10;
// m above the feet, where a player pushes.
export const PUSH_HEIGHT = 1.0 * CHARACTER_SCALE;
// Pushers counted on the vehicle, in join order.
export const PUSH_MAX_PUSHERS_VEHICLE = 4;
// m, from the feet to the nearest point of a prop's box.
export const HANDS_RANGE = 2 * CHARACTER_SCALE;
// m, a held prop's centre in the holder's yaw frame, from the feet.
export const HOLD_OFFSET: Vec3 = deepFreeze(vec3(0, 1.1 * CHARACTER_SCALE, -0.75 * CHARACTER_SCALE));
// m/s along the aim, added to the holder's horizontal velocity.
export const THROW_SPEED = 7;
// m, the gap above the head when a throw is blocked and the prop is released overhead.
export const THROW_HEAD_CLEARANCE = 0.05 * CHARACTER_SCALE;
// m or quaternion component; a smaller change is not sent.
export const PROP_MOVED_EPSILON = 1e-4;

// Fuel, health and items.
// m/s per tick; a smaller jolt is not part of an impact.
export const VEHICLE_JOLT_FLOOR = 0.5;
// m/s; impacts up to this cost nothing.
export const VEHICLE_IMPACT_SPEED = 4;
// Health per m/s above the threshold.
export const VEHICLE_IMPACT_DAMAGE = 0.04;
// Health per second while upside down.
export const VEHICLE_UPSIDE_DOWN_DRAIN = 0.02;
// s
export const HOLD_DURATION = 3;
// m, feet to the nearest point of the vehicle's box.
export const USE_RANGE = 2 * CHARACTER_SCALE;
// Fuel added by a jerrycan.
export const ITEM_REFUEL = 0.5;
// Health added by a toolbox.
export const ITEM_REPAIR = 0.5;
// m above the feet where a dropped item appears.
export const DROP_HEIGHT = 0.3;

// Player health.
// Health of a new player and a late joiner.
export const PLAYER_MAX_HEALTH = 100;
// Health after a revive or a respawn.
export const PLAYER_REVIVE_HEALTH = 50;
// A restart restores at least this.
export const PLAYER_RESTART_FLOOR = 50;
// s before a downed player respawns.
export const DOWNED_TIMEOUT = 30;
// m/s landing speed that costs nothing; a jump lands at about 4.8, a fall from the RV's roof (2.9 m) at about 7.5, from the Lodgy's (1.5 m) at about 5.4.
export const FALL_DAMAGE_SPEED = 9;
// Health per m/s above it.
export const FALL_DAMAGE = 10;
// m/s relative speed that costs nothing.
export const VEHICLE_HIT_SPEED = 5;
// Health per m/s above it.
export const VEHICLE_HIT_DAMAGE = 8;
// m/s relative speed that costs nothing; a thrown crate leaves the hands at 7.
export const PROP_HIT_SPEED = 6;
// Health per m/s above it.
export const PROP_HIT_DAMAGE = 5;
// s; one body hurts one player at most once in this time.
export const HIT_COOLDOWN = 0.5;
// Health added to a hurt player.
export const HEALTH_KIT_HEAL = 50;
// m, feet to feet (3D), for a health kit on a teammate.
export const HEAL_RANGE = 2 * CHARACTER_SCALE;
// rad; a teammate is near the crosshair within this angle of the aim.
export const HEAL_AIM_ANGLE = 0.35;
export interface ItemKindConfig {
  halfExtents: Vec3;
  mass: number;
  friction: number;
}

export const ITEM_KINDS = deepFreeze({
  jerrycan: { halfExtents: vec3(0.12 * CHARACTER_SCALE, 0.25 * CHARACTER_SCALE, 0.2 * CHARACTER_SCALE), mass: 20, friction: 0.8 },
  toolbox: { halfExtents: vec3(0.25 * CHARACTER_SCALE, 0.12 * CHARACTER_SCALE, 0.12 * CHARACTER_SCALE), mass: 10, friction: 0.8 },
  healthKit: { halfExtents: vec3(0.18 * CHARACTER_SCALE, 0.08 * CHARACTER_SCALE, 0.14 * CHARACTER_SCALE), mass: 2, friction: 0.8 },
} satisfies Record<string, ItemKindConfig>);
export type ItemKind = keyof typeof ITEM_KINDS;

// Segments.
export const ROAD_WIDTH = 10;
// m, longest ground piece.
export const ROAD_PIECE_LENGTH = 10;
// rad, the largest yaw change of one piece of a curve.
export const ROAD_MAX_PIECE_YAW = Math.PI / 18;
export const ROAD_THICKNESS = 1;
// m of solid ground beside each road edge, at the road's height.
export const SHOULDER_WIDTH = 25;
// m a shoulder box reaches under the road edge, so the two never leave a seam.
export const SHOULDER_OVERLAP = 0.05;
// m added at both ends of each piece where the yaw changes.
export const ROAD_JOINT_OVERLAP = 0.6;
// m between the walls.
export const ALLEY_WIDTH = 6;
export const ALLEY_WALL_HEIGHT = 3;
// m, alley walls and fences.
export const WALL_THICKNESS = 0.5;
// m of alley per clutter item at density 1.
export const ALLEY_CLUTTER_SPACING = 6;
// m of road before the sand.
export const SAND_APRON = 50;
// m outside the road edge.
export const PALM_OFFSET = 0.5;
// m of flat road before the bank's ramp.
export const BANK_APPROACH = 15;
// m of flat road at the top of the bank.
export const BANK_TOP = 10;
// Half extents of a ford rock.
export const FORD_ROCK: Vec3 = deepFreeze(vec3(0.3, 0.12, 0.3));
// m between rows of obstacles.
export const ROADWORKS_ROW_SPACING = 12;
// Barriers per row, centred at x = -3, 0, 3.
export const ROADWORKS_ROW = 3;
export const FENCE_HEIGHT = 1.2;
// m from the entry to the checkpoint spawn, along the route.
export const SEGMENT_SPAWN_INSET = 8;
// m, the shortest route a segment may have.
export const SEGMENT_MIN_LENGTH = 15;
// Half extents along y and z of a checkpoint trigger; x is half the segment width.
export const CHECKPOINT_TRIGGER: Vec3 = deepFreeze(vec3(0, 2, 2));
// m of flat road after the last segment.
export const FINISH_PAD = 20;
// m under the lowest ground top.
export const KILL_PLANE_BELOW = 20;
// Half extents of the ground pad beside the road.
export const STOP_PAD: Vec3 = deepFreeze(vec3(4, 0.5, 8));
// m a stop pad's top sits above the shoulder it overlaps, so the pad's surface wins the wheel ray.
export const STOP_PAD_LIFT = 0.01;
// Half extents of a stop's parking zone.
export const STOP_ZONE: Vec3 = deepFreeze(vec3(2.5, 2, 5));
// m above the ground.
export const COIN_HEIGHT = 1 * CHARACTER_SCALE;
// m between the barriers of a row.
export const ROADWORKS_BARRIER_SPACING = 3;
// m along the road to the first row of barriers.
export const ROADWORKS_FIRST_ROW = 16;
// m of road after the last row of barriers.
export const ROADWORKS_LAST_ROW_CLEARANCE = 8;
// m to either side of the centre line, where ford rocks lie (the wheel tracks).
export const FORD_ROCK_LATERAL = 1.0;
// m between a clutter item and the alley wall.
export const ALLEY_WALL_CLEARANCE = 0.1;
// m into the top of a bank where the first boulders stand.
export const BOULDER_FIRST_ALONG = 3;
// m between each further pair of boulders.
export const BOULDER_PAIR_SPACING = 2;
// m in from the road edge where boulders stand.
export const BOULDER_EDGE_INSET = 1;
// m of flat road before a pit's descent.
export const PIT_APPROACH = 15;
// m of flat road after a pit's climb.
export const PIT_EXIT = 10;
// m into the pit's exit flat where the first boulders stand (as a bank's).
export const PIT_ANCHOR_FIRST_ALONG = BOULDER_FIRST_ALONG;
// m between each further pair of a pit's boulders.
export const PIT_ANCHOR_PAIR_SPACING = BOULDER_PAIR_SPACING;
// degrees, the slope of a hill both vehicles climb (about 10 is the true limit).
export const HILL_SLOPE = 8;
// degrees, the slope of the big hill: the Lodgy climbs it in 20 to 23 s, the RV needs the winch.
export const BIG_HILL_SLOPE = 14;
// degrees, the climb out of the deep pit: the RV cannot climb it, the Lodgy can (no exit up to 33 traps both).
export const PIT_DEEP_EXIT = 28;
// m, half the thickness of the water decor.
export const WATER_HALF_THICKNESS = 0.05;
// m of gap between the road edge and a stop's parking zone.
export const STOP_ZONE_GAP = 0.5;
// m between the zone's outer side and the operate point.
export const STOP_OPERATE_GAP = 1;
// m along the road from the operate point to a fuel stop's shop counter.
export const STOP_COUNTER_OFFSET = 2;
// Half extents of the finish trigger; its centre is half its height above the road.
export const FINISH_TRIGGER: Vec3 = deepFreeze(vec3(ROAD_WIDTH / 2, 2, 2));

// Checkpoints.
// Fuel and vehicle health are restored at least to this on a restart.
export const RESTART_FLOOR = 0.5;

// Player reset of a stuck vehicle.
// s the reset button is held before it fires.
export const RESET_HOLD = 1.5;
// m/s; the vehicle must be slower than this.
export const RESET_MAX_SPEED = 1;
// The vehicle's up vector y below this counts as upside down or on its side.
export const RESET_TIPPED_UP_Y = 0.3;
// s of throttle over which the vehicle must have moved STUCK_DISTANCE to count as free.
export const STUCK_WINDOW = 8;
// m.
export const STUCK_DISTANCE = 1;

// Coins, stops and shops.
// m, the coin's touch sphere.
export const COIN_RADIUS = 0.5 * CHARACTER_SCALE;
// s added to the final time per checkpoint restart.
export const FINAL_RESTART_PENALTY = 60;
// s added per player respawn.
export const FINAL_RESPAWN_PENALTY = 30;
// s taken off per coin left in the wallet.
export const FINAL_COIN_BONUS = 5;
// m, feet to the operate point (3D).
export const STOP_OPERATE_RANGE = 2 * CHARACTER_SCALE;
// m, the height of the drawn pump or workbench post; the operate angle is measured to its middle.
export const STOP_POST_HEIGHT = 1.4;
// m, feet to the counter's box (3D).
export const SHOP_RANGE = 2 * CHARACTER_SCALE;
// Coins per item.
export const SHOP_PRICES: Record<ItemKind, number> = deepFreeze({ jerrycan: 3, toolbox: 3, healthKit: 2 });
// Half extents of the counter box; it is centred 0.5 m above the counter point and unrotated.
export const SHOP_COUNTER_HALF: Vec3 = deepFreeze(vec3(0.6, 0.5, 0.3));
// m between consecutive snapshots of the local player beyond which the shop menu closes.
export const SHOP_MENU_TELEPORT = 2;
// s the shop menu shows a refusal.
export const SHOP_ERROR_SECONDS = 2;

// Lobby.
export const TIMES_OF_DAY = ['dawn', 'midday', 'sunset', 'night'] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];
export const WEATHERS = ['clear', 'rain', 'sandstorm'] as const;
export type Weather = (typeof WEATHERS)[number];
export const DEFAULT_TIME_OF_DAY: TimeOfDay = 'midday';
export const DEFAULT_WEATHER: Weather = 'clear';
// Multiplies tyre grip on every surface in rain; a starting value.
export const RAIN_GRIP = 0.75;
// s a disconnected player's slot is kept.
export const HELD_SLOT_TIMEOUT = 30;
// s a room refuses to build another world after building one, so an admin cannot rebuild at message rate.
export const WORLD_REBUILD_COOLDOWN = 1;
// Course ids in campaign order.
export const CAMPAIGN: readonly string[] = deepFreeze(['marrakech']);

// m from the centre line to each barrier of a gates hazard; the corridor between inner edges is 2 * (this - barrier half width).
export const GATES_OFFSET = 2.7;
// m between the barriers of a gates hazard along the road.
export const GATES_SPACING = 14;
export const GATES_MIN_COUNT = 2;
export const GATES_MAX_COUNT = 6;
// m, each side of a roadblock, that its two edge fences reach along the road.
export const ROADBLOCK_FENCE_HALF = 10;
// m of road before the end of a segment that no hazard may reach into.
export const HAZARD_END_CLEARANCE = 8;
// m between the end of one hazard and the start of the next.
export const HAZARD_MIN_GAP = 20;
// m between a hazard and the nearest debris crate.
export const HAZARD_DEBRIS_GAP = 10;
// m of lateral centre of the three crates across the right half of the lane, each a crate width plus 0.02 apart.
export const CRATE_WALL_LATERALS: readonly number[] = Object.freeze([0, 1, 2].map((i) => 2.0 + i * (2 * PROP_KINDS.crate.halfExtents.x + 0.02)));
// m, lateral offset of the outer barriers of a roadblock row (barriers at -3, 0, 3).
export const ROADBLOCK_LATERAL = 3;

// m of eligible route per ambient event, on average.
export const AMBIENT_SPACING = 120;
// m, jitter either side of an event's slot centre; keeps events at least AMBIENT_MIN_GAP apart.
export const AMBIENT_JITTER = 30;
// m, least distance between two events along the route; planAmbient keeps AMBIENT_SPACING - 2 * AMBIENT_JITTER >= this.
export const AMBIENT_MIN_GAP = 60;
// m of route at the start and the end with no events.
export const AMBIENT_ENDS = 150;
// m of margin either side of a stop, hazard or terrain group with no events.
export const AMBIENT_MARGIN = 60;
// Share of events that are goats; the rest are scooters.
export const AMBIENT_GOAT_SHARE = 0.7;
// m, how far ahead of the vehicle an animal appears.
export const AMBIENT_SPAWN_AHEAD = 120;
// m ahead of the vehicle left animal-free by a rearm (restart, respawn, skip); events beyond it fire again.
export const AMBIENT_REARM_CLEAR = 60;
// m, how far ahead of the vehicle an animal starts to cross.
export const AMBIENT_TRIGGER = 45;
// m, how far a spent animal may fall behind the vehicle before it is removed.
export const AMBIENT_DESPAWN_BEHIND = 80;
// m beyond the road edge where an animal waits.
export const AMBIENT_EDGE_OFFSET = 1.5;
// Most animals of each kind alive at once.
export const AMBIENT_MAX_GOATS = 6;
export const AMBIENT_MAX_SCOOTERS = 3;
// m/s crossing speeds.
export const AMBIENT_GOAT_SPEED = 2.5;
export const AMBIENT_SCOOTER_SPEED = 4.5;
// m beyond the far road edge where a goat stops.
export const AMBIENT_GOAT_STOP_BEYOND = 2;
// m beyond the road edge where a scooter is removed.
export const AMBIENT_SCOOTER_LEAVE = 15;
// m of eligible route per item drop, on average.
export const ITEM_DROP_SPACING = 600;
// m, jitter either side of a drop's slot centre.
export const ITEM_DROP_JITTER = 80;
// m either side of a course pickup with no drops.
export const ITEM_DROP_PICKUP_CLEAR = 40;
// m, how far ahead of the vehicle a drop appears.
export const ITEM_DROP_AHEAD = 150;
// m, how far behind the vehicle an unclaimed drop is removed.
export const ITEM_DROP_BEHIND = 100;
// m beyond the road edge where a drop lies.
export const ITEM_DROP_EDGE_OFFSET = 1.5;
// m above the ground where a drop is released.
export const ITEM_DROP_LIFT = 0.05;
// m above the higher of the vehicle and the last checkpoint where the ground ray for a drop starts, and its length.
export const ITEM_DROP_PROBE_UP = 120;
export const ITEM_DROP_PROBE_LENGTH = 400;
// Probability of each kind; sums to 1.
export const ITEM_DROP_MIX = deepFreeze({ jerrycan: 0.2, toolbox: 0.35, healthKit: 0.45 } satisfies Record<ItemKind, number>);
// Fraction of full health lost to one animal hit; health never falls below ANIMAL_HEALTH_FLOOR.
export const ANIMAL_HIT_DAMAGE = 0.03;
export const ANIMAL_HEALTH_FLOOR = 0.02;
// m/s relative speed above which contact counts as a hit.
export const ANIMAL_HIT_SPEED = 2.0;
// s a hit animal stays before it is removed.
export const ANIMAL_HIT_LINGER = 1.5;
// m, half extents of an animal's hit box (goat: x across, z along its body); a scooter is a scooter prop.
export const ANIMAL_HALF_GOAT = vec3(0.25 * CHARACTER_SCALE, 0.4 * CHARACTER_SCALE, 0.6 * CHARACTER_SCALE);
export const ANIMAL_HALF_SCOOTER = PROP_KINDS.scooter.halfExtents;
// m the chassis box is inflated by in the hit check.
export const ANIMAL_HIT_MARGIN = 0.1;
// m above the ground the director's animals are probed from, and the probe length.
export const ANIMAL_PROBE_UP = 20;
export const ANIMAL_PROBE_LENGTH = 60;
// m, peak height of the hop a hit animal makes while it lingers.
export const ANIMAL_KNOCK_HOP = 0.4;
