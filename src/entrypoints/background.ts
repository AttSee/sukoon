/**
 * Background service worker: settings, dynamic content-script registration,
 * native animated-image policy, the panic shortcut, and Flash Guard plumbing.
 */
import { browser, type Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import type {
  CssFetchResult,
  FlashGuardStatus,
  FlashSample,
  ToBackground,
  ToContent,
  ToOffscreen,
} from '../shared/messages';
import {
  DEFAULT_SETTINGS,
  excludeMatchesFor,
  normalizeSettings,
  SETTINGS_KEY,
  type ImageAnimation,
  type Settings,
} from '../shared/settings';

const IS_CHROME = import.meta.env.BROWSER !== 'firefox';
const SCRIPT_IDS = { main: 'sukoon-main', calm: 'sukoon-calm' } as const;
const MENU = { panic: 'sukoon-panic', toggleSite: 'sukoon-toggle-site', options: 'sukoon-options' } as const;
/** Toolbar badge colours follow the UI theme (src/ui/styles.css). */
const BADGE = {
  off: { text: 'off', color: '#5b6169' },
  frozen: { text: '❚❚', color: '#101316' },
  guard: { text: '●', color: '#8a3b00' },
} as const;

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async ({ reason }) => {
    const stored = await browser.storage.local.get(SETTINGS_KEY);
    if (!stored[SETTINGS_KEY]) await browser.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
    await syncAll();
    await createMenus();
    if (reason === 'install') await browser.tabs.create({ url: browser.runtime.getURL('/options.html#welcome') });
  });
  browser.runtime.onStartup.addListener(() => {
    void syncAll();
    void createMenus();
  });
  // Firefox grants host access on request (see the settings page); registered scripts need a fresh sync then.
  browser.permissions.onAdded.addListener(() => void syncAll());

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SETTINGS_KEY]) void syncAll();
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command === 'panic' && tab?.id !== undefined) void panic(tab.id, tab.windowId).catch(logPanicFailure);
    if (command === 'toggle') void toggleEnabled();
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    switch (info.menuItemId) {
      case MENU.panic:
        if (tab?.id !== undefined) void panic(tab.id, tab.windowId).catch(logPanicFailure);
        break;
      case MENU.toggleSite:
        if (info.pageUrl) void toggleHost(new URL(info.pageUrl).hostname);
        break;
      case MENU.options:
        void browser.runtime.openOptionsPage();
        break;
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    frozenTabs.delete(tabId);
    if (flash.tabId === tabId) void stopFlashGuard();
  });
  // A navigation loads a page that is not frozen, whatever the previous one was.
  browser.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === 'loading') frozenTabs.delete(tabId);
  });

  browser.runtime.onMessage.addListener((raw: unknown, sender, sendResponse: (r: unknown) => void) => {
    const msg = raw as ToBackground;
    const reply = (p: Promise<unknown>) => {
      p.then(sendResponse, (err: unknown) => sendResponse({ ok: false, error: String(err) }));
      return true;
    };
    switch (msg.type) {
      case 'fetch-css':
        return reply(fetchCss(msg.url));
      case 'panic': {
        const tabId = msg.tabId ?? sender.tab?.id;
        if (tabId === undefined) return false;
        return reply(browser.tabs.get(tabId).then((tab) => panic(tabId, tab.windowId)));
      }
      case 'panic-state': {
        // Only the top frame owns the tab's state; sub-frames follow it.
        const tabId = sender.tab?.id;
        if (tabId === undefined || sender.frameId !== 0) return false;
        markFrozen(tabId, msg.frozen);
        // Escape or the Release button in the top frame must release the embedded frames too.
        if (!msg.frozen) void broadcast(tabId, { type: 'panic', frozen: false, screenshot: null });
        return false;
      }
      case 'flash-restore': {
        const tabId = sender.tab?.id;
        if (tabId !== undefined) void broadcast(tabId, { type: 'flash-restore' });
        return false;
      }
      case 'flash-guard:start':
        return reply(startFlashGuard(msg.tabId));
      case 'flash-guard:stop':
        return reply(stopFlashGuard());
      case 'flash-guard:status':
        sendResponse(flash);
        return false;
      case 'flash-guard:sample':
        if (touchFlash(msg.tabId, msg.sample.t)) onFlashSample(msg.sample);
        return false;
      case 'flash-guard:heartbeat':
        touchFlash(msg.tabId, msg.t);
        return false;
      case 'flash-guard:ended':
        // The capture ended outside Sukoon (Chrome's "Stop sharing"): release the badge and the analyser.
        void stopFlashGuard();
        return false;
      default:
        return false;
    }
  });

  void syncAll();
});

