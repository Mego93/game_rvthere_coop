# Winch cable experiment — results

Run with `npm run experiment:cable`. Build step 1, 2026-11-12.

## Question

Is a force-based cable (spring and damper, capped tension, no physics joint) stable when it winches each vehicle up the steep reference slope, and which stiffness and damping should the winch start with?

## Setup

- Each vehicle starts at rest 8 m up the 25° slope. The cable runs from its winch mount to a fixed point 38 m up.
- Reel-in speed 1 m/s, no throttle. The run lasts 40 s.
- Tension cap: 0.6 × vehicle weight. Stiffness and damping scale with vehicle mass.
- Tension = stiffness × stretch + damping × the speed at which the two cable ends move apart, clamped between 0 and the cap. The damper uses the speed of the ends, not the rate of change of stretch, so the reel's own take-up is not damped.
- The cable does not shorten on a tick where tension is at the cap.
- Each case is run again with the brake held for the first 5 s, then released.

## Table

```
vehicle  k/kg  zeta  toTop(s)  maxSpeed  maxSpin  maxStretch  speedAfterRelease
lodgy      20  0.50     22.65      1.07     0.08        0.47               1.07
lodgy      20  1.00     22.70      0.98     0.08        0.65               0.98
lodgy      20  2.00     23.10      0.98     0.08        1.09               0.95
lodgy      60  0.50     22.50      1.01     0.08        0.21               1.02
lodgy      60  1.00     22.52      0.98     0.08        0.32               0.98
lodgy      60  2.00     22.63      0.98     0.08        0.58               0.97
lodgy     150  0.50     22.50      1.01     0.08        0.11               1.01
lodgy     150  1.00     22.53      0.98     0.08        0.19               0.98
lodgy     150  2.00     22.65      0.98     0.08        0.35               0.98
lodgy     400  0.50     never      0.53     0.08        0.04               0.69
lodgy     400  1.00     never      0.49     0.08        0.06               0.61
lodgy     400  2.00     never      0.49     0.08        0.11               0.50
rv         20  0.50     22.65      1.07     0.06        0.47               1.08
rv         20  1.00     22.68      0.99     0.05        0.66               0.98
rv         20  2.00     23.08      0.98     0.05        1.09               0.95
rv         60  0.50     22.48      1.04     0.05        0.21               1.03
rv         60  1.00     22.50      0.99     0.04        0.33               0.98
rv         60  2.00     22.63      0.99     0.04        0.58               0.97
rv        150  0.50     22.48      1.01     0.04        0.11               1.01
rv        150  1.00     22.52      1.00     0.04        0.19               0.98
rv        150  2.00     22.68      0.99     0.04        0.35               0.98
rv        400  0.50     never      0.53     0.04        0.04               0.68
rv        400  1.00     never      0.50     0.04        0.06               0.58
rv        400  2.00     never      0.34     0.04        0.08               0.50
```

Columns: seconds to climb 22 m of slope; highest speed (m/s); highest spin (rad/s); largest cable stretch (m); highest speed in the 3 s after the brake is released (m/s).

## Findings

1. The force-based cable is stable at both vehicle masses. Speed never exceeds the reel speed by more than about 0.1 m/s, spin stays under 0.1 rad/s, and releasing a stalled cable does not fling the vehicle.
2. Because stiffness, damping and the cap all scale with mass, the Lodgy and the RV behave almost identically.
3. Stiffness has an upper limit. At 400 N/m per kg the tension reaches the cap after about 15 mm of stretch, which is less than the 17 mm the reel takes in per tick. The "do not shorten at the cap" rule then blocks the reel on about every other tick and the vehicle climbs at half speed. This mechanism is inferred from the top speed of about 0.5 m/s in those rows; the experiment does not count capped ticks. The stretch at which the cap is reached must stay well above one tick of reel travel.

## Chosen starting values

Rule: among rows where both vehicles reach the top, with top speed and post-release speed at or below 1.5 m/s and spin at or below 0.5 rad/s, take the highest stiffness, with a damping ratio of 1.

| Constant | Value |
|---|---|
| `WINCH_STIFFNESS_PER_KG` | 150 |
| `WINCH_DAMPING_RATIO` | 1 |
| `WINCH_FORCE_PER_WEIGHT` | 0.6 |
| `WINCH_REEL_SPEED` | 1 |
| `WINCH_MIN_LENGTH` | 1.5 |
| `WINCH_MAX_LENGTH` | 25 |

At these values the spring alone reaches the cap at about 39 mm of stretch, more than twice one tick of reel travel.

That is not the working stretch. While reeling steadily up the 25° slope the cable is stretched about 0.19 m (the `maxStretch` column), because the damper opposes the 1 m/s approach and the spring makes up for it: stretch = (load + damping × approach speed) / stiffness.

Build step 6 must use the same tension formula as `cable.experiment.ts`, or re-run this sweep. The values above are validated for that formula only.

## Step 26: the tension cap swept (W1, B7), 2026-11-15

Run with `npm run experiment:cable -- -t "sweep the tension cap"` (about 25 s) and `-t "fine sweep"`. Same cable formula as `winch.ts` (stiffness 150 per kg, damping ratio 1, reel 1 m/s) with the cap as a parameter; the far end of the cable can be a prop and takes the opposite impulse.

