// =============================================================================
// planner.js — real-physics mission planner.
//
// Computes:
//   1. Δv budget per phase from real orbital mechanics.
//   2. Available Δv per rocket via Tsiolkovsky over each stage.
//   3. Burn schedule: when, how long, what direction, what Δv.
//   4. Feasibility: does the rocket have enough Δv (with margin)?
//
// All values SI. No hand-waving.
// =============================================================================

// Mission catalog. Each entry computes its Δv budget from physics, given
// orbital params the player chooses.
const MISSION_CATALOG = {
  leo: {
    name: 'Low Earth Orbit',
    description: 'Circular orbit at chosen altitude. Re-entry + splashdown after one orbit.',
    params: [
      { key: 'altitude', label: 'Orbit altitude (km)', default: 400, min: 200, max: 2000 },
    ],
    dvBudget(p) {
      const r = EARTH_RADIUS + p.altitude * 1000;
      const vCirc = Math.sqrt(EARTH_MU / r);                // m/s
      // Real launch from KSC to LEO needs ~9.4 km/s including 1.5 km/s losses.
      const launchDv = vCirc + 1500;
      // De-orbit burn ~90 m/s to drop peri to ~70 km.
      const deorbitDv = 90;
      return [
        { phase: 'Launch + ascent to LEO', dv: launchDv, dir: 'prograde', target: `${p.altitude} km circular` },
        { phase: 'Coast 1 orbit',           dv: 0,         dir: '',          target: '~90 min' },
        { phase: 'De-orbit burn',           dv: deorbitDv, dir: 'retrograde', target: 'peri 70 km' },
        { phase: 'Re-entry + splashdown',   dv: 0,         dir: '',          target: '0g aerobrake' },
      ];
    },
  },

  iss: {
    name: 'ISS Rendezvous + Dock',
    description: 'Catch + dock with the International Space Station (408 km, 51.6°). Return after 6h.',
    params: [],
    dvBudget(p) {
      const issAlt = 408e3;
      const r = EARTH_RADIUS + issAlt;
      const vCirc = Math.sqrt(EARTH_MU / r);
      const launchDv = vCirc + 1500;
      // Phasing burns to close on ISS — real Soyuz fast-rendezvous uses ~30 m/s
      const phasingDv = 30;
      const deorbitDv = 90;
      return [
        { phase: 'Launch + ascent to LEO',  dv: launchDv,  dir: 'prograde',   target: 'ISS altitude (408 km)' },
        { phase: 'Phasing burns',           dv: phasingDv, dir: 'prograde',   target: 'Close on ISS' },
        { phase: 'Final approach + dock',   dv: 5,         dir: 'mixed',      target: '< 0.1 m/s rel' },
        { phase: 'On-orbit stay',           dv: 0,         dir: '',           target: '6 hours' },
        { phase: 'Undock + de-orbit',       dv: deorbitDv, dir: 'retrograde', target: 'peri 70 km' },
        { phase: 'Re-entry + splashdown',   dv: 0,         dir: '',           target: '0g aerobrake' },
      ];
    },
  },

  moonFlyby: {
    name: 'Free-Return Lunar Flyby',
    description: 'TLI to coast past the Moon, gravity slingshot brings you home (Apollo 13 style).',
    params: [
      { key: 'parkingAlt', label: 'Parking orbit (km)', default: 200, min: 180, max: 400 },
    ],
    dvBudget(p) {
      const r0 = EARTH_RADIUS + p.parkingAlt * 1000;
      const vPark = Math.sqrt(EARTH_MU / r0);
      const launchDv = vPark + 1500;
      // TLI: raise apo to ~Moon distance from parking orbit
      const aTrans = (r0 + MOON_DISTANCE) / 2;
      const vPeri = Math.sqrt(EARTH_MU * (2 / r0 - 1 / aTrans));
      const tliDv = vPeri - vPark;
      return [
        { phase: 'Launch + ascent',    dv: launchDv, dir: 'prograde',   target: `${p.parkingAlt} km parking` },
        { phase: 'Coast for TLI window', dv: 0,       dir: '',           target: '~2-3 hours' },
        { phase: 'TLI burn',           dv: tliDv,    dir: 'prograde',   target: 'Apo ≈ Moon distance' },
        { phase: 'Trans-lunar coast',  dv: 0,        dir: '',           target: '~3 days' },
        { phase: 'Lunar flyby',        dv: 0,        dir: '',           target: 'Gravity slingshot home' },
        { phase: 'Trans-Earth coast',  dv: 0,        dir: '',           target: '~3 days' },
        { phase: 'Re-entry + splashdown', dv: 0,    dir: '',           target: '11 km/s entry' },
      ];
    },
  },

  moonOrbit: {
    name: 'Lunar Orbit + Return (Artemis I-style)',
    description: 'TLI, LOI to capture into lunar orbit, coast, TEI to leave, splash back home.',
    params: [
      { key: 'parkingAlt',  label: 'Parking orbit (km)', default: 200, min: 180, max: 400 },
      // Min 30 km — lunar mountains reach ~10 km above mean radius and gravity
      // anomalies (mascons) destabilise orbits below ~50 km.
      { key: 'lunarAlt',    label: 'Lunar orbit alt (km, min 30)', default: 110, min: 30, max: 10000 },
      { key: 'lunarOrbits', label: 'Lunar orbits', default: 3, min: 1, max: 30 },
    ],
    dvBudget(p) {
      const r0 = EARTH_RADIUS + p.parkingAlt * 1000;
      const vPark = Math.sqrt(EARTH_MU / r0);
      const launchDv = vPark + 1500;
      const aTrans = (r0 + MOON_DISTANCE) / 2;
      const vPeri = Math.sqrt(EARTH_MU * (2 / r0 - 1 / aTrans));
      const tliDv = vPeri - vPark;
      // LOI: Approaching Moon at velocity v_inf, capture into circular orbit at lunarAlt
      const rL = MOON_RADIUS + p.lunarAlt * 1000;
      const vMoonOrbit = Math.sqrt(MOON_MU / rL);
      // Approach v_inf: roughly Moon's orbital v relative to transfer orbit
      const vAtMoonInTransfer = Math.sqrt(EARTH_MU * (2 / MOON_DISTANCE - 1 / aTrans));
      const vInf = Math.abs(MOON_ORBITAL_V - vAtMoonInTransfer);
      const vAtPeri = Math.sqrt(vInf * vInf + 2 * MOON_MU / rL);
      const loiDv = vAtPeri - vMoonOrbit;
      // TEI: reverse — leave lunar orbit back into transfer
      const teiDv = vAtPeri - vMoonOrbit;        // symmetric
      return [
        { phase: 'Launch + ascent',        dv: launchDv, dir: 'prograde',   target: `${p.parkingAlt} km parking` },
        { phase: 'Coast for TLI window',   dv: 0,        dir: '',           target: '~2-3 hours' },
        { phase: 'TLI burn',               dv: tliDv,    dir: 'prograde',   target: 'Apo ≈ Moon distance' },
        { phase: 'Trans-lunar coast',      dv: 0,        dir: '',           target: '~3 days' },
        { phase: 'LOI burn',               dv: loiDv,    dir: 'retrograde', target: `${p.lunarAlt} km lunar orbit` },
        { phase: `${p.lunarOrbits} lunar orbits`, dv: 0, dir: '',          target: `~${(p.lunarOrbits * 2).toFixed(1)} hours` },
        { phase: 'TEI burn',               dv: teiDv,    dir: 'prograde',   target: 'Leave Moon' },
        { phase: 'Trans-Earth coast',      dv: 0,        dir: '',           target: '~3 days' },
        { phase: 'Re-entry + splashdown',  dv: 0,        dir: '',           target: '11 km/s entry' },
      ];
    },
  },

  moonLand: {
    name: 'Lunar Landing + Return (Apollo 11-style)',
    description: 'Full Apollo: TLI, LOI, descend to surface, ascend, rendezvous, TEI, return.',
    params: [
      { key: 'parkingAlt',  label: 'Parking orbit (km)', default: 200, min: 180, max: 400 },
      { key: 'lunarAlt',    label: 'Lunar orbit alt (km)', default: 110, min: 100, max: 300 },
      { key: 'staySec',     label: 'Surface stay (sec)', default: 60, min: 30, max: 600 },
    ],
    dvBudget(p) {
      const orbit = MISSION_CATALOG.moonOrbit.dvBudget({ parkingAlt: p.parkingAlt, lunarAlt: p.lunarAlt, lunarOrbits: 2 });
      // Descent: from circular lunar orbit at lunarAlt down to surface
      // Real Apollo DPS Δv ≈ 1.85 km/s (de-orbit + powered descent).
      const descentDv = 1850;
      const ascentDv  = 1850;
      // Insert a descent + stay + ascent into the orbit budget before TEI
      const out = [];
      for (const ph of orbit) {
        out.push(ph);
        if (ph.phase.includes('lunar orbits')) {
          out.push({ phase: 'CSM/LM undock + DOI',   dv: 23,         dir: 'retrograde', target: 'Lower peri' });
          out.push({ phase: 'Powered descent (PDI)', dv: descentDv,  dir: 'retrograde', target: 'Tranquility Base' });
          out.push({ phase: `Surface stay`,          dv: 0,          dir: '',           target: `${p.staySec} s game time` });
          out.push({ phase: 'LM ascent',             dv: ascentDv,   dir: 'prograde',   target: '88 × 18 km orbit' });
          out.push({ phase: 'Rendezvous + dock CSM', dv: 30,         dir: 'mixed',      target: 'Match orbit' });
          out.push({ phase: 'LM jettison' });
        }
      }
      return out;
    },
  },

  geo: {
    name: 'Geostationary Transfer (GTO + circularize)',
    description: 'Park in LEO, then Hohmann transfer to GEO. No return.',
    params: [],
    dvBudget(p) {
      const rPark = EARTH_RADIUS + 200e3;
      const rGeo = 42164e3;                           // GEO radius
      const vPark = Math.sqrt(EARTH_MU / rPark);
      const vGeo = Math.sqrt(EARTH_MU / rGeo);
      const aT = (rPark + rGeo) / 2;
      const vTransPeri = Math.sqrt(EARTH_MU * (2 / rPark - 1 / aT));
      const vTransApo  = Math.sqrt(EARTH_MU * (2 / rGeo - 1 / aT));
      const launchDv = vPark + 1500;
      const gtoBurn = vTransPeri - vPark;
      const circBurn = vGeo - vTransApo;
      return [
        { phase: 'Launch + ascent',           dv: launchDv, dir: 'prograde', target: '200 km parking' },
        { phase: 'GTO burn at peri',          dv: gtoBurn,  dir: 'prograde', target: 'Apo at GEO' },
        { phase: 'Coast to apoapsis',         dv: 0,        dir: '',         target: '~5 hours' },
        { phase: 'Circularize at GEO',        dv: circBurn, dir: 'prograde', target: 'GEO 35 786 km' },
      ];
    },
  },
};

