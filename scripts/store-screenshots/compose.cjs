/**
 * Turns raw captures into store images in the "night violet" style: dark gradient,
 * localized headline with a gradient accent line, a tilted phone, and floating cards
 * whose text comes from the app's own translations and sample data.
 *
 *   node scripts/store-screenshots/compose.cjs [rawDir] [outDir] [locales...]
 *
 * Output per locale:
 *   ios-6.9/NN.jpg        1290×2796  App Store iPhone 6.9"
 *   ipad-13/NN.jpg        2064×2752  App Store iPad 13"
 *   android-phone/NN.jpg  1080×1920  Google Play phone
 *   android-feature.jpg   1024×500   Google Play feature graphic
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const CAPTIONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'captions.json'), 'utf8'));
const SCREENS = ['1-home', '2-review', '3-tasks', '4-search', '5-shared'];
const FONT_DIR = path.join(ROOT, 'node_modules/@expo-google-fonts/plus-jakarta-sans');
const LOGO = path.join(ROOT, 'assets/brand/logo-1024.png');
const CJK = { ja: "'Noto Sans CJK JP'", ko: "'Noto Sans CJK KR'" };

/** Loads a TypeScript module that only has type imports (i18n dictionaries, seed copy). */
function loadTs(file) {
  const source = fs.readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', outputText)(mod, mod.exports, () => ({}));
  return mod.exports;
}
const SEED = loadTs(path.join(ROOT, 'src/data/seed-copy.ts')).SEED_COPY;
function dictionary(locale) {
  const exports = loadTs(path.join(ROOT, 'src/i18n', `${locale}.ts`));
  return Object.values(exports)[0];
}

