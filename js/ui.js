// =============================================================================
// ui.js — DOM-based HUD: text updates, toasts, mission-phase detection,
// context-sensitive objective hints, and the end-of-mission screen.
// =============================================================================

function setText(id, text, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.textContent !== text) el.textContent = text;
  if (cls !== undefined) el.className = 'hud-value ' + cls;
}

function showToast(msg, type) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

// Which milestones have been hit since last check? Used to fire toasts.
const celebratedMilestones = new Set();
function checkMilestoneToasts(craft) {
  const messages = {
    leftPad: { text: 'LIFTOFF', type: 'success' },
    reachedSpace: { text: 'KÁRMÁN LINE CROSSED — WELCOME TO SPACE', type: 'success' },
    reachedOrbit: { text: 'STABLE ORBIT ACHIEVED', type: 'success' },
    approachedMoon: { text: 'ENTERING LUNAR SPHERE OF INFLUENCE', type: 'success' },
    enteredMoonOrbit: { text: 'CAPTURED INTO MOON ORBIT', type: 'success' },
    landedOnMoon: { text: 'TOUCHDOWN — THE EAGLE HAS LANDED', type: 'success' },
    launchedFromMoon: { text: 'LUNAR LIFTOFF — HEAD FOR HOME', type: 'success' },
    returnedToEarthAtmo: { text: 'RE-ENTRY INTERFACE — MANAGE HEAT', type: 'warn' },
    landedOnEarth: { text: 'SAFE LANDING ON EARTH', type: 'success' },
  };
  for (const [k, v] of Object.entries(craft.milestones)) {
    if (v && !celebratedMilestones.has(k)) {
      celebratedMilestones.add(k);
      if (messages[k]) showToast(messages[k].text, messages[k].type);
    }
  }
}

function resetCelebratedMilestones() { celebratedMilestones.clear(); }

// Detect the current mission phase (for the PHASE field)
function detectPhase(c, earth, moon) {
  if (c.destroyed) return 'DESTROYED';
  if (c.landed) return 'ON PAD · ' + (c.landedOn || '').toUpperCase();
  const altE = earth.altitude(c.pos);
  const altM = moon.altitude(c.pos);
  if (altM < MOON_SOI && c.milestones.landedOnMoon && !c.landed) return 'LUNAR ASCENT';
  if (altM < MOON_SOI && c.milestones.enteredMoonOrbit) return 'LUNAR ORBIT';
  if (altM < MOON_SOI) return 'LUNAR APPROACH';
  if (altE < ATMOSPHERE_HEIGHT && c.milestones.approachedMoon) return 'RE-ENTRY';
  if (altE < ATMOSPHERE_HEIGHT) {
    const vRad = Vec.dot(c.velocityRelativeTo(earth), Vec.norm(Vec.sub(c.pos, earth.pos)));
    return vRad > 0 ? 'ASCENT' : 'DESCENT';
  }
  if (c.milestones.launchedFromMoon) return 'TRANSEARTH COAST';
  if (c.apoE !== null && c.apoE > MOON_DISTANCE * 0.4 && c.milestones.reachedOrbit) return 'TRANSLUNAR COAST';
  if (c.milestones.reachedOrbit) return 'EARTH ORBIT';
  return 'SUBORBITAL';
}

