/**
 * Calm digest: short sentences from the same observations as the SLI.
 * Not a new score — a human reading of what Sukoon already measured.
 */
import type { SliObservation } from './sli';

export type DigestId = 'scrollRestored' | 'videosWaiting' | 'parallaxFrozen' | 'siteCalmVersion' | 'slidersStopped';

export interface DigestFact {
  id: DigestId;
  n?: number;
}

export interface DigestInput {
  before: SliObservation;
  after: SliObservation;
  active: boolean;
  siteCalmVersion: boolean;
  videosWaiting: number;
}

export function digestFacts(input: DigestInput): DigestFact[] {
  if (!input.active) return [];
  const facts: DigestFact[] = [];
  if (input.before.scrollHijack && !input.after.scrollHijack) facts.push({ id: 'scrollRestored' });
  const videos = Math.max(input.videosWaiting, Math.max(0, input.before.autoplayingVideos - input.after.autoplayingVideos));
  if (videos > 0) facts.push({ id: 'videosWaiting', n: videos });
  if (input.before.parallaxLayers > 0 && input.after.parallaxLayers === 0) {
    facts.push({ id: 'parallaxFrozen', n: input.before.parallaxLayers });
  }
  const sliders = Math.max(0, input.before.autoAdvancing - input.after.autoAdvancing);
  if (sliders > 0) facts.push({ id: 'slidersStopped', n: sliders });
  if (input.siteCalmVersion) facts.push({ id: 'siteCalmVersion' });
  return facts;
}

export interface DigestCopy {
  scrollRestored: string;
  videosWaiting: (n: number) => string;
  parallaxFrozen: (n: number) => string;
  slidersStopped: (n: number) => string;
  siteCalmVersion: string;
  empty: string;
  heading: string;
}

export function formatDigest(facts: DigestFact[], copy: DigestCopy): string[] {
  return facts.map((fact) => {
    switch (fact.id) {
      case 'scrollRestored':
        return copy.scrollRestored;
      case 'videosWaiting':
        return copy.videosWaiting(fact.n ?? 0);
      case 'parallaxFrozen':
        return copy.parallaxFrozen(fact.n ?? 0);
      case 'slidersStopped':
        return copy.slidersStopped(fact.n ?? 0);
      case 'siteCalmVersion':
        return copy.siteCalmVersion;
    }
  });
}