const ICON = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
  sparkle: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
};
const svg = (name, color, size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;
const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const url = (file) => `file://${file}`;

/** Floating cards per screen. dx/dy are fractions of the device box; text comes from the app. */
function cardsFor(index, locale) {
  const t = dictionary(locale);
  const seed = SEED[locale];
  const cap = CAPTIONS[locale];
  const at = (day, time) => `${day} ${time}`;
  switch (index) {
    case 0:
      return [
        { dx: -0.19, dy: 0.32, r: -6, bg: '#7A6AF0', icon: 'mic', title: '0:14', sub: cap.itemsFound },
        { dx: 0.5, dy: 0.64, r: 5, bg: '#2FBF8F', icon: 'check', title: seed.review.task, sub: at(t.tomorrow, '10:00') },
      ];
    case 1:
      return [
        { dx: -0.17, dy: 0.27, r: -5, bg: '#FF8A65', icon: 'clock', title: t.types.reminder, sub: seed.review.reminder },
        { dx: 0.56, dy: 0.47, r: 4, bg: '#4D9DFF', icon: 'cal', title: t.types.event, sub: seed.review.event },
        { dx: -0.15, dy: 0.68, r: -3, bg: '#F2A93B', icon: 'bag', title: t.types.shopping, sub: seed.review.shopping },
      ];
    case 2:
      return [
        { dx: 0.5, dy: 0.3, r: 5, bg: '#7A6AF0', icon: 'repeat', title: t.repeat.monthly, sub: seed.items[4] },
        { dx: -0.17, dy: 0.6, r: -5, bg: '#FF8A65', icon: 'bell', title: t.types.reminder, sub: seed.items[9] },
      ];
    case 3:
      return [{ dx: 0.42, dy: 0.6, r: 4, bg: '#4D9DFF', icon: 'search', title: seed.search, sub: t.search.resultsOne }];
    default:
      return [
        { dx: -0.2, dy: 0.12, r: -5, bg: '#2FBF8F', icon: 'users', title: seed.shared.members.join(' · '), sub: cap.live },
        { dx: 0.5, dy: 0.53, r: 5, bg: '#7A6AF0', icon: 'check', title: seed.shared.items[4], sub: t.shared.doneBy.replace('{name}', seed.shared.members[2]) },
      ];
  }
}

const FORMATS = {
  'ios-6.9': { width: 1290, height: 2796, raw: 'phone', device: 900, top: 1000, pad: 20, radius: 100, title: 124, kicker: 38, sub: 50, side: 110, copyTop: 190, scale: 1 },
  'ipad-13': { width: 2064, height: 2752, raw: 'tablet', device: 1560, top: 820, pad: 24, radius: 60, title: 128, kicker: 40, sub: 52, side: 170, copyTop: 170, scale: 1.25 },
  'android-phone': { width: 1080, height: 1920, raw: 'phone', device: 620, top: 690, pad: 14, radius: 70, title: 92, kicker: 30, sub: 38, side: 90, copyTop: 120, scale: 0.72 },
};
const TILT = [-4, 3, -3, 3, -3];

function stageCss(f, locale) {
  const family = `J, ${CJK[locale] ?? "'Noto Sans'"}, sans-serif`;
  return `
  @font-face { font-family: J; font-weight: 800; src: url('${url(path.join(FONT_DIR, '800ExtraBold/PlusJakartaSans_800ExtraBold.ttf'))}'); }
  @font-face { font-family: J; font-weight: 700; src: url('${url(path.join(FONT_DIR, '700Bold/PlusJakartaSans_700Bold.ttf'))}'); }
  @font-face { font-family: J; font-weight: 600; src: url('${url(path.join(FONT_DIR, '600SemiBold/PlusJakartaSans_600SemiBold.ttf'))}'); }
  body { margin: 0; } * { box-sizing: border-box; }
  .stage { position: relative; width: ${f.width}px; height: ${f.height}px; overflow: hidden; font-family: ${family}; color: #fff;
    background: radial-gradient(${f.width * 0.95}px ${f.width * 0.7}px at 15% 8%, #6D4DFF 0%, transparent 60%),
      radial-gradient(${f.width * 0.8}px ${f.width * 0.8}px at 100% 60%, #FF7A9C55 0%, transparent 55%),
      linear-gradient(170deg, #1A1440 0%, #120E2E 55%, #0B0920 100%); }
  .grain { position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px); background-size: 6px 6px; }
  .glow { position: absolute; border-radius: 50%; background: radial-gradient(circle, #7A6AF0aa 0%, transparent 65%); filter: blur(30px); }
  .kicker { display: inline-flex; align-items: center; gap: ${f.kicker * 0.35}px; padding: ${f.kicker * 0.37}px ${f.kicker * 0.74}px; border-radius: 999px;
    background: rgba(255,255,255,.1); border: 1.5px solid rgba(255,255,255,.18); font-weight: 700; font-size: ${f.kicker}px; letter-spacing: .02em; color: #D9D2FF; }
  h1 { margin: ${f.title * 0.33}px 0 0; font-weight: 800; font-size: ${f.title}px; line-height: 1.04; letter-spacing: -.035em; }
  h1 em { font-style: normal; background: linear-gradient(90deg, #B9A8FF, #FFB3C7); -webkit-background-clip: text; color: transparent; }
  p { margin: ${f.sub * 0.65}px 0 0; font-weight: 600; font-size: ${f.sub}px; line-height: 1.3; color: #B8B2DA; }
  .device { position: absolute; padding: ${f.pad}px; border-radius: ${f.radius + f.pad}px;
    background: linear-gradient(145deg, #3A3366, #151229); box-shadow: 0 80px 160px rgba(0,0,0,.55), 0 0 0 2px rgba(255,255,255,.08) inset; }
  .device img { display: block; width: 100%; border-radius: ${f.radius}px; }
  .card { position: absolute; display: flex; align-items: center; gap: ${26 * f.scale}px; padding: ${26 * f.scale}px ${40 * f.scale}px ${26 * f.scale}px ${26 * f.scale}px;
    border-radius: ${44 * f.scale}px; background: rgba(24,18,58,.93); border: 1.5px solid rgba(255,255,255,.18); box-shadow: 0 30px 70px rgba(0,0,0,.4);
    max-width: ${f.device * 0.78}px; }
  .ic { flex: none; width: ${84 * f.scale}px; height: ${84 * f.scale}px; border-radius: ${26 * f.scale}px; display: flex; align-items: center; justify-content: center; }
  .ct { font-weight: 800; font-size: ${42 * f.scale}px; line-height: 1.15; }
  .cs { font-weight: 600; font-size: ${31 * f.scale}px; line-height: 1.2; color: #CFC8F5; margin-top: ${4 * f.scale}px; }`;
}

function screenHtml(locale, format, index, shot) {
  const f = FORMATS[format];
  const c = CAPTIONS[locale].screens[index];
  const deviceLeft = (f.width - f.device) / 2;
  const deviceHeight = f.device * (f.raw === 'phone' ? 932 / 430 : 1376 / 1032) + f.pad * 2;
  const cards = cardsFor(index, locale)
    .map((card) => {
      const left = Math.max(f.side * 0.3, deviceLeft + card.dx * f.device);
      const top = f.top + card.dy * deviceHeight;
      return `<div class="card" style="left:${left}px;top:${top}px;transform:rotate(${card.r}deg)">
        <div class="ic" style="background:${card.bg}">${svg(card.icon, '#fff', 44 * f.scale)}</div>
        <div><div class="ct">${esc(card.title)}</div>${card.sub ? `<div class="cs">${esc(card.sub)}</div>` : ''}</div></div>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${stageCss(f, locale)}</style></head><body>
  <div class="stage"><div class="grain"></div>
  <div class="glow" style="left:${f.width / 2 - f.device / 2}px;top:${f.top + deviceHeight * 0.25}px;width:${f.device}px;height:${f.device}px"></div>
  <div style="position:absolute;top:${f.copyTop}px;left:${f.side}px;right:${f.side}px">
    <div class="kicker">${svg('sparkle', '#D9D2FF', f.kicker * 0.95)}${esc(c.kicker)}</div>
    <h1>${esc(c.title)}<br><em>${esc(c.accent)}</em></h1><p>${esc(c.sub)}</p>
  </div>
  <div class="device" style="left:${deviceLeft}px;top:${f.top}px;width:${f.device}px;transform:rotate(${TILT[index]}deg)"><img src="${url(shot)}"></div>
  ${cards}</div></body></html>`;
}

function featureHtml(locale, shot) {
  const f = { width: 1024, height: 500 };
  const [line1, line2] = CAPTIONS[locale].tagline;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${stageCss({ ...FORMATS['android-phone'], ...f }, locale)}
  .brand { display: flex; align-items: center; gap: 18px; font-weight: 800; font-size: 46px; letter-spacing: -.02em; }
  .brand img { width: 76px; height: 76px; border-radius: 20px; }
  .brand span { color: #B9A8FF; }
  .tag { margin-top: 22px; font-weight: 800; font-size: 50px; line-height: 1.08; letter-spacing: -.03em; }
  .tag em { font-style: normal; background: linear-gradient(90deg, #B9A8FF, #FFB3C7); -webkit-background-clip: text; color: transparent; }
  </style></head><body><div class="stage"><div class="grain"></div>
  <div class="glow" style="left:620px;top:40px;width:420px;height:420px"></div>
  <div style="position:absolute;left:64px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center">
    <div class="brand"><img src="${url(LOGO)}"><div>Talk<span>Tray</span></div></div>
    <div class="tag">${esc(line1)}<br><em>${esc(line2)}</em></div>
  </div>
  <div class="device" style="left:690px;top:42px;width:250px;padding:9px;border-radius:44px;transform:rotate(-4deg)">
    <img src="${url(shot)}" style="border-radius:36px"></div>
  </div></body></html>`;
}

async function render(page, html, out, width, height) {
  const file = `${out}.html`;
  fs.writeFileSync(file, html);
  await page.setViewportSize({ width, height });
  await page.goto(url(file), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: out, type: 'jpeg', quality: 92 });
  fs.unlinkSync(file);
}

async function run() {
  const rawDir = path.resolve(process.argv[2] || path.join(ROOT, 'store/screenshots/raw'));
  const outDir = path.resolve(process.argv[3] || path.join(ROOT, 'store/screenshots/final'));
  const locales = process.argv.slice(4).length ? process.argv.slice(4) : Object.keys(CAPTIONS);
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const locale of locales) {
    for (const [format, f] of Object.entries(FORMATS)) {
      const dir = path.join(outDir, locale, format);
      fs.mkdirSync(dir, { recursive: true });
      for (const [index, screen] of SCREENS.entries()) {
        const shot = path.join(rawDir, locale, f.raw, `${screen}.png`);
        await render(page, screenHtml(locale, format, index, shot), path.join(dir, `${String(index + 1).padStart(2, '0')}.jpg`), f.width, f.height);
      }
    }
    await render(page, featureHtml(locale, path.join(rawDir, locale, 'phone', '1-home.png')), path.join(outDir, locale, 'android-feature.jpg'), 1024, 500);
    console.log('composed', locale);
  }
  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
