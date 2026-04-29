# Saturn V / Apollo 11 — flight plan

> First crewed lunar landing. Fly the real timeline; recover from the real
> anomalies the way Mission Control did.

```
shipKey:      saturn5
missionType:  moon              (lunar landing + return)
real flight:  Apollo 11, Saturn V SA-506
launch:       1969-07-16 13:32:00 UT, KSC LC-39A
crew:         Neil A. Armstrong (CDR), Michael Collins (CMP), Edwin "Buzz" Aldrin (LMP)
duration:     8d 3h 18m 35s
landing:      1969-07-24 16:50:35 UT, Pacific Ocean (13°19' N, 169°09' W)
```

**Sources:**
- *Apollo 11 Press Kit* (NASA Office of Public Affairs, 1969)
- *Apollo 11 Mission Report* MSC-00171 (NASA, Nov 1969)
- *Saturn V Flight Manual SA-506* (MSFC, 1969)
- *Apollo Operations Handbook, LM-5* (Grumman, 1969)
- *Apollo Lunar Surface Journal* (Eric M. Jones, ed.)
- *Apollo by the Numbers* (NASA SP-2000-4029, Orloff)

---

## Vehicle stack (verify against `js/constants.js:saturn5`)

| Stage | Inert / fuel mass (kg) | Engines | Thrust SL (N) | Isp SL / vac (s) | Δv (vac, m/s) |
|---|---|---|---|---|---|
| S-IC | 130 000 / 2 169 000 | 5× F-1 | 33 410 000 | 263 / 304 | ~3 100 |
| S-II | 36 000 / 451 000 | 5× J-2 | — / 5 000 000 vac | — / 421 | ~4 200 |
| S-IVB | 11 300 / 106 600 | 1× J-2 | — / 1 033 000 vac | — / 421 | ~4 100 |
| CSM (SM) | 6 100 / 18 410 | AJ10-137 SPS | — / 91 200 vac | — / 314 | ~2 800 |
| LM Descent | 2 165 / 8 200 | TRW LMDE | — / 45 040 vac | — / 311 | ~2 470 |
| LM Ascent | 2 130 / 2 376 | Bell ARS | — / 15 600 vac | — / 311 | ~2 220 |

**Total real Δv (post-orbit, capsule-to-Moon-and-back):** ~9 200 m/s
**Mission Δv requirement:** TLI 3 050 + LOI 900 + DOI 25 + PDI 2 110 + Ascent 1 850 + Rendezvous 35 + TEI 950 + MCCs 25 = **~8 945 m/s**. Margin ≈ 250 m/s.

---

## Real flight timeline

T+ from launch ignition (13:32:00 UT, 16 Jul 1969).

