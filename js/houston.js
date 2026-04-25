// =============================================================================
// houston.js — CapCom assist + autopilot.
//
// Modes:
//   'off'      — invisible, no callouts, no control
//   'assist'   — narrate phases, give burn instructions, never touches craft
//   'auto'     — full ascent autopilot: throttle, pitch program, auto-stage,
//                circularization. Disengages on any pilot input.
//
// Houston dialog is parameterised per-program (apollo / artemis) so the
// callouts use the right vocabulary for the rocket you're flying.
// =============================================================================

const PROGRAM_DIALOG = {
  apollo: {
    callsign: 'Houston',
    vehicle: 'Apollo',
    upperStage: 'S-IVB',
    capsule: 'CSM',
    landingTouchdown: 'Tranquility Base here — the Eagle has landed.',
    splashdown: 'Splashdown! Welcome home, astronaut.',
    s1Name: 'S-IC',
    s2Name: 'S-II',
  },
  artemis: {
    callsign: 'Houston',
    vehicle: 'Artemis',
    upperStage: 'ICPS',
    capsule: 'Orion',
    landingTouchdown: 'Orion is on the lunar surface — Artemis Base is established.',
    splashdown: 'Splashdown! Recovery teams are inbound.',
    s1Name: 'Core + SRBs',
    s2Name: 'ICPS',
  },
  soviet: {
    // Soviet ground control — Korolev's team at TsUP (Mission Control Moscow)
    callsign: 'Korolev',
    vehicle: 'Vostok',
    upperStage: 'Block E',
    capsule: 'spacecraft',
    landingTouchdown: 'We have touchdown on Soviet soil. Poyekhali!',
    splashdown: 'Landing confirmed. Welcome home, cosmonaut.',
    s1Name: 'core stage',
    s2Name: 'Block E',
  },
  // Fallback for craft without a program (Mercury, Falcon 9)
  generic: {
    callsign: 'Mission Control',
    vehicle: 'mission',
    upperStage: 'upper stage',
    capsule: 'capsule',
    landingTouchdown: 'Touchdown confirmed.',
    splashdown: 'Splashdown! Welcome home.',
    s1Name: 'first stage',
    s2Name: 'second stage',
  },
};

class HoustonAssist {
  constructor(game, mode) {
    this.game = game;
    this.mode = mode || 'assist';            // off | assist | auto
    this.fired = new Set();
    this.feed = [];
    this.maxFeed = 20;
    this.lastQ = 0;
    this.maxQAlt = 0;
    this.tliReady = false;

    // Autopilot state — ship profile overrides the defaults
    this.autoPhase = 'pre-launch';
    const profile = (game.craft && game.craft.blueprint && game.craft.blueprint.profile) || {};
    this.autoTargetApo = profile.targetApo || 200e3;
    this.autoTargetPeri = profile.targetPeri || 100e3;
    this.autoLunarApo = profile.lunarApo || 110e3;
    this.autoLunarPeri = profile.lunarPeri || 90e3;
    this.autoLunarStaySec = profile.lunarStaySec || 30;
    this.autoOrbitCoastSec = profile.orbitCoastSimTime || 5000;
    this.autoCircularizeBurning = false;

    // Pick the right vocabulary
    const program = (game.craft && game.craft.blueprint && game.craft.blueprint.program) || 'generic';
    this.dialog = PROGRAM_DIALOG[program] || PROGRAM_DIALOG.generic;
  }

  reset() {
    this.fired.clear();
    this.feed.length = 0;
    this.lastQ = 0;
    this.maxQAlt = 0;
    this.tliReady = false;
    this.autoPhase = 'pre-launch';
    this.autoCircularizeBurning = false;
  }

  // Append to transcript (only fires once per id)
  callout(id, text, type) {
    if (this.fired.has(id)) return;
    this.fired.add(id);
    const t = this.game.craft ? this.game.craft.missionTime : 0;
    this.feed.unshift({ id, text, type: type || 'info', t });
    if (this.feed.length > this.maxFeed) this.feed.pop();
  }

  // Pilot took control — drop out of autopilot but keep narrating
  disengageAutopilot(reason) {
    if (this.mode === 'auto') {
      this.mode = 'assist';
      this.callout('auto-off-' + Date.now(), `${this.dialog.callsign}: Autopilot disengaged — ${reason}. You have control.`, 'warn');
    }
  }

  update(dt) {
    if (this.mode === 'off') return;
    const c = this.game.craft;
    if (!c || c.destroyed) return;

    if (this.mode === 'auto') this.runAutopilot(dt);
    this.checkPhaseCallouts(c);
  }

