// =============================================================================
// util.js — vector math, number formatting, atmosphere model
// Everything is SI. World uses Y-up; rendering flips Y on screen.
// =============================================================================

const Vec = {
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
  scale: (a, s) => ({ x: a.x * s, y: a.y * s }),
  mag: (a) => Math.sqrt(a.x * a.x + a.y * a.y),
  mag2: (a) => a.x * a.x + a.y * a.y,
  dist: (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); },
  norm: (a) => {
    const m = Math.sqrt(a.x * a.x + a.y * a.y);
    return m === 0 ? { x: 0, y: 0 } : { x: a.x / m, y: a.y / m };
  },
  dot: (a, b) => a.x * b.x + a.y * b.y,
  cross: (a, b) => a.x * b.y - a.y * b.x,                  // z-component in 2D
  perp: (a) => ({ x: -a.y, y: a.x }),                      // CCW 90°
  angle: (a) => Math.atan2(a.y, a.x),
  fromAngle: (ang, len) => ({ x: Math.cos(ang) * (len ?? 1), y: Math.sin(ang) * (len ?? 1) }),
  rot: (a, ang) => ({
    x: a.x * Math.cos(ang) - a.y * Math.sin(ang),
    y: a.x * Math.sin(ang) + a.y * Math.cos(ang),
  }),
};

// ---- Formatting helpers ----
function fmtDist(m) {
  if (m === null || m === undefined || !isFinite(m)) return '—';
  const am = Math.abs(m);
  if (am >= 1e9) return (m / 1e9).toFixed(3) + ' Gm';
  if (am >= 1e6) return (m / 1e6).toFixed(2) + ' Mm';
  if (am >= 1e3) return (m / 1e3).toFixed(2) + ' km';
  return m.toFixed(0) + ' m';
}

function fmtVel(v) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  const av = Math.abs(v);
  if (av >= 1e3) return (v / 1e3).toFixed(2) + ' km/s';
  return v.toFixed(1) + ' m/s';
}

function fmtTime(s) {
  if (s === null || s === undefined || !isFinite(s)) return '—';
  s = Math.max(0, s);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${s.toFixed(1)}s`;
}

function fmtMass(kg) {
  if (kg === null || kg === undefined || !isFinite(kg)) return '—';
  if (kg >= 1e6) return (kg / 1e6).toFixed(2) + ' kt';
  if (kg >= 1e3) return (kg / 1e3).toFixed(1) + ' t';
  return kg.toFixed(0) + ' kg';
}

function normAngle(a) {
  a = a % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

// Exponential atmosphere model. Real Earth is more complex; this captures the
// essential behaviour: thick at sea level, thin at 50 km, functionally nothing
// above the Kármán line. ρ(h) = ρ₀ · e^(-h / H).
function atmDensity(altitude) {
  if (altitude <= 0) return SEA_LEVEL_DENSITY;
  if (altitude >= ATMOSPHERE_HEIGHT) return 0;
  return SEA_LEVEL_DENSITY * Math.exp(-altitude / SCALE_HEIGHT);
}

// Convert hex colour like #aabbcc to "rgba(r,g,b,a)"
function rgba(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Darken / lighten a hex colour by a factor (0..1)
function darken(hex, factor) {
  const h = hex.replace('#', '');
  const r = Math.max(0, Math.round(parseInt(h.substring(0, 2), 16) * factor));
  const g = Math.max(0, Math.round(parseInt(h.substring(2, 4), 16) * factor));
  const b = Math.max(0, Math.round(parseInt(h.substring(4, 6), 16) * factor));
  return `rgb(${r},${g},${b})`;
}
