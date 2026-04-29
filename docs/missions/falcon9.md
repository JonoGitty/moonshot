# Falcon 9 / Crew-1 — flight plan

> First operational crewed SpaceX flight. Falcon 9 Block 5 + Dragon 2
> ("Resilience") putting four astronauts into LEO for a 167-day ISS
> expedition. Marked the start of regular commercial crew rotation.

```
shipKey:      falcon9
missionType:  leo-return        (sim divergence — real Crew-1 docked with ISS)
real flight:  Falcon 9 Block 5 / Dragon 2 "Resilience" — Crew-1 (USCV-1)
launch:       2020-11-16 00:27:17 UT, KSC LC-39A
crew:         Michael Hopkins (CDR), Victor Glover (PLT, first Black ISS expedition crew),
              Shannon Walker (MS), Soichi Noguchi (MS, JAXA — third country first)
duration:     167 d 06 h 28 m (full mission); ~27 h 30 m to ISS dock
landing:      2021-05-02 06:56:33 UT, Gulf of Mexico off Panama City
```

**Sources:**
- *SpaceX Crew-1 Press Kit* (NASA + SpaceX, October 2020)
- *NASA Commercial Crew Program — Crew-1 mission overview*
- SpaceX webcast transcripts + post-flight commentary
- *Liftoff: Elon Musk and the Desperate Early Days That Launched SpaceX* (Eric Berger) — context for vehicle development
- NASA ISS Expedition 64/65 mission summary

---

## Vehicle stack

| Stage | Inert / fuel mass (kg) | Engines | Thrust (N) | Isp (s) | Notes |
|---|---|---|---|---|---|
| Stage 1 (Block 5) | 27 000 / 411 000 | 9× Merlin 1D | 7 607 000 SL / 8 227 000 vac | 282 SL / 311 vac | Burn ~155 s; recovered (not modelled — we expend it) |
| Stage 2 | 4 000 / 107 500 | 1× Merlin Vacuum (MVac) | 934 000 vac | 348 vac | Burn ~360 s to SECO |
| Dragon 2 (Resilience) | 9 525 dry / 1 890 fuel | 8× SuperDraco + 16× Draco | 568 000 vac (SuperDraco combined) | 235 / 300 vac | Δv ~400 m/s usable on orbit |

**Total Δv:** launch ~9 400, phasing ~50, deorbit ~95. Dragon's Δv reserve is dominated by the SuperDraco abort engines, which IRL only fire in abort or as deorbit prop — game uses combined thrust as one motor.

**Note on reuse:** Real Falcon 9 first stage performs a boostback + entry-burn + landing-burn sequence and recovers either downrange (drone ship) or back at LZ-1 (boostback). Our 2D model does not simulate recovery — Stage 1 is jettisoned and falls. Future enhancement.

---

## Real flight timeline

T+ from launch (00:27:17 UT, 16 Nov 2020).

