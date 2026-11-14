# Step 14: Touch input, floating joystick, touch UI, landscape layout, web app manifest

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md`, sections:
- "Controls" (the iPhone column);
- "iPhone specifics";
- "HUD" (the touch paragraph);
- the "Client" module list (`input`: two sources, chosen by pointer capability at load);
- Testing ("input layer", and the browser test at an iPhone viewport with touch emulation).

ROADMAP carried row for step 14: the home form on a real iPhone. No zoom when a field is focused, and the form scrolls with the keyboard open in landscape.

This plan fixes interfaces, constants, rules and test cases. Implementers write the tests first, then the code. Where the plan and the spec disagree, or neither answers a question, stop and report. This step ends at `needs sign-off`: the owner checks it on a real iPhone.

This work runs **in parallel with step 9** in a git worktree on branch `step-14-touch-input`. It touches only `packages/client`, `index.html`, the Vite public folder and the Playwright config, plus one pure helper moved into `shared` (rule T9). Task 2 starts after step 9's task 3 has merged into the worktree branch, because it uses step 9's `useTarget` context.

## Goal

On a touch device the page uses a touch input source:
- a floating joystick on the left half;
- look by dragging on the right half;
- buttons for interact, use, jump or brake, and reel;
- the slots tapped to select and long-pressed to drop.

The layout is landscape only and respects safe areas. Pinch, double-tap and pull-to-refresh do nothing. The page can be added to the home screen.

## Constants (`packages/client/src/input/touchConfig.ts`, exported; client only)

| Name | Value | Meaning |
|---|---|---|
| `JOYSTICK_RADIUS` | 60 | px from the touch origin to full deflection |
| `JOYSTICK_DEAD_ZONE` | 0.12 | fraction of the radius that reads as 0 |
| `TOUCH_LOOK_SENSITIVITY` | 0.006 | rad per px of drag |
| `LONG_PRESS` | 0.5 | s on a slot before it drops the item |
| `TOUCH_MAX_PIXEL_RATIO` | 2 | already applied for every device; kept |

These are starting values for the owner to tune.

## Rules

T1. **Source choice.** At load, `matchMedia('(pointer: coarse)').matches` picks the touch source. Otherwise the keyboard and mouse source is used. The choice is made once and is not changed while the page is open. `createGame` receives the chosen source instead of building the keyboard source itself.

T2. **Joystick** (pure, `input/joystick.ts`). The signature is:

```
joystickVector(origin: {x,y}, point: {x,y}, radius, deadZone): { moveX, moveY }
```

- Let `d` be the screen offset, with y flipped so that up is positive. Let `m = |d| / radius`, clamped to 1.
- If `m ≤ deadZone`, the result is (0, 0).
- Otherwise the result is `(d / |d|) · (m − deadZone) / (1 − deadZone)`.

So the output is continuous at the dead zone and has length 1 at the radius. The server already clamps `moveX` and `moveY` to −1..1 and accepts analog values.

T3. **Touch tracking** (pure state machine, `input/touchTracker.ts`). The API is:

```
createTouchTracker(width(): number)
```

with the methods `start(id, x, y)`, `move(id, x, y)`, `end(id)` and `cancelAll()`, and the queries `joystick(): { origin, point } | null` and `takeLook(): { dx, dy }`.

- A touch that starts in the left half (`x < width / 2`) becomes the joystick, if none is active. Its origin is the start point, so the joystick floats.
- A touch that starts in the right half becomes the look touch, if none is active. Every move adds to the look delta.
- Other touches are ignored until they end.
- `end` of the joystick touch clears the joystick. `end` of the look touch stops the look.
- `takeLook` returns the delta accumulated since the last call and resets it.
- `cancelAll` (`touchcancel`, `blur`, `visibilitychange` to hidden) clears everything.
- Touches that start on a button or a slot never reach the tracker (T6).

T4. **Look.** `input/look.ts` holds the shared yaw and pitch state:

```
createLook(): { yaw, pitch, apply(dx, dy, sensitivity) }
```

- It uses the same wrap into (−π, π] and the same pitch limit as `mouse.ts`.
- `mouse.ts` is changed to use it, with the same behaviour. Its existing tests must pass unchanged.
- The touch source applies `takeLook()` with `TOUCH_LOOK_SENSITIVITY` on each `sample()`, with the same signs as the mouse: dragging right turns right, dragging up looks up.

T5. **Buttons** (`input/touchButtons.ts`, pure press tracking). There is one tracker per button:

```
createButton(): { down(), up(), sample(): boolean }
```

- `sample()` is true while the button is held, or if it was pressed since the last sample. This is the keyboard's "tapped" rule, so a tap shorter than a tick still counts.
- The buttons map to these fields: interact → `interact`; use → `use`; jump → `jump` (labelled "Brake" while the local player is seated); reel in → `reel = 1`; reel out → `reel = −1`.
- If both reel buttons are held, the result is 0.

T6. **Touch UI** (`ui/touchUi.ts`, DOM).
- It builds the buttons and three slot tiles in a fixed layer above the canvas. Each element handles its own `touchstart`, `touchend` and `touchcancel` and calls `preventDefault` and `stopPropagation`, so the canvas tracker never sees it.
- The layout puts the action buttons at the bottom right, beside the slot tiles, as the spec's HUD paragraph says. The exact arrangement is the owner's call in the HUD step.
- Every edge offset uses `env(safe-area-inset-*)`.
- `update(view: TouchView)` is called once per frame with:

```
TouchView = {
  seated: boolean;
  useVisible: boolean;
  reelVisible: boolean;
  slots: (ItemKind | null)[];
  selected: 0 | 1 | 2;
}
```

  It shows or hides the use and reel buttons, sets the jump label, and highlights the selected slot. It only changes the DOM when a value changes.

T7. **Slots.**
- A tap (released before `LONG_PRESS`) on a slot tile selects that slot.
- A press held for `LONG_PRESS` selects the slot and sends `drop` for one sample, once per press.
- The touch source's `slot` field is the last selected slot.

T8. **Touch view** (pure, `ui/touchView.ts`):

```
touchView(snapshot, localId, aim, config): TouchView
```

- `useVisible` is true when the local player is not seated and step 9's `useTarget` with the overlay's context returns a target. The overlay and the touch view must build that context the same way; extract the overlay's builder if needed.
- `reelVisible` follows T9.

T9. **Reel availability.** World rule W5 decides who may reel (the driver, or a player on foot within `HOOK_RANGE` of the winch mount at `PUSH_HEIGHT`). It is extracted into a pure exported function in `shared`:

```
canReel(player: { seat, pos }, mount: Vec3, driverSeatId): boolean
```

- `world.ts`'s `reelInput` uses it, with the same behaviour; the existing winch tests are the check.
- `reelVisible` is `canReel(...)` for the local player, and the cable state is not `stowed`.

T10. **Page behaviour on touch devices.**
- The canvas and the touch layer have `touch-action: none`. `user-select: none` and `-webkit-touch-callout: none` are set on the game layers.
- `gesturestart` gets `preventDefault`.
- `overscroll-behavior: none` is set on `html` and `body`.
- The home page's form fields keep a font size of at least 16 px, so iOS does not zoom on focus. This covers the carried row's first half.
- Shadows stay disabled on touch devices. If no shadows exist yet, nothing changes; check with `grep shadow`.
- The pixel ratio cap of 2 stays.

T11. **Landscape.**
- While `matchMedia('(orientation: portrait)')` matches on a touch device, a full-screen prompt "Rotate your phone to landscape" covers the game. The game keeps running underneath.
- The home page is not covered, because the form is usable in portrait.

T12. **Web app manifest.**
- `packages/client/public/manifest.webmanifest` has:
  - `name` "Lodgy Co-op", `short_name` "Lodgy";
  - `start_url` "/", `display` "fullscreen", `orientation` "landscape";
  - `background_color` and `theme_color` `#cfe6f5`;
  - one 512×512 and one 192×192 PNG icon (a plain coloured square with "L", generated by a small script in `scripts/`, committed as PNGs).
