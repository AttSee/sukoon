/**
 * End-to-end checks of the built extension against the test page.
 * These are the plan's day-by-day acceptance criteria, automated.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import type { SliReport } from '../src/shared/sli';
import { expect, setSettings, tabIdOf, test, TEST_PAGE, waitForRegistration } from './fixtures';

const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const animationOf = (page: Page, selector: string) =>
  page.$eval(selector, (el) => {
    const s = getComputedStyle(el);
    return { duration: s.animationDuration, iterations: s.animationIterationCount };
  });

async function openTestPage(page: Page, query = '') {
  await page.goto(TEST_PAGE + query);
  await page.waitForLoadState('load');
  await page.waitForTimeout(600); // settings round-trip + first adapter pass
}

test('M1: CSS loops finish instantly, and an excluded site is left alone', async ({ page, sw }) => {
  await openTestPage(page);
  expect(await animationOf(page, '#spinner')).toEqual({ duration: '1e-05s', iterations: '1' });
  expect(await animationOf(page, '#blink')).toEqual({ duration: '1e-05s', iterations: '1' });
  // "Finish, don't cancel": the fade-in panel is fully visible.
  expect(await page.$eval('#fade-in', (el) => getComputedStyle(el).opacity)).toBe('1');

  await setSettings(sw, { excludedHosts: ['127.0.0.1'] });
  await waitForRegistration(sw, 2);
  await openTestPage(page);
  expect(await animationOf(page, '#spinner')).toEqual({ duration: '0.9s', iterations: 'infinite' });
});

test('M2: the site’s own reduced-motion version turns on (CSS, link, picture, matchMedia)', async ({ page }) => {
  await openTestPage(page, '?nohijack');
  await expect(page.locator('#prm-js')).toContainText('true');
  expect(await page.$eval('#prm-css', (el) => getComputedStyle(el).fontWeight)).toBe('700');
  expect(await page.$eval('#prm-link', (el) => getComputedStyle(el).fontWeight)).toBe('700');
  // Cross-origin sheet: re-read by the background, extracted rules adopted in the MAIN world.
  await expect.poll(() => page.$eval('#prm-xo', (el) => getComputedStyle(el).fontWeight)).toBe('700');
  // Nested @supports > @media rule.
  expect(await page.$eval('#js-motion', (el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  expect(await page.$eval('#picture-img', (el) => (el as HTMLImageElement).currentSrc)).toContain('still.png');
  // Scripted motion that checks matchMedia never started.
  expect(await page.$eval('#js-motion', (el) => el.getAnimations().length)).toBe(0);
});

test('M2: the reduced-motion switch can be turned off and on again without losing cross-origin rules', async ({ page, sw }) => {
  await openTestPage(page, '?nohijack');
  await expect.poll(() => page.$eval('#prm-xo', (el) => getComputedStyle(el).fontWeight)).toBe('700');
  await setSettings(sw, { overrides: { reducedMotionSwitch: false } });
  await expect.poll(() => page.$eval('#prm-css', (el) => getComputedStyle(el).fontWeight)).toBe('400');
  await expect.poll(() => page.$eval('#prm-xo', (el) => getComputedStyle(el).fontWeight)).toBe('400');
  await setSettings(sw, { overrides: {} });
  await expect.poll(() => page.$eval('#prm-css', (el) => getComputedStyle(el).fontWeight)).toBe('700');
  await expect.poll(() => page.$eval('#prm-xo', (el) => getComputedStyle(el).fontWeight)).toBe('700');
});

test('M3: shadow roots and frames get the calm layer', async ({ page }) => {
  await openTestPage(page, '?nohijack');
  const shadow = await page.$eval('#badge', (el) => {
    const inner = el.shadowRoot!.getElementById('inner')!;
    return getComputedStyle(inner).animationDuration;
  });
  expect(shadow).toBe('1e-05s');
  const frame = page.frameLocator('#frame');
  expect(await frame.locator('#b').evaluate((el) => getComputedStyle(el).animationDuration)).toBe('1e-05s');
});

test('M4: WAAPI loops park, one-shot animations finish, SVG and reveal-on-scroll settle', async ({ page }) => {
  await openTestPage(page, '?nohijack');
  await page.waitForTimeout(600);
  const state = await page.evaluate(() => ({
    loop: document.getElementById('waapi-loop')!.getAnimations()[0]?.playState,
    once: document.getElementById('waapi-once')!.getAnimations()[0]?.playState ?? 'finished',
    svg: (document.getElementById('smil') as unknown as SVGSVGElement).animationsPaused(),
    aos: [...document.querySelectorAll('[data-aos]')].every((el) => getComputedStyle(el).opacity === '1'),
  }));
  expect(state).toEqual({ loop: 'paused', once: 'finished', svg: true, aos: true });
});

test('M4: the GSAP adapter finishes running tweens but leaves paused timelines (menus) alone', async ({ page }) => {
  await openTestPage(page, '?nohijack');
  await page.waitForTimeout(600);
  const progress = await page.evaluate(() => {
    const probe = (window as unknown as { __gsapProbe: { menuTimeline: { progress(): number }; introTween: { progress(): number } } }).__gsapProbe;
    return { menu: probe.menuTimeline.progress(), intro: probe.introTween.progress() };
  });
  expect(progress).toEqual({ menu: 0, intro: 1 });
});

test('M5: wheel hijack is bypassed, smooth scroll is instant, parallax is frozen', async ({ page }) => {
  await openTestPage(page);
  await page.mouse.move(640, 400);
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({
    hijacked: (window as unknown as { __hijackedWheels?: number }).__hijackedWheels ?? 0,
    y: window.scrollY,
  }));
  expect(after.hijacked).toBe(0);
  expect(after.y).toBeGreaterThan(500);

  expect(await page.$eval('#parallax-back', (el) => el.hasAttribute('data-sukoon-still'))).toBe(true);
  expect(await page.$eval('#parallax-back', (el) => getComputedStyle(el).transform)).toBe('none');

  await page.click('#to-top');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('M5: a hijacker without the Lenis class is bypassed too, and a wheel-zoom widget keeps working', async ({ page }) => {
  await openTestPage(page, '?nolenisclass');
  await page.mouse.move(640, 400);
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({
    hijacked: (window as unknown as { __hijackedWheels?: number }).__hijackedWheels ?? 0,
    y: window.scrollY,
  }));
  // The zero-delta probe at the start of the burst is the only event the hijacker ever sees.
  expect(after.hijacked).toBeLessThanOrEqual(1);
  expect(after.y).toBeGreaterThan(500);
});

test('M5: the wheel guard leaves a widget that cancels the wheel alone and never latches', async ({ page }) => {
  await openTestPage(page, '?nohijack');
  const widget = page.locator('#zoom-widget');
  await widget.scrollIntoViewIfNeeded();
  const box = (await widget.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(60);
  }
  // Every wheel reached the widget (nothing was stopped) ...
  expect(await page.evaluate(() => (window as unknown as { __widgetWheels: number }).__widgetWheels)).toBe(5);
  expect(await page.locator('#zoom-level').textContent()).toBe('zoom 5');
  // ... and after 5 cancelled wheels the page's own listeners still see wheel events elsewhere.
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => (window as unknown as { __pageWheels: number }).__pageWheels);
  await page.mouse.move(640, 100);
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(60);
  }
  const afterCount = await page.evaluate(() => (window as unknown as { __pageWheels: number }).__pageWheels);
  // All three real wheels arrived (the guard's zero-delta probe at the start of the burst may add one more).
  expect(afterCount - before).toBeGreaterThanOrEqual(3);
});

test('M6: autoplay is stopped; a real click still plays', async ({ page }) => {
  await openTestPage(page, '?nohijack');
  await page.waitForTimeout(800);
  expect(await page.$eval('#video', (v) => (v as HTMLVideoElement).paused)).toBe(true);
  await page.click('#play-btn');
  await page.waitForTimeout(500);
  expect(await page.$eval('#video', (v) => (v as HTMLVideoElement).paused)).toBe(false);
});

test('M6: native animated-image policy is set', async ({ sw }) => {
  const value = await sw.evaluate(
    () => new Promise<string>((resolve) => chrome.accessibilityFeatures.animationPolicy.get({}, (d) => resolve(d.value as string))),
  );
  expect(value).toBe('none');
});

test('M7: panic freezes and Escape releases', async ({ context, page, sw, extensionId }) => {
  await openTestPage(page, '?nohijack');
  const tabId = await tabIdOf(sw, TEST_PAGE);
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/popup.html`);
  const frozen = await ext.evaluate((id) => chrome.runtime.sendMessage({ type: 'panic', tabId: id }), tabId);
  expect(frozen).toBe(true);
  await page.bringToFront();
  expect(await page.locator('sukoon-ui').count()).toBe(1);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');
  await expect.poll(() => sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId)).toBe('❚❚');
  await page.keyboard.press('Escape');
  expect(await page.locator('sukoon-ui').count()).toBe(0);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden');
  await expect.poll(() => sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId)).toBe('');
});

test('M7: embedded frames freeze and thaw with the top frame', async ({ context, page, sw, extensionId }) => {
  await openTestPage(page, '?nohijack');
  const tabId = await tabIdOf(sw, TEST_PAGE);
  const frame = page.frameLocator('#frame');
  const frameState = () =>
    frame.locator('body').evaluate(async (body) => {
      const doc = body.ownerDocument;
      const rafRan = await new Promise<boolean>((resolve) => {
        doc.defaultView!.requestAnimationFrame(() => resolve(true));
        setTimeout(() => resolve(false), 300);
      });
      return { overflow: doc.documentElement.style.overflow, rafRan };
    });
  expect(await frameState()).toEqual({ overflow: '', rafRan: true });

  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/popup.html`);
  expect(await ext.evaluate((id) => chrome.runtime.sendMessage({ type: 'panic', tabId: id }), tabId)).toBe(true);
  await page.bringToFront();
  expect(await frameState()).toEqual({ overflow: 'hidden', rafRan: false });

  // Escape in the top frame releases the embedded frame as well.
  await page.keyboard.press('Escape');
  await expect.poll(() => page.locator('sukoon-ui').count()).toBe(0);
  await expect.poll(async () => (await frameState()).overflow).toBe('');
  expect((await frameState()).rafRan).toBe(true);
  await expect.poll(() => sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId)).toBe('');

  // The next shortcut freezes everything again, in phase.
  expect(await ext.evaluate((id) => chrome.runtime.sendMessage({ type: 'panic', tabId: id }), tabId)).toBe(true);
  await page.bringToFront();
  expect(await page.locator('sukoon-ui').count()).toBe(1);
  expect((await frameState()).overflow).toBe('hidden');
  expect(await ext.evaluate((id) => chrome.runtime.sendMessage({ type: 'panic', tabId: id }), tabId)).toBe(false);
  await expect.poll(async () => (await frameState()).overflow).toBe('');
});

test('M8: sensory load drops with Sukoon', async ({ context, page, sw, extensionId }) => {
  await openTestPage(page, '');
  await page.mouse.move(640, 400);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const tabId = await tabIdOf(sw, TEST_PAGE);
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/popup.html`);
  const report = (await ext.evaluate(
    (id) => chrome.tabs.sendMessage(id, { type: 'get-sli' }, { frameId: 0 }),
    tabId,
  )) as SliReport;
  expect(report.before.score).toBeGreaterThan(40);
  expect(report.after.score).toBeLessThan(report.before.score / 3);
});

test('M9: a Flash Guard hit dims moving content until restored, in every frame', async ({ page, sw }) => {
  await openTestPage(page, '?nohijack');
  const tabId = await tabIdOf(sw, TEST_PAGE);
  const frame = page.frameLocator('#frame');
  const dimmed = () => ({
    top: page.evaluate(() => document.documentElement.hasAttribute('data-sukoon-flash-dim')),
    frame: frame.locator('body').evaluate((body) => body.ownerDocument.documentElement.hasAttribute('data-sukoon-flash-dim')),
  });
  await sw.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'flash-detected' }), tabId);
  expect(await dimmed().top).toBe(true);
  expect(await dimmed().frame).toBe(true);
  await page.waitForTimeout(100); // the calm layer turns the filter change into a 0.01 ms transition
  expect(await page.$eval('#flash-canvas', (el) => getComputedStyle(el).filter)).toContain('brightness(0.35)');
  // Restore is broadcast by the background to every frame of the tab.
  await sw.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'flash-restore' }), tabId);
  await expect.poll(() => dimmed().top).toBe(false);
  await expect.poll(() => dimmed().frame).toBe(false);
  expect(await page.locator('sukoon-ui').count()).toBe(0);
});

test('UI: toolbar badge reads "off" while paused, and the context menu is present', async ({ sw }) => {
  // Chrome has no API to list menu items; `update` rejects ("Cannot find menu item") for an unknown id.
  const presentMenuIds = () =>
    sw.evaluate(async () => {
      const ids = ['sukoon-panic', 'sukoon-toggle-site', 'sukoon-options', 'sukoon-does-not-exist'];
      const present: string[] = [];
      for (const id of ids) {
        try {
          await chrome.contextMenus.update(id, {});
          present.push(id);
        } catch {
          /* not present */
        }
      }
      return present;
    });
  await expect.poll(presentMenuIds).toEqual(['sukoon-panic', 'sukoon-toggle-site', 'sukoon-options']);

  await setSettings(sw, { enabled: false });
  await expect.poll(() => sw.evaluate(async () => chrome.action.getBadgeText({}))).toBe('off');
  await setSettings(sw, { enabled: true });
  await expect.poll(() => sw.evaluate(async () => chrome.action.getBadgeText({}))).toBe('');
});

test('UI: popup and settings have no serious accessibility violations', async ({ context, extensionId }) => {
  for (const path of ['popup.html', 'options.html']) {
    const ui = await context.newPage();
    await ui.goto(`chrome-extension://${extensionId}/${path}`);
    await ui.waitForSelector('main h1');
    await ui.evaluate(AXE_SOURCE); // CDP evaluation is not subject to the extension page's CSP
    const violations = await ui.evaluate(async () => {
      const result = await (window as unknown as { axe: { run: () => Promise<{ violations: { id: string; impact: string }[] }> } }).axe.run();
      return result.violations.map((v) => ({ id: v.id, impact: v.impact }));
    });
    expect(violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  }
});
