/**
 * Settings model shared by every context (background, content scripts, UI).
 * Pure module: no browser APIs here, so it is unit-testable.
 */

export type Mode = 'vestibular' | 'photosensitive' | 'focus';

export type ImageAnimation = 'none' | 'once' | 'allowed';

export type Locale = 'en' | 'ar';

export type PageChip = 'briefly' | 'on' | 'off';

export const LOCALES: readonly Locale[] = ['en', 'ar'];

export const PAGE_CHIPS: readonly PageChip[] = ['briefly', 'on', 'off'];

/** Every independently switchable protection. Numbers refer to the plan's modules. */
export interface Features {
  /** M1 — calm stylesheet injected before first paint. */
  calmCss: boolean;
  /** M2 — rewrite `prefers-reduced-motion` so sites show their own calm version. */
  reducedMotionSwitch: boolean;
  /** M3 — shadow roots and frames. */
  deepCoverage: boolean;
  /** M4 — WAAPI / SMIL / marquee / slider / GSAP / Lottie / AOS adapters. */
  adapters: boolean;
  /** M5 — smooth scrolling, scroll functions and wheel-hijack guard. */
  scrollGuard: boolean;
  /** M5.4 — freeze JS parallax layers. */
  parallaxFreeze: boolean;
  /** M6 — block video autoplay without a user gesture. */
  mediaGuard: boolean;
  /** Photosensitive extra — lower harsh contrast in video and canvas. */
  softenVideo: boolean;
}

export type FeatureKey = keyof Features;

export interface Settings {
  enabled: boolean;
  mode: Mode;
  /** Per-feature overrides on top of the mode preset. */
  overrides: Partial<Features>;
  /** Browser-wide policy for animated images (GIF / APNG / WebP). */
  imageAnimation: ImageAnimation;
  /** Hostnames where Sukoon is switched off. */
  excludedHosts: string[];
  onboarded: boolean;
  /** UI language. English is the default; Arabic is an explicit choice. */
  locale: Locale;
  /** On-page calm digest chip. */
  pageChip: PageChip;
}

export const MODES: readonly Mode[] = ['vestibular', 'photosensitive', 'focus'];

const OFF: Features = {
  calmCss: false,
  reducedMotionSwitch: false,
  deepCoverage: false,
  adapters: false,
  scrollGuard: false,
  parallaxFreeze: false,
  mediaGuard: false,
  softenVideo: false,
};

/** Mode presets (plan §6). Deep coverage is on everywhere: it is just M1 reaching shadow roots. */
export const MODE_PRESETS: Readonly<Record<Mode, Features>> = {
  vestibular: {
    ...OFF,
    calmCss: true,
    reducedMotionSwitch: true,
    deepCoverage: true,
    adapters: true,
    scrollGuard: true,
    parallaxFreeze: true,
    mediaGuard: true,
  },
  photosensitive: {
    ...OFF,
    calmCss: true,
    reducedMotionSwitch: true,
    deepCoverage: true,
    mediaGuard: true,
    softenVideo: true,
  },
  focus: {
    ...OFF,
    calmCss: true,
    reducedMotionSwitch: true,
    deepCoverage: true,
    adapters: true,
    mediaGuard: true,
  },
};

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  mode: 'vestibular',
  overrides: {},
  imageAnimation: 'none',
  excludedHosts: [],
  onboarded: false,
  locale: 'en',
  pageChip: 'briefly',
};

export const SETTINGS_KEY = 'sukoon:settings';

export function resolveFeatures(settings: Settings): Features {
  return { ...MODE_PRESETS[settings.mode], ...settings.overrides };
}

/** Fill any missing fields (older stored versions, partial writes). */
export function normalizeSettings(value: unknown): Settings {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Partial<Settings>;
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : DEFAULT_SETTINGS.enabled,
    mode: MODES.includes(v.mode as Mode) ? (v.mode as Mode) : DEFAULT_SETTINGS.mode,
    overrides: normalizeOverrides(v.overrides),
    imageAnimation: (['none', 'once', 'allowed'] as const).includes(v.imageAnimation as ImageAnimation)
      ? (v.imageAnimation as ImageAnimation)
      : DEFAULT_SETTINGS.imageAnimation,
    excludedHosts: Array.isArray(v.excludedHosts)
      ? [...new Set(v.excludedHosts.filter((h): h is string => typeof h === 'string' && h.length > 0))]
      : [],
    onboarded: v.onboarded === true,
    locale: LOCALES.includes(v.locale as Locale) ? (v.locale as Locale) : DEFAULT_SETTINGS.locale,
    pageChip: PAGE_CHIPS.includes(v.pageChip as PageChip) ? (v.pageChip as PageChip) : DEFAULT_SETTINGS.pageChip,
  };
}

/** Imported or older settings must never replace a feature flag with a non-boolean. */
function normalizeOverrides(value: unknown): Partial<Features> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const overrides: Partial<Features> = {};
  for (const key of Object.keys(OFF) as FeatureKey[]) {
    if (Object.hasOwn(value, key)) {
      const flag = (value as Record<string, unknown>)[key];
      if (typeof flag === 'boolean') overrides[key] = flag;
    }
  }
  return overrides;
}

export function isHostExcluded(settings: Settings, host: string): boolean {
  return settings.excludedHosts.includes(host);
}

/** Match patterns used as `excludeMatches` for the registered content scripts. */
export function excludeMatchesFor(hosts: readonly string[]): string[] {
  return hosts.filter(isValidHost).map((h) => `*://${h}/*`);
}

function isValidHost(host: string): boolean {
  // Hostnames and IPv4 only; match patterns reject ports and paths.
  return /^[a-z0-9.-]+$/i.test(host) && !host.startsWith('.') && !host.endsWith('.');
}

/** What the page scripts need to know. Sent from the isolated world to the MAIN world. */
export interface PageConfig {
  active: boolean;
  features: Features;
  locale: Locale;
  pageChip: PageChip;
}

export function pageConfigFor(settings: Settings, host: string): PageConfig {
  return {
    active: settings.enabled && !isHostExcluded(settings, host),
    features: resolveFeatures(settings),
    locale: settings.locale,
    pageChip: settings.pageChip,
  };
}

export interface OnboardingAnswers {
  trigger: 'motion' | 'flashes' | 'distraction';
  photosensitive: boolean;
}

/** Welcome screen: two questions → suggested mode. */
export function suggestMode(answers: OnboardingAnswers): Mode {
  if (answers.photosensitive || answers.trigger === 'flashes') return 'photosensitive';
  if (answers.trigger === 'distraction') return 'focus';
  return 'vestibular';
}
