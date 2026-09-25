/**
 * M5.4 — Parallax freeze (vestibular mode).
 *
 * DOM observation only runs during scroll bursts: when scrolling starts, a
 * MutationObserver watches inline `style` writes; an element whose inline
 * transform changes three times within 400 ms of one burst moves with the
 * scroll (parallax libraries write on every scroll event or frame, so they
 * are far faster than a 4 Hz video progress bar or a ticking clock). Frozen
 * layers get an attribute that the calm stylesheet pins to `transform: none`
 * (a stylesheet !important beats the library's next inline write).
 */

import { STILL_ATTR } from '../shared/calm-css';

const BURST_END_MS = 200;
const CHANGES_TO_FLAG = 3;
/** The flagged changes must all fall inside this window: scroll-synced writes come at 10 Hz or (far) more. */
const FLAG_WINDOW_MS = 400;
const TRANSFORM_PROPS = /(?:^|;)\s*(transform|translate)\s*:\s*([^;]*)/gi;

/** The inline transform/translate values only; `transition: transform` or other properties do not count. */
function transformOf(style: string | null): string {
  if (!style) return '';
  const parts: string[] = [];
  for (const m of style.matchAll(TRANSFORM_PROPS)) parts.push(`${m[1]!.toLowerCase()}=${m[2]!.trim()}`);
  return parts.join(';');
}

export class ParallaxFreezer {
  readonly detected = new Set<Element>();
  private changes = new Map<Element, number[]>();
  private observing = false;
  private timer = 0;
  private freeze = false;
  private readonly observer = new MutationObserver((records) => this.onMutations(records));

  constructor() {
    window.addEventListener('scroll', () => this.onScroll(), { capture: true, passive: true });
  }

  setFreeze(freeze: boolean): void {
    this.freeze = freeze;
    for (const el of this.detected) {
      if (freeze) el.setAttribute(STILL_ATTR, '');
      else el.removeAttribute(STILL_ATTR);
    }
  }

  get liveCount(): number {
    return [...this.detected].filter((el) => el.isConnected).length;
  }

  private onScroll(): void {
    if (!this.observing && document.body) {
      this.observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['style'],
        attributeOldValue: true,
        subtree: true,
      });
      this.observing = true;
    }
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.endBurst(), BURST_END_MS);
  }

  private endBurst(): void {
    this.onMutations(this.observer.takeRecords());
    this.observer.disconnect();
    this.observing = false;
    this.changes = new Map();
  }

  private onMutations(records: MutationRecord[]): void {
    const now = performance.now();
    for (const r of records) {
      const el = r.target as Element;
      if (this.detected.has(el)) continue;
      if (transformOf(el.getAttribute('style')) === transformOf(r.oldValue)) continue;
      const times = this.changes.get(el) ?? [];
      times.push(now);
      while (times.length > CHANGES_TO_FLAG) times.shift();
      this.changes.set(el, times);
      if (times.length === CHANGES_TO_FLAG && now - times[0]! <= FLAG_WINDOW_MS) {
        this.detected.add(el);
        if (this.freeze) el.setAttribute(STILL_ATTR, '');
      }
    }
  }
}
