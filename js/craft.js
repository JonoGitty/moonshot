// =============================================================================
// craft.js — rocket physics: stages, thrust, drag, re-entry heating, landing.
// Integrator: semi-implicit Euler (matches Body, stable for orbits).
// Units: SI throughout. Angles: 0 = +X, CCW positive.
// =============================================================================

class Craft {
  constructor(blueprint, startPos, startVel, startAngle) {
    this.blueprint = blueprint;
    this.name = blueprint.name;

    this.pos = { ...startPos };
    this.vel = { ...startVel };
    this.angle = startAngle ?? 0;           // where the nose points
    this.angularVel = 0;                    // rad/s

    // Clone stage specs into a mutable runtime state
    this.stages = blueprint.stages.map(s => ({ ...s, currentFuel: s.fuelMass }));
    this.capsule = {
      ...blueprint.capsule,
      currentFuel: blueprint.capsule.fuelMass,
      temperature: 0,
      parachutesDeployed: false,
      parachuteRipped: false,
    };

    this.activeStageIdx = 0;                // 0..stages.length; capsule is the "next" stage after the last
    this.throttle = 0;                      // 0..1
    this.rotating = 0;                      // -1, 0, +1 from input
    this.sas = true;                        // stability assist dampens angular velocity
    this.sasMode = 'free';                  // free | prograde | retrograde | radial
    this.thrusting = false;

    this.destroyed = false;
    this.destructionReason = null;
    this.landed = false;
    this.landedOn = null;

    this.missionTime = 0;
    this.maxAltitude = 0;
    this.maxVelocity = 0;
    this.maxG = 0;
    this.maxHeat = 0;

    // Orbital elements around Earth / Moon, computed each tick. null if unbound.
    this.apoE = null; this.periE = null;
    this.apoM = null; this.periM = null;

    this.milestones = {
      leftPad: false,
      reachedSpace: false,            // > 100 km
      reachedOrbit: false,            // periapsis > 80 km and bound
      satelliteDeployed: false,       // capsule separated from rocket in orbit
      dockedWithISS: false,           // closed within 500 m of ISS with <5 m/s relV
      approachedMoon: false,          // inside Moon SOI
      enteredMoonOrbit: false,        // bound to Moon with periM > surface
      landedOnMoon: false,
      launchedFromMoon: false,        // lifted back off after landing
      returnedToEarthAtmo: false,     // re-entered after visiting Moon
      landedOnEarth: false,
    };

    // Visuals
    this.stageFlame = 0;                    // smoothed throttle for flame rendering
    this.heatGlow = 0;                      // 0..1 re-entry plasma intensity
    this.droppedStages = [];                // [{pos, vel, angle, angularVel, stage, life}]
  }

  // --- Mass / fuel / thrust helpers ---
  getCurrentMass() {
    let m = this.capsule.dryMass + this.capsule.currentFuel;
    for (let i = this.activeStageIdx; i < this.stages.length; i++) {
      m += this.stages[i].dryMass + this.stages[i].currentFuel;
    }
    return m;
  }

  getActive() {
    if (this.activeStageIdx < this.stages.length) return this.stages[this.activeStageIdx];
    return this.capsule;
  }

  isCapsuleOnly() { return this.activeStageIdx >= this.stages.length; }

  // Total visible height (m) from base to nose — used so the craft sits on
  // the surface visually (with craft.pos at its geometric centre).
  getHeight() {
    let h = this.capsule.length;
    for (let i = this.activeStageIdx; i < this.stages.length; i++) h += this.stages[i].length;
    return h;
  }

  // Isp varies between sea-level and vacuum. Linear blend over 0..70 km.
  interpolateIsp(stage, altitude) {
    const sl = stage.isp;
    const vac = stage.ispVac ?? sl * 1.15;
    const f = clamp(altitude / 70000, 0, 1);
    return sl + (vac - sl) * f;
  }

  velocityRelativeTo(body) {
    const sv = body.surfaceVelocity(this.pos);
    return { x: this.vel.x - sv.x, y: this.vel.y - sv.y };
  }