// ── Settings → registration + image policy ──────────────────────────────────

async function readSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(stored[SETTINGS_KEY]);
}

let syncQueue: Promise<void> = Promise.resolve();
function syncAll(): Promise<void> {
  // Serialise: rapid toggles must not interleave unregister/register calls.
  syncQueue = syncQueue.then(async () => {
    const settings = await readSettings();
    await syncRegistration(settings).catch((e: unknown) => console.error('[sukoon] registration', e));
    await applyImagePolicy(settings.enabled ? settings.imageAnimation : 'allowed').catch((e: unknown) =>
      console.error('[sukoon] image policy', e),
    );
    // Tab-scoped badges (frozen, Flash Guard) are untouched by the global default.
    await setBadge(settings.enabled ? null : BADGE.off).catch(() => {});
  });
  return syncQueue;
}

async function setBadge(badge: { text: string; color: string } | null, tabId?: number): Promise<void> {
  const target = tabId === undefined ? {} : { tabId };
  await browser.action.setBadgeText({ ...target, text: badge ? badge.text : '' });
  if (badge) await browser.action.setBadgeBackgroundColor({ ...target, color: badge.color });
}

async function toggleEnabled(): Promise<void> {
  const settings = await readSettings();
  await browser.storage.local.set({ [SETTINGS_KEY]: { ...settings, enabled: !settings.enabled } });
}

async function toggleHost(host: string): Promise<void> {
  if (!host) return;
  const settings = await readSettings();
  const excludedHosts = settings.excludedHosts.includes(host)
    ? settings.excludedHosts.filter((h) => h !== host)
    : [...settings.excludedHosts, host];
  await browser.storage.local.set({ [SETTINGS_KEY]: { ...settings, excludedHosts } });
}

async function createMenus(): Promise<void> {
  try {
    await browser.contextMenus.removeAll();
    await browser.contextMenus.create({ id: MENU.panic, title: 'Freeze this page', contexts: ['page'] });
    await browser.contextMenus.create({ id: MENU.toggleSite, title: 'Turn Sukoon off / on for this site', contexts: ['page'] });
    await browser.contextMenus.create({ id: MENU.options, title: 'Open Sukoon settings', contexts: ['action'] });
  } catch (e) {
    console.error('[sukoon] menus', e);
  }
}

type RegisteredScript = Browser.scripting.RegisteredContentScript;

/**
 * Scripts are registered at runtime, not in the manifest: excluding a site is
 * just an `excludeMatches` update, and injection still happens before first paint.
 */
async function syncRegistration(settings: Settings): Promise<void> {
  const ids = Object.values(SCRIPT_IDS);
  const existing = await browser.scripting.getRegisteredContentScripts({ ids });
  if (!settings.enabled) {
    if (existing.length > 0) await browser.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
    return;
  }

  const excludeMatches = excludeMatchesFor(settings.excludedHosts);
  const common = {
    matches: ['<all_urls>'],
    ...(excludeMatches.length > 0 ? { excludeMatches } : {}),
    runAt: 'document_start' as const,
    allFrames: true,
    persistAcrossSessions: true,
    // Chrome: also cover about:blank, srcdoc, blob: and data: frames.
    ...(IS_CHROME ? { matchOriginAsFallback: true } : {}),
  };
  const wanted: RegisteredScript[] = [
    { id: SCRIPT_IDS.main, js: ['main-world.js'], world: 'MAIN', ...common },
    { id: SCRIPT_IDS.calm, js: ['calm.js'], css: ['calm.css'], ...common },
  ];
  // Re-registering leaves a gap in which a navigation loads without the calm layer; the service worker
  // starts often (every wake-up runs this), so leave a registration that already matches alone.
  if (wanted.every((w) => sameScript(w, existing.find((e) => e.id === w.id)))) return;
  if (existing.length > 0) await browser.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
  await browser.scripting.registerContentScripts(wanted);
}

