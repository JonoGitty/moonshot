// =============================================================================
// input.js — keyboard controls.
//
// Continuous keys (W/S/A/D/Q/E) read every frame in updateInput().
// Discrete keys handled on keydown.
// Time-warp is throttled by flight conditions (no warp in thick atmosphere
// or under thrust — physics would drift).
// =============================================================================

const HELD_KEYS = new Set(['w', 's', 'a', 'd', 'q', 'e', 'shift']);

function isHeld(k) { return !!window.game.pressedKeys[k]; }

document.addEventListener('keydown', (e) => {
  if (!window.game) return;
  const key = e.key.toLowerCase();
  // Menu: let clicks handle it. ESC aborts in flight
  if (window.game.state === 'menu') return;

  // Ignore if modifier
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  if (HELD_KEYS.has(key)) {
    window.game.pressedKeys[key] = true;
    e.preventDefault();
    return;
  }

  // Pilot intervention disengages autopilot for control-grabbing keys
  const isPilotControl = [' ', 'z', 'x', 'g'].includes(key);
  if (isPilotControl && window.game.houston && window.game.houston.mode === 'auto') {
    window.game.houston.disengageAutopilot('pilot intervention');
  }

  switch (key) {
    case ' ':
      if (window.game.state === 'flight') {
        if (window.game.craft.separate()) showToast('STAGE SEPARATION');
        else showToast('NO STAGES LEFT', 'warn');
      }
      e.preventDefault();
      break;

    case 't':
      if (window.game.craft) {
        window.game.craft.sas = !window.game.craft.sas;
        if (!window.game.craft.sas) window.game.craft.sasMode = 'free';
        showToast('SAS ' + (window.game.craft.sas ? 'ON' : 'OFF'));
      }
      break;

    case 'h':
      if (window.game.craft) {
        window.game.craft.sas = true;
        window.game.craft.sasMode = 'prograde';
        showToast('HOLD: PROGRADE');
      }
      break;
    case 'j':
      if (window.game.craft) {
        window.game.craft.sas = true;
        window.game.craft.sasMode = 'retrograde';
        showToast('HOLD: RETROGRADE');
      }
      break;
    case 'r':
      if (window.game.craft) {
        window.game.craft.sas = true;
        window.game.craft.sasMode = 'radial';
        showToast('HOLD: RADIAL OUT');
      }
      break;
    case 'f':
      if (window.game.craft) {
        window.game.craft.sasMode = 'free';
        showToast('SAS: FREE');
      }
      break;

    case 'g':
      if (window.game.craft) {
        const r = window.game.craft.deployParachutes();
        if (r.ok) showToast('PARACHUTES DEPLOYED');
        else showToast(r.reason, 'warn');
      }
      break;

    case 'm':
      window.game.mapMode = !window.game.mapMode;
      break;

    case 'p':
      if (window.game.state === 'flight') {
        window.game.paused = !window.game.paused;
        showToast(window.game.paused ? 'PAUSED' : 'UNPAUSED');
      }
      break;

    case 'z':
      if (window.game.craft) window.game.craft.throttle = 0;
      break;

    case 'x':
      if (window.game.craft) window.game.craft.throttle = 1;
      break;

    case ',':
    case '<':
      if (window.game.timeWarpIdx > 0) {
        window.game.timeWarpIdx--;
        window.game.timeWarp = TIME_WARP_LEVELS[window.game.timeWarpIdx];
      }
      break;
    case '.':
    case '>':
      adjustWarpUp();
      break;

    case '[':
      window.game.targetZoom *= 0.6;
      window.game.targetZoom = clamp(window.game.targetZoom, 2e-7, 8);
      break;
    case ']':
      window.game.targetZoom *= 1.65;
      window.game.targetZoom = clamp(window.game.targetZoom, 2e-7, 8);
      break;

    case 'l':
      // Cycle Houston mode: off → assist → auto → off
      if (window.game.state === 'flight') {
        const order = ['off', 'assist', 'auto'];
        const cur = window.game.houston ? window.game.houston.mode : 'off';
        const next = order[(order.indexOf(cur) + 1) % order.length];
        if (next === 'off') {
          window.game.houston = null;
          document.getElementById('hud-capcom').classList.add('hidden');
          showToast('HOUSTON: OFF', 'warn');
        } else {
          if (!window.game.houston) {
            window.game.houston = new HoustonAssist(window.game, next);
          } else {
            window.game.houston.mode = next;
          }
          document.getElementById('hud-capcom').classList.remove('hidden');
          showToast('HOUSTON: ' + next.toUpperCase(), 'success');
        }
      }
      break;

    case 'escape':
      if (window.game.state === 'flight' || window.game.state === 'ending') {
        returnToMenu();
      }
      break;
  }
});

