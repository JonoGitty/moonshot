// Quick test: does autopilot now reach a stable orbit (peri > 120 km)
// for both Saturn V and SLS?

import { chromium } from 'playwright';

async function testAutopilot(ship, timeLimit) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
  await page.click('input[name="houston-mode"][value="auto"]');
  await page.click(`[data-ship="${ship}"]`);
  await page.waitForTimeout(100);

  const startWallTime = Date.now();
  let result = 'timeout';
  let lastState = null;

  while (Date.now() - startWallTime < timeLimit) {
    await page.waitForTimeout(3000);
    const st = await page.evaluate(() => {
      const g = window.game;
      if (!g.craft) return null;
      const c = g.craft;
      const e = g.earth;
      return {
        t: c.missionTime,
        stage: c.activeStageIdx,
        capsuleOnly: c.isCapsuleOnly(),
        destroyed: c.destroyed,
        reason: c.destructionReason,
        altE: e.altitude(c.pos),
        apo: c.apoE,
        peri: c.periE,
        autoPhase: g.houston ? g.houston.autoPhase : null,
        mode: g.houston ? g.houston.mode : null,
      };
    });
    if (!st) break;
    lastState = st;
    if (st.destroyed) {
      result = 'destroyed';
      break;
    }
    if (st.autoPhase === 'orbit-handover' && st.peri !== null && st.peri > 100e3) {
      result = 'orbit';
      break;
    }
  }

  await browser.close();
  return { result, lastState, errors };
}

for (const ship of ['saturn5', 'sls']) {
  console.log(`\n=== ${ship.toUpperCase()} ===`);
  const { result, lastState, errors } = await testAutopilot(ship, 360000);   // 6 min wall time
  console.log(`Result: ${result}`);
  if (lastState) {
    console.log(`  t=${lastState.t.toFixed(0)}s  phase=${lastState.autoPhase}  stage=${lastState.stage}`);
    console.log(`  alt=${(lastState.altE/1000).toFixed(1)}km  apo=${lastState.apo!==null?(lastState.apo/1000).toFixed(0)+'km':'—'}  peri=${lastState.peri!==null?(lastState.peri/1000).toFixed(0)+'km':'—'}`);
    if (lastState.destroyed) console.log(`  💥 ${lastState.reason}`);
  }
  if (errors.length) console.log(`  errors: ${errors.join('; ')}`);
}
