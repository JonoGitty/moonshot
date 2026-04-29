// =============================================================================
// watchdog.js — Houston Watchdog: real-time deviation detection + recovery.
//
// Runs alongside HoustonAssist (the autopilot state machine) and inside the
// same physics substep loop. Where Houston is the "happy path" — phase
// machine with hard-coded setpoints — the Watchdog is the "off-nominal
// handler". It knows the expected envelope per mission phase, detects when
// actual diverges, and reacts (callout / drop-warp / mcc-burn / replan /
// abort-to). See docs/WATCHDOG.md for the full architecture spec and
// docs/missions/<ship>.md for per-mission flight plans.
//
// Lifecycle:
//   - Constructed in game.js right after HoustonAssist
//   - tick(dt) called per physics substep (NOT per frame) so deviation
//     detection runs at sim-time resolution at any time-warp
//   - Shares Houston's feed for callouts (one transcript, not two)
//
// Severities (from WATCHDOG.md):
//   note      Within nominal envelope, just record
//   minor     Drift detected, advisory only
//   moderate  Off nominal, correction required
//   major     Mission goal at risk, may need replan
//   abort     Mission cannot continue safely
// =============================================================================

class HoustonWatchdog {
  constructor(game) {
    this.game = game;
    this.enabled = true;

    // Per-check cooldown map (checkId -> simTime when it can fire again)
    this.cooldowns = new Map();

    // Predicted-state cache, gated on BOTH sim-time and wall-clock so that
    // high time-warp doesn't cause O(warp) predictions per real-second.
    // Wall-clock cap is the dominant constraint at high warp (1000× = 1ms
    // wall per sim-sec, so a 30-sec sim cadence alone would still fire
    // ~33 Hz wall-clock without the wall cap). Each forward-sim is ~5 ms,
    // so 4 Hz wall = 2 % overhead — comfortable.
    this.predicted = null;
    this.predictedAt = -1e9;        // sim time of last prediction
    this.predictedAtWall = -1e9;    // wall clock (Date.now()) of last prediction
    this.predictionIntervalSec = 30.0;     // sim time
    this.predictionIntervalWallMs = 250;   // wall clock

    // Shared feed callbacks — write through Houston's transcript so the
    // pilot sees one combined log rather than two.
    this.feed = [];
    this.maxFeed = 30;

    // Pending action. The watchdog can pre-empt the autopilot by setting
    // an override that game.js reads each substep. Implemented at v0.7.0:
    //   - 'callout'    log to feed
    //   - 'drop-warp'  cap timeWarpIdx
    //   - 'mcc-burn'   drive a corrective burn through craft.targetAngle / throttle
    //   - 'replan'     change houston.autoPhase to a different phase id
    //   - 'abort-to'   switch the active mission profile (deferred)
    this.warpCap = null;       // null = no cap, otherwise integer
    this.warpCapReason = null;

    // Active MCC burn (populated by 'mcc-burn' action; cleared on cut).
    // Shape: { checkId, target, dvBudget, dvSpent, cutWhen, startMass, prevAngle, prevSasMode, prevThrottle }
    this.activeMcc = null;

    // Standard checks (apply to every mission). Mission-specific checks
    // are appended at run-time when the mission plan is loaded.
    this.standardChecks = buildStandardChecks();
    this.missionChecks = [];

    // Stats for debug/UI
    this.stats = { triggered: 0, callouts: 0, warpCaps: 0, mccBurns: 0, aborts: 0 };
  }

  // Called when the mission changes (e.g., user picks a new ship). Loads
  // the per-mission watchdog rules from `MISSION_PLANS[shipKey]` if defined.
  // Mission plans are exported by `js/missions/<ship>.js` and registered on
  // window.MISSION_PLANS at script-load time.
  reset(shipKey) {
    this.cooldowns.clear();
    this.predicted = null;
    this.predictedAt = -1e9;
    this.predictedAtWall = -1e9;
    this.feed.length = 0;
    this.warpCap = null;
    this.warpCapReason = null;
    this.stats = { triggered: 0, callouts: 0, warpCaps: 0, mccBurns: 0, aborts: 0 };

    const plans = (typeof window !== 'undefined') ? window.MISSION_PLANS : null;
    const plan = (plans && shipKey) ? plans[shipKey] : null;
    this.missionChecks = (plan && plan.checks) ? plan.checks : [];
    this.activePlan = plan || null;
  }

