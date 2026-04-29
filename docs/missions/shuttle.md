# Space Shuttle / STS-1 Columbia — flight plan

> First orbital flight of the Space Shuttle. Columbia flew 37 orbits in 54.5
> hours and glided to a runway landing at Edwards AFB. The only US crewed
> debut flight where the maiden vehicle carried astronauts.

```
shipKey:      shuttle
missionType:  leo-return
real flight:  STS-1 Columbia (Space Transportation System flight 1)
launch:       1981-04-12 12:00:04 UT, KSC LC-39A
crew:         John W. Young (CDR), Robert L. Crippen (PLT)
duration:     2d 06h 20m 53s (54 h 20 m)
landing:      1981-04-14 18:20:57 UT, Edwards AFB Runway 23 (concrete lakebed)
```

**Sources:**
- *STS-1 Mission Report* (NASA JSC-17414, June 1981)
- *STS-1 Press Kit* (NASA, April 1981)
- *Riding Rockets — The Outrageous Tales of a Space Shuttle Astronaut* (Mike Mullane)
- NASA STS-1 Flight Crew transcripts + post-flight debrief
- *Wings In Orbit* (NASA SP-2010-3409) — Shuttle program engineering retrospective

---

## Vehicle stack

| Stage | Inert / fuel mass (kg) | Engines | Thrust (N) | Isp (s) | Notes |
|---|---|---|---|---|---|
| 2× SRB | 184 000 / 998 000 | 2× HTPB SRB | 25 000 000 SL | 269 SL | Burn 124 s, parallel-staged with SSMEs |
| External Tank + 3× SSME | 26 500 / 585 000 | 3× RS-25 | 5 450 000 SL / 6 540 000 vac | 366 SL / 452 vac | Burn ~510 s to MECO |
| Orbiter + OMS | ~78 000 dry / 14 000 | 2× OMS-E + RCS | 53 000 vac (combined) | 313 vac | OMS Δv ~330 m/s total |

**Total mission Δv:** ascent ~9 200 (with parallel staging assist), OMS-1 + OMS-2 ~150–185, deorbit ~105. The Orbiter has very tight Δv margins on orbit — the entire OMS reserve is ~330 m/s.

---

## Real flight timeline

T+ from launch (12:00:04 UT, 12 Apr 1981).

| Phase | T+ (real) | Real event | Sim phase | Notes |
|---|---|---|---|---|
| SSME ignition | T-6.6 s | 3× RS-25 light, throttle to 100 % | `pre-launch` | Hold at Pad A |
| **Liftoff** | **T+0:00** | SRB ignition = launch commit | `ascent` | |
| Roll program | T+0:07 | Pitch + roll to head-up 90° azimuth | `ascent` | Inverted (heads-down) until SRB sep |
| Mach 1 | T+0:52 | ~10 km | `ascent` | |
| **Max-Q** | **T+1:04** | 11 km, 35 kPa | `ascent` | SSMEs throttle to 65 % |
| **SRB sep** | **T+2:04** | Tail-off, jettison + parachutes | `ascent` (auto-stage) | Real SRBs recovered from ocean |
| SSMEs to 104 % | T+2:30 | Throttle up after Max-Q | `ascent` | |
| Negative return | T+4:00 | Past RTLS abort window | `ascent` | (Abort modes not modelled) |
| 3-g limit | T+7:30 | Throttle reduced to 65 % to cap g-load | `ascent` | Real-world astronaut comfort |
| **MECO** | **T+8:34** | Cutoff at 7 800 m/s, 113 km | `ascent` (auto-stage) | |
| **ET sep** | **T+8:52** | Tank tumbles + breaks up over Indian Ocean | `ascent` | |
| **OMS-1** | **T+10:34** | 86-s burn, 70 m/s | (watchdog mini) | Raise apo to safe orbit |
| **OMS-2** | **T+44:01** | 75-s burn, 90 m/s | `orbit-coast` (auto) | Circularise at 244 × 267 km |
| Cargo bay doors open | T+1:30:00 | Required for thermal control | (not modelled) | |
| ... 36 orbits ... | T+~54 h | Crew operations, flight test cards | `orbit-coast` (warp) | Real-time compressed |
| Cargo bay doors close | T+53:30:00 | Pre-deorbit checklist | (not modelled) | |
| **Deorbit burn** | **T+53:21:43** | OMS retrograde 159 s, 91.4 m/s | `deorbit-burn` | 2× OMS-E |
| **Atmospheric interface** | **T+53:55:00** | 122 km, 7.6 km/s, -1.5° flight-path | `reentry` | Far shallower than Apollo/Orion |
| Plasma blackout | T+53:58 → T+54:14 | ~16 min | `reentry` | Real-world C-band loss |
| **S-turns begin** | **T+54:00:00** | 60° bank reversals for energy mgmt | `reentry` (auto) | Hypersonic AoA 40° |
| TAEM interface | T+54:15 | 25 km, Mach 2.5 | `reentry` (auto) | Terminal Area Energy Mgmt |
| Heading Alignment Cone | T+54:18 | Curve onto runway centerline | `reentry` (auto) | |
| **Runway landing** | **T+54:20:53** | Edwards Runway 23, 295 km/h | `orbit-handover` | Drag chute deployed on rollout |

