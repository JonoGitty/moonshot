# Mercury-Redstone 3 / Freedom 7 — flight plan

> Alan Shepard's flight. First American in space. 15-minute suborbital arc,
> 187 km peak, splashdown in the Atlantic 487 km downrange. Beat Gus
> Grissom by ~12 weeks but came 23 days after Gagarin.

```
shipKey:      mercury
missionType:  suborbital
real flight:  Mercury-Redstone 3 (MR-3), capsule "Freedom 7"
launch:       1961-05-05 14:34:13 UT, Cape Canaveral LC-5
crew:         Alan Bartlett Shepard Jr. (first American in space)
duration:     15 m 28 s (full mission); 5 m of weightlessness
landing:      1961-05-05 14:49:35 UT, Atlantic Ocean (28°45'N, 71°50'W)
```

**Sources:**
- *Project Mercury Familiarization Manual* (NASA SP-32, 1962)
- *Mercury-Redstone 3 Postlaunch Report* (NASA MSC-MR-3-67)
- *We Seven* (M. Scott Carpenter et al, 1962) — Mercury Seven memoir
- *Light This Candle: The Life and Times of Alan Shepard* (Neal Thompson, 2004)
- NASA Mercury archive transcripts (1961, declassified)

---

## Vehicle stack

| Stage | Inert / fuel mass (kg) | Engines | Thrust (N) | Isp (s) | Notes |
|---|---|---|---|---|---|
| Redstone A-7 | 4 000 / 26 000 | 1× NAA 75-110 A-7 | 350 000 SL | 215 SL / 265 vac | Burn 142 s; LOX/ethanol |
| Mercury capsule | 1 400 dry / 50 fuel | 3× retrorockets | 2 500 each | 220 / 235 | Δv ~220 m/s; one-shot retro pack |

**Total Δv:** launch ~2 200, retro ~150 (only used in orbital Mercury — Freedom 7 was suborbital and didn't need retro). Mercury-Redstone could only achieve **suborbital** — Atlas was needed for orbital Mercury (Glenn's Friendship 7). Mercury-Redstone Δv is fundamentally limited.

---

## Real flight timeline

T+ from launch (14:34:13.48 UT, 5 May 1961).

| Phase | T+ (real) | Real event | Sim phase | Notes |
|---|---|---|---|---|
| Hold release | T+0:00 | Engine start signal | `pre-launch` | After 4 hold scrubs (weather, valve) |
| **Liftoff** | **T+0:01** | NAA A-7 reaches commit thrust | `ascent` | Shepard: "Roger, liftoff and the clock has started." |
| Mach 1 | T+1:05 | ~9 km altitude | `ascent` | Shepard: "On the trajectory." |
| **Max-Q** | **T+1:28** | 11 km, 35 kPa | `ascent` | Vibration peak — Shepard described it as "very rough" |
| **MECO** | **T+2:22** | Burnout at 59 km, 2 100 m/s | `ascent` (auto-stage) | Engine cutoff signal |
| Capsule sep | T+2:24 | Posigrades fire, sep from Redstone | `ascent` | |
| Capsule turnaround | T+2:35 | Heat shield-forward attitude | `ascent` | Manual or auto pitch |
| **Apex** | **T+5:14** | 187.5 km, ~0 m/s vertical | `ascent` (transition to coast/fall) | Shepard: "What a beautiful view." |
| **Periscope deploy** | **T+5:30** | Side periscope extended | (cosmetic) | First view of Earth from US capsule |
| **Manual control test** | **T+5:30 → T+10:00** | Shepard tests pitch/yaw/roll | `ascent` (coast) | First astronaut to manually control a spacecraft |
| Retrograde sequence | T+9:30 | Retros NOT FIRED on Freedom 7 — suborbital | (skipped) | Carried for orbital Mercury |
| Retropack jettison | T+9:38 | Pack ejected to expose heat shield | `reentry-prep` (auto) | |
| **Atmospheric interface** | **T+10:30** | 122 km descending, 2 200 m/s, -25° flight-path | `reentry` | STEEP — suborbital ballistic |
| **Peak g** | **T+10:55** | **11.6 g** at ~30 km | `reentry` | Higher than orbital Mercury (~7 g) |
| **Drogue parachute** | **T+13:30** | 6.4 km, drogue (pilot chute) | `reentry` (auto) | |
| **Main parachute** | **T+14:00** | 3 km, single 19 m main | `reentry` (auto) | |
| **Heat shield drop** | **T+14:30** | Shield drops 1.2 m, exposes landing bag | (cosmetic) | |
| **Splashdown** | **T+15:28** | Atlantic, 487 km from launch | `orbit-handover` | Recovered by USS *Lake Champlain* |

---

## Phases — expected envelopes + checks

### `pre-launch`
- Real flight had 4 prior holds (3 weather scrubs + 1 valve issue). Shepard famously broke the silence: "Why don't you fix your little problem and **light this candle**?"
- **Watchdog:** standard pre-launch.

