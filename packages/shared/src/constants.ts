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
export const PLAYER_COLOURS = ['#e4572e', '#17bebb', '#ffc914', '#76b041', '#a05cdc', '#f28cb1'] as const;

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

export type Surface = 'road' | 'sand' | 'riverbed' | 'gravel';

// grip multiplies the vehicle's tyre grip; rolling is resistance as a fraction of the vehicle's weight.
export const SURFACES: Record<Surface, { grip: number; rolling: number }> = {
  road: { grip: 1, rolling: 0.015 },
  gravel: { grip: 0.8, rolling: 0.05 },
  riverbed: { grip: 0.7, rolling: 0.15 },
  sand: { grip: 0.6, rolling: 0.25 },
};

export const REFERENCE_SLOPES_DEG = { gentle: 8, medium: 15, steep: 25 } as const;
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
