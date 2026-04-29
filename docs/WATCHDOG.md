# Houston Watchdog — architecture spec

**Status:** v0.7.0 milestone, queued. This doc + the per-mission plans in
`docs/missions/*.md` are the design input. Implementation lives in
`js/watchdog.js` (to be written) and wires into `js/game.js:updatePhysics`
alongside `houston.physicsTick(dt)`.

**Goal:** make the autopilot robust enough to fly *real* mission profiles
under imperfect conditions, push warps even higher safely, and unlock the
autonomous-design `/loop` (F5 in PLAN.md) which needs an autopilot that can
recover from anomalies without manual intervention.

---

## Why a watchdog (not just better autopilot tuning)

The autopilot today is a **state machine** — pre-launch → ascent → orbit →
TLI → trans-lunar coast → LOI → … — with hard-coded transitions. Each
phase has fixed setpoints (throttle, target attitude, warp). It assumes
the vehicle behaves nominally. When it doesn't (TLI under-burn, attitude
drift, off-nominal closest approach), the phase machine just keeps going
and the mission fails silently.

A watchdog **runs alongside** the autopilot, knows the *expected* state
envelope per phase, detects when actual diverges, and **reacts**:

- minor drift → log "off nominal", drop warp until back inside envelope
- moderate drift → fire a corrective burn (mid-course correction, trim)
- major drift → abort to safer profile (free-return instead of capture,
  contingency entry, etc.)
- post-recovery → re-engage aggressive warp

This is exactly how real mission control flies — Apollo flight controllers
had abort modes, MCC trim burns, and contingency profiles for every phase.
We mirror that.

---

## Schema — what each mission plan declares

Each `docs/missions/<ship>.md` declares a flight plan in a structured way
so the watchdog can read it. The plan compiles to a JS object literal at
build/load time (or hand-translated for now into `js/missions/<ship>.js`).

```typescript
interface MissionPlan {
  shipKey: string;                    // 'saturn5'
  missionName: string;                // 'Apollo 11'
  realFlight: {
    date: string;                     // ISO + UT
    crew: string[];
    vehicle: string;                  // 'Saturn V SA-506'
    goal: string;                     // 'Land on the Moon and return crew alive'
    sources: string[];                // citation URLs / doc names
  };

  // Phase-by-phase envelope. Watchdog cycles through these in order.
  phases: Phase[];
}

interface Phase {
  id: string;                         // 'tli-burn'
  realName: string;                   // 'S-IVB Trans-Lunar Injection'
  realT: { start: number; end: number };  // T+ seconds from launch (real)

  // Entry condition — when to consider this phase active.
  enterWhen(state): boolean;

  // Expected envelope at any point during the phase.
  envelope: Envelope;

  // Exit condition — what marks "phase done".
  exitWhen(state): boolean;

  // What we should be doing during the phase (auto + watchdog reference).
  setpoints: {
    throttle?: number | (state) => number;
    attitude?: 'prograde' | 'retrograde' | 'radial' | (state) => number;
    warp?: number;                    // floor; watchdog can drop, not raise
  };

  // What the watchdog watches for. Each check has a tolerance and an action.
  checks: Check[];
}

interface Envelope {
  // All optional — only declare what's monitored for this phase.
  altE?:      { min: number; max: number };           // m above Earth surface
  altM?:      { min: number; max: number };           // m above Moon surface
  speed?:     { min: number; max: number };           // m/s relative to active body
  apoE?:      { min: number; max: number };
  periE?:     { min: number; max: number };
  apoM?:      { min: number; max: number };
  periM?:     { min: number; max: number };
  throttle?:  { min: number; max: number };
  attitudeError?: number;                              // rad, max divergence from target
  // Predicted future-state envelopes (uses trajectory.js):
  predictedPerilune?: { min: number; max: number };   // perilune at next encounter
  predictedReentryAngle?: { min: number; max: number };  // for Earth return
}

interface Check {
  id: string;                         // 'tli-underburn'
  triggerWhen(state, predicted): boolean;
  severity: 'note' | 'minor' | 'moderate' | 'major' | 'abort';
  action: Action;
  cooldownSec?: number;               // don't re-fire too fast (default 30 s sim)
}

interface Action {
  type: 'callout' | 'drop-warp' | 'mcc-burn' | 'replan' | 'abort-to';
  // For 'callout':
  message?: string;
  // For 'drop-warp':
  cap?: number;                       // hard cap warp index
  reason?: string;
  // For 'mcc-burn':
  target?: 'prograde' | 'retrograde' | 'radial' | { angle: number };
  dvBudget: number;                   // m/s, hard cap
  cutWhen: (state) => boolean;        // when to stop the trim burn
  // For 'replan':
  newPhaseId: string;                 // jump to a different phase
  // For 'abort-to':
  newMissionType: string;             // 'free-return' | 'leo-return' | etc.
}
```

---

## Severity levels

| Severity | Meaning | Action examples |
|---|---|---|
| `note` | Within nominal envelope, just record | Log to feed |
| `minor` | Drift detected, advisory only | Callout + drop warp 1 tier |
| `moderate` | Off nominal, correction required | MCC trim burn, drop warp 2-3 tiers |
| `major` | Mission goal at risk, may need replan | Re-target, change phase |
| `abort` | Mission cannot continue safely | Switch to safer profile (e.g. free-return) |

---

## Standard checks (apply to most missions)

Some checks are universal. Watchdog applies these in addition to per-phase checks.

