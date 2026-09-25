import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { browser } from 'wxt/browser';
import {
  DEFAULT_SETTINGS,
  MODE_PRESETS,
  normalizeSettings,
  resolveFeatures,
  suggestMode,
  type FeatureKey,
  type ImageAnimation,
  type OnboardingAnswers,
  type Settings,
} from '../../shared/settings';
import { SIGNAL_KEYS, SIGNAL_LABELS, SLI_WEIGHTS } from '../../shared/sli';
import { Card, ModePicker, Switch } from '../../ui/components';
import { DISCLAIMER, FEATURE_COPY, IMAGE_COPY, MODE_COPY } from '../../ui/copy';
import { prefersReducedMotion, useSettings } from '../../ui/hooks';

const IS_FIREFOX = import.meta.env.BROWSER === 'firefox';

export function Options() {
  const [settings, update] = useSettings();
  const [welcome, setWelcome] = useState(() => location.hash === '#welcome');

  useEffect(() => {
    if (settings && !settings.onboarded) setWelcome(true);
  }, [settings]);

  if (!settings) return <main className="p-6">Loading…</main>;

  const features = resolveFeatures(settings);
  const preset = MODE_PRESETS[settings.mode];

  const setFeature = (key: FeatureKey, value: boolean) =>
    void update((s) => {
      const overrides = { ...s.overrides };
      if (MODE_PRESETS[s.mode][key] === value) delete overrides[key];
      else overrides[key] = value;
      return { ...s, overrides };
    });

  return (
    <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
      <header>
        <h1 className="text-3xl font-bold">Sukoon settings</h1>
        <p className="mt-1 text-ink-soft">Calm motion, flashing and hijacked scrolling on every site. Everything runs on this device.</p>
      </header>

      <HostAccess />

      {welcome && (
        <Welcome
          onDone={(answers) => {
            void update((s) => ({ ...s, mode: suggestMode(answers), overrides: {}, onboarded: true }));
            setWelcome(false);
            history.replaceState(null, '', location.pathname);
          }}
        />
      )}

      <Card title="General" titleId="general">
        <Switch
          label="Sukoon is on"
          description="Turning Sukoon off stops it on new pages; reload open tabs to fully restore them."
          checked={settings.enabled}
          onChange={(enabled) => void update((s) => ({ ...s, enabled }))}
        />
      </Card>

      <Card title="Mode" titleId="mode">
        <ModePicker hideLegend value={settings.mode} onChange={(mode) => void update((s) => ({ ...s, mode, overrides: {} }))} />
      </Card>

      <Card title="Protections" titleId="protections">
        <p className="mb-2 text-sm text-ink-soft">
          The {MODE_COPY[settings.mode].title} mode sets these. Change any of them to fine-tune.
        </p>
        <div className="divide-y divide-line">
          {(Object.keys(FEATURE_COPY) as FeatureKey[]).map((key) => (
            <Switch
              key={key}
              label={FEATURE_COPY[key].title + (features[key] !== preset[key] ? ' (changed)' : '')}
              description={FEATURE_COPY[key].detail}
              checked={features[key]}
              onChange={(v) => setFeature(key, v)}
            />
          ))}
        </div>
        {Object.keys(settings.overrides).length > 0 && (
          <button
            type="button"
            className="mt-3 text-sm font-semibold text-accent underline underline-offset-2"
            onClick={() => void update((s) => ({ ...s, overrides: {} }))}
          >
            Reset to the {MODE_COPY[settings.mode].title} preset
          </button>
        )}
      </Card>

      <Card title="Animated images" titleId="images">
        <ImagePolicy value={settings.imageAnimation} onChange={(imageAnimation) => void update((s) => ({ ...s, imageAnimation }))} />
        <p className="mt-2 text-sm text-ink-soft">
          Uses the browser's own setting for GIF, APNG and animated WebP, so it applies to every site, including
          excluded ones.
        </p>
      </Card>

      <Card title="Excluded sites" titleId="excluded">
        <ExcludedSites
          hosts={settings.excludedHosts}
          onChange={(excludedHosts) => void update((s) => ({ ...s, excludedHosts }))}
        />
      </Card>

      <Backup settings={settings} update={update} />

      <Card title="Keyboard" titleId="keyboard">
        <p className="text-sm">
          <kbd className="rounded border border-ink px-1">Alt</kbd>+<kbd className="rounded border border-ink px-1">Shift</kbd>+
          <kbd className="rounded border border-ink px-1">S</kbd> freezes the page instantly: a still picture of the page
          covers it, scrolling locks, and everything underneath stops, including canvas and WebGL. Press it again, or Esc,
          to release.
        </p>
        <p className="mt-2 text-sm">
          <kbd className="rounded border border-ink px-1">Alt</kbd>+<kbd className="rounded border border-ink px-1">Shift</kbd>+
          <kbd className="rounded border border-ink px-1">P</kbd> turns Sukoon off or on everywhere; the toolbar icon
          reads <strong>off</strong> while it is paused. Right-click any page for the same actions.
        </p>
        {!IS_FIREFOX && (
          <button
            type="button"
            className="mt-2 text-sm font-semibold text-accent underline underline-offset-2"
            onClick={() => void browser.tabs.create({ url: 'chrome://extensions/shortcuts' })}
          >
            Change the shortcut
          </button>
        )}
      </Card>

      <Card title="How the sensory load index works" titleId="sli">
        <p className="mb-2 text-sm">
          A guide, not a diagnosis. Each signal is scored from 0 to 1, then multiplied by its published weight:
        </p>
        <ul className="grid gap-1 text-sm">
          {SIGNAL_KEYS.map((key) => (
            <li key={key} className="flex justify-between border-b border-line py-1 last:border-0">
              <span>{SIGNAL_LABELS[key]}</span>
              <span className="tabular-nums">{SLI_WEIGHTS[key]}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="About" titleId="about">
        <p className="text-sm">{DISCLAIMER}</p>
        <p className="mt-2 text-sm">
          Sukoon has no servers and no analytics. Its only network access re-reads stylesheets the site already loaded,
          without cookies, to find the site's own reduced-motion styles.
        </p>
      </Card>
    </main>
  );
}

const ALL_SITES = { origins: ['<all_urls>'] };

function Backup(props: { settings: Settings; update: (patch: (s: Settings) => Settings) => Promise<void> }) {
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(props.settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sukoon-settings.json';
    a.click();
    URL.revokeObjectURL(url);
    setMessage('Settings exported.');
  };

  const importJson = async (file: File) => {
    try {
      const parsed = normalizeSettings(JSON.parse(await file.text()));
      await props.update(() => ({ ...parsed, onboarded: true }));
      setMessage('Settings imported.');
    } catch {
      setMessage('That file is not a Sukoon settings export.');
    }
  };

  return (
    <Card title="Backup and reset" titleId="backup">
      <p className="mb-3 text-sm text-ink-soft">
        Settings live on this device only. Export them to move them to another browser or profile.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-lg border-2 border-ink px-3 py-1.5 font-semibold" onClick={exportJson}>
          Export
        </button>
        <button
          type="button"
          className="rounded-lg border-2 border-ink px-3 py-1.5 font-semibold"
          onClick={() => fileRef.current?.click()}
        >
          Import
        </button>
        <button
          type="button"
          className="rounded-lg border-2 border-warn px-3 py-1.5 font-semibold text-warn"
          onClick={() => void props.update(() => ({ ...DEFAULT_SETTINGS, onboarded: true })).then(() => setMessage('Settings reset to the defaults.'))}
        >
          Reset everything
        </button>
        <input
          ref={fileRef}
          id={inputId}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void importJson(file);
          }}
        />
      </div>
      <p role="status" className="mt-2 text-sm">
        {message}
      </p>
    </Card>
  );
}

/** Firefox (MV3) treats host access as opt-in; without it Sukoon cannot run anywhere. */
function HostAccess() {
  const [granted, setGranted] = useState(true);
  useEffect(() => {
    void browser.permissions.contains(ALL_SITES).then(setGranted);
  }, []);
  if (granted) return null;
  return (
    <section role="alert" className="rounded-xl border-2 border-warn bg-panel p-4">
      <h2 className="text-base font-bold">Sukoon needs access to websites</h2>
      <p className="mt-1 text-sm">
        Your browser asks you to allow this. Sukoon only changes how pages move; it sends nothing anywhere.
      </p>
      <button
        type="button"
        className="mt-3 rounded-lg border-2 border-ink bg-ink px-4 py-2 font-semibold text-paper"
        onClick={() => void browser.permissions.request(ALL_SITES).then(setGranted)}
      >
        Allow on all sites
      </button>
    </section>
  );
}

function ImagePolicy(props: { value: ImageAnimation; onChange: (v: ImageAnimation) => void }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="sr-only">Animated images</legend>
      <div className="grid gap-2">
        {(Object.keys(IMAGE_COPY) as ImageAnimation[]).map((value) => (
          <label key={value} className="flex cursor-pointer items-center gap-3">
            <input
              type="radio"
              name={name}
              checked={props.value === value}
              onChange={() => props.onChange(value)}
              className="h-4 w-4 accent-(--color-accent)"
            />
            {IMAGE_COPY[value]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ExcludedSites(props: { hosts: string[]; onChange: (hosts: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const inputId = useId();
  const errorId = useId();

  const add = (e: FormEvent) => {
    e.preventDefault();
    let host = draft.trim().toLowerCase();
    try {
      host = new URL(host.includes('://') ? host : `https://${host}`).hostname;
    } catch {
      setError('Enter a site like example.com');
      return;
    }
    if (!host) return;
    props.onChange([...new Set([...props.hosts, host])]);
    setDraft('');
    setError('');
  };

  return (
    <div>
      {props.hosts.length === 0 ? (
        <p className="text-sm text-ink-soft">No excluded sites.</p>
      ) : (
        <ul className="mb-3 divide-y divide-line">
          {props.hosts.map((host) => (
            <li key={host} className="flex items-center justify-between py-2">
              <span className="font-mono text-sm">{host}</span>
              <button
                type="button"
                className="rounded border-2 border-ink px-2 py-1 text-sm font-semibold"
                aria-label={`Stop excluding ${host}`}
                onClick={() => props.onChange(props.hosts.filter((h) => h !== host))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <label htmlFor={inputId} className="text-sm font-semibold">
            Exclude a site
          </label>
          <input
            id={inputId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="example.com"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="rounded border-2 border-ink bg-panel px-2 py-1.5"
          />
        </div>
        <button type="submit" className="rounded-lg border-2 border-ink bg-ink px-3 py-1.5 font-semibold text-paper">
          Add
        </button>
      </form>
      {error && (
        <p id={errorId} className="mt-1 text-sm text-warn">
          {error}
        </p>
      )}
    </div>
  );
}

function Welcome(props: { onDone: (answers: OnboardingAnswers) => void }) {
  const osReduced = prefersReducedMotion();
  const [trigger, setTrigger] = useState<OnboardingAnswers['trigger']>('motion');
  const [photosensitive, setPhotosensitive] = useState(false);
  const q1 = useId();
  const q2 = useId();
  const suggested = suggestMode({ trigger, photosensitive });

  return (
    <section aria-labelledby="welcome-title" className="rounded-xl border-2 border-accent bg-panel p-5">
      <h2 id="welcome-title" className="text-xl font-bold">
        Welcome to Sukoon
      </h2>
      <p className="mt-1 text-sm text-ink-soft">Two questions to pick a starting mode. You can change it at any time.</p>
      {osReduced && (
        <p className="mt-3 rounded border-2 border-line p-2 text-sm">
          Your system already asks for reduced motion, so the Vestibular mode is suggested.
        </p>
      )}
      <form
        className="mt-4 grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          props.onDone({ trigger, photosensitive });
        }}
      >
        <fieldset>
          <legend id={q1} className="font-semibold">
            1. What bothers you most on the web?
          </legend>
          <div className="mt-2 grid gap-2">
            {(
              [
                ['motion', 'Dizziness or nausea from moving pages and smooth scrolling'],
                ['flashes', 'Flashing or flickering'],
                ['distraction', 'Constant movement pulling my attention'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-3">
                <input
                  type="radio"
                  name={q1}
                  checked={trigger === value}
                  onChange={() => setTrigger(value)}
                  className="h-4 w-4 accent-(--color-accent)"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend id={q2} className="font-semibold">
            2. Can flashing lights trigger seizures, migraines or headaches for you?
          </legend>
          <div className="mt-2 flex gap-6">
            {([true, false] as const).map((value) => (
              <label key={String(value)} className="flex cursor-pointer items-center gap-3">
                <input
                  type="radio"
                  name={q2}
                  checked={photosensitive === value}
                  onChange={() => setPhotosensitive(value)}
                  className="h-4 w-4 accent-(--color-accent)"
                />
                {value ? 'Yes' : 'No'}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="text-sm">
          Suggested mode: <strong>{MODE_COPY[suggested].title}</strong>. {MODE_COPY[suggested].who}
        </p>
        <div>
          <button type="submit" className="rounded-lg border-2 border-ink bg-accent px-4 py-2 font-semibold text-accent-ink">
            Use {MODE_COPY[suggested].title} mode
          </button>
        </div>
      </form>
    </section>
  );
}
