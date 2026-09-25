import { describe, expect, it } from 'vitest';
import { computeSli, EMPTY_OBSERVATION, SIGNAL_KEYS, SLI_WEIGHTS } from '../src/shared/sli';

describe('Sensory Load Index', () => {
  it('weights add up to 100', () => {
    expect(SIGNAL_KEYS.reduce((sum, k) => sum + SLI_WEIGHTS[k], 0)).toBe(100);
  });

  it('is 0 for a still page', () => {
    expect(computeSli(EMPTY_OBSERVATION).score).toBe(0);
  });

  it('is 100 when every signal saturates', () => {
    const r = computeSli({
      infiniteAnimations: 20,
      infiniteAnimationArea: 1,
      autoplayingVideos: 3,
      animatedImages: 5,
      autoMediaArea: 1,
      parallaxLayers: 10,
      scrollTimelines: 10,
      scrollHijack: true,
      autoAdvancing: 5,
      fastFlashAnimations: 4,
      flashGuardHit: true,
    });
    expect(r.score).toBe(100);
    expect(r.breakdown).toEqual(SLI_WEIGHTS);
  });

  it('scores continuous motion by area: a quarter of the viewport saturates', () => {
    expect(computeSli({ ...EMPTY_OBSERVATION, infiniteAnimations: 1, infiniteAnimationArea: 0.125 }).breakdown.continuous).toBe(12.5);
    expect(computeSli({ ...EMPTY_OBSERVATION, infiniteAnimations: 1, infiniteAnimationArea: 0.5 }).breakdown.continuous).toBe(25);
  });

  it('counts a scroll hijack as half of the scroll-linked signal', () => {
    expect(computeSli({ ...EMPTY_OBSERVATION, scrollHijack: true }).breakdown.scrollLinked).toBe(12.5);
  });

  it('treats a Flash Guard hit as the full flash signal', () => {
    expect(computeSli({ ...EMPTY_OBSERVATION, flashGuardHit: true }).breakdown.flashRisk).toBe(20);
    expect(computeSli({ ...EMPTY_OBSERVATION, fastFlashAnimations: 1 }).breakdown.flashRisk).toBe(10);
  });

  it('ignores garbage numbers', () => {
    expect(computeSli({ ...EMPTY_OBSERVATION, infiniteAnimationArea: Number.NaN, autoAdvancing: -3 }).score).toBe(0);
  });
});