| Check | Trigger | Severity | Action |
|---|---|---|---|
| Attitude diverged | `\|targetAngle - angle\| > 5°` for > 2 s sim during burn | minor | Drop warp to 5×, recalibrate |
| Throttle stuck | Commanded 0, actual > 0.05 | major | Force throttle off, abort phase |
| Heat critical | `temperature > 0.95 × maxTemp` | major | Re-orient heat shield, drop warp |
| Fuel underrun | Active stage < 5 % AND > 20 % of phase Δv remaining | moderate | Stage-down OR cut burn early |
| Earth-impact predicted | `predictedPeriE < 0` and capsule has heat shield not aligned | major | Reorient retrograde |
| Earth-impact predicted (no shield) | predictedPeriE < 0 AND not capsule-only | abort | Stage to capsule + reorient |
| Lunar-impact predicted | `predictedPerilune < 0` during lunar approach | abort | LOI burn now, peri-raise |
| Off-course (cross-range) | `\|track - planned\| > 10° angular` | minor | Callout, no auto-correct (2D limitation) |

---

## Per-phase deviation patterns

Recurring across multiple missions. Each mission plan declares which apply.

### TLI underburn / overburn
- Symptom: post-cutoff `apoE` outside `[0.95, 1.10] × MOON_DISTANCE`
- Severity: moderate (under), minor (over)
- Action: schedule MCC burn at TLI+12 hours real time. Δv budget ≤ 50 m/s.
  Burn prograde if under, retrograde if over.

### LOI undershoot
- Symptom: predicted perilune > target × 1.5 (encounter too distant for clean capture)
- Severity: moderate
- Action: bring LOI burn forward, increase Δv allocation until perilune clamped to target ± 30 %.

### LOI overshoot
- Symptom: predicted perilune < `MOON_RADIUS + 20 km` — lithobraking imminent
- Severity: abort
- Action: pre-LOI dodge burn (radial-out) to raise perilune to ≥ 50 km, accept wider capture orbit.

### Descent too steep
- Symptom: `vRadial < -100 m/s` AND `altM < 5 km` AND throttle = 1.0 already
- Severity: major
- Action: abort to ascent profile, return to lunar orbit.

### Descent too shallow
- Symptom: `vRadial > -1 m/s` AND `altM > 8 km` AND throttle = 1.0
- Severity: minor
- Action: hold throttle, tier warp to 2× until vRadial corrects.

### Reentry angle wrong
- Symptom: flight-path angle at atmospheric interface outside [-7°, -5°] for capsule, [-2°, 0°] for shuttle
- Severity: major
- Action: too steep → orient lift-vector up, drop warp to 1×; too shallow → cannot fix in 2D, callout abort.

### Soft-dock missed
- Symptom: closing on ISS at > 5 m/s relative within 100 m
- Severity: major
- Action: cancel approach, brake to 1 m/s rel, reapproach.

---

## Watchdog runtime

```
HoustonWatchdog.tick(state)
├─ phase = mission.phases[state.phaseId]
├─ for check in [...standardChecks, ...phase.checks]:
│   if not check.triggerWhen(state, predicted): continue
│   if cooldownActive(check): continue
│   record(check)
│   apply(check.action)
│   setCooldown(check)
└─ verify state inside phase.envelope; if not, escalate to a `note`.
```

Tick is called every physics substep alongside `houston.physicsTick(dt)`.
Watchdog actions can over-write houston's setpoints — autopilot is the
"happy path", watchdog is the "off-nominal handler".

---

## Predicted future state

Some checks need future state (e.g. predicted perilune), not just current.
The trajectory predictor (`js/trajectory.js`) does N-body forward simulation
and is already used by the map view. Watchdog runs it on a 1 Hz sim-time
schedule (cheap — 100 forward steps × tiny vector ops) and caches:

```
predicted = {
  perilune: number,         // closest approach to Moon over next 24 h sim
  periluneAt: number,       // sim time of that approach
  periapsisE: number,       // closest approach to Earth over next 24 h sim
  reentryAngle: number,     // flight-path angle at next atmosphere entry
  closestISS: number,       // closest approach to ISS over next 6 h sim
}
```

---

## Implementation order

1. **WATCHDOG.md** ← this doc.
2. **Per-mission plans** in `docs/missions/<ship>.md`. One MD file per ship,
   following the schema above. Watchdog reads them as data (initially
   hand-translated to `js/missions/<ship>.js`; later auto-extracted).
3. **`js/watchdog.js`** — class `HoustonWatchdog` with `tick(state)`.
4. **`game.js` integration** — instantiate alongside HoustonAssist, call
   in substep loop.
5. **Standard checks** wired up first (they apply to every mission).
6. **Per-mission checks** wired second.
7. **MCC burn execution** — watchdog drives a burn through Houston's
   existing autopilot machinery (sets `targetAngle`, `throttle`, transition
   when `cutWhen(state)` returns true).
8. **Replan / abort** — watchdog can rewrite `c.blueprint.mission` and push
   houston into a different phase.

Tests: each mission plan declares an "expected nominal" run + a list of
"injected anomaly" runs that the watchdog must recover from. Becomes
`test-watchdog.mjs` regression suite.

---

## Out of scope for v0.7.0

- Predictive optimisation (the watchdog reacts; it doesn't pre-plan).
- 3-body trajectory targeting. Trim burns are best-effort.
- ML-based anomaly detection. Rules are hand-coded from real mission history.
- Multi-vehicle abort modes (e.g. Apollo "abort to orbit" with separate stages).
  Out of scope but PLAN.md captures it as a v0.8.0 follow-up.
