/**
 * Still on-page digest chip. Closed shadow, no motion.
 */
import { formatDigest, type DigestFact } from '../shared/digest';
import { dirOf, pageStrings } from '../shared/page-strings';
import type { Locale, PageChip } from '../shared/settings';

const SHOWN_KEY = 'sukoon:chip';
const BRIEF_MS = 5500;

const CSS = `
  :host { all: initial; }
  .box {
    position: fixed; z-index: 2147483646;
    inset-inline-end: 16px; bottom: 16px;
    max-width: min(280px, calc(100vw - 32px));
    box-sizing: border-box;
    padding: 10px 12px;
    border: 2px solid #111418;
    border-radius: 10px;
    background: #fdfdfc;
    color: #111418;
    font: 500 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .label { font-weight: 700; margin-block-end: 4px; }
  ul { margin: 0; padding-inline-start: 1.1em; }
  button {
    margin-block-start: 8px;
    font: 600 13px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 6px 10px; border-radius: 6px; cursor: pointer;
    background: #111418; color: #fdfdfc; border: 2px solid #111418;
  }
  button:focus-visible { outline: 3px solid #1d64d8; outline-offset: 2px; }
`;

export class DigestChip {
  private host: HTMLElement | null = null;
  private hideTimer = 0;
  private locale: Locale = 'en';
  private mode: PageChip = 'briefly';

  setOptions(locale: Locale, mode: PageChip): void {
    this.locale = locale;
    this.mode = mode;
    if (mode === 'off') this.hide();
  }

  show(facts: DigestFact[]): void {
    if (this.mode === 'off' || window !== window.top) return;
    if (this.mode === 'briefly') {
      try {
        if (sessionStorage.getItem(SHOWN_KEY) === '1') return;
        sessionStorage.setItem(SHOWN_KEY, '1');
      } catch {
        /* private mode */
      }
    }
    this.hide();
    const strings = pageStrings(this.locale);
    const lines = formatDigest(facts, strings.digest);
    const shown = lines.length > 0 ? lines : [strings.digest.empty];

    const host = document.createElement('sukoon-chip');
    host.setAttribute('dir', dirOf(this.locale));
    host.setAttribute('lang', this.locale);
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;
    const box = document.createElement('div');
    box.className = 'box';
    box.setAttribute('role', 'status');
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = strings.digest.heading;
    const list = document.createElement('ul');
    for (const line of shown) {
      const li = document.createElement('li');
      li.textContent = line;
      list.append(li);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = strings.chip.dismiss;
    button.addEventListener('click', () => this.hide());
    box.append(label, list, button);
    root.append(style, box);
    document.documentElement.append(host);
    this.host = host;

    if (this.mode === 'briefly') {
      this.hideTimer = window.setTimeout(() => this.hide(), BRIEF_MS);
    }
  }

  hide(): void {
    clearTimeout(this.hideTimer);
    this.hideTimer = 0;
    this.host?.remove();
    this.host = null;
  }
}
