// =============================================================================
// body.js — celestial bodies (Earth, Moon).
// A Body has mass, radius, position, velocity, and rotation. Gravity from
// other bodies is integrated using semi-implicit Euler (symplectic, stable
// for orbits). Earth is `fixed` and doesn't move; Moon does.
// =============================================================================

class Body {
  constructor(opts) {
    this.name = opts.name;
    this.mass = opts.mass;
    this.radius = opts.radius;
    this.pos = opts.pos ? { ...opts.pos } : { x: 0, y: 0 };
    this.vel = opts.vel ? { ...opts.vel } : { x: 0, y: 0 };

    // Rendering
    this.color = opts.color || '#fff';
    this.landColor = opts.landColor || null;
    this.atmosphereHeight = opts.atmosphereHeight || 0;
    this.atmosphereColor = opts.atmosphereColor || null;
    this.craters = opts.craters || null;

    // Rotation
    this.rotAngle = opts.rotAngle || 0;
    this.rotRate = opts.rotRate || 0;            // rad/s

    // If fixed, position/velocity never change (only rotation advances).
    // Keeping Earth fixed avoids the barycentre wobble and makes re-entry
    // geometry predictable without sacrificing realism for this scale.
    this.fixed = !!opts.fixed;
  }

  update(dt, attractors) {
    this.rotAngle += this.rotRate * dt;
    if (this.fixed) return;

    let ax = 0, ay = 0;
    for (const a of attractors) {
      if (a === this) continue;
      const dx = a.pos.x - this.pos.x;
      const dy = a.pos.y - this.pos.y;
      const r2 = dx * dx + dy * dy;
      const r = Math.sqrt(r2);
      if (r < 1) continue;                        // avoid singularity
      const acc = G * a.mass / r2;
      ax += acc * dx / r;
      ay += acc * dy / r;
    }

    // Semi-implicit Euler: update velocity first, then position with the new v.
    // Symplectic → energy-conserving over long orbits.
    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
  }

  // Altitude of a world-space point above this body's surface (metres).
  altitude(pos) {
    const dx = pos.x - this.pos.x;
    const dy = pos.y - this.pos.y;
    return Math.sqrt(dx * dx + dy * dy) - this.radius;
  }

  // Linear velocity of the rotating surface at a given world-space point.
  // ω × r, added to the body's own orbital velocity, so a craft "landed"
  // on Earth moves with the surface (eastward at ~465 m/s at the equator).
  surfaceVelocity(pos) {
    const dx = pos.x - this.pos.x;
    const dy = pos.y - this.pos.y;
    return {
      x: this.vel.x - this.rotRate * dy,
      y: this.vel.y + this.rotRate * dx,
    };
  }

  // Outward normal (unit vector) at a world-space point.
  normalTo(pos) {
    const dx = pos.x - this.pos.x;
    const dy = pos.y - this.pos.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r === 0) return { x: 1, y: 0 };
    return { x: dx / r, y: dy / r };
  }
}