| Phase | T+ (real) | Real event | Sim phase | Notes |
|---|---|---|---|---|
| Liftoff | T+0:00 | All 9 Merlins ignite, hold-down release | `ascent` | |
| Mach 1 | T+1:01 | ~10 km | `ascent` | |
| **Max-Q** | **T+1:12** | 13 km, 33 kPa | `ascent` | Throttle dip to 75 % |
| **MECO** | **T+2:32** | 9× Merlin shut down, 73 km, 2 300 m/s | `ascent` (auto-stage) | |
| **Stage sep** | **T+2:35** | Pneumatic pushers, S2 spool-up | `ascent` | |
| **MVac ignition** | **T+2:38** | Stage 2 light, 95 % thrust | `ascent` | |
| Stage 1 boostback | T+3:00 → T+3:50 | 3-engine boostback burn | (skipped in sim) | Real S1 returns to coast |
| Fairing not used | — | Crewed Dragon — no fairing | — | |
| **SECO-1** | **T+8:48** | Cutoff at 200 × 270 km, 51.6° incl | `orbit-coast` (auto) | |
| Dragon sep | T+12:01 | Pyrobolts + spring pushers, 7 m/s rel | `orbit-coast` | Stage 2 deorbits separately |
| S1 entry burn | T+6:30 | 3-engine reentry burn | (skipped) | |
| S1 landing | T+8:55 | OCISLY drone ship, Atlantic | (skipped) | |
| Phasing burn 1 | T+0:25:00 | Dragon SuperDraco 30 s, ~12 m/s | (watchdog mini) | Real Crew-1 used standard 27.5 h profile |
| ... 27 h phasing ... | T+0:25 → T+27:30 | Multiple Draco trims | `orbit-coast` (warp) | |
| **ISS rendezvous** | **T+27:00:00** | Within 10 km of ISS | (sim diverges — orbit-coast continues) | Real flight: Kbro autopilot + manual override available |
| **Soft dock** | **T+27:30:00** | Harmony forward port (PMA-2) | (sim diverges — no ISS dock for falcon9 ship) | |
| Hard dock + hatch open | T+~30:00:00 | Crew transfer | (not modelled) | |
| ... 167 d on ISS ... | T+167 d | Expedition 64/65 work | `orbit-coast` (warp) | Compressed in sim |
| Hatch close + undock | T+167 d | Dragon depart Harmony | (not modelled) | |
| **Deorbit burn** | **T+167d 5h 30m** | 16-min Draco burn, ~95 m/s | `deorbit-burn` | Multiple short burns |
| Trunk separation | T+167d 5h 50m | Trunk burns up in atmo | `reentry-prep` (auto-stage) | |
| **Atmospheric interface** | **T+167d 6h 03m** | 122 km, 7.6 km/s, -1.5° flight-path | `reentry` | Standard capsule entry, NOT skip |
| Plasma blackout | T+167d 6h 04m → 6h 09m | | `reentry` | |
| **Drogue parachutes** | **T+167d 6h 23m** | 5.5 km, 2× drogues | `reentry` (auto) | |
| **Main parachutes** | **T+167d 6h 24m** | 1.8 km, 4× 35 m mains | `reentry` (auto) | |
| **Splashdown** | **T+167d 6h 28m 33s** | Gulf of Mexico, ~9 m/s | `orbit-handover` | First night Dragon splashdown since Apollo 8 |

---

## Phases — expected envelopes + checks

### `ascent`
- **Critical detail:** Falcon 9 has a **clean serial 2-stage** profile (no parallel staging like Shuttle/SLS/Soyuz). One MECO + sep + S2 ignition, then a long S2 burn to SECO.
- **Envelope:**
  - At T+1:12 (Max-Q): `altE ≈ 13 km`, `speed ≈ 470 m/s`
  - At T+2:32 (MECO): `altE ≈ 73 km`, `speed ≈ 2 300 m/s`
  - At T+8:48 (SECO): `altE ≈ 200 km`, `apoE ≈ 270 km`, `periE ≈ 200 km`
- **Watchdog checks:** standard ascent.

### `orbit-coast`
- **Envelope:** target `apoE ≈ 420 km, periE ≈ 400 km` (we use 400/420 as ISS-equivalent altitude).
- Real Crew-1: 27.5 h to ISS dock + 167 d at ISS. Our model: `orbitCoastSimTime: 5400 s` then deorbit. Massively compressed.
- **Setpoints:** warp 1 000× during coast; throttle 0; attitude prograde.
- **Watchdog checks:**
  - `orbit-decay`: same as Shuttle
  - `dragon-fuel-marginal`: capsule fuel < 25 % and deorbit not yet scheduled → moderate → bring deorbit forward

### `deorbit-burn`
- **Envelope:**
  - Retrograde burn, ~95 m/s Δv (Dragon does this in multiple short Draco burns IRL — we model as one)
  - Post-cut: `periE ≈ 50–60 km`
- **Watchdog checks:** standard deorbit (undershoot/overshoot, same thresholds as Soyuz).

### `reentry-prep`
- Trunk separation at ~80 km. Trunk has solar arrays and radiators — burns up in atmosphere. Our model auto-stages capsule.