// Context-sensitive objective text
function getObjectiveText(c, earth, moon) {
  if (c.destroyed) return 'Vehicle destroyed — press ESC to return to menu';

  const mission = c.blueprint.mission || 'moon';
  // Mission-specific success text
  if (c.landed && c.landedOn === 'Earth' && c.milestones.leftPad) {
    if (mission === 'moon') {
      if (c.milestones.landedOnMoon) return '🏆 APOLLO 11 SUCCESS — you landed on the Moon and brought the crew home';
      return 'Back on Earth, but never landed on the Moon. Try again with the LM.';
    }
    if (mission === 'moon-orbit') {
      if (c.milestones.approachedMoon) return '🏆 LUNAR MISSION SUCCESS — flew the lunar orbit and splashed down safely';
      return 'Back on Earth, but never reached the Moon.';
    }
    if (mission === 'moon-flyby') {
      if (c.milestones.approachedMoon) return '🏆 ARTEMIS II SUCCESS — looped the Moon on free-return and splashed down';
      return 'Back on Earth, but never reached the Moon.';
    }
    if (mission === 'iss-dock') {
      if (c.milestones.dockedWithISS) return '🏆 PRINCIPIA SUCCESS — docked with ISS and returned to Earth';
      return 'Landed on Earth, but never docked with the ISS.';
    }
    if (mission === 'leo-return') {
      if (c.milestones.reachedOrbit) return '🏆 MISSION SUCCESS — orbited Earth and returned safely';
      return 'Landed on Earth, but never completed an orbit. Try again.';
    }
    if (mission === 'suborbital') {
      if (c.milestones.reachedSpace) return '🏆 MISSION SUCCESS — touched space and splashed down';
      return 'Back on the ground, but you never reached space. Try again.';
    }
  }
  if (mission === 'orbit-only') {
    if (c.milestones.reachedOrbit && c.milestones.satelliteDeployed) {
      return '🏆 MISSION SUCCESS — Sputnik is deployed and broadcasting. *beep* *beep* *beep*';
    }
    if (c.milestones.reachedOrbit) {
      return 'Orbit achieved! Press SPACE to deploy the satellite.';
    }
  }
  if (c.landed && c.landedOn === 'Moon' && !c.milestones.launchedFromMoon)
    return 'Landed on the Moon! Throttle up (W) with capsule aimed up to lift off for home.';

  // ISS docking objectives
  if (mission === 'iss-dock') {
    if (c.milestones.dockedWithISS) return 'Docked with ISS! Houston will undock and de-orbit when ready.';
    if (c.milestones.reachedOrbit) return 'In orbit. Rendezvous with the ISS — match altitude and phase, then dock.';
  }
  // Shuttle re-entry objective (no parachutes — runway landing)
  if (c.capsule.shape === 'shuttle-orbiter' && c.isCapsuleOnly() && earth.altitude(c.pos) < ATMOSPHERE_HEIGHT) {
    return 'Re-entry glide: hold positive AoA so the belly tiles take the heat, then aim for runway touchdown ~100 m/s.';
  }

  const altE = earth.altitude(c.pos);
  const altM = moon.altitude(c.pos);

  if (altE < 2000 && !c.milestones.leftPad) return 'Hold W to throttle up. Full thrust lifts you off.';
  if (altE < 15e3) return 'Ascent: gradually tilt east (hold A) — start your gravity turn around 1–2 km altitude.';
  if (altE < 70e3) return 'Climb out: keep tilting toward prograde (green ○). Drop empty stages with SPACE.';
  if (altE < ATMOSPHERE_HEIGHT && !c.milestones.reachedOrbit) {
    return 'Build horizontal speed. LEO needs ~7.8 km/s tangential at ~200 km. Point prograde.';
  }
  if (!c.milestones.reachedOrbit && altE < 300e3 && c.apoE === null) return 'Circularise: burn prograde at apoapsis to raise periapsis above atmosphere.';
  if (c.milestones.reachedOrbit && !c.milestones.approachedMoon && c.apoE !== null && c.apoE < MOON_DISTANCE * 0.5) {
    return 'TLI burn: wait for Moon to lead you, then burn prograde to raise apoapsis to ~Moon distance.';
  }
  if (altM < MOON_SOI && !c.milestones.enteredMoonOrbit && !c.milestones.landedOnMoon) {
    return 'Moon SOI: burn retrograde (yellow ×) to slow down into a Moon orbit (aim periapsis 20–100 km).';
  }
  if (c.milestones.enteredMoonOrbit && !c.milestones.landedOnMoon) {
    return 'Descend to Moon: burn retrograde until periapsis hits the surface. No atmosphere → do it powered.';
  }
  if (c.milestones.launchedFromMoon && altM < MOON_SOI) {
    return 'Lunar ascent: burn prograde to raise apoapsis back toward Earth (need ~2.4 km/s).';
  }
  if (c.milestones.launchedFromMoon && altM > MOON_SOI && altE > ATMOSPHERE_HEIGHT) {
    return 'Coasting home. Before re-entry: stage down to capsule only and flip so heat shield points prograde.';
  }
  if (altE < ATMOSPHERE_HEIGHT && !c.isCapsuleOnly()) {
    return '⚠ DROP STAGES NOW — only the capsule has a heat shield!';
  }
  if (altE < ATMOSPHERE_HEIGHT && c.isCapsuleOnly()) {
    if (c.capsule.parachutesDeployed) return 'Chutes out. Let drag do the work.';
    if (altE < c.capsule.parachuteAlt + 2000) return 'Deploy parachutes (G) now!';
    return 'Re-entry: point heat shield retrograde (×) so plasma hits the shield, not the nose.';
  }
  return 'Fly your mission.';
}

