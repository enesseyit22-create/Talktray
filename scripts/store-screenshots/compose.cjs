/**
 * Turns raw captures into store images with a localized headline.
 *
 *   node scripts/store-screenshots/compose.cjs [rawDir] [outDir] [locales...]
 *
 * Output per locale:
 *   ios-6.9/NN.jpg     1290×2796  App Store iPhone 6.9" (also accepted for 6.5")
 *   ipad-13/NN.jpg     2064×2752  App Store iPad 13"
 *   android-phone/NN.jpg 1080×1920 Google Play phone
 *   android-feature.jpg  1024×500  Google Play feature graphic
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const CAPTIONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'captions.json'), 'utf8'));
const SCREENS = ['1-home', '2-review', '3-tasks', '4-search', '5-shared'];
const FONT_DIR = path.join(ROOT, 'node_modules/@expo-google-fonts/plus-jakarta-sans');
const LOGO = path.join(ROOT, 'assets/brand/logo-1024.png');
const CJK = { ja: "'Noto Sans CJK JP'", ko: "'Noto Sans CJK KR'" };

const FORMATS = {
  'ios-6.9': { width: 1290, height: 2796, raw: 'phone', shot: 1000, radius: 96, bezel: 22, title: 104, sub: 50, top: 190 },
  'ipad-13': { width: 2064, height: 2752, raw: 'tablet', shot: 1620, radius: 56, bezel: 26, title: 112, sub: 54, top: 170 },
  'android-phone': { width: 1080, height: 1920, raw: 'phone', shot: 690, radius: 64, bezel: 16, title: 72, sub: 36, top: 110 },
};

function fileUrl(file) {
  return `file://${file}`;
}

function escape(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fontFaces() {
  return `
  @font-face { font-family: Jakarta; font-weight: 800; src: url('${fileUrl(path.join(FONT_DIR, '800ExtraBold/PlusJakartaSans_800ExtraBold.ttf'))}'); }
  @font-face { font-family: Jakarta; font-weight: 600; src: url('${fileUrl(path.join(FONT_DIR, '600SemiBold/PlusJakartaSans_600SemiBold.ttf'))}'); }`;
}

function background() {
  return `
  .blob { position: absolute; border-radius: 50%; filter: blur(2px); }
  body { margin: 0; background: #F7F2FF; overflow: hidden; }`;
}

function blobs(width, height) {
  const blob = (x, y, size, color) =>
    `<div class="blob" style="left:${x * width}px;top:${y * height}px;width:${size * width}px;height:${size * width}px;background:${color}"></div>`;
  return [
    blob(-0.25, -0.06, 0.8, '#E3D4FF'),
    blob(0.55, 0.02, 0.65, '#FFD4C6'),
    blob(-0.2, 0.42, 0.6, '#D4EBFF'),
    blob(0.6, 0.62, 0.7, '#D5F6E8'),
    blob(0.1, 0.8, 0.5, '#FFD9EC'),
  ].join('');
}

function screenHtml(locale, format, screenshot, title, sub) {
  const f = FORMATS[format];
  const family = `Jakarta, ${CJK[locale] ?? "'Noto Sans'"}, sans-serif`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${fontFaces()}${background()}
  .stage { position: relative; width: ${f.width}px; height: ${f.height}px; font-family: ${family}; color: #2A2452; }
  .copy { position: absolute; top: ${f.top}px; left: 0; right: 0; padding: 0 ${Math.round(f.width * 0.08)}px; text-align: center; }
  h1 { margin: 0; font-weight: 800; font-size: ${f.title}px; line-height: 1.08; letter-spacing: -0.02em; }
  p { margin: ${Math.round(f.sub * 0.55)}px 0 0; font-weight: 600; font-size: ${f.sub}px; line-height: 1.3; color: #5E5880; }
  .device { position: absolute; left: 50%; bottom: -${f.radius}px; transform: translateX(-50%);
    width: ${f.shot}px; padding: ${f.bezel}px; border-radius: ${f.radius + f.bezel}px; background: #1D1A33;
    box-shadow: 0 40px 120px rgba(42, 36, 82, 0.28); }
  .device img { display: block; width: 100%; border-radius: ${f.radius}px; }
  </style></head><body><div class="stage">${blobs(f.width, f.height)}
  <div class="copy"><h1>${escape(title)}</h1><p>${escape(sub)}</p></div>
  <div class="device"><img src="${fileUrl(screenshot)}"></div>
  </div></body></html>`;
}

function featureHtml(locale, screenshot, tagline) {
  const family = `Jakarta, ${CJK[locale] ?? "'Noto Sans'"}, sans-serif`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${fontFaces()}${background()}
  .stage { position: relative; width: 1024px; height: 500px; font-family: ${family}; color: #2A2452; overflow: hidden; }
  .copy { position: absolute; left: 64px; top: 0; bottom: 0; width: 560px; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
  .brand { display: flex; align-items: center; gap: 18px; font-weight: 800; font-size: 52px; letter-spacing: -0.02em; }
  .brand img { width: 84px; height: 84px; border-radius: 22px; }
  .brand span { color: #7A6AF0; }
  h1 { margin: 0; font-weight: 800; font-size: 44px; line-height: 1.12; letter-spacing: -0.01em; }
  .device { position: absolute; right: 70px; top: 46px; width: 270px; padding: 9px; border-radius: 44px; background: #1D1A33;
    box-shadow: 0 30px 80px rgba(42, 36, 82, 0.3); }
  .device img { display: block; width: 100%; border-radius: 36px; }
  </style></head><body><div class="stage">${blobs(1024, 500)}
  <div class="copy"><div class="brand"><img src="${fileUrl(LOGO)}"><div>Talk<span>Tray</span></div></div><h1>${escape(tagline)}</h1></div>
  <div class="device"><img src="${fileUrl(screenshot)}"></div>
  </div></body></html>`;
}

async function render(page, html, out, width, height) {
  const htmlFile = `${out}.html`;
  fs.writeFileSync(htmlFile, html);
  await page.setViewportSize({ width, height });
  await page.goto(fileUrl(htmlFile), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: out, type: 'jpeg', quality: 92 });
  fs.unlinkSync(htmlFile);
}

async function run() {
  const rawDir = path.resolve(process.argv[2] || path.join(ROOT, 'store/screenshots/raw'));
  const outDir = path.resolve(process.argv[3] || path.join(ROOT, 'store/screenshots/final'));
  const locales = process.argv.slice(4).length ? process.argv.slice(4) : Object.keys(CAPTIONS);
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const locale of locales) {
    const captions = CAPTIONS[locale];
    for (const [format, f] of Object.entries(FORMATS)) {
      const dir = path.join(outDir, locale, format);
      fs.mkdirSync(dir, { recursive: true });
      for (const [index, screen] of SCREENS.entries()) {
        const [title, sub] = captions.screens[index];
        const shot = path.join(rawDir, locale, f.raw, `${screen}.png`);
        await render(page, screenHtml(locale, format, shot, title, sub), path.join(dir, `${String(index + 1).padStart(2, '0')}.jpg`), f.width, f.height);
      }
    }
    await render(
      page,
      featureHtml(locale, path.join(rawDir, locale, 'phone', '1-home.png'), captions.tagline),
      path.join(outDir, locale, 'android-feature.jpg'),
      1024,
      500,
    );
    console.log('composed', locale);
  }
  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
