/**
 * M2 (CSS side) — find every `prefers-reduced-motion` media condition in the
 * document and rewrite it with `rewriteMedia`, so the site's own calm version
 * applies. Reversible: every change is recorded and can be restored.
 *
 * Cross-origin sheets throw on `cssRules`. The background re-reads them (the
 * only network access Sukoon makes, and only for CSS the page already loaded);
 * the relevant rules are extracted and handed to the MAIN world, which adopts
 * them with the right base URL.
 */
import { mentionsReducedMotion, rewriteMedia } from '../shared/media-query';

export interface ExtractedCss {
  href: string;
  css: string;
}

type Fetcher = (url: string) => Promise<string | null>;

const MEDIA_ATTR_SELECTOR = 'link[media], style[media], source[media]';

export class ReducedMotionRewriter {
  private readonly rules: { media: MediaList; original: string }[] = [];
  private readonly attrs: { el: Element; original: string }[] = [];
  private ruleCounts = new WeakMap<CSSStyleSheet, number>();
  private readonly fetched = new Map<string, string>();
  private readonly pending = new Set<string>();
  private active = false;

  private readonly fetchCss: Fetcher;
  private readonly onExtracted: (sheets: ExtractedCss[]) => void;

  constructor(fetchCss: Fetcher, onExtracted: (sheets: ExtractedCss[]) => void) {
    this.fetchCss = fetchCss;
    this.onExtracted = onExtracted;
  }

  start(): void {
    this.active = true;
    this.scanAll();
    // stop() withdrew the cross-origin rules fetched earlier; they are still cached here, so hand them back.
    this.publish();
  }

  /** Put every rewritten query back the way the site wrote it. */
  stop(): void {
    this.active = false;
    for (const { media, original } of this.rules.splice(0)) {
      try {
        media.mediaText = original;
      } catch {
        /* sheet removed */
      }
    }
    for (const { el, original } of this.attrs.splice(0)) el.setAttribute('media', original);
    this.ruleCounts = new WeakMap();
    this.onExtracted([]);
  }

  scanAll(): void {
    if (!this.active) return;
    for (const el of document.querySelectorAll(MEDIA_ATTR_SELECTOR)) this.rewriteAttr(el);
    for (const sheet of document.styleSheets) this.scanSheet(sheet);
    for (const sheet of document.adoptedStyleSheets) this.scanSheet(sheet);
  }

  /** Call for newly added <link>/<style>/<source> elements and on their `load`. */
  scanElement(el: Element): void {
    if (!this.active) return;
    if (el.matches(MEDIA_ATTR_SELECTOR)) this.rewriteAttr(el);
    const sheet = (el as HTMLLinkElement | HTMLStyleElement).sheet;
    if (sheet) this.scanSheet(sheet);
  }

  private rewriteAttr(el: Element): void {
    const media = el.getAttribute('media');
    if (!media || !mentionsReducedMotion(media)) return;
    this.attrs.push({ el, original: media });
    el.setAttribute('media', rewriteMedia(media));
  }

  private scanSheet(sheet: CSSStyleSheet): void {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      if (sheet.href) void this.fetchCrossOrigin(sheet.href);
      return;
    }
    // Idempotent: rewritten rules no longer match, so only re-walk when the sheet grew (CSS-in-JS).
    if (this.ruleCounts.get(sheet) === rules.length) return;
    this.ruleCounts.set(sheet, rules.length);
    this.walk(rules);
  }

  private walk(rules: CSSRuleList): void {
    for (const rule of rules) {
      if (rule instanceof CSSImportRule) {
        if (mentionsReducedMotion(rule.media.mediaText)) this.rewriteList(rule.media);
        if (rule.styleSheet) this.scanSheet(rule.styleSheet);
        continue;
      }
      if (rule instanceof CSSMediaRule && mentionsReducedMotion(rule.media.mediaText)) {
        this.rewriteList(rule.media);
      }
      if ('cssRules' in rule) this.walk((rule as CSSGroupingRule).cssRules);
    }
  }

  private rewriteList(media: MediaList): void {
    const original = media.mediaText;
    media.mediaText = rewriteMedia(original);
    this.rules.push({ media, original });
  }

  private async fetchCrossOrigin(href: string): Promise<void> {
    if (this.fetched.has(href) || this.pending.has(href)) return;
    this.pending.add(href);
    const text = await this.fetchCss(href);
    this.pending.delete(href);
    this.fetched.set(href, text && mentionsReducedMotion(text) ? extractReducedMotionRules(text, href) : '');
    if (this.active) this.publish();
  }

  private publish(): void {
    const sheets: ExtractedCss[] = [];
    for (const [href, css] of this.fetched) if (css) sheets.push({ href, css });
    this.onExtracted(sheets);
  }
}

/**
 * Parse CSS text and return only the reduced-motion blocks, rewritten, with
 * their enclosing @media / @supports / @layer / @container wrappers kept.
 */
export function extractReducedMotionRules(text: string, baseURL?: string): string {
  const sheet = new CSSStyleSheet(baseURL ? { baseURL } : undefined);
  try {
    sheet.replaceSync(text);
  } catch {
    return '';
  }
  return collect(sheet.cssRules).join('\n');
}

function collect(rules: CSSRuleList): string[] {
  const out: string[] = [];
  for (const rule of rules) {
    if (rule instanceof CSSMediaRule && mentionsReducedMotion(rule.media.mediaText)) {
      rule.media.mediaText = rewriteMedia(rule.media.mediaText);
      out.push(rule.cssText);
      continue;
    }
    if (!('cssRules' in rule)) continue;
    const inner = collect((rule as CSSGroupingRule).cssRules);
    if (inner.length === 0) continue;
    const body = inner.join('\n');
    if (rule instanceof CSSMediaRule) out.push(`@media ${rule.media.mediaText} {\n${body}\n}`);
    else if (rule instanceof CSSSupportsRule) out.push(`@supports ${rule.conditionText} {\n${body}\n}`);
    else if (typeof CSSContainerRule !== 'undefined' && rule instanceof CSSContainerRule)
      out.push(`@container ${rule.conditionText} {\n${body}\n}`);
    else if (typeof CSSLayerBlockRule !== 'undefined' && rule instanceof CSSLayerBlockRule)
      out.push(`@layer ${rule.name} {\n${body}\n}`);
    else out.push(body);
  }
  return out;
}