  // Per-physics-substep tick. Runs after houston.physicsTick so the watchdog
  // sees the autopilot's setpoint decisions for this step before evaluating
  // deviations. Cheap by design — no allocations in hot path.
  tick(dt) {
    if (!this.enabled) return;
    const c = this.game.craft;
    if (!c || c.destroyed || c.landed) return;

    // Advance the predicted-state cache if both gates have elapsed.
    const wallNow = Date.now();
    if (c.missionTime - this.predictedAt > this.predictionIntervalSec
        && wallNow - this.predictedAtWall > this.predictionIntervalWallMs) {
      this.runPrediction();
      this.predictedAt = c.missionTime;
      this.predictedAtWall = wallNow;
    }

    const state = this.snapshotState(c);

    // Drive an in-progress MCC burn first — overwrites Houston's setpoints
    // for the duration of the trim. Sets c.targetAngle / c.throttle / sasMode
    // each substep so steering is stable at high warp (same pattern as Houston).
    if (this.activeMcc) {
      this.driveMccBurn(c, state, dt);
      // While burning we still want callouts but suppress new mcc-burn triggers
      // (the cooldown on the originating check prevents re-fire anyway).
    }

    // Run standard checks first, then per-mission checks.
    for (const check of this.standardChecks) {
      this.evaluateCheck(check, state);
    }
    for (const check of this.missionChecks) {
      this.evaluateCheck(check, state);
    }

    // Apply pending warp cap (this overrides Houston's setpoint each substep).
    if (this.warpCap !== null && this.game.timeWarpIdx > this.warpCap) {
      this.game.timeWarpIdx = this.warpCap;
    }
  }

  // -- MCC burn execution -----------------------------------------------------
  // Sets c.targetAngle to the burn direction, holds full throttle, integrates
  // Δv spent, and exits when cutWhen returns true OR dvBudget is exhausted.
  // Houston's setpoints get overwritten for the duration; once cleared,
  // Houston resumes its phase machine on the next substep.
  startMccBurn(check, action, state) {
    const c = this.game.craft;
    if (!c || this.activeMcc) return;

    const target = action.target || 'prograde';
    this.activeMcc = {
      checkId: check.id,
      target,
      dvBudget: action.dvBudget != null ? action.dvBudget : 50,
      dvSpent: 0,
      cutWhen: action.cutWhen || null,
      startMass: c.getCurrentMass(),
      // Save prior state so we can restore (best-effort) when done
      prevSasMode: c.sasMode,
      prevThrottle: c.throttle,
      startedAt: state.missionTime,
    };

    this.callout('mcc-' + check.id,
      `Watchdog: MCC trim engaged — target ${target}, Δv budget ${this.activeMcc.dvBudget} m/s.`,
      'warn');
    this.stats.mccBurns++;
  }

