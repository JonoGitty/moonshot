// =============================================================================
// render.js — all drawing.
//
// World is Y-up; rendering flips Y on the screen.
// Canvas rotate() rotates clockwise in screen space, so we pass -angle when
// drawing objects that have a world-space angle.
//
// Exports (globals):
//   initStarfield()         → returns a pre-rendered offscreen canvas
//   worldToScreen(pos, cam, w, h)
//   drawStars(ctx, w, h, cam, starCanvas)
//   drawBody(ctx, body, cam, w, h)
//   drawCraft(ctx, craft, cam, w, h)
//   drawDroppedStages(ctx, craft, cam, w, h)
//   drawMap(ctx, w, h, game)
//   drawAltitudeIndicator(ctx, w, h, game)
// =============================================================================

// World uses math convention (Y up). Canvas Y goes down. We deliberately do
// NOT flip Y here — the camera rotation in the main render handles orientation,
// and keeping axes aligned makes east = screen-right after rotation.
function worldToScreen(pos, cam, w, h) {
  return {
    x: (pos.x - cam.x) * cam.scale + w / 2,
    y: (pos.y - cam.y) * cam.scale + h / 2,
  };
}

// ---------- Starfield (pre-rendered) ----------
function initStarfield() {
  const size = 1600;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const sctx = c.getContext('2d');
  sctx.fillStyle = '#000';
  sctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random();
    const sz = r < 0.8 ? 1 : r < 0.96 ? 2 : 3;
    const b = 0.3 + Math.random() * 0.7;
    const tint = Math.random();
    const cr = Math.round(200 + tint * 55);
    const cg = Math.round(200 + Math.random() * 55);
    const cb = Math.round(230 + Math.random() * 25);
    sctx.fillStyle = `rgba(${cr},${cg},${cb},${b})`;
    sctx.fillRect(x, y, sz, sz);
  }
  // A few brighter stars with a cross-shape glint
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    sctx.fillStyle = 'rgba(255,255,255,0.9)';
    sctx.fillRect(x - 1, y, 3, 1);
    sctx.fillRect(x, y - 1, 1, 3);
  }
  return c;
}

function drawStars(ctx, w, h, cam, starCanvas) {
  // Slow parallax: stars drift as the camera moves, but very slightly.
  const px = -cam.x * 0.000004;
  const py = cam.y * 0.000004;
  const sw = starCanvas.width, sh = starCanvas.height;
  const ox = ((px % sw) + sw) % sw - sw;
  const oy = ((py % sh) + sh) % sh - sh;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  for (let x = ox; x < w; x += sw) {
    for (let y = oy; y < h; y += sh) {
      ctx.drawImage(starCanvas, x, y);
    }
  }
}

