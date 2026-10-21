import { describe, expect, it } from 'vitest';
import { digestFacts, formatDigest } from '../src/shared/digest';
import { pageStrings } from '../src/shared/page-strings';
import { EMPTY_OBSERVATION } from '../src/shared/sli';

const before = {
  ...EMPTY_OBSERVATION,
  scrollHijack: true,
  autoplayingVideos: 2,
  parallaxLayers: 3,
  autoAdvancing: 2,
};

const after = {
  ...EMPTY_OBSERVATION,
  scrollHijack: false,
  autoplayingVideos: 0,
  parallaxLayers: 0,
  autoAdvancing: 0,
};

const input = {
  before,
  after,
  active: true,
  siteCalmVersion: true,
  videosWaiting: 2,
};

describe('calm digest', () => {
  it('is empty when Sukoon is not active', () => {
    expect(digestFacts({ ...input, active: false })).toEqual([]);
  });

  it('builds the expected facts from a fixed observation', () => {
    expect(digestFacts(input)).toEqual([
      { id: 'scrollRestored' },
      { id: 'videosWaiting', n: 2 },
      { id: 'parallaxFrozen', n: 3 },
      { id: 'slidersStopped', n: 2 },
      { id: 'siteCalmVersion' },
    ]);
  });

  it('formats the same facts in English and Arabic', () => {
    const facts = digestFacts(input);
    expect(formatDigest(facts, pageStrings('en').digest)).toEqual([
      'Your device is scrolling this page again.',
      '2 videos are waiting for play.',
      '3 parallax layers are held still.',
      '2 self-advancing items are parked.',
      'This site opened its own reduced-motion version.',
    ]);
    expect(formatDigest(facts, pageStrings('ar').digest)).toEqual([
      'عاد التمرير إلى جهازك.',
      '2 فيديوهات تنتظر زر التشغيل.',
      '3 طبقات بارالاكس ثابتة.',
      '2 عناصر كانت تتقدم وحدها وتوقفت.',
      'الموقع فتح نسخته الهادئة.',
    ]);
  });
});
