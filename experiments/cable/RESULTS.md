# Winch cable experiment — results

Run with `npm run experiment:cable`. Build step 1, 2026-11-12.

## Question

Is a force-based cable (spring and damper, capped tension, no physics joint) stable when it winches each vehicle up the steep reference slope, and which stiffness and damping should the winch start with?

## Setup

- Each vehicle starts at rest 8 m up the 25° slope. The cable runs from its winch mount to a fixed point 38 m up.
- Reel-in speed 1 m/s, no throttle. The run lasts 40 s.
- Tension cap: 0.6 × vehicle weight. Stiffness and damping scale with vehicle mass.
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
3. Stiffness has an upper limit. At 400 N/m per kg the tension reaches the cap after about 15 mm of stretch, which is less than the 17 mm the reel takes in per tick. The "do not shorten at the cap" rule then blocks the reel on every other tick and the vehicle climbs at half speed. The stretch at which the cap is reached must stay well above one tick of reel travel.

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

At these values the cap is reached at about 39 mm of stretch, more than twice one tick of reel travel.
