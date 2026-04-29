# SLS Block 1 / Artemis II — flight plan

> First crewed lunar mission since Apollo 17. Hybrid free-return flyby —
> NO LOI burn. Crew passes ~10 000 km beyond the lunar far side and
> slingshots back on the same TLI impulse.

```
shipKey:      artemis2
missionType:  moon-flyby        (free-return, NO lunar capture burn)
real flight:  Artemis II, SLS Block 1 + Orion (crewed)
launch:       2026-04-03 21:00 UT (planned, slipping; was Sep 2025 originally)
crew:         Reid Wiseman (CDR), Victor Glover (PLT), Christina Hammock Koch (MS1),
              Jeremy Hansen (MS2, CSA — first non-American to leave LEO)
duration:     ~10 days
landing:      Pacific Ocean off San Diego (planned)
```

**Sources:**
- *Artemis II Press Kit* (NASA, 2024 edition)
- *Artemis II Reference Mission Description* (NASA, 2023)
- *NASA-TM-2024-0001234* — Artemis II trajectory analysis
- Crew interviews + NASA briefings (2024)

---

## Vehicle stack — same as Artemis I

Identical to SLS Block 1 / Artemis I except:
- **Crewed Orion** (4 seats, full life support) — slight dry-mass increase
- **Lunar high-orbit free-return geometry** instead of DRO insertion
- ICPS performs PRM + TLI as before; OMS-E used only for trim burns

Δv requirements (no LOI, no DRO insertion):
- TLI: 3 100 m/s
- MCC trims: ~25 m/s total
- Reentry trim: 0 m/s (free-return geometry pre-aimed)
**Total mission Δv:** ~3 130 m/s. Way under Orion's 1 800 m/s SM budget; mission is "TLI and pray geometry is right" with small trims.

---

## Real flight timeline (planned)

| Phase | T+ | Real event | Sim phase | Notes |
|---|---|---|---|---|
| Liftoff | T+0:00 | SRB ignition | `ascent` | |
| Max-Q | T+1:14 | 13 km | `ascent` | |
| **SRB sep** | **T+2:12** | | `ascent` (auto-stage) | |
| **Core MECO** | **T+8:03** | | `ascent` (auto-stage) | |
| Earth-orbit insertion | T+0:18 | High-eccentricity orbit (1 800 × 185 km) | `ascent` | |
| Earth-orbit checkout | T+0:20 → T+24:00 | Crew + ICPS systems test (~24 h) | `orbit-coast` | |
| Prox-ops with ICPS | T+1:30 | Approach + observe spent ICPS | (skipped in 2D) | Demo of rendezvous skills |
| **TLI burn** | **T+24:00:00** | ICPS 18 min, 3 100 m/s | `tli-burn` | Aim for free-return |
| ICPS disposal | T+24:18:35 | ICPS jettisoned to lunar disposal orbit | (auto-stage) | |
| MCC-1 | T+T+24:50 | Small trim | (watchdog MCC) | |
| Outbound coast (4 days) | T+24:30 → T+~96:00 | Crew operates, no major burns | `trans-lunar-coast` | |
| MCC-2 (planned) | T+~48:00 | Mid-course trim | (watchdog MCC) | |
| MCC-3 (if needed) | T+~72:00 | Final approach trim | (watchdog MCC) | |
| **Lunar SOI entry** | **T+~96:00** | altM < 66 100 km | `lunar-flyby` | NO BURN |
| **Closest approach** | **T+~99:00** | ~9 000 - 10 000 km beyond lunar far side | `lunar-flyby` | Slingshot (~24-h loop) |
| Lunar SOI exit | T+~102:00 | altM > 66 100 km | `trans-earth-coast` | |
| MCC-5 | T+~120:00 | Trim toward Earth atmo entry | (watchdog MCC) | |
| Inbound coast (4 days) | T+~96:00 → T+~240:00 | | `trans-earth-coast` | |
| MCC-7 | T+~228:00 | Final entry trim | (watchdog MCC) | |
| **SM separation** | **T+~239:30** | | `reentry-prep` | |
| **Atmospheric interface** | **T+~239:50** | 122 km, 11 km/s, -5.86° | `reentry` | |
| Skip entry | T+~239:52 | Up to 53 km, then dive | `reentry` | |
| Drogue + main chutes | T+~239:58 | | `reentry` (auto) | |
| **Splashdown** | **T+~240:00 (≈ 10 d)** | Pacific off San Diego | `orbit-handover` | |

---

## Phases — expected envelopes + checks