| Phase | T+ (real) | Real event | Sim phase | Notes |
|---|---|---|---|---|
| Pre-launch | T-9:00 | Holddown release armed | `pre-launch` | Throttle 0, attitude vertical |
| Liftoff | T+0:00 | All 5 F-1s at 7 600 t thrust | `ascent` | Throttle 1.0 |
| Roll program | T+0:09 | Roll to 72° launch azimuth | — | (skipped in 2D) |
| Pitch program | T+0:11 | Begin pitch-east | `ascent` | Gravity turn |
| Mach 1 | T+1:06 | 7.5 km altitude | `ascent` | callout `mach1` |
| Max-Q | T+1:23 | 13.5 km, 32 kPa dynamic pressure | `ascent` | F-1 throttle-down to inboard 5×4 |
| S-IC inboard cutoff | T+2:15 | Centre F-1 cuts | — | (single-engine cluster in our model) |
| **S-IC cutoff** | **T+2:42** | All F-1s off, alt 67 km, vel 2 750 m/s | `ascent` (auto-stage) | |
| S-IC sep | T+2:44 | Stage drops away | `ascent` | |
| S-II ignition | T+2:46 | All 5 J-2s | `ascent` | |
| Launch escape jettison | T+3:18 | LES tower jettisoned | — | (not modelled) |
| **S-II cutoff** | **T+9:11** | Alt 185 km, vel 6 970 m/s | `ascent` (auto-stage) | |
| S-IVB first ignition | T+9:13 | Single J-2 | `ascent` | |
| **SECO-1** (parking orbit) | **T+11:39** | 185 × 184 km circ, 32.5° incl | `orbit-coast` | Apo target met |
| Earth-orbit coast | T+11:39 → T+2:44:16 | 1.5 orbits, 2 h 32 min | `orbit-coast` | Wait for TLI window |
| **TLI ignition** (S-IVB second burn) | **T+2:44:16** | 5 min 47 s burn | `tli-burn` | Δv +3 050 m/s prograde |
| **TLI cutoff** | **T+2:50:03** | Translunar coast begins | `trans-lunar-coast` | Apo ≈ 380 000 km |
| CSM/LM extraction | T+3:24 | "Transposition, docking, extraction" | — | (skipped) |
| MCC-1 (planned, skipped) | T+11:39:32 | — | — | Not needed |
| MCC-2 (executed) | T+26:44:58 | 6.4 m/s burn, fine-tune perilune | (watchdog MCC) | Tiny trim |
| **LOI-1** (CSM SPS) | **T+75:49:50** | 357.5 s burn, 891 m/s retrograde | `loi-burn` | Capture into 311 × 113 km lunar orbit |
| LOI-2 (circularisation) | T+80:11:36 | 17 s burn, 47 m/s | (watchdog mini-burn) | Round to 119 × 100 km |
| Lunar orbit coast (13 orbits) | T+80:12 → T+100:12 | ~2 h per orbit | `lunar-orbit-coast` | |
| **LM undocking** (Eagle / Columbia) | **T+100:12:00** | "The Eagle has wings" | `lunar-orbit-coast` (undock) | |
| **PDI** (Powered Descent Initiation) | **T+102:33:05** | LMDE ignition, 12 min descent | `lunar-descent` | High-gate → Low-gate |
| Pitchover | T+102:39:20 | Throttle reduce, switch to PROG mode | `lunar-descent` | |
| 1201/1202 alarms | T+102:38:21 onwards | Computer overload (real anomaly) | (watchdog: continue) | Mission Control: "Go" |
| Low-fuel light | T+102:43:54 | 60 sec to bingo | (watchdog: continue) | Armstrong went manual P66 |
| **Lunar touchdown** | **T+102:45:39** | "Tranquility Base here. The Eagle has landed." | `lunar-stay` | 13°19'N 169°9'W lunar |
| Surface stay | T+109:24 → T+124:22 | 21 h 36 min total (EVA 2 h 31 m) | `lunar-stay` | |
| **Lunar ascent ignition** | **T+124:22:00** | LM Ascent stage, ~7 min | `lunar-ascent` | Δv +1 850 m/s |
| Insertion to orbit | T+124:29:15 | 17 × 87 km lunar orbit | `lunar-ascent` | |
| LM rendezvous + dock | T+128:03:00 | "Bull's-eye dock" | (auto: dockCSM) | |
| LM jettison | T+130:09:31 | Eagle ascent stage discarded | — | |
| **TEI** (CSM SPS) | **T+135:23:42** | 2 min 30 s, 994 m/s prograde | `tei-burn` | Escape lunar SOI |
| MCC-5 (executed) | T+150:30 | Tiny trim | (watchdog MCC) | |
| MCC-7 (executed) | T+188:30 | Tiny trim | (watchdog MCC) | |
| CM/SM separation | T+194:49:13 | Service Module jettisoned | `reentry-prep` | |
| **Atmospheric interface** | **T+195:03:06** | 122 km, 11 km/s, -6.5° flight-path | `reentry` | |
| Drogue chutes | T+195:13:40 | 7 km altitude | `reentry` (auto) | |
| Main chutes | T+195:14:21 | 3 km altitude | `reentry` (auto) | |
| **Splashdown** | **T+195:18:35** | 13°19'N 169°9'W, 24 km from USS Hornet | `orbit-handover` | |

**Total real mission:** 195 h 18 m 35 s ≈ 8 d 3 h.

---

## Phases — expected envelopes + checks

### `pre-launch`
- **Envelope:** `altE = 0`, `throttle = 0`, attitude vertical (90° pitch)
- **Setpoints:** throttle 1.0 at hold release
- **Watchdog checks:**
  - Standard: none active.
- **Exit:** `!craft.landed`

### `ascent` (S-IC + S-II + S-IVB to LEO)
- **Envelope:**
  - `altE`: monotonic increasing from 0 → 185 km
  - At T+2:42: `altE ≈ 67 km ± 5 km`, `speed ≈ 2750 m/s ± 200 m/s`
  - At T+9:11: `altE ≈ 185 km ± 15 km`, `speed ≈ 6970 m/s ± 300 m/s`
  - At T+11:39 (SECO-1): `apoE ≈ 185 km ± 15 km`, `periE ≈ 180 km ± 15 km`
