/**
 * Live-site smoke: the built extension against public pages famous for motion.
 *
 * Not part of CI — those pages change, and a flaky marketing site must not
 * block a release. Run locally (or on a scheduled job) with:
 *
 *   LIVE=1 npx playwright test e2e/live-sites.spec.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import type { SliReport } from '../src/shared/sli';
import { expect, test } from './fixtures';

const LIVE = Boolean(process.env.LIVE);
const SHOTS_DIR = fileURLToPath(new URL('../bench/results/live/', import.meta.url));
mkdirSync(SHOTS_DIR, { recursive: true });

interface LiveSite {
  name: string;
  url: string;
  /** Why this page is here. */
  why: string;
}

const LENIS = 'https://lenis.dev/';

const SITES: LiveSite[] = [
  {
    name: 'lenis',
    url: LENIS,
    why: 'the canonical smooth-scroll hijacker demo',
  },
  {
    name: 'locomotive',
    url: 'https://locomotive.ca/en',
    why: 'Locomotive Scroll + decorative canvas (the inertia leak regression)',
  },
  {
    name: 'apple-iphone',
    url: 'https://www.apple.com/iphone/',
    why: 'scroll-driven cinematic product page',
  },
  {
    name: 'gsap',
    url: 'https://gsap.com/',
    why: 'GSAP homepage — scripted loops and ScrollTrigger',
  },
  {
    name: 'stripe',
    url: 'https://stripe.com/',
    why: 'WebGL hero that honours prefers-reduced-motion',
  },
  {
    name: 'swiper',
    url: 'https://swiperjs.com/',
    why: 'autoplaying slider library homepage',
  },
];

interface PageProbe {
  href: string;
  title: string;
  injected: boolean;
  paused: boolean;
  soften: boolean;
  prmReduce: boolean;
  prmNoPreference: boolean;
  htmlClass: string;
  visibleText: number;
  visibleImages: number;
  animationCount: number;
  infiniteCssRunning: number;
  playingVideos: number;
  videoCount: number;
  nativelyScrollable: boolean;
  scrollHeight: number;
  hijackHint: string | null;
}

async function gotoLive(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  } catch (first) {
    try {
      await page.goto(url, { waitUntil: 'commit', timeout: 45_000 });
    } catch {
      throw first;
    }
  }
  await page.waitForLoadState('load', { timeout: 20_000 }).catch(() => {});
  // Settings round-trip + the 1.5 s adapter sweep after load.
  await page.waitForTimeout(2200);
}

function collectProbe(): PageProbe {
  const root = document.documentElement;
  const scroller = document.scrollingElement ?? root;
  const overflow = getComputedStyle(root).overflowY;
  const bodyOverflow = document.body ? getComputedStyle(document.body).overflowY : overflow;
  const locked = [overflow, bodyOverflow].some((v) => v === 'hidden' || v === 'clip');
  const text = [...document.querySelectorAll('h1, h2, p, a, li, button')]
    .filter((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05 && r.width > 0 && r.height > 0;
    })
    .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
  const visibleImages = [...document.images].filter((img) => {
    const r = img.getBoundingClientRect();
    const s = getComputedStyle(img);
    return r.width > 8 && r.height > 8 && s.visibility !== 'hidden' && Number(s.opacity) > 0.05;
  }).length;
  const anims = document.getAnimations();
  const infiniteCssRunning = anims.filter((a) => {
    const t = a.effect?.getComputedTiming();
    return t?.iterations === Infinity && a.playState === 'running';
  }).length;
  const videos = [...document.querySelectorAll('video')];
  const hijackEl =
    document.querySelector('html.lenis, .lenis, [data-scroll-container], .c-scrollbar, [data-locomotive-scroll]') ??
    (document.documentElement.className.match(/lenis|locomotive|smooth-scroll/) ? document.documentElement : null);
  return {
    href: location.href,
    title: document.title,
    injected: (window as unknown as { __sukoonMain?: true }).__sukoonMain === true,
    paused: root.hasAttribute('data-sukoon-paused'),
    soften: root.hasAttribute('data-sukoon-soften'),
    prmReduce: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    prmNoPreference: window.matchMedia('(prefers-reduced-motion: no-preference)').matches,
    htmlClass: root.className.slice(0, 200),
    visibleText: text.length,
    visibleImages,
    animationCount: anims.length,
    infiniteCssRunning,
    playingVideos: videos.filter((v) => !v.paused && !v.ended).length,
    videoCount: videos.length,
    nativelyScrollable: !locked && scroller.scrollHeight > scroller.clientHeight + 80,
    scrollHeight: scroller.scrollHeight,
    hijackHint: hijackEl ? hijackEl.tagName.toLowerCase() + '.' + [...hijackEl.classList].slice(0, 6).join('.') : null,
  };
}

