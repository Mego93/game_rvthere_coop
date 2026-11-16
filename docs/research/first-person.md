# First-person view: findings and recommendation

Step 26, Part C (F1 to F3). Written after trying the `?fp` prototype. Rendering and feel are the owner's call at sign-off; this records what the prototype shows and what a switch would cost.

## The prototype

- `?fp` in the URL, or `localStorage lodgy.fp = "1"`, turns it on. It is off by default and not listed in the controls panel.
- On foot the camera sits at the eased eye (1.6 m standing, 0.95 m crouched, the same eased value the third-person head uses). The local player's own mesh is hidden. Aim, crosshair, minimap and interact prompt are unchanged.
- Seated the camera sits at the seat position plus (`PLAYER_EYE_HEIGHT` - `PLAYER_HEIGHT / 2`) = +0.7 m, clamped to 0.05 m below the vehicle box top. The view yaw is the vehicle yaw plus the mouse aim offset, so the head turns with the mouse and the car turns under it.
- Field of view 75 in this mode; 60 stays the default.
- The pose is a pure function (`render/firstPersonCamera.ts`, tested); `game.ts` only chooses it.

## On foot

It works with no change to movement or prediction: the camera is a function of the drawn feet position and the eye. The world reads as larger and the scale of props and buildings is easier to judge. Costs: you cannot see your own body, so you lose the cue for stance, the carry pose and the winch hook in your hands (a held prop appears at the lower right of the frame only by accident of the hold pose). Teammates are seen as before. Ledge and gap jumps are harder to judge without seeing your feet; a third-person player sees the landing spot, a first-person player does not.

## Seated

The real Lodgy and camper models have their interiors removed: no dashboard, wheel, seats or windows' inner faces. In first person the screenshot shows the bonnet and roof lining from inside and nothing else, with the driver's eye 0.5 m above the chassis centre, inside a hollow shell. It is usable, but it reads as a floating camera in a shell, and the roof clips into view when looking up.

A simple cabin would need: a dashboard with a wheel that turns with steering, two to six seat bodies, door and window frames, a rear-view area, and a hidden-from-outside rule (back-face culling or a second inside-only mesh) for each of the two vehicles, plus a fit to the seat positions in `vehicles.ts`. Estimate: a few days of art and fitting per vehicle, then more for the camper's longer interior. Without that, keep third person while seated.

A hybrid is cheaper: first person on foot, third person (the existing follow camera) when seated. It is a one-line change in `game.ts` (use the prototype's seated branch only when a cabin exists).

## Motion comfort

- Head bob: none (off), as it is the main cause of discomfort; keep it off, with no option.
- Field of view: 75 is a minimum for a mouse and desktop play; 90 is the common wide default. Offer it as a setting if first person ships.
- Sprint: add a field-of-view lift (about +8 degrees eased over 0.2 s) so sprint feels fast; not in the prototype, to keep the change small.
- Seated, the horizon follows the vehicle yaw only (no roll), as the third-person camera does; rolling the view with the chassis on slopes is a comfort risk and is not done. Pitch of the vehicle is also not applied.
- Phones: a smaller screen and a thumb look control make first person more tiring; third person should stay the phone default.

## "More real, less blocky"

First person puts the near field in front of the eyes: hands, the held prop, the winch hook, the dashboard. These are the places where the low-poly style shows most, and the character has no arms drawn for a first-person view at all. To meet that wish a first-person view needs: first-person arms and hands, held-item models at higher detail than the world props, an interior, and a nearer clip plane. The third-person view hides this: everything is far enough for the low-poly style to read as a style. Switching to first person raises the art bar at the exact point the owner has complained about. This is the main argument against making it the default.

## Cost to prediction, HUD, minimap and the interact prompt

- Prediction and reconciliation: none. The camera reads the same drawn position. Input already carries yaw and pitch.
- Seated first person adds a dependency on the sampled vehicle pose and the seat id; with interpolation delay the view is slightly behind the local vehicle, the same as third person.
- HUD: compass and minimap are yaw-based and unchanged. The crosshair is shown on foot and now matches the true aim line, which is an improvement (third person offsets the camera to the shoulder). The seat ring and name labels are unaffected.
- Interact prompt: it resolves from the player's position and aim, not the camera, so it is unchanged. The prompt text sits over the world in the same place.
- The camera-box pull-in (`cameraPlacement`) is not used: first person needs no wall avoidance, but the 0.1 near plane lets the eye clip into thin walls when pressed against them.
- Other players' meshes would see no change; the local mesh is hidden only locally.

## Recommendation

Keep third person as the default. Offer first person as an optional setting for desktop, on foot only, with the existing prototype as the base, and keep seated first person off until a cabin exists. Do not switch the game to first person: it needs new near-field art (arms, held items, cabins) that the project does not have, and the third-person view suits the co-op play of watching teammates and the shared vehicle.

Next steps if the owner agrees:
1. Add a settings entry (and a touch-excluded rule) that sets `lodgy.fp`; add a field-of-view slider (75 to 100) and a sprint lift.
2. Draw first-person hands and put the held prop and winch hook in view, in the character scale pass (step 27a).
3. Decide per vehicle whether to build a cabin; until then keep the follow camera when seated.
4. Test comfort with two or three players for 20 minutes before any default change.