// ---------- Bodies ----------
function drawBody(ctx, body, cam, w, h) {
  const s = worldToScreen(body.pos, cam, w, h);
  const r = body.radius * cam.scale;

  // Canvas silently fails to rasterise radial gradients on extremely large
  // circles (millions of pixels). When we're close to the surface, the body's
  // radius in pixels is huge — switch to a horizon/sky/ground view instead.
  // This also looks a lot more like a real launch view.
  if (r > 40000) {
    drawSurfaceView(ctx, body, cam, w, h);
    return;
  }

  // Culling
  if (s.x < -r - 400 || s.x > w + r + 400 || s.y < -r - 400 || s.y > h + r + 400) return;

  if (r < 0.7) {
    // Draw as tiny coloured pixel
    ctx.fillStyle = body.color;
    ctx.fillRect(Math.round(s.x), Math.round(s.y), 2, 2);
    return;
  }

  // Atmosphere glow
  if (body.atmosphereHeight > 0 && body.atmosphereColor) {
    const atmR = (body.radius + body.atmosphereHeight) * cam.scale;
    if (atmR > r + 1) {
      const grad = ctx.createRadialGradient(s.x, s.y, r * 0.97, s.x, s.y, atmR);
      grad.addColorStop(0, rgba(body.atmosphereColor, 0.55));
      grad.addColorStop(0.5, rgba(body.atmosphereColor, 0.15));
      grad.addColorStop(1, rgba(body.atmosphereColor, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, atmR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Body disk with lit/shaded gradient (sun conceptually to the right: +X in world)
  const sunDirX = 1, sunDirY = 0;   // world
  const sunScreenDx = sunDirX;      // same on screen (Y-flip doesn't matter for +X)
  const sunScreenDy = -sunDirY;
  const litX = s.x + sunScreenDx * r * 0.4;
  const litY = s.y + sunScreenDy * r * 0.4;
  const grad = ctx.createRadialGradient(litX, litY, r * 0.1, s.x, s.y, r * 1.05);
  grad.addColorStop(0, body.color);
  grad.addColorStop(0.7, darken(body.color, 0.85));
  grad.addColorStop(1, darken(body.color, 0.35));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.fill();

  // Continents (Earth) — rotate with body.rotAngle
  if (body.landColor && r > 12) {
    ctx.save();
    // Clip to body circle
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(s.x, s.y);
    ctx.rotate(body.rotAngle);
    drawContinents(ctx, r, body.landColor);
    ctx.restore();
  }

  // Craters (Moon)
  if (body.craters && r > 12) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(s.x, s.y);
    ctx.rotate(body.rotAngle);
    for (const c of body.craters) {
      const cr = c.r * r;
      const cx = Math.cos(c.ang) * r * c.dist;
      const cy = Math.sin(c.ang) * r * c.dist;
      const g2 = ctx.createRadialGradient(cx - cr * 0.2, cy - cr * 0.2, 0, cx, cy, cr);
      g2.addColorStop(0, 'rgba(60,60,60,0.85)');
      g2.addColorStop(1, 'rgba(60,60,60,0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();
    }
    // Maria (darker patches)
    ctx.fillStyle = 'rgba(80,80,90,0.25)';
    ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.1, r * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.15, r * 0.25, r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Night side: overlay a dark gradient on the anti-sun side
  const nightGrad = ctx.createLinearGradient(s.x - r, s.y, s.x + r, s.y);
  nightGrad.addColorStop(0, 'rgba(0,0,0,0.7)');
  nightGrad.addColorStop(0.45, 'rgba(0,0,0,0.35)');
  nightGrad.addColorStop(0.6, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = nightGrad;
  ctx.fillRect(s.x - r, s.y - r, r * 2, r * 2);
  ctx.restore();

  // Rim light
  ctx.strokeStyle = rgba(body.atmosphereColor || '#ffffff', 0.15);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.stroke();
}

// Close-to-surface view. The camera rotation (applied by the caller) already
// aligns local-up with screen-up, so here the horizon is just a horizontal
// line at `h/2 + altPx` in raw screen coordinates.
function drawSurfaceView(ctx, body, cam, w, h) {
  const dx = cam.x - body.pos.x;
  const dy = cam.y - body.pos.y;
  const r = Math.sqrt(dx * dx + dy * dy);
  const alt = r - body.radius;
  const altPx = alt * cam.scale;

  // Way above atmosphere and ground off-screen → let the starfield through.
  const atmCeiling = body.atmosphereHeight || 0;
  if (alt > atmCeiling * 1.1 && altPx > h) return;

  const horizonY = h / 2 + altPx;
  const inAtm = atmCeiling > 0 && alt < atmCeiling;
  const atmFactor = inAtm ? Math.max(0, 1 - alt / atmCeiling) : 0;

  // --- Sky (above horizon) ---
  if (atmFactor > 0.01 || horizonY < h) {
    const skyGrad = ctx.createLinearGradient(0, 0, 0, Math.min(horizonY, h));
    skyGrad.addColorStop(0, `rgba(0,0,10,${0.1 + 0.55 * atmFactor})`);
    if (body.atmosphereColor && atmFactor > 0) {
      skyGrad.addColorStop(0.55, rgba(body.atmosphereColor, 0.2 * atmFactor));
      skyGrad.addColorStop(1.0, rgba(body.atmosphereColor, 0.75 * atmFactor));
    } else {
      skyGrad.addColorStop(1, 'rgba(0,0,10,0.15)');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, Math.min(horizonY, h));
  }

  // --- Ground (below horizon) ---
  if (horizonY < h) {
    const groundGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    groundGrad.addColorStop(0, body.color);
    groundGrad.addColorStop(0.5, darken(body.color, 0.7));
    groundGrad.addColorStop(1, darken(body.color, 0.35));
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, horizonY, w, h - horizonY);

    // Thin horizon stripe in land colour (Earth gets a green band)
    if (body.landColor) {
      ctx.fillStyle = body.landColor;
      ctx.fillRect(0, horizonY - 1, w, Math.max(1, h * 0.004));
    }

    // Surface detail as a position-locked pattern that slides with the ground
    // as you move. Previously used Math.random() every frame, which made the
    // ground shimmer and appear to rush left — the "water bug".
    if (altPx < h * 0.6) {
      const surfaceAng = Math.atan2(dy, dx) - (body.rotAngle || 0);
      const pxPerRad = body.radius * cam.scale;
      const offset = ((surfaceAng * pxPerRad) % 40 + 40) % 40;
      ctx.fillStyle = darken(body.color, 0.55);
      ctx.globalAlpha = 0.25;
      for (let x = -offset; x < w; x += 40) {
        ctx.fillRect(x, horizonY + 6, 22, 2);
      }
      ctx.globalAlpha = 1;
    }
  }

  // --- Clouds (only in atmosphere, below Kármán) ---
  if (inAtm && horizonY > 0) {
    // Position-locked cloud band that drifts as the craft moves laterally.
    // Render as two bands at slightly different altitudes for parallax.
    const surfaceAng = Math.atan2(dy, dx) - (body.rotAngle || 0);
    const pxPerRad = body.radius * cam.scale;
    const pxOffset = surfaceAng * pxPerRad;
    const cloudAlpha = 0.22 * Math.max(0, Math.min(1, (alt - 2e3) / 4e3)) * atmFactor;
    if (cloudAlpha > 0.01) {
      drawCloudLayer(ctx, w, h, horizonY - Math.max(30, atmFactor * h * 0.35),
        pxOffset * 0.6, cloudAlpha, 190);
      drawCloudLayer(ctx, w, h, horizonY - Math.max(60, atmFactor * h * 0.6),
        pxOffset * 0.3, cloudAlpha * 0.7, 260);
    }
  }
}

// Deterministic cloud band — puffs seeded by index so they don't jitter
// frame-to-frame. They drift horizontally with `offset` as the camera moves.
function drawCloudLayer(ctx, w, h, bandY, offset, alpha, spacing) {
  if (bandY < -60 || bandY > h + 60) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ffffff';
  const start = Math.floor((offset - w) / spacing) - 1;
  const end = Math.ceil((offset + w) / spacing) + 1;
  for (let i = start; i < end; i++) {
    // Seeded pseudo-random so puffs are stable across frames
    const seed = Math.sin(i * 12.9898) * 43758.5453;
    const jitter = (seed - Math.floor(seed)) - 0.5;
    const cx = i * spacing - offset + jitter * spacing * 0.5;
    const cy = bandY + jitter * 12;
    // Draw a puff as a cluster of overlapping ellipses
    const rx = spacing * 0.32;
    const ry = 8 + Math.abs(jitter) * 10;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx - rx * 0.7, cy + 3, rx * 0.6, ry * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + rx * 0.65, cy + 2, rx * 0.55, ry * 0.75, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawContinents(ctx, r, color) {
  ctx.fillStyle = color;
  // A handful of irregular continent blobs placed around the disc.
  const blobs = [
    { ang: 0.4, dist: 0.45, rx: 0.32, ry: 0.2, rot: 0.3 },
    { ang: 2.1, dist: 0.35, rx: 0.2, ry: 0.35, rot: 1.2 },
    { ang: -0.6, dist: 0.5, rx: 0.25, ry: 0.18, rot: -0.4 },
    { ang: -2.3, dist: 0.4, rx: 0.2, ry: 0.25, rot: 0.8 },
    { ang: 1.5, dist: 0.55, rx: 0.15, ry: 0.12, rot: 0 },
  ];
  for (const b of blobs) {
    const bx = Math.cos(b.ang) * r * b.dist;
    const by = Math.sin(b.ang) * r * b.dist;
    ctx.beginPath();
    ctx.ellipse(bx, by, r * b.rx, r * b.ry, b.rot, 0, Math.PI * 2);
    ctx.fill();
  }
  // Polar caps
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.85, r * 0.35, r * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, r * 0.85, r * 0.35, r * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- Craft ----------
function craftVisualLength(craft) {
  let L = 0;
  for (let i = craft.activeStageIdx; i < craft.stages.length; i++) L += craft.stages[i].length;
  L += craft.capsule.length;
  return L;
}

function drawCraft(ctx, craft, cam, w, h) {
  if (craft.destroyed) {
    drawExplosion(ctx, craft, cam, w, h);
    return;
  }

  const s = worldToScreen(craft.pos, cam, w, h);
  const len = craftVisualLength(craft);
  const lenPx = len * cam.scale;

  // Re-entry plasma TRAIL (drawn in screen space opposite to velocity).
  // Done before the craft so the rocket sits "on top" of the trail.
  if (craft.heatGlow > 0.05) {
    drawReentryTrail(ctx, craft, s, lenPx, cam);
  }

  // If the rocket is smaller than ~3 pixels, draw a marker instead of the sprite
  if (lenPx < 3) {
    // Small bright dot + heading tick + velocity vector
    ctx.fillStyle = craft.thrusting ? '#ffe044' : '#ffffff';
    ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
    // Heading
    const hx = Math.cos(craft.angle), hy = Math.sin(craft.angle);
    ctx.strokeStyle = 'rgba(255,230,80,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + hx * 10, s.y + hy * 10);
    ctx.stroke();
    // Velocity
    const v = Vec.mag(craft.vel);
    if (v > 1) {
      const vx = craft.vel.x / v, vy = craft.vel.y / v;
      ctx.strokeStyle = 'rgba(100,255,140,0.6)';
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + vx * 14, s.y + vy * 14);
      ctx.stroke();
    }
    // Plasma glow even when small
    if (craft.heatGlow > 0.1) {
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 16);
      g.addColorStop(0, `rgba(255,160,60,${craft.heatGlow * 0.8})`);
      g.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(craft.angle);

  // Re-entry plasma — a glowing halo hugging the heat shield (rear, -X local)
  if (craft.heatGlow > 0.05) {
    const glow = craft.heatGlow;
    const glowR = lenPx * (1.6 + glow);
    const cx = -lenPx * 0.35;
    const g = ctx.createRadialGradient(cx, 0, 0, cx, 0, glowR);
    g.addColorStop(0, `rgba(255,220,120,${glow})`);
    g.addColorStop(0.3, `rgba(255,140,50,${glow * 0.8})`);
    g.addColorStop(0.7, `rgba(255,60,30,${glow * 0.3})`);
    g.addColorStop(1, 'rgba(255,30,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, 0, glowR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Stages from bottom to top (in local frame, left → right = bottom → top)
  let xCursor = -lenPx / 2;

  // Track where the core stage (first non-virtual stage) sits so we can
  // draw side-mounted SRBs alongside it if a "virtual" SRB stage is attached.
  let coreX = null, coreLen = 0, coreDia = 0;
  for (let i = craft.activeStageIdx; i < craft.stages.length; i++) {
    const st = craft.stages[i];
    if (st.length === 0) continue;
    coreX = xCursor; coreLen = st.length * cam.scale; coreDia = st.diameter * cam.scale;
    break;
  }

  // Side-mounted SRBs (SLS-style): draw two white SRBs flanking the core
  // while the SRB stage is still attached.
  if (coreX !== null && !craft.isCapsuleOnly()) {
    const active = craft.stages[craft.activeStageIdx];
    const hasSideSrb = active && active.pattern === 'sls-srb-flank';
    if (hasSideSrb) {
      drawSideSRBs(ctx, coreX, coreLen, coreDia);
    }
  }

  // Active stages
  for (let i = craft.activeStageIdx; i < craft.stages.length; i++) {
    const st = craft.stages[i];
    const sw = st.length * cam.scale;
    const sd = st.diameter * cam.scale;
    if (sw > 0) {
      drawStageShape(ctx, xCursor, -sd / 2, sw, sd, st, i === craft.activeStageIdx);
      xCursor += sw;
    }
  }

  // Capsule placement:
  // - Default: at the top of the stack (right in local frame)
  // - Shuttle: while the ET is attached, the Orbiter rides alongside the
  //   ET rather than stacked on top. Once the capsule is alone, it sits
  //   at the stack origin and renders normally.
  const cap = craft.capsule;
  const cw = cap.length * cam.scale;
  const cd = cap.diameter * cam.scale;

  if (cap.shape === 'shuttle-orbiter' && !craft.isCapsuleOnly()) {
    // Find the ET (stage with the largest length, likely stage 1 in our blueprint).
    // Offset the Orbiter perpendicular to the stack so it sits beside the ET.
    let etX = 0, etW = 0, etDia = 0;
    for (let i = craft.activeStageIdx; i < craft.stages.length; i++) {
      const st = craft.stages[i];
      if (st.length > 0) {
        // Locate where this stage was drawn in the loop above. We stepped
        // xCursor from -lenPx/2 by each stage's width; replay to find the ET.
        let x = -lenPx / 2;
        for (let j = craft.activeStageIdx; j < i; j++) {
          if (craft.stages[j].length > 0) x += craft.stages[j].length * cam.scale;
        }
        etX = x;
        etW = st.length * cam.scale;
        etDia = st.diameter * cam.scale;
        break;
      }
    }
    // Orbiter positioned on the +Y side of the ET so its wings extend
    // outward into empty space rather than back through the tank or SRBs.
    // The SRBs sit at roughly ±(etDia/2 + srbDia/2) in Y; we place the
    // Orbiter beyond that.
    const srbDia = etDia * 0.45;
    const orbX = etX + etW * 0.20;
    // Push the Orbiter's bounding-box top edge just below the bottom SRB.
    const orbY = etDia / 2 + srbDia + cd * 0.05;
    drawCapsuleShape(ctx, orbX, orbY, cw * 0.85, cd, cap);
  } else {
    drawCapsuleShape(ctx, xCursor, -cd / 2, cw, cd, cap);
  }

  // Engine flame from the active engine (base = leftmost)
  if (craft.thrusting && craft.stageFlame > 0.03) {
    const active = craft.getActive();
    const flameLen = lenPx * 0.55 * craft.stageFlame;
    const flameW = (active.diameter || 4) * cam.scale * 0.45;
    drawFlame(ctx, -lenPx / 2, 0, flameLen, flameW);
  }

  // Parachutes (three canopies above capsule)
  if (craft.isCapsuleOnly() && craft.capsule.parachutesDeployed) {
    drawParachutes(ctx, xCursor + cw * 0.5, 0, cd * 2.2);
  }

  // Small attitude-thruster puffs when actively rotating
  if (Math.abs(craft.rotating) > 0.01 && lenPx > 20) {
    const sign = craft.rotating > 0 ? 1 : -1;
    const rx = xCursor - cw * 0.2;
    const ry = sign * cd * 0.6;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(rx, ry, cd * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // Nav arrows near the craft (screen-space, so not rotated with craft)
  drawNavArrows(ctx, s, craft, cam);
}

function drawStageShape(ctx, x, y, w, h, stage, active) {
  // Main cylinder (skipped for 'transparent' stages that draw their own shapes)
  if (stage.color !== 'transparent') {
    ctx.fillStyle = stage.color;
    ctx.fillRect(x, y, w, h);
  }

  // Paint scheme patterns — Saturn V's iconic black/white quadrants, SLS's
  // orange core band, etc. Drawn OVER the base colour.
  if (stage.pattern === 'saturn-roll' && w > 12) {
    // Black quadrants at four locations along the length; alternating top/bottom
    ctx.fillStyle = '#111';
    const blocks = [
      { ox: 0.02, oy: 0.0,  sw: 0.15, sh: 0.5 },
      { ox: 0.25, oy: 0.5,  sw: 0.15, sh: 0.5 },
      { ox: 0.48, oy: 0.0,  sw: 0.15, sh: 0.5 },
      { ox: 0.71, oy: 0.5,  sw: 0.15, sh: 0.5 },
    ];
    for (const b of blocks) {
      ctx.fillRect(x + w * b.ox, y + h * b.oy, w * b.sw, h * b.sh);
    }
    // USA text on the side if big enough
    if (w > 80) {
      ctx.fillStyle = '#111';
      ctx.font = `bold ${Math.floor(h * 0.22)}px monospace`;
      ctx.fillText('USA', x + w * 0.87, y + h * 0.6);
    }
  } else if (stage.pattern === 'saturn-band' && w > 10) {
    // Thin black band near the base
    ctx.fillStyle = '#111';
    ctx.fillRect(x, y, Math.max(1, w * 0.05), h);
  } else if (stage.pattern === 'sls-srb-pair' && w > 12) {
    // Two parallel SRBs drawn side-by-side in the same bounding box.
    // Base-rectangle is just the background; now overlay two SRBs with
    // pointed noses and black nozzles so it looks like a pair, not a tank.
    const srbH = h * 0.42;                   // each SRB's thickness
    const gap  = h - 2 * srbH;
    // Top SRB
    ctx.fillStyle = '#eee';
    ctx.fillRect(x, y, w * 0.9, srbH);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = Math.max(0.5, h * 0.02);
    ctx.strokeRect(x, y, w * 0.9, srbH);
    // Nose cone (top SRB)
    ctx.fillStyle = '#ddd';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.9, y);
    ctx.lineTo(x + w, y + srbH / 2);
    ctx.lineTo(x + w * 0.9, y + srbH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Nozzle (top SRB)
    ctx.fillStyle = '#333';
    ctx.fillRect(x - h * 0.04, y + srbH * 0.25, h * 0.04, srbH * 0.5);
    // Bottom SRB (mirror)
    const byTop = y + srbH + gap;
    ctx.fillStyle = '#eee';
    ctx.fillRect(x, byTop, w * 0.9, srbH);
    ctx.strokeRect(x, byTop, w * 0.9, srbH);
    ctx.fillStyle = '#ddd';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.9, byTop);
    ctx.lineTo(x + w, byTop + srbH / 2);
    ctx.lineTo(x + w * 0.9, byTop + srbH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#333';
    ctx.fillRect(x - h * 0.04, byTop + srbH * 0.25, h * 0.04, srbH * 0.5);
    // Black reinforcement bands on SRBs (iconic ring joints)
    ctx.fillStyle = '#333';
    for (let k = 0.25; k < 0.9; k += 0.15) {
      ctx.fillRect(x + w * k, y, w * 0.01, srbH);
      ctx.fillRect(x + w * k, byTop, w * 0.01, srbH);
    }
  } else if (stage.pattern === 'sls-srb' && w > 15) {
    // Two white Solid Rocket Boosters flanking the orange core.
    // Real SLS SRBs are ~54 m long / 3.7 m diameter (core is 65 m / 8.4 m).
    const srbLen = w * 0.75;
    const srbThk = h * 0.35;
    const srbXOffset = w * 0.08;   // start a little forward of the base
    // Top booster
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(x + srbXOffset, y - srbThk + 2, srbLen, srbThk);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = Math.max(0.5, h * 0.02);
    ctx.strokeRect(x + srbXOffset, y - srbThk + 2, srbLen, srbThk);
    // Pointed nose on SRB
    ctx.fillStyle = '#ddd';
    ctx.beginPath();
    ctx.moveTo(x + srbXOffset + srbLen, y - srbThk + 2);
    ctx.lineTo(x + srbXOffset + srbLen + srbThk * 0.8, y - srbThk / 2 + 2);
    ctx.lineTo(x + srbXOffset + srbLen, y + 2);
    ctx.closePath();
    ctx.fill();
    // Bottom booster (mirror)
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(x + srbXOffset, y + h - 2, srbLen, srbThk);
    ctx.strokeRect(x + srbXOffset, y + h - 2, srbLen, srbThk);
    ctx.fillStyle = '#ddd';
    ctx.beginPath();
    ctx.moveTo(x + srbXOffset + srbLen, y + h - 2);
    ctx.lineTo(x + srbXOffset + srbLen + srbThk * 0.8, y + h + srbThk / 2 - 2);
    ctx.lineTo(x + srbXOffset + srbLen, y + h + srbThk - 2);
    ctx.closePath();
    ctx.fill();
    // Engine nozzles on SRBs
    ctx.fillStyle = '#333';
    ctx.fillRect(x + srbXOffset - srbThk * 0.25, y - srbThk + 2, srbThk * 0.25, srbThk);
    ctx.fillRect(x + srbXOffset - srbThk * 0.25, y + h - 2, srbThk * 0.25, srbThk);
  }

  // Outline (skip for transparent stages that drew their own outlines)
  if (stage.color !== 'transparent') {
    ctx.strokeStyle = stage.detailColor;
    ctx.lineWidth = Math.max(0.5, h * 0.03);
    ctx.strokeRect(x, y, w, h);
  }
  // Detail stripes
  if (w > 20 && stage.pattern !== 'saturn-roll') {
    ctx.fillStyle = rgba(stage.detailColor, 0.3);
    for (let i = 1; i < 5; i++) {
      const tx = x + w * (i / 5);
      ctx.fillRect(tx, y, Math.max(0.5, w * 0.006), h);
    }
  }
  // Engine bell(s) at the base (leftmost edge)
  ctx.fillStyle = '#333';
  const bellW = Math.max(1, h * 0.15);
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.1);
  ctx.lineTo(x - bellW, y + h * 0.25);
  ctx.lineTo(x - bellW, y + h * 0.75);
  ctx.lineTo(x, y + h * 0.9);
  ctx.closePath();
  ctx.fill();
  // Active indicator
  if (active && w > 10) {
    ctx.fillStyle = 'rgba(100,255,140,0.35)';
    ctx.fillRect(x + w * 0.25, y + h * 0.4, w * 0.5, h * 0.2);
  }
  // Fins at base for stability look (on first stage typically)
  if (w > 30 && h > 4) {
    ctx.fillStyle = darken(stage.color, 0.7);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w * 0.15, y - h * 0.25);
    ctx.lineTo(x + w * 0.22, y);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w * 0.15, y + h + h * 0.25);
    ctx.lineTo(x + w * 0.22, y + h);
    ctx.closePath();
    ctx.fill();
  }
}

// Draw two white Solid Rocket Boosters on either side of the core stage.
// The SRBs are shorter than the core (real SLS: 54 m SRB vs 65 m core) and
// sit near the base.
// Space Shuttle Orbiter side profile. Local +X = nose. Wings below fuselage
// (-Y), vertical tail above (+Y), three SSME bells at back (-X end).
// The passed rect (x, y, w, h) is the generic capsule bounding box; the
// actual orbiter drawing extends beyond that box for wings and tail.
function drawShuttleOrbiter(ctx, x, y, w, h, cap) {
  const fuseH = h * 0.35;                 // fuselage diameter (narrow)
  const fuseY = y + h * 0.5 - fuseH / 2;
  const tailX = x;
  const noseX = x + w;
  const wingSpan = h * 0.95;              // wing extent below fuselage centreline
  const tailSpan = h * 0.55;              // vertical stabilizer height

  // --- Delta wing (extends below fuselage, rear half) ---
  const wingStartX = x + w * 0.25;
  const wingEndX   = x + w * 0.92;
  const wingTipY   = fuseY + fuseH / 2 + wingSpan;
  ctx.fillStyle = cap.color;
  ctx.strokeStyle = '#333';
  ctx.lineWidth = Math.max(0.5, h * 0.03);
  ctx.beginPath();
  ctx.moveTo(wingStartX, fuseY + fuseH);
  ctx.lineTo(wingEndX,   fuseY + fuseH);
  ctx.lineTo(x + w * 0.55, wingTipY);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // Black leading-edge thermal tiles on the wing
  ctx.strokeStyle = '#222';
  ctx.lineWidth = Math.max(1, h * 0.05);
  ctx.beginPath();
  ctx.moveTo(wingStartX, fuseY + fuseH);
  ctx.lineTo(x + w * 0.55, wingTipY);
  ctx.stroke();

  // --- Vertical stabilizer (tail fin, above fuselage at back) ---
  const tailBaseX1 = x + w * 0.02;
  const tailBaseX2 = x + w * 0.25;
  const tailTipX   = x + w * 0.14;
  const tailTipY   = fuseY - tailSpan;
  ctx.fillStyle = cap.color;
  ctx.strokeStyle = '#333';
  ctx.lineWidth = Math.max(0.5, h * 0.03);
  ctx.beginPath();
  ctx.moveTo(tailBaseX1, fuseY);
  ctx.lineTo(tailBaseX2, fuseY);
  ctx.lineTo(tailTipX,   tailTipY);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // --- Main fuselage ---
  const noseLen = w * 0.18;
  ctx.fillStyle = cap.color;
  ctx.strokeStyle = '#333';
  ctx.lineWidth = Math.max(0.5, h * 0.03);
  ctx.beginPath();
  ctx.moveTo(tailX, fuseY);
  ctx.lineTo(noseX - noseLen, fuseY);
  ctx.quadraticCurveTo(noseX, fuseY + fuseH * 0.1, noseX, fuseY + fuseH / 2);
  ctx.quadraticCurveTo(noseX, fuseY + fuseH * 0.9, noseX - noseLen, fuseY + fuseH);
  ctx.lineTo(tailX, fuseY + fuseH);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // Black belly tiles (heat shield) along underside of fuselage
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(tailX + w * 0.05, fuseY + fuseH - Math.max(1, fuseH * 0.18),
    w * 0.85, Math.max(1, fuseH * 0.18));

  // --- Payload bay outline on top (if big enough) ---
  if (w > 30) {
    ctx.fillStyle = darken(cap.color, 0.82);
    ctx.fillRect(x + w * 0.28, fuseY + fuseH * 0.1, w * 0.48, Math.max(1, fuseH * 0.18));
  }

  // --- Cockpit windows near the nose ---
  if (w > 20) {
    ctx.fillStyle = '#112';
    const winX = noseX - noseLen * 0.7;
    const winY = fuseY + fuseH * 0.1;
    const winW = noseLen * 0.6;
    const winH = fuseH * 0.3;
    ctx.fillRect(winX, winY, winW, winH);
    ctx.strokeStyle = '#445';
    ctx.lineWidth = Math.max(0.5, fuseH * 0.06);
    ctx.strokeRect(winX, winY, winW, winH);
  }

  // --- Three SSMEs (nozzle cluster) at the back, only when thrust would fire ---
  if (w > 14) {
    const nozR = Math.max(1.5, fuseH * 0.35);
    const nozX = tailX - nozR * 0.5;
    const cy = fuseY + fuseH * 0.5;
    ctx.fillStyle = '#2a2a2a';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(0.5, nozR * 0.12);
    for (const dy of [-nozR * 1.1, 0, nozR * 1.1]) {
      ctx.beginPath();
      ctx.moveTo(nozX, cy + dy - nozR * 0.5);
      ctx.lineTo(nozX - nozR, cy + dy);
      ctx.lineTo(nozX, cy + dy + nozR * 0.5);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
  }

  // --- OMS pods (little bumps either side of vertical tail) ---
  if (w > 20) {
    ctx.fillStyle = darken(cap.color, 0.85);
    const omsX = tailX + w * 0.06;
    const omsW = w * 0.15;
    const omsH = fuseH * 0.6;
    ctx.fillRect(omsX, fuseY - omsH * 0.55, omsW, omsH);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = Math.max(0.5, fuseH * 0.04);
    ctx.strokeRect(omsX, fuseY - omsH * 0.55, omsW, omsH);
  }
}

function drawSideSRBs(ctx, coreX, coreLen, coreDia) {
  const srbLen = coreLen * 0.75;
  const srbDia = coreDia * 0.45;
  const srbOffset = coreLen * 0.08;           // SRBs start a bit above core base
  // Top SRB (above the core in local +Y)
  drawSRB(ctx, coreX + srbOffset, -coreDia / 2 - srbDia, srbLen, srbDia);
  // Bottom SRB (below the core in local -Y)
  drawSRB(ctx, coreX + srbOffset,  coreDia / 2,          srbLen, srbDia);
}

function drawSRB(ctx, x, y, w, h) {
  // Main casing
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = Math.max(0.5, h * 0.08);
  ctx.strokeRect(x, y, w, h);
  // Nose cone (points toward the rocket nose, +X direction)
  ctx.fillStyle = '#ddd';
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w + h * 0.7, y + h / 2);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Segment joints (5-segment SRB)
  ctx.fillStyle = '#444';
  for (let k = 0.2; k < 0.95; k += 0.15) {
    ctx.fillRect(x + w * k, y, Math.max(0.5, w * 0.008), h);
  }
  // Nozzle at the base (−X end)
  ctx.fillStyle = '#222';
  ctx.fillRect(x - h * 0.25, y + h * 0.2, h * 0.25, h * 0.6);
}

function drawCapsuleShape(ctx, x, y, w, h, cap) {
  // Space Shuttle Orbiter: winged spaceplane, not a capsule. Draw as a side
  // profile — fuselage with pointed nose, delta wing below, vertical tail
  // above the tail section, and three SSME bells at the back.
  if (cap.shape === 'shuttle-orbiter') {
    drawShuttleOrbiter(ctx, x, y, w, h, cap);
    return;
  }

  // Soviet spherical capsules (Vostok, Sputnik) look very different from
  // Apollo/Orion cylinder+cone capsules.
  if (cap.shape === 'sphere' || cap.shape === 'sphere-antennae') {
    const cx = x + w * 0.5;
    const cy = y + h * 0.5;
    const r = Math.min(w, h) * 0.5;
    // Main sphere with subtle shading
    const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
    grad.addColorStop(0, '#f5f5f5');
    grad.addColorStop(1, darken(cap.color, 0.6));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = Math.max(0.5, r * 0.05);
    ctx.stroke();

    if (cap.shape === 'sphere-antennae') {
      // Sputnik's four whip antennae radiating outward
      ctx.strokeStyle = '#222';
      ctx.lineWidth = Math.max(0.5, r * 0.08);
      const antLen = r * 2.5;
      for (const angle of [Math.PI * 0.2, Math.PI * 0.6, Math.PI * 1.2, Math.PI * 1.6]) {
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * r * 0.8, cy + Math.sin(angle) * r * 0.8);
        ctx.lineTo(cx + Math.cos(angle) * (r * 0.8 + antLen), cy + Math.sin(angle) * (r * 0.8 + antLen));
        ctx.stroke();
      }
    } else {
      // Vostok porthole window on the forward hemisphere
      ctx.fillStyle = '#124';
      ctx.beginPath();
      ctx.arc(cx + r * 0.5, cy, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    // Heat shield hint at the bottom (ablative coating)
    if (cap.maxTemp > 1500) {
      ctx.strokeStyle = '#666';
      ctx.lineWidth = Math.max(0.5, r * 0.1);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.95, Math.PI * 0.7, Math.PI * 1.3);
      ctx.stroke();
    }
    return;
  }

  // Default: cylinder + cone (Apollo, Orion, Mercury, Dragon)
  const cylW = w * 0.45;
  ctx.fillStyle = cap.color;
  ctx.fillRect(x, y, cylW, h);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = Math.max(0.5, h * 0.04);
  ctx.strokeRect(x, y, cylW, h);

  // Conical nose (points +X)
  const noseLen = w - cylW;
  ctx.fillStyle = cap.color;
  ctx.beginPath();
  ctx.moveTo(x + cylW, y);
  ctx.lineTo(x + cylW + noseLen, y + h * 0.5);
  ctx.lineTo(x + cylW, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Heat shield on the rear (−X side) — triangular dome
  ctx.fillStyle = '#555';
  const shW = h * 0.25;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - shW, y + h * 0.5);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#222';
  ctx.stroke();

  // Little window
  if (w > 10) {
    ctx.fillStyle = '#124';
    ctx.fillRect(x + cylW * 0.2, y + h * 0.3, cylW * 0.2, h * 0.2);
  }

  // Orion Launch Abort System (LAS) — tall escape-tower spike on the nose
  if (cap.shape === 'orion-las' && w > 12) {
    const lasX = x + w;
    const lasLen = w * 0.55;
    const lasThk = h * 0.15;
    // Main tower rod
    ctx.fillStyle = '#c33';
    ctx.fillRect(lasX, y + h * 0.5 - lasThk / 2, lasLen, lasThk);
    ctx.strokeStyle = '#611';
    ctx.lineWidth = Math.max(0.5, h * 0.02);
    ctx.strokeRect(lasX, y + h * 0.5 - lasThk / 2, lasLen, lasThk);
    // Pointed tip
    ctx.fillStyle = '#eee';
    ctx.beginPath();
    ctx.moveTo(lasX + lasLen, y + h * 0.5 - lasThk / 2);
    ctx.lineTo(lasX + lasLen + lasThk * 1.2, y + h * 0.5);
    ctx.lineTo(lasX + lasLen, y + h * 0.5 + lasThk / 2);
    ctx.closePath();
    ctx.fill();
    // Abort motor at base
    ctx.fillStyle = '#611';
    ctx.fillRect(lasX - lasThk * 0.5, y + h * 0.5 - lasThk * 0.9, lasThk * 0.6, lasThk * 1.8);
  }
}

function drawFlame(ctx, x, y, len, rad) {
  const flicker = 0.75 + Math.random() * 0.5;
  const L = len * flicker;
  const g = ctx.createLinearGradient(x, y, x - L, y);
  g.addColorStop(0, 'rgba(255,255,240,1)');
  g.addColorStop(0.15, 'rgba(255,240,140,0.95)');
  g.addColorStop(0.4, 'rgba(255,170,60,0.85)');
  g.addColorStop(0.75, 'rgba(255,80,30,0.5)');
  g.addColorStop(1, 'rgba(255,30,10,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x, y - rad * 0.95);
  ctx.quadraticCurveTo(x - L * 0.2, y - rad * 1.2, x - L, y);
  ctx.quadraticCurveTo(x - L * 0.2, y + rad * 1.2, x, y + rad * 0.95);
  ctx.closePath();
  ctx.fill();
  // Inner bright core
  const g2 = ctx.createLinearGradient(x, y, x - L * 0.4, y);
  g2.addColorStop(0, 'rgba(255,255,255,0.9)');
  g2.addColorStop(1, 'rgba(255,255,200,0)');
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.moveTo(x, y - rad * 0.4);
  ctx.quadraticCurveTo(x - L * 0.15, y, x - L * 0.4, y);
  ctx.quadraticCurveTo(x - L * 0.15, y, x, y + rad * 0.4);
  ctx.closePath();
  ctx.fill();
}

function drawParachutes(ctx, x, y, size) {
  // Three canopies fanned out above the capsule (in local frame, +X above)
  const offsets = [-1, 0, 1];
  for (const k of offsets) {
    const cx = x + size * 0.8;
    const cy = k * size * 0.4;
    ctx.fillStyle = 'rgba(240,240,240,0.95)';
    ctx.strokeStyle = 'rgba(180,180,180,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.35, Math.PI * 0.25, Math.PI * 1.75, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Shroud lines down to capsule
    ctx.strokeStyle = 'rgba(200,200,200,0.7)';
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.25, cy);
    ctx.lineTo(x, 0);
    ctx.moveTo(cx + size * 0.25, cy);
    ctx.lineTo(x, 0);
    ctx.stroke();
  }
}

function drawNavArrows(ctx, screen, craft, cam) {
  // Prograde (green) / retrograde (yellow) markers on a small ring
  const v = Vec.mag(craft.vel);
  if (v < 1) return;
  const R = 52;
  const vx = craft.vel.x / v, vy = craft.vel.y / v;   // world direction — outer rotation maps it to screen
  // Prograde
  ctx.strokeStyle = 'rgba(100,255,140,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(screen.x + vx * R, screen.y + vy * R, 5, 0, Math.PI * 2);
  ctx.moveTo(screen.x + vx * (R - 5), screen.y + vy * (R - 5));
  ctx.lineTo(screen.x + vx * (R + 5), screen.y + vy * (R + 5));
  ctx.stroke();
  ctx.fillStyle = 'rgba(100,255,140,0.8)';
  ctx.fillRect(screen.x + vx * R - 1, screen.y + vy * R - 1, 2, 2);
  // Retrograde (X marker)
  const rx = -vx, ry = -vy;
  const rR = R;
  ctx.strokeStyle = 'rgba(255,200,80,0.7)';
  ctx.beginPath();
  ctx.arc(screen.x + rx * rR, screen.y + ry * rR, 5, 0, Math.PI * 2);
  ctx.moveTo(screen.x + rx * rR - 4, screen.y + ry * rR - 4);
  ctx.lineTo(screen.x + rx * rR + 4, screen.y + ry * rR + 4);
  ctx.moveTo(screen.x + rx * rR + 4, screen.y + ry * rR - 4);
  ctx.lineTo(screen.x + rx * rR - 4, screen.y + ry * rR + 4);
  ctx.stroke();
}

// Screen-space plasma trail streaming behind the craft during re-entry.
// Renders as a long bright tail plus random sparks — adds real drama without
// needing a full particle system.
function drawReentryTrail(ctx, craft, screen, lenPx, cam) {
  const glow = craft.heatGlow;
  // Trail direction = opposite velocity (in screen space)
  const v = Vec.mag(craft.vel);
  if (v < 50) return;
  // We're inside the rotated-camera block, so the trail direction in THIS
  // frame is straightforward: pre-rotation screen uses world-direction, and
  // the ctx rotation transforms it correctly.
  const dx = -craft.vel.x / v, dy = -craft.vel.y / v;

  const trailLen = Math.max(60, lenPx * 2.5) * (0.5 + 1.5 * glow);
  const trailW = Math.max(8, lenPx * 0.5) * (0.6 + 0.8 * glow);

  // Main body of trail: gradient from white-hot at craft to dark red at tail
  ctx.save();
  ctx.translate(screen.x, screen.y);
  // Align local +X with the trail direction in screen space (remember: the
  // outer camera rotation is already applied, and worldToScreen has no Y
  // flip, so trail vector matches canvas coords directly).
  const trailAngle = Math.atan2(dy, dx);
  ctx.rotate(trailAngle);

  // Core bright tail
  const grad = ctx.createLinearGradient(0, 0, trailLen, 0);
  grad.addColorStop(0.00, `rgba(255,255,240,${Math.min(1, 0.9 * glow)})`);
  grad.addColorStop(0.12, `rgba(255,220,120,${0.85 * glow})`);
  grad.addColorStop(0.35, `rgba(255,130,40,${0.6 * glow})`);
  grad.addColorStop(0.7,  `rgba(220,50,20,${0.3 * glow})`);
  grad.addColorStop(1.00, 'rgba(120,10,5,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, -trailW * 0.55);
  ctx.quadraticCurveTo(trailLen * 0.3, -trailW * 0.35, trailLen, 0);
  ctx.quadraticCurveTo(trailLen * 0.3,  trailW * 0.35, 0, trailW * 0.55);
  ctx.closePath();
  ctx.fill();

  // Inner white-hot core
  const innerLen = trailLen * 0.55;
  const coreGrad = ctx.createLinearGradient(0, 0, innerLen, 0);
  coreGrad.addColorStop(0, `rgba(255,255,255,${Math.min(1, 1.1 * glow)})`);
  coreGrad.addColorStop(0.5, `rgba(255,230,150,${0.6 * glow})`);
  coreGrad.addColorStop(1, 'rgba(255,160,60,0)');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.moveTo(0, -trailW * 0.22);
  ctx.quadraticCurveTo(innerLen * 0.4, 0, innerLen, 0);
  ctx.quadraticCurveTo(innerLen * 0.4, 0, 0, trailW * 0.22);
  ctx.closePath();
  ctx.fill();

  // Random sparks along the trail (ablative debris flaking off)
  const sparkCount = Math.floor(4 + glow * 18);
  for (let i = 0; i < sparkCount; i++) {
    const pt = Math.random();                    // position along trail (0..1)
    const jitter = (Math.random() - 0.5) * trailW * 0.9;
    const x = trailLen * pt;
    const y = jitter * (1 - pt * 0.5);           // narrows toward tail
    const size = (Math.random() * 1.5 + 0.6) * (1 - pt * 0.7);
    // Spark colour cools from white → yellow → orange → red along trail
    const h = Math.round(60 - pt * 40);          // hue
    const l = Math.round(90 - pt * 40);          // lightness
    ctx.fillStyle = `hsla(${h}, 95%, ${l}%, ${(1 - pt) * glow})`;
    ctx.fillRect(x, y, size * 2, size);
  }

  ctx.restore();

  // Halo around craft itself (in addition to trail)
  const haloR = Math.max(20, lenPx * 1.3) * (0.6 + 0.8 * glow);
  const halo = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, haloR);
  halo.addColorStop(0, `rgba(255,240,190,${glow * 0.6})`);
  halo.addColorStop(0.3, `rgba(255,160,60,${glow * 0.45})`);
  halo.addColorStop(0.7, `rgba(255,70,30,${glow * 0.2})`);
  halo.addColorStop(1, 'rgba(255,40,10,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, haloR, 0, Math.PI * 2);
  ctx.fill();
}

function drawExplosion(ctx, craft, cam, w, h) {
  const s = worldToScreen(craft.pos, cam, w, h);
  const t = ((performance.now() / 1000) * 2) % 2;
  const r = 40 + t * 60;
  const alpha = Math.max(0, 1 - t / 2);
  const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
  g.addColorStop(0, `rgba(255,240,160,${alpha})`);
  g.addColorStop(0.4, `rgba(255,120,40,${alpha * 0.8})`);
  g.addColorStop(1, 'rgba(255,30,10,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- Launch pad ----------
// Pad sits at a fixed latitude on the body and rotates with the body. The
// caller has already rotated the canvas so local-up = screen-up, so we only
// need to go to the pad's screen location and flip Y (for +Y=up locally).
function drawLaunchPad(ctx, pad, body, cam, w, h) {
  const padLat = pad.lat + body.rotAngle;
  const padX = body.pos.x + body.radius * Math.cos(padLat);
  const padY = body.pos.y + body.radius * Math.sin(padLat);
  const s = worldToScreen({ x: padX, y: padY }, cam, w, h);

  const padWpx = pad.padWidth * cam.scale;
  const towerHpx = pad.towerHeight * cam.scale;

  if (padWpx < 2) return;

  // Cull (rough — the ctx rotation could move things around, so be generous)
  const margin = (padWpx + towerHpx) * 1.5 + 200;
  if (s.x < -margin || s.x > w + margin || s.y < -margin || s.y > h + margin) return;

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.scale(1, -1);                            // +Y on canvas = up on screen
  // Inner rotation so user +X = east-tangent, +Y = pad-up.
  // After the outer camera rotation (aligned to the craft), we need α = θ
  // where θ = -π/2 − padLat for craft-on-pad. So use that same value here.
  ctx.rotate(-Math.PI / 2 - padLat);

  // --- Flame trench (below surface) ---
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-padWpx * 0.15, -padWpx * 0.5, padWpx * 0.3, padWpx * 0.5);

  // --- Concrete platform ---
  const platH = Math.max(4, padWpx * 0.12);
  const platGrad = ctx.createLinearGradient(0, 0, 0, platH);
  platGrad.addColorStop(0, '#aaa');
  platGrad.addColorStop(1, '#666');
  ctx.fillStyle = platGrad;
  ctx.fillRect(-padWpx / 2, 0, padWpx, platH);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = Math.max(0.5, platH * 0.08);
  ctx.strokeRect(-padWpx / 2, 0, padWpx, platH);

  // Hold-down clamps at the flame trench edges
  ctx.fillStyle = '#444';
  ctx.fillRect(-padWpx * 0.17, 0, padWpx * 0.03, platH * 1.6);
  ctx.fillRect(padWpx * 0.14, 0, padWpx * 0.03, platH * 1.6);

  // --- Service gantry / tower (to the "right" of the rocket) ---
  if (towerHpx > 15) {
    const towerX = padWpx * 0.42;
    const towerW = Math.max(3, padWpx * 0.08);
    ctx.strokeStyle = '#d24';
    ctx.lineWidth = Math.max(1, towerW * 0.25);
    // Vertical legs
    ctx.beginPath();
    ctx.moveTo(towerX, platH);
    ctx.lineTo(towerX, platH + towerHpx);
    ctx.moveTo(towerX + towerW, platH);
    ctx.lineTo(towerX + towerW, platH + towerHpx);
    ctx.stroke();
    // Cross-bracing X's every ~15% of tower height
    const step = towerHpx * 0.15;
    for (let y = platH; y < platH + towerHpx - step; y += step) {
      ctx.beginPath();
      ctx.moveTo(towerX, y);
      ctx.lineTo(towerX + towerW, y + step);
      ctx.moveTo(towerX + towerW, y);
      ctx.lineTo(towerX, y + step);
      ctx.stroke();
    }
    // Crew access arm reaching toward the rocket
    ctx.strokeStyle = '#c22';
    ctx.lineWidth = Math.max(1, towerW * 0.3);
    const armY = platH + towerHpx * 0.75;
    ctx.beginPath();
    ctx.moveTo(towerX, armY);
    ctx.lineTo(-padWpx * 0.05, armY + towerW * 0.5);
    ctx.stroke();
    // Beacon at the tip
    ctx.fillStyle = '#ff4';
    ctx.beginPath();
    ctx.arc(towerX + towerW / 2, platH + towerHpx + 2, Math.max(1.5, towerW * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }

  // --- USA flag stripe on the tower if big enough ---
  if (towerHpx > 40) {
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(8, towerHpx * 0.06)}px monospace`;
    ctx.fillText('USA', padWpx * 0.44, platH + towerHpx * 0.45);
  }

  ctx.restore();
}

// ---------- Ghost CSM (in lunar orbit while LM is detached) ----------
function drawGhostCSM(ctx, csm, cam, w, h) {
  const s = worldToScreen(csm.pos, cam, w, h);
  // Always draw visible even if very small — give it a pulsing marker
  const t = performance.now() / 1000;
  const pulse = 0.7 + 0.3 * Math.sin(t * 3);
  // Body — small white capsule shape
  ctx.save();
  ctx.translate(s.x, s.y);
  // Glowing halo so it's findable against the starfield
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
  halo.addColorStop(0, `rgba(160, 220, 255, ${0.5 * pulse})`);
  halo.addColorStop(1, 'rgba(80, 130, 200, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fill();
  // Capsule core
  ctx.fillStyle = '#eee';
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6cf';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Label
  ctx.fillStyle = '#6cf';
  ctx.font = '10px monospace';
  ctx.fillText('CSM', 8, 4);
  ctx.restore();
}

// ---------- ISS ----------
// Stylised ISS: central truss with two pairs of solar arrays. At low zoom
// shows as a blue marker so the player can see it on the orbital map.
function drawISS(ctx, iss, cam, w, h) {
  const s = worldToScreen(iss.pos, cam, w, h);
  // Cull if completely off-screen (with a generous margin for the label)
  if (s.x < -80 || s.x > w + 80 || s.y < -80 || s.y > h + 80) return;

  const scalePx = iss.radius * cam.scale;
  // Zoomed-out marker
  if (scalePx < 4) {
    const t = performance.now() / 1000;
    const pulse = 0.6 + 0.4 * Math.sin(t * 2.5);
    ctx.save();
    ctx.translate(s.x, s.y);
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
    halo.addColorStop(0, `rgba(120, 180, 255, ${0.55 * pulse})`);
    halo.addColorStop(1, 'rgba(80, 130, 200, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8cf';
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6cf';
    ctx.font = '10px monospace';
    ctx.fillText('ISS', 8, 4);
    ctx.restore();
    return;
  }

  // Close-up: draw a small station silhouette (truss + 4 solar panels)
  ctx.save();
  ctx.translate(s.x, s.y);
  // Central truss (horizontal)
  const trussW = Math.max(4, scalePx * 1.2);
  const trussH = Math.max(1, scalePx * 0.18);
  ctx.fillStyle = '#b0b0b8';
  ctx.fillRect(-trussW / 2, -trussH / 2, trussW, trussH);
  // Pressurised modules as central cluster
  ctx.fillStyle = '#e0e0e0';
  ctx.fillRect(-trussW * 0.18, -trussH * 1.6, trussW * 0.36, trussH * 3.2);
  // Solar panels (4, two on each side)
  const panelW = trussW * 0.28;
  const panelH = trussH * 5;
  ctx.fillStyle = '#1b3a6d';
  ctx.strokeStyle = '#8cf';
  ctx.lineWidth = Math.max(0.3, panelH * 0.04);
  for (const dx of [-trussW * 0.50, trussW * 0.22]) {
    ctx.fillRect(dx, -panelH / 2, panelW, panelH);
    ctx.strokeRect(dx, -panelH / 2, panelW, panelH);
    // Cell grid (horizontal lines)
    for (let k = -panelH / 2 + panelH / 6; k < panelH / 2; k += panelH / 6) {
      ctx.beginPath();
      ctx.moveTo(dx, k);
      ctx.lineTo(dx + panelW, k);
      ctx.stroke();
    }
  }
  // Label
  ctx.fillStyle = '#8cf';
  ctx.font = `${Math.max(9, scalePx * 0.3)}px monospace`;
  ctx.fillText('ISS', trussW / 2 + 4, -trussH);
  ctx.restore();
}

// ---------- Dropped stages ----------
function drawDroppedStages(ctx, craft, cam, w, h) {
  for (const d of craft.droppedStages) {
    const s = worldToScreen(d.pos, cam, w, h);
    const len = d.stage.length * cam.scale;
    const dia = d.stage.diameter * cam.scale;
    if (len < 1.5) {
      ctx.fillStyle = `rgba(200,200,200,${clamp(d.life / 60, 0, 1)})`;
      ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
      continue;
    }
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(d.angle);
    const alpha = clamp(d.life / 60, 0.2, 1);
    ctx.globalAlpha = alpha;
    drawStageShape(ctx, -len / 2, -dia / 2, len, dia, d.stage, false);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// ---------- Map view ----------
function drawMap(ctx, w, h, game) {
  // Dim background
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, w, h);

  const earth = game.earth, moon = game.moon, craft = game.craft;

  // Fit to contain Earth + Moon + craft (with margin)
  const points = [earth.pos, moon.pos, craft.pos];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  // Always include the Moon's full orbit extent for context
  minX = Math.min(minX, -MOON_DISTANCE * 1.1);
  maxX = Math.max(maxX, MOON_DISTANCE * 1.1);
  minY = Math.min(minY, -MOON_DISTANCE * 0.3);
  maxY = Math.max(maxY, MOON_DISTANCE * 0.3);
  const rx = maxX - minX, ry = maxY - minY;
  const margin = 1.2;
  const scale = Math.min(w / (rx * margin), h / (ry * margin));
  const cam = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, scale };

  // Predict trajectory (next ~3 days at 30s steps = 8640 steps, bail early)
  const traj = predictTrajectory(craft, [earth, moon], 8000, 30);

  // Moon orbit (dashed faint)
  ctx.strokeStyle = 'rgba(180,180,220,0.3)';
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(
    worldToScreen(earth.pos, cam, w, h).x,
    worldToScreen(earth.pos, cam, w, h).y,
    MOON_DISTANCE * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Moon SOI
  const moonScreen = worldToScreen(moon.pos, cam, w, h);
  ctx.strokeStyle = 'rgba(180,180,255,0.25)';
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.arc(moonScreen.x, moonScreen.y, MOON_SOI * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Predicted Moon path
  if (traj.bodyPaths[1] && traj.bodyPaths[1].length > 2) {
    ctx.strokeStyle = 'rgba(200,200,200,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const p0 = worldToScreen(traj.bodyPaths[1][0], cam, w, h);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < traj.bodyPaths[1].length; i += 3) {
      const p = worldToScreen(traj.bodyPaths[1][i], cam, w, h);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  // Craft predicted trajectory — fade along length
  if (traj.craftPath && traj.craftPath.length > 2) {
    const n = traj.craftPath.length;
    ctx.lineWidth = 1.5;
    for (let i = 1; i < n; i++) {
      const alpha = 1 - i / n;
      if (alpha < 0.05) break;
      const a = worldToScreen(traj.craftPath[i - 1], cam, w, h);
      const b = worldToScreen(traj.craftPath[i], cam, w, h);
      ctx.strokeStyle = `rgba(100,255,140,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Impact marker if the trajectory hits a body
    if (traj.hit) {
      const last = traj.craftPath[traj.craftPath.length - 1];
      const ls = worldToScreen(last, cam, w, h);
      ctx.strokeStyle = '#ff6464';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ls.x, ls.y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ff6464';
      ctx.font = '11px monospace';
      ctx.fillText('IMPACT: ' + traj.hit, ls.x + 12, ls.y + 4);
    }
  }

  // Earth
  const earthScreen = worldToScreen(earth.pos, cam, w, h);
  const eR = Math.max(4, earth.radius * scale);
  const eg = ctx.createRadialGradient(earthScreen.x - eR * 0.2, earthScreen.y - eR * 0.2, 0, earthScreen.x, earthScreen.y, eR);
  eg.addColorStop(0, '#4a9dd1');
  eg.addColorStop(1, '#1f4870');
  ctx.fillStyle = eg;
  ctx.beginPath(); ctx.arc(earthScreen.x, earthScreen.y, eR, 0, Math.PI * 2); ctx.fill();

  // Moon
  const mR = Math.max(3, moon.radius * scale);
  const mg = ctx.createRadialGradient(moonScreen.x - mR * 0.2, moonScreen.y - mR * 0.2, 0, moonScreen.x, moonScreen.y, mR);
  mg.addColorStop(0, '#dadada');
  mg.addColorStop(1, '#6a6a6a');
  ctx.fillStyle = mg;
  ctx.beginPath(); ctx.arc(moonScreen.x, moonScreen.y, mR, 0, Math.PI * 2); ctx.fill();

  // Craft marker
  const craftScreen = worldToScreen(craft.pos, cam, w, h);
  ctx.fillStyle = '#ffe044';
  ctx.beginPath();
  ctx.arc(craftScreen.x, craftScreen.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffe044';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(craftScreen.x, craftScreen.y, 10, 0, Math.PI * 2);
  ctx.stroke();

  // ISS marker — small blue cross on the map
  if (game.iss) {
    const issScreen = worldToScreen(game.iss.pos, cam, w, h);
    ctx.strokeStyle = '#8cf';
    ctx.fillStyle = '#8cf';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(issScreen.x, issScreen.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(issScreen.x - 8, issScreen.y); ctx.lineTo(issScreen.x + 8, issScreen.y);
    ctx.moveTo(issScreen.x, issScreen.y - 8); ctx.lineTo(issScreen.x, issScreen.y + 8);
    ctx.stroke();
    ctx.font = '10px monospace';
    ctx.fillText('ISS', issScreen.x + 10, issScreen.y + 4);
  }

  // Labels
  ctx.fillStyle = '#8eff8e';
  ctx.font = '12px monospace';
  ctx.fillText('EARTH', earthScreen.x + eR + 6, earthScreen.y + 4);
  ctx.fillText('MOON', moonScreen.x + mR + 6, moonScreen.y + 4);
  ctx.fillStyle = '#ffe044';
  ctx.fillText('YOU', craftScreen.x + 12, craftScreen.y - 6);

  // Map title + scale bar
  ctx.fillStyle = '#6e9';
  ctx.font = '11px monospace';
  ctx.fillText('ORBITAL MAP — press M to close', 14, 22);
  const scaleM = 10000 * 1000; // 10 000 km
  const scalePx = scaleM * scale;
  if (scalePx > 10 && scalePx < w * 0.4) {
    ctx.strokeStyle = '#8eff8e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(14, h - 20);
    ctx.lineTo(14 + scalePx, h - 20);
    ctx.moveTo(14, h - 24); ctx.lineTo(14, h - 16);
    ctx.moveTo(14 + scalePx, h - 24); ctx.lineTo(14 + scalePx, h - 16);
    ctx.stroke();
    ctx.fillStyle = '#8eff8e';
    ctx.fillText('10 000 km', 14, h - 28);
  }
}

// Altitude indicator on screen edge when close to surface (so player has
// reference when zoomed right in on the rocket).
function drawAltitudeIndicator(ctx, w, h, game) {
  const alt = game.earth.altitude(game.craft.pos);
  if (alt > 10e3 || alt < -200) return;
  // Horizon line across screen at the implied Earth surface
  const s = worldToScreen(game.craft.pos, game.camera, w, h);
  const n = game.earth.normalTo(game.craft.pos);
  // Find where the surface crosses the screen, approx: draw a line perpendicular to n at radius below craft
  const r = game.earth.radius * game.camera.scale;
  const earthS = worldToScreen(game.earth.pos, game.camera, w, h);
  if (r > 20) {
    ctx.strokeStyle = 'rgba(200,255,220,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(earthS.x, earthS.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ---------- Toasts (DOM-based, done in ui.js; this helper kept for compat) ----------
function drawToasts(ctx, w, h) { /* toasts rendered via DOM in ui.js */ }