  driveMccBurn(c, state, dt) {
    const m = this.activeMcc;
    if (!m) return;

    // Compute target angle from velocity vector. 'prograde' = direction of
    // motion; 'retrograde' = opposite; 'radial' = perpendicular outward
    // (radial-out from Earth).
    const v = c.vel;
    const speed = Math.hypot(v.x, v.y);
    let targetAngle = c.angle;
    if (speed > 1) {
      const progradeAngle = Math.atan2(v.y, v.x);
      if (m.target === 'prograde') {
        targetAngle = progradeAngle;
      } else if (m.target === 'retrograde') {
        targetAngle = progradeAngle + Math.PI;
      } else if (m.target === 'radial') {
        // Radial-out from Earth (positive radius direction)
        const earth = this.game.earth;
        if (earth) {
          const dx = c.pos.x - earth.pos.x;
          const dy = c.pos.y - earth.pos.y;
          targetAngle = Math.atan2(dy, dx);
        }
      } else if (typeof m.target === 'object' && m.target && m.target.angle != null) {
        targetAngle = m.target.angle;
      }
    }

    // Steer + burn
    c.targetAngle = targetAngle;
    c.sasMode = 'free';

    // Don't fire until pointed close to target (within 10°), to avoid wasting
    // Δv pushing in the wrong direction.
    const aimErr = Math.abs(angularDelta(c.angle, targetAngle));
    if (aimErr < 0.175) {
      c.throttle = 1.0;
    } else {
      c.throttle = 0;
    }

    // Track Δv spent — Tsiolkovsky-equivalent: dv = (m_before - m_after) / m_before * v_e
    // Cheap approximation: dv ≈ throttle * (active.thrust / mass) * dt
    if (c.thrusting && c.throttle > 0) {
      const mass = c.getCurrentMass();
      const active = c.activeStageIdx < c.stages.length ? c.stages[c.activeStageIdx] : c.capsule;
      const accel = (active.thrust * c.throttle) / Math.max(1, mass);
      m.dvSpent += accel * dt;
    }

    // Cut conditions
    let cut = false;
    let cutReason = null;
    if (m.cutWhen) {
      try {
        if (m.cutWhen(state)) { cut = true; cutReason = 'cutWhen satisfied'; }
      } catch (e) {
        cut = true;
        cutReason = 'cutWhen errored: ' + e.message;
      }
    }
    if (m.dvSpent >= m.dvBudget) { cut = true; cutReason = `Δv budget exhausted (${m.dvSpent.toFixed(1)} m/s)`; }
    // Safety: 5 minute sim-time cap on any single MCC
    if (state.missionTime - m.startedAt > 300) { cut = true; cutReason = '5-min MCC cap'; }

    if (cut) {
      c.throttle = 0;
      this.callout('mcc-cut-' + m.checkId,
        `Watchdog: MCC trim cut — ${cutReason}. Δv spent: ${m.dvSpent.toFixed(1)} m/s.`,
        'info');
      this.activeMcc = null;
    }
  }

  // Build a flat snapshot of craft + game state. Decouples checks from the
  // craft/game internals — checks read `state.altE`, not `c.pos` math.
  snapshotState(c) {
    const earth = this.game.earth;
    const moon = this.game.moon;
    const altE = earth ? earth.altitude(c.pos) : 0;
    const altM = moon ? moon.altitude(c.pos) : Infinity;
    const speed = Math.hypot(c.vel.x, c.vel.y);

    // Velocity components relative to Earth (radial vs tangential)
    let vRadial = 0, vTangential = 0;
    if (earth) {
      const dx = c.pos.x - earth.pos.x;
      const dy = c.pos.y - earth.pos.y;
      const r = Math.hypot(dx, dy);
      if (r > 0) {
        vRadial = (c.vel.x * dx + c.vel.y * dy) / r;
        // Tangential component (perpendicular to radial)
        const tx = -dy / r, ty = dx / r;
        vTangential = c.vel.x * tx + c.vel.y * ty;
      }
    }

    // Phase from autopilot (when assist/auto). Falls back to 'manual' if
    // Houston is off — most checks gate on phase so this is fine.
    const phase = (this.game.houston && this.game.houston.autoPhase) || 'manual';

    // Active engine + fuel
    const active = c.activeStageIdx < c.stages.length
      ? c.stages[c.activeStageIdx]
      : c.capsule;
    const fuelFrac = active.fuelMass > 0 ? active.currentFuel / active.fuelMass : 0;

    return {
      // Position / motion
      altE, altM, speed, vRadial, vTangential,
      pos: c.pos, vel: c.vel, angle: c.angle,
      // Orbital
      apoE: c.apoE, periE: c.periE, apoM: c.apoM, periM: c.periM,
      // Phase + stage
      phase,
      activeStageIdx: c.activeStageIdx,
      isCapsule: c.activeStageIdx >= c.stages.length,
      throttle: c.throttle,
      thrusting: c.thrusting,
      fuelFrac,
      // Heat / damage
      temperature: c.capsule.temperature,
      maxTemp: c.capsule.maxTemp,
      // Targeting (autopilot setpoint vs actual)
      targetAngle: c.targetAngle,
      attitudeError: c.targetAngle != null ? angularDelta(c.angle, c.targetAngle) : 0,
      // Mission progress
      milestones: c.milestones,
      missionTime: c.missionTime,
      // Predictor outputs (may be null if not yet computed)
      predicted: this.predicted,
      // Time warp index (so checks can decide to drop it)
      timeWarpIdx: this.game.timeWarpIdx,
    };
  }