  // --- Staging / parachutes ---
  separate() {
    if (this.activeStageIdx >= this.stages.length) return false;
    const dropped = this.stages[this.activeStageIdx];
    // Nudge the dropped stage backwards so it visually drifts away
    const nudge = 3; // m/s retrograde
    const heading = { x: Math.cos(this.angle), y: Math.sin(this.angle) };

    // Special case: SLS-style side-mounted boosters jettison SIDEWAYS as a
    // pair, not straight back. Spawn two debris entries — one to each side.
    if (dropped.pattern === 'sls-srb-flank') {
      const perp = { x: -heading.y, y: heading.x };     // perpendicular (local east)
      const sideKick = 8;                               // m/s sideways
      // Find the core stage's dimensions for debris visuals
      const core = this.stages[this.activeStageIdx + 1] || { length: 30, diameter: 6, color: '#eee', detailColor: '#222' };
      const srbShape = {
        length: core.length * 0.75,
        diameter: core.diameter * 0.45,
        color: '#eee',
        detailColor: '#555',
      };
      for (const sign of [1, -1]) {
        this.droppedStages.push({
          pos: { x: this.pos.x + perp.x * core.diameter * 0.6 * sign, y: this.pos.y + perp.y * core.diameter * 0.6 * sign },
          vel: { x: this.vel.x - heading.x * nudge + perp.x * sideKick * sign, y: this.vel.y - heading.y * nudge + perp.y * sideKick * sign },
          angle: this.angle,
          angularVel: 0.3 * sign + (Math.random() - 0.5) * 0.2,
          stage: srbShape,
          life: 60,
        });
      }
      this.activeStageIdx++;
      return true;
    }

    this.droppedStages.push({
      pos: { ...this.pos },
      vel: { x: this.vel.x - heading.x * nudge, y: this.vel.y - heading.y * nudge },
      angle: this.angle,
      angularVel: (Math.random() - 0.5) * 0.4,
      stage: dropped,
      life: 90,
    });
    // Give the craft a tiny forward pop (equal and opposite)
    this.vel.x += heading.x * nudge * 0.1;
    this.vel.y += heading.y * nudge * 0.1;
    this.activeStageIdx++;
    return true;
  }

  deployParachutes() {
    if (!this.isCapsuleOnly()) return { ok: false, reason: 'Parachutes attach to capsule only — drop all stages first' };
    if (this.capsule.parachuteRipped) return { ok: false, reason: 'Parachutes ripped — cannot redeploy' };
    if (this.capsule.parachutesDeployed) return { ok: false, reason: 'Already deployed' };
    this.capsule.parachutesDeployed = true;
    return { ok: true };
  }

  // --- Orbital element calculation around a body (valid only when bound) ---
  computeOrbit(body) {
    const posRel = Vec.sub(this.pos, body.pos);
    const velRel = Vec.sub(this.vel, body.vel);
    const r = Vec.mag(posRel);
    const v2 = Vec.mag2(velRel);
    const mu = G * body.mass;
    const E = v2 / 2 - mu / r;                  // specific orbital energy
    if (E >= 0) return null;                    // unbound (parabolic/hyperbolic)
    const a = -mu / (2 * E);                    // semi-major axis
    const h = posRel.x * velRel.y - posRel.y * velRel.x; // specific angular momentum (z)
    const ecc2 = 1 + (2 * E * h * h) / (mu * mu);
    const e = ecc2 > 0 ? Math.sqrt(ecc2) : 0;
    const periR = a * (1 - e);
    const apoR = a * (1 + e);
    return {
      periapsis: periR - body.radius,
      apoapsis: apoR - body.radius,
      period: 2 * Math.PI * Math.sqrt(a * a * a / mu),
      eccentricity: e,
    };
  }