```
F/W   vehicle  cap(kN)  climb 25 deg: mean tension(kN) at cap, speed(m/s), spin(rad/s) | max slope(deg) | barrier 150 kg: top speed, moved(m), reversals | out of a 0.8 m hole: 25 deg exit(s), vertical wall | anchor 8 m up, braked or free, 4/8/12 m ahead: worst pitch / tilt
0.6   lodgy       8.8   6.5  1%  0.98 0.08   | 34 | 1.23 10.2 0 | 13.2  never | 90.0 / 92.9
0.6   rv         22.1  16.3  1%  0.98 0.04   | 34 | 2.07  9.2 0 | 13.3  never | 85.1 / 85.1
0.75  lodgy      11.0   6.5  0%  0.99 0.08   | 45 | 1.23 10.2 0 | 13.2  never | 90.0 / 92.3
0.75  rv         27.6  16.3  0%  0.99 0.03   | 47 | 2.07  9.2 0 | 13.3  never | 90.0 / 93.8
0.9   lodgy      13.2   6.5  0%  0.99 0.08   | 50 | 1.23 10.2 0 | 13.2  never | 90.0 / 100.4
0.9   rv         33.1  16.3  0%  0.99 0.03   | 50 | 2.07  9.2 0 | 13.3  never | 89.9 / 113.5
1.0   lodgy      14.7   6.5  0%  0.99 0.08   | 50 | 1.23 10.2 0 | 13.2  never | 90.0 / 119.5
1.0   rv         36.8  16.3  0%  0.99 0.03   | 50 | 2.07  9.2 0 | 13.3  never | 89.9 / 133.7
```

The slope search stops at 50 degrees (the loop's end), so 50 means "at least 50". Max slope is the steepest ramp (1 degree steps from 10) the vehicle is pulled up from a stop, no throttle, with a 45 m anchor on the ramp.

### Reading the sweep

1. The cap only matters on steep slopes. On the 25 degree reference slope the cable pulls 6.5 kN (Lodgy) and 16.3 kN (RV) in steady state, which is 74% of the 0.6 cap, and the cap is reached on 1% of ticks. The climb speed is the reel speed (0.98 to 0.99 m/s) and spin is at most 0.08 rad/s at every force. The winch alone pulls both vehicles up 34 degrees at 0.6, 45 to 47 degrees at 0.75 and 50 or more at 0.9.
2. The barrier drag and the pull out of the hole do not depend on the cap: the friction of a 150 kg barrier is about 0.7 kN, the tension stays under the cap (peaks of 4 to 12 kN are stick-slip spikes), and the reel speed sets the pace. The hole takes 13.2 s (Lodgy) and 13.3 s (RV) with a 25 degree exit ramp at every force; a vertical 0.8 m wall is never climbed by the winch alone at any force, so step 28's hole needs a ramp or throttle as well.
3. Barrier drag is not smooth for the RV. Its top speed is 2.07 m/s (Lodgy 1.23), above reel speed + 0.5 m/s, at every force, with no reversals. The cause is the RV's stiffness (150 N/m per kg of 3750 kg against a 150 kg prop, about 10 Hz at a 60 Hz step), not the cap. This fails the B7 barrier criterion for the RV at 0.6 as well; it is recorded as a known failure in `winch.test.ts` (T8), not fixed here.
4. The anchor 8 m above the bumper decides the force. Braked, the pitch at 4, 8 and 12 m ahead is:

```
F/W    lodgy                    rv
0.600  27.1 /  2.1 /  0.9       28.2 / 20.6 /  0.5
0.625  28.2 /  3.4 /  0.9       28.3 / 27.0 /  0.5
0.650  29.0 / 11.3 /  1.0       29.4 / 28.1 /  0.6
0.675  29.8 / 19.6 /  1.0       37.6 / 29.7 /  0.8
0.700  30.6 / 23.1 /  1.1       51.8 / 50.2 /  1.0
0.750  59.1 / 27.8 /  1.4       90.0 / 84.8 / 17.6
0.900  89.9 / 90.0 / 90.0       89.6 / 89.7 / 89.8   (tilt over 97 degrees: flipped)
```

   The strict B7 rule (under 30 degrees, never flips) holds up to about 0.65 for both vehicles (0.675 fails the RV at 4 m). 0.75 fails the RV, 0.9 and 1.0 flip both. Not braked, the vehicle rolls under the anchor and the nose goes up to 77 to 90 degrees at every force including 0.6, so the criterion is only meaningful braked.
5. Result: of the swept values only 0.6 passes B7. `WINCH_FORCE_PER_WEIGHT` stays 0.6 (the plan's target 0.9 fails). 0.65 passes by about 0.6 degrees and is the upper bound; the owner may choose it, but it was not taken because the margin is thinner than the experiment's accuracy and the cap only helps slopes above 34 degrees.

The stiffness limit of finding 3 above still holds: at 0.9 the spring alone reaches the cap at 59 mm of stretch, more than three ticks of reel travel, so the reel does not stall.

### Every way the hook leaves the player

1. Carried farther than `WINCH_MAX_LENGTH` from the winch mount (25 m until step 26, 30 m now): pulled from the hands and dropped, or stowed when no ground is under it. The vehicle rolling away from a player who walks to an anchor does this without warning.
2. Interact with no anchor within hook range (2 m of the chest): the hook is dropped on the ground.
3. Interact beside a door while holding it: it drops instead of boarding (a player must drop it to board).
4. The player is downed: the hook drops at the feet (kept, spec line 109).
5. The player disconnects or is removed: it drops at their feet.
6. A respawn stows it.
7. Attached to an anchor and the obstacle is reset (kill plane): stowed.
8. On the ground: reeling in stows it, and it is stowed when it lies more than the maximum from the mount.
9. Attaching to an anchor farther than the maximum is refused, so the hook stays in the hands but nothing happens.

The one the owner most likely meets as "the hook is not very resistant" is the first: with a 25 m limit the vehicle only has to roll a few metres, or the player to walk to a far anchor, and the hook disappears from the hands and from the screen. The cable itself never breaks and pulls up to 34 degrees at the old cap. The second candidate is a downed player dropping it. Hence 30 m and a red rope from 26 m, instead of a stronger cap.