  // ---------------------------------------------------------------------------
  // Phase callouts (run in both 'assist' and 'auto' modes)
  // ---------------------------------------------------------------------------
  checkPhaseCallouts(c) {
    const e = this.game.earth;
    const m = this.game.moon;
    const altE = e.altitude(c.pos);
    const altM = m.altitude(c.pos);
    const vRel = c.velocityRelativeTo(e);
    const speedRel = Vec.mag(vRel);
    const t = c.missionTime;
    const D = this.dialog;

    const briefing = c.blueprint.briefing || {};

    if (c.landed && c.landedOn === 'Earth' && t < 2.0 && c.throttle === 0) {
      // Per-mission pre-launch CapCom speech (e.g. Charlie Blackwell-Thompson
      // for Artemis, Jack King's countdown for Apollo, Korolev for Vostok).
      if (briefing.preLaunchQuote) {
        this.callout('prelaunch-quote', briefing.preLaunchQuote, 'go');
      } else {
        this.callout('prelaunch', `${D.callsign}: ${D.vehicle}, ${D.callsign}. All systems are GO. Hold W when you are ready for ignition.`, 'info');
      }
    }
    if (c.landed && c.landedOn === 'Earth' && c.throttle > 0.3 && c.throttle < 0.95) {
      this.callout('ignition', `${D.callsign}: Ignition sequence start. Stand by for liftoff.`, 'go');
    }

    if (!c.landed && altE > 30 && c.milestones.leftPad) {
      const liftoffLine = briefing.liftoffQuote
        ? briefing.liftoffQuote
        : (D.vehicle === 'Apollo'
            ? `${D.callsign}: We have liftoff! Liftoff of Apollo!`
            : `${D.callsign}: We have liftoff. Go ${D.vehicle}, go!`);
      this.callout('liftoff', liftoffLine, 'go');
    }
    if (altE > 500) this.callout('tower', `${D.callsign}: Tower cleared.`, 'info');
    if (altE > 1500) this.callout('rollprog', `${D.callsign}: Roll program complete. Begin pitch program — tilt east.`, 'info');
    if (speedRel > 343 && altE < 50e3) this.callout('mach1', `${D.callsign}: Mach one.`, 'info');

    // Max-Q tracking
    const rho = atmDensity(altE);
    const q = 0.5 * rho * speedRel * speedRel;
    if (altE < ATMOSPHERE_HEIGHT && q > this.lastQ) { this.lastQ = q; this.maxQAlt = altE; }
    if (q > 25e3 && altE < 30e3) {
      this.callout('maxq-warn', `${D.callsign}: Approaching Max-Q. Recommend throttle to 65%.`, 'warn');
    }
    if (this.fired.has('maxq-warn') && q < 0.7 * this.lastQ && altE > this.maxQAlt + 5e3) {
      this.callout('through-maxq', `${D.callsign}: Through Max-Q. Throttle up.`, 'go');
    }

    // Stage events
    const s1 = c.stages[0], s2 = c.stages[1], s3 = c.stages[2];
    if (s1 && s1.currentFuel < s1.fuelMass * 0.05 && c.activeStageIdx === 0) {
      this.callout('s1-low', `${D.callsign}: ${D.s1Name} propellant near depletion. Stand by for separation. SPACE to stage.`, 'warn');
    }
    if (c.activeStageIdx >= 1) {
      this.callout('s1-sep', `${D.callsign}: ${D.s1Name} separation confirmed.`, 'go');
      if (s2 && s2.currentFuel > 0) {
        this.callout('s2-ig', `${D.callsign}: ${D.s2Name} ignition. Continue ascent.`, 'go');
      }
    }
    if (s2 && s2.currentFuel < s2.fuelMass * 0.05 && c.activeStageIdx === 1) {
      this.callout('s2-low', `${D.callsign}: ${D.s2Name} propellant low. Prepare for ${D.upperStage}. SPACE to stage.`, 'warn');
    }
    if (c.activeStageIdx >= 2) {
      this.callout('s2-sep', `${D.callsign}: ${D.s2Name} separation confirmed.`, 'go');
      if (s3 && s3.currentFuel > 0) {
        this.callout('s3-ig', `${D.callsign}: ${D.upperStage} online. Burn until you reach orbital velocity.`, 'go');
      }
    }
    if (c.isCapsuleOnly() && (this.fired.has('s3-ig') || this.fired.has('s2-ig'))) {
      this.callout('csm-only', `${D.callsign}: ${D.capsule} on its own. Conserve service module fuel — you'll need it for the return.`, 'warn');
    }

    if (altE > 100e3) this.callout('karman', `${D.callsign}: Above the Kármán line. Welcome to space.`, 'go');

    if (c.milestones.reachedOrbit) {
      this.callout('orbit', `${D.callsign}: Orbit insertion confirmed. Apo ${(c.apoE/1000).toFixed(0)} km, peri ${(c.periE/1000).toFixed(0)} km. Beautiful work.`, 'go');
      this.tliReady = true;
    }

    if (this.tliReady && !c.milestones.approachedMoon && c.activeStageIdx <= 2) {
      this.callout('tli-instr', `${D.callsign}: For TLI, point PROGRADE (green ○) and full-throttle the ${D.upperStage}. Target Δv ≈ 3.1 km/s. Apo should reach Moon distance (~384 Mm).`, 'info');
    }
    if (c.apoE !== null && c.apoE > MOON_DISTANCE * 0.7 && !c.milestones.approachedMoon) {
      this.callout('tli-good', `${D.callsign}: TLI looks good. Cut throttle and coast — about 3 days at 100,000× warp.`, 'go');
    }

    if (altM < MOON_SOI && !c.milestones.enteredMoonOrbit && !c.milestones.landedOnMoon) {
      this.callout('moon-soi', `${D.callsign}: Crossing into lunar SOI. Time-warp down to 10× and prepare for LOI.`, 'warn');
    }
    if (altM < MOON_SOI && altM < 200e3 && !c.milestones.enteredMoonOrbit) {
      this.callout('loi-now', `${D.callsign}: LOI window — point RETROGRADE (yellow ×) and burn ~900 m/s to capture into Moon orbit.`, 'warn');
    }
    if (c.milestones.enteredMoonOrbit) {
      this.callout('lunar-orbit', `${D.callsign}: Lunar orbit confirmed. Periapsis ${(c.periM/1000).toFixed(0)} km. Initiate powered descent when ready.`, 'go');
    }
    if (c.milestones.landedOnMoon && !c.milestones.launchedFromMoon) {
      this.callout('eagle-down', `${D.callsign}: ${D.landingTouchdown} W to lift off when ready.`, 'go');
    }
    if (c.milestones.launchedFromMoon && altM < MOON_SOI) {
      this.callout('moon-asc', `${D.callsign}: Lunar ascent. Burn prograde to raise apoapsis past Moon SOI.`, 'info');
    }
    if (c.milestones.launchedFromMoon && altM > MOON_SOI && altE > ATMOSPHERE_HEIGHT) {
      this.callout('tei', `${D.callsign}: Trans-Earth coast. Aim for Earth periapsis 60–120 km. Watch the map (M).`, 'info');
    }
    if (c.milestones.returnedToEarthAtmo) {
      this.callout('reentry-iface', `${D.callsign}: Re-entry interface. Heat shield retrograde! Hold J for auto-retrograde.`, 'warn');
    }
    if (altE < 20e3 && c.isCapsuleOnly() && !c.capsule.parachutesDeployed && !c.capsule.parachuteRipped && c.milestones.approachedMoon) {
      this.callout('chute-prep', `${D.callsign}: Below 20 km. Drogues at ~5 km — press G when speed is below ~250 m/s.`, 'warn');
    }
    if (c.capsule.parachutesDeployed) {
      this.callout('chutes', `${D.callsign}: Drogues out, mains deploying. Brace for splashdown.`, 'go');
    }
    if (c.milestones.landedOnEarth && c.milestones.approachedMoon) {
      this.callout('splashdown', `${D.callsign}: ${D.splashdown}`, 'go');
    }
  }