---

## Phases — expected envelopes + checks

### `pre-launch`
- SSMEs light at T-6.6 s and run at 100 % during the hold — if any SSME doesn't reach commanded thrust, SRBs do not light, and we sit on the pad.
- **Anomaly heritage:** STS-41-D had an on-pad abort (RSLS abort) when SSME-3 failed to reach rated thrust. T-6 s engine shutdown.
- **Watchdog checks:** standard pre-launch (engines healthy, no holds).

### `ascent`
- **Critical detail:** Shuttle ascent is **parallel + serial staging** combined.
  - T+0 → T+2:04: 2 SRB + 3 SSME fire together (parallel)
  - T+2:04 → T+8:34: SRBs gone, 3 SSME continue on ET (serial second stage)
  - T+8:34: MECO + ET sep; Orbiter is now a glider with only OMS for Δv
- Our 2D model: 2 stacked stages. Stage 1 = "boost phase" (2× SRB + 3× SSME mass-flow-averaged). Stage 2 = "SSMEs on ET". Auto-stage handles both transitions.
- **Envelope:**
  - At T+1:04 (Max-Q): `altE ≈ 11 km`, `dynP ≈ 35 kPa` (we don't model dynP directly; speed ≈ 470 m/s)
  - At T+2:04 (SRB sep): `altE ≈ 47 km`, `speed ≈ 1 380 m/s`
  - At T+8:34 (MECO): `altE ≈ 113 km`, `speed ≈ 7 800 m/s`
- **Watchdog checks:** standard ascent + `srb-thrust-asymmetry` (not modelled in 2D).

### `orbit-coast`
- **Envelope:** target `apoE ≈ 267 km, periE ≈ 244 km` after OMS-2.
- Real STS-1: 36 orbits, 54.5 h. Our model: `orbitCoastSimTime: 5400 s` (90 min, 1 sim orbit). Acceptable abstraction — the autopilot just needs the orbit to be stable and the deorbit window to come around.
- **Setpoints:** warp 1 000× during coast; throttle 0; attitude prograde.
- **Watchdog checks:**
  - `orbit-decay`: `periE < 200 km` and `vRadial < 0` for > 60 s sim → minor → callout
  - `oms-fuel-marginal`: capsule fuel < 30 % and deorbit not yet scheduled → moderate → bring deorbit forward
- **Exit:** standard `c.milestones.orbitCoasted`.

### `deorbit-burn`
- **Envelope:**
  - Retrograde burn, ~95–105 m/s Δv (real STS-1: 91.4 m/s, but our circularised orbit is similar)
  - Post-cut: `periE ≈ 60 km` (atmosphere-grazing, but Shuttle uses this — not 50 km like Soyuz)
- **Setpoints:** retrograde; throttle 1.0; warp 1×.
- **Watchdog checks:**
  - `deorbit-undershoot`: post-cut `periE > 110 km` → moderate → continue burn
  - `deorbit-overshoot`: post-cut `periE < 30 km` → moderate → cut early (steeper entry)

### `reentry`
- **Critical:** Shuttle enters far shallower than capsules. Flight-path angle at interface ≈ **-1.5°**, NOT the -5° to -7° of capsules. Heat shield is the underside tile array, requiring 40° AoA hypersonic.
- **Envelope:**
  - At AOS (122 km): `speed ≈ 7 600 m/s`, `flightPath ∈ [-2.5°, -0.5°]`
  - Through plasma (80–60 km): `speed > 4 000 m/s`, `temp` peaking
  - At TAEM (25 km): `speed ≈ Mach 2.5 ≈ 800 m/s`
  - At HAC entry (5 km): `speed ≈ 200 m/s`, glide path ~20° below horizontal
  - At threshold: `speed ≈ 100 m/s`, `altE ≈ 0` (Edwards lakebed)
- **Setpoints:**
  - 0–60 km: AoA 40° (high), bank reversals at 60° to bleed energy
  - 60–25 km: AoA decreasing 40° → 15°, lift vector dominates
  - Below 25 km: AoA ~10°, glide path -20° below horizontal
  - Throttle 0 throughout (glider).
- **Watchdog checks:**
  - `reentry-too-shallow`: at AOS `flightPath > -0.5°` → major → cannot fix in 2D, callout abort
  - `reentry-too-steep`: at AOS `flightPath < -3°` → major → orient lift-vector up, drop warp to 1×
  - `skip-out`: `vRadial > 0` and `altE > 80 km` after first entry → major → cannot recover, abort
  - `heat-critical`: `temperature > 0.95 × maxTemp` → major → adjust AoA to bleed less velocity per dip
  - `glide-too-fast`: at threshold `speed > landingSpeed × 1.5` → moderate → flare more aggressively
- **Exit:** `altE < 1 000 m` and on glide-path (`orbit-handover` triggered).

### `orbit-handover` (= runway approach + landing)
- Real STS-1: 295 km/h main-gear touchdown on Runway 23.
- Our model: `landingSpeed: 200 m/s` ceiling. Touchdown when `altE = 0` and `speed < landingSpeed`.

---

## What makes this different

The Shuttle is the **only ship in the catalogue that lands on a runway**, not under parachutes or with a soft-landing rocket. That changes:
1. Reentry envelope is much shallower (-1.5°, not -6°).
2. The autopilot needs to fly an active glide profile through plasma, then a powered (well, gliding) glide path to the runway. Today's `reentry` autopilot manages AoA + bank but not target lat/long — we're abstracting "land on runway" as "decelerate to under landingSpeed at altE=0".
3. No parachute saves you — if you're too fast at threshold, you crash.
4. OMS Δv budget is **tiny** (330 m/s total). One missed deorbit attempt can't be retried — you don't have the Δv to circularise back up.

---

## Standard recoveries (Shuttle-specific)

| Failure | Recovery |
|---|---|
| OMS-2 underburn | OMS trim to nominal apo before doors open |
| Premature deorbit | Re-orient prograde, fire OMS to circularise (eats reserve) |
| Reentry too steep | Lift-vector up via roll inversion; tolerate higher heat |
| Reentry too shallow | Cannot fix in 2D — would need aerobraking pass; callout abort |
| Energy too high at TAEM | Extra S-turn to bleed |
| Energy too low at TAEM | Cannot fix — short of runway |

---

## Test plan — anomaly injections

| Scenario | Inject | Expected recovery |
|---|---|---|
| Nominal | none | Reach orbit, deorbit, glide, land on runway |
| OMS-2 underburn | -20 m/s Δv | Trim to nominal orbit |
| Deorbit overburn | +30 m/s Δv | Steeper entry tolerated; energy mgmt absorbs |
| Reentry too steep | force flightPath = -3.5° | Lift-vector up, heat survived |
| Reentry too shallow | force flightPath = -0.3° | Major callout; mission flagged unsurvivable in 2D |

---

## Open questions

- Real Shuttle reentry uses 4 S-turn bank reversals at specific energy thresholds. Our autopilot does AoA control but no S-turn pattern. Could add as `reentry-energy` sub-state.
- Abort modes (RTLS, TAL, AOA, ATO) not modelled. STS-1 didn't use them, but real shuttle ops would. Out of scope for v0.7.0 watchdog (multi-vehicle abort modes deferred to v0.8.0 per WATCHDOG.md).
- Real STS-1 had the famous tile-loss anomaly — 16 tiles fell off the OMS pods during ascent, visible from a USAF KH-11 overflight. No effect on entry but caused a procedural change for STS-2+. Could capture as `tile-loss` cosmetic event.
- Cargo bay door open/close not modelled. Real Shuttle would lose its primary heat radiator if doors didn't open. We could add as a "checklist gate" before warp.
