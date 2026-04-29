// =============================================================================
// game.js — state machine, main loop, camera, mission start/end.
// =============================================================================

window.game = {
  state: 'menu',                // menu | flight | ending
  craft: null,
  earth: null,
  moon: null,
  bodies: [],

  // camera.angle rotates the view so local "up" (from Earth to craft) = screen up
  camera: { x: 0, y: 0, scale: 1, angle: 0 },
  targetZoom: 1,

  timeWarp: 1,
  timeWarpIdx: 0,
  mapMode: false,
  paused: false,

  pressedKeys: {},
  lastAccel: 0,                 // for G-force display
  houston: null,                // HoustonAssist instance (or null when disabled)
  watchdog: null,               // HoustonWatchdog instance — runs alongside Houston
  // Ghost CSM: when the LM undocks in lunar orbit, the CSM itself becomes
  // a passive orbital object tracked here. It orbits Moon on Keplerian
  // motion until the LM ascends back and docks.
  ghostCSM: null,               // { pos, vel, dryMass, fuelMass }
};

let canvas = null;
let ctx = null;
let stars = null;
let pendingShipKey = null;

function showBriefing(shipKey) {
  const blueprint = SPACECRAFT[shipKey];
  if (!blueprint) return;
  pendingShipKey = shipKey;
  const b = blueprint.briefing || {
    missionName: blueprint.name,
    date: '—',
    crew: '—',
    difficulty: 1,
    historical: blueprint.subtitle || '',
    phases: [],
  };
  document.getElementById('briefing-eyebrow').textContent = 'MISSION BRIEFING · ' + blueprint.name.toUpperCase();
  document.getElementById('briefing-title').textContent = b.missionName;
  document.getElementById('briefing-date').textContent = b.date;
  document.getElementById('briefing-crew').textContent = b.crew;
  const stars = '★★★★★☆☆☆☆☆'.substring(5 - b.difficulty, 10 - b.difficulty);
  document.getElementById('briefing-difficulty').textContent = stars + ' · ' + b.difficulty + '/5';
  document.getElementById('briefing-historical').textContent = b.historical;

  // Famous launch quotes — shown in the briefing if defined
  const quoteEl = document.getElementById('briefing-quote');
  if (quoteEl) {
    quoteEl.textContent = b.preLaunchQuote ? '🎙 ' + b.preLaunchQuote : '';
    quoteEl.style.display = b.preLaunchQuote ? '' : 'none';
  }

  let html = '';
  b.phases.forEach((p, i) => {
    const dv = p.dv ? `<span class="phase-dv">Δv ${p.dv}</span>` : '';
    const dir = p.direction ? `<span class="phase-meta">${p.direction}</span>` : (p.duration ? `<span class="phase-meta">${p.duration}</span>` : '');
    const sub = p.target ? `<div class="phase-meta">${p.target}</div>` : '';
    html += `<div class="phase-row"><span class="phase-idx">${i + 1}.</span><div><span class="phase-name">${p.name}</span>${sub}</div>${dir}${dv}</div>`;
  });
  document.getElementById('briefing-phases').innerHTML = html;

  // Trajectory preview for stock missions: build a planner-style plan
  // object on the fly and draw it. Hidden if no mapping exists or the
  // ship is sandbox/satellite.
  const briefingCanvas = document.getElementById('briefing-canvas');
  if (briefingCanvas && window.drawTrajectoryPreview) {
    const plan = stockPlanFor(blueprint, shipKey);
    if (plan) {
      briefingCanvas.style.display = '';
      window.drawTrajectoryPreview(briefingCanvas, plan, blueprint);
    } else {
      briefingCanvas.style.display = 'none';
    }
  }

  document.getElementById('briefing').classList.remove('hidden');
  document.getElementById('menu').classList.add('hidden');
}