// HUD update (called every frame)
function updateHUD() {
  const g = window.game;
  if (!g || !g.craft) return;
  const c = g.craft;
  const earth = g.earth;
  const moon = g.moon;

  const altE = earth.altitude(c.pos);
  const altM = moon.altitude(c.pos);

  // Velocity components relative to Earth surface
  const vRel = c.velocityRelativeTo(earth);
  const posRel = Vec.sub(c.pos, earth.pos);
  const radial = Vec.norm(posRel);
  const vRad = Vec.dot(vRel, radial);
  const vTan = Math.sqrt(Math.max(0, Vec.mag2(vRel) - vRad * vRad));

  setText('info-phase', detectPhase(c, earth, moon));
  setText('info-time', 'T+' + fmtTime(c.missionTime));
  setText('info-warp', g.timeWarp + '×');
  setText('info-altitude', fmtDist(altE));
  setText('info-velocity', fmtVel(Vec.mag(vRel)));
  setText('info-vvel', (vRad >= 0 ? '+' : '') + fmtVel(vRad));
  setText('info-hvel', fmtVel(vTan));
  setText('info-apoapsis', c.apoE !== null ? fmtDist(c.apoE) : '—');
  setText('info-periapsis', c.periE !== null ? fmtDist(c.periE) : '—');
  setText('info-moon-dist', fmtDist(altM));
  setText('info-throttle', Math.round(c.throttle * 100) + '%');

  // Δv remaining for the active engine (Tsiolkovsky against current mass).
  // Uses vacuum Isp — gives a bound that's accurate in space and slightly
  // optimistic in atmosphere. Real flight manuals quote vacuum Δv too.
  const active = c.getActive();
  if (active && active.fuelMass > 0 && active.currentFuel > 0) {
    const isp = active.ispVac || active.isp || 300;
    const massNow = c.getCurrentMass();
    const massDry = massNow - active.currentFuel;
    if (massDry > 0 && massNow > massDry) {
      const dv = isp * G0 * Math.log(massNow / massDry);
      setText('info-dv', (dv / 1000).toFixed(2) + ' km/s');
    } else {
      setText('info-dv', '—');
    }
  } else {
    setText('info-dv', '—');
  }

  // Heat display with colour
  const heatT = c.capsule.temperature.toFixed(0);
  const heatMax = c.capsule.maxTemp;
  let heatCls = '';
  if (c.capsule.temperature > heatMax * 0.8) heatCls = 'alarm';
  else if (c.capsule.temperature > heatMax * 0.5) heatCls = 'warn';
  setText('info-heat', heatT + ' / ' + heatMax + ' °C', heatCls);

  // G-force: proper acceleration from thrust + drag only (excludes gravity),
  // which is what a real accelerometer on the craft would read.
  if (c.currentG !== undefined) {
    setText('info-g', c.currentG.toFixed(1) + ' g');
  } else {
    setText('info-g', '—');
  }

  // Objective
  const obj = document.getElementById('objective-text');
  if (obj) obj.textContent = getObjectiveText(c, earth, moon);

  // SAS indicator
  const sasEl = document.getElementById('sas-indicator');
  if (sasEl) {
    sasEl.textContent = c.sas ? 'ON' : 'OFF';
    sasEl.className = c.sas ? 'on' : 'off';
  }

  // Stages
  renderStageList(c);

  // Fire milestone toasts
  checkMilestoneToasts(c);

  // Houston feed + mode indicator
  const capcomEl = document.getElementById('capcom-feed');
  const modeEl = document.getElementById('capcom-mode');
  if (g.houston) {
    if (capcomEl) {
      const html = formatHoustonFeed(g.houston.feed);
      if (html) capcomEl.innerHTML = html;
    }
    if (modeEl) {
      modeEl.textContent = g.houston.mode.toUpperCase();
      modeEl.className = g.houston.mode;
    }
  } else if (modeEl) {
    modeEl.textContent = 'OFF';
    modeEl.className = 'off';
  }
}

function renderStageList(c) {
  const el = document.getElementById('hud-stages-body');
  if (!el) return;
  let html = '';
  for (let i = c.activeStageIdx; i < c.stages.length; i++) {
    const s = c.stages[i];
    const pct = s.fuelMass > 0 ? (s.currentFuel / s.fuelMass * 100) : 0;
    const active = i === c.activeStageIdx;
    const fillCls = pct < 15 ? 'low' : '';
    html += `<div class="stage ${active ? 'active' : ''}">
      <div class="stage-name">${active ? '▶ ' : '  '}${s.name}</div>
      <div class="bar"><div class="bar-fill ${fillCls}" style="width:${pct.toFixed(0)}%"></div></div>
      <div class="stage-stat">${pct.toFixed(0)}% · ${fmtMass(s.currentFuel)} / ${fmtMass(s.fuelMass)} · ${(s.thrust / 1e3).toFixed(0)} kN</div>
    </div>`;
  }
  const cap = c.capsule;
  const pct = cap.fuelMass > 0 ? (cap.currentFuel / cap.fuelMass * 100) : 100;
  const active = c.isCapsuleOnly();
  let extras = '';
  if (cap.parachutesDeployed) extras += ' · 🪂 deployed';
  else if (cap.parachuteRipped) extras += ' · ❌ chute ripped';
  html += `<div class="stage ${active ? 'active' : ''}">
    <div class="stage-name">${active ? '▶ ' : '  '}${cap.name}</div>
    <div class="bar"><div class="bar-fill" style="width:${pct.toFixed(0)}%"></div></div>
    <div class="stage-stat">${pct.toFixed(0)}% · ${fmtMass(cap.currentFuel)} / ${fmtMass(cap.fuelMass)}${extras}</div>
  </div>`;
  el.innerHTML = html;
}

