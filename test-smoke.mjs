// Quick smoke test: load the game, start each mission, screenshot, check for JS errors.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

// Screenshot menu
await page.screenshot({ path: 'test-smoke-menu.png' });

// Check each ship renders at T+5s without error
const ships = ['creative', 'mercury', 'sputnik', 'vostok', 'falcon9', 'shuttle', 'soyuz', 'saturn5', 'sls', 'artemis2'];
for (const ship of ships) {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  await page.click(`[data-ship="${ship}"]`);
  await page.waitForSelector('#briefing:not(.hidden)', { timeout: 2000 });
  await page.click('#briefing-launch');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `test-smoke-${ship}.png` });
  const st = await page.evaluate(() => ({
    state: window.game.state,
    hasCraft: !!window.game.craft,
  }));
  console.log(`${ship.padEnd(10)} state=${st.state} hasCraft=${st.hasCraft} errors=${errors.length}`);
}

console.log(errors.length === 0 ? '\nNO ERRORS' : `\nERRORS: ${errors.join(' | ')}`);
await browser.close();
