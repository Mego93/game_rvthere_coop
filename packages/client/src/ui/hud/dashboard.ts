export const GEAR_TOPS: readonly number[] = [8, 14, 20, 27, 34];
export const IDLE_RPM = 900;
export const REDLINE_RPM = 7000;
const LOW_RPM = 1500;
const HIGH_RPM = 6500;
// Below this the vehicle counts as standing.
const STANDING = 0.5;
// How far the throttle lifts the revs of a standing vehicle.
const REV_BLIP = 2100;

export interface Gearbox { gear: number; rpm: number }

// The gear is for show: it follows the speed, 0 is neutral (standing) and -1 reverse.
export function gearbox(speed: number, throttle: number): Gearbox {
  const abs = Number.isFinite(speed) ? Math.abs(speed) : 0;
  if (abs < STANDING) return { gear: 0, rpm: IDLE_RPM + REV_BLIP * Math.min(Math.max(Number.isFinite(throttle) ? throttle : 0, 0), 1) };
  const index = GEAR_TOPS.findIndex((top) => abs < top);
  const gear = index === -1 ? GEAR_TOPS.length : index + 1;
  const bottom = gear === 1 ? 0 : GEAR_TOPS[gear - 2]!;
  const top = GEAR_TOPS[gear - 1]!;
  const rpm = Math.min(LOW_RPM + ((abs - bottom) / (top - bottom)) * (HIGH_RPM - LOW_RPM), REDLINE_RPM);
  return { gear: speed < 0 ? -1 : gear, rpm: Math.max(rpm, IDLE_RPM) };
}

export const speedKmh = (speed: number): number => (Number.isFinite(speed) ? Math.round(Math.abs(speed) * 3.6) : 0);
