# SLS Block 1 / Artemis I — flight plan

> Uncrewed shakedown to a distant retrograde orbit (DRO) and back. The
> longest the human-rated Orion capsule ever stayed in space.

```
shipKey:      sls
missionType:  moon-orbit        (lunar orbit + return, no landing)
real flight:  Artemis I, SLS Block 1 + Orion (uncrewed)
launch:       2022-11-16 06:47:44 UT, KSC LC-39B
crew:         Uncrewed (Commander Moonikin Campos manikin)
duration:     25d 10h 53m 22s
landing:      2022-12-11 17:40:30 UT, Pacific Ocean off Baja California
```

**Sources:**
- *Artemis I Reference Mission Description* (NASA SLS-PLAN-RPT-2018-0023)
- *Artemis I Press Kit* (NASA, 2022)
- *Artemis I Mission Status Reports* (NASA daily releases, Nov-Dec 2022)
- *NASA Inspector General report IG-22-003* — engineering issues
- Live mission control comments (NASA TV archives)

---

## Vehicle stack

| Stage | Inert / fuel mass (kg) | Engines | Thrust (N) | Isp (s) | Notes |
|---|---|---|---|---|---|
| 2× SRB (Five-segment) | 197 000 / 1 285 000 | 2× HTPB SRB | 2× 16 010 000 SL | 269 SL | Burn time 126 s |
| Core Stage | 85 270 / 987 467 | 4× RS-25D | 7 440 000 SL / 9 156 000 vac | 366 SL / 452 vac | Burn time ~480 s |
| ICPS (DCSS) | 4 717 / 26 853 | 1× RL10B-2 | 110 000 vac | 462 vac | Δv ~3 100 m/s |
| Orion CM + ESM | 9 300 / 8 600 | OMS-E + 8× R-4D-11 | 26 700 / 4× 110 each | 316 vac | Δv ~1 800 m/s |

Total Δv requirement (TLI + DRO insertion + return powered flyby + reentry): **~4 050 m/s**, roughly Apollo CSM's budget (no LM mass).

---

## Real flight timeline

T+ from launch ignition (06:47:44 UT, 16 Nov 2022).

| Phase | T+ (real) | Real event | Sim phase | Notes |
|---|---|---|---|---|
| Hold release | T+0:00 | RS-25 ignition T-6.36 s, SRBs T-0.04 | `pre-launch` | |
| Liftoff | T+0:01 | SRB fire = launch commit | `ascent` | |
| Mach 1 | T+1:01 | 7 km altitude | `ascent` | |
| **Max-Q** | **T+1:14** | 13 km, 28 kPa | `ascent` | RS-25 throttle 109 % → 95 % |
| **SRB sep** | **T+2:12** | Burnout, jettison | `ascent` (auto-stage) | |
| Core Stage solo | T+2:12 → T+8:03 | RS-25s alone | `ascent` | |
| **Core MECO** | **T+8:03** | Cutoff at 1 833 km/s, 96 km alt | `ascent` (auto-stage) | |
| Core sep | T+8:08 | ICPS exposed | `ascent` | |
| Orion + ICPS solo | T+8:08 → T+8:28 | Coast phase | `ascent` | |
| **Perigee Raise** (PRM) | **T+0:48:00** | 22-s ICPS burn, ~50 m/s | (watchdog mini-burn) | Raises peri above atmo |
| **TLI burn** | **T+1:38:13** | ICPS 18-min burn, ~3 100 m/s | `tli-burn` | Apo to ~389 000 km |
| ICPS + Orion sep | T+1:57:35 | ICPS jettisoned for disposal | (auto-stage) | |
| MCC-1 | T+8:00:00 | 5.2 m/s, fine-tune | (watchdog MCC) | |
| MCC-2 | T+24:00 | 0.34 m/s | (watchdog MCC) | Tiny |
| Outbound powered flyby | T+5d 8h 30m | OMS-E ~2 min 40 s | (mini-burn) | Sets up DRO |
| **DRO insertion** | **T+9d 14h 12m** | OMS-E 88 s, 269 m/s | `loi-burn` | 64 000 km lunar orbit |
| DRO half-revolution | T+9d → T+15d | Coast in DRO | `lunar-orbit-coast` | |
| **DRO departure** | **T+15d 5h 17m** | OMS-E 105 s, 281 m/s | `tei-burn` | Leave DRO |
| Return powered flyby | T+19d 21h 45m | OMS-E ~3 min 27 s, 297 m/s | (mini-burn) | Aim for Earth atmo entry |
| MCC-7 | T+24d 21h | 0.07 m/s | (watchdog MCC) | |
| **Service Module sep** | **T+25d 10h 14m** | ESM jettisoned | `reentry-prep` | |
| **Atmospheric interface** | **T+25d 10h 39m** | 122 km, 11 km/s, -5.86° | `reentry` | |
| First entry (skip) | T+25d 10h 41m | Initial entry, climb back to 53 km | `reentry` | Skip-entry profile |
| Second entry | T+25d 10h 49m | Final entry begins | `reentry` | |
| Drogues | T+25d 10h 51m | 7 km | `reentry` (auto) | |
| Mains | T+25d 10h 51m 30s | 1.5 km | `reentry` (auto) | |
| **Splashdown** | **T+25d 10h 53m** | 23.6° N, 116.5° W (off Baja) | `orbit-handover` | |