function showEnding(success) {
  const g = window.game;
  const c = g.craft;
  document.getElementById('ending-title').textContent = success ? 'MISSION SUCCESS' : 'MISSION FAILED';
  document.getElementById('ending-title').className = success ? 'success' : 'failure';

  const reasonEl = document.getElementById('ending-reason');
  if (success) {
    const mission = c.blueprint.mission || 'moon';
    let msg;
    switch (mission) {
      case 'suborbital':
        msg = `You flew a ${c.name} above the Kármán line and splashed down safely. Just like Alan Shepard.`;
        break;
      case 'leo-return':
        msg = `You launched a ${c.name}, orbited Earth, and came home alive. ${c.name.includes('Vostok') ? 'Poyekhali!' : 'Textbook flight.'}`;
        break;
      case 'orbit-only':
        msg = `You launched a ${c.name} and put a payload into orbit. The space age has begun.`;
        break;
      case 'moon-orbit':
        msg = `Artemis I complete — you flew a ${c.name} around the Moon and splashed down safely.`;
        break;
      case 'moon':
      default:
        msg = `You launched a ${c.name}, landed on the Moon, and brought the crew home alive.`;
    }
    reasonEl.textContent = msg;
  } else {
    reasonEl.textContent = c.destructionReason || '';
  }

  // Show only the milestones relevant to this mission
  const mission = c.blueprint.mission || 'moon';
  const allMilestones = [
    ['leftPad', 'Lifted off launch pad'],
    ['reachedSpace', 'Crossed 100 km — reached space'],
    ['reachedOrbit', 'Achieved stable Earth orbit'],
    ['satelliteDeployed', 'Satellite separated and deployed'],
    ['approachedMoon', 'Entered lunar sphere of influence'],
    ['enteredMoonOrbit', 'Captured into Moon orbit'],
    ['landedOnMoon', 'Landed safely on the Moon'],
    ['launchedFromMoon', 'Lifted back off from the Moon'],
    ['returnedToEarthAtmo', 'Re-entered Earth atmosphere'],
    ['landedOnEarth', 'Landed safely on Earth'],
  ];
  const relevantKeys = {
    suborbital:    ['leftPad', 'reachedSpace', 'returnedToEarthAtmo', 'landedOnEarth'],
    'leo-return':  ['leftPad', 'reachedSpace', 'reachedOrbit', 'returnedToEarthAtmo', 'landedOnEarth'],
    'orbit-only':  ['leftPad', 'reachedSpace', 'reachedOrbit', 'satelliteDeployed'],
    'moon-orbit':  ['leftPad', 'reachedSpace', 'reachedOrbit', 'approachedMoon', 'enteredMoonOrbit', 'returnedToEarthAtmo', 'landedOnEarth'],
    moon:          allMilestones.map(m => m[0]),
  }[mission];
  let html = '';
  for (const [k, label] of allMilestones) {
    if (relevantKeys && !relevantKeys.includes(k)) continue;
    const done = c.milestones[k];
    html += `<div class="milestone ${done ? 'done' : ''}">${done ? '✓' : '○'} ${label}</div>`;
  }
  document.getElementById('ending-milestones').innerHTML = html;

  document.getElementById('ending-stats').innerHTML = `
    <div>Max altitude: ${fmtDist(c.maxAltitude)}</div>
    <div>Max velocity: ${fmtVel(c.maxVelocity)}</div>
    <div>Max G-force: ${c.maxG.toFixed(1)} g</div>
    <div>Peak heat: ${c.maxHeat.toFixed(0)} °C</div>
    <div>Mission time: ${fmtTime(c.missionTime)}</div>
  `;

  document.getElementById('ending').classList.remove('hidden');
}

function hideEnding() {
  document.getElementById('ending').classList.add('hidden');
}