  // --- Update mission milestones + cached orbital elements ---
  updateMilestones(earth, moon) {
    const altE = earth.altitude(this.pos);
    const altM = moon.altitude(this.pos);

    if (altE > 100) this.milestones.leftPad = true;
    if (altE > 100e3) this.milestones.reachedSpace = true;

    const orbE = this.computeOrbit(earth);
    if (orbE) {
      this.apoE = orbE.apoapsis;
      this.periE = orbE.periapsis;
      if (this.periE > 80e3 && this.apoE > 80e3) this.milestones.reachedOrbit = true;
    } else {
      this.apoE = null; this.periE = null;
    }

    if (altM < MOON_SOI) {
      this.milestones.approachedMoon = true;
      const orbM = this.computeOrbit(moon);
      if (orbM) {
        this.apoM = orbM.apoapsis;
        this.periM = orbM.periapsis;
        if (this.periM > 0) this.milestones.enteredMoonOrbit = true;
      } else {
        this.apoM = null; this.periM = null;
      }
    } else {
      this.apoM = null; this.periM = null;
    }

    if (this.milestones.approachedMoon && altE < ATMOSPHERE_HEIGHT && altE > 0 && !this.landed) {
      this.milestones.returnedToEarthAtmo = true;
    }

    // Satellite considered "deployed" once only the capsule remains while
    // in orbit — i.e. the player (or autopilot) has separated the carrier
    // stages. For Sputnik this is the actual mission-complete trigger.
    if (this.milestones.reachedOrbit && this.isCapsuleOnly()) {
      this.milestones.satelliteDeployed = true;
    }
  }

