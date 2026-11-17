# Step 33: Sketchfab art pass

Owner feedback (2026-11-17): Souleyman should be different typical Arabian figures (owner: several, rotating); "the models of items, obstacles etc. are still plain and simple, search on Sketchfab for each; same for sprites, skybox etc." The owner saw the shortlist contact sheets and said "go with top pick".

Sourcing is done: `/tmp/claude-0/-home-user-game-rvthere-coop/5acd5587-6ec8-5a8c-a7ac-add3210a5d58/scratchpad/sketchfab/shortlist.md` (table per category, uid, author, licence, attribution text) and the rank-1 GLBs in `.../sketchfab/picks/<category>/<item>-<uid>/` with `ATTRIBUTION.txt`. All CC BY 4.0 except the coin (CC0).

## Decisions

- D1 Rank-1 pick in every category (owner). Physics never changes: each model is fitted to the existing hit box (`targetSize` per axis where the shape differs).
- D2 Souleyman: Sketchfab has no usable Moroccan character in the game's blocky style (none rigged; the best loads grey in three 0.187). Souleyman variants are built from the game's own blocky character (`characters/character-c.glb`, CC0) with the step 31 rig approach: four looks, one per checkpoint by `index % 4`: (a) brown djellaba with a pointed hood, (b) white robe with a white turban, (c) striped djellaba with a red fez, (d) robe with the Sketchfab Arab headdress (`205773`). All named Souleyman; the greeting is unchanged.
- D3 Size budget: the 21 picks are 29 MB as downloaded, 27 MB of it embedded textures. Every texture is resized to at most 512 px (256 px for items and props) and re-encoded; the whole new set must add at most 8 MB to `packages/client/dist`. Flat-colour picks are copied as they are.
- D4 Skies (Poly Haven, CC0, 1k): add `qwantani_night_puresky` (time of day `night`) and `kloofendal_overcast_puresky` (weather `rain` and `sandstorm`, the sandstorm with a warm fog tint); the existing four skies stay. If `night` already maps to a sky, the new one replaces it only if it is darker and reads as night (screenshot both).
- D5 Credits: every CC BY model gets an entry in `CREDITS.md` and `packages/client/public/CREDITS.md` with its attribution text and "modified: textures resized" (and "recoloured" where flat-tinted).

## Files

- `scripts/assets/optimizeGlb.mjs` (new, dev only): resizes embedded textures in a GLB and writes it out; reproducible; the implementer chooses the library (for example `@gltf-transform/core` and `@gltf-transform/functions` as dev dependencies) and reports it; it must run with `npm` on Linux and macOS.
- `packages/client/public/models/sketchfab/<name>.glb` (new): the optimised picks, names: `jerrycan`, `toolbox`, `first-aid`, `tajine`, `coin`, `crate`, `barrier`, `cart`, `scooter`, `goat`, `rocks`, `tyres`, `cone`, `palm`, `agave`, `cliffs`, `kasbah`, `mosque`, `stall`, `mountains`, `headdress`.
- `packages/client/public/env/`: the two skies.
- `render/modelManifest.ts`: entries for the new models; existing keys that change file: `prop.crate`, `prop.barrier`, `prop.cart`, `prop.cone`, `anchor.boulder`; new keys `item.jerrycan`, `item.toolbox`, `item.healthKit`, `item.tajine` (shipped now, used by step 34), `coin`, `animal.goat`, `animal.scooter`, `prop.scooter` (if a scooter prop exists), `decor.agave`, `decor.kasbah`, `decor.mosque`, `decor.stall`, `decor.tyres`, `decor.cliffs`, `decor.mountains`, `souleyman.headdress`.
- `render/propMesh.ts`, `render/animalMeshes.ts`, `render/coinMesh.ts`, item meshes: use the models with the existing procedural mesh as the fallback when a model fails to load (the existing `hasModel` pattern).
- `render/souleyman.ts`: four variants (D2), still merged per material per variant (at most 5 variants × 6 meshes).
- `render/environment.ts`: the sky mapping (D4).

## Rules

1. Every model is scaled to its target (manifest) so its bounding box matches the physics hit box within 10 % on each axis for props, items and animals; decor uses the given longest side.
2. Loading stays non-blocking as today; a missing model falls back to the current mesh and logs once.
3. Animals keep their knock and tilt animation on the model.
4. No change to shared, server, protocol or physics.
5. Decor placement of the new decor models (kasbah, mosque, stall, agave, tyres, cliffs, mountains) is Task 2, after step 32's corridor lands (it changes `decorScatter.ts`).

## Tests (write first where there is logic)

1. `modelManifest.test.ts` (existing): every entry's file exists in `public/models`; the new keys are present.
2. A size test: the sum of `public/models/sketchfab/*.glb` is at most 8 MB, each file at most 1.5 MB; the two new skies exist.
3. `souleyman.test.ts`: four variants, `index % 4` selection, merged mesh count bounded, the headdress parented to the head.
4. Fit tests: for each prop, item and animal model, the fitted bounding box matches the hit box within 10 % (load the GLB in Node with the existing model loader test helpers, or measure from the glTF accessors' min/max).
5. Credits test (existing `credits.test.ts`): every CC BY file under `public/models/sketchfab` has a credits entry.
6. Screenshots (not committed): items, props, animals and the four Souleymans in the game scene.

## Tasks

1. Task 1 (client, now, in its own worktree `step-33-art`): optimisation script, the optimised models and skies, credits, manifest, props, items, coin, animals, Souleyman variants, sky mapping; tests 1–6.
2. Task 2 (client, after step 32 merges): place the new decor models along the course (kasbah and mosque in the villages and the city stretch, stalls near fuel stops, agave and tyres near the road, cliffs and mountains beyond the ridge); screenshots.
3. ROADMAP, spec, checks, push, PR, merge.
