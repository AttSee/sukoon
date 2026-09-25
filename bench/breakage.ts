/**
 * M10 — Evidence bench, step 3a: automated first pass for the breakage rate.
 *
 *   node bench/breakage.ts [--only name,name]
 *
 * Loads every site twice (without / with Sukoon, Vestibular mode) under the
 * same script and compares objective signals:
 *
 *   content_missing      visible text or images lost with Sukoon (ratios below)
 *   interaction_broken   scroll-to-bottom, form-field focus or main navigation
 *                        works without Sukoon but fails with it
 *
 * Verdict rules (deliberately conservative, with noise floors because live
 * sites differ slightly between any two loads):
 *   text  : missing when on < 90% of off and the loss exceeds 200 characters
 *   images: missing when off has ≥ 5 and on < 80% of off
 *
 * Rows are merged into bench/breakage.csv after every site (manual rows for
 * other sites are kept, and an interrupted run keeps what it finished);
 * automated notes start with "auto:". A page that never answers is abandoned
 * after a watchdog timeout and reported as a failed load. A human review on
 * top remains welcome — see bench/breakage-checklist.md. Sites whose content
 * differs between loads by design (random article) are skipped, not guessed.
 */
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serveTestPage } from './serve.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXTENSION = `${ROOT}.output/chrome-mv3`;
const CSV = `${ROOT}bench/breakage.csv`;
const HEADER = 'site,content_missing,interaction_broken,notes';
const VIEWPORT = { width: 1280, height: 720 };

interface Site {
  name: string;
  url: string;
  /** Content differs between any two loads (e.g. a random article): no honest automatic verdict. */
  randomContent?: boolean;
}

interface Probe {
  ok: boolean;
  error?: string;
  /** Length of the visible body text, whitespace collapsed. */
  text: number;
  /** Images with a rendered box. */
  images: number;
  /** Visible h1–h3 headings. */
  headings: number;
  /** A header/nav with at least one link or button exists. */
  nav: boolean;
  /** First visible field kept focus; null when the page has none. */
  form: boolean | null;
  /** The page can be scrolled to (near) its bottom. */
  scrolled: boolean;
}

const FAILED: Omit<Probe, 'ok' | 'error'> = { text: 0, images: 0, headings: 0, nav: false, form: null, scrolled: false };

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1]!.split(',') : null;

const { sites } = JSON.parse(readFileSync(`${ROOT}bench/sites.json`, 'utf8')) as { sites: Site[] };
const selected = sites.filter((s) => !only || only.includes(s.name));