  // --- The main physics step ---
  update(dt, bodies) {
    if (this.destroyed) return;

    const earth = bodies[0];
    const moon = bodies[1];

    // ---------- Handle landed state (snap to surface; allow liftoff) ----------
    if (this.landed) {
      this.missionTime += dt;
      const landedBody = (this.landedOn === 'Earth') ? earth : moon;

      // The craft is fixed to a rotating body, so its world position must
      // rotate with the body. Without this the pad drifts away from the
      // rocket (Earth turns east while the rocket sits in inertial space).
      const ω = landedBody.rotRate || 0;
      if (ω !== 0) {
        const dθ = ω * dt;
        const cosθ = Math.cos(dθ), sinθ = Math.sin(dθ);
        const rx = this.pos.x - landedBody.pos.x;
        const ry = this.pos.y - landedBody.pos.y;
        this.pos.x = landedBody.pos.x + rx * cosθ - ry * sinθ;
        this.pos.y = landedBody.pos.y + rx * sinθ + ry * cosθ;
      }

      const n = landedBody.normalTo(this.pos);
      const halfH = this.getHeight() / 2;
      // Snap so the rocket's BASE sits on the surface (pos = geometric centre)
      this.pos.x = landedBody.pos.x + n.x * (landedBody.radius + halfH);
      this.pos.y = landedBody.pos.y + n.y * (landedBody.radius + halfH);
      this.vel = landedBody.surfaceVelocity(this.pos);
      this.angle = Math.atan2(n.y, n.x);         // stand upright
      this.angularVel = 0;

      // Visual feedback: show flame whenever the player holds throttle even
      // if we don't have enough TWR to lift off yet.
      this.thrusting = this.throttle > 0;
      this.stageFlame = this.stageFlame * 0.85 + (this.thrusting ? this.throttle : 0) * 0.15;

      // Liftoff check: if thrust along normal exceeds local gravity
      if (this.throttle > 0) {
        const active = this.getActive();
        if (active.currentFuel > 0) {
          const mass = this.getCurrentMass();
          const thrustMag = active.thrust * this.throttle;
          const hdg = { x: Math.cos(this.angle), y: Math.sin(this.angle) };
          const thrustAlongN = thrustMag * (hdg.x * n.x + hdg.y * n.y);
          const gSurf = G * landedBody.mass / (landedBody.radius * landedBody.radius);
          if (thrustAlongN / mass > gSurf) {
            this.landed = false;
            this.milestones.leftPad = true;
            // Tiny nudge so we don't immediately re-collide
            this.pos.x += n.x * 2;
            this.pos.y += n.y * 2;
          }
        }
      }
      // Milestones (for stats screen even while landed)
      this.updateMilestones(earth, moon);
      return;
    }

    this.missionTime += dt;

    // ---------- SAS / rotation ----------
    // Autopilot / external targetAngle (set each frame by Houston) — runs
    // EVERY physics substep so that at high time-warp the attitude tracks
    // precisely instead of overshooting.
    if (this.targetAngle !== undefined && this.targetAngle !== null && this.rotating === 0) {
      const diff = normAngle(this.targetAngle - this.angle);
      this.angularVel = clamp(diff * 2.5, -0.6, 0.6);
    } else if (this.sasMode !== 'free' && this.rotating === 0) {
      // Point toward SAS target direction (prograde/retrograde/radial)
      const target = this.sasTargetAngle(earth);
      if (target !== null) {
        const diff = normAngle(target - this.angle);
        const desiredAngVel = clamp(diff * 1.5, -0.8, 0.8);
        this.angularVel += (desiredAngVel - this.angularVel) * Math.min(1, dt * 4);
      }
    } else if (this.sas && this.rotating === 0) {
      this.angularVel *= Math.pow(0.05, dt);
    }
    this.angle += this.angularVel * dt;
    this.angle = normAngle(this.angle);

    // ---------- Gravity from all bodies ----------
    let ax = 0, ay = 0;
    for (const b of bodies) {
      const dx = b.pos.x - this.pos.x;
      const dy = b.pos.y - this.pos.y;
      const r2 = dx * dx + dy * dy;
      const r = Math.sqrt(r2);
      if (r < 1) continue;
      const a = G * b.mass / r2;
      ax += a * dx / r;
      ay += a * dy / r;
    }

    // Proper acceleration (what an accelerometer on the craft measures) excludes
    // gravity. A craft in free-fall reads 0g; a craft on a pad reads 1g. We track
    // thrust + drag separately so the G-force HUD shows the real felt load.
    let properAx = 0, properAy = 0;
    // On the pad the pad's normal force balances gravity — felt G = 1g upward.
    if (this.landed) {
      const body = bodies.find(b => b.name === this.landedOn);
      if (body) {
        const ndx = this.pos.x - body.pos.x;
        const ndy = this.pos.y - body.pos.y;
        const nr = Math.sqrt(ndx * ndx + ndy * ndy);
        if (nr > 1) {
          const gSurf = G * body.mass / (nr * nr);
          properAx = gSurf * ndx / nr;
          properAy = gSurf * ndy / nr;
        }
      }
    }

    // ---------- Thrust ----------
    this.thrusting = false;
    const altE = earth.altitude(this.pos);
    if (this.throttle > 0) {
      const active = this.getActive();
      if (active.currentFuel > 0) {
        const isp = this.interpolateIsp(active, altE);
        const thrustMag = active.thrust * this.throttle;
        const flow = thrustMag / (isp * G0);
        const mass = this.getCurrentMass();
        const acc = thrustMag / mass;
        const thrAx = acc * Math.cos(this.angle);
        const thrAy = acc * Math.sin(this.angle);
        ax += thrAx;
        ay += thrAy;
        properAx += thrAx;
        properAy += thrAy;
        if (!this.blueprint.infiniteFuel) {
          active.currentFuel = Math.max(0, active.currentFuel - flow * dt);
        }
        this.thrusting = true;
      }
    }
    this.stageFlame = this.stageFlame * 0.85 + (this.thrusting ? this.throttle : 0) * 0.15;

    // ---------- Atmospheric drag + aerothermal heating ----------
    if (altE < ATMOSPHERE_HEIGHT) {
      const rho = atmDensity(altE);
      const vAtm = earth.surfaceVelocity(this.pos);
      const vRel = { x: this.vel.x - vAtm.x, y: this.vel.y - vAtm.y };
      const vr = Vec.mag(vRel);
      if (vr > 0.1 && rho > 1e-8) {
        const active = this.getActive();
        let dragArea = active.dragCoeff * active.area;

        // Parachutes: only effective in thick-enough air and low speed, else rip
        if (this.isCapsuleOnly() && this.capsule.parachutesDeployed && !this.capsule.parachuteRipped) {
          if (vr > 400 && altE > this.capsule.parachuteAlt) {
            this.capsule.parachuteRipped = true;
            this.capsule.parachutesDeployed = false;
            if (typeof showToast === 'function') showToast('PARACHUTE RIPPED - too fast', 'danger');
          } else if (altE < this.capsule.parachuteAlt + 2000) {
            // Smoothly engage as it falls through the deploy altitude
            const eng = clamp((this.capsule.parachuteAlt + 2000 - altE) / 2000, 0, 1);
            dragArea += this.capsule.parachuteDrag * eng;
          }
        }

        const qPressure = 0.5 * rho * vr * vr;        // Pa
        const dragForce = qPressure * dragArea;       // N
        const mass = this.getCurrentMass();
        const dragAcc = dragForce / mass;
        const dAx = -dragAcc * vRel.x / vr;
        const dAy = -dragAcc * vRel.y / vr;
        ax += dAx;
        ay += dAy;
        properAx += dAx;
        properAy += dAy;

        // Lifting-body physics (Space Shuttle, spaceplanes). Lift is generated
        // perpendicular to velocity, on the side the nose is pitched toward.
        // Magnitude ~ liftCoeff × drag (classic L/D ratio). Real Shuttle L/D
        // ~4.5 subsonic, ~1 hypersonic — we use ~3.5 as an average.
        if (this.isCapsuleOnly() && this.capsule.liftCoeff > 0) {
          // Perpendicular to velocity (rotate 90° CCW)
          const perpX = -vRel.y / vr;
          const perpY =  vRel.x / vr;
          // Project the nose direction onto this perpendicular — gives signed
          // angle-of-attack component. Positive = nose pitched "up" relative
          // to velocity, produces upward lift.
          const noseX = Math.cos(this.angle);
          const noseY = Math.sin(this.angle);
          const aoa = noseX * perpX + noseY * perpY;     // in [-1, 1]
          const liftAcc = dragAcc * this.capsule.liftCoeff * aoa;
          const liftDx = liftAcc * perpX;
          const liftDy = liftAcc * perpY;
          ax += liftDx;
          ay += liftDy;
          properAx += liftDx;
          properAy += liftDy;
        }

        // Sutton-Graves stagnation heat flux (W/m²), simplified
        let q = 1.7415e-4 * Math.sqrt(rho / 0.5) * vr * vr * vr;

        // Direction-aware: for a capsule, the heat shield is opposite the nose
        // (rear-first entry). For the Shuttle, the whole BELLY is the heat
        // shield, so positive angle-of-attack keeps heating manageable.
        const vDir = { x: vRel.x / vr, y: vRel.y / vr };
        let heatMult;
        if (this.capsule.shape === 'shuttle-orbiter') {
          // AoA above velocity ⇒ belly into airflow. Penalise low-AoA entries
          // (nose-first shuttle would burn up like a real one).
          const perpX = -vDir.y;
          const perpY =  vDir.x;
          const noseX = Math.cos(this.angle);
          const noseY = Math.sin(this.angle);
          const aoa = Math.abs(noseX * perpX + noseY * perpY);     // [0,1]
          // aoa=1 (90° — belly perfectly perpendicular to flow): 0.3× heating
          // aoa=0 (0° — nose into flow): 3× heating
          heatMult = 3.0 - 2.7 * aoa;
        } else {
          const shieldDir = { x: -Math.cos(this.angle), y: -Math.sin(this.angle) };
          const shieldDot = shieldDir.x * vDir.x + shieldDir.y * vDir.y;
          heatMult = shieldDot >= 0 ? 1.0 - shieldDot * 0.5 : 2.5 - shieldDot * 2.0;
        }

        this.heatGlow = clamp(q * heatMult / 3e6, 0, 1);

        if (this.isCapsuleOnly()) {
          // Capsule heat shield: radiates while heating. Scale factor tuned so a
          // standard Apollo-style entry peaks around 2000-3000°C (within Saturn
          // V CSM maxTemp=3800°C) and a too-steep entry burns up quickly.
          const T = this.capsule.temperature + 293;        // Kelvin
          const radCool = 0.85 * STEFAN_BOLTZMANN * T * T * T * T;
          const net = q * heatMult - radCool;
          this.capsule.temperature = Math.max(0, this.capsule.temperature + net * dt * 1e-5);
          this.maxHeat = Math.max(this.maxHeat, this.capsule.temperature);
          if (this.capsule.temperature > this.capsule.maxTemp) {
            this.destroyed = true;
            this.destructionReason = 'Heat shield failed — capsule burned up on re-entry';
          }
        } else {
          // Lower stages have no shield: dynamic-pressure structural limit (≈ Max-Q)
          if (qPressure > 90e3) {
            this.destroyed = true;
            this.destructionReason = 'Aerodynamic failure — stage disintegrated under Max-Q';
          }
        }
      }
    } else {
      // Radiative cooling in vacuum
      this.capsule.temperature = Math.max(0, this.capsule.temperature - 60 * dt);
      this.heatGlow *= Math.pow(0.2, dt);
    }

    // ---------- Semi-implicit Euler integration ----------
    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;

    // ---------- Stats ----------
    const speed = Vec.mag(this.vel);
    this.maxVelocity = Math.max(this.maxVelocity, speed);
    this.maxAltitude = Math.max(this.maxAltitude, altE);
    // Proper (felt) acceleration — excludes gravity. This is what a real
    // accelerometer on the craft would read. Apollo S-IC peak was ~3.9g, S-II
    // ~1.9g, re-entry ~7g — if the HUD shows much more than that, something's
    // actually overstressing the craft (bad pitch program, etc).
    const feltG = Math.sqrt(properAx * properAx + properAy * properAy) / G0;
    this.currentG = feltG;
    this.maxG = Math.max(this.maxG, feltG);

    // ---------- Collision / landing ----------
    // Treat craft as a sphere of half-height radius so the base touches first
    const half = this.getHeight() / 2;
    for (const b of bodies) {
      const dx = this.pos.x - b.pos.x;
      const dy = this.pos.y - b.pos.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < b.radius + half) {
        const vSurf = this.velocityRelativeTo(b);
        const vSurfMag = Vec.mag(vSurf);
        // Shuttle-like spaceplanes land at runway speed (~100 m/s). Capsules
        // under parachutes touch down at ~5-10 m/s. Default max is 20 on
        // Earth (parachute tolerance), 12 on the Moon.
        let safeSpeed = (b.name === 'Earth') ? 20 : 12;
        if (this.isCapsuleOnly() && this.capsule.landingSpeed) {
          if (b.name === 'Earth') safeSpeed = this.capsule.landingSpeed;
        }
        if (vSurfMag < safeSpeed) {
          this.landed = true;
          this.landedOn = b.name;
          this.throttle = 0;
          if (b.name === 'Earth') this.milestones.landedOnEarth = true;
          if (b.name === 'Moon') this.milestones.landedOnMoon = true;
          const n = b.normalTo(this.pos);
          this.pos.x = b.pos.x + n.x * (b.radius + half);
          this.pos.y = b.pos.y + n.y * (b.radius + half);
          this.vel = b.surfaceVelocity(this.pos);
          this.angle = Math.atan2(n.y, n.x);
          this.angularVel = 0;
        } else {
          this.destroyed = true;
          this.destructionReason = `Surface impact at ${vSurfMag.toFixed(1)} m/s — LITHOBRAKING`;
        }
      }
    }

