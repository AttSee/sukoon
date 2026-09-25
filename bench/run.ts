/**
 * M10 — Evidence bench, step 1: record every site twice (without / with Sukoon)
 * under an identical script, and collect timing and SLI numbers.
 *
 *   node bench/run.ts [--only name,name] [--seconds 15] [--fresh]
 *
 * By default the new records are merged into an existing runs.json (same site
 * and condition are replaced), so `--only` can retry failures without losing
 * the rest of the evidence. `--fresh` discards the previous file.
 *
 * Output: bench/results/videos/<site>-<off|on>.webm and bench/results/runs.json
 */
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SliReport } from '../src/shared/sli';
import { serveTestPage } from './serve.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXTENSION = `${ROOT}.output/chrome-mv3`;
const RESULTS = `${ROOT}bench/results`;
const VIDEOS = `${RESULTS}/videos`;
const VIEWPORT = { width: 1280, height: 720 };

interface Site {
  name: string;
  url: string;
}

type Condition = 'off' | 'on';

export interface RunRecord {
  site: string;
  url: string;
  condition: Condition;
  ok: boolean;
  error?: string;
  video?: string;
  domContentLoadedMs?: number;
  lcpMs?: number;
  sli?: SliReport;
  /** SLI of the page exactly as built: extension loaded with every protection off (measure-only). */
  sliProbe?: number;
  /** Phase windows in seconds from the start of the recording. */
  phases?: { idle: [number, number][]; scroll: [number, number] };
}

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1]!.split(',') : null;
const seconds = args.includes('--seconds') ? Number(args[args.indexOf('--seconds') + 1]) : 15;
const fresh = args.includes('--fresh');

const { sites } = JSON.parse(readFileSync(`${ROOT}bench/sites.json`, 'utf8')) as { sites: Site[] };
const selected = sites.filter((s) => !only || only.includes(s.name));

/** Collects LCP from the first paint on; installed before any page script. */
const PERF_PROBE = `
  window.__sukoonBench = { lcp: 0 };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__sukoonBench.lcp = e.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
`;

async function launch(condition: Condition, videoDir: string): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    viewport: VIEWPORT,
    recordVideo: { dir: videoDir, size: VIEWPORT },
    // Same flags for both conditions; only the extension differs.
    args:
      condition === 'on'
        ? [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`]
        : ['--disable-extensions'],
  });
  if (condition === 'on') {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    for (let i = 0; i < 100; i++) {
      const n = await sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length);
      if (n === 2) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    // Mark onboarding done; Vestibular mode (the default) is the most complete.
    await sw.evaluate(async () => {
      const key = 'sukoon:settings';
      const current = (await chrome.storage.local.get(key))[key] ?? {};
      await chrome.storage.local.set({ [key]: { ...current, onboarded: true, mode: 'vestibular' } });
    });
    for (const p of context.pages()) if (p.url().includes('options.html')) await p.close();
  }
  await context.addInitScript(PERF_PROBE);
  return context;
}

const IDLE_BEFORE_MS = 4000;
const IDLE_AFTER_MS = 3000;

/**
 * The fixed scenario: still, then wheel scrolling, then still again.
 * Motion during the still phases is motion the user did not ask for; the
 * trailing phase also catches smooth-scroll inertia after the wheel stops.
 */
async function scenario(page: Page, since: () => number): Promise<NonNullable<RunRecord['phases']>> {
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
  const a0 = since();
  await page.waitForTimeout(IDLE_BEFORE_MS);
  const s0 = since();
  const steps = Math.round(Math.max(0, seconds * 1000 - IDLE_BEFORE_MS - IDLE_AFTER_MS) / 100);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(100);
  }
  const b0 = since();
  await page.waitForTimeout(IDLE_AFTER_MS);
  const b1 = since();
  return { idle: [[a0, s0], [b0, b1]], scroll: [s0, b0] };
}

async function readSli(context: BrowserContext, page: Page): Promise<SliReport | undefined> {
  const sw = context.serviceWorkers()[0];
  if (!sw) return undefined;
  const extensionId = new URL(sw.url()).host;
  const url = page.url();
  const ext = await context.newPage();
  try {
    await ext.goto(`chrome-extension://${extensionId}/popup.html`);
    return (await ext.evaluate(async (u) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((t) => t.url === u);
      return tab?.id === undefined ? undefined : chrome.tabs.sendMessage(tab.id, { type: 'get-sli' }, { frameId: 0 });
    }, url)) as SliReport | undefined;
  } catch {
    return undefined;
  } finally {
    await ext.close();
  }
}

const ALL_OFF = {
  calmCss: false,
  reducedMotionSwitch: false,
  deepCoverage: false,
  adapters: false,
  scrollGuard: false,
  parallaxFreeze: false,
  mediaGuard: false,
  softenVideo: false,
};

/**
 * Measure-only pass for the SLI validity check: nothing is calmed, so the
 * index sees the page as built, including JS that honours matchMedia.
 */
