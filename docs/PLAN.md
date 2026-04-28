# MOONSHOT — Outstanding Work Plan

> **North star:** A realistic 2D space-flight simulator where every supported
> mission flies the **real** route with **real** physics and **real** numbers,
> and is fully playable in **autopilot AND manual** mode.
>
> Everything below is graded against that bar. Polish that does not move the
> sim closer to "real route, real numbers, both modes" is parked.

Status as of 2026-04-28 (week 18, post-shuttle-landing commit `83dfd79`):

```
Local main:  83dfd79  ahead of origin/main by 1
Working tree (uncommitted):
  js/houston.js          — adaptive lunar-coast warp ladder (Artemis II fix)
  test-autofly-all.mjs   — fresh Playwright context per mission
```

---

## 0 · Versioning & release discipline

Currently no git tags exist; `package.json` says `1.0.0` arbitrarily; there is
no CHANGELOG. We can't tell from git history alone what's a milestone vs an
in-progress commit.

**v0 deliverables (Workstream A):**

1. Adopt **semver** (`MAJOR.MINOR.PATCH`).
   - PATCH = bug fix or numbers tweak
   - MINOR = new feature (new ship, new HUD widget, new mission type)
   - MAJOR = breaking change to save format / module layout
2. Reset `package.json` to a version that reflects reality. Current state =
   "v0 prototype, 11 ships, autopilot for all, planner shipped" → call it
   **`0.5.0`** (clearly pre-1.0, clearly substantial).
