/**
 * Extension messaging (runtime / tabs) and the MAIN ⇄ isolated bridge.
 */
import type { FlashFrameResult } from './flash';
import type { SliReport } from './sli';

// ── Extension messages ─────────────────────────────────────────────────────

export type ToBackground =
  | { type: 'fetch-css'; url: string }
  | { type: 'panic'; tabId?: number }
  /** The top frame released itself (Escape, the Release button); the background tells the other frames. */
  | { type: 'panic-state'; frozen: boolean }
  /** The top frame's Restore button: every frame of the tab lifts the Flash Guard dim. */
  | { type: 'flash-restore' }
  | { type: 'flash-guard:start'; tabId: number }
  | { type: 'flash-guard:stop' }
  | { type: 'flash-guard:status' }
  /** Offscreen → background. `tabId` lets a service worker that was suspended meanwhile rebuild its state. */
  | { type: 'flash-guard:sample'; tabId: number; sample: FlashSample }
  | { type: 'flash-guard:heartbeat'; tabId: number; t: number }
  | { type: 'flash-guard:ended' };

export type ToContent =
  | { type: 'settings-changed' }
  /** Freeze or release this frame. The background decides the state for the whole tab; the top frame shows the overlay. */
  | { type: 'panic'; frozen: boolean; screenshot: string | null }
  /** Is this frame frozen? Asked of the top frame only. */
  | { type: 'panic-query' }
  | { type: 'get-sli' }
  | { type: 'flash-detected' }
  | { type: 'flash-restore' }
  | { type: 'ping' };

export type ToOffscreen =
  | { type: 'offscreen:start'; streamId: string; tabId: number }
  | { type: 'offscreen:stop' };

export interface FlashSample extends FlashFrameResult {
  t: number;
}

export interface FlashGuardStatus {
  running: boolean;
  tabId: number | null;
  samples: FlashSample[];
  hits: number;
  error?: string;
}

export interface CssFetchResult {
  ok: boolean;
  text?: string;
}

export type SliResponse = SliReport | null;

// ── MAIN ⇄ isolated bridge (CustomEvent on window, JSON strings only) ──────
// Objects do not cross worlds reliably, so every payload is a JSON string.

export const BRIDGE = {
  /** isolated → MAIN: PageConfig */
  config: 'sukoon:config',
  /** isolated → MAIN: text of extracted reduced-motion rules for the document */
  prmCss: 'sukoon:prm-css',
  /** isolated → MAIN: freeze / release everything (panic) */
  panic: 'sukoon:panic',
  /** isolated → MAIN: request page-world observations for the SLI */
  query: 'sukoon:query',
  /** MAIN → isolated: answer to `query` (dispatched synchronously) */
  answer: 'sukoon:answer',
  /** isolated → MAIN: run JS-library adapters now */
  adapt: 'sukoon:adapt',
} as const;

/** Observations that only the page world can make (library objects, patched APIs). */
export interface MainWorldObservation {
  /** Endless loops driven by JS libraries (GSAP repeat: -1, Lottie), total and still running. */
  scriptedLoops: number;
  scriptedLoopsRunning: number;
  scrollHijack: boolean;
  wheelGuardEngaged: boolean;
  autoplayingSliders: number;
  blockedPlays: number;
}

export function emit(name: string, payload?: unknown): void {
  window.dispatchEvent(
    new CustomEvent(name, { detail: payload === undefined ? null : JSON.stringify(payload) }),
  );
}

export function parseDetail<T>(event: Event): T | null {
  const detail = (event as CustomEvent<unknown>).detail;
  if (typeof detail !== 'string') return null;
  try {
    return JSON.parse(detail) as T;
  } catch {
    return null;
  }
}
