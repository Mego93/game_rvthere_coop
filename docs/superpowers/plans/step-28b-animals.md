# Step 28b: animals (goats and scooters that appear as you approach)

This plan fixes names, rules and test cases. Implementers write the tests first. Where the plan and the spec disagree, or neither answers a question, stop and report. All numbers are starting values (feel is the owner's); the step ends at `needs sign-off`.

## Decisions already taken (owner, 2026-11-15) and rulings (2026-11-17)

- Goats and scooters are annoying with a small penalty (owner). Ruling: the penalty is a small amount of vehicle health per animal hit, no time penalty (the results rank by time and a penalty would need a new rule); no animal is destroyed, a hit knocks it away.
- They appear as the vehicle nears, server-controlled so every player sees the same, with a seeded random so runs are reproducible (owner). Ruling: the seed is fixed per course (a hash of the course id), so every run of `marrakech` has the same animals at the same places; a different seed per run is a later option.
- Ruling: at most `AMBIENT_MAX_GOATS` 6 and `AMBIENT_MAX_SCOOTERS` 3 alive at once, which keeps the snapshot well inside its 16 KB limit; the budget is measured in T9.
- Ruling: scooters do not honk or chase; a scooter crosses the road once and goes on. A goat trots across the road once and then wanders off the road.
- Art: no goat model exists in the repo (the 82 CC0 models are nature, city and cars). Task 4 draws a blocky goat and reuses the scooter prop mesh; real models are a later art step.

## Rules

R1. **Dynamic props.** `createProps` gains `spawn(id: string, kind: PropKind, centre: Vec3, rot: Quat, linvel: Vec3): Prop` and `remove(id: string): void` (the body and collider are removed; held props cannot be removed). `snapshot()` lists live props, so a removed prop vanishes from the next snapshot (the client and the predictor already drop unlisted ids: verify and cover with a test). Spawned ids are `a-<n>`, never reused within a run. Existing props, ids and course order are unchanged.
R2. **Prop kinds.** `PROP_KINDS` gains `goat`: class `light`, half extents `(0.3, 0.45, 0.6) * CHARACTER_SCALE`, mass 35, friction 0.6, `anchor: null`. The existing `scooter` is reused as is. `goat` and `scooter` are in a new `ANIMAL_KINDS` array in `constants.ts` (so players cannot pick them up: `interact` ignores animals; a goat is heavier than the carry limit in spirit but is excluded by kind).
R3. **Ambient director** (`packages/shared/src/ambient.ts`, new; owned by the world, stepped each tick before physics). Inputs: the course route (`course.route`, with arc length), the vehicle position, the seed. State: the plan (below) and the live animals. Behaviour, per tick:
 a. The plan is a list of spawn events built once from the seed (a small deterministic PRNG, e.g. mulberry32, implemented in `ambient.ts`; no `Math.random`): one event about every 180 m of route (kind goat 70 %, scooter 30 %, lateral side from the seed), never within 150 m of a stop, a hazard, a pit or the start and finish, and never on an inserted terrain segment (the plan reads `course` positions only: the director takes a `blocked` list of route spans built in `course.ts` from the segment ranges, see R6).
 b. When the vehicle's along-route position gets within `AMBIENT_SPAWN_AHEAD` (90 m) of an event that has not fired, and the live count of that kind is below its maximum, the director spawns the animal at the road edge of the event's side at the event's along position (goat: 1 m beyond the road edge on the shoulder; scooter: at the road edge, facing across).
 c. A spawned animal acts once: a goat waits until the vehicle is within `AMBIENT_TRIGGER` (45 m) then crosses at `AMBIENT_GOAT_SPEED` (2.0 m/s) straight across the road (lateral), stops on the far shoulder and stays; a scooter starts crossing at the same trigger at `AMBIENT_SCOOTER_SPEED` (4.5 m/s) and keeps going until it is `AMBIENT_SCOOTER_RUN` (40 m) past the far edge. The crossing is done by setting the body's linear velocity each tick (the body is dynamic and can be pushed); rotation is locked upright.
 d. An animal is removed when the vehicle is more than `AMBIENT_DESPAWN_BEHIND` (80 m) past it along the route, or it falls below the kill plane, or the run ends (restart, checkpoint reset, new course). A checkpoint reset or restart removes every live animal and re-arms the events that lie ahead of the new vehicle position (events behind it stay fired).
 e. The director is deterministic given the seed and the vehicle path; two worlds fed the same inputs have the same animals (T4).
R4. **Hit rule.** When the vehicle (any vehicle collider) touches an animal at a relative speed above `ANIMAL_HIT_SPEED` (2.0 m/s) and that animal has not yet hurt in this run (one hit per animal id), the vehicle's health drops by `ANIMAL_HIT_DAMAGE` (0.03 of full health) and the world emits an `animalHit` event `{ id, kind }` (new `WorldEvent` variant; optional on the wire like step-25 fields so old clients ignore it). The animal is not damaged; the push of the collision is the existing physics. A hit cannot reduce health below the existing floor rules (a vehicle at 0 health is already broken; no negative values).
R5. **Wire and client.** The snapshot lists animals as ordinary props (kind `goat` or `scooter`); nothing else is added. The client draws `goat` with a blocky body (a box body, a head, four legs, two horns; colour 0xcbbf9a) and `scooter` with the existing prop mesh. The `animalHit` event plays a short sound (the existing `hit` sound at lower volume) and adds a toast "Goat!" or "Scooter!" through the existing toast mechanism (the seat toast code is the pattern); the toast is optional and may be a console-free HUD line.
R6. **Course data.** `course.ts` `BuiltCourse` gains `ambient: { id: string; from: number; to: number }[]` spans (along-route distances) where animals may not spawn: inserted terrain, stops, hazards, pits and hills, the first and last 150 m; `buildCourse` computes them from the segment ranges. The route arc length is already available (`course.route`). Courses without long routes (the `test` course, `segment-demo`) get the director only when `route length > 1,500 m`, so the `test` and `airport` courses are unchanged (the director is off there; `airport` is 2.6 km: it is on, with the same rules; the existing airport tests must not break: T8).
R7. **Predictor.** Animals are props: prediction of the local player's walk already handles props as snapshot data; nothing new.

## Tests (numbered)

T1. `props.spawn` and `remove`: a spawned prop appears in `snapshot()` with its id, pose and kind, is a dynamic body with the kind's mass, a removed prop is gone from the next snapshot and its collider handle no longer maps; a held prop cannot be removed (throws); ids are not reused.
T2. Plan builder (pure): the seed gives the same plan twice; a different seed gives a different one; spacing is about 180 m; no event inside a blocked span or within 150 m of one; goat/scooter proportions over a long route are within 15 % of 70/30; the number of events on `marrakech` is within 10 % of route length / 180.
T3. Director behaviour on a scripted vehicle path (no physics, a fake vehicle position): an animal spawns when the vehicle is 90 m before the event and not before; the maxima hold; a goat starts crossing at 45 m and ends on the far shoulder; a scooter runs 40 m past the far edge; removal at 80 m behind; a restart or checkpoint reset removes all and re-arms only the events ahead.
T4. Determinism: two worlds with the same seed and the same scripted inputs have equal snapshots (positions to 1e-6) over 20 s of simulated drive past three events.
T5. Hit rule: a vehicle driven into a standing goat at 6 m/s loses `ANIMAL_HIT_DAMAGE` health once and emits one `animalHit`; a second contact with the same goat does not; a contact below `ANIMAL_HIT_SPEED` costs nothing; health stays in [0, 1]; the animal is not removed by the hit.
T6. `interact`: animals cannot be picked up, held, thrown or used as an anchor; a player standing on the road is shoved as for any prop (existing rule), not hurt unless the existing prop-hit rule says so.
T7. Client: `propMesh` draws `goat` (a group with the named parts) and still draws every other kind; the snapshot with animals is within the 16 KB limit with the maxima alive (6 goats, 3 scooters, 6 players) at the worst-case course (`marrakech`): assert the size.
T8. Existing courses: `test` and `segment-demo` have no director; `airport` and `marrakech` do; the existing airport drive and solo tests pass unchanged (the director is off in the drive rigs by a `world` option `ambient: false`, which the rigs set so that the scripted tests stay deterministic; add one drive test with it on that completes a segment with animals present).
T9. Performance: the director adds under 0.1 ms per tick (median) on `marrakech` with the maxima alive; the plan builds in under 50 ms.
T10. Protocol: the `animalHit` event round-trips through the codec and an old client that does not know it ignores it (no throw).

## Existing tests that change

- `constants` tests that enumerate `PROP_KINDS` (grep `PROP_KINDS` in tests: `props.test.ts`, `scale.test.ts` and any exhaustive per-kind loops) gain `goat`; each must still pass without weakening (the `scale.test.ts` size table gains the goat).
- `interact.test.ts`, `predictor.test.ts`, `protocol.test.ts` need the new event variant only where they enumerate event kinds.
- The drive and solo rigs (`driveRig.ts`, `soloRig.ts`) set `ambient: false`.
- `marrakech.measure.test.ts` and `marrakech.drive.test.ts` use the rigs, so they stay as they are.

## Tasks

1. **Dynamic props, `goat` kind, `ANIMAL_KINDS`** (R1, R2, T1, T6).
2. **Plan and director** (R3, R6, T2 to T4, T8 to T9), with the course spans.
3. **Hit rule, event, wire** (R4, T5, T10).
4. **Client drawing, toast, sound, snapshot budget** (R5, R7, T7), `ROADMAP.md`, the spec (a "Animals" subsection under Props), every check.

Review after each task by a Sonnet reviewer; Opus reviews the plan and the whole branch when the weekly limit resets (Nov 19); the standing owner request is to merge at the end of each step.

## Out of scope

Item spawns (28c), parkour (28d), animal sounds, real animal models, animal health or chasing AI, a per-run seed, a time penalty.