### `reentry`
- **Critical:** Dragon 2 uses **PICA-X heat shield**, designed for lunar-return velocities (11 km/s) but operating well within margin at LEO entry (7.6 km/s). Standard capsule profile, NOT skip-entry.
- **Envelope:**
  - At AOS (122 km): `speed ≈ 7 600 m/s`, `flightPath ∈ [-2°, -1°]` (shallower than Apollo because of PICA-X margin)
  - Peak g: ~3.5 g (real Crew-1: 3.3 g)
  - Drogue deploy: 5.5 km
  - Main deploy: 1.8 km
- **Setpoints:** prograde-relative-to-velocity; throttle 0; warp 1× through plasma.
- **Watchdog checks:** standard `reentry-too-steep` / `reentry-too-shallow`. Heat-critical generous margin (PICA-X handles 4× the heat load of LEO entry).

### `orbit-handover` (= splashdown)
- Real Dragon: ~9 m/s splashdown under 4× 35 m mains. Our `parachuteDrag: 3200`, `parachuteAlt: 3000`. Should land at ~5 m/s.

---

## What makes this different

Falcon 9 / Crew-1 is the **most modern crewed system in the catalogue** — fly-by-wire throughout, autonomous docking by default, no analog instrumentation. From the autopilot's perspective the mission is mostly the same as Soyuz (LEO insertion → coast → deorbit → splashdown), but with:
1. **Clean serial staging** instead of parallel — easier to model, less to go wrong.
2. **More generous Δv reserves** than Shuttle (Dragon ~400 m/s vs Shuttle's ~330 m/s OMS).
3. **No skip-entry** unlike Orion — Dragon does a clean ballistic-lifting entry from LEO.
4. **Recovery cadence** — real Falcon 9 boostback isn't modelled, but worth noting as a future enhancement (would make the "first stage falling away forever" cosmetic).

---

## Sim divergence

Real Crew-1 docked with the ISS for 167 days. Our `falcon9` ship is configured as `mission: 'leo-return'`, so it does not actually rendezvous with the ISS — it just orbits and returns. To match the real mission we would either:
1. Change `mission` to `'iss-dock'` (like Soyuz), accepting the 5-min minimum at ISS before deorbit.
2. Keep as-is and document that the Crew-1 briefing is flavour text. (Current state.)

Decision: keep `'leo-return'` for now — the autopilot path is shorter and the mission still reads as "Falcon 9 launch + crewed return to splashdown", which is most of what most users will want to see. Could add a `falcon9-iss` variant later that matches the real Crew-1 trajectory exactly.

---

## Standard recoveries

| Failure | Recovery |
|---|---|
| MECO underburn | S2 longer burn, accept lower apo |
| SECO underburn | Dragon SuperDraco trims (eats reserve) |
| Trunk sep failed | Watchdog forces stage-down |
| Reentry too steep | Lift-vector up, drop warp |
| Parachute mortar fail | Cannot fix in 2D — fatal |

---

## Test plan — anomaly injections

| Scenario | Inject | Expected recovery |
|---|---|---|
| Nominal | none | Reach orbit, deorbit, splashdown |
| MECO early | -200 m/s at MECO | S2 longer burn, slightly low apo |
| SECO underburn | -50 m/s at SECO | Dragon trim to nominal orbit |
| Deorbit overburn | +30 m/s | Steep entry tolerated (PICA-X margin) |
| Trunk sep fail | block stage at reentry-prep | Watchdog forces separate |

---

## Open questions

- Should we add a Falcon 9 first-stage recovery cosmetic? Real flight has the boostback + landing burn — not autopilot-relevant but visually distinctive.
- Crew-1 was the first Dragon to spend 6 months on orbit before return. Trunk-mounted radiators degraded slightly — captured as `trunk-thermal-marginal` watchdog callout? Out of scope.
- Real Falcon 9 has multiple abort modes (pad abort with SuperDracos, in-flight abort). Not modelled. Same out-of-scope note as Shuttle abort modes (deferred to v0.8.0).