// Compute total Δv a rocket can deliver. Sums Tsiolkovsky over each stage,
// using vacuum Isp (assumes the bulk of each stage burns above the atmosphere).
//
// Stage names containing "LM" / "Descent" / "Ascent" trigger Apollo-style
// rendezvous accounting: the LM stages burn solo (without the CSM dead
// weight) because the real CSM undocked into lunar orbit during landing.
// This is what makes Apollo Δv work out — without it the LM ascent module
// would have to lift the entire 30-tonne CSM, which it can't.
function rocketDeltaV(blueprint) {
  const stages = blueprint.stages || [];
  const cap = blueprint.capsule;
  const capWet = (cap.dryMass || 0) + (cap.fuelMass || 0);
  const capDry = cap.dryMass || 0;
  const capIsp = cap.ispVac || cap.isp || 1;

  // Detect Apollo-style: LM Descent + LM Ascent stages present.
  const hasLM = stages.some(s => /LM (Descent|Ascent)/i.test(s.name || ''));

  // Build masses from the bottom up. For Apollo, LM stages don't carry the
  // CSM mass (CSM undocks for the descent + ascent + rendezvous).
  const segs = [];
  let upperMass;
  if (hasLM) {
    // For LM stages, "above" is just the next LM stage (or just LM-ascent
    // alone for the descent stage). CSM mass is excluded from this chain.
    upperMass = 0;       // LM Ascent burns solo
  } else {
    upperMass = capWet;
  }
  for (let i = stages.length - 1; i >= 0; i--) {
    const s = stages[i];
    const isLMStage = /LM (Descent|Ascent)/i.test(s.name || '');
    const wet = (s.dryMass || 0) + (s.fuelMass || 0) + upperMass;
    const dry = (s.dryMass || 0) + upperMass;
    segs.unshift({
      name: s.name,
      wet, dry,
      isp: s.ispVac || s.isp || 1,
      fuel: s.fuelMass,
      isLM: isLMStage,
    });
    upperMass = wet;
    // Once we move out of LM stages back into the main stack, add the CSM
    // mass — main stages DO have to carry the CSM through ascent/TLI/LOI.
    if (hasLM && i > 0 && isLMStage && !/LM (Descent|Ascent)/i.test(stages[i - 1].name || '')) {
      upperMass += capWet;
    }
  }

  let totalDv = 0;
  const breakdown = [];
  for (const s of segs) {
    if (s.wet <= s.dry) continue;
    const dv = s.isp * G0 * Math.log(s.wet / s.dry);
    totalDv += dv;
    breakdown.push({ name: s.name + (s.isLM ? ' (solo, CSM in orbit)' : ''), dv, fuelMass: s.fuel, isp: s.isp });
  }
  // Capsule's own Δv (from cap.fuelMass)
  if (capWet > capDry) {
    const dv = capIsp * G0 * Math.log(capWet / capDry);
    totalDv += dv;
    breakdown.push({ name: cap.name + ' (capsule)', dv, fuelMass: cap.fuelMass, isp: capIsp });
  }
  // Liftoff mass = first stage wet + all stages above + capsule
  let liftoff = capWet;
  for (const s of stages) liftoff += (s.dryMass || 0) + (s.fuelMass || 0);
  return { totalDv, breakdown, liftoffMass: liftoff };
}

