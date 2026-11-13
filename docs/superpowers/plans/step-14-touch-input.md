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
