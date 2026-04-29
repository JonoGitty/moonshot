# Soyuz-FG / TMA-19M (Principia) — flight plan

> Tim Peake's mission to the ISS. Six-hour fast-rendezvous, 186-day stay,
> ballistic re-entry to the Kazakh steppe.

```
shipKey:      soyuz
missionType:  iss-dock
real flight:  Soyuz TMA-19M "Principia"
launch:       2015-12-15 11:03:09 UT, Baikonur Cosmodrome LC-1/5 ("Gagarin's Start")
crew:         Yuri Malenchenko (CDR), Tim Peake (FE-1, ESA), Tim Kopra (FE-2, NASA)
duration:     185d 22h 11m 24s (full mission); first 6 hours to dock
landing:      2016-06-18 09:14:33 UT, Dzhezkazgan steppe, Kazakhstan
```

**Sources:**
- *Soyuz Crew Operations Manual* (RSC Energia, public excerpts)
- *NASA ISS Expedition 46/47 mission summary*
- *Tim Peake — Hello, Is This Planet Earth?* (autobiography)
- ESA mission archive (Principia)
- TsUP (Mission Control Moscow) launch + landing transcripts

---

## Vehicle stack

| Stage | Inert / fuel mass (kg) | Engines | Thrust (N) | Isp (s) | Notes |
|---|---|---|---|---|---|
| Block A (Stage 1, 4 strap-ons) | 16 800 / 159 200 each | 4× RD-107A | 4× 1 020 000 SL | 263 / 320 | Burn 118 s |
| Block A core (Stage 2) | 9 700 / 90 100 | 1× RD-108A | 994 000 SL | 257 / 320 | Burn 286 s, parallel-staged with strap-ons |
| Block I (Stage 3) | 2 410 / 21 300 | 1× RD-0110 | 298 000 vac | 326 vac | Burn 240 s |
| Soyuz Descent Module + Service Module | ~7 200 dry / ~880 fuel | KTDU-80 | 2 950 vac | 302 vac | DV ~390 m/s |

**Total Δv** (to ISS): launch ~9 200, phasing ~30, deorbit ~115. Comfortable margins.

---

## Real flight timeline

T+ from launch (11:03:09 UT, 15 Dec 2015).

| Phase | T+ (real) | Real event | Sim phase | Notes |
|---|---|---|---|---|
| Liftoff | T+0:00 | All 5 first-stage engines | `ascent` | |
| Mach 1 | T+1:00 | | `ascent` | |
| **Strap-on sep** | **T+1:58** | "Korolev cross" pattern | `ascent` (auto-stage) | |
| LES jettison | T+2:50 | Launch escape tower jettisoned | (not modelled) | |
| **Core MECO** | **T+4:46** | Block A cuts | `ascent` (auto-stage) | |
| Core sep | T+4:48 | | `ascent` | |
| **Block I ignition** | **T+4:48** | Stage 3 RD-0110 | `ascent` | |
| **SECO** | **T+8:48** | Orbit insertion at 200 × 240 km, 51.6° incl | `orbit-coast` (auto) | Apo ≈ ISS altitude |
| Block I sep | T+8:50 | Soyuz capsule on its own | `orbit-coast` | |
| **DV-1** (phasing burn 1) | **T+0:46:00** | KTDU-80 burn, fine-tune apo | (watchdog mini) | Real fast-rendezvous burn |
| **DV-2** (phasing burn 2) | **T+1:21:00** | Raise periapsis | (watchdog mini) | |
| **DV-3** (phasing burn 3) | **T+2:30:00** | Final phasing | (watchdog mini) | |
| **DV-4** (rendezvous) | **T+3:30:00** | Close on ISS | `iss-rendezvous` | |
| **Rendezvous initiation** | **T+5:00:00** | Within 80 km of ISS | `iss-rendezvous` | Auto-piloted approach |
| **Soft dock** | **T+5:33:00** | Rassvet (MRM-1) docking port | `iss-rendezvous` (dock) | Hard dock + hooks ~10 min later |
| **Hard dock + hatch open** | **T+~7:30:00** | Crew transfer | `iss-stay` | Begin 186-day stay |
| ... 186 days on ISS ... | T+186 d | Various science / EVAs | `iss-stay` | Compressed in sim |
| Hatch close + undock | T+186d | Soyuz separates | (auto: undock) | |
| **Deorbit burn (DV-5)** | **T+186d 4h 20m** | KTDU-80 retrograde, 263 s, ~115 m/s | `deorbit-burn` | |
| Module sep | T+186d 4h 53m | Service + Orbital Modules jettisoned | `reentry-prep` (auto-stage) | |
| **Atmospheric interface** | **T+186d 5h 03m** | 122 km, 7.6 km/s, -1.4° flight-path | `reentry` | |
| Plasma blackout | T+186d 5h 04m → 5h 09m | | `reentry` | |
| **Drogue parachute** | **T+186d 5h 12m** | 8.8 km altitude | `reentry` (auto) | |
| **Main parachute** | **T+186d 5h 13m** | 5.5 km altitude | `reentry` (auto) | Single 1 000 m² canopy |
| **Soft-landing rockets** | **T+186d 5h 14m** | < 1 m altitude, gamma-altimeter | `reentry` (auto) | 6× retrorockets fire ~1 m above ground |
| **Touchdown** | **T+186d 5h 14m 33s** | 47°20'N, 69°34'E (Dzhezkazgan steppe) | `orbit-handover` | |

