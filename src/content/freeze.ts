/**
 * M7 — Panic freeze, and the M9 Flash Guard response.
 *
 * Panic: a screenshot of the tab is laid over the whole page, dimmed; scrolling
 * is locked and everything underneath is paused (media, animations, SMIL, and
 * requestAnimationFrame in the MAIN world — which covers canvas and WebGL).
 * The same shortcut, Escape or the Release button undoes it. The background
 * owns the tab's state: the top frame decides, every embedded frame follows.
 *
 * UI lives in a closed shadow root so page CSS cannot restyle it. It never animates.
 */
import { FLASH_DIM_ATTR } from '../shared/calm-css';
import { BRIDGE, emit } from '../shared/messages';

const Z_TOP = '2147483647';

interface Frozen {
  media: HTMLMediaElement[];
  animations: Animation[];
  svgs: SVGSVGElement[];
}

/** Panic and Flash Guard can overlap; the page-world hold is released only when both are. */
let holds = 0;

function freezeEverything(): Frozen {
  const media = [...document.querySelectorAll<HTMLMediaElement>('video, audio')].filter((m) => !m.paused);
  for (const m of media) m.pause();
  const animations = document.getAnimations().filter((a) => a.playState === 'running');
  for (const a of animations) a.pause();
  const svgs = [...document.querySelectorAll('svg')].filter((s) => !s.ownerSVGElement && !s.animationsPaused());
  for (const s of svgs) s.pauseAnimations();
  if (holds++ === 0) emit(BRIDGE.panic, true);
  return { media, animations, svgs };
}

function thaw(frozen: Frozen, resumeMedia: boolean): void {
  if (--holds === 0) emit(BRIDGE.panic, false);
  for (const a of frozen.animations) {
    try {
      a.play();
    } catch {
      /* removed */
    }
  }
  for (const s of frozen.svgs) s.unpauseAnimations();
  if (resumeMedia) for (const m of frozen.media) void m.play().catch(() => {});
}

function base64ToBlob(dataUrl: string): Blob {
  const [meta, data = ''] = dataUrl.split(',');
  const type = /data:([^;]+)/.exec(meta ?? '')?.[1] ?? 'image/jpeg';
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type });
}

const PANEL_CSS = `
  :host { all: initial; }
  .layer { position: fixed; inset: 0; z-index: ${Z_TOP}; background: #1b1d21; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .dim { position: absolute; inset: 0; background: rgba(10, 12, 16, 0.45); }
  .panel {
    position: absolute; left: 50%; bottom: 24px; transform: translateX(-50%);
    max-width: calc(100% - 32px); box-sizing: border-box;
    display: flex; gap: 16px; align-items: center; flex-wrap: wrap;
    padding: 14px 18px; border-radius: 12px;
    background: #fdfdfc; color: #111418; border: 2px solid #111418;
    font: 500 15px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .banner { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: ${Z_TOP}; bottom: auto; }
  button {
    font: 600 15px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 10px 16px; border-radius: 8px; cursor: pointer;
    background: #111418; color: #fdfdfc; border: 2px solid #111418;
  }
  button:focus-visible { outline: 3px solid #1d64d8; outline-offset: 2px; }
  kbd { font: inherit; padding: 1px 6px; border: 1px solid #111418; border-radius: 4px; }
`;

/** Decoded locally (no network request, so page CSP is not involved) and drawn onto a canvas. */
async function drawScreenshot(canvas: HTMLCanvasElement, dataUrl: string): Promise<void> {
  try {
    const bitmap = await createImageBitmap(base64ToBlob(dataUrl));
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    bitmap.close();
  } catch {
    canvas.remove();
  }
}

function createHost(): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement('sukoon-ui');
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = PANEL_CSS;
  root.append(style);
  document.documentElement.append(host);
  return { host, root };
}

