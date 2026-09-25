import type { FeatureKey, ImageAnimation, Mode } from '../shared/settings';

export const MODE_COPY: Record<Mode, { title: string; who: string }> = {
  vestibular: {
    title: 'Vestibular',
    who: 'Dizziness or nausea from motion, parallax and smooth scrolling.',
  },
  photosensitive: {
    title: 'Photosensitive',
    who: 'Photosensitive epilepsy, migraine, sensitivity to flicker.',
  },
  focus: {
    title: 'Focus',
    who: 'ADHD, autism, or anyone distracted by constant movement.',
  },
};

export const FEATURE_COPY: Record<FeatureKey, { title: string; detail: string }> = {
  calmCss: {
    title: 'Calm layer',
    detail: 'CSS animations and transitions jump straight to their final state.',
  },
  reducedMotionSwitch: {
    title: 'Reduced-motion switch',
    detail: "Turns on the calm version many sites already built for 'reduce motion'.",
  },
  deepCoverage: {
    title: 'Deep coverage',
    detail: 'Applies the calm layer inside web components and embedded frames.',
  },
  adapters: {
    title: 'Library adapters',
    detail: 'Stops scripted animation, sliders, marquees, SVG and Lottie loops.',
  },
  scrollGuard: {
    title: 'Scroll guard',
    detail: 'Removes smooth-scroll hijacking and restores your device’s own scrolling.',
  },
  parallaxFreeze: {
    title: 'Parallax freeze',
    detail: 'Holds layers that move at a different speed while you scroll.',
  },
  mediaGuard: {
    title: 'Media guard',
    detail: 'Videos only play after you press play.',
  },
  softenVideo: {
    title: 'Soften video contrast',
    detail: 'Lowers harsh contrast and saturation in video and canvas.',
  },
};

export const IMAGE_COPY: Record<ImageAnimation, string> = {
  none: 'Never animate (show the first frame)',
  once: 'Play once, then stop',
  allowed: 'Allow animation',
};

export const DISCLAIMER =
  'Sukoon reduces exposure to common motion and flash triggers. It is not a medical device and cannot guarantee protection from seizures or symptoms.';
