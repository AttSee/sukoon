import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import type { FlashGuardStatus, SliResponse, ToBackground, ToContent } from '../../shared/messages';
import { isHostExcluded } from '../../shared/settings';
import { Card, FlashChart, ModePicker, SliTable, Switch } from '../../ui/components';
import { DISCLAIMER } from '../../ui/copy';
import { useSettings } from '../../ui/hooks';

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

  useEffect(() => {
    void browser.tabs.query({ active: true, currentWindow: true }).then(([t]) => {
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
      setSli('unavailable'); // browser UI pages: nothing to measure, and "Measuring…" must not stay forever
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

  // Measure on open and shortly after any settings change has been applied in the page.
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

  if (!settings) return <main className="w-[360px] p-4">Loading…</main>;

  const excluded = tab?.host ? isHostExcluded(settings, tab.host) : false;

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
      // The background answers `true` (frozen), `false` (released) or `{ ok: false, error }` (cannot inject).
      const result: unknown = await browser.runtime.sendMessage({ type: 'panic', tabId: tab.id } satisfies ToBackground);
      if (result === true) {
        setPanicMessage('Page frozen. Press Esc on the page to release.');
        window.close();
      } else if (result === false) {
        setPanicMessage('Page released.');
      } else {
        setPanicMessage('This page cannot be frozen.');
      }
    } catch {
      setPanicMessage('This page cannot be frozen.');
    }
  };

  const toggleFlashGuard = async () => {
    if (!tab) return;
    const message: ToBackground = flash?.running ? { type: 'flash-guard:stop' } : { type: 'flash-guard:start', tabId: tab.id };
    setFlash((await browser.runtime.sendMessage(message)) as FlashGuardStatus);
  };

  return (
    <main className="grid w-[360px] gap-3 p-4">
      <header>
        <h1 className="text-xl font-bold">Sukoon</h1>
        <Switch
          label="Sukoon is on"
          description={settings.enabled ? 'Calming every site you open.' : 'Paused everywhere. Reload tabs after turning it on.'}
          checked={settings.enabled}
          onChange={(enabled) => void update((s) => ({ ...s, enabled }))}
        />
      </header>

      {tab?.host ? (
        <Switch
          label={`Calm ${tab.host}`}
          description={excluded ? 'Excluded. Reload the page after turning it back on.' : 'Turn off to exclude this site.'}
          checked={!excluded}
          disabled={!settings.enabled}
          onChange={toggleSite}
        />
      ) : (
        <p className="text-sm text-ink-soft">The browser does not let extensions change this page.</p>
      )}

      <ModePicker compact value={settings.mode} onChange={(mode) => void update((s) => ({ ...s, mode }))} />

      <Card title="Sensory load" titleId="sli-title">
        {sli === null && <p className="text-sm">Measuring…</p>}
        {sli === 'unavailable' && (
          <p className="text-sm text-ink-soft">No measurement here. Reload the page if Sukoon was just installed.</p>
        )}
        {sli && sli !== 'unavailable' && <SliTable report={sli} />}
        <button
          type="button"
          onClick={() => void measure()}
          className="mt-2 text-sm font-semibold text-accent underline underline-offset-2"
        >
          Measure again
        </button>
      </Card>

      <div className="grid gap-2">
        <button
          type="button"
          onClick={() => void panic()}
          className="rounded-lg border-2 border-ink bg-ink px-4 py-2.5 font-semibold text-paper"
        >
          Freeze page now <span className="font-normal opacity-80">(Alt+Shift+S)</span>
        </button>
        <p role="status" className="text-sm">
          {panicMessage}
        </p>
      </div>

      {HAS_FLASH_GUARD && (
        <Card title="Flash Guard" titleId="flash-title">
          <p className="mb-2 text-sm text-ink-soft">
            Watches this tab locally and dims moving content when flashing passes WCAG limits. Chrome shows a capture
            indicator while it runs. It shortens exposure but cannot prevent the first second.
          </p>
          {flash?.running && <FlashChart samples={flash.samples} />}
          {flash?.running && flash.hits > 0 && (
            <p role="alert" className="mt-2 text-sm font-semibold text-warn">
              Flashing detected {flash.hits} time{flash.hits === 1 ? '' : 's'}; content dimmed.
            </p>
          )}
          {flash?.error && <p className="mt-2 text-sm text-warn">{flash.error}</p>}
          <button
            type="button"
            onClick={() => void toggleFlashGuard()}
            disabled={!tab?.host}
            className="mt-2 rounded-lg border-2 border-ink px-4 py-2 font-semibold disabled:opacity-50"
          >
            {flash?.running ? 'Stop Flash Guard' : 'Start Flash Guard on this tab'}
          </button>
        </Card>
      )}

      <footer className="grid gap-2 text-xs text-ink-soft">
        <p>{DISCLAIMER}</p>
        <p>
          <button
            type="button"
            className="font-semibold text-accent underline underline-offset-2"
            onClick={() => void browser.runtime.openOptionsPage()}
          >
            All settings
          </button>
          <span aria-hidden="true"> · </span>
          <span>No servers. Nothing leaves your device.</span>
        </p>
      </footer>
    </main>
  );
}