  // Forward-simulate the trajectory to estimate future-state envelopes.
  // Cheap (~30 ms wall-clock for 600 steps × 2 bodies) and called at most
  // once per sim second. Caches results in this.predicted.
  runPrediction() {
    const c = this.game.craft;
    if (!c || !this.game.bodies || typeof predictTrajectory !== 'function') {
      this.predicted = null;
      return;
    }
    // 600 steps × 60 s = 10 hours sim-time horizon. Long enough for lunar
    // perilune prediction; short enough that drift doesn't dominate.
    const steps = 600;
    const dt = 60;
    let path;
    try {
      path = predictTrajectory(c, this.game.bodies, steps, dt);
    } catch (e) {
      this.predicted = null;
      return;
    }
    if (!path || !path.craftPath) { this.predicted = null; return; }

    const earth = this.game.earth;
    const moon = this.game.moon;
    const moonPath = path.bodyPaths && this.game.bodies.indexOf(moon) >= 0
      ? path.bodyPaths[this.game.bodies.indexOf(moon)]
      : null;

    let perilune = Infinity, periluneAt = 0;
    let periapsisE = Infinity;
    let reentryAngle = null;
    let willHit = path.hit || null;

    for (let i = 0; i < path.craftPath.length; i++) {
      const p = path.craftPath[i];
      // Earth perigee
      if (earth) {
        const dx = p.x - earth.pos.x, dy = p.y - earth.pos.y;
        const dE = Math.hypot(dx, dy) - earth.radius;
        if (dE < periapsisE) periapsisE = dE;
        // Reentry angle: when crossing 122 km descending, sample flight-path angle
        if (reentryAngle === null && dE < 122e3 && i > 0) {
          const prev = path.craftPath[i - 1];
          const vx = (p.x - prev.x) / dt;
          const vy = (p.y - prev.y) / dt;
          const r = Math.hypot(dx, dy);
          if (r > 0) {
            const vRad = (vx * dx + vy * dy) / r;
            const vTan = Math.hypot(vx - vRad * dx / r, vy - vRad * dy / r);
            if (vRad < 0) {
              reentryAngle = Math.atan2(vRad, vTan); // negative = descending
            }
          }
        }
      }
      // Moon perilune
      if (moonPath && moon) {
        const mp = moonPath[i];
        if (mp) {
          const dx = p.x - mp.x, dy = p.y - mp.y;
          const dM = Math.hypot(dx, dy) - moon.radius;
          if (dM < perilune) {
            perilune = dM;
            periluneAt = i * dt;
          }
        }
      }
    }

    this.predicted = {
      perilune: perilune === Infinity ? null : perilune,
      periluneAt,
      periapsisE: periapsisE === Infinity ? null : periapsisE,
      reentryAngle,
      willHit,
    };
  }

  // Single-check evaluation. Returns true if the check fired.
  evaluateCheck(check, state) {
    if (!check || typeof check.triggerWhen !== 'function') return false;

    // Cooldown
    const cd = this.cooldowns.get(check.id);
    if (cd != null && state.missionTime < cd) return false;

    let triggered;
    try {
      triggered = !!check.triggerWhen(state);
    } catch (e) {
      // A check throwing means a buggy check definition. Log once + skip.
      this.callout('check-error-' + check.id,
        `Watchdog: check "${check.id}" errored — ${e.message}`, 'warn');
      this.cooldowns.set(check.id, state.missionTime + 60);
      return false;
    }
    if (!triggered) return false;

    this.stats.triggered++;
    const cooldownSec = check.cooldownSec != null ? check.cooldownSec : 30;
    this.cooldowns.set(check.id, state.missionTime + cooldownSec);
    this.applyAction(check, state);
    return true;
  }

