# Step 23: World art (sky, ground, models, scatter, characters, sound)

Owner request (2026-11-15): "i want to look like a real game, not a sloppy ai game": maps, 3D models, items, skybox, sounds, "a lot of assets", fetched from internet sources. Owner choices: licences CC0 and CC-BY; low-poly stylised; HUD first (done), then assets.

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md` ("Courses and segments": palette ochre walls, red earth, green palms; "Sound"; "iPhone specifics": DPR cap 2, shadows off on touch). Code: `packages/client/src/render/` (`scene.ts` builds the static scene from the built course; `conditions.ts` owns sky colour, sun, ambient, fog and weather per time of day; `vehicleMesh.ts`, `propMesh.ts`, `coinMesh.ts`, `playerMesh.ts`, `winchMesh.ts`), `packages/client/src/audio/`, `packages/client/public/sounds/` (with `LICENSE.md`).

This plan fixes rules, constants and test cases. Implementers write the tests first where logic is testable. The look cannot be tested: after each task the implementer takes headless screenshots (a script outside the repo, in the scratchpad; Chromium with `--use-gl=swiftshader`) and the coordinator reads them. The step ends at `needs sign-off`.

## Sources (already tested reachable from this environment)

- **Poly Haven (CC0)** via `https://api.polyhaven.com` and `https://dl.polyhaven.org`: sky HDRIs, ground textures.
- **OpenGameArt (CC0 and CC-BY)**, direct zips under `https://opengameart.org/sites/default/files/`. Verified CC0 packs with `.glb` models: Kenney Car Kit (`kenney_car-kit_3.1.zip`), Kenney City Kit Commercial / Suburban / Roads (`kenney_city-kit-*`), Kenney Nature Kit (`Nature Kit (2.1).zip`), Kenney Racing Kit; "Construction Site Kit" (FBX only), "LowPoly Desert Props" (`lowpoly_desert_props.zip`, FBX and one glTF with Arab houses), Quaternius "Stylized Nature MegaKit" (`stylized_nature_megakitstandard.zip`, 104 MB: only a few models are copied).
- **Not reachable:** kenney.nl, poly.pizza (403); Quaternius's own site downloads (Google Drive); dl.polyhaven.org's root. Do not try to add more hosts.
- Archives are untrusted data: download into new empty folders in the scratchpad, list contents and reject unsafe paths before extracting, extract into their own folder, never run anything from inside. Only `.glb` / `.gltf` / `.png` / `.jpg` / `.hdr` / audio files are copied into the repo.

## Licence and credits (rule L)

L1. Every file copied into the repo is CC0 or CC-BY 3.0/4.0, checked on its source page, never assumed. A non-CC0 file needs its author, source URL and licence in `packages/client/public/CREDITS.md`; each CC0 pack is listed there too with the pack name, author when known, source URL and "CC0 1.0". A test checks that every model file under `public/models/` and every HDRI and texture under `public/env/` and `public/textures/` is covered by a section of `CREDITS.md` (by its folder).
L2. Do not use a file whose licence is unclear, NC or ND, or whose page does not state one.
L3. Total additional download size budget: models and textures at most 12 MB, HDRIs at most 8 MB (1k resolution), sounds at most 4 MB. The Quaternius zip is 104 MB: download it only if a needed model is not available elsewhere; commit at most the chosen models.

## Rendering rules (R)