async function readSli(context: BrowserContext, sw: Worker, page: Page): Promise<SliReport | null> {
  const extensionId = new URL(sw.url()).host;
  const url = page.url();
  const ext = await context.newPage();
  try {
    await ext.goto(`chrome-extension://${extensionId}/popup.html`);
    return (await ext.evaluate(async (u) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((t) => t.url === u);
      if (tab?.id === undefined) return null;
      return chrome.tabs.sendMessage(tab.id, { type: 'get-sli' }, { frameId: 0 });
    }, url)) as SliReport | null;
  } catch {
    return null;
  } finally {
    await ext.close();
  }
}

async function wheelBurst(page: Page, steps = 10, delta = 240): Promise<void> {
  const box = page.viewportSize() ?? { width: 1280, height: 720 };
  await page.mouse.move(box.width / 2, box.height / 2);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(400);
}

test.describe('live sites (public web)', () => {
  test.skip(!LIVE, 'set LIVE=1 to run against the public web');

  for (const site of SITES) {
    test(`${site.name}: Sukoon is active and the page stays usable (${site.why})`, async ({ page, sw, context }) => {
      test.setTimeout(90_000);
      await gotoLive(page, site.url);

      const probe = await page.evaluate(collectProbe);
      await page.screenshot({ path: join(SHOTS_DIR, `${site.name}-before.png`), fullPage: false });
      expect(probe.injected, `${site.name} did not get the MAIN-world script`).toBe(true);
      expect(probe.paused, `${site.name} had the calm layer paused`).toBe(false);
      expect(probe.prmReduce, `${site.name} did not see prefers-reduced-motion: reduce`).toBe(true);
      expect(probe.prmNoPreference, `${site.name} still reported no-preference`).toBe(false);
      expect(probe.visibleText, `${site.name} rendered almost no text`).toBeGreaterThan(80);
      expect(probe.infiniteCssRunning, `${site.name} still has ${probe.infiniteCssRunning} infinite CSS/WAAPI loops`).toBe(0);
      expect(probe.playingVideos, `${site.name} is autoplaying ${probe.playingVideos} video(s)`).toBe(0);

      if (site.name === 'apple-iphone') {
        expect(probe.htmlClass, 'Apple should switch to its own reduced-motion class').toMatch(/(^|\s)reduced-motion(\s|$)/);
        expect(probe.htmlClass, 'Apple still has no-reduced-motion').not.toMatch(/no-reduced-motion/);
      }

      const y0 = await page.evaluate(() => window.scrollY);
      await wheelBurst(page);
      const y1 = await page.evaluate(() => window.scrollY);
      const afterScroll = await page.evaluate(collectProbe);
      if (afterScroll.nativelyScrollable) {
        expect(y1, `${site.name} is natively scrollable but the wheel did not move the page`).toBeGreaterThan(y0);
      }

      const sli = await readSli(context, sw, page);
      expect(sli, `${site.name}: get-sli returned nothing`).not.toBeNull();
      if (sli) {
        expect(sli.after.score, `${site.name} SLI rose under Sukoon (${sli.before.score} → ${sli.after.score})`).toBeLessThanOrEqual(
          sli.before.score,
        );
      }

      await page.screenshot({ path: join(SHOTS_DIR, `${site.name}.png`), fullPage: false });
      writeFileSync(
        join(SHOTS_DIR, `${site.name}.json`),
        JSON.stringify({ site, probe, afterScroll, scroll: { y0, y1 }, sli }, null, 2),
      );
    });
  }

  test('lenis: without Sukoon it hijacks and autoplays; with Sukoon those stop', async ({ page }) => {
    test.setTimeout(90_000);
    await gotoLive(page, LENIS);
    const withSukoon = await page.evaluate(collectProbe);
    await page.screenshot({ path: join(SHOTS_DIR, 'lenis-with.png'), fullPage: false });

    const bare = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      viewport: { width: 1280, height: 720 },
      args: ['--disable-extensions'],
    });
    try {
      const barePage = await bare.newPage();
      await gotoLive(barePage, LENIS);
      const without = await barePage.evaluate(collectProbe);
      await barePage.screenshot({ path: join(SHOTS_DIR, 'lenis-without.png'), fullPage: false });
      writeFileSync(join(SHOTS_DIR, 'lenis-compare.json'), JSON.stringify({ withSukoon, without }, null, 2));

      expect(without.injected).toBe(false);
      expect(without.prmReduce).toBe(false);
      expect(without.prmNoPreference).toBe(true);
      expect(withSukoon.injected).toBe(true);
      expect(withSukoon.prmReduce).toBe(true);
      expect(withSukoon.playingVideos).toBe(0);
      // Muted showcase videos autoplay without Sukoon; if the browser blocks them too, skip the contrast.
      if (without.playingVideos > 0) {
        expect(withSukoon.playingVideos).toBeLessThan(without.playingVideos);
      }
      expect(withSukoon.visibleText).toBeGreaterThan(80);
      expect(without.visibleText).toBeGreaterThan(80);
    } finally {
      await bare.close();
    }
  });
});
