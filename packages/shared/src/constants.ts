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
  sand: { grip: 0.6, rolling: 0.25 },
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
export const WINCH_FORCE_PER_WEIGHT = 0.6;
export const WINCH_REEL_SPEED = 1;
export const WINCH_MIN_LENGTH = 1.5;
export const WINCH_MAX_LENGTH = 25;
// m, from the chest to the winch box, an anchor point or a ground hook.
export const HOOK_RANGE = 2;
// m above a static anchor's pose, where the hook attaches.
export const ANCHOR_HEIGHT = 0.5;
// m, the downward search for ground under a dropped hook.
export const HOOK_DROP_RAY = 50;

// Players on foot.
export const PLAYER_RADIUS = 0.35;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.6;
export const PLAYER_WALK_SPEED = 4.5;
export const PLAYER_GROUND_ACCEL = 40;
export const PLAYER_AIR_ACCEL = 10;
export const PLAYER_JUMP_SPEED = 5;
export const PLAYER_STEP_HEIGHT = 0.3;
export const PLAYER_SNAP_DISTANCE = 0.3;
export const PLAYER_MAX_SLOPE_DEG = 45;
export const PLAYER_SLIDE_SLOPE_DEG = 50;
export const PLAYER_CONTROLLER_OFFSET = 0.02;
// A capsule is lifted this much when tested for overlap, so standing on the ground is not an overlap.
export const PLAYER_OVERLAP_LIFT = 0.05;
export const PLAYER_KILL_RESPAWN_DELAY = 3;
export const BOARD_RANGE = 2;
export const DRIVER_DOOR_RANGE = 1.5;
export const SEAT_EXIT_DISTANCE = 0.9;
export const SHOVE_STEP = 0.1;
export const SHOVE_MAX_DISTANCE = 4;
// Client only.
export const LOOK_SENSITIVITY = 0.0025;
export const CAMERA_DISTANCE = 3.2;
export const CAMERA_SHOULDER = 0.6;
export const CAMERA_MIN_DISTANCE = 0.4;
export const CAMERA_WALL_MARGIN = 0.2;

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
  crate: { class: 'light', halfExtents: vec3(0.3, 0.3, 0.3), mass: 15, friction: 0.6, anchor: null },
  barrier: { class: 'heavy', halfExtents: vec3(1.0, 0.5, 0.4), mass: 150, friction: 0.5, anchor: vec3(0, 0.5, 0) },
  cart: { class: 'light', halfExtents: vec3(0.5, 0.4, 0.8), mass: 40, friction: 0.6, anchor: null },
  scooter: { class: 'light', halfExtents: vec3(0.3, 0.45, 0.6), mass: 30, friction: 0.6, anchor: null },
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
export const PUSH_HEIGHT = 1.0;
// Pushers counted on the vehicle, in join order.
export const PUSH_MAX_PUSHERS_VEHICLE = 4;
// m, from the feet to the nearest point of a prop's box.
export const HANDS_RANGE = 2;
// m, a held prop's centre in the holder's yaw frame, from the feet.
export const HOLD_OFFSET: Vec3 = deepFreeze(vec3(0, 1.1, -0.75));
// m/s along the aim, added to the holder's horizontal velocity.
export const THROW_SPEED = 7;
// m, the gap above the head when a throw is blocked and the prop is released overhead.
export const THROW_HEAD_CLEARANCE = 0.05;
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
export const USE_RANGE = 2;
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
export const HEAL_RANGE = 2;
// rad; a teammate is near the crosshair within this angle of the aim.
export const HEAL_AIM_ANGLE = 0.35;
export interface ItemKindConfig {
  halfExtents: Vec3;
  mass: number;
  friction: number;
}

export const ITEM_KINDS = deepFreeze({
  jerrycan: { halfExtents: vec3(0.12, 0.25, 0.2), mass: 20, friction: 0.8 },
  toolbox: { halfExtents: vec3(0.25, 0.12, 0.12), mass: 10, friction: 0.8 },
  healthKit: { halfExtents: vec3(0.18, 0.08, 0.14), mass: 2, friction: 0.8 },
} satisfies Record<string, ItemKindConfig>);
export type ItemKind = keyof typeof ITEM_KINDS;

// Segments.
export const ROAD_WIDTH = 10;
// m, longest ground piece.
export const ROAD_PIECE_LENGTH = 10;
// rad, the largest yaw change of one piece of a curve.
export const ROAD_MAX_PIECE_YAW = Math.PI / 18;
export const ROAD_THICKNESS = 1;
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
// Half extents of a stop's parking zone.
export const STOP_ZONE: Vec3 = deepFreeze(vec3(2.5, 2, 5));
// m above the ground.
export const COIN_HEIGHT = 1;
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

// Coins, stops and shops.
// m, the coin's touch sphere.
export const COIN_RADIUS = 0.5;
// s added to the final time per checkpoint restart.
export const FINAL_RESTART_PENALTY = 60;
// s added per player respawn.
export const FINAL_RESPAWN_PENALTY = 30;
// s taken off per coin left in the wallet.
export const FINAL_COIN_BONUS = 5;
// m, feet to the operate point (3D).
export const STOP_OPERATE_RANGE = 2;
// m, the height of the drawn pump or workbench post; the operate angle is measured to its middle.
export const STOP_POST_HEIGHT = 1.4;
// m, feet to the counter's box (3D).
export const SHOP_RANGE = 2;
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
// Course ids in campaign order; step 16 replaces it with the real campaign.
export const CAMPAIGN: readonly string[] = deepFreeze(['airport']);