function sameScript(want: RegisteredScript, have: RegisteredScript | undefined): boolean {
  if (!have) return false;
  const list = (xs: readonly string[] | undefined) => [...(xs ?? [])].map((x) => x.replace(/^\/+/, '')).sort().join('\n');
  return (
    list(want.js) === list(have.js) &&
    list(want.css) === list(have.css) &&
    list(want.matches) === list(have.matches) &&
    list(want.excludeMatches) === list(have.excludeMatches) &&
    (want.world ?? 'ISOLATED') === (have.world ?? 'ISOLATED') &&
    Boolean(want.allFrames) === Boolean(have.allFrames) &&
    (want.runAt ?? 'document_idle') === (have.runAt ?? 'document_idle')
  );
}

interface BrowserSetting<T> {
  set(details: { value: T }): Promise<unknown>;
  clear(details: object): Promise<unknown>;
}

/** M6 — the browsers' own switch for animated images. Browser-wide, not per site. */
async function applyImagePolicy(policy: ImageAnimation): Promise<void> {
  const api = browser as unknown as {
    accessibilityFeatures?: { animationPolicy?: BrowserSetting<ImageAnimation> };
    browserSettings?: { imageAnimationBehavior?: BrowserSetting<'normal' | 'none' | 'once'> };
  };
  const chromeSetting = api.accessibilityFeatures?.animationPolicy;
  if (chromeSetting) {
    if (policy === 'allowed') await chromeSetting.clear({});
    else await chromeSetting.set({ value: policy });
    return;
  }
  const firefoxSetting = api.browserSettings?.imageAnimationBehavior;
  if (firefoxSetting) {
    if (policy === 'allowed') await firefoxSetting.clear({});
    else await firefoxSetting.set({ value: policy });
  }
}

// ── M2 helper: re-read cross-origin CSS the page already loaded ─────────────

const cssCache = new Map<string, string>();
const MAX_CSS_BYTES = 4_000_000;

async function fetchCss(url: string): Promise<CssFetchResult> {
  if (!/^https?:\/\//i.test(url)) return { ok: false };
  const cached = cssCache.get(url);
  if (cached !== undefined) return { ok: true, text: cached };
  // No cookies, HTTP cache first, and only real stylesheets come back.
  const res = await fetch(url, { credentials: 'omit', cache: 'force-cache' });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !/text\/css/i.test(type)) return { ok: false };
  const text = await res.text();
  if (text.length > MAX_CSS_BYTES) return { ok: false };
  if (cssCache.size > 64) cssCache.delete(cssCache.keys().next().value!);
  cssCache.set(url, text);
  return { ok: true, text };
}

// ── M7: panic ───────────────────────────────────────────────────────────────

const frozenTabs = new Set<number>();

/** Browser UI pages (chrome://, the Web Store) cannot be injected; that is expected, not an error. */
function logPanicFailure(e: unknown): void {
  console.info('[sukoon] panic: this page cannot be frozen', e);
}

/** Every frame of the tab; frames without a content script (an excluded host) simply do not answer. */
async function broadcast(tabId: number, message: ToContent): Promise<void> {
  await browser.tabs.sendMessage(tabId, message).catch(() => {});
}

/**
 * Toggle the freeze for a whole tab. The top frame owns the state: it is asked first, it shows the
 * overlay, and every sub-frame is then told the same decision, so nothing is left out of phase.
 */
async function panic(tabId: number, windowId: number): Promise<boolean> {
  const query: ToContent = { type: 'panic-query' };
  let frozenNow: boolean;
  try {
    frozenNow = (await browser.tabs.sendMessage(tabId, query, { frameId: 0 })) === true;
  } catch {
    // Page loaded before install, or an excluded site: inject on demand, then retry.
    await injectInto(tabId);
    frozenNow = (await browser.tabs.sendMessage(tabId, query, { frameId: 0 })) === true;
  }
  const frozen = !frozenNow;
  let screenshot: string | null = null;
  if (frozen) {
    try {
      // The keyboard shortcut (or the popup) grants activeTab for this capture.
      screenshot = await browser.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 80 });
    } catch {
      screenshot = null; // restricted page: the overlay falls back to a plain dim layer
    }
  }
  // The picture goes to the top frame only (it is the one that draws it); the rest just freeze or thaw.
  await browser.tabs.sendMessage(tabId, { type: 'panic', frozen, screenshot } satisfies ToContent, { frameId: 0 });
  await broadcast(tabId, { type: 'panic', frozen, screenshot: null });
  markFrozen(tabId, frozen);
  return frozen;
}

