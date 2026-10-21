import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { normalizeSettings, SETTINGS_KEY, type Locale, type Settings } from '../shared/settings';
import { dirOf } from './copy';

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(stored[SETTINGS_KEY]);
}

export async function saveSettings(patch: (s: Settings) => Settings): Promise<Settings> {
  const next = normalizeSettings(patch(await loadSettings()));
  await browser.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/** Live settings: re-renders when any context changes them. */
export function useSettings(): [Settings | null, (patch: (s: Settings) => Settings) => Promise<void>] {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      const change = changes[SETTINGS_KEY];
      if (area === 'local' && change) setSettings(normalizeSettings(change.newValue));
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);

  const update = useCallback(async (patch: (s: Settings) => Settings) => {
    setSettings(await saveSettings(patch));
  }, []);

  return [settings, update];
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function applyDocumentLocale(locale: Locale, title?: string): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = dirOf(locale);
  if (title) document.title = title;
}

/** Keeps html lang/dir in sync with the stored locale. */
export function useDocumentLocale(locale: Locale | undefined, title?: string): void {
  useEffect(() => {
    if (locale) applyDocumentLocale(locale, title);
  }, [locale, title]);
}