**Total real mission:** 25 d 10 h 53 m.

---

## Phases — expected envelopes + checks

(This is moon-orbit mission type. Phases shared with Saturn V plan unless noted differently.)

### `ascent`
- Different from Saturn V: SRBs are mandatory through T+2:12, then core RS-25 solo. Auto-stage handles transition.
- **Envelope:**
  - At T+2:12 (SRB sep): `altE ≈ 50 km ± 5`, `speed ≈ 1 600 m/s ± 100`
  - At T+8:03 (MECO): `altE ≈ 96 km ± 10`, `speed ≈ 7 950 m/s ± 200`
  - At PRM cutoff: `apoE ≈ 1 800 km ± 200`, `periE ≈ 185 km ± 20` (highly elliptical EAR-burn parking orbit)
- **Watchdog checks:** standard ascent checks apply.

### `tli-burn`
- Same as Saturn V envelope. Δv requirement ≈ 3 100 m/s (slightly higher than Apollo 11 because Orion has more dry mass than CSM).
- **Watchdog checks:**
  - `tli-undershoot`: post-cut `apoE < 0.97 × MOON_DISTANCE` → moderate → MCC-1 burn
  - `tli-overshoot`: `apoE > 1.10 × MOON_DISTANCE` → minor → MCC trim retrograde
- **Anomaly heritage (real Artemis I):** Pre-launch had four scrubs (hydrogen leak, weather). TLI nominal at +1:38:13.

### `loi-burn` (= DRO insertion in real Artemis I; we model as low lunar orbit)
- Real DRO is 64 000 km × 64 000 km. Our model uses `lunarApo / lunarPeri` from blueprint (~92 km × 92 km in current code — should we update?).
  - **Note:** blueprint should reflect real DRO altitude. TODO: bump `profile.lunarApo` for SLS to 64 000 km to match real Artemis I — or document we model SLS as low-lunar-orbit for game flow. Pending decision.
- **Envelope:** captures into the configured lunar orbit at perilune.
- **Watchdog checks:** same as Saturn V `loi-burn` (undershoot / overshoot / capture relaxation).

### `lunar-orbit-coast`
- Real Artemis I: 1.5 lunar revolutions in DRO over ~6 days.
- Our model: 21 600 s (3 lunar orbits at our shorter ~7 200 s orbital period). Acceptable abstraction.

### `tei-burn`
- Real Artemis I: DRO departure burn 281 m/s + return powered flyby 297 m/s. Two burns.
- Our model: single TEI burn until `altM > MOON_SOI * 0.6`. Loses fidelity but captures the energy budget.
- **Watchdog checks:**
  - `tei-shallow`: post-burn `predictedReentryAngle > -4°` → moderate → MCC trim retrograde
  - `tei-steep`: `predictedReentryAngle < -8°` → moderate → MCC trim prograde

### `reentry`
- Real Artemis I: skip-entry profile (first dip → climb to 53 km → second dip). Tests Orion thermal protection at 11 km/s.
- Our model: standard reentry. Skip-entry geometry not modelled; acceptable.

---

## Standard recoveries — same as Saturn V

MCC trim burns, LOI-2 circularisation, pre-LOI dodge.

---

## Test plan — anomaly injections

| Scenario | Inject | Expected recovery |
|---|---|---|
| Nominal | none | All milestones |
| TLI underburn | -4 % Δv | MCC-1 → restored perilune |
| Wide approach | TLI overshoot to 1.20 × MOON_DISTANCE | LOI fires earlier; wonky capture |
| Reentry too steep | TEI overshoot | MCC trim → angle restored |

---

## Open questions / TODOs

- Should we bump `profile.lunarApo` for SLS to 64 000 km (real DRO altitude) instead of 92 km? Game-flow decision: low orbit reads better in the 2D map; DRO would require zoom-out. **Recommendation:** keep at low orbit for game, document divergence.
- Skip-entry profile not modelled. Could be added as `reentry` sub-phase.
- Pre-launch holds (real Artemis I had 3-month delay due to Helium leak). Not relevant to autopilot.
