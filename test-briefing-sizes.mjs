// Briefing-modal size + canvas check.
// Loads each ship's briefing, screenshots it, and reports the canvas
// rendered size. Catches the regression where the trajectory canvas
// blows up to the full screen.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));

await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

const ships = ['mercury', 'sputnik', 'vostok', 'falcon9', 'shuttle', 'soyuz', 'saturn5', 'sls', 'artemis2', 'creative'];

for (const ship of ships) {
  // Open briefing
  await page.click(`[data-ship="${ship}"]`);
  await page.waitForSelector('#briefing:not(.hidden)', { timeout: 2000 });
  await page.waitForTimeout(400);

  const info = await page.evaluate(() => {
    const modal = document.getElementById('briefing');
    const inner = document.querySelector('.briefing-inner');
    const canvas = document.getElementById('briefing-canvas');
    const phases = document.getElementById('briefing-phases');
    const cs = canvas ? getComputedStyle(canvas) : null;
    return {
      modalH: modal.scrollHeight,
      innerH: inner ? inner.scrollHeight : null,
      innerW: inner ? inner.clientWidth : null,
      canvasShown: canvas && cs && cs.display !== 'none',
      canvasW: canvas ? canvas.clientWidth : null,
      canvasH: canvas ? canvas.clientHeight : null,
      canvasBitW: canvas ? canvas.width : null,
      canvasBitH: canvas ? canvas.height : null,
      phasesH: phases ? phases.scrollHeight : null,
      vh: window.innerHeight,
      vw: window.innerWidth,
    };
  });

  await page.screenshot({ path: `test-briefing-${ship}.png` });
  console.log(
    `${ship.padEnd(10)} ` +
    `modal=${info.modalH}h ` +
    `inner=${info.innerW}x${info.innerH} ` +
    `canvas=${info.canvasShown ? `${info.canvasW}x${info.canvasH} (bitmap ${info.canvasBitW}x${info.canvasBitH})` : 'hidden'} ` +
    `phases=${info.phasesH}h`
  );

  // Close briefing
  await page.click('#briefing-back');
  await page.waitForTimeout(200);
}

console.log(`\nViewport: ${1280}x${800}`);
console.log(errs.length ? `\nERRORS: ${errs.join(' | ')}` : '\nNO JS ERRORS');
await browser.close();
