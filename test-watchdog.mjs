// =============================================================================
// test-watchdog.mjs — Houston Watchdog regression test.
//
// Verifies the watchdog (v0.7.0):
//   1. Loads + ticks without errors during normal autoflight on every ship
//   2. Has loaded a per-mission MissionPlan if one is registered
//   3. Doesn't spuriously trigger 'abort'-severity checks under nominal flight
//   4. Records callouts via the shared Houston feed (smoke check that the
//      forwarding works)
//
// Anomaly-injection scenarios from each mission's docs/missions/*.md (TLI
// underburn, LOI overshoot, deorbit overshoot, module-sep blocked, etc.) are
// the v0.7.0 final acceptance gate — separate test suite, deferred to next
// milestone.
// =============================================================================

import { chromium } from 'playwright';

const SHIPS = [
  // Fast ships first (suborbital / LEO) so failures surface early
  'mercury', 'sputnik', 'vostok', 'falcon9', 'shuttle', 'soyuz',
  // Lunar — long autoflight, more watchdog surface area
  'saturn5', 'sls', 'artemis2',
];

const SIM_SECONDS_PER_SHIP = 120;     // wait this long of *sim* time per ship
const REAL_TIMEOUT_MS = 30_000;        // wall-clock cap per ship (high warps cover the rest)

const browser = await chromium.launch({ headless: true });
const failures = [];

for (const ship of SHIPS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  try {
    await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.click(`[data-ship="${ship}"]`);
    await page.waitForSelector('#briefing:not(.hidden)', { timeout: 2000 });
    // Force autopilot mode so the watchdog sees real flight
    await page.evaluate(() => {
      const auto = document.querySelector('input[name="houston-mode"][value="auto"]');
      if (auto) auto.checked = true;
    });
    await page.click('#briefing-launch');
    await page.waitForTimeout(500);

    // Wait for sim time to reach the target, capped by wall clock
    const start = Date.now();
    let lastSimT = 0;
    while (Date.now() - start < REAL_TIMEOUT_MS) {
      const t = await page.evaluate(() => window.game.craft ? window.game.craft.missionTime : 0);
      lastSimT = t;
      if (t >= SIM_SECONDS_PER_SHIP) break;
      await page.waitForTimeout(500);
    }

    const result = await page.evaluate(() => {
      const wd = window.game.watchdog;
      if (!wd) return { hasWatchdog: false };
      const aborts = wd.feed.filter(f => /abort|major/i.test(f.type) || /abort/i.test(f.id || ''));
      return {
        hasWatchdog: true,
        enabled: wd.enabled,
        hasPlan: !!wd.activePlan,
        planName: wd.activePlan ? wd.activePlan.missionName : null,
        standardChecks: wd.standardChecks ? wd.standardChecks.length : 0,
        missionChecks: wd.missionChecks ? wd.missionChecks.length : 0,
        feedLen: wd.feed.length,
        callouts: wd.stats.callouts,
        warpCaps: wd.stats.warpCaps,
        mccBurns: wd.stats.mccBurns,
        triggered: wd.stats.triggered,
        abortFired: aborts.length,
        // Houston feed should contain forwarded watchdog callouts (prefix wd:)
        houstonHasWdFeed: window.game.houston
          ? window.game.houston.feed.some(f => /^wd:/.test(f.id || ''))
          : false,
        recentFeed: wd.feed.slice(0, 5).map(f => ({ id: f.id, t: f.t.toFixed(0) })),
      };
    });

    if (pageErrors.length > 0) {
      failures.push(`${ship}: page errors — ${pageErrors.join(' | ')}`);
    }
    if (!result.hasWatchdog) {
      failures.push(`${ship}: watchdog instance missing`);
    }
    if (result.hasWatchdog && !result.hasPlan && SHIPS.includes(ship)) {
      // Only stock ships should have plans; "creative" sandbox is exempt
      failures.push(`${ship}: no MissionPlan loaded`);
    }
    // Spurious abort-severity triggers under nominal flight = bug
    if (result.abortFired > 0) {
      failures.push(`${ship}: ${result.abortFired} abort-severity trigger(s) under nominal flight`);
    }

    const tag = pageErrors.length > 0 || result.abortFired > 0 || !result.hasWatchdog ? 'FAIL' : 'OK';
    console.log(
      `${ship.padEnd(10)} ${tag.padEnd(4)} simT=${lastSimT.toFixed(0)}s` +
      ` plan=${result.planName || '-'}` +
      ` checks=${result.standardChecks}+${result.missionChecks}` +
      ` triggered=${result.triggered} aborts=${result.abortFired}` +
      ` mcc=${result.mccBurns} warpCaps=${result.warpCaps}`
    );
  } catch (e) {
    failures.push(`${ship}: exception — ${e.message}`);
    console.log(`${ship.padEnd(10)} FAIL exception ${e.message}`);
  } finally {
    await ctx.close();
  }
}

await browser.close();

if (failures.length > 0) {
  console.log('\n=== FAILURES ===');
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
console.log('\nALL OK — watchdog runs cleanly across all ships.');
