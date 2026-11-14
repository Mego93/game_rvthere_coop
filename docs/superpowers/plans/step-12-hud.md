# Step 12: HUD

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`. Read "HUD" (the position table), "Conventions" (units, axes, yaw), "iPhone specifics" (safe-area insets) and the `BuiltCourse` type in `packages/shared/src/course.ts`.

This plan fixes interfaces, constants, rules and test cases. Implementers write the tests first, then the code. Where the plan and the spec disagree, or neither answers a question, stop and report. The look and feel cannot be tested; this step ends at `needs sign-off`.

## Goal

Replace the plain text overlay, for players, with the spec's HUD. The debug overlay stays (hidden unless toggled) because the e2e test reads the `pos` line from it.

Layout, exactly the spec table. The spec says the arrangement is settled in a mock-up pass with the owner; the owner was not available, so this step builds the spec table as written, and the owner adjusts at sign-off. Decision D-HUD1 in `ROADMAP.md` records that.

| Position | Content |
|---|---|
| Top centre | Compass |
| Top left | Minimap |
| Top right | Vehicle fuel and health bars, timer, wallet |
| Bottom left | Own health bar |
| Bottom right | Three inventory slots, selected highlighted |
| Centre | Crosshair (exists), prompt line and hold progress beneath it |
| World | Marker above each downed teammate with seconds left, through walls; own downed timer in the centre |

## Files

- `packages/client/src/ui/hud/compass.ts` and `compass.test.ts`: pure maths.
- `packages/client/src/ui/hud/minimap.ts` and `minimap.test.ts`: pure maths.
- `packages/client/src/ui/hud/hudModel.ts` and `hudModel.test.ts`: derives every HUD value from the sampled state.
- `packages/client/src/ui/hud/hud.ts`: DOM. Builds elements once, `update(model)` writes only changed values. No test file (DOM); its logic lives in the model.
- `packages/client/src/ui/hud/downedMarkers.ts` and `downedMarkers.test.ts`: world-to-screen projection of markers.
- Changes: `packages/client/index.html` (hud container and styles), `packages/client/src/main.ts` and `game.ts` (create the HUD, update it each frame, toggle the debug overlay with `F3`).
- `ROADMAP.md`.

## Exported names and signatures

```ts
// compass.ts
export const COMPASS_FOV = Math.PI; // radians shown across the strip
export function bearingTo(from: Vec3, to: Vec3): number; // yaw convention of the spec: 0 faces -z, positive turns left
export function headingOffset(heading: number, bearing: number): number; // signed, in (-PI, PI], positive = to the right on screen
export function markerPosition(offset: number): number | null; // 0..1 across the strip, null when outside COMPASS_FOV/2
export function compassTarget(checkpoints: readonly Checkpoint[], finish: Box, checkpointIndex: number, won: boolean): Vec3 | null; // next checkpoint's trigger centre, the finish after the last, null once won

// minimap.ts
export interface MapView { scale: number; originX: number; originZ: number; size: number }
export function mapViewFor(route: readonly [number, number][], size: number, margin: number): MapView; // fits the route's bounding box
export function toMap(view: MapView, x: number, z: number): { x: number; y: number }; // pixels, z grows downward, north (-z) is up
export function routePath(view: MapView, route: readonly [number, number][]): string; // SVG path data

// hudModel.ts
export interface HudModel {
  heading: number;
  compass: { marker: number | null; label: string };
  vehicle: { fuel: number; health: number } | null; // 0..1
  timer: string; // "m:ss.t"
  wallet: number;
  ownHealth: number; // 0..100
  slots: { kind: string | null; selected: boolean }[]; // always 3
  prompt: string | null;
  hold: number | null; // 0..1
  downedSelf: number | null; // whole seconds left
  downedOthers: { id: string; name: string; pos: Vec3; seconds: number }[];
  mapEntities: { id: string; kind: 'vehicle' | 'self' | 'player' | 'stop' | 'checkpoint'; x: number; z: number }[];
}
export function buildHudModel(data: OverlayData): HudModel; // OverlayData from ui/overlay.ts

