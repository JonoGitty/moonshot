# R-7 / Sputnik 1 — flight plan

> The world's first artificial satellite. An 84 kg polished aluminium sphere
> with four trailing antennae, beeping on 20.005 and 40.002 MHz from low
> orbit. Launched a hidden cold-war race and the entire space age.

```
shipKey:      sputnik
missionType:  orbit-only
real flight:  Sputnik 1 (PS-1, "Prosteyshiy Sputnik 1" — Simplest Satellite 1)
launch:       1957-10-04 19:28:34 UT, Tyuratam (Baikonur) Site 1/5
crew:         Uncrewed (83.6 kg radio beacon)
duration:     91 days transmitting; 96 days in orbit before reentry burn-up
landing:      1958-01-04 (estimated reentry, no recovery)
```

**Sources:**
- *Sputnik and the Soviet Space Challenge* (Asif Siddiqi, *Sputnik to Apollo*, NASA SP-2003-4408)
- *Sputnik: The Shock of the Century* (Paul Dickson, 2001)
- Original TASS announcement (4 October 1957)
- Korolev mission archive (declassified Roscosmos releases, 2007)
- *Red Star in Orbit* (James Oberg, 1981) — Soviet program insider

---

## Vehicle stack

| Stage | Inert / fuel mass (kg) | Engines | Thrust (N) | Isp (s) | Notes |
|---|---|---|---|---|---|
| 4× Strap-on (Block B/V/G/D) | 14 000 / 128 000 each | 4× RD-107 | 4× 970 000 SL | 256 / 313 | Burn 118 s, parallel-staged |
| Core (Block A) | 6 000 / 95 000 | 1× RD-108 | 940 000 SL | 245 / 308 | Burn ~285 s |
| Sputnik 1 (PS-1) | 84 / 0 | None | None | — | Polished sphere + 4 antennae |

**Total Δv:** launch ~9 000. Sputnik has **NO propulsion of any kind** — once released by the core stage, it's pure ballistic orbit + atmospheric decay.

**Note:** Sputnik used the **8K71PS** variant of the R-7 — the same family as Vostok-K and Soyuz, but stripped down (no upper stage). This is the **only ship in the catalogue without a third stage** — orbital velocity is achieved by the core stage alone with a slight helping shove from the satellite's spring ejection.

---

## Real flight timeline

T+ from launch (19:28:34 UT, 4 Oct 1957).

| Phase | T+ (real) | Real event | Sim phase | Notes |
|---|---|---|---|---|
| Hold release | T-0:00 | Korolev: "Pusk!" — final call | `pre-launch` | Engineers in bunker |
| **Liftoff** | **T+0:00** | All 5 engines (20 nozzles) ignite | `ascent` | Tyuratam, predawn |
| Mach 1 | T+1:01 | ~9 km altitude | `ascent` | |
| **Korolev cross** | **T+1:58** | Strap-on sep, 4-petal pattern | `ascent` (auto-stage) | Identical to Vostok |
| LES jettison | (none) | No LES on Sputnik PS-1 | — | Uncrewed |
| **Core burnout** | **T+5:00** | RD-108 cuts | `ascent` (auto-stage) | |
| **Satellite ejection** | **T+5:14** | Spring-loaded sep, 1 m/s | `orbit-coast` (auto) | PS-1 free in orbit |
| Antenna unfurl | T+5:30 | 4× 2.4 m antennae spring out | (cosmetic) | |
| **Beep** | **T+15:00** | First radio signal heard | (cosmetic) | TASS announcement at T+1 day |
| First orbit complete | T+1h 36m | Period 96.2 min | `orbit-coast` | |
| ... 91 days transmitting ... | T+1d → T+91d | Beeping continuously | `orbit-coast` (warp) | Battery dies at T+91d |
| Battery dies | T+91d | Final transmission | (cosmetic) | |
| ... 5 more days silent orbit ... | T+91d → T+96d | Decay continuing | `orbit-coast` (warp) | |
| **Atmospheric reentry** | **T+96d** | Burn-up over Atlantic Ocean | `reentry` (no recovery) | Estimated 1958-01-04 |

---

## Phases — expected envelopes + checks

### `pre-launch`
- No special checks. R-7 8K71PS was the simplest variant — strip-down for prestige launch.
- **Anomaly heritage:** R-7 had multiple failures during 1957 testing (5 of first 6 launches failed). Sputnik 1 was the breakthrough launch.