- **Setpoints:** throttle 1.0; sqrt-pitch program (90° at altE < 300 m → 0° at altE > 200 km); throttle-down at q > 35 kPa.
- **Watchdog checks:**
  - `ascent-pitch-too-steep`: pitch > expected + 10° → minor → recalibrate pitch table
  - `ascent-pitch-too-shallow`: pitch < expected − 10° AND altE < 80 km → moderate → recalibrate
  - `ascent-apo-low`: at SECO-1 condition (`apoE > 0` checked), `apoE < 150 km` → moderate → extend S-IVB burn until `apoE ≥ 180 km`
  - `ascent-apo-high`: `apoE > 250 km` → minor → cut S-IVB early
- **Exit:** `c.milestones.reachedOrbit`

### `orbit-coast` (parking orbit, 1.5 orbits)
- **Envelope:** `apoE ∈ [170, 200] km`, `periE ∈ [170, 200] km`, throttle 0
- **Setpoints:** throttle 0, attitude prograde, warp idx 7 (1 000×) until TLI window
- **Watchdog checks:**
  - `parking-orbit-decay`: `periE < 150 km` → moderate → small prograde trim at apo
  - `parking-orbit-eccentric`: `|apoE - periE| > 30 km` → minor → callout, no auto-action
  - `tli-window-overshoot`: missed Moon lead angle by > 4° → minor → wait next window
- **Exit:** Moon lead angle within ±4° of 114° (TLI window open)

### `tli-burn`
- **Envelope:**
  - During burn: `apoE` monotonic increasing
  - At cutoff: `apoE ∈ [1.00, 1.10] × MOON_DISTANCE = [384, 423] Mm`
  - Burn duration ≈ 5–6 min sim
- **Setpoints:** throttle 1.0, attitude prograde, warp 10× during burn
- **Watchdog checks:**
  - `tli-attitude-drift`: |target - actual angle| > 3° for > 2 s sim → moderate → drop warp to 1×
  - `tli-fuel-underrun`: S-IVB fuel < 5% AND `apoE < 0.95 × MOON_DISTANCE` → major → cut burn, schedule MCC-2 with ≤ 50 m/s budget
  - `tli-overshoot`: `apoE > 1.5 × MOON_DISTANCE` → moderate → cut burn now, accept high apo
- **Exit:** `apoE > 1.05 × MOON_DISTANCE` (current autopilot logic) OR fuel exhausted
- **Anomaly heritage:** None on Apollo 11; MCC-2 was a 6.4 m/s nominal trim.

### `trans-lunar-coast` (3 days)
- **Envelope:** Coasting under combined Earth/Moon gravity. `predictedPerilune ∈ [60, 200] km` for nominal capture.
- **Setpoints:** throttle 0, attitude retrograde-ish (heat shield pre-position), warp idx 9 (100 000×).
- **Watchdog checks:**
  - `mcc-needed`: `predictedPerilune` outside `[40, 200] km` → moderate → schedule MCC trim (≤ 50 m/s)
    - Real Apollo 11 fired only MCC-2 (6.4 m/s); MCC-1, MCC-3, MCC-4 cancelled because trajectory was clean
  - `predicted-impact`: `predictedPerilune < MOON_RADIUS + 10 km` → abort → MCC dodge burn (radial), accept wider perilune
  - `predicted-escape`: `predictedPerilune > MOON_SOI` → moderate → MCC trim toward Moon
- **Exit:** `altM < MOON_SOI`

### `loi-approach`
- **Envelope:**
  - Inside Moon SOI, `altM` monotonic decreasing
  - `predictedPerilune ∈ [80, 200] km` (target 110 km)
  - autopilot's tiered warp (10 000×/1 000×/50×/5×/1×)
- **Setpoints:** throttle 0, attitude retrograde to Moon-relative velocity
- **Watchdog checks:**
  - `loi-perilune-too-high`: `predictedPerilune > 300 km` → moderate → fire LOI 30 s earlier than nominal trigger
  - `loi-perilune-too-low`: `predictedPerilune < 30 km` → abort → pre-LOI radial-out dodge, accept wider capture
