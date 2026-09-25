/**
 * M4 (DOM side) — motion that the calm stylesheet cannot reach:
 * Web Animations API, SVG SMIL, <marquee>, AOS reveal classes, `autoplay`.
 * JS-object adapters (GSAP, Swiper…) live in the MAIN world.
 *
 * Everything is recorded so it can be undone when the user pauses Sukoon.
 */
import type { Features } from '../shared/settings';

export const isCssDriven = (a: Animation) =>
  (typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation) ||
  (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition);

export const isScrollLinked = (a: Animation) =>
  a.timeline !== null && !(a.timeline instanceof DocumentTimeline);

export class DomAdapters {
  private readonly pausedAnimations = new Set<Animation>();
  private readonly pausedSvgs = new Set<SVGSVGElement>();
  private readonly stoppedMarquees = new Set<HTMLElement>();
  readonly autoplayStripped = new WeakSet<HTMLMediaElement>();

  run(features: Features): void {
    if (features.adapters || features.scrollGuard) this.animations(features);
    if (features.adapters) {
      this.smil();
      this.marquees();
      for (const el of document.querySelectorAll('[data-aos]:not(.aos-animate)')) el.classList.add('aos-animate');
    }
    if (features.mediaGuard) this.stripAutoplay();
  }

  private animations(features: Features): void {
    for (const anim of document.getAnimations()) {
      // CSS animations and transitions are already finished by the calm stylesheet.
      if (isCssDriven(anim) || anim.playState !== 'running') continue;
      try {
        if (isScrollLinked(anim)) {
          if (!features.scrollGuard) continue;
          anim.timeline = document.timeline;
        } else if (!features.adapters) {
          continue;
        }
        const timing = anim.effect?.getComputedTiming();
        if (timing?.iterations === Infinity) {
          // Loops go back to their first frame and stop.
          anim.pause();
          anim.currentTime = 0;
          this.pausedAnimations.add(anim);
        } else {
          // Finite motion jumps to its end state ("finish, don't cancel").
          anim.finish();
        }
      } catch {
        /* some animations refuse finish(); leave them */
      }
    }
  }

  private smil(): void {
    for (const svg of document.querySelectorAll('svg')) {
      if (svg.ownerSVGElement || svg.animationsPaused()) continue;
      if (!svg.querySelector('animate, animateTransform, animateMotion, set')) continue;
      svg.pauseAnimations();
      this.pausedSvgs.add(svg);
    }
  }

  private marquees(): void {
    for (const el of document.querySelectorAll<HTMLElement & { stop?: () => void }>('marquee')) {
      if (this.stoppedMarquees.has(el)) continue;
      el.stop?.();
      this.stoppedMarquees.add(el);
    }
  }

  private stripAutoplay(): void {
    for (const video of document.querySelectorAll<HTMLVideoElement>('video[autoplay]')) {
      video.removeAttribute('autoplay');
      video.autoplay = false;
      this.autoplayStripped.add(video);
      if (!video.paused && !navigator.userActivation?.isActive) video.pause();
    }
  }

  counts() {
    return {
      smilRunning: [...document.querySelectorAll('svg')].filter(
        (s) => !s.ownerSVGElement && !s.animationsPaused() && s.querySelector('animate, animateTransform, animateMotion, set'),
      ).length,
      smilTotal: [...document.querySelectorAll('svg')].filter(
        (s) => !s.ownerSVGElement && s.querySelector('animate, animateTransform, animateMotion, set'),
      ).length,
      marqueesRunning: document.querySelectorAll('marquee').length - [...this.stoppedMarquees].filter((m) => m.isConnected).length,
      marqueesTotal: document.querySelectorAll('marquee').length,
      pausedLoops: [...this.pausedAnimations],
    };
  }

  undo(): void {
    for (const anim of this.pausedAnimations) {
      try {
        anim.play();
      } catch {
        /* removed */
      }
    }
    this.pausedAnimations.clear();
    for (const svg of this.pausedSvgs) svg.unpauseAnimations();
    this.pausedSvgs.clear();
    for (const el of this.stoppedMarquees) (el as HTMLElement & { start?: () => void }).start?.();
    this.stoppedMarquees.clear();
  }
}