### `ascent`
- **Critical detail:** Sputnik ascent is **2-stage** (strap-ons + core). No upper stage. The core delivers the satellite directly into orbit.
- Our 2D model: 2 stages. Stage 1 = 4× strap-ons (modelled as one). Stage 2 = core. Capsule = the sphere itself (no propulsion).
- **Envelope:**
  - At T+1:58 (strap-on sep): `altE ≈ 47 km`, `speed ≈ 1 550 m/s`
  - At T+5:00 (MECO): `altE ≈ 200 km`, `speed ≈ 7 800 m/s` (orbital — core does it all)
  - At T+5:14 (sep): `apoE ≈ 939 km`, `periE ≈ 215 km`, 65.1° incl
- **Watchdog checks:** standard ascent, plus:
  - `apo-shortfall`: `apoE < 700 km` → moderate → no recovery — orbit will decay faster (Sputnik 1 was already decay-fast at periE = 215 km; lower would mean weeks not months)

### `orbit-coast`
- **Envelope:** target `apoE ≈ 939 km, periE ≈ 215 km`. Period 96 min.
- **Critical detail:** the perigee at 215 km means atmospheric drag is significant. Real Sputnik decayed in 96 days. We don't try to model the full decay — sim ends at "stable orbit achieved" milestone.
- Real flight: 1 440 orbits over 96 days. Our model: `orbit-only` mission, milestone is `orbitCoasted` after `orbitCoastSimTime` (uses default 5 400 s = 1 sim orbit).
- **Setpoints:** warp 1 000× during coast; satellite has no propulsion so no thrust setpoints; attitude is moot.
- **Watchdog checks:**
  - `orbit-too-low`: `periE < 150 km` → moderate → callout (orbit decays in days not months)
  - `orbit-too-high`: `apoE > 1 500 km` → minor → callout (more delta-v than expected, mission still works)

### `reentry`
- **Sim divergence:** Real Sputnik 1 burned up over the Atlantic on 4 January 1958 — there is no recovery. Our `mission: 'orbit-only'` should end at orbital insertion, not pursue reentry.
- Sputnik 1 had **no heat shield** (it was a plain aluminium sphere). If our orbit decays, the watchdog should flag `decay-imminent` but the mission ends as "satellite achieved orbit" — beep success.

---

## What makes this different

Sputnik 1 is the **only mission in the catalogue with no astronaut, no return, and no propulsion**. Mission success is **literally just "reach orbit"**. From the watchdog's perspective:
1. **Shortest possible mission.** Insertion at T+5:14, end of mission at T+5:14 + 1 sim orbit.
2. **No abort options.** No crew to save. No retrograde to fire. If the R-7 fails, the satellite is debris.
3. **Historical weight per kg.** The smallest payload in the catalogue (84 kg) but kicked off the entire space age. Worth treating with cosmetic reverence (intro narration referencing TASS announcement, "*beep* *beep* *beep*" sound effect on insertion).
4. **R-7 family showcase.** Same launcher family as Vostok and Soyuz — three missions in the catalogue use R-7-derived rockets, demonstrating evolution from PS-1 (1957) → Vostok-K (1961) → Soyuz-FG (2015).

---

## Standard recoveries

| Failure | Recovery |
|---|---|
| Strap-on early sep | Continue on core, accept lower orbit |
| Core MECO early | Cannot reach orbit — mission failed (no upper stage to retry) |
| Core MECO late | Higher orbit, mission still succeeds |

---

## Test plan — anomaly injections

| Scenario | Inject | Expected recovery |
|---|---|---|
| Nominal | none | Reach 215 × 939 km orbit |
| MECO early | -300 m/s | Suborbital — mission failed callout |
| MECO late | +200 m/s | Higher orbit, mission OK |

---

## Open questions

- Should Sputnik missions end at orbital insertion (current state) or play out N orbits with cosmetic "beep" callouts at each pass over Tyuratam? Could be a sandbox-mode special — cool flavour, no autopilot work.
- Real Sputnik beeped on 20.005 and 40.002 MHz. Could play a 1 Hz beep audio file when in orbit. Sound design is out of scope but recorded here.
- The 4 antennae unfurled by spring — could render as a particle effect on insertion. Cosmetic.
- Sputnik 2 (Laika, 3 November 1957) and Sputnik 3 (geophysics, 1958) are not modelled. Could be added later as variants of the same R-7.
- The 8K71PS variant differs from later R-7s (Vostok-K, Soyuz). Worth a code comment in `constants.js` noting the lineage.