- **Exit:** `altM < triggerAlt` OR past minimum (autopilot `pastClosestApproach`)

### `loi-burn`
- **Envelope:**
  - During burn: Moon-relative speed monotonic decreasing
  - At cutoff: `periM ∈ [60, 130] km`, `apoM ∈ [periM, 350] km`, both bound (`apoM < MOON_SOI`)
- **Setpoints:** throttle 1.0, attitude retrograde-Moon, warp 1× during burn (precision)
- **Watchdog checks:**
  - `loi-undershoot`: `periM > 150 km` after burn cutoff → moderate → schedule LOI-2 (CSM SPS, ≤ 50 m/s) at next perilune
  - `loi-overshoot`: `periM < 30 km` → major → fire emergency peri-raise burn (prograde at perilune)
- **Exit:** `tightCapture || wonkyCapture` (autopilot logic)
- **Anomaly heritage:** Apollo 11 LOI-1 was nominal 891 m/s; LOI-2 17 s circularisation also nominal.

### `lunar-orbit-coast`
- **Envelope:** stable lunar orbit, `apoM, periM` constant within 5 km, warp idx 8 (10 000×)
- **Setpoints:** throttle 0, attitude prograde-Moon
- **Watchdog checks:** none beyond standard (already captured)
- **Exit:** `coasted > 21 600 s` sim

### `lunar-descent` (PDI to touchdown)
- **Envelope:**
  - High gate: alt ≈ 15 km, vel ≈ 1 700 m/s horizontal
  - Pitchover: alt ≈ 7 km, ≈ 50 % range remaining
  - Low gate: alt ≈ 150 m, vel ≈ 20 m/s
  - Touchdown: vRadial ≈ -1 m/s, ground speed ≈ 0
- **Setpoints:**
  - altM > 8 km: throttle 1.0, attitude retrograde-Moon, warp 50×
  - altM ≤ 8 km: hover-descent throttle (P-controller), warp 1×
- **Watchdog checks:**
  - `descent-too-steep`: `vRadial < -100 m/s` AND `altM < 5 km` AND throttle = 1.0 → major → abort to ascent
  - `descent-too-shallow`: `vRadial > -1 m/s` AND `altM > 8 km` AND throttle = 1.0 → minor → drop warp, hold
  - `descent-fuel-low`: LM Descent fuel < 8% — *Apollo 11 actually triggered this at T+102:43:54* → note → callout "60 seconds to bingo" but DO NOT abort (Armstrong did not; took manual control)
  - `1201/1202-equivalent`: not modelled (no PGNCS computer). Could add as artistic narration.
- **Exit:** `c.landed && c.landedOn === 'Moon'`
- **Anomaly heritage:** Real Apollo 11 was nominal but with two computer alarms + late manual fly-down to avoid boulder field. Touchdown 25 s before bingo fuel.

### `lunar-stay`
- **Envelope:** `c.landed`, `altM ≈ 0`, throttle 0
- **Setpoints:** throttle 0, jettison Descent stage on entry, wait `autoLunarStaySec`
- **Watchdog checks:** none
- **Exit:** sim time elapsed > `autoLunarStaySec`

### `lunar-ascent`
- **Envelope:**
  - altM > 2 km: full-throttle, pitch program 90° → 0° as altM 5→60 km
  - At cutoff: `periM ≥ 20 km` (autopilot exit), aim for nominal 17 × 87 km
- **Setpoints:** throttle 1.0, attitude per pitch table, warp 50× above 2 km
- **Watchdog checks:**
  - `ascent-pitch-error`: actual pitch off table by > 10° → moderate → drop warp 1×
  - `ascent-fuel-low`: LM Ascent fuel < 5% AND `periM < 0` → abort → cannot reach orbit (no recovery in 2D)
- **Exit:** `c.periM > 20 km`

### `tei-burn`
- **Envelope:**
  - During burn: Moon-relative speed monotonic increasing
  - At cutoff: `altM > MOON_SOI * 0.6`