// Liftoff TWR — must be > 1 to leave the pad.
function liftoffTWR(blueprint) {
  if (!blueprint.stages || blueprint.stages.length === 0) return 0;
  const s0 = blueprint.stages[0];
  const { liftoffMass } = rocketDeltaV(blueprint);
  return s0.thrust / (liftoffMass * G0);
}

// Plan a mission. Returns:
//   { ok, dvNeeded, dvAvailable, margin, phases, twr, warnings }
function planMission(missionKey, params, shipKey) {
  const mission = MISSION_CATALOG[missionKey];
  const blueprint = SPACECRAFT[shipKey];
  if (!mission || !blueprint) return { ok: false, error: 'Unknown mission or ship' };

  // Fill in defaults for missing params
  const p = {};
  for (const cfg of (mission.params || [])) {
    p[cfg.key] = (params && params[cfg.key] !== undefined) ? params[cfg.key] : cfg.default;
  }

  const phases = mission.dvBudget(p);
  const dvNeeded = phases.reduce((s, ph) => s + (ph.dv || 0), 0);
  const { totalDv: dvAvailable, breakdown, liftoffMass } = rocketDeltaV(blueprint);
  const twr = liftoffTWR(blueprint);

  const warnings = [];
  if (twr < 1.05) warnings.push(`TWR at liftoff is ${twr.toFixed(2)} — under 1.1 means heavy gravity losses or no liftoff`);
  if (dvAvailable < dvNeeded) warnings.push(`Insufficient Δv: needs ${(dvNeeded/1000).toFixed(2)} km/s, have ${(dvAvailable/1000).toFixed(2)} km/s`);
  const margin = dvAvailable - dvNeeded;
  if (margin > 0 && margin < 500) warnings.push(`Δv margin is only ${margin.toFixed(0)} m/s — risky`);

  // Mission-specific sanity checks
  if (missionKey === 'moonOrbit' || missionKey === 'moonLand') {
    if (p.lunarAlt < 30) warnings.push(`Lunar orbit altitude ${p.lunarAlt} km is below safe minimum (30 km) — autopilot will impact`);
    if (p.lunarAlt < 60) warnings.push(`Lunar orbit altitude ${p.lunarAlt} km is below the mascon-stable threshold (~60 km) — orbit will decay`);
  }
  if (missionKey === 'leo' && p.altitude < 200) warnings.push(`LEO altitude ${p.altitude} km is in atmosphere drag zone — orbit will decay rapidly`);
  if (missionKey === 'leo' && p.altitude > 1500) warnings.push(`Above 1500 km is in the Van Allen belts — radiation hazard`);

  return {
    ok: dvAvailable >= dvNeeded && twr >= 1.05,
    mission,
    blueprint,
    paramValues: p,
    phases,
    dvNeeded,
    dvAvailable,
    margin,
    breakdown,
    liftoffMass,
    twr,
    warnings,
    // Map mission to in-game mission type so the autopilot picks the right flow
    missionType: missionTypeFor(missionKey),
    profile: profileFor(missionKey, p),
  };
}