/** Single source of truth for the frozen-tab set and its badge (panic() and top-frame releases alike). */
function markFrozen(tabId: number, frozen: boolean): void {
  if (frozen) frozenTabs.add(tabId);
  else frozenTabs.delete(tabId);
  const badge = frozen ? BADGE.frozen : flash.running && flash.tabId === tabId ? BADGE.guard : null;
  void setBadge(badge, tabId).catch(() => {});
}

async function injectInto(tabId: number): Promise<void> {
  const target = { tabId, allFrames: true };
  await browser.scripting.executeScript({ target, files: ['/main-world.js'], world: 'MAIN' });
  await browser.scripting.executeScript({ target, files: ['/calm.js'] });
}

// ── M9: Flash Guard (Chrome) ────────────────────────────────────────────────

const SAMPLE_WINDOW_MS = 10_000;
let flash: FlashGuardStatus = { running: false, tabId: null, samples: [], hits: 0 };
let lastHitSentAt = 0;
/** Samples already in flight when the guard was stopped must not bring it back. */
let flashStoppedAt = 0;

async function ensureOffscreen(): Promise<void> {
  const contexts = await browser.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length > 0) return;
  await browser.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Analyse the visible tab locally for WCAG 2.3.1 flash thresholds.',
  });
}

/** A freshly created offscreen document may not be listening yet: retry until it acknowledges. */
async function sendToOffscreen(message: ToOffscreen): Promise<void> {
  let lastError: unknown = new Error('Flash Guard analyser did not start');
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      if (await browser.runtime.sendMessage(message)) return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw lastError;
}

async function startFlashGuard(tabId: number): Promise<FlashGuardStatus> {
  if (!IS_CHROME || !browser.tabCapture || !browser.offscreen) {
    flash = { ...flash, error: 'Flash Guard needs Chrome 116 or later.' };
    return flash;
  }
  if (flash.running) await stopFlashGuard();
  try {
    const streamId = await browser.tabCapture.getMediaStreamId({ targetTabId: tabId });
    await ensureOffscreen();
    await sendToOffscreen({ type: 'offscreen:start', streamId, tabId });
    flash = { running: true, tabId, samples: [], hits: 0 };
    if (!frozenTabs.has(tabId)) void setBadge(BADGE.guard, tabId).catch(() => {});
  } catch (e) {
    flash = { running: false, tabId: null, samples: [], hits: 0, error: String(e) };
  }
  return flash;
}

async function stopFlashGuard(): Promise<FlashGuardStatus> {
  const previousTab = flash.tabId;
  flashStoppedAt = Date.now();
  try {
    await browser.runtime.sendMessage({ type: 'offscreen:stop' } satisfies ToOffscreen);
    await browser.offscreen.closeDocument();
  } catch {
    /* not running */
  }
  flash = { ...flash, running: false };
  if (previousTab !== null && !frozenTabs.has(previousTab)) void setBadge(null, previousTab).catch(() => {});
  return flash;
}

/**
 * The analyser keeps reporting (samples, and a heartbeat when the tab is still) while the guard runs.
 * If the service worker was suspended in between, that is enough to rebuild the state it lost.
 */
function touchFlash(tabId: number, t: number): boolean {
  if (t <= flashStoppedAt) return false;
  if (!flash.running || flash.tabId !== tabId) {
    flash = { running: true, tabId, samples: [], hits: 0 };
    if (!frozenTabs.has(tabId)) void setBadge(BADGE.guard, tabId).catch(() => {});
  }
  return true;
}

function onFlashSample(sample: FlashSample): void {
  const samples = [...flash.samples, sample].filter((s) => s.t > sample.t - SAMPLE_WINDOW_MS);
  flash = { ...flash, samples };
  const { tabId } = flash;
  if (!sample.hazard || tabId === null) return;
  flash = { ...flash, hits: flash.hits + 1 };
  if (sample.t - lastHitSentAt < 500) return;
  lastHitSentAt = sample.t;
  void browser.tabs.sendMessage(tabId, { type: 'flash-detected' } satisfies ToContent).catch(() => {});
}