R1. Sky and light: replace the flat sky colour by an HDRI background and image-based lighting per time of day: `dawn`, `midday`, `sunset`, `night`. The implementer picks four 1k `.hdr` files from Poly Haven's `skies` category (pure-sky or low-horizon-clutter, so the world's own ground can stand under them), recorded in `CREDITS.md`, loaded with `RGBELoader` and `PMREMGenerator`, set as `scene.background` and `scene.environment` (with `environmentIntensity` per time of day). `conditions.ts` keeps owning the sun direction, fog and weather; the sun's direction is made consistent with the HDRI's brightest direction only if cheap, else left as is. The night sky uses a night HDRI (stars) with low intensity. A sandstorm and rain keep their fog; when fog is on, the background is faded by the fog colour (as today).
R2. Renderer: `outputColorSpace = SRGBColorSpace`, `toneMapping = ACESFilmicToneMapping` with exposure per time of day (a constant table in `conditions.ts`), shadows on for the sun only on non-touch devices (`PCFSoftShadowMap`, a 2048 map following the camera target within 80 m), off on touch (as the spec says).
R3. Ground: a large terrain plane (about 4 km × 4 km, centred on the course's bounding box) under and around the road, textured with a tiling sand or red-earth texture from Poly Haven (`textures` category, 1k diffuse JPG plus normal map at most), slightly below the road surface so there is no z-fighting; far edges fade into the fog or the horizon. The road boxes (existing `course.ground` meshes) keep their collision and get a tiling asphalt texture (road), gravel texture (gravel), the sand texture (sand), a pebble or riverbed texture (riverbed); texture repeat is set from the box size (UV scale in metres, a constant `TEXTURE_METRES_PER_REPEAT`). No texture is larger than 1024 px; touch uses the same textures with `anisotropy = 1`.
R4. Fog and haze: a distance fog tinted by the time-of-day horizon colour so the far terrain meets the sky (the fog density constants stay in `conditions.ts`).
R5. Loading: all models, textures and HDRIs load before the run's first frame; the page shows the existing connecting or lobby state until the assets are ready (a `preloadAssets(onProgress)` promise; failure to load one non-essential asset logs once and falls back to the primitive it replaces, never throws).
R6. Performance: draw calls on desktop under 400 with the scatter; on touch the scatter radius and the texture set are reduced (R9). All scatter uses `InstancedMesh`. No per-frame allocations in the scatter's update.

## Model rules (M)

M1. Loader: `packages/client/src/render/models.ts` exports `loadModels(names: readonly string[]): Promise<void>`, `hasModel(name: string): boolean` and `instantiate(name: string): THREE.Group | null` (clones with shared geometry and materials; returns `null` for an unknown or failed name). Models are `.glb` files in `packages/client/public/models/<pack>/<name>.glb`, loaded with `GLTFLoader`. A manifest `modelManifest.ts` maps each logical key (below) to a file path and a target size.
M2. Scale and origin: every model is normalised once on load (bounding box measured, re-centred so its origin is the bottom centre, scaled to its logical key's target size in metres from the manifest). Collision shapes are untouched: models are visual and are fitted to the existing collision boxes.
M3. Logical keys and candidate sources (the implementer verifies the file names by listing the extracted packs and reports the final mapping; a key with no good file keeps its current primitive):
- `vehicle.lodgy`: Kenney Car Kit `van.glb` or `suv.glb` (whichever matches the Lodgy's box better), scaled to the Lodgy's `halfExtents`; wheels spin only if the model has separate wheel nodes (else the existing wheel boxes are not drawn). `vehicle.rv`: keep the custom motorhome of step 17 unless a Kenney model clearly fits better (`delivery.glb` scaled to the RV box is the candidate: the implementer takes a screenshot of both and chooses; recorded in the report).
- `prop.crate`, `prop.cart`, `prop.scooter`, `prop.barrier`: Kenney City Kit Roads `construction-barrier.glb`, `construction-cone.glb`, `construction-fence.glb`, Car Kit `box.glb`, Construction Site Kit parts (FBX would need `FBXLoader`: skip unless needed), Quaternius or Nature Kit crates and carts; a scooter has no obvious CC0 model: keep the primitive.
- `pickup.jerrycan`, `pickup.toolbox`, `pickup.healthKit`: the closest CC0 models found (Kenney or Quaternius props); else keep primitives, coloured as today.
- `anchor.palm`, `anchor.boulder`, `anchor.milestone`: Kenney Nature Kit palm and rock models (`tree_palm*`, `rock_*`/`stone_*`), a stone post for the milestone.
- `stop.fuel`, `stop.garage`: Kenney City Kit Commercial buildings (a low-detail building plus awning or parasol details) placed beside each stop's zone, facing the road, purely visual (the existing zone and post stay).
- `decor.*` for the scatter (R7): palms (`tree_palm*`, desert props `Palm_tree_*` converted only if a glb exists), cactus (`cactus_short`, `cactus_tall`), rocks (`rock_*`, `stone_*`), bushes and grass tufts, small buildings (City Kit Suburban and Commercial low-detail buildings, the glTF Arab houses), fences, electricity poles and street lights (City Kit Roads) along the city segments.
M4. Characters: players are drawn with a low-poly humanoid instead of capsule plus sphere if a CC0 or CC-BY glb character exists on OpenGameArt (search "low poly character", "blocky character", "survivor", CC0 first); it keeps the player's colour as a tinted material or a coloured vest. If none is found with a licence and format that work, keep the capsule and report.

## Scatter rules (S)

R7. `scatterDecor(route, seed, options): DecorPlacement[]` is a pure function in `packages/client/src/render/decorScatter.ts`: given the course's `route` polyline, a seed derived from the course id, the segment kinds along the route (an array of `{ type, fromDistance, toDistance }` computed from the `CourseDef`; `BuiltCourse` has no segment info: the course builder is not changed, so the client reads `getCourseDef(id)` or the scatter takes the def; see S2), it returns `{ model: string; x: number; y: number; z: number; yaw: number; scale: number }[]`.
S1. Rules: deterministic for the same inputs (a seeded PRNG, no `Math.random`); no placement within `ROAD_WIDTH / 2 + DECOR_ROAD_MARGIN` (4 m) of the route polyline; none inside a service stop's zone (+3 m), within 3 m of a prop, pickup, anchor or coin, or inside ford water; sand segments get palms (the course's own palm anchors are kept) and low scrub; ford gets rocks and reeds-like grass; bank gets rocks; alley gets nothing (it has walls); road segments near the start get scrub and the odd palm, the city edge and airport road (the last 600 m) get City Kit buildings, fences, street lights and poles at both sides; rural roads get fields (crops, bushes), rocks and distant hills made of Nature Kit cliff blocks scaled up, set 60 to 200 m from the route. Density constants live in one table `DECOR_DENSITY` (per 100 m of route per side) in `decorScatter.ts`.
S2. The scatter is client-only: it never touches the simulation or the shared course. It needs the segment list: export `airport` already is a `CourseDef` in `packages/shared/src/courses/airport.ts`; add to the courses index a function `getCourseDef(courseId: string): CourseDef | null` (a read-only map of the defs; the built courses are unchanged; `test` has no def and gets a small default scatter of rocks and bushes only on the segment-demo and none on the test ground).
S3. Chunks: placements are grouped into 100 m cells along the route; `InstancedMesh` per (cell, model); only cells within `DECOR_RADIUS` (desktop 350 m, touch 200 m) of the camera are added to the scene, others removed, updated at most once per 0.5 s. Total instance cap per frame: desktop 3,000, touch 1,200.
S4. Decor is added to shadow casting only for objects taller than 3 m, and never on touch.

## Sound rules (A)

A1. Add CC0 sounds from OpenGameArt: a desert wind ambience loop (mono WAV or MP3 per the existing rule: loops as mono WAV), a better engine loop if one is clearly better than the current (listen is impossible: choose by the pack's description and length, report), footsteps on sand (a short set), a vehicle horn (key H), distant birds or insects loop for day, crickets for night. Each recorded in `public/sounds/LICENSE.md`. Wiring in `packages/client/src/audio/`: ambient loops follow the time of day; footsteps play for the local player and others at a rate from their speed on the ground (positional, quiet); the horn on key H (a new input action, `horn`, sent to the server as an event? NO: the horn is client-local and positional for the local player only; no protocol change in this step).
A2. No new protocol messages, no new simulation behaviour in this step.

## UI polish (U)

U1. Minimap: show only the stretch of the route within 400 m of the vehicle, as a rotating or north-up zoomed circle centred on the vehicle (a pure `mapWindow` function with tests), so the stack of dots disappears; stops and checkpoints inside the window only; the full route is not drawn. The model's `mapEntities` are unchanged; the HUD filters and zooms.
U2. Player name labels: smaller, only for other players within 40 m, with a soft shadow (not the large white outline).

## Files

- New: `packages/client/public/models/**`, `public/env/*.hdr`, `public/textures/**`, `public/CREDITS.md`, `packages/client/src/render/models.ts`, `modelManifest.ts`, `decorScatter.ts` (+ tests), `environment.ts` (HDRI, ground, textures), `packages/client/src/ui/hud/mapWindow.ts` (+ tests), `scripts/assets/` (an optional helper to re-fetch; not required).
- Changed: `scene.ts`, `conditions.ts`, `vehicleMesh.ts`, `propMesh.ts`, `playerMesh.ts`, `game.ts`, `main.ts` (preload), `hud.ts` (minimap window), `audio/*`, `packages/shared/src/courses/index.ts` (`getCourseDef`), `ROADMAP.md`, the spec (art direction paragraph).

## Tests (numbered)

T1 L1: every folder under `public/models/`, `public/env/`, `public/textures/` has a section in `CREDITS.md`; the file lists are consistent with the manifest (every manifest path exists).
T2 M1/M2: `modelManifest` keys are unique; every manifest file exists and is a `.glb`; no manifest target size is zero or above 30 m.
T3 R7/S1: `scatterDecor` is deterministic; no placement is within `ROAD_WIDTH/2 + 4` of the route; none in a stop zone or near an object; counts per model are within bounds for the airport; the airport road end has buildings and the sand segment has palms.
T4 S3: the chunk selector returns only cells within the radius and respects the instance cap (pure function over cells and a camera position).
T5 U1: `mapWindow` returns only route points within 400 m of the vehicle, and entities clamped to the circle.
T6 getCourseDef: returns the airport def, and `null` for `test`.
T7 existing tests pass unchanged, except tests that need to change because of an intentional signature change (the implementer lists them).
T8 e2e: the existing smoke and touch specs pass; the page shows no console errors with the new assets (the smoke test already asserts no page errors).
T9 Screenshot review (not automated): lobby, run start, driving on rural road, sand, ford, bank, alley, roadworks, city edge, at midday, sunset and night, on a desktop and an iPhone-landscape viewport, read by the coordinator and shown to the owner.

## Tasks

1. Asset pipeline: download and curate packs, copy the chosen files, `CREDITS.md`, `models.ts`, `modelManifest.ts`, `preloadAssets` (T1, T2).
2. Environment: HDRI sky and IBL per time of day, renderer settings, ground and road textures, fog tuning (R1 to R6). Screenshots.
3. Decor scatter with chunked instancing and `getCourseDef` (R7, S1 to S4, T3, T4, T6). Screenshots.
4. Object models: vehicles, props, pickups, anchors, stops, character (M3, M4). Screenshots.
5. Minimap window and name labels (U1, U2, T5).
6. Sounds (A1).
7. `ROADMAP.md`, spec paragraph, decision D-ART1, all checks, final screenshots for the owner.

Review after each task by a Sonnet reviewer; Opus reviews the whole branch at the end.
