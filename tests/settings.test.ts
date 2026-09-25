import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  excludeMatchesFor,
  MODE_PRESETS,
  normalizeSettings,
  pageConfigFor,
  resolveFeatures,
  suggestMode,
} from '../src/shared/settings';

describe('settings', () => {
  it('fills defaults for missing or broken values', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ mode: 'party', imageAnimation: 'sometimes', excludedHosts: ['a.com', 3, 'a.com'] })).toEqual({
      ...DEFAULT_SETTINGS,
      excludedHosts: ['a.com'],
    });
  });

  it('applies overrides on top of the mode preset', () => {
    const s = { ...DEFAULT_SETTINGS, mode: 'focus' as const, overrides: { scrollGuard: true } };
    expect(resolveFeatures(s)).toEqual({ ...MODE_PRESETS.focus, scrollGuard: true });
  });

  it('follows the plan’s mode table', () => {
    expect(MODE_PRESETS.vestibular.parallaxFreeze).toBe(true);
    expect(MODE_PRESETS.photosensitive.softenVideo).toBe(true);
    expect(MODE_PRESETS.photosensitive.scrollGuard).toBe(false);
    expect(MODE_PRESETS.focus.adapters).toBe(true);
    expect(MODE_PRESETS.focus.scrollGuard).toBe(false);
  });

  it('is inactive on excluded sites and when switched off', () => {
    const s = { ...DEFAULT_SETTINGS, excludedHosts: ['news.example'] };
    expect(pageConfigFor(s, 'news.example').active).toBe(false);
    expect(pageConfigFor(s, 'other.example').active).toBe(true);
    expect(pageConfigFor({ ...s, enabled: false }, 'other.example').active).toBe(false);
  });

  it('builds valid exclude match patterns and drops junk', () => {
    expect(excludeMatchesFor(['example.com', '127.0.0.1', 'bad host', '.x', 'a.com:8080'])).toEqual([
      '*://example.com/*',
      '*://127.0.0.1/*',
    ]);
  });

  it('suggests a mode from the two welcome questions', () => {
    expect(suggestMode({ trigger: 'motion', photosensitive: false })).toBe('vestibular');
    expect(suggestMode({ trigger: 'distraction', photosensitive: false })).toBe('focus');
    expect(suggestMode({ trigger: 'motion', photosensitive: true })).toBe('photosensitive');
    expect(suggestMode({ trigger: 'flashes', photosensitive: false })).toBe('photosensitive');
  });
});