// downedMarkers.ts
export function projectMarker(camera: { project(p: Vec3): { x: number; y: number; z: number } }, pos: Vec3, width: number, height: number): { x: number; y: number; behind: boolean };
```

`OverlayData`, `interactHint` and the "Hold F" hint logic already exist in `ui/overlay.ts`; the model reuses them. Extract the hold-F hint into an exported `useHint(data): string | null` in `overlay.ts` first (task 1), without changing `overlayText` output.

## Behaviour rules

H1. Yaw convention: use the spec's Conventions section for heading; `bearingTo` is the yaw a player would need to face `to` from `from`. The compass heading is the local player's aim yaw on foot, the vehicle's yaw while seated.
H2. `headingOffset` wraps into (-PI, PI]. `markerPosition(offset)` returns `0.5 + offset / COMPASS_FOV`, or null if `|offset| > COMPASS_FOV / 2`. A null marker shows as an edge arrow on the side of the offset's sign.
H3. `compassTarget`: `checkpointIndex` is the index of the last checkpoint reached (`status.checkpoint`); the target is checkpoint `checkpointIndex + 1`'s trigger centre if it exists, else the finish centre; null when `won`. Check the meaning of `status.checkpoint` (0 at the start) in `world.ts` before implementing and state it in the test.
H4. Compass label shows the distance to the target in metres, rounded, e.g. `340 m`; empty when the target is null.
H5. Minimap: the route is drawn as one SVG path. `mapViewFor` keeps the aspect ratio, centres the route, and leaves `margin` pixels. Size 140 px on desktop, 110 px on touch. A route with fewer than 2 points draws no path and uses scale 1 centred on its single point (or the origin when empty).
H6. Minimap entities: vehicle (one marker), the local player (marker with a facing tick) only when on foot, other players, service stops (fuel and garage differ in colour), checkpoints (reached ones dimmed). The map is north-up and does not rotate. An entity outside the map clamps to the border.
H7. Vehicle bars show fuel and health as fractions; below 0.2 the bar turns red (class `low`).
H8. Timer text uses the same floor-to-tenths rule as `clock` in `overlay.ts`; export `clock` from there and reuse it. Wallet is `status.wallet`.
H9. Own health bar shows `local.health` / 100. A downed local player sees the centre text `DOWNED 12s` (`Math.ceil` of seconds) and no prompt.
H10. Slots: exactly three, `local.inventory[i]`, `selected` where `i === local.slot`. Item kinds show as a short label (`jerrycan`, `toolbox`, `health kit`).
H11. Prompt: the existing `interactHint` and the use hint from `useHint`, interact first; the text without the key letter prefix is not needed, keep the current wording. Hold progress shows as a bar under the prompt when `local.hold` is set.
H12. Downed teammates: for each other player with `downed !== null`, a marker at `pos + (0, 1.2, 0)` projected to the screen, showing the name and `Ns`. Markers behind the camera are hidden. They draw above everything, so they show through walls.
H13. Nothing shows before the first snapshot: `buildHudModel` returns `vehicle: null`, empty `mapEntities` and a null compass marker.
H14. The HUD hides itself (`display: none`) outside the `playing` phase and when the lobby, results or shop menus are up; the lobby and results screens already cover the page.
H15. Touch: the safe-area insets are applied with `env(safe-area-inset-*)` on the container's padding; the minimap is 110 px; the slots sit left of the action buttons (the existing touch UI's buttons stay as they are). Do not move any touch control.
H16. `F3` toggles the debug overlay; it is hidden by default for players, but the e2e test sets it visible (`localStorage` key `lodgy.debug` = `1` read at start, plus `F3`). Change the e2e helper to set the key, not to press F3, so no timing is involved. The overlay element stays in the DOM and keeps updating when hidden, so tests that read it by `textContent` keep working.
H17. The HUD does not allocate per frame beyond the model: DOM writes only on change (compare to the last written value).

## Tests (numbered)

T1 compass: `bearingTo` for the four axes, with the spec's yaw convention.
T2 compass: `headingOffset` wraps (350° vs 10° gives 20°, not 340°) and is positive to the right.
T3 compass: `markerPosition` is 0.5 at zero offset, 0 and 1 at the edges, null beyond.
T4 compass: `compassTarget` returns the next checkpoint, then the finish after the last, null when won.
T5 minimap: `mapViewFor` fits a long thin route inside `size` with the margin and keeps aspect; a route of 1 point and an empty route do not produce NaN.
T6 minimap: `toMap` puts north (-z) up and the route's first point inside the box.
T7 minimap: `routePath` starts with `M` and has one `L` per further point; empty for fewer than 2.
T8 model: fuel and health fractions and the `low` threshold boundary at exactly 0.2.
T9 model: slots always have 3 entries, selected index matches.
T10 model: downed self shows the ceil of seconds; downed others list excludes the local player and the not downed.
T11 model: no snapshot gives the null model of H13.
T12 model: prompt and hold progress; downed local gives no prompt.
T13 model: `mapEntities` has the vehicle, the local player only on foot, stops, checkpoints with the reached flag.
T14 markers: a point in front projects inside the screen; behind the camera is flagged `behind`.
T15 existing: `overlayText` output is unchanged after the `useHint` extraction (the existing overlay tests pass untouched).
T16 e2e: the existing smoke test still passes with the debug overlay hidden (reads through `textContent`), and one added assertion that `#hud` is visible while playing.

