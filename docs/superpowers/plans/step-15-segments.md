# Step 15: Segment system — the six segment builders and the course builder

Spec: `docs/superpowers/specs/2026-11-11-lodgy-coop-design.md` (sections "Courses and segments", "Losing the vehicle: checkpoint restart" (a checkpoint at the start of every segment), "Collision", "shared" (`BuiltCourse`), "Unit tests" (segments), "Scenario tests" (built courses)). This plan fixes interfaces, constants, rules and test cases. Implementers write the tests first, then the code. Where the plan and the spec disagree, or neither answers a question, stop and report (CLAUDE.md, "When something is not specified").

This step runs **in parallel with steps 7 to 14** (owner's permission, 2026-11-13). It adds new modules and touches existing ones only where named; it does not change the test ground or any simulation code. Implementers work in a separate git worktree; the main session merges.

## Goal

A course is data: an ordered list of segment definitions. `buildCourse(def)` chains the segments, each built in its own frame by one of six builders, into the same `BuiltCourse` the test ground is. A demo course using every segment type is registered as `segment-demo`, so `VEHICLE=… npm run dev` can drive it once the room can select a course (step 11); until then it is exercised by tests and by `COURSE=segment-demo` (S12).

Not in this step: course 1 itself and its landmarks (16), the simulation of stops and coins (10), new art beyond simple meshes.

## Decisions made in this plan (log them in `ROADMAP.md` in the last task)

S1. Segment frame: a builder works in a local frame whose entry is the origin at elevation 0, facing −Z (yaw 0), +X right. It returns its exit as a local pose `{ pos, yaw }`. The course builder places segment *i*'s local frame at the previous exit (translation and yaw only; no pitch or roll between segments).
S2. Ground is boxes only (no heightfields in spec 1). A road is cut into pieces no longer than `ROAD_PIECE_LENGTH`; each piece is a box `ROAD_THICKNESS` thick whose top surface starts exactly at the previous piece's end point, rotated by the piece's yaw and pitch, and extended by `ROAD_JOINT_OVERLAP` at both ends so curves leave no gap at the outer edge.
S3. Every segment has a checkpoint at its start: a trigger box `CHECKPOINT_TRIGGER` deep along the route, the segment's width wide, centred `CHECKPOINT_TRIGGER.y` above the entry; and a spawn pose on the ground `SEGMENT_SPAWN_INSET` along the route from the entry, facing along it. Ids `cp-<index>`. The course start is `cp-0`.
S4. Ids of things a segment places are `s<index>-<kind>-<n>` (n from 1 per kind within the segment), so they are stable and unique across the course.
S5. Off the road there is no ground (falling off leads to the kill plane). Segments a vehicle could bypass sideways (`roadworks`) have fences (walls) along both edges.
S6. A `sand` segment starts with `SAND_APRON` of road before the sand begins, so its checkpoint spawn is on road and the RV can start (carried row for step 16, satisfied by construction here).
S7. Clutter, debris, rocks, palms and obstacles are placed by fixed patterns (no randomness): evenly spaced along the segment at fractions `(n − 0.5)/count`, sides alternating left, right, starting left.
S8. The course builder appends a `FINISH_PAD` of flat road after the last segment and puts the finish volume on it; the kill plane is `KILL_PLANE_BELOW` under the lowest ground top.
S9. New prop kinds for alleys: `cart` and `scooter`, both light. Rocks in a ford are static walls (low boxes the wheels ride over), not props. Palms and boulders are anchors (kinds `palm`, `boulder`).
S10. A service stop can be added to any segment with `stop: { kind, side, along }`: a ground pad beside the road (`STOP_PAD`) carrying the zone (`STOP_ZONE`) and the operate point at the pad's outer edge; a fuel stop also has a shop counter beside the operate point. The simulation of stops is step 10.
S11. Extras any segment may place, in its local frame: `pickups`, `anchors`, `coins`, each a list of `{ kind?, along, lateral, height? }` (`height` above the ground there, default 0; coins default to `COIN_HEIGHT`). Kinds are strings; step 7 and step 10 validate them.
S12. `COURSE` environment variable selects every room's course, like `VEHICLE` (server adapter only), until the lobby (step 11). Unknown ids are refused at start-up with a clear message.

## Constants (`constants.ts`, block "Segments")

| Name | Value | Meaning |
|---|---|---|
| `ROAD_WIDTH` | 10 | m |
| `ROAD_PIECE_LENGTH` | 10 | m, longest ground piece |
| `ROAD_THICKNESS` | 1 | m |
| `ROAD_JOINT_OVERLAP` | 0.6 | m added at both ends of each piece |
| `ALLEY_WIDTH` | 6 | m between the walls (spawn slots at ±2.35 m plus a body radius fit) |
| `ALLEY_WALL_HEIGHT` | 3 | m |
| `WALL_THICKNESS` | 0.5 | m, alley walls and fences |
| `ALLEY_CLUTTER_SPACING` | 6 | m of alley per clutter item at density 1 |
| `SAND_APRON` | 15 | m of road before the sand |
| `PALM_OFFSET` | 1.5 | m outside the road edge |
| `BANK_APPROACH` | 10 | m of flat road before the bank's ramp |
| `BANK_TOP` | 10 | m of flat road at the top |
| `FORD_ROCK` | (0.3, 0.12, 0.3) | half extents of a ford rock |
| `ROADWORKS_ROW_SPACING` | 12 | m between rows of obstacles |
| `ROADWORKS_ROW` | 3 | barriers per row, centred at x = −3, 0, 3 |
| `FENCE_HEIGHT` | 1.2 | m |
| `SEGMENT_SPAWN_INSET` | 8 | m from the entry to the checkpoint spawn |
| `CHECKPOINT_TRIGGER` | (0, 2, 2) | trigger half extents along y and z; x is half the segment width |
| `FINISH_PAD` | 20 | m |
| `KILL_PLANE_BELOW` | 20 | m |
| `STOP_PAD` | (6, 0.5, 8) | half extents of the ground pad beside the road |
| `STOP_ZONE` | (2.5, 2, 5) | half extents of a stop's parking zone (RV half extents plus at least 0.85 m) |
| `COIN_HEIGHT` | 1 | m above the ground |

`PROP_KINDS` gains `cart: light, (0.5, 0.4, 0.8), 40 kg, friction 0.6, anchor null` and `scooter: light, (0.3, 0.45, 0.8), 70 kg, friction 0.6, anchor null`.

## Modules and signatures

### `shared/src/segments.ts` (new)

```ts
export type SegmentDef =
  | { type: 'road'; length: number; curve?: number; slope?: number; debris?: number } & SegmentExtras
  | { type: 'alley'; length: number; clutter: number } & SegmentExtras            // clutter density 0..1
  | { type: 'sand'; length: number; palms: number } & SegmentExtras
  | { type: 'ford'; width: number; rocks: number } & SegmentExtras                 // width: crossing length along the route
  | { type: 'bank'; height: number; gradient: number; anchors: number } & SegmentExtras   // gradient in degrees
  | { type: 'roadworks'; length: number; obstacles: number } & SegmentExtras;
export interface Placement { kind?: string; along: number; lateral: number; height?: number }
export interface SegmentExtras { pickups?: Placement[]; anchors?: Placement[]; coins?: Placement[]; stop?: { kind: 'fuel' | 'garage'; side: -1 | 1; along: number } }
// A segment in its own frame (S1); ids are local (`crate-1`), the course builder prefixes them (S4).
export interface LocalSegment {
  ground: GroundBox[]; walls: Box[]; props: Placed[]; pickups: Placed[]; anchors: Placed[];
  stops: ServiceStop[]; coins: Placed[]; decor: Placed[];
  width: number;                       // for the checkpoint trigger
  route: [x: number, z: number][];     // local, from the entry to the exit
  exit: { pos: Vec3; yaw: number };
  // The ground height under a point on the route `along` metres from the entry (for placements and tests).
  surfaceAt(along: number): { pos: Vec3; yaw: number };
}
export function buildSegment(def: SegmentDef): LocalSegment
```

Curve: `curve` is the total yaw change in radians (positive turns left, per the conventions), spread evenly over the pieces; slope in degrees (positive climbs), constant over the road; the pieces' pitch is the slope. Exit of a road: the end of the last piece's top centre line. Debris are `crate` props at `lateral = ±ROAD_WIDTH/4` (S7).

Per type:
- `road` per S2.
- `alley`: a straight road `ALLEY_WIDTH` wide with walls on both sides (inner faces at `±ALLEY_WIDTH/2`) `ALLEY_WALL_HEIGHT` high; clutter count `floor(clutter · length / ALLEY_CLUTTER_SPACING)`, cycling `crate`, `cart`, `scooter`, each against the wall of its side (`lateral = ±(ALLEY_WIDTH/2 − half.x − 0.1)`), never both sides at the same `along`.
- `sand`: `SAND_APRON` of road, then `length` of ground with surface `sand` (one sand box), `ROAD_WIDTH` wide; palms as anchors of kind `palm` at `lateral = ±(ROAD_WIDTH/2 + PALM_OFFSET)` (S7); anchors have no collider and need no ground under them.
- `ford`: `width` of ground with surface `riverbed`, `ROAD_WIDTH` wide, plus a decor `water` covering it (pose at the surface, the client draws a translucent plane of the ground's size); rocks as walls of `FORD_ROCK` resting on the riverbed, placed by S7 at `lateral = ±ROAD_WIDTH/4` alternating.
- `bank`: `BANK_APPROACH` flat road, a ramp of surface `gravel` rising `height` at `gradient` degrees (ramp length `height / sin(gradient)` along its surface), then `BANK_TOP` flat road at elevation `height`; anchors of kind `boulder` on the top, spread across the width at `along` = start of the top + 3 m (S7 for the lateral positions: evenly across `±ROAD_WIDTH/2 − 1`).
- `roadworks`: a straight road with fences (walls `FENCE_HEIGHT` high) along both edges; `barrier` props in rows every `ROADWORKS_ROW_SPACING` from `ROADWORKS_ROW_SPACING` along, `ROADWORKS_ROW` per row at x = −3, 0, 3 (the last row may be partial, filled from the left); length must fit the rows (else the builder throws).
- Extras (S10, S11) on any segment.

### `shared/src/courses/build.ts` (new)

```ts
export interface CourseDef { id: string; segments: SegmentDef[]; targetTime: number }
export function buildCourse(def: CourseDef): BuiltCourse   // S1, S3, S4, S8; deep-frozen; deterministic
```

### `shared/src/courses/demo.ts` (new) and `courses/index.ts`

`segmentDemo: CourseDef` with id `segment-demo`: road 40 m; road 60 m curving π/4 left with 4 debris; alley 50 m clutter 0.6; sand 30 m with 4 palms; ford 20 m with 6 rocks; bank height 3 gradient 15 with 2 anchors; roadworks 40 m with 5 obstacles and a fuel stop on the right at 20 m; road 30 m sloping 5° up with a garage on the left at 15 m; target time 300. `getCourse('segment-demo')` returns it built (built once at module load).

### Client

- `render/scene.ts`: walls are already drawn; draw decor `water` as a translucent blue box. `Placed` gains an optional `size?: Vec3` (half extents) that decor may carry; the ford's water decor has its pose at the riverbed's top centre and `size` = (`ROAD_WIDTH/2`, 0.05, `width/2`). `BuiltCourse` gains nothing else.
- Anchor kinds `palm` (green-topped brown post) and `boulder` (grey box) drawn differently from `milestone`; stops drawn as a translucent zone and a post at the operate point.
- `render/propMesh.ts`: `cart` (brown) and `scooter` (dark red) boxes.

### Server

`server/src/node/main.ts` (adapter): reads `COURSE` (S12) like `VEHICLE`, checks it with `getCourse` at start-up, passes it to the room config.

## Behaviour rules

- B1. For every segment type: the entry is the origin facing −Z; the exit pose is as computed (straight: `(0, elevation, −length_total)`, yaw 0; curved road: the end of the arc of pieces).
- B2. Along the route, a downward ray every 1 m across `±(width/2 − 0.5)` (5 points) hits ground within `ROAD_JOINT_OVERLAP · sin(slope) + 0.02` m of the expected surface height, for every built segment and for the demo course.
- B3. At each join between segments and between pieces, the ground's top surfaces differ by at most 0.02 m in height (same rays).
- B4. Walls and props never stand in the lane: a box of the RV's width (2.3 m) plus 0.5 m each side, swept along the route centre line, intersects no wall, and in alleys and roadworks no prop except roadworks barriers (which block on purpose).
- B5. For every checkpoint of a built course: the four wheel points of each vehicle placed at the spawn pose have ground beneath within 0.1 m, and all six spawn slots of each vehicle have ground beneath and no wall overlapping a player capsule there.
- B6. Every stop's zone contains the RV's footprint (RV half extents fit inside `STOP_ZONE` horizontally) and rests on its pad.
- B7. Building twice gives deep-equal results; the result is frozen; ids are unique across ground-placed things (props, pickups, anchors, coins, stops, checkpoints).
- B8. The demo course passes `createWorld` construction with both vehicles and the vehicle rests at `cp-0` for 2 s (moves < 0.05 m).

## Tasks

Each task: tests first, then code; then a Sonnet review. Run `npm test` and `npm run typecheck` before each commit. Every earlier test passes unchanged.

### Task 1 — road builder and the course builder (`shared`)
Files: `constants.ts` (block "Segments"), `segments.ts` (road only plus extras), `segments.test.ts`, `courses/build.ts`, `courses/build.test.ts`, `index.ts`.
Tests: B1 for straight, curved (π/2 left and right), sloped (±8°) roads; B2, B3 within a road; B7; S3 checkpoints and S4 ids; S8 finish and kill plane; a two-segment course (road then curved road) passes B2/B3 at the join; extras (pickups, anchors, coins, stop) land at the right world positions after chaining (a placement 10 m along, 2 m right in a segment that starts after a π/2 left turn).
Commit: `feat(shared): road segments and the course builder`.

### Task 2 — alley, sand, ford, bank, roadworks (`shared`)
Files: `segments.ts`, `segments.test.ts`, `constants.ts` (prop kinds `cart`, `scooter`).
Tests: B1–B4 for each type with typical parameters and edge cases (clutter 0 and 1, palms 0, rocks 0, a 25° bank, roadworks with exactly one full row and with a partial row; roadworks too short throws); S6 apron; sand surface under the sand part only; riverbed and gravel surfaces; barriers carry the barrier kind and sit on the road.
Commit: `feat(shared): the other five segment types`.

### Task 3 — demo course, scenario checks, `COURSE` (`shared`, `server`)
Files: `courses/demo.ts`, `courses/index.ts`, `courses/demo.test.ts` (B5, B6, B8 and B2–B4 over the whole course, both vehicles), `server/src/node/main.ts` and its test if one covers `VEHICLE`.
Commit: `feat(shared): the segment demo course`.

### Task 4 — client drawing
Files: `client/src/render/scene.ts`, `client/src/render/propMesh.ts`, `course.ts` (`Placed.size?`).
Not unit-tested beyond the course types compiling; `npm run build` must pass.
Commit: `feat(client): draw segment courses`.

### Task 5 — documents
ROADMAP: step 15 → `done` (it ran in parallel; say so); log S1–S12; "How to run" gains `COURSE=segment-demo`; the carried row for step 15 (a ray from the player's pivot to exit and spawn slots against thin walls) stays for the step that next touches spawn slots unless B5 covers it; note that the carried step-16 sand row is satisfied by S6.
Commit: `docs(roadmap): record step 15`.

## What the owner checks by hand
Driving the demo course (`COURSE=segment-demo npm run dev`): joins feel smooth, alleys fit the RV, the bank is climbable with the winch, roadworks need the crew.

## Known risks to watch in review
- Curved and sloped pieces: the top surface at joints (B3) is the main geometric risk.
- Merge with steps 7–14 running on the main branch: `constants.ts`, `PROP_KINDS`, `course.ts` and `scene.ts` may conflict; keep edits additive.