export class PanicFreeze {
  private state: {
    host: HTMLElement;
    frozen: Frozen;
    overflow: { value: string; priority: string };
    previousFocus: Element | null;
  } | null = null;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.releaseLocally();
    }
  };

  /** Called when the person releases the page here (Escape, the Release button), so the other frames can follow. */
  private readonly onLocalRelease: (() => void) | undefined;

  constructor(onLocalRelease?: () => void) {
    this.onLocalRelease = onLocalRelease;
  }

  get active(): boolean {
    return this.state !== null;
  }

  /** The background's decision for the whole tab. Idempotent: repeating a state is a no-op. */
  setFrozen(frozen: boolean, screenshot: string | null): void {
    if (frozen && !this.state) this.engage(screenshot);
    else if (!frozen && this.state) this.release();
  }

  private engage(screenshot: string | null): void {
    const frozen = freezeEverything();
    const root = document.documentElement;
    const overflow = { value: root.style.getPropertyValue('overflow'), priority: root.style.getPropertyPriority('overflow') };
    root.style.setProperty('overflow', 'hidden', 'important');
    if (window !== window.top) {
      // Sub-frames freeze and thaw with the top frame; only the top frame shows the overlay.
      this.state = { host: document.createElement('span'), frozen, overflow, previousFocus: null };
      return;
    }
    const { host, root: shadow } = createHost();
    const layer = document.createElement('div');
    layer.className = 'layer';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', 'Sukoon: page frozen');
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    const dim = document.createElement('div');
    dim.className = 'dim';
    const panel = document.createElement('div');
    panel.className = 'panel';
    const text = document.createElement('span');
    const kbd = (key: string) => {
      const el = document.createElement('kbd');
      el.textContent = key;
      return el;
    };
    text.append('Page frozen. Press ', kbd('Esc'), ' or ', kbd('Alt'), '+', kbd('Shift'), '+', kbd('S'), ' to release.');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Release';
    button.addEventListener('click', () => this.releaseLocally());
    panel.append(text, button);
    layer.append(canvas, dim, panel);
    shadow.append(layer);

    this.state = { host, frozen, overflow, previousFocus: document.activeElement };
    window.addEventListener('keydown', this.onKey, true);
    button.focus();
    if (screenshot) void drawScreenshot(canvas, screenshot);
  }

  private releaseLocally(): void {
    if (!this.state) return;
    this.release();
    this.onLocalRelease?.();
  }

  release(): void {
    const s = this.state;
    if (!s) return;
    this.state = null;
    window.removeEventListener('keydown', this.onKey, true);
    s.host.remove();
    const root = document.documentElement;
    if (s.overflow.value) root.style.setProperty('overflow', s.overflow.value, s.overflow.priority);
    else root.style.removeProperty('overflow');
    // Media stays paused: resuming sound and motion is the user's call.
    thaw(s.frozen, false);
    if (s.previousFocus instanceof HTMLElement) s.previousFocus.focus({ preventScroll: true });
  }
}

/** M9 response: dim moving pictures, stop media and animation, until the user restores. */
export class FlashDimmer {
  private state: { host: HTMLElement | null; frozen: Frozen } | null = null;
  hits = 0;

  /** Called when the person presses Restore here, so the other frames of the tab can follow. */
  private readonly onLocalRestore: (() => void) | undefined;

  constructor(onLocalRestore?: () => void) {
    this.onLocalRestore = onLocalRestore;
  }

  get dimmed(): boolean {
    return this.state !== null;
  }

  engage(): void {
    this.hits++;
    if (this.state) return;
    // Freeze first: dimming starts a (0.01 ms) filter transition that must not be paused with the rest.
    const frozen = freezeEverything();
    document.documentElement.setAttribute(FLASH_DIM_ATTR, '');
    let host: HTMLElement | null = null;
    if (window === window.top) {
      const created = createHost();
      host = created.host;
      const panel = document.createElement('div');
      panel.className = 'panel banner';
      panel.setAttribute('role', 'alert');
      const text = document.createElement('span');
      text.textContent = 'Sukoon detected rapid flashing and dimmed moving content.';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Restore';
      button.addEventListener('click', () => {
        this.restore();
        this.onLocalRestore?.();
      });
      panel.append(text, button);
      created.root.append(panel);
    }
    this.state = { host, frozen };
  }

  /** Idempotent: the background repeats it to every frame of the tab. */
  restore(): void {
    const s = this.state;
    if (!s) return;
    this.state = null;
    document.documentElement.removeAttribute(FLASH_DIM_ATTR);
    s.host?.remove();
    thaw(s.frozen, false);
  }
}