function missionTypeFor(missionKey) {
  switch (missionKey) {
    case 'leo': return 'leo-return';
    case 'iss': return 'iss-dock';
    case 'moonFlyby': return 'moon-orbit';   // flyby uses moon-orbit autopilot path
    case 'moonOrbit': return 'moon-orbit';
    case 'moonLand': return 'moon';
    case 'geo': return 'leo-return';         // no real GEO endgame yet
    default: return 'leo-return';
  }
}

function profileFor(missionKey, p) {
  switch (missionKey) {
    case 'leo':
      return { targetApo: p.altitude * 1000, targetPeri: p.altitude * 1000 - 20e3 };
    case 'iss':
      return { targetApo: 420e3, targetPeri: 408e3 };
    case 'moonFlyby':
      return { targetApo: p.parkingAlt * 1000, targetPeri: p.parkingAlt * 1000 - 20e3, lunarApo: 9000e3, lunarPeri: 7000e3 };
    case 'moonOrbit':
      return { targetApo: p.parkingAlt * 1000, targetPeri: p.parkingAlt * 1000 - 20e3, lunarApo: p.lunarAlt * 1000, lunarPeri: p.lunarAlt * 1000 - 20e3 };
    case 'moonLand':
      return {
        targetApo: p.parkingAlt * 1000, targetPeri: p.parkingAlt * 1000 - 20e3,
        lunarApo: p.lunarAlt * 1000, lunarPeri: p.lunarAlt * 1000 - 20e3,
        lunarStaySec: p.staySec,
      };
    default: return {};
  }
}

window.planMission = planMission;
window.MISSION_CATALOG = MISSION_CATALOG;
window.rocketDeltaV = rocketDeltaV;