// Build a planner-shape object for stock missions so the briefing can
// reuse drawTrajectoryPreview. Returns null for ships with no planner
// mapping (sandbox, suborbital).
function stockPlanFor(blueprint, shipKey) {
  const m = blueprint.mission;
  const profile = blueprint.profile || {};
  let missionKey, params;
  switch (m) {
    case 'leo-return':
      missionKey = 'leo';
      params = { altitude: Math.round((profile.targetApo || 200e3) / 1000) };
      break;
    case 'iss-dock':
      missionKey = 'iss'; params = {}; break;
    case 'moon-flyby':
      missionKey = 'moonFlyby';
      params = { parkingAlt: Math.round((profile.targetApo || 200e3) / 1000) };
      break;
    case 'moon-orbit':
      missionKey = 'moonOrbit';
      params = {
        parkingAlt: Math.round((profile.targetApo || 200e3) / 1000),
        lunarAlt: Math.round((profile.lunarApo || 110e3) / 1000),
        lunarOrbits: 2,
      };
      break;
    case 'moon':
      missionKey = 'moonLand';
      params = {
        parkingAlt: Math.round((profile.targetApo || 200e3) / 1000),
        lunarAlt: Math.round((profile.lunarApo || 110e3) / 1000),
        staySec: profile.lunarStaySec || 30,
      };
      break;
    default: return null;
  }
  try {
    return planMission(missionKey, params, shipKey);
  } catch (e) { return null; }
}

function hideBriefing() {
  document.getElementById('briefing').classList.add('hidden');
  if (window.game.state === 'menu') {
    document.getElementById('menu').classList.remove('hidden');
  }
  pendingShipKey = null;
}

