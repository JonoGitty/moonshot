// =============================================================================
// missions.js — per-ship mission plans for the Houston Watchdog.
//
// One MissionPlan per stock ship, hand-translated from docs/missions/<ship>.md.
// Each plan registers itself on window.MISSION_PLANS so watchdog.reset(shipKey)
// can pick up the right checks at flight start.
//
// At v0.7.0-rc1 each mission registers a flat `checks` array; the watchdog
// runs them every substep alongside the standardChecks. Checks can gate on
// `state.phase` to scope themselves to a specific autopilot state.
//
// Constants used by triggerWhen are pulled from constants.js (loaded earlier
// in index.html script order). MOON_DISTANCE / MOON_RADIUS / MOON_SOI are
// available as globals.
// =============================================================================

(function () {
  const PLANS = {};

  // ---------------------------------------------------------------------------
  // Saturn V / Apollo 11 — full lunar landing + return
  // ---------------------------------------------------------------------------
  PLANS.saturn5 = {
    shipKey: 'saturn5',
    missionName: 'Apollo 11',
    realFlight: {
      date: '1969-07-16 13:32:00 UT',
      crew: ['Armstrong (CDR)', 'Aldrin (LMP)', 'Collins (CMP)'],
      vehicle: 'Saturn V SA-506',
      goal: 'Land on the Moon and return crew alive',
      sources: ['Apollo 11 Mission Report (NASA MR-7)', 'Apollo 11 Press Kit (1969)'],
    },
    checks: [
      // TLI underburn — apoE didn't reach Moon distance
      {
        id: 'saturn5/tli-underburn',
        severity: 'moderate',
        cooldownSec: 120,
        triggerWhen: (s) =>
          /trans-lunar/.test(s.phase) && s.apoE != null
          && s.apoE < (typeof MOON_DISTANCE !== 'undefined' ? MOON_DISTANCE : 3.84e8) * 0.95,
        action: {
          type: 'callout',
          message: 'Watchdog: TLI underburn detected — apo short of Moon distance. MCC-1 prograde trim required.',
        },
      },
      // TLI overburn — apoE significantly past Moon
      {
        id: 'saturn5/tli-overburn',
        severity: 'minor',
        cooldownSec: 120,
        triggerWhen: (s) =>
          /trans-lunar/.test(s.phase) && s.apoE != null
          && s.apoE > (typeof MOON_DISTANCE !== 'undefined' ? MOON_DISTANCE : 3.84e8) * 1.15,
        action: {
          type: 'callout',
          message: 'Watchdog: TLI overburn — apo significantly past Moon. Minor MCC-1 retrograde trim recommended.',
        },
      },
      // LOI undershoot — predicted perilune too distant for clean capture
      {
        id: 'saturn5/loi-undershoot',
        severity: 'moderate',
        cooldownSec: 60,
        triggerWhen: (s) =>
          /loi-approach/.test(s.phase) && s.predicted && s.predicted.perilune != null
          && s.predicted.perilune > 200e3,
        action: {
          type: 'callout',
          message: 'Watchdog: LOI undershoot — predicted perilune > 200 km, capture will be wide. Increase LOI Δv.',
        },
      },
      // LOI overshoot — perilune too low (lithobraking risk)
      {
        id: 'saturn5/loi-overshoot',
        severity: 'major',
        cooldownSec: 60,
        triggerWhen: (s) =>
          /loi-approach|loi-burn/.test(s.phase) && s.predicted && s.predicted.perilune != null
          && s.predicted.perilune < 20e3 && s.predicted.perilune > -1e9,
        action: {
          type: 'callout',
          message: 'Watchdog: LOI perilune below 20 km — lithobraking risk. Pre-LOI dodge required.',
        },
      },
      // Descent too steep — vRadial dropping fast at low altitude
      {
        id: 'saturn5/descent-too-steep',
        severity: 'major',
        cooldownSec: 10,
        triggerWhen: (s) =>
          s.phase === 'lunar-descent' && s.altM < 5e3 && s.vRadial < -100 && s.throttle > 0.95,
        action: {
          type: 'callout',
          message: 'Watchdog: descent too steep — vRadial < -100 m/s at < 5 km altM with full throttle. Abort to ascent profile.',
        },
      },
      // Descent too shallow
      {
        id: 'saturn5/descent-too-shallow',
        severity: 'minor',
        cooldownSec: 30,
        triggerWhen: (s) =>
          s.phase === 'lunar-descent' && s.altM > 8e3 && s.vRadial > -1 && s.throttle > 0.95,
        action: {
          type: 'drop-warp',
          cap: 1,                     // 2× — give the descent profile time to correct
          reason: 'descent shallow — autopilot needs time to correct',
        },
      },
      // TEI shallow — predicted Earth reentry angle too shallow
      {
        id: 'saturn5/tei-shallow',
        severity: 'moderate',
        cooldownSec: 120,
        triggerWhen: (s) =>
          /tei|trans-earth/.test(s.phase) && s.predicted && s.predicted.reentryAngle != null
          && s.predicted.reentryAngle > -0.07,    // > -4°
        action: {
          type: 'callout',
          message: 'Watchdog: predicted reentry angle shallower than -4° — skip-out risk, MCC retrograde trim required.',
        },
      },
      // TEI steep
      {
        id: 'saturn5/tei-steep',
        severity: 'moderate',
        cooldownSec: 120,
        triggerWhen: (s) =>
          /tei|trans-earth/.test(s.phase) && s.predicted && s.predicted.reentryAngle != null
          && s.predicted.reentryAngle < -0.14,    // < -8°
        action: {
          type: 'callout',
          message: 'Watchdog: predicted reentry angle steeper than -8° — high-g entry, MCC prograde trim recommended.',
        },
      },
    ],
  };

  // ---------------------------------------------------------------------------
  // SLS / Artemis I — DRO + return (we model as low lunar orbit per design doc)
  // ---------------------------------------------------------------------------
  PLANS.sls = {
    shipKey: 'sls',
    missionName: 'Artemis I',
    realFlight: {
      date: '2022-11-16 06:47:44 UT',
      crew: ['Uncrewed (Commander Moonikin Campos)'],
      vehicle: 'SLS Block 1 + Orion',
      goal: 'Uncrewed shakedown to lunar Distant Retrograde Orbit and return',
      sources: ['Artemis I Reference Mission (NASA SLS-PLAN-RPT-2018-0023)'],
    },
    checks: [
      // Same TLI / LOI / TEI patterns as Saturn V — Artemis I follows similar
      // physics envelope, just with Orion instead of CSM. Reuse Saturn V check
      // ids namespaced under sls/.
      {
        id: 'sls/tli-underburn',
        severity: 'moderate',
        cooldownSec: 120,
        triggerWhen: (s) =>
          /trans-lunar/.test(s.phase) && s.apoE != null
          && s.apoE < (typeof MOON_DISTANCE !== 'undefined' ? MOON_DISTANCE : 3.84e8) * 0.97,
        action: {
          type: 'callout',
          message: 'Watchdog: ICPS TLI underburn — Orion apo short of Moon distance. MCC-1 prograde required.',
        },
      },
      {
        id: 'sls/loi-overshoot',
        severity: 'major',
        cooldownSec: 60,
        triggerWhen: (s) =>
          /loi-approach|loi-burn/.test(s.phase) && s.predicted && s.predicted.perilune != null
          && s.predicted.perilune < 30e3 && s.predicted.perilune > -1e9,
        action: {
          type: 'callout',
          message: 'Watchdog: predicted Orion perilune below 30 km — pre-LOI dodge required.',
        },
      },
      {
        id: 'sls/tei-shallow',
        severity: 'moderate',
        cooldownSec: 120,
        triggerWhen: (s) =>
          /tei|trans-earth/.test(s.phase) && s.predicted && s.predicted.reentryAngle != null
          && s.predicted.reentryAngle > -0.07,
        action: {
          type: 'callout',
          message: 'Watchdog: Orion reentry angle too shallow for skip-entry profile — MCC retrograde trim.',
        },
      },
    ],
  };

  // ---------------------------------------------------------------------------
  // Artemis II — free-return flyby (NO LOI burn)
  // ---------------------------------------------------------------------------
  PLANS.artemis2 = {
    shipKey: 'artemis2',
    missionName: 'Artemis II',
    realFlight: {
      date: '2026-04-03 21:00 UT (planned)',
      crew: ['Wiseman (CDR)', 'Glover (PLT)', 'Koch (MS1)', 'Hansen (MS2, CSA)'],
      vehicle: 'SLS Block 1 + Orion',
      goal: 'Crewed lunar free-return flyby — first humans beyond LEO since 1972',
      sources: ['Artemis II Press Kit (NASA, 2024)', 'Artemis II Reference Mission (NASA, 2023)'],
    },
    checks: [
      // TLI not free-return — perilune outside [3000, 15000] km window
      {
        id: 'artemis2/tli-not-free-return',
        severity: 'moderate',
        cooldownSec: 120,
        triggerWhen: (s) =>
          /trans-lunar|lunar-flyby/.test(s.phase) && s.predicted && s.predicted.perilune != null
          && (s.predicted.perilune < 3e6 || s.predicted.perilune > 15e6)
          && s.predicted.perilune > -1e9,    // not lithobraking
        action: {
          type: 'callout',
          message: 'Watchdog: TLI free-return aim off — predicted perilune outside [3 000, 15 000] km. MCC trim required.',
        },
      },
      // Perilune too close — lithobraking imminent
      {
        id: 'artemis2/perilune-too-low',
        severity: 'abort',
        cooldownSec: 30,
        triggerWhen: (s) =>
          /trans-lunar|lunar-flyby/.test(s.phase) && s.predicted && s.predicted.perilune != null
          && s.predicted.perilune < 1e6 && s.predicted.perilune > -1e9,
        action: {
          type: 'callout',
          message: 'Watchdog: perilune below 1 000 km — emergency dodge (radial-out) before SOI entry.',
        },
      },
      // Accidentally captured — Orion shouldn't be in lunar orbit on free-return
      {
        id: 'artemis2/accidentally-captured',
        severity: 'abort',
        cooldownSec: 60,
        triggerWhen: (s) =>
          /lunar-flyby/.test(s.phase) && s.apoM != null
          && s.apoM < (typeof MOON_SOI !== 'undefined' ? MOON_SOI : 6.61e7),
        action: {
          type: 'callout',
          message: 'Watchdog: Orion captured by Moon — free-return geometry lost. Fire prograde escape burn.',
        },
      },
    ],
  };

  // ---------------------------------------------------------------------------
  // Soyuz TMA-19M — fast-rendezvous + ISS dock + ballistic re-entry
  // ---------------------------------------------------------------------------
  PLANS.soyuz = {
    shipKey: 'soyuz',
    missionName: 'Soyuz TMA-19M Principia',
    realFlight: {
      date: '2015-12-15 11:03:09 UT',
      crew: ['Malenchenko (CDR)', 'Peake (FE-1, ESA)', 'Kopra (FE-2, NASA)'],
      vehicle: 'Soyuz-FG / Soyuz TMA-19M',
      goal: '6-hour fast-rendezvous to ISS, 186-day expedition, ballistic re-entry',
      sources: ['Soyuz Crew Operations Manual', 'NASA ISS Expedition 46/47'],
    },
    checks: [
      // Approach too fast — closing > 5 m/s within 100 m of ISS
      {
        id: 'soyuz/dock-approach-too-fast',
        severity: 'major',
        cooldownSec: 30,
        triggerWhen: (s) => {
          if (!/iss-rendezvous/.test(s.phase)) return false;
          // We don't have ISS distance in the snapshot directly; use vRadial as proxy.
          // Real check: closing rate > 5 m/s while within 100 m of ISS.
          // For now: warn if vRadial > 5 in rendezvous phase (proxy for closing too fast).
          return Math.abs(s.vRadial) > 5 && /iss-rendezvous/.test(s.phase);
        },
        action: {
          type: 'callout',
          message: 'Watchdog: closing rate exceeds 5 m/s — brake retrograde, reapproach.',
        },
      },
      // Module-sep failure (the historic Soyuz/Vostok anomaly)
      {
        id: 'soyuz/module-sep-failure',
        severity: 'major',
        cooldownSec: 30,
        triggerWhen: (s) =>
          s.phase === 'reentry' && s.altE < 122e3 && !s.isCapsule,
        action: {
          type: 'callout',
          message: 'Watchdog: module-sep failure — service module not separated by atmospheric interface. Force separate.',
        },
      },
      // Deorbit underburn
      {
        id: 'soyuz/deorbit-undershoot',
        severity: 'moderate',
        cooldownSec: 60,
        triggerWhen: (s) =>
          /deorbit/.test(s.phase) && s.thrusting === false && s.periE != null && s.periE > 100e3
          && s.altE < 350e3,
        action: {
          type: 'callout',
          message: 'Watchdog: deorbit underburn — peri above 100 km, atmosphere not engaged. Re-fire retrograde.',
        },
      },
    ],
  };

  // ---------------------------------------------------------------------------
  // STS-1 Columbia — runway landing
  // ---------------------------------------------------------------------------
  PLANS.shuttle = {
    shipKey: 'shuttle',
    missionName: 'STS-1 Columbia',
    realFlight: {
      date: '1981-04-12 12:00:04 UT',
      crew: ['Young (CDR)', 'Crippen (PLT)'],
      vehicle: 'Space Shuttle (OV-102 Columbia)',
      goal: 'First orbital flight of the Space Shuttle system',
      sources: ['STS-1 Mission Report (NASA JSC-17414)'],
    },
    checks: [
      // OMS fuel marginal — Shuttle has tight Δv budget (330 m/s total)
      {
        id: 'shuttle/oms-fuel-marginal',
        severity: 'moderate',
        cooldownSec: 60,
        triggerWhen: (s) =>
          s.isCapsule && s.fuelFrac < 0.25 && /orbit-coast|deorbit/.test(s.phase),
        action: {
          type: 'callout',
          message: 'Watchdog: OMS fuel below 25 % — bring deorbit forward, no margin for missed burn.',
        },
      },
      // Reentry too steep for shuttle (-3° threshold, vs -8° for capsule)
      {
        id: 'shuttle/reentry-too-steep',
        severity: 'major',
        cooldownSec: 30,
        triggerWhen: (s) =>
          /reentry/.test(s.phase) && s.altE < 130e3 && s.predicted
          && s.predicted.reentryAngle != null && s.predicted.reentryAngle < -0.052,    // -3°
        action: {
          type: 'callout',
          message: 'Watchdog: Shuttle entry angle steeper than -3° — high heat load, lift-vector up to bleed less.',
        },
      },
    ],
  };

  // ---------------------------------------------------------------------------
  // Falcon 9 / Crew-1 — LEO-return (sim divergence: real Crew-1 docked ISS)
  // ---------------------------------------------------------------------------
  PLANS.falcon9 = {
    shipKey: 'falcon9',
    missionName: 'Crew-1 / Resilience',
    realFlight: {
      date: '2020-11-16 00:27:17 UT',
      crew: ['Hopkins (CDR)', 'Glover (PLT)', 'Walker (MS)', 'Noguchi (MS, JAXA)'],
      vehicle: 'Falcon 9 Block 5 + Dragon 2',
      goal: 'First operational crewed SpaceX flight (sim: LEO-return only)',
      sources: ['SpaceX Crew-1 Press Kit (2020)'],
    },
    checks: [
      // SECO underburn
      {
        id: 'falcon9/seco-underburn',
        severity: 'moderate',
        cooldownSec: 60,
        triggerWhen: (s) =>
          /orbit-coast/.test(s.phase) && s.apoE != null && s.apoE < 380e3
          && s.thrusting === false,
        action: {
          type: 'callout',
          message: 'Watchdog: Stage 2 underburn — apo below 380 km, Dragon trim required.',
        },
      },
      // Trunk sep failure
      {
        id: 'falcon9/trunk-sep-failure',
        severity: 'major',
        cooldownSec: 30,
        triggerWhen: (s) =>
          s.phase === 'reentry' && s.altE < 100e3 && !s.isCapsule,
        action: {
          type: 'callout',
          message: 'Watchdog: Dragon trunk did not separate — force-stage now.',
        },
      },
    ],
  };

  // ---------------------------------------------------------------------------
  // Vostok 1 / Gagarin — 1 orbit, ballistic, the historic module-sep
  // ---------------------------------------------------------------------------
  PLANS.vostok = {
    shipKey: 'vostok',
    missionName: 'Vostok 1 — Poyekhali!',
    realFlight: {
      date: '1961-04-12 06:07:00 UT',
      crew: ['Yuri Gagarin (first human in space)'],
      vehicle: 'Vostok-K (8K72K) / Vostok 3KA',
      goal: 'First human spaceflight — single orbit, ballistic re-entry',
      sources: ['Soviet Manned Space Programme (Asif Siddiqi)', 'Vostok 1 declassified mission report'],
    },
    checks: [
      // TDU underburn — CANNOT RETRY (only 155 m/s of Δv)
      {
        id: 'vostok/tdu-underburn',
        severity: 'major',
        cooldownSec: 60,
        triggerWhen: (s) =>
          /deorbit/.test(s.phase) && s.thrusting === false && s.periE != null && s.periE > 100e3
          && s.altE < 350e3,
        action: {
          type: 'callout',
          message: 'Watchdog: TDU-1 underburn — peri above 100 km. Vostok cannot retry; 10-day decay backup engaged (callout only).',
        },
      },
      // Module-sep failure (the famous Vostok 1 incident)
      {
        id: 'vostok/module-sep-failure',
        severity: 'major',
        cooldownSec: 30,
        triggerWhen: (s) =>
          s.phase === 'reentry' && s.altE < 122e3 && !s.isCapsule,
        action: {
          type: 'callout',
          message: 'Watchdog: Vostok 1 anomaly — module sep failed, force separate before plasma blackout.',
        },
      },
    ],
  };

  // ---------------------------------------------------------------------------
  // Mercury / Freedom 7 — suborbital
  // ---------------------------------------------------------------------------
  PLANS.mercury = {
    shipKey: 'mercury',
    missionName: 'Freedom 7',
    realFlight: {
      date: '1961-05-05 14:34:13 UT',
      crew: ['Alan Shepard'],
      vehicle: 'Mercury-Redstone (MR-3)',
      goal: 'First American in space — 15-minute suborbital arc',
      sources: ['Mercury-Redstone 3 Postlaunch Report (NASA MSC-MR-3-67)'],
    },
    checks: [
      // Apex too low
      {
        id: 'mercury/apex-too-low',
        severity: 'minor',
        cooldownSec: 60,
        triggerWhen: (s) =>
          /ascent/.test(s.phase) && s.altE > 100e3 && s.vRadial < 50 && s.altE < 150e3
          && !s.thrusting,
        action: {
          type: 'callout',
          message: 'Watchdog: apex tracking below 150 km — less weightless time, mission still survivable.',
        },
      },
      // Apex too high
      {
        id: 'mercury/apex-too-high',
        severity: 'moderate',
        cooldownSec: 60,
        triggerWhen: (s) =>
          /ascent/.test(s.phase) && s.altE > 250e3 && s.vRadial < 50 && !s.thrusting,
        action: {
          type: 'callout',
          message: 'Watchdog: apex above 250 km — steeper return entry, peak g will exceed nominal.',
        },
      },
    ],
  };

  // ---------------------------------------------------------------------------
  // Sputnik 1 — orbit-only beacon (no return)
  // ---------------------------------------------------------------------------
  PLANS.sputnik = {
    shipKey: 'sputnik',
    missionName: 'Sputnik 1',
    realFlight: {
      date: '1957-10-04 19:28:34 UT',
      crew: ['Uncrewed (83.6 kg radio beacon)'],
      vehicle: 'R-7 (8K71PS variant)',
      goal: 'First artificial satellite — reach orbit, transmit beep',
      sources: ['Sputnik and the Soviet Space Challenge (Asif Siddiqi)'],
    },
    checks: [
      // Apo shortfall — orbit too low for 91-day broadcast lifetime
      {
        id: 'sputnik/apo-shortfall',
        severity: 'moderate',
        cooldownSec: 60,
        triggerWhen: (s) =>
          /orbit-coast/.test(s.phase) && s.apoE != null && s.apoE < 700e3
          && s.milestones.reachedOrbit,
        action: {
          type: 'callout',
          message: 'Watchdog: apo below 700 km — orbit will decay in weeks, not months.',
        },
      },
      // Sub-orbital — failed to reach orbit
      {
        id: 'sputnik/suborbital',
        severity: 'major',
        cooldownSec: 60,
        triggerWhen: (s) =>
          /orbit-coast|reentry/.test(s.phase) && s.periE != null && s.periE < 0
          && !s.milestones.reachedOrbit,
        action: {
          type: 'callout',
          message: 'Watchdog: Sputnik failed to reach orbit — peri below surface. Mission failed.',
        },
      },
    ],
  };

  // Register on global so watchdog.reset(shipKey) can pick them up
  if (typeof window !== 'undefined') {
    window.MISSION_PLANS = PLANS;
  } else if (typeof globalThis !== 'undefined') {
    globalThis.MISSION_PLANS = PLANS;
  }
})();