async function probeSli(site: Site): Promise<number | undefined> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    viewport: VIEWPORT,
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  try {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await sw.evaluate(async (overrides) => {
      const key = 'sukoon:settings';
      const current = (await chrome.storage.local.get(key))[key] ?? {};
      await chrome.storage.local.set({ [key]: { ...current, onboarded: true, overrides, imageAnimation: 'allowed' } });
    }, ALL_OFF);
    for (let i = 0; i < 100; i++) {
      if ((await sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length)) === 2) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const page = await context.newPage();
    await gotoWithRetry(page, site.url);
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
    await page.waitForTimeout(2000);
    for (let i = 0; i < 15; i++) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    return (await readSli(context, page))?.after.score;
  } catch {
    return undefined;
  } finally {
    await context.close();
  }
}

async function runOne(site: Site, condition: Condition): Promise<RunRecord> {
  const tmp = `${RESULTS}/tmp-${site.name}-${condition}`;
  rmSync(tmp, { recursive: true, force: true });
  const context = await launch(condition, tmp);
  const record: RunRecord = { site: site.name, url: site.url, condition, ok: false };
  const page = await context.newPage();
  const videoStart = Date.now(); // recording starts with the page
  const since = () => Math.round((Date.now() - videoStart) / 100) / 10;
  try {
    await gotoWithRetry(page, site.url);
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      return { dcl: nav?.domContentLoadedEventEnd ?? 0 };
    });
    record.domContentLoadedMs = Math.round(timing.dcl);
    // SLI of the page as built is measured before scrolling; parallax needs a scroll to be seen,
    // so it is read again at the end and the larger "before" is kept.
    const early = condition === 'on' ? await readSli(context, page) : undefined;
    record.phases = await scenario(page, since);
    record.lcpMs = Math.round(await page.evaluate(() => (window as unknown as { __sukoonBench: { lcp: number } }).__sukoonBench.lcp));
    // Scrollback after the phases close, in both conditions: without it the
    // scroll-down position (and any lazy content it revealed) differs between
    // the two recordings and leaks into the trailing idle window.
    await page.evaluate(() => window.scrollTo(0, 0));
    if (condition === 'on') {
      const late = await readSli(context, page);
      record.sli = early && late ? (early.before.score >= late.before.score ? early : late) : (late ?? early);
    }
    record.ok = true;
  } catch (e) {
    record.error = String(e).split('\n')[0];
  }
  const video = page.video();
  await context.close();
  if (video) {
    const target = `${VIDEOS}/${site.name}-${condition}.webm`;
    renameSync(await video.path(), target);
    record.video = target.slice(ROOT.length);
  }
  rmSync(tmp, { recursive: true, force: true });
  return record;
}

/**
 * Heavy marketing pages can keep requesting assets long past the point where
 * the content is usable; `load` then times out even though the page works.
 * Fall back to `domcontentloaded` plus a settle wait so the scenario still
 * records the same kind of page in both conditions.
 */
async function gotoWithRetry(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
  } catch (first) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(3000);
    } catch {
      throw first; // report the original, more precise error
    }
  }
}

mkdirSync(VIDEOS, { recursive: true });
// Reuse a test-page server that is already running (npm run test-page), otherwise start one.
const server = await serveTestPage(4173).catch(() => null);
const records: RunRecord[] = [];
try {
  for (const site of selected) {
    for (const condition of ['off', 'on'] as const) {
      process.stdout.write(`${site.name} [${condition}] … `);
      const r = await runOne(site, condition);
      if (condition === 'off' && r.ok) r.sliProbe = await probeSli(site);
      records.push(r);
      const sli = r.sli ? `SLI ${r.sli.before.score}→${r.sli.after.score}` : r.sliProbe !== undefined ? `SLI as built ${r.sliProbe}` : 'SLI —';
      console.log(r.ok ? `ok (${sli})` : `FAILED: ${r.error}`);
    }
  }
} finally {
  server?.close();
}

// Merge into the previous file unless --fresh: a --only retry must not drop
// the evidence for every other site. Order follows bench/sites.json.
const runsPath = `${RESULTS}/runs.json`;
let merged = records;
if (!fresh && existsSync(runsPath)) {
  const previous = JSON.parse(readFileSync(runsPath, 'utf8')) as { records: RunRecord[] };
  const key = (r: RunRecord) => `${r.site}\u0000${r.condition}`;
  const replaced = new Set(records.map(key));
  merged = [...previous.records.filter((r) => !replaced.has(key(r))), ...records];
}
const siteOrder = new Map(sites.map((s, i) => [s.name, i]));
merged.sort((a, b) => (siteOrder.get(a.site) ?? 1e9) - (siteOrder.get(b.site) ?? 1e9));

writeFileSync(runsPath, JSON.stringify({ seconds, viewport: VIEWPORT, createdAt: new Date().toISOString(), records: merged }, null, 2));
console.log(
  `\n${records.filter((r) => r.ok).length}/${records.length} new runs ok, ${merged.filter((r) => r.ok).length}/${merged.length} total → bench/results/runs.json`,
);
