/**
 * MAIN-world script, registered at document_start in every frame, before any
 * page script runs. It owns everything that has to live in the page's JS realm:
 *
 *  M2  window.matchMedia rewrite
 *  M3  attachShadow + adoptedStyleSheets (calm sheet in every shadow root)
 *  M4  JS-library adapters (GSAP, Lottie, Swiper, Slick, Flickity, Owl)
 *  M5  instant scroll functions + wheel-hijack guard
 *  M6  HTMLMediaElement.play guard
 *  M7  requestAnimationFrame hold while the panic freeze is on
 *
 * It has no extension APIs; it talks to the isolated script through CustomEvents.
 */
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { calmCss, SHADOW_SCOPE } from '../shared/calm-css';
import { mentionsReducedMotion, rewriteMedia } from '../shared/media-query';
import type { ExtractedCss } from '../content/prm-rewriter';
import { BRIDGE, emit, parseDetail, type MainWorldObservation } from '../shared/messages';
import { MODE_PRESETS, type PageConfig } from '../shared/settings';

declare global {
  interface Window {
    __sukoonMain?: true;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any -- third-party library globals are untyped */
type Loose = any;

export default defineUnlistedScript(() => {
  if (window.__sukoonMain) return;
  Object.defineProperty(window, '__sukoonMain', { value: true });

  // Until the isolated script delivers the real config (a few ms), behave like the default mode.
  let config: PageConfig = {
    active: true,
    features: { ...MODE_PRESETS.vestibular, parallaxFreeze: false },
  };
  const on = (feature: keyof PageConfig['features']) => config.active && config.features[feature];

  // Capture natives before the page can touch them.
  const native = {
    matchMedia: window.matchMedia,
    attachShadow: Element.prototype.attachShadow,
    play: HTMLMediaElement.prototype.play,
    raf: window.requestAnimationFrame,
    caf: window.cancelAnimationFrame,
    winScrollTo: window.scrollTo,
    winScrollBy: window.scrollBy,
    elScrollTo: Element.prototype.scrollTo,
    elScrollBy: Element.prototype.scrollBy,
    scrollIntoView: Element.prototype.scrollIntoView,
    fnToString: Function.prototype.toString,
  };

  /** Make a patched function report the native source, for sites that sniff it. */
  function disguise<F extends Function>(patched: F, original: Function): F {
    Object.defineProperty(patched, 'toString', {
      value: () => native.fnToString.call(original),
      configurable: true,
    });
    return patched;
  }

  // ── M2: matchMedia ───────────────────────────────────────────────────────
  window.matchMedia = disguise(function matchMedia(this: Window, query: string) {
    const q = String(query);
    const rewrite = on('reducedMotionSwitch') && mentionsReducedMotion(q);
    return native.matchMedia.call(this ?? window, rewrite ? rewriteMedia(q) : q);
  }, native.matchMedia);

  // ── M3: shadow roots ─────────────────────────────────────────────────────
  const shadowSheet = new CSSStyleSheet();
  shadowSheet.replaceSync(calmCss(SHADOW_SCOPE));
  /** Reduced-motion rules extracted from the document's cross-origin sheets (M2), one per source. */
  let prmSheets: CSSStyleSheet[] = [];
  const isSticky = (s: CSSStyleSheet) => s === shadowSheet || prmSheets.includes(s);

  function stickyFor(target: Document | ShadowRoot): CSSStyleSheet[] {
    return target instanceof ShadowRoot ? [shadowSheet] : prmSheets;
  }

  // Page code (Lit, Stencil, FAST…) assigns adoptedStyleSheets wholesale; keep ours attached.
  for (const proto of [Document.prototype, ShadowRoot.prototype]) {
    const desc = Object.getOwnPropertyDescriptor(proto, 'adoptedStyleSheets');
    if (!desc?.set || !desc.get) continue;
    const { get, set } = desc;
    Object.defineProperty(proto, 'adoptedStyleSheets', {
      ...desc,
      get,
      set: disguise(function (this: Document | ShadowRoot, value: Iterable<CSSStyleSheet>) {
        const own = [...value].filter((s) => !isSticky(s));
        set.call(this, [...own, ...stickyFor(this)]);
      }, set),
    });
  }

  function adopt(root: Document | ShadowRoot) {
    try {
      const current = root.adoptedStyleSheets;
      for (const sheet of stickyFor(root)) if (!current.includes(sheet)) current.push(sheet);
    } catch {
      /* closed or foreign root */
    }
  }

  Element.prototype.attachShadow = disguise(function attachShadow(this: Element, init: ShadowRootInit) {
    const root = native.attachShadow.call(this, init);
    adopt(root);
    return root;
  }, native.attachShadow);

  adopt(document);

  // Declarative shadow DOM never calls attachShadow: sweep once parsed, then watch new hosts.
  const adoptDeclarative = (el: Element) => {
    if (el.shadowRoot) adopt(el.shadowRoot);
  };
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      for (const el of document.querySelectorAll('*')) adoptDeclarative(el);
      new MutationObserver((records) => {
        for (const r of records) for (const n of r.addedNodes) if (n instanceof Element) adoptDeclarative(n);
      }).observe(document.documentElement, { childList: true, subtree: true });
    },
    { once: true },
  );

  // ── M6: media guard ──────────────────────────────────────────────────────
  const userStarted = new WeakSet<HTMLMediaElement>();
  let blockedPlays = 0;
  const hasGesture = () => navigator.userActivation?.isActive ?? false;
  const shouldBlock = (el: HTMLMediaElement) =>
    on('mediaGuard') && el instanceof HTMLVideoElement && !userStarted.has(el) && !hasGesture();

  HTMLMediaElement.prototype.play = disguise(function play(this: HTMLMediaElement) {
    if (shouldBlock(this)) {
      blockedPlays++;
      // Same rejection the browser uses for blocked autoplay; sites already handle it.
      return Promise.reject(new DOMException('Autoplay blocked by Sukoon', 'NotAllowedError'));
    }
    if (hasGesture()) userStarted.add(this);
    return native.play.call(this);
  }, native.play);

  // Catches the `autoplay` attribute and native controls; `play` does not bubble, so capture.
  window.addEventListener(
    'play',
    (e) => {
      const el = e.target;
      if (!(el instanceof HTMLMediaElement)) return;
      if (hasGesture()) {
        userStarted.add(el);
      } else if (shouldBlock(el) && !panicked) {
        el.pause();
        blockedPlays++;
      }
    },
    true,
  );

  // ── M5: scroll guard ─────────────────────────────────────────────────────
  type ScrollArgs = [ScrollToOptions?] | [number, number];
  const instant = (args: ScrollArgs): ScrollArgs => {
    const [first] = args;
    if (on('scrollGuard') && typeof first === 'object' && first !== null && first.behavior === 'smooth') {
      return [{ ...first, behavior: 'instant' }];
    }
    return args;
  };
  window.scrollTo = disguise(function (...args: ScrollArgs) {
    native.winScrollTo.apply(window, instant(args) as [number, number]);
  }, native.winScrollTo);
  window.scrollBy = disguise(function (...args: ScrollArgs) {
    native.winScrollBy.apply(window, instant(args) as [number, number]);
  }, native.winScrollBy);
  Element.prototype.scrollTo = disguise(function (this: Element, ...args: ScrollArgs) {
    native.elScrollTo.apply(this, instant(args) as [number, number]);
  }, native.elScrollTo);
  Element.prototype.scrollBy = disguise(function (this: Element, ...args: ScrollArgs) {
    native.elScrollBy.apply(this, instant(args) as [number, number]);
  }, native.elScrollBy);
  Element.prototype.scrollIntoView = disguise(function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
    const next =
      on('scrollGuard') && typeof arg === 'object' && arg?.behavior === 'smooth'
        ? { ...arg, behavior: 'instant' as ScrollBehavior }
        : arg;
    native.scrollIntoView.call(this, next);
  }, native.scrollIntoView);

  /**
   * Wheel guard. Registered at document_start, so it is the first capture
   * listener on window. It only engages when a smooth-scroll hijacker is found
   * AND the page scrolls natively (Lenis wraps native scrolling). Virtual
   * scrollers (overflow: hidden + transforms) are left alone, or the page would freeze.
   *
   * Detection runs at the start of every wheel burst and never latches:
   *  - Lenis announces itself with a class on the root;
   *  - any other page-wide hijacker cancels a synthetic zero-delta wheel event
   *    dispatched on <body>. A map, chart or slider that listens on its own
   *    element never sees that event, so widgets cannot trip the guard.
   */
  const BURST_GAP_MS = 400;
  let lastWheelAt = -Infinity;
  let hijack = false;
  let wheelGuardEngaged = false;

  function nativelyScrollable(el: Element): boolean {
    const isRoot = el === document.documentElement || el === document.body;
    const scroller = isRoot ? (document.scrollingElement ?? document.documentElement) : el;
    const styles = isRoot
      ? [getComputedStyle(document.documentElement), document.body ? getComputedStyle(document.body) : null]
      : [getComputedStyle(el)];
    const locked = styles.some((s) => s && (s.overflowY === 'hidden' || s.overflowY === 'clip'));
    return !locked && scroller.scrollHeight > scroller.clientHeight;
  }

  function detectHijack(): boolean {
    const lenisRoot = document.querySelector('html.lenis, .lenis.lenis-smooth, .lenis');
    if (lenisRoot) return !lenisRoot.classList.contains('lenis-stopped') && nativelyScrollable(lenisRoot);
    const body = document.body;
    if (!body || !nativelyScrollable(document.documentElement)) return false;
    // Untrusted events never scroll, so this probe moves nothing; our own listener ignores it (isTrusted).
    const probe = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 0, deltaY: 0 });
    body.dispatchEvent(probe);
    return probe.defaultPrevented;
  }

  const WHEEL_CONSUMERS = [
    'canvas', 'iframe', 'video', 'svg', 'input', 'select', 'textarea', '[role="application"]', '[role="slider"]', '[contenteditable]',
    // Maps, charts and sliders that zoom or move with the wheel.
    '.leaflet-container', '.mapboxgl-map', '.maplibregl-map', '.gm-style', '.highcharts-container', '.js-plotly-plot',
    '.swiper', '.swiper-container', 'swiper-container', '.slick-slider', '.flickity-enabled', '.owl-carousel',
  ].join(', ');

  window.addEventListener(
    'wheel',
    (e) => {
      if (!e.isTrusted || !on('scrollGuard') || e.ctrlKey) return; // ctrl+wheel is pinch-zoom
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(WHEEL_CONSUMERS)) return;
      const now = performance.now();
      if (now - lastWheelAt > BURST_GAP_MS) hijack = detectHijack();
      lastWheelAt = now;
      if (hijack) {
        wheelGuardEngaged = true;
        e.stopImmediatePropagation(); // page listeners never see it; the browser scrolls natively
      }
    },
    { capture: true, passive: true },
  );

  // ── M4: JS-library adapters ──────────────────────────────────────────────
  const slidersSeen = new WeakSet<object>();
  let autoplayingSliders = 0;

  function adaptLibraries() {
    if (!config.active) return;
    const w = window as Loose;

    if (on('adapters') || on('scrollGuard')) {
      // GSAP: finish finite tweens, park infinite ones on their first frame.
      try {
        const gsap = w.gsap;
        if (gsap?.globalTimeline) {
          for (const child of gsap.globalTimeline.getChildren(false, true, true) as Loose[]) {
            if (child.scrollTrigger && !on('scrollGuard')) continue;
            // A paused timeline is a menu or overlay waiting for a click; rendering its end state would open it.
            if (child.paused?.()) continue;
            if (child.repeat?.() === -1) child.progress(0).pause();
            else child.progress(1);
          }
          if (on('scrollGuard')) {
            for (const st of (w.ScrollTrigger?.getAll?.() ?? []) as Loose[]) {
              // Callback-only triggers (onEnter reveals, toggleClass) are how content appears; leave them running.
              if (!st.animation) continue;
              st.animation.progress?.(1);
              st.disable?.(false);
            }
          }
        }
      } catch {
        /* never let an adapter break the page */
      }
    }

    if (!on('adapters')) return;

    try {
      w.lottie?.freeze?.();
      w.bodymovin?.freeze?.();
      for (const el of document.querySelectorAll('lottie-player, dotlottie-player, dotlottie-wc') as NodeListOf<Loose>) {
        el.pause?.();
      }
    } catch {
      /* ignore */
    }

    for (const el of document.querySelectorAll('.swiper, .swiper-container, swiper-container') as NodeListOf<Loose>) {
      try {
        const autoplay = el.swiper?.autoplay;
        if (autoplay?.running) {
          if (!slidersSeen.has(el)) autoplayingSliders++;
          slidersSeen.add(el);
          autoplay.stop();
        }
      } catch {
        /* ignore */
      }
    }

    try {
      const $ = w.jQuery;
      if ($?.fn?.slick) $('.slick-initialized').slick('slickPause');
      if ($?.fn?.owlCarousel) $('.owl-carousel').trigger('stop.owl.autoplay');
    } catch {
      /* ignore */
    }

    try {
      const Flickity = w.Flickity;
      if (Flickity?.data) {
        for (const el of document.querySelectorAll('.flickity-enabled')) Flickity.data(el)?.stopPlayer?.();
      }
    } catch {
      /* ignore */
    }
  }

  /** Loops the CSS layer cannot see: GSAP `repeat: -1` and Lottie animations. */
  function scriptedLoops(): { total: number; running: number } {
    const w = window as Loose;
    let total = 0;
    let running = 0;
    try {
      for (const child of (w.gsap?.globalTimeline?.getChildren?.(true, true, true) ?? []) as Loose[]) {
        if (child.repeat?.() !== -1) continue;
        total++;
        if (child.isActive?.()) running++;
      }
    } catch {
      /* ignore */
    }
    try {
      for (const anim of (w.lottie?.getRegisteredAnimations?.() ?? []) as Loose[]) {
        if (!anim.loop) continue;
        total++;
        if (anim.isPaused === false) running++;
      }
    } catch {
      /* ignore */
    }
    for (const el of document.querySelectorAll('lottie-player, dotlottie-player, dotlottie-wc') as NodeListOf<Loose>) {
      total++;
      if (el.currentState === 'playing' || el.isPlaying === true) running++;
    }
    return { total, running };
  }

  // ── M7: panic hold ───────────────────────────────────────────────────────
  let panicked = false;
  const heldFrames = new Map<number, FrameRequestCallback>();
  let heldId = 2 ** 30;

  window.requestAnimationFrame = disguise(function requestAnimationFrame(cb: FrameRequestCallback) {
    if (!panicked) return native.raf.call(window, cb);
    heldFrames.set(++heldId, cb);
    return heldId;
  }, native.raf);
  window.cancelAnimationFrame = disguise(function cancelAnimationFrame(id: number) {
    if (!heldFrames.delete(id)) native.caf.call(window, id);
  }, native.caf);

  function setPanic(frozen: boolean) {
    if (frozen === panicked) return;
    panicked = frozen;
    const w = window as Loose;
    try {
      if (frozen) {
        w.gsap?.globalTimeline?.pause?.();
        w.lottie?.freeze?.();
      } else {
        w.gsap?.globalTimeline?.resume?.();
        if (!on('adapters')) w.lottie?.unfreeze?.();
      }
    } catch {
      /* ignore */
    }
    if (!frozen) {
      const held = [...heldFrames.values()];
      heldFrames.clear();
      for (const cb of held) native.raf.call(window, cb);
    }
  }

  // ── Bridge ───────────────────────────────────────────────────────────────
  function applyConfig(next: PageConfig) {
    config = next;
    shadowSheet.disabled = !(next.active && next.features.calmCss && next.features.deepCoverage);
    for (const sheet of prmSheets) sheet.disabled = !(next.active && next.features.reducedMotionSwitch);
  }

  function setPrmSheets(extracted: ExtractedCss[]) {
    const old = prmSheets;
    prmSheets = extracted.map(({ href, css }) => {
      const sheet = new CSSStyleSheet({ baseURL: href });
      sheet.replaceSync(css);
      sheet.disabled = !(config.active && config.features.reducedMotionSwitch);
      return sheet;
    });
    try {
      const list = document.adoptedStyleSheets;
      for (let i = list.length - 1; i >= 0; i--) if (old.includes(list[i]!)) list.splice(i, 1);
      list.push(...prmSheets);
    } catch {
      /* ignore */
    }
  }

  window.addEventListener(BRIDGE.config, (e) => {
    const next = parseDetail<PageConfig>(e);
    if (next) applyConfig(next);
  });
  window.addEventListener(BRIDGE.prmCss, (e) => {
    const sheets = parseDetail<ExtractedCss[]>(e);
    if (Array.isArray(sheets)) setPrmSheets(sheets);
  });
  window.addEventListener(BRIDGE.panic, (e) => setPanic(parseDetail<boolean>(e) === true));
  window.addEventListener(BRIDGE.adapt, () => adaptLibraries());
  window.addEventListener(BRIDGE.query, () => {
    const loops = scriptedLoops();
    const answer: MainWorldObservation = {
      scriptedLoops: loops.total,
      scriptedLoopsRunning: loops.running,
      scrollHijack: detectHijack() || wheelGuardEngaged,
      wheelGuardEngaged,
      autoplayingSliders,
      blockedPlays,
    };
    emit(BRIDGE.answer, answer);
  });
});
