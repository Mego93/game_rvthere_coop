# Step 35: UI redesign

Owner feedback (2026-11-17): "better UI (use the front end design skill)". The `frontend-design` plugin is offered to the owner for install; if it is available in the session, implementers load it before designing. Otherwise they follow the direction below.

Scope: every screen and overlay the player sees: home, lobby (with chat and the character picker), HUD (minimap, compass, vehicle gauges, health, inventory slots, seat chip, prompts, event toasts, chat toasts and panel, emote wheel, downed markers), run menu, shop, results, controls help, tutorial, credits, reconnect banner, rotate prompt, touch controls. No change to game rules, protocol, server, physics or rendering of the 3D world.

## Direction

- Theme: "Marrakech road trip": warm, sunlit and playful, readable at a glance while driving. Palette as CSS custom properties: sand `#f3e3c3`, terracotta `#c8553d`, saffron `#f2a541`, majorelle blue `#2f4fd8`, deep teal `#0f5257`, ink `#1d1a17`, plus a semi-transparent dark glass for HUD panels (`rgba(20, 16, 12, 0.55)`, no `backdrop-filter` on touch devices). Accents only from the palette; the per-player colours keep their roles (swatch, ring).
- Type: one display face for titles and numbers and one text face, self-hosted from npm (`@fontsource/*`, SIL OFL; exact package names chosen and pinned by Task 1, at most 2 families, at most 4 weights, `font-display: swap`), with system fallbacks. Credits list the fonts.
- Shape: rounded panels (12–16 px radius), a thin zellige-inspired geometric border motif on titled panels (CSS gradients or one small SVG, no raster images), clear focus rings, 44 px minimum touch targets, safe-area insets everywhere.
- Motion: short (120–250 ms) ease-out transitions for panels and toasts; nothing animates in the HUD while driving except the toasts and value changes; everything respects `prefers-reduced-motion`.
- Contrast: WCAG AA for all text against its background (HUD text over the 3D scene sits on the dark glass).

## Rules

1. Every existing element id and every `data-` attribute that tests or e2e specs use stays (the e2e specs select by id); new wrappers are allowed around them.
2. Styles live in one shared token module `packages/client/src/ui/theme.ts` (CSS custom properties and the shared button, panel, chip, slot and toast classes, injected once) that every component's `STYLE` uses; no component hard-codes a palette colour after this step (a test greps the component STYLE strings for raw hex colours outside `theme.ts`, allowing only player colours from data).
3. Layout: desktop 1280×800 and phone landscape 844×390 / portrait 390×844 for the lobby and home; the game itself is landscape-only on phones. No horizontal scroll at 320 px for home and lobby. HUD elements never overlap each other at 667×375, 844×390, 1280×720 and 1920×1080 (a layout test computes the HUD boxes from the CSS positions where they are numeric, or a Playwright check measures them).
4. HUD readability: the gauges show icon plus bar plus number; the minimap and compass get a framed, consistent style; inventory slots show the selected slot clearly; toasts appear top centre below the compass and stack at most 2.
5. Performance: no per-frame DOM layout thrash introduced (HUD updates write only changed text or transforms, as today); the HUD adds no more than 2 extra composited layers on touch.
6. Fonts and the theme add at most 250 KB to `dist`.

## Tests

1. `theme.test.ts`: tokens exist; the raw-hex check of rule 2.
2. Existing UI tests keep passing; any test that pins markup changes is named in the task report.
3. Playwright screenshots (not committed) at the sizes of rule 3 for home, lobby, in-game HUD (on foot and driving), chat open, emote wheel, run menu, shop, results, help; plus an overlap check of the HUD boxes at the four sizes (a script, its result in the report).
4. Size check of rule 6 (dist before and after).

## Tasks

1. Task 1: theme tokens, fonts, shared classes; home, lobby (picker and chat), results, credits, reconnect, rotate prompt.
2. Task 2 (after Task 1): HUD, toasts, chat panel, emote wheel, touch controls, run menu, shop, controls help, tutorial.
3. ROADMAP, spec, checks, push, PR, merge.
