# Step 22: A cleaner HUD (restyle)

Owner request (2026-11-15): "i want more clean hud". Spec: "HUD" (the position table is unchanged). Code: `packages/client/src/ui/hud/hud.ts` (the `STYLE` string and the DOM builder), `hudModel.ts` (unchanged), `touchUi.ts` (unchanged), `packages/client/src/ui/hud/touchWording.ts`.

This plan fixes constants, rules and test cases. Implementers write the tests first. Where the plan and the spec disagree, or neither answers a question, stop and report. This is a visual restyle: the look cannot be tested, so the step ends at `needs sign-off`. Do not change positions, element ids, the model, or any behaviour; the e2e specs depend on the ids `hud`, `hud-compass`, `hud-minimap`, `hud-vehicle`, `hud-health`, `hud-slots`, `hud-prompt`.

## Visual direction (all in `hud.ts`)

V1. One style language: panels are translucent "glass" instead of black boxes: background `rgba(12, 16, 24, 0.38)`, `backdrop-filter: blur(6px)` (with the `-webkit-` prefix, for iPhone Safari), a 1 px border `rgba(255, 255, 255, 0.14)`, radius 12 px, no hard shadows. Text is white at 92% with a soft text shadow so it reads over bright sky and sand. One font stack: `system-ui, sans-serif`, with `font-variant-numeric: tabular-nums` for numbers.
V2. Compass: slimmer (22 px high), no centre line box; ticks only. The target marker is a small chevron and the distance label sits to its right in smaller type at 70% opacity. Edge arrows stay but are drawn as thin chevrons.
V3. Minimap: circular (clip the SVG with a circle of the map size), same size as now (140 px desktop, 110 px touch), a thin ring border; the route stroke 2 px at 55% white; the vehicle a small yellow triangle-free dot as now (no change of shapes); the background glass of V1.
V4. Vehicle panel: no text labels. Each row is an inline SVG icon (fuel drop, wrench for hull) of 14 px followed by a thin 6 px bar (radius 3). Timer in 15 px semi-bold tabular numerals; the wallet shows a small gold dot before its number. The panel drops its minimum width to 112 px. The `low` state keeps its red and adds a slow pulse (opacity 0.7 to 1, 1.2 s), disabled under `prefers-reduced-motion`.
V5. Own health: a slim bar (6 px) with a heart icon, no panel background, 120 px wide. When health is 100 the whole element sits at 40% opacity and returns to 100% below 100 (a class `full` toggled by the model's `ownHealth >= 100`, through the existing write cache).
V6. Slots (desktop only, as now): 52 px square glass tiles, an inline SVG icon per item kind (`jerrycan`, `toolbox`, `healthKit`) centred, the label (`Fuel`, `Tools`, `Heal`) below at 10 px, and the number 1 to 3 as a small badge in the top-left corner. The selected tile has a 2 px `#ffd34e` ring and scales to 1.08. An empty tile shows only its badge at 40% opacity.
V7. Prompt: split the prompt into key caps and text. A new pure function `splitPrompt(prompt: string): { key: string | null; hold: boolean; text: string }[]` in `packages/client/src/ui/hud/splitPrompt.ts` splits the joined prompt on the three-space separator and, for each part, recognises the exact leading patterns `E to `, `F to `, `Hold E to `, `Hold F to `, `Act to `, `Use to `, `Hold Act to `, `Hold Use to ` (the touch wording of step 20 uses Act and Use). `key` is the letter or word (`E`, `F`, `Act`, `Use`), `hold` is true when the part starts with `Hold `, `text` is the rest (for example `board`, `refuel`). A part with no recognised pattern gives `key: null` and the whole part as `text`. The DOM renders each part as a key cap (a 22 px rounded square with the key, or a pill for `Act` and `Use`) followed by the text; a hold part draws a small hold ring around the key cap and the hold progress bar under the prompt stays as now. The prompt background is glass (V1) with 6 px 12 px padding.
V8. Downed: the centre `DOWNED Ns` becomes a glass pill with a red border and 22 px text; teammate markers become small glass pills with a red dot, name and seconds.
V9. Touch: the same style, no layout change; the vehicle panel stays below `#touch-menu`; nothing overlaps `#touch-ui` (z-index 5 stays below 10).
V10. No new dependency and no images: the icons are inline SVG strings kept as constants in `packages/client/src/ui/hud/icons.ts` (`ICON_FUEL`, `ICON_HULL`, `ICON_HEART`, `ICON_JERRYCAN`, `ICON_TOOLBOX`, `ICON_HEALTHKIT`, `ICON_COIN`), each a string with `viewBox="0 0 24 24"`, `fill="currentColor"`, no external references and no scripts.
V11. Colours are tokens at the top of `STYLE` as CSS custom properties on `#hud` (`--hud-glass`, `--hud-border`, `--hud-accent` `#ffd34e`, `--hud-fuel` `#ffb23e`, `--hud-good` `#6ee07a`, `--hud-bad` `#ff4e4e`, `--hud-info` `#4ec3ff`), used everywhere instead of literals.
V12. Performance: `backdrop-filter` is used on at most the six panels above; it is switched off on touch devices (`#hud.touch .panel { backdrop-filter: none; background: rgba(12, 16, 24, 0.55); }`) because iPhone GPUs pay for it; the DOM write cache stays; no new per-frame work beyond the existing cache checks.

## Files

- `packages/client/src/ui/hud/icons.ts` (new), `splitPrompt.ts` and `splitPrompt.test.ts` (new).
- `packages/client/src/ui/hud/hud.ts`: `STYLE`, the DOM builder (icons, key-cap rendering, the `full` class, the circular minimap clip).
- `ROADMAP.md`, the spec's HUD section (one sentence about the restyle).

## Tests (numbered)

T1 splitPrompt: `E to board` gives `[{key:'E', hold:false, text:'board'}]`.
T2 splitPrompt: `Hold F to refuel` gives key `F`, hold true, text `refuel`.
T3 splitPrompt: the joined `Act to board   Hold Use to refuel` gives two parts with keys `Act` and `Use`, holds false and true.
T4 splitPrompt: text with no pattern (`Press E to board`, empty string) gives `key: null`; an `E` inside a name (`Hold F to revive Eve`) keeps `Eve` in the text.
T5 hud.ts: a DOM test (jsdom if the client tests already use it; otherwise skip and cover through e2e) that after `update` with a model whose `ownHealth` is 100 the health element has the class `full`, and without it at 64; and that the prompt renders one key cap per part. If the client test environment has no DOM, the implementer says so and T5 moves to the e2e smoke test (`#hud-prompt .keycap` count when a prompt is showing).
T6 e2e: the existing smoke assertions on `#hud-compass`, `#hud-minimap`, `#hud-vehicle`, `#hud-health`, `#hud-slots` and `#hud-prompt` pass unchanged.
T7 icons: each exported icon constant is a string starting with `<svg`, containing `viewBox="0 0 24 24"`, with no `http`, `<script` or `on` event attributes.

## Tasks

1. `icons.ts`, `splitPrompt.ts` and their tests (T1 to T4, T7).
2. `hud.ts` restyle and DOM changes (V1 to V6, V8 to V12, T5, T6).
3. `ROADMAP.md`, the spec sentence, decision D-HUD2 (the owner asked for a cleaner HUD; the style direction V1 to V12; the owner adjusts at sign-off), every check.

Review after each task by a Sonnet reviewer; Opus reviews the whole branch at the end.

## Amendments after the plan review (binding; where they differ from the text above, they win)

R1. V3 (circular minimap): the route and entities must stay inside the circle. `mapViewFor` takes the margin as today, and the HUD passes `margin = MAP_MARGIN + size * (1 - Math.SQRT1_2) / 2` for the circular map (so the bounding box fits the inscribed square of the circle), and entities are clamped radially: a new pure `clampToCircle(view: MapView, point: { x: number; y: number }): { x: number; y: number }` in `minimap.ts` that keeps a point within `size / 2 - 3` of the centre by scaling it toward the centre. `clampToMap` stays (its tests unchanged). New test T8: `clampToCircle` leaves inside points unchanged and pulls a corner point onto the radius. The clip is `border-radius: 50%` on the `<svg>` element plus `overflow: hidden`.
R2. T5 is an e2e check in `e2e/smoke.spec.ts` (the vitest environment is `node`; no DOM library is installed): `#hud-health` has the class `full` at spawn, and `#hud-prompt .keycap` has count 1 after the `hint     E to board` check. `.keycap` is the class of each key cap; the `Act` and `Use` caps also carry `.pill`.
R3. V6 slot structure: each tile has three children, a badge (`.badge`, the number), an icon holder (`.icon`) and a label (`.label`). The icon changes only when the slot's kind changes (`changed(node, 'kind', kind)`), the label text goes to the label span, and a class `empty` is toggled through `flag`. The tile's `textContent` is never written.
R4. V7 rendering: the key caps are rebuilt only when the joined prompt string changed (`changed(promptText, 'prompt', value)`); with no prompt all children are removed (so `#hud-prompt-text:empty` still hides it). Caps and text are built with `textContent` and `createElement`, never `innerHTML` (a player name can be in the text). `splitPrompt` matches the `Hold` patterns before the plain ones. A name with three spaces in a row would split wrongly: the implementer collapses runs of spaces in the prompt text before splitting.
R5. V1 and V12: every glass element carries the class `glass` (compass, minimap, vehicle panel, slot tiles, prompt pill, downed pill, health). The touch override is `#hud.touch .glass { backdrop-filter: none; -webkit-backdrop-filter: none; background: rgba(12, 16, 24, 0.55); }`. Teammate markers are `glass` for colour but never blurred (no `backdrop-filter` on `.marker`). `#hud-health` keeps no panel padding: its row has an explicit height of 14 px so it stays visible and non-zero in size.
R6. V5: `full` is set when `ownHealthFraction(model.ownHealth) >= 1`, on `#hud-health`, through `flag`. The `low` pulse of V4 also applies to the own health bar when below `LOW_FRACTION`.
R7. T7: the "no event attributes" check uses the regex `/\son[a-z]+\s*=/i`.
R8. Wording: V2 hides `#hud-compass-centre` in CSS (the node and id stay); the vehicle marker on the minimap keeps its current rounded-rectangle shape (V3's "triangle-free dot" means no change); the touch vehicle panel stays at `top: 56px`, below `#touch-menu` (12 + 36 = 48 px); `prefers-reduced-motion` also disables the slot's scale transition.