- **Setpoints:** throttle 1.0, attitude prograde-Moon, warp 10× during burn
- **Watchdog checks:**
  - `tei-undershoot`: post-burn `predictedPeriE > 200 km` (won't reenter) → moderate → continue burn or schedule MCC
  - `tei-overshoot`: `predictedPeriE < 0` (Earth impact too steep) → minor → cut burn early
- **Exit:** `altM > MOON_SOI * 0.6`

### `trans-earth-coast` (3 days)
- **Envelope:** coasting Earth-bound, `predictedReentryAngle ∈ [-7°, -5°]`
- **Setpoints:** throttle 0, attitude retrograde, warp idx 9
- **Watchdog checks:**
  - `mcc-needed`: `predictedReentryAngle` outside `[-7.5°, -4.5°]` → moderate → MCC trim (≤ 25 m/s)
- **Exit:** `altE < ATMOSPHERE_HEIGHT + 50 km`

### `reentry-prep`
- **Envelope:** capsule-only (lower stages jettisoned), heat shield retrograde
- **Setpoints:** stage down to capsule, throttle 0, retrograde, warp 50× until interface
- **Watchdog checks:**
  - `not-capsule-only`: at altE < ATMOSPHERE_HEIGHT + 5 km, still has stages → major → force separate
  - `attitude-wrong`: heat shield pointed prograde → major → flip 180°
- **Exit:** `altE < ATMOSPHERE_HEIGHT + 5 km`

### `reentry`
- **Envelope:**
  - Hot phase (altE 122 → 30 km): heat ≤ 2 200 °C (Apollo CM tile rating)
  - Drogues at altE ≈ 7 km, mains at altE ≈ 3 km
- **Setpoints:** retrograde, throttle 0, gradient warp (50× → 5× → 1×)
- **Watchdog checks:**
  - `heat-critical`: `heat > 0.95 × maxHeat` → major → re-orient
  - `chute-not-deploying`: altE < 5 km AND speed > 100 m/s AND no chute → moderate → force deploy
  - `entry-skipped`: altE > 100 km after first dip → abort → cannot recover in 2D, callout
- **Exit:** `c.landed || altE < 200`

### `orbit-handover`
- Mission complete. No further checks.

---

## Standard recovery responses (Apollo-specific)

**MCC trim burn** (used by watchdog for tli-underburn / lunar-approach corrections / tei-undershoot):
- Δv budget: 50 m/s nominal, 75 m/s contingency
- Direction: prograde (under), retrograde (over), radial-out (perilune dodge)
- Cut when: `|new predicted perilune - target| < 30 km` (lunar) or `predictedReentryAngle ∈ [-7°, -5°]` (Earth)
- Burn time at SPS thrust: < 60 s sim — autopilot can fly it directly

**LOI-2 circularisation** (after wonky LOI-1):
- Δv budget: 75 m/s
- Direction: retrograde at apoapsis OR prograde at periapsis depending on target
- Cut when: `|apoM - periM| < 30 km`

**Pre-LOI dodge burn** (perilune too low, lithobraking imminent):
- Δv budget: 100 m/s
- Direction: radial-out (away from Moon)
- Cut when: `predictedPerilune > 50 km`
- Accept wider capture; LOI burn afterwards as normal but expect higher periM.

---

## Test plan — watchdog regression for Saturn V

Each scenario runs full mission with anomaly injected at the relevant phase. Watchdog must recover; final state must hit all required milestones.

| Scenario | Inject | Expected recovery |
|---|---|---|
| Nominal | none | All milestones, fuel margin > 5% |
| TLI underburn | reduce S-IVB Δv by 4% (cut at apoE > 0.99 × MOON_DISTANCE) | MCC-2 trim during coast → perilune in [80, 130] km |
| TLI overburn | extend S-IVB burn to apoE > 1.20 × MOON_DISTANCE | Wide approach; LOI-1 fires earlier; LOI-2 circ |
| Perilune too low | nudge MCC to perilune = 20 km | Pre-LOI dodge → perilune raised to 50 km → wonky capture |
| Descent too steep | inject vRadial = -150 m/s at altM = 3 km | Watchdog aborts to ascent; mission ends LM-orbit-only (acceptable scenario) |
| Heat shield wrong | flip capsule prograde at reentry interface | Watchdog flips back; nominal entry |
| TEI undershoot | reduce SPS Δv by 5% | MCC trim → reentry angle restored |

---

## Open questions / TODOs

- Computer alarm narration (1201/1202) — currently no PGNCS model. Worth a flavour callout during descent at the right T+ time?
- Service Module RCS quad failure (Apollo 13 reference) — not modelled.
- Docking-axis alignment (real Apollo measured the docking probe alignment to 0.1°) — our 2D rendezvous snaps. Probably fine.
