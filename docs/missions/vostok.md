# Vostok-K / Vostok 1 — flight plan

> Yuri Gagarin's flight. The first human in space. One orbit, ballistic
> re-entry, ejection at 7 km, parachute landing in a Saratov field.

```
shipKey:      vostok
missionType:  leo-return
real flight:  Vostok 1 (8K72K rocket, Vostok 3KA capsule)
launch:       1961-04-12 06:07:00 UT, Tyuratam (Baikonur) Site 1/5
crew:         Yuri Alekseyevich Gagarin (first human in space, 27 y old)
duration:     1 h 48 m (full mission); 1 orbit
landing:      1961-04-12 07:55:00 UT, near Engels, Saratov Oblast, Russia
```

**Sources:**
- *Soviet Manned Space Programme* (Asif Siddiqi, *Challenge to Apollo*, NASA SP-2000-4408)
- *Vostok Mission Report* (Soviet TsKBEM, declassified 1991)
- Gagarin's flight transcript (TsUP archive, recorded April 1961)
- *Two Sides of the Moon* (David Scott + Alexei Leonov) — Soviet program insider account
- Roscosmos Vostok 1 50th-anniversary releases (2011)

---

## Vehicle stack

| Stage | Inert / fuel mass (kg) | Engines | Thrust (N) | Isp (s) | Notes |
|---|---|---|---|---|---|
| 4× Strap-on (Block B/V/G/D) | 14 000 / 128 000 each | 4× RD-107 | 4× 970 000 SL | 256 / 313 | Burn 118 s, parallel-staged with core |
| Core (Block A) | 6 000 / 95 000 | 1× RD-108 | 940 000 SL | 245 / 308 | Burn ~285 s after strap-on sep |
| Block E upper stage | 1 100 / 6 800 | 1× RD-0109 | 55 000 vac | 326 vac | Final orbital insertion |
| Vostok 3KA capsule | 2 460 dry / 180 fuel | TDU-1 retrograde | 15 000 vac | 250 / 290 | Δv ~155 m/s — JUST enough for deorbit |

**Total Δv:** launch ~9 100, deorbit ~155. Vostok had **no manoeuvring capability on orbit** — only the retrograde TDU-1 for deorbit. If TDU failed, orbital decay alone (10 days at 181 km perigee) was the contingency. Real Vostok 1 carried 10 days of life support for that reason.

---

## Real flight timeline

T+ from launch (06:07:00 UT, 12 Apr 1961).

| Phase | T+ (real) | Real event | Sim phase | Notes |
|---|---|---|---|---|
| Liftoff | T+0:00 | All 4 strap-ons + core fire (5 engines, 20 nozzles) | `ascent` | Korolev: "Pusk!" |
| **Korolev cross** | **T+1:58** | Strap-on sep, characteristic 4-petal pattern | `ascent` (auto-stage) | |
| LES jettison | T+2:36 | Launch escape system jettisoned | (not modelled) | |
| Fairing jettison | T+2:40 | Aerodynamic shroud falls away | (not modelled) | |
| **Core MECO** | **T+5:00** | Block A cuts | `ascent` (auto-stage) | |
| Core sep | T+5:01 | | `ascent` | |
| **Block E ignition** | **T+5:02** | Upper stage RD-0109 | `ascent` | |
| **SECO** | **T+11:16** | Orbit insertion, 181 × 327 km, 65.0° incl | `orbit-coast` (auto) | Slightly higher apo than planned |
| Block E sep | T+11:25 | Capsule on its own | `orbit-coast` | |
| **First view of Earth** | **T+~12:00** | Gagarin: "Я вижу Землю!" — "I see Earth!" | (cosmetic) | |
| **Crossing Pacific** | **T+~25:00** | Sunset over Pacific (orbit night) | (cosmetic) | |
| **Crossing Cape Horn** | **T+~50:00** | Atlantic crossing | (cosmetic) | |
| **Crossing Africa** | **T+~70:00** | Approaching deorbit point | (cosmetic) | |
| **Retrograde burn (TDU-1)** | **T+78:42** | 42 s, 155 m/s retrograde | `deorbit-burn` | Over Atlantic, near Africa |
| Service module sep | T+88:00 | Should sep cleanly — see anomaly | `reentry-prep` | |
| **Module sep anomaly** | **T+88 → T+98** | Service + descent modules tumbled together | (anomaly heritage) | Wires didn't sep, 10-min tumble |
| Wires burn through | T+98:00 | Aerodynamic + thermal break finally separates | (auto-recovery) | |
| **Atmospheric interface** | **T+102:00** | 122 km, 7.8 km/s, -1.5° flight-path | `reentry` | Ballistic |
| Plasma blackout | T+102 → T+108 | | `reentry` | |
| **Capsule ejection seat** | **T+108:00** | Gagarin ejected at 7 km | (not modelled — capsule lands intact in sim) | Real plan: sphere too rough to land in |
| **Cosmonaut parachute** | **T+108:30** | Gagarin's personal chute opens | (not modelled) | |
| **Capsule parachute** | **T+108:30** | Sphere parachute also deploys | `reentry` (auto) | Single 2.5 km deploy |
| **Sphere touchdown** | **T+109:00** | Hard impact, Saratov Oblast | (sim: capsule survives) | Real sphere intact |
| **Gagarin touchdown** | **T+109:30** | Engels area, Smelovka village | `orbit-handover` | Met by farmer + cow |

