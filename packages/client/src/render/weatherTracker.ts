import type { Weather } from '@lodgy/shared';
import { weatherBlend } from './conditions';

export interface WeatherTracker {
  // The snapshot's weather (undefined when the room's weather is fixed) at clock second `now`.
  push(weather: Weather | undefined, now: number): void;
  // The target weather.
  weather(): Weather;
  // 0 when the target was just set, 1 once settled.
  blend(now: number): number;
  // The weather whose sky must be applied now (the blend has passed its midpoint), once; else null.
  takeSky(now: number): Weather | null;
}

// A random room starts as `start` and snaps to the first weather the server names; later ones blend.
export function createWeatherTracker(start: Weather): WeatherTracker {
  let weather = start;
  let since = Number.NEGATIVE_INFINITY;
  let skyWeather = start;
  let seen = false;
  return {
    push(next, now) {
      if (next === undefined) return;
      if (next !== weather) {
        weather = next;
        since = seen ? now : Number.NEGATIVE_INFINITY;
      }
      seen = true;
    },
    weather: () => weather,
    blend: (now) => weatherBlend(now - since),
    takeSky(now) {
      if (skyWeather === weather || weatherBlend(now - since) < 0.5) return null;
      skyWeather = weather;
      return weather;
    },
  };
}
