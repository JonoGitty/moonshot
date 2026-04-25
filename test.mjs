// E2E test: validates SLS launch and Houston autopilot mode.

import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8080/';

async function getState(page) {
  return await page.evaluate(() => {
    const g = window.game;
    if (!g.craft) return null;
    const c = g.craft;
    const e = g.earth;
    return {
      t: c.missionTime,
      throttle: c.throttle,
      thrusting: c.thrusting,
      landed: c.landed,
      destroyed: c.destroyed,
      destructionReason: c.destructionReason,
      stage: c.activeStageIdx,
      altE: e.altitude(c.pos),
      apoE: c.apoE,
      periE: c.periE,
      speed: Math.hypot(c.vel.x - e.surfaceVelocity(c.pos).x, c.vel.y - e.surfaceVelocity(c.pos).y),
      milestones: { ...c.milestones },
      houstonMode: g.houston ? g.houston.mode : null,
      autoPhase: g.houston ? g.houston.autoPhase : null,
      feedSize: g.houston ? g.houston.feed.length : 0,
    };
  });
}

async function runScenario(label, modeValue, shipKey) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);

  // Set Houston mode
  await page.click(`input[name="houston-mode"][value="${modeValue}"]`);
  await page.waitForTimeout(50);

  await page.click(`[data-ship="${shipKey}"]`);
  await page.waitForTimeout(150);

  console.log(`\n========= ${label} =========`);

  // Sample over a long timeline to see autopilot in action
  // Shorter intervals so we can catch state changes.
  const samples = [
    { wait: 500,   label: 'init' },
    { wait: 4500,  label: '+5s' },
    { wait: 25000, label: '+30s' },
    { wait: 60000, label: '+90s' },
    { wait: 60000, label: '+150s' },
    { wait: 60000, label: '+210s' },
    { wait: 60000, label: '+270s' },
    { wait: 60000, label: '+330s' },
    { wait: 60000, label: '+390s' },
    { wait: 60000, label: '+450s' },
  ];

  for (const s of samples) {
    await page.waitForTimeout(s.wait);
    const st = await getState(page);
    if (!st) { console.log(`${s.label}: (no craft)`); continue; }
    const lineParts = [
      `${s.label.padEnd(8)}`,
      `t=${st.t.toFixed(0)}s`,
      `mode=${st.houstonMode}`,
      `phase=${st.autoPhase || '-'}`,
      `alt=${(st.altE/1000).toFixed(1)}km`,
      `v=${st.speed.toFixed(0)}m/s`,
      `apo=${st.apoE !== null ? (st.apoE/1000).toFixed(0)+'km' : '—'}`,
      `peri=${st.periE !== null ? (st.periE/1000).toFixed(0)+'km' : '—'}`,
      `stage=${st.stage}`,
      `thr=${(st.throttle*100).toFixed(0)}%`,
    ];
    console.log(lineParts.join('  '));
    if (st.destroyed) {
      console.log(`  💥 DESTROYED: ${st.destructionReason}`);
      break;
    }
    if (st.milestones.reachedOrbit && st.autoPhase === 'orbit-handover') {
      console.log(`  ✅ Orbit reached and handed over`);
      break;
    }
  }

  await page.screenshot({ path: `test-${label.toLowerCase().replace(/\s+/g, '-')}.png` });

  // Houston transcript
  const transcript = await page.evaluate(() => window.game.houston ? window.game.houston.feed.slice().reverse() : []);
  console.log('\n  Houston transcript:');
  transcript.forEach(f => {
    const tt = `T+${Math.floor(f.t/60)}:${String(Math.floor(f.t%60)).padStart(2,'0')}`;
    console.log(`    ${tt} [${f.type}] ${f.text}`);
  });

  if (errors.length) {
    console.log('\n  ⚠ ERRORS:', errors.join('\n'));
  }

  await browser.close();
}

await runScenario('SLS-AUTO', 'auto', 'sls');
await runScenario('SATURNV-AUTO', 'auto', 'saturn5');
