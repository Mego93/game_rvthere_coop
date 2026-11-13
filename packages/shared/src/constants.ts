import { deepFreeze } from './math';

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
