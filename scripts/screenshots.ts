/**
 * Store screenshots (1280×800), taken from the built Chrome extension in Playwright's bundled Chromium.
 *
 *   npm run screenshots        → docs/screenshots/*.png
 *
 * The test-page server is started here if it is not running already.
 */
import { chromium, type BrowserContext, type Worker } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serveTestPage } from '../bench/serve.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXTENSION = `${ROOT}.output/chrome-mv3`;
const OUT = `${ROOT}docs/screenshots`;
const TEST_PAGE = 'http://127.0.0.1:4173/?nohijack';
const SIZE = { width: 1280, height: 800 };

async function launch(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    viewport: SIZE,
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  for (let i = 0; i < 100; i++) {
    if ((await sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length)) === 2) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  for (const p of context.pages()) if (p.url().includes('options.html')) await p.close();
  return { context, sw, id: new URL(sw.url()).host };
}

async function setOnboarded(sw: Worker, onboarded: boolean): Promise<void> {
  await sw.evaluate(async (value) => {
    const key = 'sukoon:settings';
    const current = (await chrome.storage.local.get(key))[key] ?? {};
    await chrome.storage.local.set({ [key]: { ...current, onboarded: value } });
  }, onboarded);
}

mkdirSync(OUT, { recursive: true });
const server = await serveTestPage(4173).catch(() => null);
const { context, sw, id } = await launch();
try {
  // 1. Welcome screen, then the settings page.
  await setOnboarded(sw, false);
  const options = await context.newPage();
  await options.goto(`chrome-extension://${id}/options.html#welcome`);
  await options.waitForSelector('#welcome-title');
  await options.screenshot({ path: `${OUT}/welcome.png` });
  await setOnboarded(sw, true);
  await options.goto(`chrome-extension://${id}/options.html`); // no #welcome hash: the settings themselves
  await options.waitForSelector('main h1');
  await options.waitForFunction(() => document.querySelector('#welcome-title') === null);
  await options.waitForTimeout(300);
  await options.screenshot({ path: `${OUT}/options.png` });
  await options.close();

  // 2. The test page, calmed, and the popup pointed at it.
  const page = await context.newPage();
  await page.goto(TEST_PAGE);
  await page.waitForLoadState('load');
  await page.waitForTimeout(800);
  const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({ url: u.split('?')[0] + '*' }))[0]!.id!, TEST_PAGE);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html?tab=${tabId}`);
  await popup.waitForSelector('main h1');
  // The popup is 360 px wide; shown at 1.75× and centred it fills the 1280×800 store frame legibly.
  await popup.addStyleTag({
    content: 'html { zoom: 1.75; } body { display: flex; justify-content: center; align-items: flex-start; padding: 12px 0; }',
  });
  await popup.waitForFunction(() => /\d+ \/ 100 now/.test(document.body.textContent ?? ''), null, { timeout: 5000 }).catch(() => {});
  await popup.screenshot({ path: `${OUT}/popup.png` });
  // Second frame: the Sensory Load Index and the freeze button, further down the popup.
  await popup.evaluate(() => document.getElementById('sli-title')?.scrollIntoView({ block: 'start' }));
  await popup.evaluate(() => window.scrollBy(0, -24));
  await popup.waitForTimeout(200);
  await popup.screenshot({ path: `${OUT}/popup-sli.png` });
  await popup.close();

  // 3. The panic freeze over the test page. The still picture is a capture of the window's visible tab, so the
  //    test page must be in front when the request is made (the request itself can come from a background tab).
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${id}/popup.html`);
  await page.bringToFront();
  await page.waitForTimeout(300);
  await ext.evaluate((t) => chrome.runtime.sendMessage({ type: 'panic', tabId: t }), tabId);
  await ext.close();
  await page.bringToFront();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/frozen.png` });
  console.log(`screenshots written to docs/screenshots/`);
} finally {
  await context.close();
  server?.close();
}
