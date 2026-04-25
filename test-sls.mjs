// Fast focused test: log SLS state every second on autopilot.

import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
await page.click('input[name="houston-mode"][value="auto"]');
await page.click('[data-ship="sls"]');
await page.waitForTimeout(100);

// Sample every 5s for 8 minutes
let last = null;
for (let i = 0; i < 100; i++) {
  await page.waitForTimeout(5000);
  const st = await page.evaluate(() => {
    const g = window.game;
    if (!g.craft) return null;
    const c = g.craft;
    const e = g.earth;
    return {
      t: c.missionTime,
      stage: c.activeStageIdx,
      capsuleOnly: c.isCapsuleOnly(),
      throttle: c.throttle,
      thrusting: c.thrusting,
      destroyed: c.destroyed,
      reason: c.destructionReason,
      altE: e.altitude(c.pos),
      apo: c.apoE,
      peri: c.periE,
      speed: Math.hypot(c.vel.x - e.surfaceVelocity(c.pos).x, c.vel.y - e.surfaceVelocity(c.pos).y),
      angle: c.angle,
      heat: c.capsule.temperature,
      fuel: c.getActive().currentFuel,
      fuelMax: c.getActive().fuelMass,
      autoPhase: g.houston ? g.houston.autoPhase : null,
      mode: g.houston ? g.houston.mode : null,
    };
  });
  if (!st) { console.log(`[${i}] (no craft)`); break; }
  const fuel = st.fuelMax > 0 ? `${(st.fuel/st.fuelMax*100).toFixed(0)}%` : '-';
  console.log(`t=${st.t.toFixed(0).padStart(4)}s  stg=${st.stage}${st.capsuleOnly?'cap':''}  ph=${(st.autoPhase||'-').padEnd(20)}  alt=${(st.altE/1000).toFixed(0).padStart(4)}km  v=${st.speed.toFixed(0).padStart(5)}m/s  apo=${st.apo!==null?(st.apo/1000).toFixed(0).padStart(5)+'km':'  -  '}  peri=${st.peri!==null?(st.peri/1000).toFixed(0).padStart(5)+'km':'  -  '}  fuel=${fuel.padStart(4)}  thr=${(st.throttle*100).toFixed(0)}%  heat=${st.heat.toFixed(0)}°C  mode=${st.mode}`);
  if (st.destroyed) {
    console.log(`💥 ${st.reason}`);
    await page.screenshot({ path: 'test-sls-explosion.png' });
    break;
  }
  if (st.autoPhase === 'orbit-handover') {
    console.log(`✅ orbit reached at T+${st.t.toFixed(0)}s, autopilot done`);
    break;
  }
  last = st;
}

if (errors.length) console.log('errors:', errors);
await browser.close();
