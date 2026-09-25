/**
 * Flash Guard, live: tab capture → offscreen analyser → dimming.
 *
 * tabCapture normally needs a real user gesture on the toolbar, which Playwright
 * cannot give. Chromium's test switch --allowlisted-extension-id lifts that
 * requirement for one extension id, so the full pipeline can run unattended.
 */
import { chromium, expect, test } from '@playwright/test';
import { EXTENSION_PATH, TEST_PAGE, waitForRegistration } from './fixtures';

async function extensionId(): Promise<string> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  await context.close();
  return id;
}

test('M9 live: Flash Guard detects the gated flash test and dims the page', async () => {
  const id = await extensionId();
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    viewport: { width: 1280, height: 720 },
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      `--allowlisted-extension-id=${id}`,
    ],
  });
  try {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await waitForRegistration(sw, 2);
    const page = await context.newPage();
    await page.goto(`${TEST_PAGE}?nohijack`);
    await page.locator('#flash-canvas').scrollIntoViewIfNeeded();
    await page.bringToFront();

    const ext = await context.newPage();
    await ext.goto(`chrome-extension://${id}/popup.html`);
    const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({ url: u + '*' }))[0]!.id!, TEST_PAGE);
    const status = (await ext.evaluate((t) => chrome.runtime.sendMessage({ type: 'flash-guard:start', tabId: t }), tabId)) as {
      running: boolean;
      error?: string;
    };
    test.skip(!status.running, `tab capture unavailable in this environment: ${status.error}`);
    await ext.close();

    await page.bringToFront();
    await page.click('#flash-start');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-sukoon-flash-dim')), { timeout: 10_000 })
      .toBe(true);
    // The flashing canvas is driven by requestAnimationFrame, which the dim holds: it stops changing.
    const a = await page.$eval('#flash-canvas', (c) => (c as HTMLCanvasElement).toDataURL());
    await page.waitForTimeout(400);
    const b = await page.$eval('#flash-canvas', (c) => (c as HTMLCanvasElement).toDataURL());
    expect(a).toBe(b);
  } finally {
    await context.close();
  }
});