---

## Phases — expected envelopes + checks

### `ascent`
- **Critical detail:** Soyuz ascent has **parallel staging** — 4 strap-ons + core fire together for 1 min 58 s, then strap-ons jettison while core continues. Our 2D model abstracts as single first stage.
- **Envelope:**
  - At T+1:58 (strap-on sep): `altE ≈ 47 km`, `speed ≈ 1 700 m/s`
  - At T+4:46 (MECO): `altE ≈ 165 km`, `speed ≈ 5 600 m/s`
  - At T+8:48 (SECO): `altE ≈ 200 km`, `apoE ≈ 240 km`, `periE ≈ 200 km`
- **Watchdog checks:** standard ascent.

### `orbit-coast`
- **Envelope:** ISS altitude target. `apoE ≈ 408 km, periE ≈ 408 km` after phasing.
- Real Soyuz uses 4 phasing burns (DV-1 to DV-4) to align with ISS. Our model uses snap-to-ISS after fixed wait.
- **Setpoints:** warp 1 000× during phasing wait.

### `iss-rendezvous`
- **Envelope:**
  - Distance to ISS: closing from > 100 km to < 100 m
  - Closing rate: < 0.5 m/s within 50 m (real Kurs / TORU autopilot)
- **Setpoints:** snap-to-ISS at sim T+3 h (autopilot fast-forwards real phasing); throttle 0 within 50 m.
- **Watchdog checks:**
  - `approach-too-fast`: closing rate > 5 m/s within 100 m → major → brake-burn retrograde
  - `dock-axis-wrong`: not modelled in 2D
- **Exit:** `c.milestones.dockedWithISS`

### `iss-stay`
- 186 days real. Our model: `coastSec` parameter (default 600 s sim).
- Warp idx 7 (1 000×).

### `deorbit-burn`
- **Envelope:**
  - Retrograde burn, ~115 m/s Δv
  - Post-cut: `periE ≈ 50–70 km` (atmosphere-grazing)
- **Watchdog checks:**
  - `deorbit-undershoot`: post-cut `periE > 100 km` → moderate → continue burn
  - `deorbit-overshoot`: `periE < 30 km` → minor → cut early (steeper entry, more g-load)

### `reentry`
- Ballistic profile (real Soyuz). Peak 4–5 g for nominal entry.
- Anomaly heritage: TMA-1 (2003) and TMA-11 (2008) had ballistic re-entries with up to 8.2 g — module separation issue. Captured as `module-sep-failure` watchdog check (rare but historic).

### `iss-rendezvous` ↔ `iss-stay` ↔ `deorbit-burn` autopilot already exists. Watchdog adds:
- `dock-aborted`: closing > 5 m/s within 100 m → major → brake + reapproach
- `module-sep-failure`: stage-down didn't complete by atmospheric interface → major → force separate

---

## Test plan — anomaly injections

| Scenario | Inject | Expected recovery |
|---|---|---|
| Nominal | none | Dock + return |
| Approach too fast | force closing 10 m/s at 80 m | Brake, reapproach |
| Deorbit underburn | -30 m/s Δv | Watchdog continues burn |
| Module sep failure | block stage at deorbit | Watchdog forces separate |

---

## Open questions

- Real Soyuz uses Kurs autonomous rendezvous (radar) + TORU manual backup. Our model snaps. Could simulate Kurs as a more visible approach trajectory in the in-flight overlay (F1a in PLAN.md).
- Soft-landing retrorockets — already modelled? Check `parachuteDrag` config in constants.js. (TODO during R1 audit.)
