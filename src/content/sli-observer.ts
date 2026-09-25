/**
 * M8 — collect the raw observations behind the Sensory Load Index, for the page
 * as authored ("before") and the page as the user sees it now ("after").
 */
import { PAUSED_ATTR } from '../shared/calm-css';
import type { MainWorldObservation } from '../shared/messages';
import { computeSli, type SliObservation, type SliReport } from '../shared/sli';
import { isCssDriven, isScrollLinked } from './dom-adapters';

const FLASHY_PROPS = new Set(['opacity', 'color', 'backgroundColor', 'background', 'filter', 'visibility', 'fill', 'borderColor']);
const FLASH_PERIOD_MS = 1000 / 3;

export interface SliInputs {
  active: boolean;
  main: MainWorldObservation | null;
  pausedLoops: Animation[];
  parallaxDetected: number;
  parallaxFrozen: boolean;
  scrollGuard: boolean;
  adapters: boolean;
  mediaGuard: boolean;
  smilRunning: number;
  smilTotal: number;
  marqueesRunning: number;
  marqueesTotal: number;
  gifsFrozen: boolean;
  selfStartedVideos: Set<HTMLVideoElement>;
  userStartedVideos: WeakSet<HTMLMediaElement>;
  flashHit: boolean;
  flashDimmed: boolean;
}

interface AnimationStats {
  infinite: number;
  infiniteArea: number;
  scrollTimelines: number;
  fastFlash: number;
}

export function visibleFraction(el: Element | null | undefined): number {
  if (!el?.isConnected) return 0;
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth || 1;
  const vh = window.innerHeight || 1;
  const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
  const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  return (w * h) / (vw * vh);
}

function targetOf(anim: Animation): Element | null {
  const effect = anim.effect;
  return effect instanceof KeyframeEffect ? effect.target : null;
}

function isFlashy(anim: Animation): boolean {
  const effect = anim.effect;
  if (!(effect instanceof KeyframeEffect)) return false;
  const timing = effect.getComputedTiming();
  const duration = typeof timing.duration === 'number' ? timing.duration : 0;
  if (duration <= 0 || duration >= FLASH_PERIOD_MS || (timing.iterations ?? 1) <= 1) return false;
  try {
    return effect.getKeyframes().some((k) => Object.keys(k).some((p) => FLASHY_PROPS.has(p)));
  } catch {
    return false;
  }
}

function animationStats(anims: Iterable<Animation>, extraLoops: Animation[] = []): AnimationStats {
  const stats: AnimationStats = { infinite: 0, infiniteArea: 0, scrollTimelines: 0, fastFlash: 0 };
  const seen = new Set<Element>();
  const consider = (anim: Animation, running: boolean) => {
    if (!running) return;
    if (isScrollLinked(anim)) {
      stats.scrollTimelines++;
      return;
    }
    const timing = anim.effect?.getComputedTiming();
    if (timing?.iterations !== Infinity) return;
    const target = targetOf(anim);
    const area = visibleFraction(target);
    if (area <= 0) return;
    stats.infinite++;
    if (target && !seen.has(target)) {
      seen.add(target);
      stats.infiniteArea += area;
    }
    if (isFlashy(anim)) stats.fastFlash++;
  };
  for (const anim of anims) consider(anim, anim.playState === 'running');
  for (const anim of extraLoops) consider(anim, true);
  stats.infiniteArea = Math.min(1, stats.infiniteArea);
  return stats;
}

/** Animations as the site authored them: lift the calm layer for one synchronous task (no paint happens). */
function authoredAnimationStats(pausedLoops: Animation[]): AnimationStats {
  const root = document.documentElement;
  const wasPaused = root.hasAttribute(PAUSED_ATTR);
  if (!wasPaused) root.setAttribute(PAUSED_ATTR, '');
  try {
    return animationStats(document.getAnimations(), pausedLoops);
  } finally {
    if (!wasPaused) root.removeAttribute(PAUSED_ATTR);
  }
}

function isGif(img: HTMLImageElement): boolean {
  return /\.gif($|[?#])/i.test(img.currentSrc || img.src);
}

export function measureSli(i: SliInputs): SliReport {
  const now = animationStats(document.getAnimations());
  const authored = i.active ? authoredAnimationStats(i.pausedLoops) : now;

  const videos = [...document.querySelectorAll('video')];
  const playingSelf = videos.filter(
    (v) => !v.paused && !v.ended && !i.userStartedVideos.has(v) && visibleFraction(v) > 0,
  );
  const everSelf = videos.filter(
    (v) => (i.selfStartedVideos.has(v) || (!v.paused && !i.userStartedVideos.has(v))) && visibleFraction(v) > 0,
  );
  const gifs = [...document.images].filter((img) => isGif(img) && visibleFraction(img) > 0);
  const area = (els: Element[]) => Math.min(1, els.reduce((sum, el) => sum + visibleFraction(el), 0));

  const sliders = i.main?.autoplayingSliders ?? 0;
  const hijack = i.main?.scrollHijack ?? false;

  const scripted = i.main?.scriptedLoops ?? 0;
  const scriptedRunning = i.main?.scriptedLoopsRunning ?? 0;

  const before: SliObservation = {
    // Scripted loops have no reliable box, so they only add to the count term.
    infiniteAnimations: authored.infinite + scripted,
    infiniteAnimationArea: authored.infiniteArea,
    autoplayingVideos: everSelf.length,
    animatedImages: gifs.length,
    autoMediaArea: area([...everSelf, ...gifs]),
    parallaxLayers: i.parallaxDetected,
    scrollTimelines: authored.scrollTimelines,
    scrollHijack: hijack,
    autoAdvancing: i.smilTotal + i.marqueesTotal + sliders,
    fastFlashAnimations: authored.fastFlash,
    flashGuardHit: i.flashHit,
  };

  const after: SliObservation = i.active
    ? {
        infiniteAnimations: now.infinite + scriptedRunning,
        infiniteAnimationArea: now.infiniteArea,
        autoplayingVideos: playingSelf.length,
        animatedImages: i.gifsFrozen ? 0 : gifs.length,
        autoMediaArea: area([...playingSelf, ...(i.gifsFrozen ? [] : gifs)]),
        parallaxLayers: i.parallaxFrozen ? 0 : i.parallaxDetected,
        scrollTimelines: now.scrollTimelines,
        // The wheel guard engages on the first wheel event whenever a hijacker is present.
        scrollHijack: hijack && !i.scrollGuard,
        autoAdvancing: i.smilRunning + i.marqueesRunning + (i.adapters ? 0 : sliders),
        fastFlashAnimations: now.fastFlash,
        flashGuardHit: i.flashHit && !i.flashDimmed,
      }
    : before;

  return {
    before: computeSli(before),
    after: computeSli(after),
    beforeObservation: before,
    afterObservation: after,
    active: i.active,
  };
}
