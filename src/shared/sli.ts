/**
 * M8 — Sensory Load Index. A guide, not a diagnosis: published weights,
 * and the breakdown is always shown next to the number.
 *
 * Validity is not claimed here; it is tested in the evidence bench, which
 * correlates this index with independently measured motion energy.
 */

export type SignalKey = 'continuous' | 'autoMedia' | 'scrollLinked' | 'autoAdvance' | 'flashRisk';

export const SLI_WEIGHTS: Readonly<Record<SignalKey, number>> = {
  continuous: 25,
  autoMedia: 20,
  scrollLinked: 25,
  autoAdvance: 10,
  flashRisk: 20,
};

export const SIGNAL_LABELS: Readonly<Record<SignalKey, string>> = {
  continuous: 'Continuous motion',
  autoMedia: 'Self-playing media',
  scrollLinked: 'Scroll-linked motion',
  autoAdvance: 'Self-advancing content',
  flashRisk: 'Flash risk',
};

export const SIGNAL_KEYS = Object.keys(SLI_WEIGHTS) as SignalKey[];

/** Raw observations for one moment in time. Areas are fractions of the viewport (0..1). */
export interface SliObservation {
  /** Infinite animations currently running on visible elements. */
  infiniteAnimations: number;
  infiniteAnimationArea: number;
  /** Videos playing without user interaction. */
  autoplayingVideos: number;
  /** Visible animated images (when the browser lets them animate). */
  animatedImages: number;
  autoMediaArea: number;
  /** JS parallax layers seen moving with scroll (and not frozen). */
  parallaxLayers: number;
  /** Scroll-driven animations (CSS animation-timeline or ScrollTimeline). */
  scrollTimelines: number;
  /** A smooth-scroll library is hijacking the wheel. */
  scrollHijack: boolean;
  /** Autoplaying sliders, running <marquee>, running SMIL documents. */
  autoAdvancing: number;
  /** Running animations faster than 3 Hz that change opacity / color / filter. */
  fastFlashAnimations: number;
  /** Flash Guard reported a WCAG 2.3.1 general or red flash failure. */
  flashGuardHit: boolean;
}

export const EMPTY_OBSERVATION: SliObservation = {
  infiniteAnimations: 0,
  infiniteAnimationArea: 0,
  autoplayingVideos: 0,
  animatedImages: 0,
  autoMediaArea: 0,
  parallaxLayers: 0,
  scrollTimelines: 0,
  scrollHijack: false,
  autoAdvancing: 0,
  fastFlashAnimations: 0,
  flashGuardHit: false,
};

/** Each signal is normalised to 0..1 before weighting. */
export function signalLevels(o: SliObservation): Record<SignalKey, number> {
  // A quarter of the viewport in constant motion saturates the area term.
  const byArea = (area: number) => area / 0.25;
  return {
    continuous: clamp01(Math.max(byArea(o.infiniteAnimationArea), o.infiniteAnimations / 10)),
    autoMedia: clamp01(
      Math.max(byArea(o.autoMediaArea), o.autoplayingVideos * 0.5 + o.animatedImages * 0.2),
    ),
    scrollLinked: clamp01(
      (o.scrollHijack ? 0.5 : 0) + o.parallaxLayers * 0.15 + o.scrollTimelines * 0.1,
    ),
    autoAdvance: clamp01(o.autoAdvancing / 3),
    flashRisk: o.flashGuardHit ? 1 : clamp01(o.fastFlashAnimations * 0.5),
  };
}

export interface SliResult {
  score: number;
  breakdown: Record<SignalKey, number>;
}

export function computeSli(o: SliObservation): SliResult {
  const levels = signalLevels(o);
  const breakdown = {} as Record<SignalKey, number>;
  let score = 0;
  for (const key of SIGNAL_KEYS) {
    const points = round1(levels[key] * SLI_WEIGHTS[key]);
    breakdown[key] = points;
    score += points;
  }
  return { score: Math.round(score), breakdown };
}

/** What the popup receives: the page as authored vs. the page with Sukoon. */
export interface SliReport {
  before: SliResult;
  after: SliResult;
  beforeObservation: SliObservation;
  afterObservation: SliObservation;
  active: boolean;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
