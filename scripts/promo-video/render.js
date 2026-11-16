// Renders scene.html frame by frame at 30 fps into frames/NNNNN.jpg
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const FPS = Number(process.env.FPS || 30);
const dir = path.join(__dirname, 'frames');
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null; // preview: specific times

(async () => {
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto(`file://${path.join(__dirname, 'scene.html')}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const duration = await page.evaluate(() => window.DURATION);
  if (only) {
    for (const t of only) {
      await page.evaluate((tt) => window.renderFrame(tt), t);
      await page.waitForTimeout(60);
      await page.screenshot({ path: path.join(__dirname, `preview-${t}.jpg`), type: 'jpeg', quality: 85 });
    }
  } else {
    const total = Math.round(duration * FPS);
    for (let i = 0; i < total; i++) {
      await page.evaluate((tt) => window.renderFrame(tt), i / FPS);
      await page.screenshot({ path: path.join(dir, `${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 90 });
      if (i % 150 === 0) console.log('frame', i, '/', total);
    }
  }
  await browser.close();
})();
