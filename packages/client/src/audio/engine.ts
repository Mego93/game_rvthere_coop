import { clamp, type CableSnapshot, type Weather } from '@lodgy/shared';

// Playback rate of the engine loop: lowest at idle, highest at top speed with the throttle down.
export const engineRate = (speed: number, maxSpeed: number, throttle: number): number =>
  0.6 + 0.9 * clamp(Math.abs(speed) / maxSpeed, 0, 1) + 0.2 * Math.abs(throttle);

export const winchOn = (cable: Pick<CableSnapshot, 'state' | 'reel'> | null | undefined, phase: string): boolean =>
  phase === 'playing' && cable?.state === 'attached' && cable.reel !== 0;

export const rainOn = (weather: Weather): boolean => weather === 'rain';
