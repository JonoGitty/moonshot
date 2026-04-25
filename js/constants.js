// =============================================================================
// constants.js — real physical constants + spacecraft blueprints
// Everything is SI. Gravity constant G in m³/(kg·s²), masses in kg, etc.
// Numbers from NASA/Wikipedia — these are the real values.
// =============================================================================

// ---- Universal ----
const G = 6.674e-11;                             // gravitational constant
const STEFAN_BOLTZMANN = 5.67e-8;

// ---- Earth ----
const EARTH_MASS = 5.972e24;
const EARTH_RADIUS = 6.371e6;
const EARTH_MU = G * EARTH_MASS;                 // ≈ 3.986e14
const EARTH_ROT_RATE = 7.2921e-5;                // rad/s, sidereal
const EARTH_ROT_SURFACE_SPEED = EARTH_ROT_RATE * EARTH_RADIUS; // ≈ 465 m/s at equator
const ATMOSPHERE_HEIGHT = 100e3;                 // Kármán line
const SCALE_HEIGHT = 8500;                       // exponential atmosphere
const SEA_LEVEL_DENSITY = 1.225;                 // kg/m³

// ---- Moon ----
const MOON_MASS = 7.342e22;
const MOON_RADIUS = 1.7374e6;
const MOON_MU = G * MOON_MASS;                   // ≈ 4.903e12
const MOON_DISTANCE = 3.844e8;                   // mean Earth-Moon distance
const MOON_ORBITAL_V = Math.sqrt(EARTH_MU / MOON_DISTANCE); // ≈ 1018 m/s
const MOON_SOI = 66.1e6;                         // sphere of influence
const MOON_ROT_RATE = 2.6617e-6;                 // tidally locked, rad/s

// Moon ecliptic longitude given Julian Date. Simplified Meeus mean longitude
// L = 218.3165° + 13.17639648° × (JD − 2451545.0), wrapped to [0, 360).
function moonEclipticLongitude(jd) {
  const L = 218.3165 + 13.17639648 * (jd - 2451545.0);
  return ((L % 360) + 360) % 360;
}

// Sun's ecliptic longitude given Julian Date — Meeus approximate. Used to
// place the sun for time-of-day lighting at each mission's real launch time.
function sunEclipticLongitude(jd) {
  const T = (jd - 2451545.0) / 36525;                  // Julian centuries from J2000
  const L0 = 280.46646 + 36000.76983 * T;             // mean longitude
  const M  = 357.52911 + 35999.05029 * T;             // mean anomaly
  const Mr = M * Math.PI / 180;
  const C = (1.914602 - 0.004817 * T) * Math.sin(Mr)
          + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr)
          + 0.000289 * Math.sin(3 * Mr);
  const lon = (L0 + C) % 360;
  return ((lon % 360) + 360) % 360;
}
function dateToJD(year, month, day, hourUT) {
  // Valid for dates after 1582. From Meeus.
  if (month <= 2) { year -= 1; month += 12; }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  const jd = Math.floor(365.25 * (year + 4716))
           + Math.floor(30.6001 * (month + 1))
           + day + B - 1524.5;
  return jd + (hourUT || 0) / 24;
}

// ---- Gameplay ----
const LAUNCH_LAT = 28.5 * Math.PI / 180;         // Kennedy-ish
const TIME_WARP_LEVELS = [1, 2, 5, 10, 50, 100, 500, 1000, 10000, 100000];
const G0 = 9.80665;                              // standard gravity (for Isp conversions)