document.addEventListener('keyup', (e) => {
  if (!window.game) return;
  const key = e.key.toLowerCase();
  if (HELD_KEYS.has(key)) {
    window.game.pressedKeys[key] = false;
    e.preventDefault();
  }
});

// Mouse wheel for zoom (a very light touch — most flying uses [/])
document.addEventListener('wheel', (e) => {
  if (!window.game || window.game.state !== 'flight') return;
  if (e.deltaY > 0) window.game.targetZoom *= 0.9;
  else window.game.targetZoom *= 1.12;
  window.game.targetZoom = clamp(window.game.targetZoom, 2e-7, 8);
  e.preventDefault();
}, { passive: false });

function adjustWarpUp() {
  const g = window.game;
  if (!g.craft) return;
  const altE = g.earth.altitude(g.craft.pos);
  // Caps: atmospheric flight is very dt-sensitive; thrust is also sensitive.
  let maxIdx = TIME_WARP_LEVELS.length - 1;
  if (altE < ATMOSPHERE_HEIGHT) maxIdx = Math.min(maxIdx, 3);      // 10×
  if (g.craft.thrusting) maxIdx = Math.min(maxIdx, 3);             // 10×
  if (g.timeWarpIdx < maxIdx) {
    g.timeWarpIdx++;
    g.timeWarp = TIME_WARP_LEVELS[g.timeWarpIdx];
  } else {
    showToast('MAX WARP FOR THIS CONDITION', 'warn');
  }
}

// Called each frame from game.js
function updateInput(dt) {
  const g = window.game;
  if (g.state !== 'flight' || !g.craft || g.paused) return;
  const c = g.craft;

  // Any pilot input disengages autopilot
  const pilotInput = isHeld('w') || isHeld('s') || isHeld('a') || isHeld('d') || isHeld('q') || isHeld('e');
  if (pilotInput && g.houston && g.houston.mode === 'auto') {
    g.houston.disengageAutopilot('pilot input detected');
    c.targetAngle = null;        // release Houston's held attitude
  }

  // Throttle ramp
  if (isHeld('w')) c.throttle = Math.min(1, c.throttle + dt * 0.6);
  if (isHeld('s')) c.throttle = Math.max(0, c.throttle - dt * 0.6);

  // Rotation input — A (CCW +) / D (CW −); Q/E are fine steps.
  // Rates are tuned so a ~2 s press gets you through a comfortable chunk of
  // a gravity turn; released keys plus SAS bring you back to zero quickly.
  const coarseTorque = 0.3;              // rad/s²
  const fineTorque   = 0.08;
  const maxAngVel    = 0.5;              // rad/s (≈ 29°/s)
  c.rotating = 0;
  if (isHeld('a')) { c.rotating = 1;  c.angularVel += coarseTorque * dt; c.sasMode = 'free'; }
  if (isHeld('d')) { c.rotating = -1; c.angularVel -= coarseTorque * dt; c.sasMode = 'free'; }
  if (isHeld('q')) { c.rotating = 1;  c.angularVel += fineTorque   * dt; c.sasMode = 'free'; }
  if (isHeld('e')) { c.rotating = -1; c.angularVel -= fineTorque   * dt; c.sasMode = 'free'; }
  c.angularVel = clamp(c.angularVel, -maxAngVel, maxAngVel);
}