---

## Phases — expected envelopes + checks

### `ascent`
- **Critical detail:** Vostok ascent has the **classic R-7 parallel-staging "Korolev cross"** — 4 strap-ons jettison simultaneously at T+1:58, leaving a distinctive cross pattern in the contrail. Same vehicle family as Soyuz (the rocket evolved continuously from Vostok-K → Vostok-2 → Voskhod → Soyuz).
- Our 2D model: 3 stages stacked. Stage 1 = 4× strap-ons (modelled as one). Stage 2 = core. Stage 3 = Block E upper.
- **Envelope:**
  - At T+1:58 (strap-on sep): `altE ≈ 47 km`, `speed ≈ 1 550 m/s`
  - At T+5:00 (MECO): `altE ≈ 165 km`, `speed ≈ 5 600 m/s`
  - At T+11:16 (SECO): `altE ≈ 181 km`, `apoE ≈ 327 km`, `periE ≈ 181 km`
- **Watchdog checks:** standard ascent.

### `orbit-coast`
- **Envelope:** `apoE ≈ 327 km, periE ≈ 181 km`. Real flight overshot — planned was 180 × 230 km but went 181 × 327 km. Caused slight retrograde burn anxiety (TDU might not be enough) but worked out.
- Real flight: 1 orbit (89 min). Our model: `orbitCoastSimTime: 5400 s` (90 min).
- **Setpoints:** warp 1 000× (real flight was 89 min sim time so this compresses to ~5 s); throttle 0; attitude prograde.
- **Watchdog checks:**
  - `apo-too-high`: `apoE > 400 km` → minor → callout (TDU might struggle but should still bring perigee below 50 km)
  - `tdu-fuel-marginal`: capsule fuel < 80 % before deorbit window → moderate → schedule earlier deorbit attempt
- **Anomaly heritage:** Real Vostok 1 had `apoE = 327 km` instead of 230 km planned. Our model can capture this as `apo-overshoot` flavour.

### `deorbit-burn`
- **Critical detail:** Vostok TDU-1 has only 155 m/s of Δv. **Single attempt** — if it fails, you wait 10 days for orbital decay (which Vostok 1 carried life-support for).
- **Envelope:**
  - Retrograde burn, ~155 m/s Δv, 42 s
  - Post-cut: `periE ≈ 50 km`
- **Setpoints:** retrograde; throttle 1.0; warp 1×.
- **Watchdog checks:**
  - `tdu-underburn`: post-cut `periE > 100 km` → major → cannot retry, callout (would need 10-day wait IRL)
  - `tdu-overburn`: post-cut `periE < 30 km` → moderate → cut early; accept steeper entry
  - `tdu-fail`: throttle commanded 1.0, actual = 0 → abort → callout (10-day decay backup)