### `ascent`
- **Single-stage burn** to suborbital trajectory. No staging beyond capsule sep.
- **Critical detail:** ascent is essentially a **vertical ballistic shot with mild downrange angle**. Trajectory peaks at 187 km and falls back into the Atlantic. The sim's `suborbital` mission handles this — no orbit insertion needed.
- **Envelope:**
  - At T+1:28 (Max-Q): `altE ≈ 11 km`, `speed ≈ 470 m/s`
  - At T+2:22 (MECO): `altE ≈ 59 km`, `speed ≈ 2 100 m/s`
  - At T+5:14 (apex): `altE ≈ 187.5 km`, `speed ≈ 200 m/s` (mostly horizontal)
  - At T+10:30 (AOS): `altE ≈ 122 km`, `speed ≈ 2 200 m/s`, `flightPath ≈ -25°`
- **Watchdog checks:**
  - `apex-too-low`: `apoE < 150 km` → minor → callout (mission still survivable, less weightlessness time)
  - `apex-too-high`: `apoE > 250 km` → moderate → callout (steeper return entry, higher g)
  - `downrange-short`: predicted splashdown < 300 km from launch → minor → callout (recovery still feasible)
  - `downrange-long`: predicted splashdown > 700 km → moderate → callout (recovery vessel may not be in position)

### `reentry-prep`
- Retropack jettison after MECO+apex coast. Real Mercury-Redstone retropack was carried for orbital sister missions but unused on Freedom 7. Our model auto-stages anyway.

### `reentry`
- **Critical detail:** Mercury-Redstone reentry is **steeper than orbital Mercury** because it's pure ballistic — no orbital horizontal velocity to lose, just vertical fall from 187 km. Peak g = **11.6 g** (Shepard's actual reading).
- **Envelope:**
  - At AOS: `flightPath ≈ -25°`, `speed ≈ 2 200 m/s`
  - Peak g: 11.6 (much higher than orbital Mercury's 7 g, Apollo's 4 g, Shuttle's 3 g)
  - Drogue: 6.4 km
  - Main: 3 km
- **Setpoints:** prograde-relative-to-velocity (heat shield forward); throttle 0; warp 1× through plasma.
- **Watchdog checks:**
  - `peak-g-exceeded`: instantaneous g > 18 → major → callout (Shepard's training cap was 18 g; real flight peaked at 11.6)
  - `chute-no-deploy`: `altE < 6.4 km` and parachute not deployed → major → force-deploy (capsule destroyed if no chute by 1 km)

### `orbit-handover` (= splashdown)
- Real Freedom 7 splashed in Atlantic, recovered by USS *Lake Champlain* helicopter.
- Our model: capsule lands when `altE = 0` and `speed < parachute-controlled descent rate`.

---

## What makes this different

Mercury-Redstone / Freedom 7 is the **simplest mission in the catalogue**:
1. **Single stage.** No second stage, no orbital insertion, no transfer burns.
2. **Suborbital.** Never reaches orbital velocity. Ballistic arc only.
3. **Highest g.** 11.6 g peak — more than Apollo, Shuttle, Soyuz, Falcon 9 combined averages.
4. **Shortest duration.** 15 minutes total. Most of that is coast.

For the watchdog this is the **least interesting** mission — fewer phases, fewer failure modes, less to go wrong. Most checks are advisory rather than corrective. The autopilot just needs to (a) burn the Redstone, (b) coast, (c) survive reentry. There's no "abort" option after MECO that we model — the suborbital trajectory will return to Earth no matter what.

(Real Mercury did have abort modes — Launch Escape System for pad abort, mid-flight aborts using the LES, retropack for orbital aborts. Not modelled in 2D.)

---

## Standard recoveries

| Failure | Recovery |
|---|---|
| Apex too low | Accept it — gravity will land you anyway |
| Apex too high | Accept it — heat shield handles steeper entry |
| Excessive g | Cannot fix — sphere has fixed orientation |
| Chute fail | Force deploy by watchdog |

---

## Test plan — anomaly injections

| Scenario | Inject | Expected recovery |
|---|---|---|
| Nominal | none | 187 km apex, splashdown |
| Apex undershoot | -10 % MECO Δv | Lower apex, still survives |
| Apex overshoot | +10 % MECO Δv | Higher apex, steeper entry |
| Late chute | block deploy until 4 km | Watchdog force-deploy at 4 km |

---

## Open questions

- Real Freedom 7 used a single 19 m main + 19 m drogue. Our `parachuteDrag: 500`, `parachuteAlt: 3000`. Sim splashdown speed should be ~9 m/s (matches real).
- Manual control test (Shepard's pitch/yaw/roll exercise) is unique to Mercury — first astronaut to fly a spacecraft by hand. Could add as a "manual override window" between MECO and reentry where the user must perform a small attitude task to pass. Out of scope but rich game-design hook.
- Pre-flight holds (4 of them) added 4 hours to launch day. Captured in briefing quote ("light this candle"). No autopilot impact.
- Mercury Atlas (Friendship 7, John Glenn) is the orbital sister mission and not currently modelled as a separate ship. Could be added later — same capsule, different launcher, real orbital profile.