function init() {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
  stars = initStarfield();
  resize();
  window.addEventListener('resize', resize);

  // Ship selection → show briefing first
  document.querySelectorAll('.ship').forEach(el => {
    el.addEventListener('click', () => showBriefing(el.dataset.ship));
  });
  const backBtn = document.getElementById('briefing-back');
  if (backBtn) backBtn.addEventListener('click', hideBriefing);
  const launchBtn = document.getElementById('briefing-launch');
  if (launchBtn) launchBtn.addEventListener('click', () => {
    const key = pendingShipKey;                          // snapshot before hideBriefing clears it
    hideBriefing();
    startMission(key);
  });
  const restart = document.getElementById('restart-btn');
  if (restart) restart.addEventListener('click', returnToMenu);

  // Real mission planner: profile + ship + Δv evaluation
  setupMissionPlanner();

  requestAnimationFrame(loop);
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Run the full planner UI lifecycle. Reads inputs, calls planMission, fills
// out the result panel, and on launch starts the mission with the planned
// burn schedule attached.
let plannerLastResult = null;
function setupMissionPlanner() {
  const missionSel = document.getElementById('planner-mission');
  const shipSel = document.getElementById('planner-ship');
  const evalBtn = document.getElementById('planner-evaluate');
  const launchBtn = document.getElementById('planner-launch');
  const descEl = document.getElementById('planner-mission-desc');
  const paramsEl = document.getElementById('planner-params');
  const shipStats = document.getElementById('planner-ship-stats');

  function rebuildParams() {
    const m = window.MISSION_CATALOG[missionSel.value];
    descEl.textContent = m ? m.description : '';
    paramsEl.innerHTML = '';
    if (!m) return;
    for (const cfg of (m.params || [])) {
      const wrap = document.createElement('label');
      wrap.className = 'planner-param';
      wrap.innerHTML = `${cfg.label} <input type="number" data-key="${cfg.key}" value="${cfg.default}" min="${cfg.min}" max="${cfg.max}">`;
      paramsEl.appendChild(wrap);
    }
  }

  function refreshShipStats() {
    const bp = SPACECRAFT[shipSel.value];
    if (!bp) return;
    const dv = window.rocketDeltaV(bp);
    const twr = bp.stages && bp.stages[0] ? bp.stages[0].thrust / (dv.liftoffMass * G0) : 0;
    shipStats.innerHTML = `
      <div><strong>${bp.name}</strong> · ${bp.subtitle || ''}</div>
      <div>Liftoff mass: <span class="num">${(dv.liftoffMass / 1000).toFixed(1)} t</span></div>
      <div>Total Δv: <span class="num">${(dv.totalDv / 1000).toFixed(2)} km/s</span></div>
      <div>Liftoff TWR: <span class="num">${twr.toFixed(2)}</span></div>
    `;
  }

  function readParams() {
    const out = {};
    paramsEl.querySelectorAll('input[data-key]').forEach(inp => {
      out[inp.dataset.key] = parseFloat(inp.value);
    });
    return out;
  }

  function evaluate() {
    const result = window.planMission(missionSel.value, readParams(), shipSel.value);
    plannerLastResult = result;
    document.getElementById('planner-result').classList.remove('hidden');

    document.getElementById('planner-dv-need').textContent = (result.dvNeeded / 1000).toFixed(2) + ' km/s';
    document.getElementById('planner-dv-have').textContent = (result.dvAvailable / 1000).toFixed(2) + ' km/s';
    const margin = result.margin;
    const marginEl = document.getElementById('planner-dv-margin');
    marginEl.textContent = (margin >= 0 ? '+' : '') + (margin / 1000).toFixed(2) + ' km/s';
    marginEl.className = 'stat-value ' + (margin < 0 ? 'bad' : (margin < 500 ? 'warn' : 'good'));
    document.getElementById('planner-twr').textContent = result.twr.toFixed(2);
    document.getElementById('planner-mass').textContent = (result.liftoffMass / 1000).toFixed(1) + ' t';
    const verdictEl = document.getElementById('planner-verdict');
    verdictEl.textContent = result.ok ? '✓ GO' : '✗ NO-GO';
    verdictEl.className = 'stat-value ' + (result.ok ? 'good' : 'bad');

    // Errors first (red), then warnings (amber)
    const warnEl = document.getElementById('planner-warnings');
    warnEl.innerHTML = '';
    for (const e of (result.errors || [])) {
      const div = document.createElement('div');
      div.className = 'planner-error';
      div.textContent = '✗ ' + e;
      warnEl.appendChild(div);
    }
    for (const w of result.warnings) {
      const div = document.createElement('div');
      div.className = 'planner-warning';
      div.textContent = '⚠ ' + w;
      warnEl.appendChild(div);
    }

    // Burn schedule table
    const burnsEl = document.getElementById('planner-burns');
    burnsEl.innerHTML = '<thead><tr><th>#</th><th>Phase</th><th>Δv</th><th>Direction</th><th>Target</th></tr></thead>';
    let cum = 0;
    for (let i = 0; i < result.phases.length; i++) {
      const p = result.phases[i];
      cum += (p.dv || 0);
      const tr = document.createElement('tr');
      const dvCell = p.dv > 0
        ? `<span class="num">${(p.dv).toFixed(0)} m/s</span> <span class="cum">(Σ ${(cum/1000).toFixed(2)} km/s)</span>`
        : '<span class="dim">coast</span>';
      tr.innerHTML = `<td>${i + 1}</td><td>${p.phase}</td><td>${dvCell}</td><td>${p.dir || ''}</td><td>${p.target || ''}</td>`;
      burnsEl.appendChild(tr);
    }

    // Vehicle stage breakdown
    const stagesEl = document.getElementById('planner-stages');
    stagesEl.innerHTML = '<thead><tr><th>Stage</th><th>Δv</th><th>Fuel</th><th>Isp</th></tr></thead>';
    for (const s of result.breakdown) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${s.name}</td><td><span class="num">${(s.dv/1000).toFixed(2)} km/s</span></td><td>${(s.fuelMass/1000).toFixed(1)} t</td><td>${s.isp.toFixed(0)} s</td>`;
      stagesEl.appendChild(tr);
    }

    launchBtn.disabled = !result.ok;
    launchBtn.style.opacity = result.ok ? '1' : '0.5';

    // Trajectory preview canvas
    const canvas = document.getElementById('planner-canvas');
    if (canvas && window.drawTrajectoryPreview) {
      window.drawTrajectoryPreview(canvas, result, result.blueprint);
    }
  }

  function launch() {
    if (!plannerLastResult || !plannerLastResult.ok) return;
    startPlannedMission(plannerLastResult);
  }

  missionSel.addEventListener('change', () => { rebuildParams(); refreshShipStats(); });
  shipSel.addEventListener('change', refreshShipStats);
  evalBtn.addEventListener('click', evaluate);
  launchBtn.addEventListener('click', launch);
  rebuildParams();
  refreshShipStats();
}

// Launch a planned mission: clone the ship's blueprint, override profile +
// mission type to match the planned trajectory, attach the burn schedule so
// Houston can narrate it.
function startPlannedMission(plan) {
  const base = plan.blueprint;
  const blueprint = Object.assign({}, base);
  blueprint.profile = Object.assign({}, base.profile, plan.profile);
  blueprint.mission = plan.missionType;
  blueprint.briefing = Object.assign({}, base.briefing, {
    missionName: 'PLANNED — ' + plan.mission.name,
    historical: plan.mission.description,
    phases: plan.phases.map(p => ({
      name: p.phase,
      duration: '',
      dv: p.dv > 0 ? `${(p.dv).toFixed(0)} m/s` : '',
      direction: p.dir || '',
      target: p.target || '',
    })),
  });
  blueprint.plannedBurns = plan.phases;
  SPACECRAFT.__custom = blueprint;
  startMission('__custom');
}

// Attach a planner-derived burn schedule to stock missions so the in-flight
// route-adherence narration + (future) trajectory overlay have something to
// reference. The custom planner already does this for __custom missions
// via startPlannedMission. Returns the blueprint unchanged if no mapping
// exists (e.g. for the X-1 sandbox or suborbital hops).
function attachStockPlan(blueprint, shipKey) {
  if (blueprint.plannedBurns) return blueprint;        // already set (custom)
  const plan = stockPlanFor(blueprint, shipKey);
  if (plan && plan.phases) {
    blueprint.plannedBurns = plan.phases;
    blueprint.plannedBudget = plan.totalDv;
    blueprint.plannedVerdict = plan.verdict;
  }
  return blueprint;
}

function startMission(shipKey) {
  const blueprint = SPACECRAFT[shipKey];
  if (!blueprint) return;
  attachStockPlan(blueprint, shipKey);

  // --- Setup Earth (fixed at origin) ---
  window.game.earth = new Body({
    name: 'Earth',
    mass: EARTH_MASS,
    radius: EARTH_RADIUS,
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    color: '#3a80c5',
    landColor: '#4a8f5c',
    atmosphereHeight: ATMOSPHERE_HEIGHT,
    atmosphereColor: '#5090ff',
    rotRate: EARTH_ROT_RATE,
    fixed: true,
  });

  // --- Setup Moon (orbiting Earth) ---
  const craters = [];
  for (let i = 0; i < 32; i++) {
    craters.push({
      ang: Math.random() * Math.PI * 2,
      dist: 0.15 + Math.random() * 0.7,
      r: 0.025 + Math.random() * 0.08,
    });
  }
  // Compute Moon's starting angle from the mission's real launch date so
  // the real trajectory actually works out (TLI phase angle correct, etc.)
  let moonStartAngleRad = 0;
  let sunAngleRad = 0;
  if (blueprint.briefing && blueprint.briefing.launchJD) {
    const lonDeg = moonEclipticLongitude(blueprint.briefing.launchJD);
    moonStartAngleRad = lonDeg * Math.PI / 180;
    sunAngleRad = sunEclipticLongitude(blueprint.briefing.launchJD) * Math.PI / 180;
  }
  window.game.sunAngle = sunAngleRad;
  const moonCos = Math.cos(moonStartAngleRad);
  const moonSin = Math.sin(moonStartAngleRad);
  window.game.moon = new Body({
    name: 'Moon',
    mass: MOON_MASS,
    radius: MOON_RADIUS,
    pos: { x: MOON_DISTANCE * moonCos, y: MOON_DISTANCE * moonSin },
    // Tangential velocity (perpendicular to radius, CCW)
    vel: { x: -MOON_ORBITAL_V * moonSin, y: MOON_ORBITAL_V * moonCos },
    color: '#c8c8c8',
    rotRate: MOON_ROT_RATE,
    craters,
    fixed: false,
  });

  window.game.bodies = [window.game.earth, window.game.moon];

  // --- International Space Station (orbital target, not a gravity source) ---
  // Real ISS orbit: 408 km altitude, 51.6° inclination, 92.7 min period.
  // We ignore inclination (all motion is in the 2D ecliptic plane in our
  // simulation), but altitude and orbital speed are real. Start the ISS at
  // a phasing point so crewed flights (Soyuz, Falcon 9) can rendezvous with
  // ~4-6 orbits of catch-up.
  const issAlt = 408e3;
  const issR = EARTH_RADIUS + issAlt;
  const issV = Math.sqrt(EARTH_MU / issR);
  // Place the ISS ahead of the launch pad so crewed missions can catch up
  // after launch (phase-angle leadup ~180° for a 6-orbit chase).
  const issStartAng = LAUNCH_LAT + Math.PI;
  window.game.iss = {
    pos: { x: issR * Math.cos(issStartAng), y: issR * Math.sin(issStartAng) },
    vel: { x: -issV * Math.sin(issStartAng), y: issV * Math.cos(issStartAng) },
    radius: 55,                              // ISS length ~109 m — use half for collision
    name: 'ISS',
  };

  // --- Launch pad (visual only; rotates with Earth) ---
  window.game.launchPad = {
    bodyName: 'Earth',
    lat: LAUNCH_LAT,           // latitude angle where the pad sits
    towerHeight: Math.max(80, blueprint.totalHeight * 0.85),
    padWidth: Math.max(50, blueprint.totalHeight * 0.5),
  };

  // --- Spawn craft on the launch pad ---
  const phi = LAUNCH_LAT;
  // Place pos at the rocket's geometric centre with its base on the surface.
  // We need the blueprint's total height to know the offset.
  const totalH = blueprint.totalHeight;
  const padR = EARTH_RADIUS + totalH / 2 + 2;
  const padX = padR * Math.cos(phi);
  const padY = padR * Math.sin(phi);
  const padPos = { x: padX, y: padY };
  // Eastward velocity from Earth rotation
  const padVel = {
    x: -EARTH_ROT_RATE * padY,
    y: EARTH_ROT_RATE * padX,
  };
  const craft = new Craft(blueprint, padPos, padVel, phi);
  // Starts landed so the game treats them as "on pad" until they thrust
  craft.landed = true;
  craft.landedOn = 'Earth';
  window.game.craft = craft;
  resetCelebratedMilestones();

  // --- Camera ---
  window.game.camera.x = padX;
  window.game.camera.y = padY;
  // Pre-align camera rotation so the rocket starts upright — otherwise the
  // view would lerp from world-orientation to local-up over the first second.
  window.game.camera.angle = -Math.PI / 2 - phi;
  // Scale so the rocket is roughly ~150 pixels tall on screen initially.
  // Higher clamp lets small rockets (R-7, Mercury) be visibly sized too.
  const autoScale = clamp(150 / blueprint.totalHeight, 0.3, 6);
  window.game.camera.scale = autoScale;
  window.game.targetZoom = autoScale;

  window.game.state = 'flight';
  window.game.timeWarp = 1;
  window.game.timeWarpIdx = 0;
  window.game.mapMode = false;
  window.game.paused = false;

  // Show HUD, hide menu
  document.querySelector('.hud').classList.remove('hidden');
  document.getElementById('menu').classList.add('hidden');
  hideEnding();

  // Houston CapCom mode (off / assist / auto)
  const modeRadio = document.querySelector('input[name="houston-mode"]:checked');
  const mode = modeRadio ? modeRadio.value : 'assist';
  if (mode === 'off') {
    window.game.houston = null;
    document.getElementById('hud-capcom').classList.add('hidden');
  } else {
    window.game.houston = new HoustonAssist(window.game, mode);
    document.getElementById('hud-capcom').classList.remove('hidden');
  }

  // Houston Watchdog — runs in all CapCom modes (even 'off' for callouts).
  // Loads the per-mission plan registered on window.MISSION_PLANS[shipKey]
  // if one exists; otherwise just runs the standard checks.
  if (typeof HoustonWatchdog !== 'undefined') {
    if (!window.game.watchdog) window.game.watchdog = new HoustonWatchdog(window.game);
    window.game.watchdog.reset(shipKey);
  }

  showToast('T+0 · ' + blueprint.name.toUpperCase() + ' READY', 'success');
  showToast('Hold W for throttle. Tilt east with A.');
}

// ---- ISS orbit (Keplerian under Earth only) ----
function updateISS(dt) {
  const iss = window.game.iss;
  const earth = window.game.earth;
  const dx = earth.pos.x - iss.pos.x;
  const dy = earth.pos.y - iss.pos.y;
  const r2 = dx * dx + dy * dy;
  const r = Math.sqrt(r2);
  if (r < 1) return;
  const a = EARTH_MU / r2;
  iss.vel.x += a * dx / r * dt;
  iss.vel.y += a * dy / r * dt;
  iss.pos.x += iss.vel.x * dt;
  iss.pos.y += iss.vel.y * dt;

  // Dock detection: if craft is capsule-only, has reached orbit, and is very
  // close to the ISS with matching velocity, flag the dock milestone.
  const c = window.game.craft;
  if (c && !c.destroyed && !c.milestones.dockedWithISS && c.milestones.reachedOrbit) {
    const ddx = c.pos.x - iss.pos.x;
    const ddy = c.pos.y - iss.pos.y;
    const dist = Math.sqrt(ddx * ddx + ddy * ddy);
    const dvx = c.vel.x - iss.vel.x;
    const dvy = c.vel.y - iss.vel.y;
    const relV = Math.sqrt(dvx * dvx + dvy * dvy);
    if (dist < 500 && relV < 5) {
      c.milestones.dockedWithISS = true;
      if (typeof showToast === 'function') showToast('DOCKED WITH ISS', 'success');
    }
  }
}

// ---- Ghost CSM helpers ----
function updateGhostCSM(dt) {
  const g = window.game;
  const csm = g.ghostCSM;
  // Sum gravity from all bodies (Moon dominates when in lunar vicinity)
  let ax = 0, ay = 0;
  for (const b of g.bodies) {
    const dx = b.pos.x - csm.pos.x;
    const dy = b.pos.y - csm.pos.y;
    const r2 = dx * dx + dy * dy;
    const r = Math.sqrt(r2);
    if (r < 1) continue;
    const acc = G * b.mass / r2;
    ax += acc * dx / r;
    ay += acc * dy / r;
  }
  csm.vel.x += ax * dt;
  csm.vel.y += ay * dt;
  csm.pos.x += csm.vel.x * dt;
  csm.pos.y += csm.vel.y * dt;
}

// Detach the CSM capsule from the craft, spawn a ghost CSM that orbits
// alongside. The craft loses the capsule's mass/fuel for the duration.
function undockCSM() {
  const g = window.game;
  if (g.ghostCSM || !g.craft) return false;
  const cap = g.craft.capsule;
  g.ghostCSM = {
    pos: { x: g.craft.pos.x, y: g.craft.pos.y },
    vel: { x: g.craft.vel.x, y: g.craft.vel.y },
    dryMass: cap.dryMass,
    fuelMass: cap.fuelMass,
    currentFuel: cap.currentFuel,
    color: cap.color,
  };
  // Stash the original capsule props so we can restore on docking
  g.craft._stashedCapsule = {
    dryMass: cap.dryMass,
    fuelMass: cap.fuelMass,
    currentFuel: cap.currentFuel,
  };
  cap.dryMass = 0; cap.fuelMass = 0; cap.currentFuel = 0;
  showToast('CSM UNDOCKED', 'success');
  return true;
}

// Dock: merge the ghost CSM back into the craft, restore capsule mass/fuel,
// and discard the LM (all remaining stages separate).
function dockCSM() {
  const g = window.game;
  if (!g.ghostCSM || !g.craft) return false;
  const stash = g.craft._stashedCapsule;
  if (stash) {
    g.craft.capsule.dryMass = stash.dryMass;
    g.craft.capsule.fuelMass = stash.fuelMass;
    g.craft.capsule.currentFuel = g.ghostCSM.currentFuel;
    delete g.craft._stashedCapsule;
  }
  // Teleport craft to CSM's position (simplified rendezvous — real game
  // would require actually flying close to CSM)
  g.craft.pos.x = g.ghostCSM.pos.x;
  g.craft.pos.y = g.ghostCSM.pos.y;
  g.craft.vel.x = g.ghostCSM.vel.x;
  g.craft.vel.y = g.ghostCSM.vel.y;
  // Discard remaining LM stages
  while (!g.craft.isCapsuleOnly()) g.craft.separate();
  g.ghostCSM = null;
  showToast('CSM DOCKING COMPLETE', 'success');
  return true;
}

function returnToMenu() {
  window.game.state = 'menu';
  window.game.craft = null;
  window.game.ghostCSM = null;
  window.game.iss = null;
  window.game.mapMode = false;
  window.game.paused = false;
  endingScheduled = false;
  document.getElementById('menu').classList.remove('hidden');
  document.querySelector('.hud').classList.add('hidden');
  hideEnding();
}

// --- Main loop ---
let lastTime = 0;
function loop(now) {
  const realDt = lastTime ? Math.min(0.1, (now - lastTime) / 1000) : 1 / 60;
  lastTime = now;

  if (window.game.state === 'flight' && !window.game.paused) {
    constrainTimeWarp();
    updateInput(realDt);
    updatePhysics(realDt);
    if (window.game.houston) window.game.houston.update(realDt);
    checkMissionEnd();
  }
  updateCamera(realDt);

  render();

  if (window.game.state === 'flight' || window.game.state === 'ending') {
    updateHUD();
  }

  requestAnimationFrame(loop);
}

// Adaptive substepping so time warp doesn't break integration stability.
// - In atmosphere: step must be tiny (drag/heating are sensitive)
// - Under thrust: step must be small (throttle/fuel change matters)
// - In vacuum coast: step can be larger
function updatePhysics(realDt) {
  const simDt = realDt * window.game.timeWarp;
  const craft = window.game.craft;
  if (!craft) return;

  const altE = window.game.earth.altitude(craft.pos);
  let maxStep;
  if (altE < ATMOSPHERE_HEIGHT) maxStep = 0.05;
  else if (craft.thrusting) maxStep = 0.5;
  else maxStep = 2.0;

  const substeps = Math.max(1, Math.ceil(simDt / maxStep));
  const stepDt = simDt / substeps;

  let sumG = 0, gSamples = 0;
  for (let i = 0; i < substeps; i++) {
    // Autopilot's phase decisions run BEFORE physics each substep, so the
    // burn-cutoff / phase-transition logic sees the most recent state and
    // can throttle-back / re-tier warp before the next physics integration.
    // At high time warp this turns ~16 s of unwanted thrust at burn cutoff
    // into ~2 s (vacuum substep cap) — keeps autopilot precise.
    if (window.game.houston) window.game.houston.physicsTick(stepDt);
    // Watchdog runs after Houston so it sees the autopilot's setpoint
    // decisions for this substep before evaluating deviations. Pre-empts
    // Houston by capping timeWarpIdx when severity demands it.
    if (window.game.watchdog) window.game.watchdog.tick(stepDt);

    // Update bodies first (Moon moves; Earth is fixed)
    for (const b of window.game.bodies) b.update(stepDt, window.game.bodies);
    // Ghost CSM — Keplerian orbit under Moon (+ Earth) gravity
    if (window.game.ghostCSM) updateGhostCSM(stepDt);
    // ISS — Keplerian orbit under Earth gravity only (ignore Moon perturbations)
    if (window.game.iss) updateISS(stepDt);
    // Capture mass before update for G-force calc
    const massBefore = craft.getCurrentMass();
    const velBefore = { ...craft.vel };
    craft.update(stepDt, window.game.bodies);
    // Approximate G-force: Δv / dt / g₀
    const dvx = craft.vel.x - velBefore.x;
    const dvy = craft.vel.y - velBefore.y;
    const dv = Math.sqrt(dvx * dvx + dvy * dvy);
    if (stepDt > 0) { sumG += (dv / stepDt) / G0; gSamples++; }

    // If destroyed or landed partway, stop substepping
    if (craft.destroyed || craft.landed) break;
  }
  window.game.lastAccel = gSamples > 0 ? sumG / gSamples : 0;
}

// Auto-reduce time warp when the current conditions (atmosphere, active thrust)
// can no longer be simulated stably at that rate.
function constrainTimeWarp() {
  const g = window.game;
  if (!g.craft || !g.earth) return;
  const altE = g.earth.altitude(g.craft.pos);
  let maxIdx = TIME_WARP_LEVELS.length - 1;
  if (altE < ATMOSPHERE_HEIGHT) maxIdx = Math.min(maxIdx, 3);   // ≤10×
  if (g.craft.thrusting) maxIdx = Math.min(maxIdx, 3);
  if (g.timeWarpIdx > maxIdx) {
    const prev = g.timeWarp;
    g.timeWarpIdx = maxIdx;
    g.timeWarp = TIME_WARP_LEVELS[maxIdx];
    if (prev !== g.timeWarp) showToast('TIME WARP AUTO-REDUCED', 'warn');
  }
}

function updateCamera(dt) {
  const g = window.game;
  if (!g.craft || g.state !== 'flight') return;
  if (g.mapMode) return;      // map handles its own framing
  // Snap camera to craft.pos (no lerp). Craft moves ~465 m/s with Earth's
  // rotation even when "stationary" on the pad; a lerped camera falls
  // behind that velocity and shows as visible drift on screen.
  g.camera.x = g.craft.pos.x;
  g.camera.y = g.craft.pos.y;
  g.camera.scale += (g.targetZoom - g.camera.scale) * Math.min(1, dt * 4);

  // Rotate view so local-up (Earth → craft) points to screen-up. Makes launch
  // and re-entry natural: horizon is horizontal, rocket stands vertically,
  // and east-going orbits sweep to screen-right.
  const dx = g.craft.pos.x - g.earth.pos.x;
  const dy = g.craft.pos.y - g.earth.pos.y;
  const r = Math.sqrt(dx * dx + dy * dy);
  if (r > 1) {
    const target = -Math.PI / 2 - Math.atan2(dy, dx);
    let diff = target - g.camera.angle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    // Big jumps (first frame, or heavy warp) — snap; small drifts — smooth
    if (Math.abs(diff) > 0.4) g.camera.angle = target;
    else g.camera.angle += diff * Math.min(1, dt * 10);
  }
}

// Mission-specific success checks. Each rocket has its own goal — Sputnik
// just needs orbit, Mercury needs a sub-orbital hop + splashdown, etc.
function isMissionComplete(craft) {
  const mission = craft.blueprint.mission || 'moon';
  const m = craft.milestones;
  switch (mission) {
    case 'suborbital':
      return craft.landed && craft.landedOn === 'Earth' && m.reachedSpace && m.leftPad;
    case 'leo-return':
      return craft.landed && craft.landedOn === 'Earth' && m.reachedOrbit;
    case 'iss-dock':
      // Soyuz TMA-19M: dock with ISS then de-orbit home.
      return craft.landed && craft.landedOn === 'Earth' && m.dockedWithISS;
    case 'orbit-only':
      // Sputnik: reach orbit THEN deploy the satellite (separate from the
      // spent carrier). Player presses SPACE once in orbit to deploy.
      return m.reachedOrbit && m.satelliteDeployed;
    case 'moon-orbit':
      // Artemis I: reach lunar orbit or flyby, then come home. No landing.
      return craft.landed && craft.landedOn === 'Earth' && m.approachedMoon;
    case 'moon-flyby':
      // Artemis II: free-return slingshot past the Moon + splashdown. No orbit insertion.
      return craft.landed && craft.landedOn === 'Earth' && m.approachedMoon;
    case 'moon':
    default:
      // Apollo 11: go ALL the way — touch down on Moon then return
      return craft.landed && craft.landedOn === 'Earth' && m.landedOnMoon;
  }
}

let endingScheduled = false;
function checkMissionEnd() {
  const g = window.game;
  const c = g.craft;
  if (!c || endingScheduled) return;
  if (c.destroyed) {
    endingScheduled = true;
    setTimeout(() => {
      g.state = 'ending';
      showEnding(false);
    }, 1600);
    return;
  }
  if (isMissionComplete(c)) {
    endingScheduled = true;
    setTimeout(() => {
      g.state = 'ending';
      showEnding(true);
    }, 1200);
  }
}

// --- Render root ---
function render() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  drawStars(ctx, w, h, window.game.camera, stars);

  if (window.game.state === 'flight' || window.game.state === 'ending') {
    if (window.game.mapMode) {
      drawMap(ctx, w, h, window.game);
    } else {
      // Draw the close-in horizon view FIRST in un-rotated screen space: the
      // camera rotation aligns world-up to screen-up, so the horizon is just
      // a horizontal line — no need to rotate it.
      for (const b of window.game.bodies) {
        const radiusPx = b.radius * window.game.camera.scale;
        if (radiusPx > 40000) drawSurfaceView(ctx, b, window.game.camera, w, h);
      }

      // Everything else draws in the ROTATED view frame
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(window.game.camera.angle);
      ctx.translate(-w / 2, -h / 2);

      for (const b of window.game.bodies) {
        const radiusPx = b.radius * window.game.camera.scale;
        if (radiusPx <= 40000) drawBody(ctx, b, window.game.camera, w, h);
      }
      if (window.game.launchPad) drawLaunchPad(ctx, window.game.launchPad, window.game.earth, window.game.camera, w, h);
      if (window.game.craft) drawDroppedStages(ctx, window.game.craft, window.game.camera, w, h);
      if (window.game.ghostCSM) drawGhostCSM(ctx, window.game.ghostCSM, window.game.camera, w, h);
      if (window.game.iss) drawISS(ctx, window.game.iss, window.game.camera, w, h);
      if (window.game.craft) drawCraft(ctx, window.game.craft, window.game.camera, w, h);

      ctx.restore();
    }
    if (window.game.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#8eff8e';
      ctx.font = 'bold 40px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', w / 2, h / 2);
      ctx.font = '12px monospace';
      ctx.fillText('press P to resume', w / 2, h / 2 + 30);
      ctx.textAlign = 'left';
    }
  }
}

// Kick off
window.addEventListener('DOMContentLoaded', init);
