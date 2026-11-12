export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;
export const GRAVITY = 9.81;
export const MAX_CATCHUP_STEPS = 5;

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