- `index.html` links the manifest and adds:
  - `apple-mobile-web-app-capable` `yes`;
  - `apple-mobile-web-app-status-bar-style` `black-translucent`;
  - `apple-touch-icon` (the 192 PNG).
- The node static server serves `.webmanifest` with `application/manifest+json`. Add the type if `static.ts` lacks it, with a test.

T13. **The overlay's control line** shows the touch wording on touch devices: `joystick move   drag right half to look   buttons act`.

## Modules and signatures

- `client/src/input/`:
  - new: `touchConfig.ts`, `joystick.ts`, `touchTracker.ts`, `touchButtons.ts`, `look.ts`, and `touch.ts`, whose `createTouchSource(canvas, ui): InputSource` combines T2–T7;
  - changed: `mouse.ts` (T4).
- `client/src/ui/`:
  - new: `touchUi.ts` (T6, T7, T11's prompt) and `touchView.ts` (T8);
  - changed: `overlay.ts` (T13; the context builder shared with T8).
- `client/src/main.ts`: T1, T10, T11 wiring.
- `client/src/game.ts`: takes the source from `main`; calls `touchUi.update(touchView(...))` per frame when touch is active.
- `shared/src/winch.ts` or `seats.ts`: `canReel` (T9); `world.ts` uses it.
- `client/index.html`: T10, T12. `client/public/`: T12.
- `server/src/node/static.ts`: the manifest MIME type, if missing.
- `playwright.config.ts`: the phone project already exists (WebKit). The local config is Chromium only, so add a local-only project `phone-chromium` to `e2e.local.config.ts` (untracked) with `hasTouch: true, isMobile: true` and a landscape iPhone viewport. CI keeps the WebKit project.

## Existing tests that change

- `mouse.test.ts`: none. It must pass unchanged against the refactor.
- `combined.test.ts`: only if `createInputSource`'s signature changes. Prefer to keep it, and add the touch source beside it.
- `overlay.test.ts`: the control-line test gains a touch case. The default stays desktop.
- Winch and world tests: none. They must pass unchanged against T9.
- `e2e/smoke.spec.ts`: the phone project gains the touch assertions (C5). The desktop cases stay.

## Tests (numbered)

Pure (Vitest):
- U1. `joystickVector`:
  - inside the dead zone gives 0;
  - just outside it gives a small value;
  - at the radius, the length is 1;
  - beyond the radius it is clamped;
  - screen up gives positive `moveY`;
  - a diagonal keeps its direction;
  - the output is continuous at the dead-zone edge (within 1e-6).
- U2. `touchTracker`:
  - a left touch becomes the joystick with its own origin;
  - a second left touch is ignored;
  - a right touch drives look while the joystick is held (multi-touch);
  - ending the joystick touch clears it while look continues;
  - `takeLook` resets;
  - `cancelAll` clears both;
  - a touch at exactly `width / 2` counts as right.
- U3. `look.apply`: wraps yaw, clamps pitch, and uses the same signs as the mouse.
- U4. `createButton`: a tap between two samples counts once; a hold counts on every sample; release clears it.
- U5. Touch source, with a fake UI and tracker:
  - the joystick maps to `moveX` and `moveY`;
  - look is applied;
  - the buttons map to their fields;
  - both reel buttons give 0;
  - a slot tap sets `slot`;
  - a long press gives `drop` true for exactly one sample.
  - It uses fake timers for `LONG_PRESS`.
- U6. Keyboard and touch sources produce the same `InputFields` shape: same keys and same types. This is the spec's "input layer" test.
- U7. `touchView`:
  - seated gives `seated` true and `useVisible` false;
  - a jerrycan near a vehicle with fuel below full gives `useVisible`;
  - the driver with the cable attached gives `reelVisible`;
  - a stowed cable gives no reel.
- U8. `canReel`: the driver, a player on foot in range, out of range, and a passenger.
- U9. The static server answers `/manifest.webmanifest` with the manifest MIME type.

Browser (Playwright, the local `phone-chromium` project and CI's `phone`):
- C5. On the phone project:
  - the joystick layer and the interact, jump and slot elements are visible;
  - the use and reel buttons are hidden at the start;
  - a touch drag on the left half changes the local player's predicted position, read from the overlay's `you` line;
  - tapping slot 2 highlights it.
  - The desktop project asserts that no touch UI is present.

## Tasks

1. **Touch input.** T1–T5, T7's press logic, U1–U6, the `look.ts` refactor and the `createGame` source injection.
   - Commit: `feat(client): a touch input source with a floating joystick and look drag`.
2. **Touch UI.** Starts after step 9's task 3 is in the branch.
   - Covers T6–T9, T13, U7, U8, and the `canReel` extraction.
   - Commit: `feat(client): touch buttons and slots shown by context`.
3. **Page and manifest.** T10–T12, U9, C5 and the local Playwright project.
   - Commit: `feat(client): landscape layout, gestures suppressed and a web app manifest`.
4. **Documents** (main session):
   - ROADMAP: step 14 → `needs sign-off`.
   - Carried row 14: the zoom half is done; the form scrolling with the keyboard is for the owner's check.
   - Log T1–T13.
   - "Runnable today".
   - The owner's checklist.

Each task: tests first, then a Sonnet review. Run `npm test`, `npm run typecheck` and `npm run build` before each commit, and Playwright in task 3.

## What the owner checks by hand (on a real iPhone)

- The joystick feel and dead zone, and the look sensitivity.
- Button positions and sizes, and whether a thumb reaches them.
- The safe areas on a notched phone.
- The rotate prompt.
- Add to Home Screen opening fullscreen in landscape.
- No zoom on double-tap or pinch, and no pull-to-refresh.
- The home form with the keyboard open.

## Known risks to watch in review

- The in-run menu button belongs to step 11 (the menu does not exist yet). Add a carried row to step 11: "the touch menu button".
- iOS Safari fires `touchcancel` when a system gesture takes over. `cancelAll` must release every held button too, or a button can stick.
- `pointer: coarse` is false on some touch laptops; they get keyboard and mouse, which is intended.

## Amendments after the plan review (binding; where they differ from the text above, they win)

Facts checked in the code:
- `static.ts` already serves `.webmanifest` as `application/manifest+json; charset=utf-8`.
- The home form is already at 16 px.
- No render shadows exist.
- No test checks the overlay's control line.
- Vitest runs with `environment: 'node'`, so there is no DOM; tests use `EventTarget` with fake events, as `keyboard.test.ts` does.
- Playwright 1.65 has only `touchscreen.tap()`.
- `pointer: coarse` is true in Chromium with the iPhone 14 landscape device (750×340).
- Step 9 commits straight onto `claude/tender-carson-9525v1`.

L1 (T1, game input).
- `source.ts` gains `export interface GameInput extends InputSource { aim(): { yaw: number; pitch: number } }`.
- `createInputSource` (`combined.ts`) returns `GameInput`, with `aim()` reading the mouse. Its parameters are unchanged, so `combined.test.ts` passes unchanged.
- `createTouchSource` returns `GameInput & { joystick(): { origin: {x,y}; point: {x,y} } | null }`.
- `GameView` gains `input: () => GameInput` and `touchUi: TouchUi | null`.
- `main.ts` picks the factory once at load (by `matchMedia`) and passes it to every `createGame`. `createGame` calls `view.input()` once at start and disposes that instance in `stop()`.
- Every per-frame `mouse.yaw()`/`mouse.pitch()` in `game.ts` becomes `input.aim()`: the drawn yaw, `cameraPlacement` and the overlay's `aim`.
- The touch source drains `takeLook()` into its look in both `aim()` and `sample()`, so the camera turns at frame rate.
- The pointer-lock exit in `stop()` stays.

L2 (the boundary between the source and the UI). `input/touch.ts` exports:
```
type TouchButtonName = 'interact' | 'use' | 'jump' | 'reelIn' | 'reelOut';
interface TouchControls {
  onButton(handler: (name: TouchButtonName, down: boolean) => void): void;
  onSlot(handler: (slot: 0 | 1 | 2, down: boolean) => void): void;
  onCancel(handler: () => void): void;
}
createTouchSource(opts: { surface: EventTarget; win: EventTarget; doc: EventTarget & { visibilityState: string }; width(): number; controls: TouchControls }): GameInput & { joystick(): { origin; point } | null }
```
- **Touch events.** The source creates its own tracker (`createTouchTracker(opts.width)`). It listens for `touchstart`, `touchmove`, `touchend` and `touchcancel` on `surface`, with `{ passive: false }`, using each event's `changedTouches` (`identifier`, `clientX`, `clientY`). It does not require `event.isTrusted`.
- **Cancelling.** Any of these cancels everything: `blur` on `win`; `visibilitychange` to hidden on `doc`; `touchcancel`; `controls.onCancel`. Cancelling means `tracker.cancelAll()`, releasing every button, dropping a pending tap and clearing any pending long press.
- **Long press.** It uses `setTimeout(LONG_PRESS * 1000)`.
- **Who implements what.** `touchUi` implements `TouchControls`. U5 builds the source with a fake `TouchControls` and plain `EventTarget`s; there is no fake tracker. U5 uses `vi.useFakeTimers()`.
- **Tracker width.** T3's `width` is `() => window.innerWidth`.

L3 (browser tests).
- C5 lives in a new file `e2e/touch.spec.ts`.
- **Desktop-only smoke tests.** The smoke cases driven by the keyboard (boarding, walking, the seated case, and any other case that uses `keyboard` or `tap(page, 'Key…')`) get ` @keyboard` appended to their titles. The phone projects get `grepInvert: /@keyboard/`. Do this only after step 9's edits to `smoke.spec.ts` are in the branch.
- **Projects.** Add a tracked project to `playwright.config.ts`: `{ name: 'phone-chromium', use: { ...devices['iPhone 14 landscape'], browserName: 'chromium' } }`. `e2e.local.config.ts` (untracked) adds `launchOptions.executablePath: '/opt/pw-browsers/chromium'` to the desktop and phone-chromium projects and leaves out the WebKit `phone` project. The WebKit project stays for machines that have WebKit. There is no CI, so the plan's "CI" wording is void.
- **Skipping.** In `touch.spec.ts`, the touch cases skip when the `hasTouch` fixture is false. A desktop case asserts that `#touch-ui` is absent or hidden.
- **Dragging.** Drags use `locator('#game').dispatchEvent('touchstart'|'touchmove'|'touchend', { touches, changedTouches, targetTouches })` with `{ identifier: 1, clientX, clientY }` objects:
  - start at (150, 250);
  - move to (150, 170), which is 80 px;
  - hold for 1 s;
  - then send `touchend`;
  - poll until the `you` position has moved more than 2 m.
- **Slot tap.** It uses `locator('#touch-slot-1').tap()`, then polls for `aria-pressed="true"`.
- **Joystick.** `#touch-joystick` is hidden at the start, visible during the drag, and hidden after it.
- "Existing tests that change" gains `e2e/smoke.spec.ts` (titles only) and `playwright.config.ts`.

L4 (T9, reel).
- `canReel(player: { seat: string | null; pos: Vec3; downed: number | null }, mount: Vec3): boolean` goes in `shared/src/winch.ts`.
- It is true when `seat === 'driver'`, or when `seat === null && downed === null` and the distance from `mount` to `pos + (0, PUSH_HEIGHT, 0)` is ≤ `HOOK_RANGE`.
- `reelInput` keeps its order: the driver's reel wins, otherwise the first player in join order who passes `canReel` and presses reel.
- U8 goes in `winch.test.ts` and includes a downed player in range.
- On the client, `mount = add(vehicle.pos, rotate(vehicle.rot, config.winchMount))`.
- `reelVisible = canReel(local, mount) && (cable.state === 'attached' || cable.state === 'ground')`. Both buttons show together. U7 adds: a held hook gives no reel buttons.

L5 (order of work).
- Task 1 may start now: `input/*`, the input lines of `game.ts`, and `main.ts`.
- Tasks 2 and 3 start only after step 9 is merged to `main` and merged into `step-14-touch-input`.
- Step 14 merges after step 9.
- `useTarget`'s context is step 9's J6 form. Extract it as `buildUseContext(local: PlayerSnapshot, players: PlayerSnapshot[], vehicle: VehicleState, config: VehicleConfig, aim: { yaw: number; pitch: number })` in a new `client/src/ui/useContext.ts`. `overlay.ts` and `touchView.ts` both import it, and the overlay's hint tests must pass unchanged.

L6 (T13). `OverlayData` gains the optional field `touch?: boolean`. When it is absent or false, the existing control line stays word for word. `overlay.test.ts` gains two new tests:
- by default the text ends with `WASD move   Space jump (brake when driving)   E board or leave   click to look`;
- with `touch: true` it ends with `joystick move   drag right half to look   buttons act`.

The hint lines keep the keyboard wording until the HUD step.

L7 (T6, ids and layering).
- **Ids and labels.**

  | Element | Id | Label |
  |---|---|---|
  | Root | `#touch-ui` | |
  | Interact button | `#touch-interact` | "Act" |
  | Use button | `#touch-use` | "Use" |
  | Jump button | `#touch-jump` | "Jump", or "Brake" when seated |
  | Reel-in button | `#touch-reel-in` | "Reel in" |
  | Reel-out button | `#touch-reel-out` | "Reel out" |
  | Slots | `#touch-slot-0` to `#touch-slot-2` | |
  | Joystick | `#touch-joystick` | |
  | Rotate prompt | `#rotate-prompt` | |

  The selected slot has `aria-pressed="true"` and the class `selected`. The other slots have `aria-pressed="false"`.
- **The joystick** is a ring of radius `JOYSTICK_RADIUS` centred on the origin, plus a knob at the touch point clamped to the ring. `TouchUi` gains `setJoystick(state: { origin; point } | null)`, which `game.ts` calls each frame with `input.joystick()`. The joystick is hidden while the state is null.
- **Layering.** `#touch-ui` is `position: fixed; inset: 0; pointer-events: none`, with a z-index above `#overlay` and the canvas. Only the buttons and slots have `pointer-events: auto` and `touch-action: none`.
- **Touch ownership.** Each button and slot follows the `identifier` of the touch that started on it, and goes up when that touch ends or is cancelled. Other touches on the same element are ignored.
- **Lifetime.** `createTouchUi(root: HTMLElement): TouchUi & TouchControls & { dispose(): void }`. `main.ts` creates it on the first run on a touch device. `#touch-ui` is shown while a game runs and hidden on `onClose`.

L8 (T7).
- A slot press selects that slot at once, on `touchstart`.
- If the same touch is still down after `LONG_PRESS`, `drop` latches true. The next `sample()` reports it and clears it, so one press gives at most one sample with `drop`.
- Releasing early cancels the timer.
- The server applies `slot` before `drop` in the same tick.

L9 (U5 additions).
- With a button held and a slot press pending, a `blur`, a `touchcancel` or `controls.onCancel` gives every button false at the next sample, and no `drop` after `LONG_PRESS`.
- A tap made before the cancel is dropped too.

L10 (U9). U9 becomes:
- (a) `server.test.ts` gains `expect(contentType('x.webmanifest')).toBe('application/manifest+json; charset=utf-8')`;
- (b) in `touch.spec.ts`, on the desktop project, `page.request.get('/manifest.webmanifest')` returns 200 with that type, and its JSON `start_url` is "/". `/icon-192.png` returns 200 with `image/png`.

Drop "add the type if missing" from T12.

L11 (touchView).
- Signature: `touchView(data: Pick<OverlayData, 'config' | 'vehicle' | 'players' | 'localId' | 'aim' | 'cable'>): TouchView`.
- With no local player or a null vehicle, it returns `{ seated: false, useVisible: false, reelVisible: false, slots: [null, null, null], selected: 0 }`.
- `seated` is `local.seat !== null`.
- `slots` and `selected` come from the local snapshot.
- While the local player is downed, `useVisible` and `reelVisible` are false. U7 covers this.

L12 (constants and CSS).
- Delete the `TOUCH_MAX_PIXEL_RATIO` row. `main.ts` keeps its cap of 2.
- T10's shadow sentence becomes: "`renderer.shadowMap` is never enabled and no mesh has `castShadow`; nothing changes".
- The T10 CSS is unconditional. `user-select: none` and `-webkit-touch-callout: none` go on `#game` and `#touch-ui` only, never on `#home`. `gesturestart` is prevented on `document`.

L13 (icons). `scripts/icons.mjs` uses only `node:zlib`: `deflateSync` for IDAT and `crc32` for the chunks.
- It writes RGBA PNGs to `packages/client/public/icon-192.png` and `icon-512.png`.
- Each icon is a `#2f6f9f` square with a white "L" made of two rectangles:
  - the stem spans x 30–45 % and y 20–80 %;
  - the foot spans x 30–70 % and y 65–80 %.
- It is run by hand (`node scripts/icons.mjs`), and the PNGs are committed. There is no npm script and no dependency.
- `<link rel="icon" href="data:,">` becomes the 192 PNG, which is also the `apple-touch-icon`.

L14 (tests).
- U2 adds:
  - a move or end with an unknown or ignored id changes nothing;
  - a second right touch while a look touch is active is ignored.
- U6 becomes: for the combined source and the touch source, the sorted `Object.keys` and each value's `typeof` are equal, and `parseClientMessage({ type: 'input', seq: 1, ...sample })` is not null.

L15 (scope and documents).
- The scope line above also covers `shared/world.ts`, `shared/winch.ts` and `server.test.ts`.
- Task 4 changes:
  - Carried row 14 moves into the owner's checklist unchanged and is not marked done.
  - Add a carried row to step 11: the touch menu button.
  - Add a carried row to step 12: the touch hint wording, and the overlay's size on a 340 px tall screen (it covers the slot tiles).
- The owner's checklist notes that iOS treats `display: fullscreen` as standalone and ignores `orientation`, so the rotate prompt matters.
