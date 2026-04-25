// Test: verify Moon starting angle matches each mission's launch date.
// We expect moonEclipticLongitude(launchJD) == angle between (earth→moon) and +X axis.

import { chromium } from 'playwright';

const EXPECTED = {
  // Precomputed for sanity — these are the expected Moon ecliptic longitudes (deg)
  // at each ship's real launch date. Values computed with the in-game formula.
  mercury:  289.01,   // May 5 1961
  sputnik:  323.79,   // Oct 4 1957
  vostok:   341.31,   // Apr 12 1961
  falcon9:  242.00,   // Nov 16 2020
  saturn5:  138.57,   // July 16 1969 13:32 UT
  sls:      144.25,   // Nov 16 2022 (Artemis I)
  artemis2: 211.72,   // Apr 3 2026 (Artemis II)
};

async function getMoonAngle(page, ship) {
  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const diag = await page.evaluate(s => ({
    hasCard: !!document.querySelector(`[data-ship="${s}"]`),
    menuVisible: !document.getElementById('menu').classList.contains('hidden'),
    cardCount: document.querySelectorAll('.ship').length,
  }), ship);
  try {
    await page.click(`[data-ship="${ship}"]`);
  } catch (e) {
    return { err: 'click-ship: ' + e.message, diag };
  }
  try {
    await page.waitForSelector('#briefing:not(.hidden)', { timeout: 2000 });
  } catch (e) {
    const postBrief = await page.evaluate(() => ({
      briefingClass: document.getElementById('briefing').className,
      briefingVisible: !document.getElementById('briefing').classList.contains('hidden'),
    }));
    return { err: 'briefing-not-visible: ' + e.message, diag, postBrief };
  }
  const btn = await page.evaluate(() => ({
    exists: !!document.getElementById('briefing-launch'),
    text: (document.getElementById('briefing-launch') || {}).textContent,
    pendingShipKey: typeof pendingShipKey !== 'undefined' ? pendingShipKey : 'not-in-scope',
  }));
  console.log('briefing-launch btn:', JSON.stringify(btn));
  await page.click('#briefing-launch');
  await page.waitForTimeout(1500);
  const data = await page.evaluate(() => {
    const g = window.game;
    if (!g) return { err: 'no-game' };
    if (!g.moon) return { err: 'no-moon', state: g.state, hasEarth: !!g.earth, hasCraft: !!g.craft };
    if (!g.earth) return { err: 'no-earth' };
    const dx = g.moon.pos.x - g.earth.pos.x;
    const dy = g.moon.pos.y - g.earth.pos.y;
    const angDeg = Math.atan2(dy, dx) * 180 / Math.PI;
    const wrapped = ((angDeg % 360) + 360) % 360;
    return { angDeg: wrapped, launchJD: g.craft ? g.craft.blueprint.briefing.launchJD : null };
  });
  return data;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => { console.log('PAGE ERROR:', e.message); errors.push(e.message); });
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });

let allGood = true;
for (const ship of Object.keys(EXPECTED)) {
  const d = await getMoonAngle(page, ship);
  if (d.err) { console.log(`${ship}: FAIL — ${d.err} extra=${JSON.stringify(d)}`); allGood = false; continue; }
  const exp = EXPECTED[ship];
  const diff = Math.min(Math.abs(d.angDeg - exp), 360 - Math.abs(d.angDeg - exp));
  const ok = diff < 1.0;   // within 1 degree
  console.log(`${ship.padEnd(10)}  got ${d.angDeg.toFixed(2)}°  expected ${exp.toFixed(2)}°  (JD ${d.launchJD.toFixed(3)})  ${ok ? 'OK' : 'FAIL'}`);
  if (!ok) allGood = false;
}

if (errors.length) console.log('Errors:', errors);

await browser.close();
console.log(allGood ? '\nALL MOON POSITIONS CORRECT' : '\nMOON POSITION CHECK FAILED');
process.exit(allGood ? 0 : 1);