  // ---------------------------------------------------------------------------
  // Autopilot
  // ---------------------------------------------------------------------------
  runAutopilot(dt) {
    const c = this.game.craft;
    const e = this.game.earth;
    const m = this.game.moon;
    const altE = e.altitude(c.pos);
    const altM = m.altitude(c.pos);
    const D = this.dialog;

    // Auto-stage when current stage is dry and another stage is available
    const active = c.getActive();
    if (active.fuelMass > 0 && active.currentFuel < active.fuelMass * 0.005 && !c.isCapsuleOnly()) {
      c.separate();
      this.callout('auto-stage-' + c.activeStageIdx, `${D.callsign}: Auto-stage executed.`, 'go');
    }

    switch (this.autoPhase) {
      case 'pre-launch':
        c.throttle = 1.0;
        this.callout('auto-launch', `${D.callsign}: Autopilot engaged. Auto-launch in 3, 2, 1…`, 'go');
        if (!c.landed) this.autoPhase = 'ascent';
        break;

      case 'ascent': {
        // Pure sqrt pitch program. The fast P-controller (P=2.5, max 0.6 rad/s)
        // is what actually keeps the craft tracking the target pitch — earlier
        // attempts drifted because the controller was too sluggish.
        c.throttle = 1.0;

        const upAngle = Math.atan2(c.pos.y - e.pos.y, c.pos.x - e.pos.x);
        const eastAngle = upAngle + Math.PI / 2;
        const mission_ = c.blueprint.mission || 'moon';

        let pitchDeg;
        if (mission_ === 'suborbital') {
          // Ballistic hop: stay mostly vertical the whole way. Only a small
          // 10-15° tilt toward east for a bit of downrange distance. Mercury
          // TWR is ~1.1 so aggressive tilt turns into a failed climb.
          if (altE < 2e3) pitchDeg = 90;
          else pitchDeg = 75;                       // small lean east
        } else if (altE < 300) {
          pitchDeg = 90;
        } else if (altE > 200e3) {
          pitchDeg = 0;
        } else {
          // Slower tilt — stay more vertical to push apo higher before going
          // fully horizontal. Reach 0° pitch at 200 km alt.
          const f = altE / 200e3;
          pitchDeg = 90 * (1 - f) * (1 - f);
        }
        const upAngle2 = upAngle;
        const eastAngle2 = eastAngle;
        let targetAngle = upAngle2 * (pitchDeg / 90) + eastAngle2 * (1 - pitchDeg / 90);

        // DESCENT RECOVERY: if descending, blend target back toward vertical
        // but cap at 50% so we keep building some horizontal velocity too —
        // going fully vertical stops orbital insertion dead.
        const vCur = c.velocityRelativeTo(e);
        if (Vec.mag(vCur) > 100) {
          const radial = Vec.norm(Vec.sub(c.pos, e.pos));
          const vRadial = Vec.dot(vCur, radial);
          if (vRadial < 0 && altE < 200e3) {
            const urgency = clamp(-vRadial / 400, 0, 0.5);
            targetAngle = targetAngle * (1 - urgency) + upAngle2 * urgency;
          }
        }

        this.steerTo(targetAngle, dt);

        // Modest warp once we're safely in vacuum — speeds up the long
        // upper-stage orbital-insertion burn without destabilising the
        // attitude controller (rotation rates are small up there).
        if (altE > 100e3 && this.game.timeWarpIdx < 2) {
          this.game.timeWarpIdx = 2;
          this.game.timeWarp = TIME_WARP_LEVELS[2];
        }

        // Throttle-down to avoid Max-Q destruction in dense atmosphere
        const rho = atmDensity(altE);
        const vMag = Vec.mag(c.velocityRelativeTo(e));
        const q = 0.5 * rho * vMag * vMag;
        if (q > 60e3) c.throttle = 0.45;
        else if (q > 35e3) c.throttle = 0.70;
        else c.throttle = 1.0;

        // Mission handover depends on the rocket's mission type
        const mission = c.blueprint.mission || 'moon';

        // For suborbital: we never reach 'orbit', the craft apexes and falls
        // back naturally. Cut throttle when fuel is depleted OR we're past
        // apex, then transition to re-entry. Never go to circularization.
        if (mission === 'suborbital') {
          const radial = Vec.norm(Vec.sub(c.pos, e.pos));
          const vRad = Vec.dot(c.velocityRelativeTo(e), radial);
          // Let the rocket burn to fuel depletion (Mercury does 2m22s), then
          // coast to apex. Transition to reentry-prep once descending.
          if (vRad < 0 && c.milestones.reachedSpace) {
            c.throttle = 0;
            this.autoPhase = 'reentry-prep';
            this.callout('auto-reentry', `${D.callsign}: Apex passed. Preparing for re-entry.`, 'go');
          }
          // Above apex target — coast rather than waste fuel
          else if (c.apoE !== null && c.apoE > 220e3) {
            c.throttle = 0;
          }
          break;
        }

        // Orbital missions: continuous ascent until we've reached a safe
        // orbit. Criteria: peri above the atmosphere (≥120 km) AND apo above
        // target. This avoids the problem of trying to raise peri by burning
        // away from apoapsis (which just raises apo instead).
        const periTarget = Math.min(120e3, this.autoTargetPeri * 0.6);
        if (c.periE !== null && c.apoE !== null &&
            c.periE > periTarget && c.apoE > this.autoTargetApo * 0.9) {
          c.throttle = 0;
          // Dispatch directly to mission-specific follow-up
          if (mission === 'orbit-only') {
            while (!c.isCapsuleOnly()) c.separate();
            this.autoPhase = 'orbit-handover';
            this.callout('auto-sputnik-deploy', `${D.callsign}: Orbit achieved. Satellite deployed. *beep* *beep* *beep*`, 'go');
            this.mode = 'assist';
          } else if (mission === 'leo-return') {
            this.autoPhase = 'leo-coast-before-deorbit';
            this.callout('auto-leo', `${D.callsign}: Orbit insertion complete. Coasting one full orbit.`, 'go');
          } else if (mission === 'iss-dock') {
            this.autoPhase = 'iss-rendezvous';
            this.callout('auto-iss-start', `${D.callsign}: Orbit insertion complete. Beginning rendezvous with ISS — 6-hour fast-approach profile.`, 'go');
          } else if (mission === 'moon' || mission === 'moon-orbit' || mission === 'moon-flyby') {
            this.autoPhase = 'orbit-coast';
            this.callout('auto-orbit', `${D.callsign}: Parking orbit achieved. Apo ${(c.apoE/1000).toFixed(0)} km, peri ${(c.periE/1000).toFixed(0)} km. Coasting for TLI window.`, 'go');
          } else {
            this.autoPhase = 'orbit-handover';
            this.mode = 'assist';
          }
        }
        break;
      }

      // Coast from ascent apex to apoapsis, then do a short circularization
      // burn. Keeps the upper stage mostly full for the TLI burn later.
      case 'pre-orbit-coast': {
        c.throttle = 0;
        const v = c.velocityRelativeTo(e);
        if (Vec.mag(v) > 1) this.steerTo(Math.atan2(v.y, v.x), dt);
        // Warp during the coast
        if (this.game.timeWarpIdx < 3) {
          this.game.timeWarpIdx = 3;
          this.game.timeWarp = TIME_WARP_LEVELS[3];
        }
        // Near apoapsis when radial velocity goes ≤ 0
        const radial = Vec.norm(Vec.sub(c.pos, e.pos));
        const vRad = Vec.dot(v, radial);
        if (vRad <= 8) {
          this.game.timeWarpIdx = 0;
          this.game.timeWarp = TIME_WARP_LEVELS[0];
          this.autoPhase = 'circularize-ascent';
          this.callout('auto-circ', `${D.callsign}: At apogee. Circularization burn.`, 'go');
        }
        break;
      }

      case 'circularize-ascent': {
        // Short prograde burn at apo to raise peri above the atmosphere
        c.throttle = 1.0;
        const v = c.velocityRelativeTo(e);
        if (Vec.mag(v) > 1) this.steerTo(Math.atan2(v.y, v.x), dt);
        if (c.periE !== null && c.periE > this.autoTargetPeri * 0.85) {
          c.throttle = 0;
          // Dispatch to mission-specific follow-up
          const mission = c.blueprint.mission;
          if (mission === 'orbit-only') {
            while (!c.isCapsuleOnly()) c.separate();
            this.autoPhase = 'orbit-handover';
            this.callout('auto-sputnik-deploy', `${D.callsign}: Orbit achieved. Satellite deployed. *beep* *beep* *beep*`, 'go');
            this.mode = 'assist';
          } else if (mission === 'leo-return') {
            this.autoPhase = 'leo-coast-before-deorbit';
            this.callout('auto-leo', `${D.callsign}: Orbit insertion complete. Coasting one full orbit.`, 'go');
          } else if (mission === 'iss-dock') {
            this.autoPhase = 'iss-rendezvous';
            this.callout('auto-iss-start', `${D.callsign}: Orbit insertion complete. Beginning rendezvous with ISS — 6-hour fast-approach profile.`, 'go');
          } else if (mission === 'moon' || mission === 'moon-orbit' || mission === 'moon-flyby') {
            this.autoPhase = 'orbit-coast';
            this.callout('auto-orbit', `${D.callsign}: Parking orbit achieved. Apo ${(c.apoE/1000).toFixed(0)} km, peri ${(c.periE/1000).toFixed(0)} km. Coasting for TLI window.`, 'go');
          } else {
            this.autoPhase = 'orbit-handover';
            this.mode = 'assist';
          }
        }
        break;
      }

      case 'orbit-coast': {
        // Wait in LEO for the TLI window. Moon needs to be roughly 114°
        // ahead of the craft (angular lead) so that after the half-Hohmann
        // transfer (≈5 days) Moon arrives at the craft's apoapsis.
        c.throttle = 0;
        const v = c.velocityRelativeTo(e);
        if (Vec.mag(v) > 1) this.steerTo(Math.atan2(v.y, v.x), dt);

        // Fast-forward while waiting for the window (Moon orbit period ~27.3 d)
        if (this.game.timeWarpIdx < 7) {
          this.game.timeWarpIdx = 7;
          this.game.timeWarp = TIME_WARP_LEVELS[7];
        }

        const moonAng = Math.atan2(m.pos.y - e.pos.y, m.pos.x - e.pos.x);
        const craftAng = Math.atan2(c.pos.y - e.pos.y, c.pos.x - e.pos.x);
        let lead = normAngle(moonAng - craftAng);          // Moon angular lead
        const targetLead = 114 * Math.PI / 180;            // Hohmann phase angle
        if (Math.abs(lead - targetLead) < 4 * Math.PI / 180) {
          this.game.timeWarpIdx = 0;
          this.game.timeWarp = TIME_WARP_LEVELS[0];
          this.autoPhase = 'tli-burn';
          this.callout('auto-tli', `${D.callsign}: TLI window open. Igniting ${D.upperStage} for trans-lunar injection.`, 'go');
        }
        break;
      }

      case 'tli-burn': {
        // Full-throttle prograde until apo reaches ~Moon distance
        c.throttle = 1.0;
        const v = c.velocityRelativeTo(e);
        if (Vec.mag(v) > 1) this.steerTo(Math.atan2(v.y, v.x), dt);

        if (c.apoE !== null && c.apoE > MOON_DISTANCE * 0.95) {
          c.throttle = 0;
          this.autoPhase = 'trans-lunar-coast';
          this.callout('auto-tli-cut', `${D.callsign}: TLI complete. Coasting to the Moon — about 3 days at 100,000× warp.`, 'go');
        }
        // Safety: if we've used too much fuel, cut and coast anyway
        if (c.apoE !== null && c.apoE > MOON_DISTANCE * 1.5) {
          c.throttle = 0;
          this.autoPhase = 'trans-lunar-coast';
          this.callout('auto-tli-over', `${D.callsign}: TLI burn long — cutting to save fuel.`, 'warn');
        }
        break;
      }

      case 'trans-lunar-coast': {
        c.throttle = 0;
        const vCoast = c.velocityRelativeTo(e);
        if (Vec.mag(vCoast) > 1) this.steerTo(Math.atan2(vCoast.y, vCoast.x), dt);

        // Max warp during the 3-day coast
        if (this.game.timeWarpIdx < 8) {
          this.game.timeWarpIdx = 8;
          this.game.timeWarp = TIME_WARP_LEVELS[8];
        }

        // When inside Moon SOI, branch on mission type
        if (altM < MOON_SOI) {
          this.game.timeWarpIdx = 2;                       // drop to 5×
          this.game.timeWarp = TIME_WARP_LEVELS[2];
          const mission = c.blueprint.mission;
          if (mission === 'moon-flyby') {
            // Artemis II: free-return — no LOI. Coast through encounter.
            this.autoPhase = 'lunar-flyby';
            this.callout('auto-flyby-soi', `${D.callsign}: Entered lunar SOI. Free-return trajectory — no LOI burn. Coasting past the Moon.`, 'go');
          } else {
            this.autoPhase = 'loi-approach';
            this.callout('auto-loi-soi', `${D.callsign}: Entered lunar SOI. Holding retrograde for LOI.`, 'go');
          }
        }
        break;
      }

      // Free-return flyby: coast through lunar SOI without any burns, let
      // gravity slingshot us back to Earth. Transition to trans-earth-coast
      // once we're clearly past closest approach and on the way out.
      case 'lunar-flyby': {
        c.throttle = 0;
        // Keep velocity-prograde (relative to Earth) for attitude consistency
        const vE = c.velocityRelativeTo(e);
        if (Vec.mag(vE) > 1) this.steerTo(Math.atan2(vE.y, vE.x), dt);

        // Track closest approach. Once we're outbound (altM rising) AND we've
        // already reached a close pass, move to trans-earth-coast.
        if (this.minAltM === undefined || altM < this.minAltM) {
          this.minAltM = altM;
        }
        // Modest warp through the encounter; drop to 10× near closest approach
        const targetWarpIdx = altM < 20e6 ? 2 : 5;
        if (this.game.timeWarpIdx !== targetWarpIdx) {
          this.game.timeWarpIdx = targetWarpIdx;
          this.game.timeWarp = TIME_WARP_LEVELS[targetWarpIdx];
        }

        // Broadcast closest approach
        if (this.minAltM < 20e6 && !this.fired.has('flyby-closest')) {
          this.callout('flyby-closest', `${D.callsign}: Closest lunar approach — ${(this.minAltM/1000).toFixed(0)} km from surface.`, 'go');
        }

        // Moving outbound past Moon SOI and minAltM is now stale = past encounter
        if (altM > MOON_SOI * 1.1 && this.minAltM < 100e6) {
          this.autoPhase = 'trans-earth-coast';
          this.callout('flyby-out', `${D.callsign}: Past the Moon — slingshot worked. Inbound to Earth.`, 'go');
        }
        break;
      }

      case 'loi-approach': {
        // Cruise retrograde (relative to Moon) so the burn is aimed
        // correctly when we start throttling
        c.throttle = 0;
        const vRelMoon = { x: c.vel.x - m.vel.x, y: c.vel.y - m.vel.y };
        if (Vec.mag(vRelMoon) > 1) {
          this.steerTo(Math.atan2(vRelMoon.y, vRelMoon.x) + Math.PI, dt);
        }

        // Start the LOI burn when within reasonable proximity. Threshold
        // scales with the target lunar orbit altitude — Apollo orbits low
        // (~100 km) so trigger at ~2 Mm above surface; Artemis II uses a
        // wide ~9000 km orbit so trigger much earlier.
        const triggerAlt = Math.max(2000e3, this.autoLunarApo * 4);
        if (altM < triggerAlt) {
          this.game.timeWarpIdx = 0;
          this.game.timeWarp = TIME_WARP_LEVELS[0];
          this.autoPhase = 'loi-burn';
          this.callout('auto-loi', `${D.callsign}: Starting LOI burn.`, 'go');
        }
        break;
      }

      case 'loi-burn': {
        c.throttle = 1.0;
        const vRelMoon = { x: c.vel.x - m.vel.x, y: c.vel.y - m.vel.y };
        if (Vec.mag(vRelMoon) > 1) {
          this.steerTo(Math.atan2(vRelMoon.y, vRelMoon.x) + Math.PI, dt);
        }

        // LOI complete when we have a reasonably circular Moon orbit:
        //   periM above the surface by a comfortable margin
        //   apoM not crazy-elliptical (≤ ~4× target apo)
        //   BOTH non-null (i.e. truly captured)
        const mission = c.blueprint.mission;
        const targetPeri = this.autoLunarPeri || 90e3;
        const targetApo = this.autoLunarApo || 110e3;
        const captured = c.periM !== null && c.apoM !== null
                         && c.periM > targetPeri * 0.4
                         && c.apoM < targetApo * 4;
        if (captured) {
          c.throttle = 0;
          this.autoPhase = 'lunar-orbit-coast';
          this.callout('auto-loi-done',
            `${D.callsign}: Lunar orbit captured. Apo ${(c.apoM/1000).toFixed(0)} km, peri ${(c.periM/1000).toFixed(0)} km. Coasting for station-keeping.`,
            'go');
          this.lunarOrbitStart = c.missionTime;
        }
        if (altM < 10e3) {
          c.throttle = 0;
          this.autoPhase = 'lunar-orbit-coast';
          this.callout('auto-loi-abort', `${D.callsign}: Close approach — holding this orbit.`, 'warn');
          this.lunarOrbitStart = c.missionTime;
        }
        break;
      }

      // Coast in lunar orbit for a few orbits before descent (Apollo 11 did
      // 13; we'll do a short equivalent of a few for drama). Gives the
      // player a chance to see the orbit on the map, and lets Artemis
      // missions simply turn around after a token coast.
      case 'lunar-orbit-coast': {
        c.throttle = 0;
        const vRelM = { x: c.vel.x - m.vel.x, y: c.vel.y - m.vel.y };
        if (Vec.mag(vRelM) > 1) this.steerTo(Math.atan2(vRelM.y, vRelM.x), dt);
        // Warp during the coast — a Moon orbit is ~2 hours (7200 s)
        if (this.game.timeWarpIdx < 5) {
          this.game.timeWarpIdx = 5;
          this.game.timeWarp = TIME_WARP_LEVELS[5];
        }
        const coasted = c.missionTime - (this.lunarOrbitStart || c.missionTime);
        // 3 orbits ≈ 21,600 s sim time. At 100× warp that's ~3.6 min real.
        if (coasted > 21600) {
          this.game.timeWarpIdx = 0;
          this.game.timeWarp = TIME_WARP_LEVELS[0];
          const mission = c.blueprint.mission;
          if (mission === 'moon-orbit') {
            this.autoPhase = 'tei-burn';
            this.callout('auto-leave-moon', `${D.callsign}: Orbits complete. TEI burn coming up.`, 'go');
          } else {
            if (typeof undockCSM === 'function') undockCSM();
            this.callout('auto-undock', `${D.callsign}: Eagle, you are go for undocking.`, 'go');
            this.autoPhase = 'lunar-descent';
          }
        }
        break;
      }

      // ---------- Moon landing + return ----------
      case 'lunar-descent': {
        // Burn retrograde relative to Moon to kill velocity and descend.
        const vRelM = { x: c.vel.x - m.vel.x, y: c.vel.y - m.vel.y };
        const vMag = Vec.mag(vRelM);
        if (vMag > 1) this.steerTo(Math.atan2(vRelM.y, vRelM.x) + Math.PI, dt);

        const mass = c.getCurrentMass();
        const active = c.getActive();
        const maxAccel = active.thrust / mass;
        const moonG = G * m.mass / (m.radius * m.radius);

        // Two-phase descent:
        //   High: kill most horizontal velocity at full throttle
        //   Low:  hover-descent, modulate to touch down softly
        if (altM > 8e3) {
          c.throttle = 1.0;
        } else {
          // Radial (upward) component of velocity (positive = rising)
          const radial = Vec.norm(Vec.sub(c.pos, m.pos));
          const vRadial = Vec.dot(vRelM, radial);
          // Aim for target descent rate that scales with altitude: higher
          // altitude tolerates faster drop; near surface, gentle.
          const targetDescent = -Math.max(3, altM / 200);     // m/s
          // If we're dropping faster than target, add thrust
          const dropDelta = (vRadial - targetDescent);         // neg = too fast
          const hoverAccel = moonG * 1.0;                      // baseline to hover
          const correctionAccel = -dropDelta * 0.5;            // P on descent rate
          c.throttle = clamp((hoverAccel + correctionAccel) / maxAccel, 0, 1);
        }

        if (c.landed && c.landedOn === 'Moon') {
          c.throttle = 0;
          this.autoPhase = 'lunar-stay';
          this.moonStayStart = c.missionTime;
          this.callout('moon-touchdown', `${D.callsign}: ${D.landingTouchdown} Resting on the surface.`, 'go');
        }
        break;
      }

      case 'lunar-stay': {
        c.throttle = 0;
        if (!this.moonStayStart) {
          this.moonStayStart = c.missionTime;
          // Jettison the LM Descent stage — it stays on the Moon (Apollo 11
          // left it as the "Eagle has landed" memorial). LM Ascent takes over.
          if (!c.isCapsuleOnly() && c.activeStageIdx < c.stages.length - 1) {
            c.separate();
            this.callout('descent-sep', `${D.callsign}: Descent stage jettisoned — stays on the lunar surface.`, 'go');
          }
        }
        if (c.missionTime - this.moonStayStart > this.autoLunarStaySec) {
          this.autoPhase = 'lunar-ascent';
          this.callout('moon-liftoff', `${D.callsign}: Lunar liftoff. Heading back to Earth.`, 'go');
        }
        break;
      }

      case 'lunar-ascent': {
        // Go straight up off the Moon's surface, then pitch toward prograde
        c.throttle = 1.0;
        const upAngle = Math.atan2(c.pos.y - m.pos.y, c.pos.x - m.pos.x);
        const eastAngle = upAngle + Math.PI / 2;
        let pitchDeg;
        if (altM < 5e3) pitchDeg = 90;
        else if (altM > 60e3) pitchDeg = 0;
        else pitchDeg = 90 * (1 - (altM - 5e3) / 55e3);
        const target = upAngle * (pitchDeg / 90) + eastAngle * (1 - pitchDeg / 90);
        this.steerTo(target, dt);

        // Once we have a stable moon orbit, rendezvous with the CSM ghost
        // (if we're Apollo and CSM is waiting in orbit), then TEI.
        if (c.periM !== null && c.periM > 20e3) {
          c.throttle = 0;
          if (this.game.ghostCSM && typeof dockCSM === 'function') {
            this.callout('rendezvous', `${D.callsign}: Closing on CSM — rendezvous and docking.`, 'go');
            dockCSM();
          }
          this.autoPhase = 'tei-burn';
          this.callout('moon-orbit-ret', `${D.callsign}: Back in Moon orbit. Trans-Earth injection next.`, 'go');
        }
        break;
      }

      case 'tei-burn': {
        // Burn prograde (relative to Moon) until we escape Moon SOI
        const vRelM = { x: c.vel.x - m.vel.x, y: c.vel.y - m.vel.y };
        if (Vec.mag(vRelM) > 1) this.steerTo(Math.atan2(vRelM.y, vRelM.x), dt);
        c.throttle = 1.0;

        // Engage 5× warp during burn (accel is low, burn takes a while)
        if (this.game.timeWarpIdx < 2) {
          this.game.timeWarpIdx = 2;
          this.game.timeWarp = TIME_WARP_LEVELS[2];
        }
        // Cut once we're escaping the Moon
        if (altM > MOON_SOI * 0.6) {
          c.throttle = 0;
          this.game.timeWarpIdx = 0;
          this.game.timeWarp = TIME_WARP_LEVELS[0];
          this.autoPhase = 'trans-earth-coast';
          this.callout('tei-done', `${D.callsign}: TEI complete. Coasting home to Earth.`, 'go');
        }
        break;
      }

      case 'trans-earth-coast': {
        c.throttle = 0;
        // Hold retrograde-ish to keep heat shield correct for re-entry later
        const v = c.velocityRelativeTo(e);
        if (Vec.mag(v) > 1) this.steerTo(Math.atan2(v.y, v.x) + Math.PI, dt);

        // Max warp during 3-day coast
        if (this.game.timeWarpIdx < 8) {
          this.game.timeWarpIdx = 8;
          this.game.timeWarp = TIME_WARP_LEVELS[8];
        }
        // When we're near Earth atmosphere, hand off to re-entry sequence
        if (altE < ATMOSPHERE_HEIGHT + 50e3) {
          this.game.timeWarpIdx = 0;
          this.game.timeWarp = TIME_WARP_LEVELS[0];
          this.autoPhase = 'reentry-prep';
          this.callout('returning', `${D.callsign}: Approaching Earth. Preparing for re-entry.`, 'warn');
        }
        break;
      }

      // ---------- ISS RENDEZVOUS (Soyuz TMA-19M Tim Peake) ----------
      // Simplified two-step:
      //   1. Warp through orbital coast until we're roughly in phase with ISS.
      //      Real Soyuz uses 4-orbit fast-rendezvous with phasing burns — we
      //      just accept the approach when ISS is close enough.
      //   2. Null out the relative velocity (fine-approach burns) and dock.
      case 'iss-rendezvous': {
        const iss = this.game.iss;
        if (!iss) { this.autoPhase = 'orbit-handover'; this.mode = 'assist'; break; }
        c.throttle = 0;

        const dx = iss.pos.x - c.pos.x;
        const dy = iss.pos.y - c.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dvx = iss.vel.x - c.vel.x;
        const dvy = iss.vel.y - c.vel.y;
        const relV = Math.sqrt(dvx * dvx + dvy * dvy);

        const v = c.velocityRelativeTo(e);
        if (Vec.mag(v) > 1) this.steerTo(Math.atan2(v.y, v.x), dt);

        // Phase 1: far out. Warp through phasing.
        if (dist > 5e3) {
          if (this.game.timeWarpIdx < 4) {
            this.game.timeWarpIdx = 4;
            this.game.timeWarp = TIME_WARP_LEVELS[4];
          }
          // Real Soyuz phasing takes ~6 hours. After a substantial wait, if
          // the craft's orbit is close to ISS altitude (same period), they'd
          // never catch up in reality. We approximate the phasing burns by
          // snapping the ISS into close proximity after a fixed warped wait.
          if (!this.rendezvousStart) this.rendezvousStart = c.missionTime;
          const elapsed = c.missionTime - this.rendezvousStart;
          if (elapsed > 3 * 3600) {
            // "Completed" the phasing: approximate the 4-orbit fast-rendezvous
            // by snapping the craft onto ISS with matching velocity. Real
            // Soyuz does ~6 hours of burns to achieve this; we fast-forward.
            c.pos.x = iss.pos.x - 50;          // 50 m behind ISS
            c.pos.y = iss.pos.y;
            c.vel.x = iss.vel.x;
            c.vel.y = iss.vel.y;
            this.game.timeWarpIdx = 0;
            this.game.timeWarp = TIME_WARP_LEVELS[0];
            this.callout('auto-iss-close', `${D.callsign}: Phasing complete — closing to docking interface.`, 'go');
          }
          break;
        }

        // Within 5 km — the dock-proximity check in game.js will fire soon.
        this.game.timeWarpIdx = 0;
        this.game.timeWarp = TIME_WARP_LEVELS[0];
        c.throttle = 0;

        if (c.milestones.dockedWithISS) {
          this.autoPhase = 'iss-stay';
          this.stayStart = c.missionTime;
          this.callout('auto-docked', `${D.callsign}: Contact light! Soft dock confirmed with ISS. Welcome to station, Tim.`, 'go');
        }
        break;
      }

      // Short "on ISS" coast before de-orbiting. Real Tim Peake stayed 186
      // days — we do a token few minutes of orbit with warp.
      case 'iss-stay': {
        c.throttle = 0;
        const v = c.velocityRelativeTo(e);
        if (Vec.mag(v) > 1) this.steerTo(Math.atan2(v.y, v.x), dt);
        if (this.game.timeWarpIdx < 4) {
          this.game.timeWarpIdx = 4;
          this.game.timeWarp = TIME_WARP_LEVELS[4];
        }
        if (c.missionTime - (this.stayStart || c.missionTime) > 600) {
          this.game.timeWarpIdx = 0;
          this.game.timeWarp = TIME_WARP_LEVELS[0];
          this.autoPhase = 'deorbit-burn';
          this.callout('auto-iss-leave', `${D.callsign}: Undocking from ISS. Retrograde burn for re-entry — heading home.`, 'go');
        }
        break;
      }

      // ---------- LEO-RETURN missions (Vostok, Falcon 9) ----------
      case 'leo-coast-before-deorbit': {
        c.throttle = 0;
        const v = c.velocityRelativeTo(e);
        if (Vec.mag(v) > 1) this.steerTo(Math.atan2(v.y, v.x), dt);
        // Engage warp for a brief orbital coast — real flights (Gagarin,
        // early Mercury orbital) did ~1 full orbit before re-entry.
        if (this.game.timeWarpIdx < 5) {
          this.game.timeWarpIdx = 5;
          this.game.timeWarp = TIME_WARP_LEVELS[5];
        }
        // Coast timer: wait until we've accumulated ~90 min of orbit
        if (!this.leoCoastStart) this.leoCoastStart = c.missionTime;
        if (c.missionTime - this.leoCoastStart > this.autoOrbitCoastSec) {
          this.game.timeWarpIdx = 0;
          this.game.timeWarp = TIME_WARP_LEVELS[0];
          this.autoPhase = 'deorbit-burn';
          this.callout('auto-deorbit', `${D.callsign}: Retrograde burn — de-orbiting for splashdown.`, 'go');
        }
        break;
      }

      case 'deorbit-burn': {
        // Burn retrograde to drop periapsis into the atmosphere
        const v = c.velocityRelativeTo(e);
        if (Vec.mag(v) > 1) this.steerTo(Math.atan2(v.y, v.x) + Math.PI, dt);
        c.throttle = 1.0;
        if (c.periE !== null && c.periE < 40e3) {
          c.throttle = 0;
          this.autoPhase = 'reentry-prep';
          this.callout('auto-deorbit-cut', `${D.callsign}: De-orbit burn complete. Falling into the atmosphere.`, 'go');
        }
        break;
      }

      // ---------- Re-entry (all missions that return) ----------
      case 'reentry-prep': {
        // Stage down to capsule only — lower stages have no heat shield
        while (!c.isCapsuleOnly() && c.activeStageIdx < c.stages.length) {
          c.separate();
        }
        // Point heat shield retrograde (opposite to velocity)
        const v = c.velocityRelativeTo(e);
        if (Vec.mag(v) > 1) this.steerTo(Math.atan2(v.y, v.x) + Math.PI, dt);
        c.throttle = 0;
        // High warp while coasting toward the atmosphere
        if (altE > ATMOSPHERE_HEIGHT + 5e3) {
          if (this.game.timeWarpIdx < 4) {
            this.game.timeWarpIdx = 4;
            this.game.timeWarp = TIME_WARP_LEVELS[4];
          }
        } else {
          // Atmosphere interface reached — drop warp and transition
          this.game.timeWarpIdx = 0;
          this.game.timeWarp = TIME_WARP_LEVELS[0];
          this.autoPhase = 'reentry';
          this.callout('auto-entry-iface', `${D.callsign}: Re-entry interface. Heat shield forward.`, 'warn');
        }
        break;
      }

      case 'reentry': {
        c.throttle = 0;
        const v = c.velocityRelativeTo(e);
        const vMag = Vec.mag(v);
        const isShuttle = c.capsule.shape === 'shuttle-orbiter';

        if (isShuttle && vMag > 1) {
          // Shuttle re-entry: hold a moderate AoA so the belly heats but lift
          // doesn't push us back out of the atmosphere. Real Shuttle does
          // ~40° AoA hypersonic for thermal protection — we use lower values
          // because our 2D physics is more drag-sensitive than the real
          // hypersonic flow regime.
          const progradeAng = Math.atan2(v.y, v.x);
          const up = Vec.norm(Vec.sub(c.pos, e.pos));
          const upAng = Math.atan2(up.y, up.x);
          let pitch = normAngle(upAng - progradeAng);
          // Real Shuttle holds 40° AoA from 122 km down to ~25 km, then
          // pitches over for the sub-sonic glide. High AoA = belly into
          // airflow = thermal protection works AND huge drag bleeds energy.
          let aoaDeg;
          if (altE > 60e3) aoaDeg = 40;                   // hypersonic — max belly drag
          else if (altE > 25e3) aoaDeg = 30;              // continued belly heating
          else if (altE > 10e3) aoaDeg = 15;              // pitch over for glide
          else if (altE > 2e3) aoaDeg = 7;                // shallow glide
          else aoaDeg = 0;                                // level for runway
          const aoaRad = aoaDeg * Math.PI / 180 * Math.sign(pitch || 1);
          this.steerTo(progradeAng + aoaRad, dt);
        } else if (vMag > 1) {
          // Capsule: heat shield retrograde throughout the hot phase
          this.steerTo(Math.atan2(v.y, v.x) + Math.PI, dt);
        }

        // Warp while coasting to the atmosphere, drop to 1× once inside
        if (altE > ATMOSPHERE_HEIGHT + 5e3) {
          if (this.game.timeWarpIdx < 4) {
            this.game.timeWarpIdx = 4;
            this.game.timeWarp = TIME_WARP_LEVELS[4];
          }
        } else if (this.game.timeWarpIdx > 0) {
          this.game.timeWarpIdx = 0;
          this.game.timeWarp = TIME_WARP_LEVELS[0];
        }

        // Parachutes — only for capsules, not the Shuttle (it lands on a runway)
        if (!isShuttle && !c.capsule.parachutesDeployed && !c.capsule.parachuteRipped) {
          if (altE < c.capsule.parachuteAlt * 1.5 && vMag < 350) {
            const r = c.deployParachutes();
            if (r.ok) this.callout('auto-chutes', `${D.callsign}: Parachutes deployed.`, 'go');
          }
        }
        // Runway-landing callout for the Shuttle as it nears touchdown
        if (isShuttle && altE < 5e3 && !this.fired.has('auto-runway')) {
          this.callout('auto-runway', `${D.callsign}: On final approach. Runway 23 in sight. Main gear down.`, 'go');
        }
        // Once landed or near surface, hand over
        if (c.landed || altE < 200) {
          this.autoPhase = 'orbit-handover';
          this.mode = 'assist';
        }
        break;
      }

      case 'orbit-handover':
      default:
        break;
    }
  }

  // Steer the craft toward a target world-frame angle. Sets c.targetAngle
  // so that craft.update runs the P-controller every physics substep — this
  // is what makes steering stable at high time-warp.
  steerTo(targetAngle, dt) {
    const c = this.game.craft;
    c.targetAngle = targetAngle;
    c.sasMode = 'free';
  }
}

function formatHoustonFeed(feed) {
  if (!feed || feed.length === 0) return '';
  return feed.map(item => {
    const mins = Math.floor(item.t / 60);
    const secs = Math.floor(item.t % 60).toString().padStart(2, '0');
    return `<div class="capcom-row capcom-${item.type}"><span class="capcom-time">T+${mins}:${secs}</span> ${item.text}</div>`;
  }).join('');
}