  // Dispatch the action declared on the check.
  applyAction(check, state) {
    const action = check.action || {};
    const sev = check.severity || 'note';
    const sevTag = (sev === 'abort' || sev === 'major') ? 'warn'
                : (sev === 'moderate') ? 'warn'
                : 'info';

    switch (action.type) {
      case 'callout':
        this.callout(check.id,
          this.formatCallout(check, action, state),
          sevTag);
        this.stats.callouts++;
        break;

      case 'drop-warp':
        if (action.cap != null && this.game.timeWarpIdx > action.cap) {
          this.warpCap = action.cap;
          this.warpCapReason = action.reason || check.id;
          this.game.timeWarpIdx = action.cap;
          this.stats.warpCaps++;
        }
        this.callout(check.id,
          `Watchdog: ${check.id} — drop warp to idx ${action.cap}` +
          (action.reason ? ` (${action.reason})` : ''),
          sevTag);
        break;

      case 'mcc-burn':
        // Engage the burn — driveMccBurn() takes over c.targetAngle / throttle
        // each substep until cutWhen returns true or dvBudget is exhausted.
        // Won't engage if another MCC is already in progress (simpler to
        // sequence than to interleave).
        if (!this.activeMcc) {
          this.startMccBurn(check, action, state);
        } else {
          this.callout(check.id,
            `Watchdog: ${check.id} suppressed — MCC ${this.activeMcc.checkId} still active.`,
            'info');
        }
        break;

      case 'replan':
        // Force the autopilot into a different phase id. Houston's runAutopilot
        // dispatches on autoPhase, so writing it shifts the state machine.
        if (this.game.houston && action.newPhaseId) {
          this.game.houston.autoPhase = action.newPhaseId;
          this.callout(check.id,
            `Watchdog: replan — Houston phase set to ${action.newPhaseId}.`,
            sevTag);
        }
        break;

      case 'abort-to':
        // Switch the active mission type. Heavier surgery — currently we just
        // narrate; full mission-type swap (rebuilding plannedBurns, etc.) is
        // deferred to v0.8.0 per WATCHDOG.md scope.
        this.callout(check.id,
          `Watchdog: ABORT requested — switch to ${action.newMissionType} (manual intervention required at v0.7.0).`,
          'warn');
        this.stats.aborts++;
        break;

      default:
        this.callout(check.id,
          `Watchdog: ${check.id} (severity ${sev}) — no action handler`,
          sevTag);
    }
  }

  formatCallout(check, action, state) {
    if (action.message) return action.message;
    return `Watchdog: ${check.id} (severity ${check.severity || 'note'})`;
  }

  // Append to feed; also forward to Houston's transcript so there's one
  // unified log. Dedupes per-id like Houston.callout.
  callout(id, text, type) {
    if (this.feed.find(f => f.id === id)) return;
    const t = this.game.craft ? this.game.craft.missionTime : 0;
    this.feed.unshift({ id, text, type: type || 'info', t });
    if (this.feed.length > this.maxFeed) this.feed.pop();
    // Forward to Houston so the pilot sees one combined transcript
    if (this.game.houston) {
      this.game.houston.callout('wd:' + id, text, type || 'info');
    }
  }
}

// -----------------------------------------------------------------------------
// Standard checks — apply to every mission, hand-coded from WATCHDOG.md.
// -----------------------------------------------------------------------------