3. Add `CHANGELOG.md` in [Keep a Changelog](https://keepachangelog.com/) format.
   Backfill the existing 5 commits as `0.1.0` → `0.5.0` so future readers
   have a baseline.
4. Annotated git tags `v0.1.0` … `v0.5.0` matching CHANGELOG entries.
5. Tiny `scripts/release.sh` that:
   - runs `node test-autofly-all.mjs` (gate)
   - bumps `package.json` version
   - prepends a CHANGELOG entry from staged commits
   - creates an annotated tag `vX.Y.Z`
   - prints `git push origin main --follow-tags` for the human to run
6. README badge showing current version + link to CHANGELOG.

**Why this matters:** without a versioning floor, "what changed since the
last working build" is unanswerable, so regressions slip in silently.

---

## 1 · Reality audit (Workstream R)

Goal: every number on screen comes from a real flight manual or a real
physical equation, and every mission timeline matches the historical record
to within sane tolerances.

### R1. Numbers audit
- Walk every `SPACECRAFT[…]` entry in `js/constants.js`. For each stage
  produce a one-line citation: source + figure (e.g. *"Saturn V Flight Manual
  AS-506, S-IC: 33 410 kN sea-level thrust, Isp 263 s sea / 304 s vac"*).
- File the citations in `docs/spacecraft-sources.md` (1 page per ship).
- Flag anything we made up (`?`-tagged in current comments). Replace with
  cited values; if no real value exists, document the synthetic basis.
- Cross-check Δv per stage matches Tsiolkovsky-derived figures the planner
  computes — discrepancy >2 % needs explanation or fix.

### R2. Mission timeline audit
For each ship, write a `docs/timelines/<ship>.md` listing real flight events
(e.g. Apollo 11: T+0:00 ignition, T+0:02 SRB sep N/A, T+2:42 S-IC cutoff,
T+3:18 S-IC sep, T+9:11 S-II cutoff, T+11:39 SECO-1, T+2h44m TLI ignition,
T+76h LOI, etc.) and what our autopilot does at the same `missionTime`.

Discrepancies > 30 s on staging events or > 2 % on Δv are bugs to fix.

### R2b. Stray milestone leak (known bug)
Observed during the v0.5.1 regression run (2026-04-28): the
`satelliteDeployed` milestone fires during *deorbit* on Vostok, Falcon 9,
and Shuttle (e.g. Falcon 9 hit it at sim t=5962s alongside
`phase→reentry-prep`). These vehicles do not deploy a satellite — that
milestone is Sputnik-specific. The autopilot or milestone-detection code
is mis-firing it on any reentry that follows a satellite-class ship.

Fix: either guard the milestone behind `mission === 'orbit-only'`, or
require the actual deploy SPACE keypress / phase transition. PASS criteria
don't depend on it for the affected ships, so the regression isn't
masking failures, but the milestone screen in the end-of-mission summary
will mis-credit pilots.

### R3. Manual-mode parity
Verify that every fact the autopilot uses to fly is **visible to the manual
pilot**. Currently the autopilot has private knowledge of:
- target apo / peri (from `blueprint.profile.targetApo`)
- planned burn schedule (from `blueprint.plannedBurns`)
- LOI trigger altitude (`autoLunarApo * 4`)
- Soyuz fast-rendezvous timing
- Apollo CSM/LM undock state

For each, decide: (a) expose to HUD, (b) expose via Houston ASSIST narration,
or (c) deliberately omit (unfair advantage). **No autopilot-only data leaks.**

### R4. Both-mode regression coverage
Today `test-autofly-all.mjs` only exercises autopilot. Manual flight has
zero automated coverage. Add `test-manual-keys.mjs`: drive the keyboard
through the canonical Mercury and LEO Falcon 9 flights with scripted key
sequences, confirm the same milestones fire. Doesn't have to be every ship,
but must cover at least: pad → orbit, orbit → reentry, parachute deploy,
shuttle deorbit + landing.

### R5. Extended lunar regression
Saturn V / SLS / Artemis II all completed the full Apollo-class profile
(land + ascend + splash) historically; v0.5.1 fixed the LOI capture bug
that was blocking it but the **wall-clock budget** (3 000 s = 50 min) is
not enough for the full landing + return on Saturn V. Options:
- **R5a.** Bump warp during loi-approach (current cap is 50×; could go
  to 100× safely while in cruise) and during lunar-orbit-coast (current
  100×; could go higher in vacuum-only segments).
- **R5b.** Add `test-autofly-extended.mjs` with 2-hour-per-ship budget,
  run nightly rather than per-commit. The fast `test-autofly-all.mjs`
  remains the per-commit gate but with relaxed lunar expectations
  (require `enteredMoonOrbit` instead of `landedOnEarth`).
- **R5c.** Headless playwright is slow per-eval; could expose a
  `window.__autopilotTick(dt)` shortcut that advances the sim more cheaply
  for tests, bypassing rAF.

---

## 2 · Outstanding feature work (Workstream F)

### F1. Trajectory preview — finish the loop
**State today:** planner screen shows a static ellipse + Moon ring with burn
markers (`e7759da`). Working but only visible *before* launch.

**Gaps:**
- F1a. **In-flight overlay.** When `craft.blueprint.plannedBurns` exists, the
  map view (`M`) should overlay the planned trajectory in a faint colour
  alongside the live trajectory predictor (`js/trajectory.js`). Pilot can
  see "I'm here, plan said I'd be there".
- F1b. **Stock-mission plans.** Apollo, Artemis, Soyuz, Shuttle currently have
  no `plannedBurns` attached — only the custom-planner missions do. Generate
  the plan at mission start by calling `planMission(missionKey, params,
  shipKey)` in `game.js:startMission()` and stash on the craft. So the
  preview + adherence narration applies to stock missions too.
- F1c. **Phase-tagged ground track.** Instead of just "transfer ellipse", use
  the burn schedule to draw colour-coded segments: ascent (green), parking
  orbit (blue), TLI coast (purple), lunar capture (yellow), descent (red), etc.
  Pilot can see "the next coloured segment is what I should be doing next".

### F2. Route-adherence narration — broaden coverage
**State today:** `houston.js:checkPlanAdherence()` fires `plan-on-track`
when LEO insertion ≈ target, and `plan-apo-low` if apo is < 50 % of target
during ascent. That's it.

**Gaps:**
- F2a. Cover **every burn** in the schedule, not just orbit insertion.
  - Pre-burn: "Standby for TLI in T-minus 30 seconds. Target Δv 3.12 km/s
    prograde."
  - Mid-burn: "TLI 60 % complete, on profile."
  - Post-burn: "TLI cutoff, apo 384 Mm. Translunar coast confirmed."
  - Off-profile: "Apo trending high — chop throttle." / "Burn was late —
    apo 280 Mm vs 384 Mm target. Stand by for trim burn."
- F2b. **Ascent ground-track adherence.** Compare current pitch/heading to
  the expected gravity-turn curve at this altitude. If the manual pilot
  is too vertical or too aggressive, Houston nudges: "Pitch program 5°
  steep" / "5° shallow".
- F2c. **Cross-range warning.** If the craft drifts plane (in 2D this is
  reduced to launch-azimuth equivalent — but Soyuz/Shuttle do plane-aware
  rendezvous). Out of scope for 2D until we make plane changes a thing.

### F3. Manual flight HUD additions
- F3a. **Δv remaining** for the active stage (Tsiolkovsky from current
  `currentFuel`, displayed alongside throttle). This already exists for
  the planner — surface it on the HUD.
- F3b. **Heading / target heading** indicator. Current angle vs SAS target.
  Eight-segment compass or just a degrees-off-target number.
- F3c. **Burn timer.** When a burn is needed (planner schedule + current
  state), HUD shows "NEXT BURN: TLI · Δv 3.12 km/s · prograde · in T+02:14:33".
- F3d. **Closest-approach** marker for ISS missions (already detected in
  game.js for docking — surface as HUD line "ISS rel-vel 4.2 m/s · 380 m").

### F4. Shuttle landing polish
**State today:** lands but slowly (sim t=11 136 s in standalone test). Numbers
were tuned-by-eye in `83dfd79` (drag 60→250 m², lift 1.2→0.6).

**Gaps:**
- F4a. **Real STS entry profile.** Reference: STS-1 entry interface at 122 km,
  40° AoA hold to 18 km, then S-turns to bleed energy, terminal area energy
  management at 25 km, HAC turn at 16 km, then 18°/22° final glideslope to
  150 m/s touchdown. Our autopilot should fly this curve, not a single
  fixed AoA.
- F4b. **Manual landing aid.** AoA tape, energy state ("HIGH"/"NOMINAL"/
  "LOW"), HAC indicator. Pilot needs *some* visual cue that they're on
  the energy-management cone.
- F4c. **Drag-chute deploy logic.** Real shuttle pops the drag chute at
  ~95 m/s on rollout. Our wheels-down speed is 200 m/s — once on the
  ground we should add a deceleration phase (`parachuteDrag` already a
  field on capsule) instead of allowing 200 m/s rollout indefinitely.

### F5. Autonomous design /loop (long-horizon)
The /design-rocket skill exists. The /loop wrapper would:
1. Pick a mission profile (random or chosen from a backlog).
2. Run /design-rocket to produce a JS blueprint.
3. Inject the blueprint into a temp `constants.js`.
4. Run autofly headless against the blueprint.
5. Read milestones + Δv-margin + max-G.
6. If failure: tune (more fuel, lower TWR, etc.) and re-iterate.
7. If success: commit the blueprint + log the design.

This is gated by F1+F2 (in-flight adherence) and R4 (manual coverage); the
loop needs reliable success/failure signals, which today's regression
provides for autopilot but not for plan-adherence quality.

---

## 3 · Housekeeping (Workstream H)

`.gitignore` is healthy; `node_modules`, designs/, dev PNGs all already
ignored. Real housekeeping items:

- H1. **`package.json` cleanup.** Empty `description`, empty `author`,
  `main: "index.js"` (no such file — it's `index.html`), `keywords: []`,
  `license: "ISC"` (no LICENSE file present). Either populate or remove.
  Add a meaningful `scripts.test` that runs the regression.
- H2. **`scripts/` directory.** Move test-orchestration scripts there.
  `test-autofly-all.mjs`, `test-smoke.mjs`, `test-moonpos.mjs` are kept
  (regression suite); `test-shipshots.mjs` etc are gitignored (kept
  locally). Add a `scripts/serve.sh` wrapper for the dev server.
- H3. **README test instructions.** Update the README "Running tests"
  section once `npm test` works.
- H4. **`docs/index.md`** linking PLAN.md, sources, timelines once R1+R2
  produce them.
- H5. **`LICENSE` file.** Pick MIT or similar — current `package.json`
  claims ISC but no file. Match or change.
- H6. **Loose root PNGs in dev tree** (`test-*.png`, `ship-*.png`,
  `shuttle-*.png` etc) are not tracked but clutter the working dir.
  `git clean -nX` will preview removal of all gitignored files; add a
  `scripts/clean-dev.sh` that runs `git clean -fX` for the user.

---

## 4 · Order of execution

```
WAVE 0 (today, gates everything else):
  Workstream A: version system → tag v0.5.0 baseline
  Push current uncommitted work as v0.5.1 (warp ladder + test harness)

WAVE 1 (next, unlocks reliable iteration):
  H1, H2, H5, package.json cleanup → v0.5.2
  R4: manual-mode regression coverage → v0.6.0
  F1b: stock-mission plannedBurns → v0.7.0

WAVE 2 (visible quality):
  F1a + F1c: in-flight trajectory overlay + colour-coded segments → v0.8.0
  F2a: per-burn route-adherence narration → v0.9.0
  F3a-d: HUD additions for manual pilot → v0.10.0

WAVE 3 (depth):
  F4: shuttle landing polish (real STS entry profile)  → v0.11.0
  R1, R2: numbers + timeline audit, citation files     → v0.12.0
  F2b: gravity-turn pitch nudges                        → v0.13.0

WAVE 4 (long-horizon):
  F5: autonomous design /loop foundation               → v1.0.0
```

Each version bump = one merged feature, CHANGELOG entry, regression run,
git tag, push.

---

## 5 · What is NOT in scope (deliberately)

- 3D rendering. The whole sim is 2D and that's the design.
- Multiplayer / leaderboards. Not the target audience.
- Procedural craft editor in-game. /design-rocket runs in Claude Code and
  produces blueprint snippets; we don't need an in-browser CAD.
- Cross-range plane changes / inclination. 2D doesn't support them
  meaningfully and adding 3D maths to a 2D renderer is misleading.
- Sound effects. Maybe later, not blocking.