async function launch(withExtension: boolean): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    viewport: VIEWPORT,
    args: withExtension
      ? [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`]
      : ['--disable-extensions'],
  });
  if (withExtension) {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    for (let i = 0; i < 100; i++) {
      const n = await sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length);
      if (n === 2) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await sw.evaluate(async () => {
      const key = 'sukoon:settings';
      const current = (await chrome.storage.local.get(key))[key] ?? {};
      await chrome.storage.local.set({ [key]: { ...current, onboarded: true, mode: 'vestibular' } });
    });
    for (const p of context.pages()) if (p.url().includes('options.html')) await p.close();
  }
  return context;
}

/** Heavy pages can outlast `load`; the content being usable is what matters. */
async function gotoWithRetry(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
  } catch (first) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(3000);
    } catch {
      throw first;
    }
  }
}

/** A page that never answers (busy loop, hung renderer) must not stall the whole run. */
const SITE_WATCHDOG_MS = 150_000;

async function probeSite(context: BrowserContext, site: Site): Promise<Probe> {
  const page = await context.newPage();
  let watchdog: NodeJS.Timeout | undefined;
  const timedOut = new Promise<Probe>((resolve) => {
    watchdog = setTimeout(
      () => resolve({ ok: false, error: `watchdog: no result within ${SITE_WATCHDOG_MS / 1000} s`, ...FAILED }),
      SITE_WATCHDOG_MS,
    );
  });
  try {
    return await Promise.race([visit(page, site), timedOut]);
  } finally {
    clearTimeout(watchdog);
    void page.close().catch(() => {}); // not awaited: closing a hung page can hang too
  }
}

/** The same scripted visit in both conditions: settle, walk the page, probe. */
async function visit(page: Page, site: Site): Promise<Probe> {
  try {
    await gotoWithRetry(page, site.url);
    await page.waitForTimeout(2500);
    for (let i = 1; i <= 4; i++) {
      // Lazy content must load identically in both conditions.
      await page.evaluate((f) => window.scrollTo(0, document.documentElement.scrollHeight * f), i / 4);
      await page.waitForTimeout(600);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    const stats = await page.evaluate(() => {
      // Visible means visible to a person: a rendered box, and neither the element nor any ancestor faded out.
      // (An inactive slide of a cross-fading carousel keeps its own opacity at 1 under an opacity-0 parent; counting it
      // as visible would inflate one condition and not the other.)
      const visible = (el: Element): boolean => {
        const r = el.getBoundingClientRect();
        if (!(r.width > 1 && r.height > 1)) return false;
        for (let node: Element | null = el; node; node = node.parentElement) {
          const s = getComputedStyle(node);
          if (s.visibility === 'hidden' || Number(s.opacity) <= 0.05) return false;
        }
        return true;
      };
      const text = document.body ? document.body.innerText.replace(/\s+/g, ' ').trim().length : 0;
      const images = [...document.images].filter(visible).length;
      const headings = [...document.querySelectorAll('h1, h2, h3')].filter(visible).length;
      const navEl = document.querySelector('nav, header');
      const nav = navEl !== null && navEl.querySelectorAll('a[href], button').length > 0;
      let form: boolean | null = null;
      const field = [...document.querySelectorAll<HTMLInputElement>('input, textarea, select')].find(
        (el) => !el.disabled && el.type !== 'hidden' && visible(el),
      );
      if (field) {
        field.focus();
        form = document.activeElement === field;
      }
      return { text, images, headings, nav, form };
    });

    const scrolled = await page.evaluate(async () => {
      const root = document.scrollingElement ?? document.documentElement;
      window.scrollTo(0, root.scrollHeight);
      await new Promise((r) => setTimeout(r, 600));
      const max = root.scrollHeight - window.innerHeight;
      return max < 100 ? true : window.scrollY > max * 0.7;
    });

    return { ok: true, ...stats, scrolled };
  } catch (e) {
    return { ok: false, error: String(e).split('\n')[0], ...FAILED };
  }
}

interface Row {
  site: string;
  content: boolean;
  interaction: boolean;
  notes: string;
}

function verdict(site: Site, off: Probe, on: Probe): Row {
  if (!off.ok || !on.ok) {
    return { site: site.name, content: false, interaction: false, notes: `auto: load failed (${off.error ?? on.error})` };
  }
  const textMissing = on.text < off.text * 0.9 && off.text - on.text > 200;
  const imagesMissing = off.images >= 5 && on.images < off.images * 0.8;
  const scrollBroken = off.scrolled && !on.scrolled;
  const formBroken = off.form === true && on.form === false;
  const navBroken = off.nav && !on.nav;
  const notes = [
    `auto: text ${on.text}/${off.text}`,
    `images ${on.images}/${off.images}`,
    `headings ${on.headings}/${off.headings}`,
    `scroll ${on.scrolled ? 'ok' : 'FAIL'}`,
    `form ${on.form === null ? 'n/a' : on.form ? 'ok' : 'FAIL'}`,
    `nav ${on.nav ? 'ok' : 'FAIL'}`,
  ].join('; ');
  return { site: site.name, content: textMissing || imagesMissing, interaction: scrollBroken || formBroken || navBroken, notes };
}

/** Merge into the CSV: replace rows for the sites checked now, keep manual/previous rows for the rest. */
function writeCsv(rows: Row[]): void {
  const bySite = new Map<string, string>();
  if (existsSync(CSV)) {
    for (const line of readFileSync(CSV, 'utf8').trim().split('\n').slice(1)) {
      const site = line.split(',')[0];
      if (site) bySite.set(site, line);
    }
  }
  const yesNo = (b: boolean) => (b ? 'yes' : 'no');
  for (const r of rows) bySite.set(r.site, `${r.site},${yesNo(r.content)},${yesNo(r.interaction)},${r.notes}`);
  const order = new Map(sites.map((s, i) => [s.name, i]));
  const lines = [...bySite.entries()].sort((a, b) => (order.get(a[0]) ?? 1e9) - (order.get(b[0]) ?? 1e9));
  writeFileSync(CSV, [HEADER, ...lines.map(([, line]) => line)].join('\n') + '\n');
}

// ── run ─────────────────────────────────────────────────────────────────────
const server = await serveTestPage(4173).catch(() => null);
const rows: Row[] = [];
const offContext = await launch(false);
const onContext = await launch(true);
try {
  for (const site of selected) {
    if (site.randomContent) {
      console.log(`${site.name}: skipped — content differs between loads by design`);
      continue;
    }
    process.stdout.write(`${site.name} … `);
    const off = await probeSite(offContext, site);
    const on = await probeSite(onContext, site);
    const row = verdict(site, off, on);
    rows.push(row);
    writeCsv(rows); // after every site: an interrupted run keeps what it finished
    console.log(
      row.content || row.interaction
        ? `BROKEN (${row.notes})`
        : `ok${row.notes.startsWith('auto: load failed') ? ` — ${row.notes}` : ''}`,
    );
  }
} finally {
  await Promise.race([Promise.all([offContext.close(), onContext.close()]), new Promise((r) => setTimeout(r, 15_000))]);
  server?.close();
}

const broken = rows.filter((r) => r.content || r.interaction).length;
console.log(`\n${rows.length - broken}/${rows.length} checked sites clean → bench/breakage.csv`);
process.exit(0); // a hung page must not keep the process alive after the report is written