// =============================================================================
// Spacecraft blueprints
// Drawing coordinates: each stage has `length` (along axis) and `diameter`.
// Rocket is drawn along +X axis in local space (nose to the right).
// Thrust is along +X. isp = sea-level Isp; ispVac = vacuum Isp.
// =============================================================================
const SPACECRAFT = {
  creative: {
    name: 'X-1 SANDBOX',
    subtitle: 'Infinite fuel · creative mode · go wherever you want',
    mission: 'moon',                         // any milestones count; no real fail state
    infiniteFuel: true,                      // engine never runs out
    profile: {
      targetApo: 200e3,
      targetPeri: 150e3,
      lunarApo: 120e3,
      lunarPeri: 100e3,
      lunarStaySec: 15,
    },
    briefing: {
      missionName: 'X-1 Sandbox — fly anywhere',
      date: 'Creative mode',
      launchJD: dateToJD(2025, 1, 1, 0),     // Moon at J2025 start
      crew: 'You',
      difficulty: 1,
      historical: 'No real mission. Infinite fuel. Go explore. Apollo the Moon, Artemis-style flyby, just belly-flop around LEO — up to you.',
      phases: [
        { name: 'Launch',        target: 'Press W whenever' },
        { name: 'Explore',       target: 'Engines never run out — go anywhere' },
        { name: 'Land safely',   target: 'Or don\'t. Nothing to prove.' },
      ],
    },
    totalHeight: 20,
    stages: [
      {
        // With infiniteFuel: true, fuelMass never drains — it's just a
        // constant "mass carried". Keep it small so TWR stays high.
        name: 'Endless Booster',
        dryMass: 3000,
        fuelMass: 2000,
        thrust: 2500e3,                      // massive TWR > 20 when light
        isp: 380,
        ispVac: 420,
        dragCoeff: 0.3,
        area: 3.5,
        length: 14,
        diameter: 2.2,
        color: '#ffd54a',                    // gold/yellow
        detailColor: '#222',
      },
    ],
    capsule: {
      name: 'Sandbox Capsule',
      dryMass: 1500,
      fuelMass: 1000,
      thrust: 200e3,
      isp: 340,
      ispVac: 380,
      dragCoeff: 0.6,
      area: 4,
      length: 3.5,
      diameter: 2.2,
      maxTemp: 6000,                         // nearly indestructible
      parachuteDrag: 250,
      parachuteAlt: 5000,
      color: '#ffd54a',
    },
  },

  mercury: {
    name: 'Mercury-Redstone',
    subtitle: 'Sub-orbital hopper',
    mission: 'suborbital',
    profile: {
      targetPeak: 187.5e3,
      downrange: 487.3e3,
    },
    briefing: {
      missionName: 'Mercury-Redstone 3 "Freedom 7"',
      date: 'May 5, 1961 · 14:34 UT',
      launchJD: dateToJD(1961, 5, 5, 14 + 34/60),
      crew: 'Alan Shepard (first American in space)',
      difficulty: 1,
      historical: 'First crewed US spaceflight. 15-minute suborbital arc, splashdown in the Atlantic near the Bahamas. Shepard pulled 11.6 g on re-entry.',
      preLaunchQuote: 'Shepard, holding the launch on the pad: "Why don\'t you fix your little problem and light this candle?"',
      liftoffQuote: 'Liftoff! And the clock is started.',
      phases: [
        { name: 'Ascent',              duration: '2m 22s', target: 'Full throttle vertical' },
        { name: 'MECO',                duration: '',       target: 'Burnout at ~59 km, coast' },
        { name: 'Apex',                duration: '',       target: '187.5 km peak altitude' },
        { name: 'Re-entry',            target: '11.6 g peak' },
        { name: 'Drogue + main chutes', target: 'Deploy below 3 km' },
        { name: 'Splashdown',          target: 'Atlantic Ocean (487 km downrange)' },
      ],
    },
    totalHeight: 25,
    stages: [
      {
        name: 'Redstone A-7',
        dryMass: 4000,
        fuelMass: 26000,
        thrust: 350e3,
        isp: 215,
        ispVac: 265,
        dragCoeff: 0.35,
        area: 4.0,
        length: 18,
        diameter: 1.8,
        color: '#e8e8e8',
        detailColor: '#222',
      },
    ],
    capsule: {
      name: 'Mercury Capsule',
      dryMass: 1400,
      fuelMass: 50,
      thrust: 2500,
      isp: 220,
      ispVac: 235,
      dragCoeff: 0.6,
      area: 3.2,
      length: 3.3,
      diameter: 1.9,
      maxTemp: 2500,                 // capsule burns through above this (°C)
      // Mercury: single 19m drogue + 19m main. Real splash at ~9 m/s.
      parachuteDrag: 500,
      parachuteAlt: 3000,            // safe deploy altitude ceiling
      color: '#b8b8b8',
    },
  },

  falcon9: {
    name: 'Falcon 9',
    subtitle: 'Modern orbital workhorse',
    mission: 'leo-return',
    profile: {
      targetApo: 420e3,
      targetPeri: 400e3,
      orbitCoastSimTime: 5400,
    },
    briefing: {
      missionName: 'SpaceX Crew-1 — Dragon to ISS',
      date: 'November 16, 2020 · 00:27 UT',
      launchJD: dateToJD(2020, 11, 16, 0 + 27/60),
      crew: 'Hopkins, Glover, Walker, Noguchi',
      difficulty: 2,
      historical: 'First operational crewed SpaceX flight. Falcon 9 puts Dragon 2 on trajectory to ISS (408 km, 51.6°). Docking ~28 h after launch, 167-day ISS stay, splashdown in Gulf of Mexico.',
      preLaunchQuote: 'SpaceX: "Resilience, SpaceX. Godspeed Crew-1. Hopkins, Glover, Walker, Noguchi — go light this candle."',
      liftoffQuote: 'Liftoff! Dragon Resilience is on her way to the International Space Station.',
      phases: [
        { name: 'Ascent',             duration: '~9 min', target: 'LEO 400 × 420 km' },
        { name: 'Stage 1 MECO',       duration: 'T+2:32', target: 'S1 returns for reuse (boostback)' },
        { name: 'Stage 2 SECO',       duration: 'T+9:00', target: 'Dragon separates at orbital velocity' },
        { name: 'Dragon phasing burns', target: 'Rendezvous with ISS (~28 h)' },
        { name: 'Docking',            target: 'ISS Harmony forward port' },
        { name: 'De-orbit burn',      dv: '~95 m/s', direction: 'retrograde' },
        { name: 'Re-entry',           target: 'PICA-X heat shield' },
        { name: 'Drogue + main chutes' },
        { name: 'Splashdown',         target: 'Gulf of Mexico' },
      ],
    },
    totalHeight: 70,
    stages: [
      {
        name: 'Stage 1 · 9× Merlin 1D',
        dryMass: 27000,
        fuelMass: 411000,
        thrust: 7607e3,
        isp: 282,
        ispVac: 311,
        dragCoeff: 0.3,
        area: 10.8,
        length: 41,
        diameter: 3.7,
        color: '#f5f5f5',
        detailColor: '#222',
      },
      {
        name: 'Stage 2 · Merlin Vacuum',
        dryMass: 4000,
        fuelMass: 107500,
        thrust: 934e3,
        isp: 348,
        ispVac: 348,
        dragCoeff: 0.28,
        area: 10.8,
        length: 13,
        diameter: 3.7,
        color: '#f5f5f5',
        detailColor: '#222',
      },
    ],
    capsule: {
      // Dragon 2 with real values. 9.5 t dry, 1.89 t hypergolic (MMH/N2O4)
      // between 8× SuperDraco and 16× Draco thrusters. SuperDracos are
      // abort engines, 71 kN each × 8 = 568 kN, but they burn for only a
      // few seconds. For game: we use them as a "de-orbit + maneuvering"
      // engine with real combined thrust.
      name: 'Dragon 2',
      dryMass: 9525,
      fuelMass: 1890,
      thrust: 568e3,
      isp: 235,
      ispVac: 300,
      dragCoeff: 0.7,
      area: 13,
      length: 7,
      diameter: 4,
      maxTemp: 3200,
      // Real Dragon: 4× 35 m diameter mains. Cd*A → ~3200 m². Lands at ~5 m/s.
      parachuteDrag: 3200,
      parachuteAlt: 3000,
      color: '#cfcfcf',
    },
  },

  sputnik: {
    name: 'R-7 / Sputnik',
    subtitle: 'Soviet space age pioneer · 1957',
    program: 'soviet',
    mission: 'orbit-only',
    profile: {
      targetApo: 939e3,
      targetPeri: 215e3,
    },
    briefing: {
      missionName: 'Sputnik 1 — PS-1',
      date: 'October 4, 1957 · 19:28 UT',
      launchJD: dateToJD(1957, 10, 4, 19 + 28/60),
      crew: 'Uncrewed (83.6 kg radio beacon)',
      difficulty: 1,
      historical: "World's first artificial satellite. Broadcast a simple 'beep' on 20.005 and 40.002 MHz. Completed 1,440 orbits before burning up on January 4, 1958.",
      preLaunchQuote: 'Korolev, in the bunker at Tyuratam: "Pusk!" — "Launch!" The Space Age begins.',
      liftoffQuote: 'Liftoff. The world will hear her beep within hours.',
      phases: [
        { name: 'Strap-on booster burn', duration: '~2 min', target: 'Boosters jettison' },
        { name: 'Core (Block A) burn',  duration: '~5 min', target: 'Orbital velocity 7.8 km/s' },
        { name: 'Satellite separation', target: 'Press SPACE to deploy' },
        { name: 'Stable orbit',         target: '215 × 939 km, 65.1° inclination' },
        { name: 'Broadcasting',         duration: '91 days', target: '*beep* *beep* *beep*' },
      ],
    },
    totalHeight: 29,
    stages: [
      {
        // R-7 strap-on boosters (Blocks B/V/G/D). In real flight they fire
        // together with the core from liftoff and jettison at ~T+120s. To
        // capture that Δv benefit we model them as the first drop stage.
        name: 'Strap-on boosters (4× Block B/V/G/D)',
        dryMass: 14000,
        fuelMass: 128000,
        thrust: 2900e3,
        isp: 285,
        ispVac: 314,
        dragCoeff: 0.33,
        area: 30,
        length: 20,
        diameter: 3.0,
        color: '#cfcfcf',
        detailColor: '#444',
      },
      {
        // Core stage (Block A) — continues alone to orbit.
        name: 'Core (Block A)',
        dryMass: 6000,
        fuelMass: 95000,
        thrust: 1000e3,
        isp: 310,
        ispVac: 330,
        dragCoeff: 0.28,
        area: 8,
        length: 28,
        diameter: 2.95,
        color: '#e0e0e0',
        detailColor: '#444',
      },
    ],
    capsule: {
      // Sputnik 1 — 58 cm polished aluminium sphere with 4 antennae. No heat
      // shield, no parachutes: it's just meant to reach orbit and beep.
      name: 'Sputnik 1 — PS-1',
      shape: 'sphere-antennae',
      dryMass: 84,
      fuelMass: 0,
      thrust: 0,
      isp: 1,
      ispVac: 1,
      dragCoeff: 0.4,
      area: 0.27,
      length: 0.6,
      diameter: 0.58,
      maxTemp: 800,
      parachuteDrag: 0,
      parachuteAlt: 0,
      color: '#e8e8e8',
    },
  },

  vostok: {
    name: 'Vostok-K / Vostok 1',
    subtitle: 'Gagarin · first human in space · 1961',
    program: 'soviet',
    mission: 'leo-return',
    profile: {
      targetApo: 327e3,
      targetPeri: 181e3,
      orbitCoastSimTime: 5400,
    },
    briefing: {
      missionName: 'Vostok 1 — "Poyekhali!"',
      date: 'April 12, 1961 · 06:07 UT',
      launchJD: dateToJD(1961, 4, 12, 6 + 7/60),
      crew: 'Yuri Gagarin (first human in space)',
      difficulty: 2,
      historical: "First crewed spaceflight. Gagarin completed one orbit (108 min), ejected from the Vostok capsule at 7 km altitude, and parachuted to Russian soil. 'Poyekhali!' (Let's go!).",
      preLaunchQuote: 'Korolev: "Preliminary stage — Intermediate — Main — LIFTOFF! Wishing you a good flight! All is normal!" / Gagarin: "Поехали! Poyekhali! Off we go!"',
      liftoffQuote: 'And he\'s away. The first human is now in space.',
      phases: [
        { name: 'Strap-on booster burn', duration: '2 min', target: 'Boosters jettison at T+118 s' },
        { name: 'Core (Block A) burn',  duration: '~5 min', target: 'Near-orbital velocity' },
        { name: 'Block E upper burn',    duration: '~4 min', target: 'LEO 181 × 327 km, 65° incl' },
        { name: 'Orbit coast',           duration: '89 min', target: '1 full orbit' },
        { name: 'Retrograde burn',       duration: '42 s',   dv: '~155 m/s', direction: 'retrograde' },
        { name: 'Service module separation' },
        { name: 'Re-entry in capsule',   target: 'Ballistic, ~10 g peak' },
        { name: 'Cosmonaut ejection',    target: '7 km altitude' },
        { name: 'Parachute landing',     target: '2.5 km deploy, landing near Engels, Russia' },
      ],
    },
    totalHeight: 38,
    stages: [
      {
        name: 'Strap-on boosters (4× Block B/V/G/D)',
        dryMass: 14000,
        fuelMass: 128000,
        thrust: 2900e3,
        isp: 285,
        ispVac: 314,
        dragCoeff: 0.33,
        area: 30,
        length: 20,
        diameter: 3.0,
        color: '#cfcfcf',
        detailColor: '#444',
      },
      {
        name: 'Core (Block A)',
        dryMass: 6000,
        fuelMass: 95000,
        thrust: 1000e3,
        isp: 310,
        ispVac: 330,
        dragCoeff: 0.28,
        area: 8,
        length: 28,
        diameter: 2.95,
        color: '#e0e0e0',
        detailColor: '#444',
      },
      {
        // Block E upper stage — final orbital insertion burn
        name: 'Block E upper stage',
        dryMass: 1100,
        fuelMass: 6800,
        thrust: 55e3,
        isp: 326,
        ispVac: 326,
        dragCoeff: 0.28,
        area: 5,
        length: 3,
        diameter: 2.6,
        color: '#cccccc',
        detailColor: '#333',
      },
    ],
    capsule: {
      // Vostok 3KA: spherical re-entry capsule + instrument module. Yuri
      // ejected at ~7 km and parachuted separately, but the sphere itself
      // has a modest ablative heat shield and drogue/main chutes.
      name: 'Vostok 3KA',
      shape: 'sphere',
      dryMass: 2460,
      fuelMass: 180,
      thrust: 15e3,
      isp: 250,
      ispVac: 290,
      dragCoeff: 0.75,
      area: 5.3,
      length: 4.3,
      diameter: 2.4,
      maxTemp: 2600,
      // Real Vostok: single main parachute deployed at 7 km, plus the cosmonaut
      // ejecting at 7 km and parachuting separately. Game uses just the main.
      parachuteDrag: 700,
      parachuteAlt: 7000,
      color: '#d0d0d0',
    },
  },

  sls: {
    name: 'SLS Block 1',
    subtitle: 'Artemis Lunar Architecture',
    program: 'artemis',
    // Artemis I profile: no landing (that needs a separate Human Landing
    // System — Starship HLS or Blue Moon — which we don't model). Mission
    // is lunar orbit / flyby then return to Earth for splashdown.
    mission: 'moon-orbit',
    profile: {
      targetApo: 200e3,
      targetPeri: 180e3,
      lunarApo: 300e3,
      lunarPeri: 130e3,
    },
    briefing: {
      missionName: 'Artemis I (SLS-1)',
      date: 'November 16, 2022 · 06:47 UT',
      launchJD: dateToJD(2022, 11, 16, 6 + 47/60),
      crew: 'Uncrewed test flight with "Commander Moonikin Campos"',
      difficulty: 4,
      historical: 'First SLS launch. Orion travelled 2.1 million km, spent 6 days in Distant Retrograde Orbit around the Moon (max 432,210 km from Earth), re-entered at ~40,000 km/h, splashdown west of Baja California.',
      preLaunchQuote: 'Charlie Blackwell-Thompson, Launch Director: "The harder the climb, the better the view. We showed the Space Coast tonight what a launch looks like. For the Artemis Generation, this is for you."',
      liftoffQuote: 'Derrol Nail: "Liftoff of Artemis I — we rise together, back to the Moon and beyond!"',
      phases: [
        { name: 'SRB + Core ignition',  duration: '2m 12s', target: 'SRBs jettison' },
        { name: 'Core stage solo',      duration: '~6 min', target: 'MECO' },
        { name: 'Core + Orion separate' },
        { name: 'ICPS burn 1 (PRM)',    duration: '~22 s',  target: 'Perigee raise to ~1800 km' },
        { name: 'ICPS TLI burn',        duration: '18 min', dv: '~3150 m/s', direction: 'prograde' },
        { name: 'ICPS separation + Orion solo' },
        { name: 'Trans-lunar coast',    duration: '5 days', target: 'Lunar flyby, 130 km closest approach' },
        { name: 'Outbound Powered Flyby', dv: '~350 m/s' },
        { name: 'DRO Insertion Burn',   dv: '~378 m/s',    target: 'Distant Retrograde Orbit' },
        { name: 'DRO coast',            duration: '6 days', target: '14-day orbit period' },
        { name: 'DRO Departure Burn',   dv: '~453 m/s' },
        { name: 'Return Powered Flyby', dv: '~254 m/s',     target: 'Earth intercept' },
        { name: 'Trans-Earth coast',    duration: '5 days' },
        { name: 'Service module separation' },
        { name: 'Re-entry',             target: 'Skip-entry profile, 11 km/s, 40,000 km/h' },
        { name: 'Drogue + main chutes' },
        { name: 'Splashdown',           target: 'Pacific off Baja California' },
      ],
    },
    totalHeight: 98,
    stages: [
      {
        // "Boost phase": real SLS SRBs + core fire together from liftoff.
        // The SRBs burn their 1,262 t of propellant in ~126 s; during that
        // same window the core RS-25s also burn ~240 t of their propellant.
        // We model that combined boost phase as a single stage whose fuel
        // reflects total propellant spent (1,502 t) and whose thrust is the
        // real combined SRB + Core (36.36 MN). Isp is the mass-flow-weighted
        // average of SRB (~269 s) and RS-25 (~452 s).
        // When this stage is "attached", the renderer draws 2 white SRBs on
        // the sides of the core. When it drops at T+126 s the SRBs tumble
        // away as a pair and the core continues alone.
        name: 'SRBs + Core (boost phase)',
        dryMass: 100000,                   // 2× SRB casings (≈50 t each)
        fuelMass: 1502000,                 // 1262 t SRB propellant + 240 t core burnt during boost
        thrust: 36360e3,                   // SRB 28.0 MN + Core 8.36 MN
        isp: 296,                          // mass-flow average
        ispVac: 310,
        dragCoeff: 0.32,
        area: 65,
        length: 0,                         // virtual — doesn't add to stack
        diameter: 0,
        color: 'transparent',
        detailColor: '#222',
        pattern: 'sls-srb-flank',          // side-mounted SRB rendering
      },
      {
        // Core stage continues alone after SRBs drop, with its remaining
        // propellant (real SLS: ~760 t remaining after ~240 t burnt during
        // boost phase). 4× RS-25 engines at vacuum Isp.
        name: 'Core Stage (4× RS-25)',
        dryMass: 85000,
        fuelMass: 760000,
        thrust: 8360e3,
        isp: 366,
        ispVac: 452,
        dragCoeff: 0.3,
        area: 55,
        length: 65,
        diameter: 8.4,
        color: '#c94e10',
        detailColor: '#222',
      },
      {
        // ICPS — real values. 1× RL10B-2, Isp 462 s, ~27 t LH2/LOX.
        name: 'ICPS · 1× RL10B-2',
        dryMass: 3500,
        fuelMass: 27000,
        thrust: 110e3,
        isp: 462,
        ispVac: 462,
        dragCoeff: 0.25,
        area: 12,
        length: 14,
        diameter: 5,
        color: '#dddddd',
        detailColor: '#222',
      },
    ],
    capsule: {
      // Orion + ESM with real values. CM 10.4 t, ESM dry 6.1 t, ESM
      // propellant 9 t (MMH/N2O4), AJ10-190 main engine 33 kN.
      // With these real numbers SLS does the Artemis-I profile: LEO → TLI →
      // distant lunar orbit → return. (Landing would require a separate
      // Human Landing System — Starship HLS — which we don't model.)
      name: 'Orion + European Service Module',
      shape: 'orion-las',
      dryMass: 16500,                     // CM (10.4 t) + ESM dry (6.1 t)
      fuelMass: 9000,
      thrust: 33e3,
      isp: 326,
      ispVac: 326,
      dragCoeff: 0.7,
      area: 19.6,
      length: 7.5,
      diameter: 5.0,
      maxTemp: 4000,                       // PICA-X heat shield
      parachuteDrag: 3500,
      parachuteAlt: 3500,
      color: '#cccccc',
    },
  },

  artemis2: {
    name: 'SLS Block 1 · Artemis II',
    subtitle: 'First crewed flight to lunar vicinity since 1972',
    program: 'artemis',
    // Artemis II: ~10-day crewed mission. Real mission is a hybrid free-return
    // flyby of the Moon, but the trajectory DOES loop around the lunar far side
    // so in our 2D game we model it as a wide lunar orbit + return (same LOI
    // + TEI flow as Artemis I) so players can see the lunar loop clearly.
    mission: 'moon-orbit',
    profile: {
      targetApo: 200e3,
      targetPeri: 185e3,
      lunarApo: 9500e3,                  // hybrid free-return far-side distance
      lunarPeri: 7500e3,
    },
    briefing: {
      missionName: 'Artemis II',
      date: 'April 3, 2026 · planned',
      launchJD: dateToJD(2026, 4, 3, 21),
      crew: 'Wiseman (CDR), Glover (PLT), Koch (MS1), Hansen (MS2, CSA)',
      difficulty: 4,
      historical: 'First crewed lunar flight since Apollo 17. 4 astronauts on a ~10-day free-return trajectory around the far side of the Moon. Reaches ~10,000 km beyond the lunar far side — farther from Earth than any humans have ever been. No lunar orbit; slingshots back on the same impulse.',
      preLaunchQuote: 'Charlie Blackwell-Thompson, Launch Director: "Artemis II — you are go for launch. The first crewed mission to the Moon in over fifty years. Wiseman, Glover, Koch, Hansen — we will see you on the other side of the Moon."',
      liftoffQuote: 'Mission Control: "Liftoff of Artemis II! Four astronauts, one Moon, and a return to lunar exploration with humans on board."',
      phases: [
        { name: 'SRB + Core ignition',   duration: '2m 12s', target: 'SRBs jettison at T+2:12' },
        { name: 'Core stage solo',       duration: '~6 min', target: 'MECO' },
        { name: 'Core + Orion separate' },
        { name: 'ICPS PRM burn',         duration: '~22 s',  target: 'Perigee raise' },
        { name: 'High Earth orbit check-out', duration: '~24 h', target: 'Prox-ops with ICPS' },
        { name: 'ICPS TLI burn',         duration: '~18 min', dv: '~3120 m/s', direction: 'prograde' },
        { name: 'ICPS disposal + Orion solo' },
        { name: 'Outbound coast',        duration: '~4 days', target: 'Free-return trajectory' },
        { name: 'Lunar far-side flyby',  target: '~10,000 km beyond far side, 24-h loop' },
        { name: 'Inbound coast',         duration: '~4 days' },
        { name: 'Service module jettison', target: 'Just before atmo interface' },
        { name: 'Re-entry',              target: 'Skip-entry profile, 11 km/s' },
        { name: 'Drogue + main chutes' },
        { name: 'Splashdown',            target: 'Pacific Ocean off San Diego' },
      ],
    },
    totalHeight: 98,
    stages: [
      {
        name: 'SRBs + Core (boost phase)',
        dryMass: 100000,
        fuelMass: 1502000,
        thrust: 36360e3,
        isp: 296,
        ispVac: 310,
        dragCoeff: 0.32,
        area: 65,
        length: 0,
        diameter: 0,
        color: 'transparent',
        detailColor: '#222',
        pattern: 'sls-srb-flank',
      },
      {
        name: 'Core Stage (4× RS-25)',
        dryMass: 85000,
        fuelMass: 760000,
        thrust: 8360e3,
        isp: 366,
        ispVac: 452,
        dragCoeff: 0.3,
        area: 55,
        length: 65,
        diameter: 8.4,
        color: '#c94e10',
        detailColor: '#222',
      },
      {
        name: 'ICPS · 1× RL10B-2',
        dryMass: 3500,
        fuelMass: 27000,
        thrust: 110e3,
        isp: 462,
        ispVac: 462,
        dragCoeff: 0.25,
        area: 12,
        length: 14,
        diameter: 5,
        color: '#dddddd',
        detailColor: '#222',
      },
    ],
    capsule: {
      name: 'Orion + European Service Module',
      shape: 'orion-las',
      dryMass: 16500,
      fuelMass: 9000,
      thrust: 33e3,
      isp: 326,
      ispVac: 326,
      dragCoeff: 0.7,
      area: 19.6,
      length: 7.5,
      diameter: 5.0,
      maxTemp: 4000,
      parachuteDrag: 3500,
      parachuteAlt: 3500,
      color: '#cccccc',
    },
  },

  shuttle: {
    name: 'Space Shuttle',
    subtitle: 'STS-1 Columbia · first orbital shuttle flight',
    mission: 'leo-return',
    profile: {
      targetApo: 267e3,
      targetPeri: 244e3,
      orbitCoastSimTime: 5400,
    },
    briefing: {
      missionName: 'STS-1 Columbia',
      date: 'April 12, 1981 · 12:00 UT',
      launchJD: dateToJD(1981, 4, 12, 12 + 0/60),
      crew: 'Young (CDR), Crippen (PLT)',
      difficulty: 3,
      historical: 'First orbital test flight of the Space Shuttle system. Columbia flew 37 orbits in 54.5 hours and glided to landing at Edwards AFB. Maiden crewed flight of a reusable spacecraft — first time a US rocket flew crew on debut.',
      preLaunchQuote: 'Mission Control: "We have main engine start... 4, 3, 2, 1 — and liftoff. Liftoff of America\'s first Space Shuttle, and the Shuttle has cleared the tower."',
      liftoffQuote: 'Crippen: "What a way to come to California!"',
      phases: [
        { name: 'SRB + SSME ignition', duration: '2m 04s', target: 'SRBs jettison at T+2:04' },
        { name: 'SSMEs on ET',         duration: '~6m 30s', target: 'MECO at T+8:30' },
        { name: 'ET separation' },
        { name: 'OMS-2 burn',          duration: '~1m 30s', dv: '~90 m/s', direction: 'prograde' },
        { name: 'On-orbit operations', duration: '54.5 h',  target: 'LEO 244 × 267 km' },
        { name: 'De-orbit burn',       dv: '~105 m/s',      direction: 'retrograde' },
        { name: 'Entry interface',     target: 'AOS at ~122 km' },
        { name: 'Hypersonic glide',    target: 'S-turn energy management' },
        { name: 'Runway landing',      target: 'Edwards AFB Runway 23' },
      ],
    },
    totalHeight: 56,
    stages: [
      {
        // Boost phase: 2× SRB + 3× SSME fire together. SRBs burn for 124s
        // then jettison. SSMEs continue on ET fuel. Model as 1 virtual stage
        // that covers the 124s of parallel firing.
        name: 'SRBs + SSME (boost phase)',
        dryMass: 184000,                   // 2 SRBs dry
        fuelMass: 1120000,                 // SRB propellant 998t + ET fuel used in boost phase
        thrust: 30450e3,                   // 2 SRBs (25 MN) + 3 SSMEs (5.45 MN)
        isp: 295,                          // mass-flow average
        ispVac: 320,
        dragCoeff: 0.3,
        area: 70,
        length: 0,                         // virtual stage, flanked SRBs render separately
        diameter: 0,
        color: 'transparent',
        detailColor: '#222',
        pattern: 'sls-srb-flank',
      },
      {
        // After SRBs drop, SSMEs burn ET fuel alone for ~6:30 to MECO
        name: 'SSMEs on ET',
        dryMass: 26500,
        fuelMass: 585000,
        thrust: 5450e3,
        isp: 366,
        ispVac: 452,
        dragCoeff: 0.28,
        area: 55,
        length: 47,
        diameter: 8.4,
        color: '#c94e10',
        detailColor: '#222',
      },
    ],
    capsule: {
      name: 'Orbiter + OMS',
      shape: 'shuttle-orbiter',
      dryMass: 78000,
      fuelMass: 14000,
      thrust: 53e3,
      isp: 313,
      ispVac: 313,
      dragCoeff: 1.2,                     // blunt lifting body, high drag on entry
      area: 60,                            // big belly tile area
      length: 37,
      diameter: 24,                       // Real Orbiter wingspan ~24 m
      // Real tile temp ~1650°C but our 2D Sutton-Graves runs hot — give the
      // Orbiter generous margin so a normal-AoA glide doesn't burn through.
      maxTemp: 4500,
      // No parachutes — the Shuttle glides to a runway. Real touchdown is
      // ~100 m/s (360 km/h) with drag chute deployed on rollout.
      parachuteDrag: 0,
      parachuteAlt: 0,
      // Spaceplane glide: lift-to-drag ratio. Higher L/D = shallower glide,
      // less likely to dive too steep into thick atmosphere.
      liftCoeff: 1.2,
      // Max safe touchdown speed (m/s). Real Shuttle main-gear touchdown
      // ~95 m/s, drag chute and wheel brakes bring it down from there.
      landingSpeed: 150,
      color: '#f0f0f0',
    },
  },

  soyuz: {
    name: 'Soyuz-FG / TMA-19M',
    subtitle: 'Tim Peake · Principia to ISS · 2015',
    program: 'soviet',
    mission: 'iss-dock',
    profile: {
      targetApo: 420e3,                    // ISS altitude
      targetPeri: 408e3,
      orbitCoastSimTime: 5400,
    },
    briefing: {
      missionName: 'Soyuz TMA-19M — ESA Principia',
      date: 'December 15, 2015 · 11:03 UT',
      launchJD: dateToJD(2015, 12, 15, 11 + 3/60),
      crew: 'Malenchenko (CDR), Kopra (FE-1), Peake (FE-2, ESA)',
      difficulty: 3,
      historical: "Tim Peake's ESA Principia mission — first British ESA astronaut to ISS. 186 days in space. Six-hour fast-rendezvous with ISS. Peake ran the London Marathon on the ISS treadmill.",
      preLaunchQuote: 'Korolev (TsUP): "Зажигание... подъем!" — Ignition... liftoff! / Peake from inside the capsule: "Wow, that was quite a ride."',
      liftoffQuote: 'TsUP: "Поехали!" — and Soyuz TMA-19M is on her way to the ISS.',
      phases: [
        { name: 'Strap-on booster burn', duration: '1m 58s', target: 'Boosters jettison' },
        { name: 'Block A core burn',    duration: '~4m 45s', target: 'Upper stage separation' },
        { name: 'Block I upper burn',   duration: '~4m 00s', target: 'LEO ~200 × 250 km' },
        { name: '4-orbit phasing',      duration: '~6 h',    target: 'Rendezvous with ISS' },
        { name: 'Docking',              target: 'ISS Rassvet module' },
        { name: '186 days on ISS' },
        { name: 'De-orbit burn',        dv: '~128 m/s',      direction: 'retrograde' },
        { name: 'Module separation',    target: 'Descent module only' },
        { name: 'Re-entry',             target: 'Ballistic, ~4 g peak' },
        { name: 'Drogue + main chutes' },
        { name: 'Soft-landing retro',   target: 'Kazakh steppe, near Zhezkazgan' },
      ],
    },
    totalHeight: 50,
    stages: [
      {
        // Real R-7 parallel staging: 4 strap-ons + core all fire from liftoff,
        // strap-ons burn out first at T+118s. Model boost phase as one stage
        // whose fuel = all strap-on propellant + what core burned during boost.
        name: 'Strap-ons + core (boost phase)',
        dryMass: 14000,
        fuelMass: 170000,                  // 4× 32.5t boosters + ~40t of core during boost
        thrust: 3960e3,                    // 2960 kN boosters + 1000 kN core
        isp: 295,                          // mass-flow average
        ispVac: 320,
        dragCoeff: 0.33,
        area: 30,
        length: 0,                         // virtual, no visual length added
        diameter: 0,
        color: 'transparent',
        detailColor: '#444',
        pattern: 'sls-srb-flank',          // render boosters on the sides
      },
      {
        // Core alone — remaining propellant burns for ~3 min after booster drop
        name: 'Block A core (solo)',
        dryMass: 6000,
        fuelMass: 55000,                   // 95t total − 40t burned in boost phase
        thrust: 1000e3,
        isp: 310,
        ispVac: 330,
        dragCoeff: 0.28,
        area: 8,
        length: 28,
        diameter: 2.95,
        color: '#e0e0e0',
        detailColor: '#444',
      },
      {
        name: 'Block I upper stage',
        dryMass: 2500,
        fuelMass: 22800,
        thrust: 298e3,
        isp: 330,
        ispVac: 359,
        dragCoeff: 0.28,
        area: 5,
        length: 6.7,
        diameter: 2.66,
        color: '#cccccc',
        detailColor: '#333',
      },
    ],
    capsule: {
      // Soyuz TMA-M — full spacecraft (orbital + descent + service) during
      // ascent and orbit; only the descent module lands (game simplified).
      name: 'Soyuz TMA-M',
      shape: 'sphere',
      dryMass: 7150,
      fuelMass: 900,
      thrust: 4e3,
      isp: 305,
      ispVac: 305,
      dragCoeff: 0.8,
      area: 6,
      length: 7.5,
      diameter: 2.72,
      maxTemp: 2800,
      // Real Soyuz: single 1000 m² main + soft-landing solid retros at 1m.
      parachuteDrag: 1000,
      parachuteAlt: 9000,
      color: '#dcdcdc',
    },
  },

  saturn5: {
    name: 'Saturn V',
    subtitle: 'Apollo Lunar Architecture',
    program: 'apollo',
    mission: 'moon',                       // Moon + return
    profile: {
      targetApo: 186e3,
      targetPeri: 183e3,
      lunarApo: 122e3,
      lunarPeri: 101e3,
      lunarStaySec: 30,
    },
    briefing: {
      missionName: 'Apollo 11 — SA-506',
      date: 'July 16, 1969 · 13:32 UT',
      launchJD: dateToJD(1969, 7, 16, 13 + 32/60),
      crew: 'Armstrong (CDR), Aldrin (LMP), Collins (CMP)',
      difficulty: 5,
      historical: "The Eagle landed at Tranquility Base with 98 kg of fuel left — 17 seconds to spare. 30 lunar orbits before descent. Armstrong: 'That's one small step for man, one giant leap for mankind.'",
      preLaunchQuote: 'Jack King, the Voice of Apollo: "T-minus 15 seconds, guidance is internal. 12, 11, 10, 9, ignition sequence start — 6, 5, 4, 3, 2, 1, zero, all engines running. LIFTOFF! We have a liftoff! 32 minutes past the hour, liftoff on Apollo 11."',
      liftoffQuote: 'Tower clear. Apollo 11 is on her way to the Moon.',
      phases: [
        { name: 'S-IC ascent',          duration: '2m 41s',  target: 'Burnout at 67 km' },
        { name: 'S-II burn',            duration: '6m 11s',  target: '~175 km altitude' },
        { name: 'S-IVB orbit insertion', duration: '2m 30s', target: 'LEO 183 × 186 km, 32.5°' },
        { name: 'Parking orbit coast',  duration: '2h 44m',  target: 'TLI window (Moon 114° ahead)' },
        { name: 'TLI (S-IVB re-ignite)', duration: '5m 47s', dv: '3180 m/s', direction: 'prograde' },
        { name: 'Trans-lunar coast',     duration: '3 days', target: 'Moon SOI' },
        { name: 'LOI-1',                 dv: '890 m/s',      direction: 'retrograde', target: '314 × 111 km' },
        { name: 'LOI-2',                 dv: '48 m/s',       direction: 'retrograde', target: 'Circularise 122 × 101 km' },
        { name: 'Lunar orbit',           duration: '25 h',   target: '30 orbits' },
        { name: 'CSM/LM undock',         target: 'Columbia stays, Eagle descends' },
        { name: 'DOI',                   duration: '30 s',   dv: '23 m/s', direction: 'retrograde' },
        { name: 'PDI (powered descent)', duration: '12 min', target: 'Sea of Tranquility' },
        { name: 'Surface stay',          duration: '21h 36m', target: '2.5h EVA' },
        { name: 'LM ascent',             dv: '~1850 m/s',    target: '18 × 88 km orbit' },
        { name: 'Rendezvous + dock',    target: 'With CSM' },
        { name: 'LM jettison' },
        { name: 'TEI',                   duration: '2m 30s', dv: '1000 m/s', direction: 'prograde' },
        { name: 'Trans-Earth coast',     duration: '2.5 days' },
        { name: 'SM separation',         target: 'Just before atmo interface' },
        { name: 'Re-entry',              target: '11 km/s, 36× Mach' },
        { name: 'Drogue + main chutes' },
        { name: 'Splashdown',            target: 'Pacific Ocean' },
      ],
    },
    totalHeight: 110,
    stages: [
      {
        name: 'S-IC · 5× F-1',
        dryMass: 131000,
        fuelMass: 2077000,
        thrust: 34020e3,
        isp: 263,
        ispVac: 304,
        dragCoeff: 0.3,
        area: 80,
        length: 42,
        diameter: 10.1,
        color: '#f0f0f0',
        detailColor: '#111',
        pattern: 'saturn-roll',              // iconic black/white quadrants
      },
      {
        name: 'S-II · 5× J-2',
        dryMass: 41000,
        fuelMass: 456000,
        thrust: 5141e3,
        isp: 395,
        ispVac: 421,
        dragCoeff: 0.28,
        area: 80,
        length: 25,
        diameter: 10.1,
        color: '#f0f0f0',
        detailColor: '#111',
        pattern: 'saturn-band',              // black band at base
      },
      {
        name: 'S-IVB · 1× J-2',
        dryMass: 13500,
        fuelMass: 107100,
        thrust: 1033e3,
        isp: 410,
        ispVac: 421,
        dragCoeff: 0.25,
        area: 52,
        length: 18,
        diameter: 6.6,
        color: '#f0f0f0',
        detailColor: '#111',
        pattern: 'saturn-band',
      },
      {
        // Apollo LM Descent Stage — DPS engine 45 kN, throttleable, Isp 311 s.
        // With the CSM undocked in lunar orbit (ghost mode), LM descends
        // alone. Stays on the Moon after landing.
        name: 'LM Descent Stage (DPS)',
        dryMass: 2034,
        fuelMass: 8248,
        thrust: 45040,
        isp: 311,
        ispVac: 311,
        dragCoeff: 0.5,
        area: 10,
        length: 3.2,
        diameter: 4.2,
        color: '#c8a860',
        detailColor: '#333',
      },
      {
        // Apollo LM Ascent Stage — APS 15.6 kN, Isp 311 s. Launches the
        // crew back to lunar orbit to rendezvous with the CSM.
        name: 'LM Ascent Stage (APS)',
        dryMass: 2150,
        fuelMass: 2376,
        thrust: 15600,
        isp: 311,
        ispVac: 311,
        dragCoeff: 0.5,
        area: 10,
        length: 3.7,
        diameter: 4.2,
        color: '#d8d8d8',
        detailColor: '#333',
      },
    ],
    capsule: {
      // Apollo CSM — real NASA values. Handles LOI, TEI, and re-entry.
      // In lunar orbit it UNDOCKS (becomes a ghost in orbit) while the LM
      // descends, lands, ascends, and rendezvouses with it.
      name: 'CSM (Command+Service)',
      dryMass: 11919,
      fuelMass: 18413,
      thrust: 91e3,
      isp: 314,
      ispVac: 314,
      dragCoeff: 0.7,
      area: 13,
      length: 11,
      diameter: 3.9,
      maxTemp: 3800,
      // Real Apollo CSM: 3× 25 m diameter mains, Cd*A ~3000 m². Splash at ~9 m/s.
      parachuteDrag: 3000,
      parachuteAlt: 3500,
      color: '#c8c8c8',
    },
  },
};
