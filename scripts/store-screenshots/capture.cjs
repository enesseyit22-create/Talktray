/**
 * Captures raw app screens for the store, per language, from the web preview.
 *
 *   EXPO_PUBLIC_PREVIEW=1 npx expo start --web --port 8081
 *   node scripts/store-screenshots/capture.cjs [outDir] [locales...]
 *
 * Preview mode loads natively written sample data for the device language
 * (src/data/seed-copy.ts). Writes <outDir>/<locale>/<device>/<n>-<screen>.png for
 * device "phone" (430×932 @3x) and "tablet" (1032×1376 @2x).
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = process.env.PREVIEW_URL || 'http://localhost:8081';
const ROOT = path.resolve(__dirname, '../..');
const LOCALES = ['en', 'tr', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pt-BR', 'id'];
const TAGS = { en: 'en-US', tr: 'tr-TR', de: 'de-DE', es: 'es-ES', fr: 'fr-FR', it: 'it-IT', ja: 'ja-JP', ko: 'ko-KR', 'pt-BR': 'pt-BR', id: 'id-ID' };
const DEVICES = {
  phone: { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 1032, height: 1376 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

/** Reads one string from src/i18n/<locale>.ts, e.g. ('tr', 'record', 'sampleTr'); section null for top level. */
function copy(locale, section, key) {
  const source = fs.readFileSync(path.join(ROOT, 'src/i18n', `${locale}.ts`), 'utf8');
  const block = section ? source.slice(source.indexOf(`\n  ${section}: {`)) : source;
  const match = block.match(new RegExp(`\\n\\s+${key}: (['"])((?:\\\\.|(?!\\1).)*)\\1`));
  if (!match) throw new Error(`missing ${locale}.${section}.${key}`);
  return match[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
}

function seedSearch(locale) {
  const source = fs.readFileSync(path.join(ROOT, 'src/data/seed-copy.ts'), 'utf8');
  const start = source.indexOf(locale === 'pt-BR' ? "'pt-BR': {" : `\n  ${locale}: {`);
  return source.slice(start).match(/search: '([^']+)'/)[1];
}

async function settle(page, ms = 1800) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(ms);
}

async function open(page, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await settle(page);
}

async function run() {
  const outDir = path.resolve(process.argv[2] || path.join(ROOT, 'store/screenshots/raw'));
  const locales = process.argv.slice(3).length ? process.argv.slice(3) : LOCALES;
  const browser = await chromium.launch();
  for (const locale of locales) {
    for (const [device, options] of Object.entries(DEVICES)) {
      const dir = path.join(outDir, locale, device);
      fs.mkdirSync(dir, { recursive: true });
      const context = await browser.newContext({ ...options, locale: TAGS[locale], timezoneId: 'Europe/Istanbul' });
      const page = await context.newPage();
      // Morning light, so the greeting reads "Good morning".
      await page.clock.setFixedTime(new Date('2026-11-17T06:41:00Z'));
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await open(page, '/home');
      const skip = page.getByText(copy(locale, null, 'skip'), { exact: true });
      if (await skip.count()) {
        await skip.first().click();
        await settle(page, 800);
      }
      const shot = (name) => page.screenshot({ path: path.join(dir, `${name}.png`) });

      await open(page, '/home');
      await shot('1-home');

      await open(page, '/record');
      await page.getByText(copy(locale, 'record', 'sampleTr'), { exact: true }).first().click();
      await settle(page);
      await shot('2-review');

      await open(page, '/tasks');
      await shot('3-tasks');

      await open(page, '/home');
      const search = page.getByPlaceholder(copy(locale, 'search', 'placeholder'));
      await search.fill(seedSearch(locale));
      await search.evaluate((element) => element.blur());
      await settle(page, 800);
      await search.evaluate((element) => element.scrollIntoView({ block: 'start' }));
      await page.evaluate(() => window.scrollBy(0, -24));
      await settle(page, 500);
      await shot('4-search');

      await open(page, '/lists/preview');
      await shot('5-shared');

      if (errors.length) console.warn(locale, device, 'page errors:', errors.slice(0, 3));
      console.log('captured', locale, device);
      await context.close();
    }
  }
  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
