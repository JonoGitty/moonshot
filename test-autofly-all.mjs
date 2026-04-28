// Full autopilot regression test: run each mission on autopilot and check
// that it reaches a meaningful milestone within its time budget.
//
// We don't require all missions to fully splash down in the time budget —
// just that no destruction or errors occur and that key milestones are hit.

import { chromium } from 'playwright';

// Real-time budget in seconds, and the "required milestones" we want hit.
// "Mission complete" criteria — what does this ship need to do END-TO-END?
const MISSIONS = {
  mercury:  { budgetS: 800,  expect: ['leftPad', 'reachedSpace', 'landedOnEarth'] },
  sputnik:  { budgetS: 600,  expect: ['leftPad', 'reachedOrbit', 'satelliteDeployed'] },
  vostok:   { budgetS: 1500, expect: ['leftPad', 'reachedOrbit', 'landedOnEarth'] },
  falcon9:  { budgetS: 1800, expect: ['leftPad', 'reachedOrbit', 'landedOnEarth'] },
  shuttle:  { budgetS: 1800, expect: ['leftPad', 'reachedOrbit', 'landedOnEarth'] },
  soyuz:    { budgetS: 1800, expect: ['leftPad', 'reachedOrbit', 'dockedWithISS', 'landedOnEarth'] },
  // Lunar missions need bigger wall-clock budgets — Apollo's full real
  // timeline (ascent → parking orbit → TLI → 3-day coast → LOI → 3 lunar
  // orbits → descent → surface stay → ascent → rendezvous → TEI → 3-day
  // coast → re-entry → splashdown) compresses to ~80 min real time even
  // under aggressive warp because descent / ascent / re-entry must run
  // at 1× for stability. SLS / Artemis II don't need to land so fit in
  // less, but still need the 3-day coast home.
  saturn5:  { budgetS: 5400, expect: ['leftPad', 'reachedOrbit', 'approachedMoon', 'landedOnMoon', 'launchedFromMoon', 'landedOnEarth'] },
  sls:      { budgetS: 4200, expect: ['leftPad', 'reachedOrbit', 'approachedMoon', 'enteredMoonOrbit', 'landedOnEarth'] },
  artemis2: { budgetS: 4200, expect: ['leftPad', 'reachedOrbit', 'approachedMoon', 'enteredMoonOrbit', 'landedOnEarth'] },
};

// Fresh context per mission — reusing one page across all 9 ships causes the
// JS heap to degrade enough that later ships (Soyuz/SLS/Saturn5) run at
// sub-realtime sim ratios and time out. A new context is cheap and gives
// each mission a clean V8 heap.
async function runMission(browser, ship, budgetS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  await page.click('input[name="houston-mode"][value="auto"]');
  await page.click(`[data-ship="${ship}"]`);
  await page.waitForSelector('#briefing:not(.hidden)', { timeout: 2000 });
  await page.click('#briefing-launch');
  await page.waitForTimeout(400);

  const start = Date.now();
  let lastState = null;
  let checkpoints = [];

  while ((Date.now() - start) / 1000 < budgetS) {
    await page.waitForTimeout(3000);
    const st = await page.evaluate(() => {
      const g = window.game;
      if (!g.craft) return null;
      const c = g.craft;
      const e = g.earth;
      const m = g.moon;
      return {
        t: c.missionTime,
        stage: c.activeStageIdx,
        capsuleOnly: c.isCapsuleOnly(),
        destroyed: c.destroyed,
        reason: c.destructionReason,
        altE: e.altitude(c.pos),
        altM: m.altitude(c.pos),
        apo: c.apoE,
        peri: c.periE,
        apoM: c.apoM,
        periM: c.periM,
        milestones: { ...c.milestones },
        landed: c.landed,
        landedOn: c.landedOn,
        autoPhase: g.houston ? g.houston.autoPhase : null,
        mode: g.houston ? g.houston.mode : null,
        state: g.state,
        timeWarp: g.timeWarp,
      };
    });
    if (!st) break;
    // Capture milestone transitions
    if (lastState) {
      for (const k of Object.keys(st.milestones)) {
        if (st.milestones[k] && !lastState.milestones[k]) {
          checkpoints.push(`t=${st.t.toFixed(0)}s ${k}`);
        }
      }
      if (st.autoPhase !== lastState.autoPhase) {
        checkpoints.push(`t=${st.t.toFixed(0)}s phase→${st.autoPhase}`);
      }
    }
    lastState = st;
    if (st.destroyed) break;
    if (st.state === 'ending') break;
  }

  await ctx.close();
  return { lastState, checkpoints, errors };
}

const browser = await chromium.launch({ headless: true });

const only = process.argv[2];     // optional: one ship
const ships = only ? [only] : Object.keys(MISSIONS);

for (const ship of ships) {
  const { budgetS, expect } = MISSIONS[ship];
  console.log(`\n=== ${ship.toUpperCase()} (budget ${budgetS}s) ===`);
  const { lastState: st, checkpoints, errors } = await runMission(browser, ship, budgetS);
  if (!st) { console.log('FAIL — no final state'); continue; }
  const hit = expect.filter(k => st.milestones[k]);
  const missed = expect.filter(k => !st.milestones[k]);
  console.log(`t=${st.t.toFixed(0)}s  phase=${st.autoPhase}  stage=${st.stage}  state=${st.state}`);
  console.log(`altE=${(st.altE/1000).toFixed(1)}km  altM=${(st.altM/1000).toFixed(1)}km  apo=${st.apo!==null?(st.apo/1000).toFixed(0)+'km':'—'}  peri=${st.peri!==null?(st.peri/1000).toFixed(0)+'km':'—'}`);
  if (st.apoM !== null) console.log(`Moon orbit: apoM=${(st.apoM/1000).toFixed(0)}km periM=${(st.periM/1000).toFixed(0)}km`);
  console.log(`milestones hit: ${Object.keys(st.milestones).filter(k => st.milestones[k]).join(', ')}`);
  if (st.destroyed) console.log(`💥 destroyed: ${st.reason}`);
  console.log(`required ${expect.join(', ')}`);
  console.log(`met: ${hit.join(', ') || '(none)'}`);
  if (missed.length) console.log(`MISSED: ${missed.join(', ')}`);
  console.log(`checkpoints: ${checkpoints.join(' → ')}`);
  if (errors.length) console.log(`errors: ${errors.join(' | ')}`);
  console.log(missed.length === 0 && !st.destroyed ? 'PASS' : 'FAIL');
}

await browser.close();
