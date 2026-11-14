# Step 13: Conditions: rain grip, and the time-of-day and weather visuals

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`. Read "Conditions", the World API (`createWorld(rapier, { courseId, vehicleId, weather })`), and the iPhone specifics (pixel ratio cap; no shadows on touch). Step 11 already carries `timeOfDay` and `weather` in the lobby message and the room's settings.

This plan fixes interfaces, constants, rules and test cases. Implementers write the tests first, then the code. Where the plan and the spec disagree, or neither answers a question, stop and report. The visuals cannot be verified by tests; they are left for the owner's sign-off. This step ends at `needs sign-off`.

## Goal

Rain lowers tyre grip on every surface. The time of day sets the sky, the sun and the light. At night the vehicle's headlights are on and each player carries a small light. Rain shows rainfall, and a sandstorm limits sight with fog.

## Constants

`shared/src/constants.ts`, block "Conditions":

| Name | Value | Meaning |
|---|---|---|
| `RAIN_GRIP` | 0.75 | multiplies tyre grip on every surface in rain; a starting value |

`client/src/render/conditions.ts`, exported; these are client look values and starting values for the owner:

| Name | Value | Meaning |
|---|---|---|
| `RAIN_DROPS` | 1500 on desktop, 600 on touch | particles in the rain volume |
| `RAIN_RADIUS` | 30 | m, the half-size of the rain volume around the camera |
| `SANDSTORM_FOG` | `{ near: 4, far: 45 }` | m |
| `HEADLIGHT_RANGE` | 40 | m |
| `PLAYER_LIGHT_RANGE` | 6 | m |

## Rules

C1. **World option.** `WorldOptions` gains `weather: Weather`, defaulting to `'clear'` when absent, so existing callers and tests keep working. `createVehicle(..., options?: { gripScale?: number })`, where `gripScale` defaults to 1.

- `createWorld` passes `gripScale = weather === 'rain' ? RAIN_GRIP : 1`.
- The vehicle sets each wheel's friction slip to `config.grip * surface.grip * gripScale`.
- `testRig` passes no option, so it gets grip scale 1.
- Weather has no other physical effect. A sandstorm is visual only.

C2. **Room.** `start` and `restartCourse` create the world with the room's `weather`. `timeOfDay` does not reach the world.

C3. **Client settings.** The client already holds `timeOfDay` and `weather` from the latest `lobby` message. `createGame` receives them, as a `conditions: { timeOfDay, weather }` field on its view or arguments. They are fixed for the life of the game, because the run's settings cannot change during `playing`.

C4. **Look** (pure). The signature is:

```
conditionsLook(timeOfDay, weather): {
  sky: number; sunDirection: Vec3; sunColour: number; sunIntensity: number; ambient: number;
  fog: { colour; near; far } | null; rain: boolean; headlights: boolean; playerLights: boolean;
}
```

Starting values:

| Time | Sky | Sun elevation | Sun colour | Sun / ambient |
|---|---|---|---|---|
| dawn | `0xf2c6a0` | 10° from the east | `0xffd2a1` | 0.9 / 0.7 |
| midday | today's `SKY` | today's sun direction | `0xffffff` | 1.5 / 1.2 (today's values) |
| sunset | `0xe8875a` | 8° from the west | `0xff9a5c` | 0.8 / 0.6 |
| night | `0x0b1530` | 30°, moonlight | `0x8fa3d6` | 0.25 / 0.25 |

Weather adjusts these:
- **Rain:** the sky is mixed 50% toward `0x7a8591`, and the sun intensity is multiplied by 0.6.
- **Sandstorm:** fog is `{ colour: 0xc9a46a, ...SANDSTORM_FOG }`, the sky is set to the fog colour, and the sun intensity is multiplied by 0.7.

`headlights` and `playerLights` are true at night only.

C5. **Scene.** The look is applied once at game creation in `render/conditions.ts`, through `applyConditions(scene, look, isTouch)`:

- It sets the background, the hemisphere and sun lights, and `scene.fog`.
- Rain is a `THREE.Points` volume of `RAIN_DROPS` that follows the camera. Drops fall at 12 m/s and wrap within `RAIN_RADIUS`. Updating them allocates nothing per frame.
- Headlights are two `SpotLight`s on the vehicle mesh, pointing forward with range `HEADLIGHT_RANGE`. They are added when `look.headlights` is true.
- Each player mesh gets a `PointLight` (range `PLAYER_LIGHT_RANGE`, intensity 1) when `look.playerLights` is true.
- Shadows stay off on touch devices, and the pixel ratio cap stays at 2.
- Everything created is disposed in `game.stop()`.

C6. **Overlay.** The debug overlay adds a line `weather  <timeOfDay> <weather>` after the `time` line. It does not start with any e2e reader prefix.

## Modules and signatures

- `shared/src/constants.ts`: `RAIN_GRIP`.
- `shared/src/vehicle.ts`: the `gripScale` option.
- `shared/src/world.ts`: `WorldOptions.weather`.
- `server/src/room/room.ts`: passes `weather`.
- `client/src/render/conditions.ts` (new): `conditionsLook` and `applyConditions`, with an `update(cameraPos, dt)` for the rain.
- `client/src/game.ts`: wiring.
- `client/src/main.ts`: passes the conditions from the lobby message.
- `client/src/render/vehicleMesh.ts` and `playerMesh.ts`: optional lights.
- `client/src/ui/overlay.ts`: the line.

## Existing tests that change (name every other one)

- `overlay.test.ts`: the `OverlayData` literals gain `conditions`, and a new test covers the line.
- Any test that builds `WorldOptions` literals with the type spelled out: none should need changes, because `weather` is optional.

## Tests (numbered)

- W1. Vehicle: with `gripScale` 0.75, each wheel's friction slip (read with `controller.wheelFrictionSlip(i)`) is 0.75 × today's value on road, sand and gravel.
- W2. World:
  - `createWorld` with `weather: 'rain'` scales grip and `'clear'` does not.
  - Behavioural check: the Lodgy braking from 15 m/s on road (throttle released, brake held) stops in a longer distance in rain than in clear.
  - Measure both distances and report them. Do not tune anything to make the gap larger.
- W3. Room: a room configured with `rain` builds its world with rain. Check it through `debugWorld` and a grip read or an exposed option.
- W4. `conditionsLook`:
  - each time of day gives the table's values;
  - rain mixes the sky and dims the sun;
  - a sandstorm sets fog and the sky;
  - lights are on only at night;
  - midday and clear give exactly today's scene values.
- W5. Overlay: the `weather` line.
- W6. Smoke: with the defaults, the overlay shows `weather  midday clear`. A second case configures `night` and `rain` in the lobby and starts; the line shows it and the page has no errors.

## Tasks

1. **Rain grip.** C1, C2, W1–W3.
   - Commit: `feat(shared): rain lowers tyre grip`.
2. **Visuals.** C3–C6, W4–W6.
   - Commit: `feat(client): time of day, rain and sandstorm visuals`.
3. **Documents** (main session).
   - ROADMAP: step 13 → `needs sign-off`; log C1–C6; "Runnable today".
   - The owner's checklist: each time of day, rain, sandstorm, headlights and player lights, and the frame rate on an iPhone in rain.

Each task: tests first, then a Sonnet review. Run `npm test` and `npm run typecheck` before each commit, and Playwright in task 2.

## What the owner checks by hand

- Every combination's look.
- Whether rain feels slippery enough.
- Headlights at night.
- Visibility in a sandstorm.
- The iPhone frame rate in rain.

## Known risks to watch in review

- The client predictor has no tyre model, so rain does not affect prediction. Only the vehicle, which the server owns, changes.
- Rain particles allocating every frame.
- Lights on every player mesh multiplying the cost of forward rendering. Six point lights plus two spotlights is acceptable; check that nothing else adds lights.