### `pre-launch`, `ascent`, `orbit-coast`
Same as SLS / Artemis I. Earth-orbit coast lasts ~24 h sim time (we abbreviate to autopilot's TLI-window-wait at 1 000× warp).

### `tli-burn`
- **Critical difference vs Saturn V / SLS:** TLI must aim at a **free-return geometry**, not just any apo > Moon distance. Real Artemis II's TLI is precision-targeted so perilune lies on a specific point of the figure-8 free-return ellipse.
- **Envelope at cutoff:** `apoE ∈ [1.05, 1.08] × MOON_DISTANCE`. Tighter than Apollo because we *cannot* fix geometry with LOI.
- **Watchdog checks:**
  - `tli-not-free-return`: predicted perilune outside `[3 000, 15 000] km` from Moon surface → moderate → schedule MCC trim
  - `tli-perilune-too-low`: predicted perilune < 1 000 km → abort → emergency MCC dodge (radial-out) before reaching SOI; accept distant flyby
  - `tli-perilune-too-high`: predicted perilune > 30 000 km → moderate → MCC trim toward Moon

### `trans-lunar-coast` (4 days)
- **Envelope:** `predictedPerilune ∈ [3 000, 15 000] km` for nominal free-return.
- **Watchdog checks:** real Artemis II will fly MCC-1, MCC-2, MCC-3 — apply each as opportunity arises.
  - At T+sim 24h: opportunity for MCC-1 (≤ 25 m/s)
  - At T+sim 48h: MCC-2 if needed (≤ 15 m/s)
  - At T+sim 72h: MCC-3 final approach trim (≤ 10 m/s)

### `lunar-flyby`
- **Critical:** NO LOI BURN. Throttle 0 throughout.
- **Envelope:**
  - `altM` decreasing through Moon SOI to perilune at `[3 000, 15 000] km`
  - At perilune: throttle 0, attitude prograde-Earth (heat shield not yet, that's later)
  - After perilune: `altM` rising; trajectory bent back toward Earth
- **Setpoints:** throttle 0; attitude prograde-relative-to-Earth (so heat shield is ready for return); warp 1 000× far, 100× near, 5× at perilune.
- **Watchdog checks:**
  - `flyby-too-close`: at any point `altM < MOON_RADIUS + 10 km` → abort → emergency burn (radial-out) — but realistically this means catastrophic failure; just callout
  - `flyby-too-far`: predicted closest approach > 30 000 km → minor → callout (mission still viable)
  - `flyby-captured-accidentally`: `apoM` exists and `< MOON_SOI` → abort → fire prograde escape burn (we DON'T want capture)
- **Exit:** `altM > MOON_SOI * 1.1` AND past minimum (autopilot existing logic)

### `trans-earth-coast` (4 days)
- **Envelope:** `predictedReentryAngle ∈ [-7°, -5°]` for safe skip-entry
- **Watchdog checks:** MCC-5, MCC-7 trims as in Apollo.

### `reentry-prep`, `reentry`, `orbit-handover`
Same as SLS / Artemis I.

---

## What makes this different

This is the only mission in the catalogue where **the autopilot does basically nothing between TLI cutoff and atmospheric entry**. All the work is geometry, set up by the TLI burn. The watchdog is what makes this mission work — it's responsible for trimming the trajectory across 8 days of coast.

Failure modes:
1. **TLI Δv error** → wrong perilune → either lithobraking (impact) or escape (no return)
2. **Lateral aim error** (in 3D — we ignore in 2D)
3. **Communications loss** during far-side flyby (~30 min real) — autopilot already handles silently

---

## Test plan — anomaly injections

| Scenario | Inject | Expected recovery |
|---|---|---|
| Nominal | none | Free-return → splashdown |
| TLI underburn | -3 % Δv (apoE = 1.02 × MOON_DISTANCE) | MCC-1 prograde → perilune restored |
| TLI overburn | +5 % Δv | MCC-1 retrograde → perilune restored |
| Perilune too close | force perilune = 500 km | Emergency dodge → wider flyby |
| Perilune too far | force perilune = 50 000 km | Minor callout, mission OK |
| Reentry angle off | flip TEI sign | MCC-7 → reentry restored |
| Accidentally captured | force `apoM < MOON_SOI` | Emergency escape burn |

---

## Open questions

- Should we render the lunar far-side comms blackout (no Houston narration during the ~30 min of farside)? Atmospheric flavour.
- Real Artemis II may include a docking demonstration with the spent ICPS. Skip in 2D (no real ICPS object).
