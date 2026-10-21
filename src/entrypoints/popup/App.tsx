import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { digestFacts, formatDigest } from '../../shared/digest';
import type { FlashGuardStatus, SliResponse, ToBackground, ToContent } from '../../shared/messages';
import { isHostExcluded, resolveFeatures, type Locale } from '../../shared/settings';
import { Card, DigestList, FlashChart, LanguagePicker, ModePicker, SliTable, Switch } from '../../ui/components';
import { uiCopy } from '../../ui/copy';
import { useDocumentLocale, useSettings } from '../../ui/hooks';

interface ActiveTab {
  id: number;
  host: string | null;
}

const HAS_FLASH_GUARD = import.meta.env.BROWSER !== 'firefox';

export function App() {
  const [settings, update] = useSettings();
  const [tab, setTab] = useState<ActiveTab | null>(null);
  const [sli, setSli] = useState<SliResponse | 'unavailable'>(null);
  const [flash, setFlash] = useState<FlashGuardStatus | null>(null);
  const [panicMessage, setPanicMessage] = useState('');
  const [sliOpen, setSliOpen] = useState(false);

  const locale = settings?.locale ?? 'en';
  const copy = uiCopy(locale);
  useDocumentLocale(settings?.locale, copy.brand);

  useEffect(() => {
    const forcedTab = Number(new URLSearchParams(location.search).get('tab'));
    const activeTab = forcedTab > 0 ? browser.tabs.get(forcedTab).then((t) => [t]) : browser.tabs.query({ active: true, currentWindow: true });
    void activeTab.then(([t]) => {
      if (t?.id === undefined) return;
      let host: string | null = null;
      try {
        const url = new URL(t.url ?? '');
        if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'file:') host = url.hostname;
      } catch {
        host = null;
      }
      setTab({ id: t.id, host });
    });
  }, []);

  const measure = useCallback(async () => {
    if (!tab) return;
    if (!tab.host) {
      setSli('unavailable');
      return;
    }
    try {
      const report = (await browser.tabs.sendMessage(tab.id, { type: 'get-sli' } satisfies ToContent, {
        frameId: 0,
      })) as SliResponse;
      setSli(report ?? 'unavailable');
    } catch {
      setSli('unavailable');
    }
  }, [tab]);

  useEffect(() => {
    const timer = setTimeout(() => void measure(), settings ? 350 : 0);
    return () => clearTimeout(timer);
  }, [measure, settings]);

  const refreshFlash = useCallback(async () => {
    if (!HAS_FLASH_GUARD) return;
    setFlash((await browser.runtime.sendMessage({ type: 'flash-guard:status' } satisfies ToBackground)) as FlashGuardStatus);
  }, []);

  useEffect(() => {
    void refreshFlash();
    const timer = setInterval(() => void refreshFlash(), 500);
    return () => clearInterval(timer);
  }, [refreshFlash]);

  if (!settings) return <main className="w-[360px] p-4">{copy.popup.loading}</main>;

  const excluded = tab?.host ? isHostExcluded(settings, tab.host) : false;
  const status = !settings.enabled ? copy.popup.statusOff : excluded ? copy.popup.statusExcluded : copy.popup.statusOn;

  const digestLines =
    sli && sli !== 'unavailable'
      ? formatDigest(
          digestFacts({
            before: sli.beforeObservation,
            after: sli.afterObservation,
            active: sli.active,
            siteCalmVersion: sli.active && resolveFeatures(settings).reducedMotionSwitch,
            videosWaiting: Math.max(0, sli.beforeObservation.autoplayingVideos - sli.afterObservation.autoplayingVideos),
          }),
          copy.digest,
        )
      : [];

  const toggleSite = (on: boolean) => {
    const host = tab?.host;
    if (!host) return;
    void update((s) => ({
      ...s,
      excludedHosts: on ? s.excludedHosts.filter((h) => h !== host) : [...s.excludedHosts, host],
    }));
  };

  const panic = async () => {
    if (!tab) return;
    try {
      const result: unknown = await browser.runtime.sendMessage({ type: 'panic', tabId: tab.id } satisfies ToBackground);
      if (result === true) {
        setPanicMessage(copy.popup.frozen);
        window.close();
      } else if (result === false) {
        setPanicMessage(copy.popup.released);
      } else {
        setPanicMessage(copy.popup.cannotFreeze);
      }
    } catch {
      setPanicMessage(copy.popup.cannotFreeze);
    }
  };

  const toggleFlashGuard = async () => {
    if (!tab) return;
    const message: ToBackground = flash?.running ? { type: 'flash-guard:stop' } : { type: 'flash-guard:start', tabId: tab.id };
    setFlash((await browser.runtime.sendMessage(message)) as FlashGuardStatus);
  };

  const setLocale = (next: Locale) => void update((s) => ({ ...s, locale: next }));

  return (
    <main className="grid w-[360px] gap-3 p-4">
      <header>
        <h1 className="text-xl font-bold">{copy.brand}</h1>
        <p className="mt-1 text-sm font-semibold">{status}</p>
        {tab?.host && <p className="font-mono text-xs text-ink-soft">{tab.host}</p>}
        <Switch
          label={copy.popup.onLabel}
          description={settings.enabled ? copy.popup.onDescription : copy.popup.offDescription}
          checked={settings.enabled}
          onChange={(enabled) => void update((s) => ({ ...s, enabled }))}
        />
      </header>

      {tab?.host ? (
        <Switch
          label={copy.popup.calmHost(tab.host)}
          description={excluded ? copy.popup.excluded : copy.popup.excludeHint}
          checked={!excluded}
          disabled={!settings.enabled}
          onChange={toggleSite}
        />
      ) : (
        <p className="text-sm text-ink-soft">{copy.popup.cannotChangePage}</p>
      )}

      {sli && sli !== 'unavailable' && sli.active && (
        <Card title={copy.digest.heading} titleId="digest-title">
          <DigestList lines={digestLines.length ? digestLines : [copy.digest.empty]} heading="" />
        </Card>
      )}

      <ModePicker compact value={settings.mode} copy={copy} onChange={(mode) => void update((s) => ({ ...s, mode }))} />

      <Card title={copy.popup.sensoryTitle} titleId="sli-title">
        {sli === null && <p className="text-sm">{copy.popup.measuring}</p>}
        {sli === 'unavailable' && <p className="text-sm text-ink-soft">{copy.popup.unavailable}</p>}
        {sli && sli !== 'unavailable' && (
          <>
            <button
              type="button"
              className="mb-2 text-sm font-semibold text-accent underline underline-offset-2"
              aria-expanded={sliOpen}
              onClick={() => setSliOpen((open) => !open)}
            >
              {copy.popup.sliToggle}
            </button>
            {sliOpen && <SliTable report={sli} copy={copy} />}
            {!sliOpen && (
              <p className="text-sm">
                <span className="text-2xl font-bold tabular-nums">{sli.after.score}</span>
                <span className="text-ink-soft">{copy.popup.sliNow}</span>
                {sli.active && (
                  <span className="ms-2 text-ink-soft">
                    ({copy.popup.sliAsBuilt}: <strong className="tabular-nums text-ink">{sli.before.score}</strong>)
                  </span>
                )}
              </p>
            )}
          </>
        )}
        <button
          type="button"
          onClick={() => void measure()}
          className="mt-2 text-sm font-semibold text-accent underline underline-offset-2"
        >
          {copy.popup.measureAgain}
        </button>
      </Card>

      <div className="grid gap-2">
        <button
          type="button"
          onClick={() => void panic()}
          className="rounded-lg border-2 border-ink bg-ink px-4 py-3 font-semibold text-paper"
        >
          {copy.popup.freeze} <span className="font-normal opacity-80">(Alt+Shift+S)</span>
        </button>
        <p role="status" className="text-sm">
          {panicMessage}
        </p>
      </div>

      {HAS_FLASH_GUARD && (
        <Card title={copy.popup.flashTitle} titleId="flash-title">
          <p className="mb-2 text-sm text-ink-soft">{copy.popup.flashDetail}</p>
          {flash?.running && <FlashChart samples={flash.samples} copy={copy} />}
          {flash?.running && flash.hits > 0 && (
            <p role="alert" className="mt-2 text-sm font-semibold text-warn">
              {copy.popup.flashHit(flash.hits)}
            </p>
          )}
          {flash?.error && <p className="mt-2 text-sm text-warn">{flash.error}</p>}
          <button
            type="button"
            onClick={() => void toggleFlashGuard()}
            disabled={!tab?.host}
            className="mt-2 rounded-lg border-2 border-ink px-4 py-2.5 font-semibold disabled:opacity-50"
          >
            {flash?.running ? copy.popup.flashStop : copy.popup.flashStart}
          </button>
        </Card>
      )}

      <footer className="grid gap-2 text-xs text-ink-soft">
        <LanguagePicker value={locale} copy={copy} onChange={setLocale} />
        <p>{copy.disclaimer}</p>
        <p>
          <button
            type="button"
            className="font-semibold text-accent underline underline-offset-2"
            onClick={() => void browser.runtime.openOptionsPage()}
          >
            {copy.popup.allSettings}
          </button>
          <span aria-hidden="true"> · </span>
          <span>{copy.popup.localOnly}</span>
        </p>
      </footer>
    </main>
  );
}
