/**
 * Isolated-world content script, registered at document_start in every frame
 * together with calm.css. Orchestrates the DOM-side modules and relays the
 * user's settings to the MAIN-world script.
 */
import { browser } from 'wxt/browser';
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { DomAdapters } from '../content/dom-adapters';
import { FlashDimmer, PanicFreeze } from '../content/freeze';
import { ParallaxFreezer } from '../content/parallax';
import { ReducedMotionRewriter } from '../content/prm-rewriter';
import { measureSli } from '../content/sli-observer';
import { PAUSED_ATTR, SOFTEN_ATTR } from '../shared/calm-css';
import {
  BRIDGE,
  emit,
  parseDetail,
  type CssFetchResult,
  type MainWorldObservation,
  type ToBackground,
  type ToContent,
} from '../shared/messages';
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  pageConfigFor,
  SETTINGS_KEY,
  type PageConfig,
  type Settings,
} from '../shared/settings';

declare global {
  interface Window {
    __sukoonIsolated?: true;
  }
}

export default defineUnlistedScript(() => {
  if (window.__sukoonIsolated) return;
  Object.defineProperty(window, '__sukoonIsolated', { value: true });

  const host = frameHost();
  let settings: Settings = DEFAULT_SETTINGS;
  let config: PageConfig = pageConfigFor(settings, host);
  let loaded = false;

  const rewriter = new ReducedMotionRewriter(fetchCss, (sheets) => emit(BRIDGE.prmCss, sheets));
  const adapters = new DomAdapters();
  const parallax = new ParallaxFreezer();
  const panic = new PanicFreeze(() => {
    // Escape or the Release button: the background clears its badge and releases the embedded frames too.
    void browser.runtime.sendMessage({ type: 'panic-state', frozen: false } satisfies ToBackground).catch(() => {});
  });
  const flash = new FlashDimmer(() => {
    // The Restore button lives in the top frame; the background lifts the dim in every frame.
    void browser.runtime.sendMessage({ type: 'flash-restore' } satisfies ToBackground).catch(() => {});
  });

  // Who started each video: needed by the SLI to tell autoplay from the user's own choice.
  const selfStarted = new Set<HTMLVideoElement>();
  const userStarted = new WeakSet<HTMLMediaElement>();
  window.addEventListener(
    'play',
    (e) => {
      const el = e.target;
      if (!(el instanceof HTMLVideoElement)) return;
      if (navigator.userActivation?.isActive) userStarted.add(el);
      else if (!userStarted.has(el)) selfStarted.add(el);
    },
    true,
  );

  // ── Applying settings ──────────────────────────────────────────────────
  const wanted = new Map<string, boolean>();
  function setRootAttr(name: string, present: boolean) {
    wanted.set(name, present);
    const root = document.documentElement;
    if (!root || root.hasAttribute(name) === present) return;
    if (present) root.setAttribute(name, '');
    else root.removeAttribute(name);
  }

  function apply() {
    config = pageConfigFor(settings, host);
    emit(BRIDGE.config, config);
    const { active, features: f } = config;
    setRootAttr(PAUSED_ATTR, !(active && f.calmCss));
    setRootAttr(SOFTEN_ATTR, active && f.softenVideo);
    if (active && f.reducedMotionSwitch) rewriter.start();
    else rewriter.stop();
    parallax.setFreeze(active && f.parallaxFreeze);
    if (active) runAdapters();
    else adapters.undo();
  }

  let adaptTimer = 0;
  function runAdapters() {
    if (!loaded || !config.active) return;
    adapters.run(config.features);
    emit(BRIDGE.adapt);
  }
  function scheduleAdapters() {
    clearTimeout(adaptTimer);
    adaptTimer = window.setTimeout(runAdapters, 300);
  }

  void browser.storage.local.get(SETTINGS_KEY).then((stored) => {
    settings = normalizeSettings(stored[SETTINGS_KEY]);
    loaded = true;
    apply();
  });

  browser.storage.onChanged.addListener((changes, area) => {
    const change = changes[SETTINGS_KEY];
    if (area !== 'local' || !change) return;
    settings = normalizeSettings(change.newValue);
    apply();
  });

  // ── Watching the document ──────────────────────────────────────────────
  // Sites that rewrite <html> attributes (hydration) must not silently drop our state.
  if (document.documentElement) {
    new MutationObserver(() => {
      for (const [name, present] of wanted) setRootAttr(name, present);
    }).observe(document.documentElement, { attributes: true, attributeFilter: [PAUSED_ATTR, SOFTEN_ATTR] });
  }

  new MutationObserver((records) => {
    if (!config.active) return;
    let changed = false;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        changed = true;
        onAdded(node);
        if (node.firstElementChild) for (const el of node.querySelectorAll('video, link, style, source[media]')) onAdded(el);
      }
    }
    if (changed) scheduleAdapters();
  }).observe(document, { childList: true, subtree: true });

  function onAdded(el: Element) {
    const tag = el.tagName;
    if (tag === 'VIDEO') {
      // Strip autoplay while the element is being parsed, before playback can start.
      if (config.features.mediaGuard && el.hasAttribute('autoplay')) {
        el.removeAttribute('autoplay');
        adapters.autoplayStripped.add(el as HTMLVideoElement);
        selfStarted.add(el as HTMLVideoElement);
      }
    } else if (tag === 'LINK' || tag === 'STYLE' || tag === 'SOURCE') {
      if (config.features.reducedMotionSwitch) rewriter.scanElement(el);
    }
  }

  // Stylesheets finish loading after insertion; `load` does not bubble, so capture.
  document.addEventListener(
    'load',
    (e) => {
      const el = e.target;
      if (config.active && config.features.reducedMotionSwitch && (el instanceof HTMLLinkElement || el instanceof HTMLStyleElement)) {
        rewriter.scanElement(el);
      }
    },
    true,
  );

  const sweep = () => {
    if (!config.active) return;
    if (config.features.reducedMotionSwitch) rewriter.scanAll();
    runAdapters();
  };
  document.addEventListener('DOMContentLoaded', sweep, { once: true });
  window.addEventListener(
    'load',
    () => {
      sweep();
      // Libraries often initialise a little after load.
      setTimeout(sweep, 1500);
      setTimeout(sweep, 4000);
    },
    { once: true },
  );

  // ── Messages ───────────────────────────────────────────────────────────
  browser.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse: (r: unknown) => void) => {
    const msg = raw as ToContent;
    switch (msg.type) {
      case 'ping':
        sendResponse(true);
        return false;
      case 'panic':
        panic.setFrozen(msg.frozen, msg.screenshot);
        sendResponse(panic.active);
        return false;
      case 'panic-query':
        sendResponse(panic.active);
        return false;
      case 'flash-detected':
        flash.engage();
        sendResponse(true);
        return false;
      case 'flash-restore':
        flash.restore();
        sendResponse(true);
        return false;
      case 'get-sli':
        if (window !== window.top) return false;
        sendResponse(sliReport());
        return false;
      default:
        return false;
    }
  });

  function queryMainWorld(): MainWorldObservation | null {
    let answer: MainWorldObservation | null = null;
    const listener = (e: Event) => {
      answer = parseDetail<MainWorldObservation>(e);
    };
    window.addEventListener(BRIDGE.answer, listener, { once: true });
    emit(BRIDGE.query); // the MAIN world answers synchronously
    window.removeEventListener(BRIDGE.answer, listener);
    return answer;
  }

  function sliReport() {
    const { active, features: f } = config;
    const counts = adapters.counts();
    return measureSli({
      active,
      main: queryMainWorld(),
      pausedLoops: counts.pausedLoops,
      parallaxDetected: parallax.liveCount,
      parallaxFrozen: active && f.parallaxFreeze,
      scrollGuard: active && f.scrollGuard,
      adapters: active && f.adapters,
      mediaGuard: active && f.mediaGuard,
      smilRunning: counts.smilRunning,
      smilTotal: counts.smilTotal,
      marqueesRunning: counts.marqueesRunning,
      marqueesTotal: counts.marqueesTotal,
      gifsFrozen: settings.enabled && settings.imageAnimation !== 'allowed',
      selfStartedVideos: selfStarted,
      userStartedVideos: userStarted,
      flashHit: flash.hits > 0,
      flashDimmed: flash.dimmed,
    });
  }
});

async function fetchCss(url: string): Promise<string | null> {
  try {
    const result = (await browser.runtime.sendMessage({ type: 'fetch-css', url } satisfies ToBackground)) as CssFetchResult;
    return result?.ok ? (result.text ?? null) : null;
  } catch {
    return null;
  }
}

/** about:blank / srcdoc frames inherit their creator's site. */
function frameHost(): string {
  if (location.hostname) return location.hostname;
  try {
    return window.top?.location.hostname ?? '';
  } catch {
    return '';
  }
}