## Tasks

1. Extract `useHint` and export `clock` in `overlay.ts` (T15). No behaviour change.
2. Compass maths (T1 to T4).
3. Minimap maths (T5 to T7).
4. `hudModel.ts` (T8 to T13).
5. `downedMarkers.ts` (T14).
6. `hud.ts`, `index.html` styles, wiring in `main.ts` and `game.ts`, the debug overlay toggle (H14 to H17), e2e change (T16).
7. `ROADMAP.md`: step 12 to `needs sign-off`, decision D-HUD1, "Runnable today" line, known issue "HUD layout not hand-checked". Run all checks.

Review after each task by a Sonnet reviewer; Opus reviews the whole branch at the end.

## Amendments after the plan review (binding; where they differ from the text above, they win)

R1. `buildHudModel(data: OverlayData, course: { checkpoints: readonly Checkpoint[]; finish: Box }): HudModel`. `OverlayData` and the `overlayText` tests stay unchanged.
R2. `bearingTo(from, to) = atan2(-dx, -dz)` (yaw convention: 0 faces -z, positive turns left). `headingOffset(heading, bearing) = wrap(heading - bearing)`, positive when the target is to the right. T2: `headingOffset(10°, 350°) = +20°` and the reverse `-20°`.
R3. `projectMarker(project: (p: Vec3) => { x: number; y: number; z: number }, cameraSpaceZ: (p: Vec3) => number, pos, width, height)`. The client passes closures over the Three.js camera (`Vector3.project(camera)`, and the point's z in camera space). `behind` is camera-space z >= 0. A marker that is in front but off screen is clamped to the screen border.
R4. `HudModel` gains: `vehicle.fuelLow` and `vehicle.healthLow` (fraction < `LOW_FRACTION` = 0.2, so exactly 0.2 is not low); `compass.side: -1 | 0 | 1` (0 when the marker is inside the strip); map entities gain optional `reached` (checkpoints, `index <= status.checkpoint`), `stopKind` (stops) and `yaw` (self). Their tests are added to T8, T3 and T13.
R5. On touch the HUD does not draw inventory slots; the existing `#touch-slots` stays. On desktop the HUD draws them.
R6. H16 is replaced: the debug overlay is hidden by default and toggled by `F3` (with `preventDefault`) or by `localStorage` key `lodgy.debug` = `1` read in try/catch. e2e specs `smoke`, `touch` and `reconnect` are unchanged because `textContent` works on hidden elements. T16 becomes: those specs pass unchanged, and the smoke test asserts the visible id of each region: `hud-compass`, `hud-minimap`, `hud-vehicle`, `hud-health`, `hud-slots`, `hud-prompt`.
R7. Position used for compass distance and bearing: the vehicle's position while seated, otherwise `predicted ?? local snapshot pos`. Heading: `yawOf(vehicle.rot)` seated, `aim.yaw` on foot.
R8. Added tests: H2 edge side; H4 label (`340 m`, empty when null); H6 border clamp and reached dimming; H10 labels; H12 name, seconds, 1.2 m offset. Item labels come from one exported table in `ui/hud/itemLabels.ts` (`jerrycan`, `toolbox`, `health kit`), used by the HUD only; touchUi keeps its own.
R9. Use `Math.ceil(x - 1e-9)` for both downed seconds. With no `status`, timer is `0:00.0` and wallet 0.
R10. `prompt` is the interact hint then the use hint joined with `'   '`, wording unchanged.
R11. The HUD hides when the phase is not `playing`, and also while the run menu or shop menu is open.
R12. Named exported constants in `hud/constants.ts`: `LOW_FRACTION = 0.2`, `MARKER_HEIGHT = 1.2`, `MAP_SIZE_DESKTOP = 140`, `MAP_SIZE_TOUCH = 110`, `MAP_MARGIN = 8`.
R13. Task 7 also updates the spec's HUD section (the mock-up sentence) and adds D-HUD1 to the decisions log.