function buildStandardChecks() {
  return [
    // Attitude diverged: target vs actual angle delta > 5° for > 2 s during burn.
    // We approximate "for > 2 s" by requiring throttle > 0.1 (so we're burning)
    // and attitudeError > 0.087 rad (5°). 30 s cooldown prevents spam.
    {
      id: 'std/attitude-diverged',
      severity: 'minor',
      cooldownSec: 30,
      triggerWhen: (s) =>
        s.thrusting && s.throttle > 0.1 && Math.abs(s.attitudeError) > 0.087,
      action: {
        type: 'drop-warp',
        cap: 4,                 // 50× — autopilot can re-aim cleanly
        reason: 'attitude diverged from setpoint',
      },
    },

    // Throttle stuck: commanded 0 but actual > 0.05 (engine didn't shut down)
    {
      id: 'std/throttle-stuck',
      severity: 'major',
      cooldownSec: 10,
      triggerWhen: (s) =>
        // Only fires if Houston's autopilot has explicitly cut throttle
        // (we infer from phase being in a 'coast' state but throttle non-zero)
        s.throttle > 0.05 && /coast|orbit|stay/.test(s.phase),
      action: {
        type: 'callout',
        message: 'Watchdog: throttle stuck — engine commanded off but still firing.',
      },
    },

    // Heat critical: temperature > 0.95 × maxTemp (about to burn through)
    {
      id: 'std/heat-critical',
      severity: 'major',
      cooldownSec: 5,
      triggerWhen: (s) => s.maxTemp > 0 && s.temperature > 0.95 * s.maxTemp,
      action: {
        type: 'drop-warp',
        cap: 0,                 // 1× — manual / autopilot can re-orient
        reason: 'heat critical',
      },
    },

    // Heat warning: temperature > 0.80 × maxTemp (advisory)
    {
      id: 'std/heat-warning',
      severity: 'minor',
      cooldownSec: 60,
      triggerWhen: (s) =>
        s.maxTemp > 0 && s.temperature > 0.80 * s.maxTemp
        && s.temperature <= 0.95 * s.maxTemp,
      action: {
        type: 'callout',
        message: 'Watchdog: thermal load rising — heat shield approaching limit.',
      },
    },

    // Earth-impact predicted: forward sim says we'll hit Earth surface and
    // we're not in a planned reentry phase.
    {
      id: 'std/earth-impact-predicted',
      severity: 'major',
      cooldownSec: 30,
      triggerWhen: (s) =>
        s.predicted && s.predicted.willHit === 'Earth'
        && !/reentry|deorbit|orbit-handover|ascent/.test(s.phase),
      action: {
        type: 'callout',
        message: 'Watchdog: Earth-impact predicted on current trajectory.',
      },
    },

    // Lunar-impact predicted: predicted perilune below Moon surface during
    // any lunar approach phase.
    {
      id: 'std/lunar-impact-predicted',
      severity: 'abort',
      cooldownSec: 30,
      triggerWhen: (s) =>
        s.predicted && s.predicted.perilune != null && s.predicted.perilune < 0
        && /loi|lunar|trans-lunar/.test(s.phase),
      action: {
        type: 'callout',
        message: 'Watchdog: lithobraking imminent — predicted perilune is below Moon surface.',
      },
    },

    // Fuel underrun: active stage < 5 % AND we're in a burn-critical phase
    {
      id: 'std/fuel-underrun',
      severity: 'moderate',
      cooldownSec: 30,
      triggerWhen: (s) =>
        s.fuelFrac < 0.05 && s.thrusting && /burn|tli|loi|tei|deorbit|descent|ascent/.test(s.phase),
      action: {
        type: 'callout',
        message: 'Watchdog: active stage fuel below 5 % — consider stage-down or burn cut.',
      },
    },

    // Reentry angle wrong (capsule): at atmospheric interface, flight-path
    // angle should be in [-7°, -5°] for capsule, [-2°, 0°] for shuttle.
    // Capsule check only — shuttle handled separately in mission plan.
    {
      id: 'std/reentry-angle-too-steep',
      severity: 'major',
      cooldownSec: 60,
      triggerWhen: (s) =>
        s.altE < 130e3 && s.altE > 80e3 && s.vRadial < 0
        && s.predicted && s.predicted.reentryAngle != null
        && s.predicted.reentryAngle < -0.14   // -8°
        && s.isCapsule,
      action: {
        type: 'callout',
        message: 'Watchdog: reentry angle steeper than -8° — high-g entry imminent, drop warp + brace.',
      },
    },
  ];
}

// Helper: smallest signed angular difference (a - b), normalized to [-π, π]
function angularDelta(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