    // Moon liftoff detection
    if (this.milestones.landedOnMoon && !this.landed && !this.milestones.launchedFromMoon) {
      if (moon.altitude(this.pos) > 1000) this.milestones.launchedFromMoon = true;
    }

    this.updateMilestones(earth, moon);

    // ---------- Dropped stage debris (gravity only) ----------
    for (const d of this.droppedStages) {
      let dAx = 0, dAy = 0;
      for (const b of bodies) {
        const dx = b.pos.x - d.pos.x;
        const dy = b.pos.y - d.pos.y;
        const r2 = dx * dx + dy * dy;
        const r = Math.sqrt(r2);
        if (r < 1) continue;
        const a = G * b.mass / r2;
        dAx += a * dx / r;
        dAy += a * dy / r;
      }
      d.vel.x += dAx * dt;
      d.vel.y += dAy * dt;
      d.pos.x += d.vel.x * dt;
      d.pos.y += d.vel.y * dt;
      d.angle += d.angularVel * dt;
      d.life -= dt;
    }
    this.droppedStages = this.droppedStages.filter(d => d.life > 0);
  }

  // Target angle for the SAS autopilot (prograde / retrograde / radial).
  sasTargetAngle(earth) {
    const vRel = this.velocityRelativeTo(earth);
    const speed = Vec.mag(vRel);
    if (speed < 0.5) return null;
    const pro = Math.atan2(vRel.y, vRel.x);
    if (this.sasMode === 'prograde') return pro;
    if (this.sasMode === 'retrograde') return normAngle(pro + Math.PI);
    if (this.sasMode === 'radial') {
      const n = earth.normalTo(this.pos);
      return Math.atan2(n.y, n.x);
    }
    return null;
  }
}
