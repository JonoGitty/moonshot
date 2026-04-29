# Changelog

All notable changes to MOONSHOT are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

PATCH = bug fix or numbers tweak.
MINOR = new feature (new ship, new HUD widget, new mission type).
MAJOR = breaking change.

## [Unreleased]

Tracked in `docs/PLAN.md`. Anomaly-injection regression suite (per the
test plans in `docs/missions/*.md`) is the next acceptance gate.

## [0.7.0] — 2026-04-29

Houston Watchdog — real-time deviation detection + scripted recoveries
running alongside the autopilot. Deeply researched per-mission flight
plans (one `docs/missions/<ship>.md` per real flight) drive the
watchdog's check rules. The combination is what unlocks high-warp
autopilot flights of complex profiles (Apollo lunar landing, Artemis
free-return, Tim Peake's 6-hour rendezvous) under off-nominal
conditions.

### Added
- `js/watchdog.js` — `HoustonWatchdog` class running per physics
  substep (alongside `houston.physicsTick`). Builds a flat state
  snapshot each tick, runs standard + per-mission checks, dispatches
  actions: `callout`, `drop-warp`, `mcc-burn` (drives a corrective
  burn through `c.targetAngle` / `c.throttle` until `cutWhen` returns
  true or `dvBudget` exhausted), `replan` (changes `houston.autoPhase`),
  `abort-to` (narrative stub at v0.7.0; full mission-type swap
  deferred to v0.8.0). Predicted-state cache via `trajectory.js`
  forward-sim, refreshed at 1 Hz sim-time.
- `js/missions.js` — 9 per-ship `MissionPlan` definitions registered
  on `window.MISSION_PLANS`. Each plan declares the real flight
  metadata (date, crew, vehicle, sources) plus a flat list of
  `Check` objects matching the schema in `docs/WATCHDOG.md`.
- 8 standard checks applied to every ship: `attitude-diverged`,
  `throttle-stuck`, `heat-critical`, `heat-warning`, `fuel-underrun`,
  `earth-impact-predicted`, `lunar-impact-predicted`,
  `reentry-angle-too-steep`.
- Per-mission checks (mission-specific flight envelope): TLI under/
  overburn (Saturn V / SLS), LOI undershoot/overshoot (Saturn V /
  SLS), TLI free-return aim + accidentally-captured (Artemis II),
  ISS approach-too-fast (Soyuz), module-sep failure (Vostok / Soyuz),
  TDU underburn cannot-retry (Vostok), runway-landing energy mgmt
  (Shuttle), apo-shortfall (Sputnik), apex too-low/too-high (Mercury).
- `docs/WATCHDOG.md` — architecture spec: schema, severity levels,
  standard checks table, per-phase deviation patterns, runtime
  sketch, predicted future state, implementation order.
- `docs/missions/<ship>.md` — 9 per-mission flight plan documents.
  Real flight timeline mapped to sim phases, expected envelopes per
  phase, watchdog checks with severity/action, anomaly heritage from
  real mission history (Apollo 1201/1202 alarms, Vostok 1 module-sep,
  TMA-1/TMA-11 ballistic re-entries, etc.), test plans with
  anomaly-injection scenarios.
- `test-watchdog.mjs` — Playwright regression that loads every ship,
  starts autopilot, and verifies (a) the watchdog instance is wired,
  (b) a `MissionPlan` was loaded, (c) standard + mission checks are
  running, (d) no `abort`-severity triggers fire under nominal flight.
  Runs in ~30 sec wall-clock.
- `npm run test:watchdog` script entry.

### Changed
- `js/game.js` — instantiate `HoustonWatchdog` alongside
  `HoustonAssist`; call `watchdog.tick(stepDt)` inside the physics
  substep loop right after `houston.physicsTick`. Watchdog runs in
  every CapCom mode (off / assist / auto), so callouts surface even
  when the user is hand-flying.
- `index.html` — load `js/missions.js` + `js/watchdog.js` script
  tags in the right dependency order (after `houston.js`, before
  `game.js`).

## [0.6.1] — 2026-04-29
Real Artemis II profile (free-return flyby), more aggressive cruise warps
that the substep-tick autopilot can keep up with.

### Fixed
- **Artemis II now flies the real free-return flyby** (was previously
  faked as a `moon-orbit` mission with a small LOI burn into a wide
  9 500 × 7 500 km elliptical orbit, "so players could see the lunar
  loop"). Real Artemis II does NOT do an LOI burn — the crew passes
  ~10 000 km beyond the lunar far side on the TLI impulse alone and
  slingshots back on the same trajectory. Routing through the
  `lunar-flyby` autopilot path (already implemented for v0.5.0) now
  actually applies. Test expectation updated: required milestones are
  `leftPad → reachedOrbit → approachedMoon → landedOnEarth` (no
  `enteredMoonOrbit`).

### Changed
- **More 10 000× warp** in vacuum cruise phases (each vacuum substep
  is still a 2 s sim chunk, so even 10 000× warp is rock-solid):
  - LOI-approach very-far cruise (altM > 3 × triggerAlt): 1 000× → **10 000×**
  - Lunar-orbit-coast: 1 000× → **10 000×**
  - Lunar-flyby far cruise (altM > 20 Mm): 100× → **1 000×**
  - ISS rendezvous phasing: 500× → **1 000×**
  - ISS docked stay: 500× → **1 000×**

## [0.6.0] — 2026-04-29
Autopilot decoupled from render frame rate — phase decisions now run inside
the physics substep loop, so cruise warps can run hot without burns
overshooting on cutoff.

### Changed
- **Autopilot ticks per physics substep, not per render frame.** Before:
  `houston.update(realDt)` fired once per `requestAnimationFrame` (~16 ms
  wall-clock). At 1000× warp that was 16 sim-seconds between phase
  decisions, so burn cutoff conditions could be missed by 16 s of
  unwanted thrust = 100–200 m/s of unwanted Δv. After: split into
  `physicsTick(stepDt)` inside `game.js:updatePhysics` substep loop +
  `update(realDt)` for narration / callouts at frame rate. Phase
  transitions now happen within ≤2 s of sim time even at 100 000× warp.
- **Default cruise warps bumped** now that the autopilot reacts at
  sim-time resolution:
  - LOI-approach far cruise: 100× → **1000×** (saves ~12 min on Apollo)
  - LOI-approach closing: 10× → 50×
  - Lunar-orbit-coast: 100× → **1000×**
  - Lunar-descent high altitude (> 8 km): 5× → 50×
  - Lunar-ascent above 2 km: 5× → 50×
  - TEI burn: 5× → 10×
  - ISS rendezvous phasing: 50× → 500×
  - ISS stay (docked): 50× → 500×
  Burn-precision tiers (loi-burn, deorbit-burn, terminal descent / ascent,
  atmospheric reentry) deliberately stay at 1× — those phases are
  attitude- or drag-sensitive and the per-substep autopilot already
  handles cutoff precisely without needing high warp.

## [0.5.2] — 2026-04-28
Briefing trajectory previews for stock missions, manual-flight HUD upgrades,
expanded route-adherence narration, autopilot warp-tuning for landing/ascent,
and a CSS scope fix so the briefing canvas doesn't blow up.

### Fixed
- **Briefing canvas was rendering full-screen** because `style.css` had a
  global `canvas { position: fixed; inset: 0 }` rule (intended for the
  `#game` canvas). Scoped the rule to `#game` only and added a proper
  `#briefing-canvas` block inside the briefing modal. Validated with the
  new `test-briefing-sizes.mjs` (modal vs. viewport check across all 10
  ships).

### Added
- **Stock missions get a flight-plan trajectory preview** in the briefing
  modal. Vostok / Falcon 9 / Shuttle / Soyuz / Saturn V / SLS / Artemis II /
  X-1 sandbox each get an inline planner-rendered map with parking orbit,
  transfer ellipse, lunar orbit, and burn-point markers. Mercury (suborbital)
  and Sputnik (orbit-only deploy) deliberately have no preview — there's no
  meaningful trajectory to draw.
- **Stock missions now have `plannedBurns`** attached at mission start
  (`js/game.js:attachStockPlan`). This unlocks Houston's per-burn
  route-adherence narration for every ship that flies a real profile,
  not just the custom planner.
- **Per-burn route-adherence narration** in `houston.js:checkPlanAdherence`:
  TLI prep + on-profile, LOI prep + capture confirm, powered-descent commit,
  ascent-into-orbit confirm, TEI clear, ISS dock confirm. Old narration
  (orbit on profile / apo trending low) is preserved.
- **Δv-remaining HUD field** (`Δv STAGE`) showing Tsiolkovsky-derived Δv
  for the active engine. Updates every frame; surfaces the same number
  the planner uses for verdict, so manual pilots can budget burns.
- `test-briefing-sizes.mjs` — Playwright smoke test that opens each ship's
  briefing and reports the canvas size + modal dimensions.

### Changed
- **Lunar autopilot warp-tuning** for landing + ascent phases. Descent at
  altM > 8 km now runs at 5× warp (was 1×) — predictable retrograde burn,
  drops ~5 min wall-clock from a Saturn V mission. Lunar-ascent above
  altM=2 km also bumped to 5×. Together with the LOI-approach 100× cruise
  tier in v0.5.1, this is intended to bring full Apollo land+ascend+splash
  inside the bumped 5400s wall-clock CI budget (validation pending).
- **Test budgets** for lunar missions raised: Saturn V 3000s → 5400s,
  SLS / Artemis II 3000s → 4200s. The full real Apollo timeline doesn't
  compress below ~80 min wall-clock even under aggressive warp because
  descent / ascent / re-entry must run at near-realtime for stability.

## [0.5.1] — 2026-04-28
Lunar capture autopilot bug fixed, warp ladder works for wide orbits, repo
now has actual versioning discipline.

### Known regression
The full autopilot regression run on `83dfd79` (the baseline before this
release) showed Saturn V, SLS, and Artemis II FAIL — all three got stuck
in `loi-approach` because their actual perilune was above LOI triggerAlt,
so the burn never fired and they fell back to Earth without capturing.
The fixes below restore the LOI burn (verified: Saturn V went from
"stuck at altM = 39 770 km in loi-approach" to "active loi-burn at
altM = 9 907 km" with the fix applied). Full Apollo land + ascent +
return inside the 50-minute wall-clock CI budget remains tight; tracked
in `docs/PLAN.md` Workstream R4 (separate "extended" regression run with
a longer budget).

### Fixed
- **Lunar capture autopilot bug.** Three contributing changes in
  `js/houston.js`:
  1. **TLI cut threshold** raised from `apoE > 0.95 × MOON_DISTANCE` to
     `apoE > 1.05 × MOON_DISTANCE`. The old 0.95× left the transfer ellipse
     5 % short of Moon's orbit, so lunar perturbation produced a 30 000 –
     50 000 km grazing pass — too far above LOI triggerAlt. 1.05× ensures
     the craft reaches Moon's orbital distance with residual outward
     velocity, producing a tight encounter. Costs ~150 m/s extra TLI Δv,
     well within S-IVB / ICPS margin.
  2. **LOI "missed window" fallback.** `loi-approach` now tracks
     `minLoiAltM`. If altM rises ≥2 000 km past that minimum, fire LOI
     immediately — better a wonky capture than no capture.
  3. **LOI capture condition relaxed.** Previously required
     `periM > 0.4 × targetPeri` AND `apoM < 4 × targetApo`. Now also
     accepts any bound captured orbit (`periM > 30 km` AND `apoM < 0.9 ×
     MOON_SOI`). Wonky elliptical captures still count as captured —
     the descent or TEI phase tightens the orbit further.
- **Adaptive lunar-coast warp ladder** in Houston autopilot. The previous
  ladder tiered on `triggerAlt × {5, 1.5}`, which never reached 50× warp
  for ships with a wide free-return loop (Artemis II, `lunarApo` ≈ 9 500 km
  → `triggerAlt` ≈ 38 000 km, so the entire SOI lay below the 5× threshold).
  Re-tiered as `triggerAlt × {1.5, 1.1, 1.02}` so both Apollo (small target,
  lots of room above for 50×) and Artemis II (big target, narrow approach
  corridor) get a useful 100× → 10× → 5× → 1× warp profile (cruise tier
  raised to 100× to give Saturn V room to finish landing inside CI budget).
- **Playwright autofly regression** now opens a fresh browser context per
  mission instead of reusing one page across all 9 ships. The shared-page
  V8 heap was degrading badly enough that the later ships (Soyuz, SLS,
  Saturn V) were running at sub-realtime sim ratios and timing out.

### Added
- `CHANGELOG.md` (Keep a Changelog format) and a `0.x.0` retroactive
  history of every prior commit.
- `scripts/release.sh` — gates on a green regression, bumps `package.json`,
  prompts for the CHANGELOG entry, creates an annotated tag.
- `scripts/clean-dev.sh` — dry-run / `--apply` cleanup of gitignored dev
  artefacts (loose test PNGs, server logs).
- `LICENSE` — MIT.
- README badges for version + license + roadmap.
- `docs/PLAN.md` — full outstanding-work + reality-audit plan with
  prioritised waves.
- `npm test`, `npm run test:smoke`, `npm run test:moonpos`,
  `npm run test:planner`, `npm run release`, `npm start` script entries.

### Changed
- `package.json` reset to a meaningful version (was `1.0.0`, never tagged);
  `description`, `author`, `license`, `homepage`, `repository`, `keywords`
  populated.

## [0.5.0] — 2026-04-27
Shuttle now actually lands.

### Changed
- Shuttle entry numbers retuned to allow real STS-style shallow glide:
  drag area 60 → 250 m², drag coeff 1.2 → 1.5, lift coeff 1.2 → 0.6,
  deorbit periTarget −200 → +50 km. Standalone autofly reaches touchdown
  at sim t = 11 136 s.
- Fullscreen toggle moved from `f` → `Shift+F` so it stops shadowing
  the existing SAS:FREE binding on `f`.

## [0.4.0] — 2026-04-26
Lunar-orbit insertion no longer crawls through real-time.

### Changed
- LOI approach switches to aggressive time-warp (50× → 10× → 1× ladder)
  so Apollo and Artemis don't sit at 1× for the entire SOI crossing.
- Shuttle landing tolerance widened so non-perfect glideslopes still
  count as a successful landing.

## [0.3.0] — 2026-04-26
Parachute physics now match real values.

### Changed
- Capsule parachute drag area + drag coefficient set per-vehicle from
  manufacturer figures (Apollo CM, Soyuz Descent Module, Crew Dragon).
- Time-warp now permitted during parachute descent (was clamped to 1×,
  which made splashdown drag for minutes of real-time).

## [0.2.0] — 2026-04-25
The mission planner shows you the route, and Houston tells you when you've
drifted off it.

### Added
- Inline trajectory-preview canvas on the planner: draws Earth, parking
  orbit, transfer ellipse, Moon and lunar orbit ring with burn-point
  markers.
- Hard validation for physically impossible plans (sub-30 km lunar orbit,
  sub-160 km LEO) — the verdict goes red and the launch button stays
  disabled.
- On-plan tracking: when the craft is flying a planned mission, Houston
  narrates "Orbit on profile" or "Apo trending low — extend the burn".
- Time-of-day lighting: Sun direction in the renderer is derived from
  each mission's real launch date via `sunEclipticLongitude(JD)`.

### Changed
- Shuttle deorbit drops periapsis to −200 km so the lifting body actually
  commits to landing instead of skip-entering forever (revisited in
  v0.5.0 — see above).

## [0.1.0] — 2026-04-25
Initial commit.

### Added
- 11 spacecraft (Mercury, Sputnik, Vostok, Falcon 9, Shuttle STS-1,
  Soyuz TMA-19M, Saturn V/Apollo 11, SLS Artemis I, SLS Artemis II,
  X-1 Sandbox, custom mission planner).
- Newtonian gravity from Earth + Moon, Tsiolkovsky-driven Δv accounting,
  exponential-density atmospheric drag, Sutton-Graves heating with
  direction-aware shields, lifting-body shuttle physics.
- Houston autopilot with 28+ phase state machine; per-mission CapCom
  dialog (Jack King, Charlie Blackwell-Thompson, Korolev, STS launch).
- Pre-launch briefings with real launch dates, crews, and burn schedules.
- Apollo CSM/LM undock + ghost-CSM lunar-orbit object.
- Soyuz fast-rendezvous with snap-to-ISS (3-h sim time).
- Re-entry, parachute deploy, Shuttle runway landing.

[Unreleased]: https://github.com/JonoGitty/moonshot/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/JonoGitty/moonshot/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/JonoGitty/moonshot/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/JonoGitty/moonshot/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/JonoGitty/moonshot/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/JonoGitty/moonshot/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/JonoGitty/moonshot/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/JonoGitty/moonshot/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/JonoGitty/moonshot/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/JonoGitty/moonshot/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/JonoGitty/moonshot/releases/tag/v0.1.0