### `reentry-prep`
- **Critical anomaly:** Real Vostok 1 had a **module separation failure** — wires connecting the service module and descent module didn't release. The two tumbled together for ~10 minutes until the wires burned through during atmospheric heating. Gagarin reported violent tumbling with the capsule "rolling like a top" but it ultimately separated cleanly.
- **Watchdog check:** `module-sep-failure` (same as Soyuz) — stage-down didn't complete by atmospheric interface → major → force separate. Captured as ANOMALY HERITAGE — this is THE Vostok 1 incident.

### `reentry`
- Ballistic profile (no lift). Peak ~10 g (Vostok 1 reported ~8 g — within tolerance).
- **Envelope:** `flightPath ≈ -1.5°` at AOS, sphere shape with ablative shield.
- **Setpoints:** attitude prograde-relative; throttle 0.
- **Watchdog checks:** standard reentry. `module-sep-failure` from `reentry-prep` carries over.

### `orbit-handover` (= parachute landing)
- **Sim divergence:** Real plan = cosmonaut ejects at 7 km, sphere lands separately under its own chute. Both ejection AND sphere-landing actually happened — the sphere hit hard but intact. We model just the sphere parachute landing (Gagarin lands inside in sim).
- Real Vostok: single main chute deploys at 2.5 km. Our config: `parachuteDrag: 700`, `parachuteAlt: 7000` (we set the deploy altitude high to match the cosmonaut ejection point — so sphere chute opens at 7 km in sim, slightly different from real but acceptable).

---

## What makes this different

Vostok 1 is the **most fragile mission in the catalogue**. It has:
1. **No manoeuvring on orbit** — TDU is one-shot, retrograde-only. No mid-course corrections. No abort options once on orbit (decay is the contingency).
2. **The smallest Δv reserve** — 155 m/s total post-orbit. Saturn V has 1 800 m/s, Soyuz has ~390 m/s, even Mercury has 220 m/s for retro.
3. **The famous module-sep failure** — almost killed Gagarin. Watchdog must catch this and force-separate.
4. **The dual-landing trick** — cosmonaut + sphere both come down separately by parachute. Sim folds these into one for simplicity.

This mission is interesting for the watchdog because **most failures cannot be recovered**. The watchdog's job here is mostly to (1) catch the module-sep failure, (2) callout TDU underburns (which would mean a 10-day decay wait IRL), (3) flag any deviation that real Vostok controllers also could not have fixed.

---

## Standard recoveries (Vostok-specific)

| Failure | Recovery |
|---|---|
| Apo too high | Wait — TDU still works, just longer fall |
| TDU underburn | **CANNOT RETRY** — call 10-day decay backup |
| Module sep failure | Force separate (the Vostok 1 anomaly) |
| Reentry too steep | Cannot fix — sphere has fixed-aim ablative shield |

---

## Test plan — anomaly injections

| Scenario | Inject | Expected recovery |
|---|---|---|
| Nominal | none | One orbit, deorbit, parachute landing |
| Apo overshoot (Vostok 1 real) | force `apoE = 327 km` | Standard deorbit, slight wait |
| TDU underburn | -50 m/s | Major callout, 10-day decay backup |
| Module sep fail (Vostok 1 real) | block stage at reentry | Watchdog forces separate |
| Hard sphere touchdown | normal | Sphere lands, sim shows survival |

---

## Open questions

- Real Vostok 1 had the famous *Korolev cross* visible at strap-on sep. Could render as a particle effect in `ascent` — atmospheric flavour, no autopilot impact.
- Cosmonaut ejection at 7 km not modelled. Could add as a cosmetic: at 7 km altitude during reentry, render an ejecting cosmonaut sprite that parachutes alongside the sphere. Pure visual.
- The 10-day orbital-decay backup is a real Vostok feature. Could implement as `mission-extended` mode: if TDU fails, fast-forward 10 sim days and watch the orbit decay naturally (test of N-body atmospheric drag — `body.js` already does air drag below 200 km).
- Real-flight transcript has Gagarin saying "Поехали!" (Poyekhali — "Off we go!") at liftoff. Already in the briefing quote; could trigger as in-flight comms callout when entering `ascent`.
