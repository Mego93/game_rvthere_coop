import { TICK_RATE, WEATHERS, WEATHER_CHANGE_MAX, WEATHER_CHANGE_MIN, WEATHER_WEIGHTS, type Weather } from './constants';
import { mulberry32 } from './ambient';

const drawWeather = (rand: () => number, exclude: Weather | null): Weather => {
  const options = WEATHERS.filter((weather) => weather !== exclude);
  const total = options.reduce((sum, weather) => sum + WEATHER_WEIGHTS[weather], 0);
  let roll = rand() * total;
  for (const weather of options) {
    roll -= WEATHER_WEIGHTS[weather];
    if (roll < 0) return weather;
  }
  return options[options.length - 1]!;
};

// The weather of a random run: the first at tick 0, then a different one after each uniform WEATHER_CHANGE_MIN to MAX seconds, listed up to `ticks`.
export function weatherSchedule(seed: number, ticks: number): { tick: number; weather: Weather }[] {
  const rand = mulberry32(seed);
  let weather = drawWeather(rand, null);
  const list = [{ tick: 0, weather }];
  let at = 0;
  for (;;) {
    at += Math.round((WEATHER_CHANGE_MIN + rand() * (WEATHER_CHANGE_MAX - WEATHER_CHANGE_MIN)) * TICK_RATE);
    if (at > ticks) return list;
    weather = drawWeather(rand, weather);
    list.push({ tick: at, weather });
  }
}

// The weather in force at a tick of a schedule.
export function weatherAt(schedule: readonly { tick: number; weather: Weather }[], tick: number): Weather {
  let current = schedule[0]!.weather;
  for (const entry of schedule) {
    if (entry.tick > tick) break;
    current = entry.weather;
  }
  return current;
}
