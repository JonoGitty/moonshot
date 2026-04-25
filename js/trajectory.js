// =============================================================================
// trajectory.js — forward-simulate craft + moving bodies for the map view.
//
// Crucially this advances the Moon alongside the craft, because any trans-
// lunar trajectory needs to hit where the Moon *will be*, not where it is now.
// Pure gravity (no thrust, no drag) — assumes the player stops burning to
// plan. Good enough for intuition and quick corrections.
//
// Returns:
//   { craftPath: [{x,y}], bodyPaths: [[{x,y}], ...], hit: name|null }
// =============================================================================

function predictTrajectory(craft, bodies, steps, dt) {
  // Snapshot craft
  const c = { pos: { ...craft.pos }, vel: { ...craft.vel } };

  // Snapshot bodies (we'll mutate these local copies only)
  const bs = bodies.map(b => ({
    name: b.name,
    mass: b.mass,
    radius: b.radius,
    fixed: b.fixed,
    pos: { ...b.pos },
    vel: { ...b.vel },
  }));

  const craftPath = [{ ...c.pos }];
  const bodyPaths = bs.map(b => [{ ...b.pos }]);
  let hit = null;

  for (let step = 0; step < steps; step++) {
    // --- Update bodies (n-body, excluding themselves) ---
    const newVels = new Array(bs.length);
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.fixed) { newVels[i] = { ...b.vel }; continue; }
      let ax = 0, ay = 0;
      for (let j = 0; j < bs.length; j++) {
        if (i === j) continue;
        const o = bs[j];
        const dx = o.pos.x - b.pos.x;
        const dy = o.pos.y - b.pos.y;
        const r2 = dx * dx + dy * dy;
        const r = Math.sqrt(r2);
        if (r < 1) continue;
        const a = G * o.mass / r2;
        ax += a * dx / r;
        ay += a * dy / r;
      }
      newVels[i] = { x: b.vel.x + ax * dt, y: b.vel.y + ay * dt };
    }
    for (let i = 0; i < bs.length; i++) {
      bs[i].vel = newVels[i];
      bs[i].pos.x += bs[i].vel.x * dt;
      bs[i].pos.y += bs[i].vel.y * dt;
    }

    // --- Update craft ---
    let ax = 0, ay = 0;
    let crashed = false;
    for (const b of bs) {
      const dx = b.pos.x - c.pos.x;
      const dy = b.pos.y - c.pos.y;
      const r2 = dx * dx + dy * dy;
      const r = Math.sqrt(r2);
      if (r < b.radius) { crashed = true; hit = b.name; break; }
      const a = G * b.mass / r2;
      ax += a * dx / r;
      ay += a * dy / r;
    }
    if (crashed) break;

    c.vel.x += ax * dt;
    c.vel.y += ay * dt;
    c.pos.x += c.vel.x * dt;
    c.pos.y += c.vel.y * dt;

    // Sample path (keep size reasonable — every step is fine for ≤5000 pts)
    craftPath.push({ ...c.pos });
    for (let i = 0; i < bs.length; i++) bodyPaths[i].push({ ...bs[i].pos });

    // Bail out if craft gets absurdly far (escape trajectory)
    const earth = bs[0];
    const farDx = c.pos.x - earth.pos.x, farDy = c.pos.y - earth.pos.y;
    if (farDx * farDx + farDy * farDy > 4e18) break;   // ~2 Gm
  }

  return { craftPath, bodyPaths, hit };
}
