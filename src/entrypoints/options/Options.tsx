import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { browser } from 'wxt/browser';
import { SIGNAL_KEYS, SLI_WEIGHTS } from '../../shared/sli';
import {
  DEFAULT_SETTINGS,
  MODE_PRESETS,
  normalizeSettings,
  resolveFeatures,
  suggestMode,
  type FeatureKey,
  type ImageAnimation,
  type Locale,
  type OnboardingAnswers,
  type Settings,
} from '../../shared/settings';
import { Card, ChipPicker, LanguagePicker, ModePicker, Switch } from '../../ui/components';
import { uiCopy, type UiCopy } from '../../ui/copy';
import { prefersReducedMotion, useDocumentLocale, useSettings } from '../../ui/hooks';

const IS_FIREFOX = import.meta.env.BROWSER === 'firefox';

export function Options() {
  const [settings, update] = useSettings();
  const [welcome, setWelcome] = useState(() => location.hash === '#welcome');
  const copy = uiCopy(settings?.locale ?? 'en');
  useDocumentLocale(settings?.locale, copy.options.title);

  useEffect(() => {
    if (settings && !settings.onboarded) setWelcome(true);
  }, [settings]);

  if (!settings) return <main className="p-6">{copy.options.loading}</main>;

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
        <h1 className="text-3xl font-bold">{copy.options.title}</h1>
        <p className="mt-1 text-ink-soft">{copy.options.lead}</p>
      </header>

      <HostAccess copy={copy} />

      {welcome && (
        <Welcome
          copy={copy}
          locale={settings.locale}
          onLocale={(locale) => void update((s) => ({ ...s, locale }))}
          onDone={(answers) => {
            void update((s) => ({ ...s, mode: suggestMode(answers), overrides: {}, onboarded: true }));
            setWelcome(false);
            history.replaceState(null, '', location.pathname);
          }}
        />
      )}

      <Card title={copy.language.title} titleId="language">
        <LanguagePicker value={settings.locale} copy={copy} onChange={(locale) => void update((s) => ({ ...s, locale }))} />
      </Card>

      <Card title={copy.chipSetting.title} titleId="chip">
        <ChipPicker value={settings.pageChip} copy={copy} onChange={(pageChip) => void update((s) => ({ ...s, pageChip }))} />
      </Card>

      <Card title={copy.options.general} titleId="general">
        <Switch
          label={copy.options.onLabel}
          description={copy.options.onDescription}
          checked={settings.enabled}
          onChange={(enabled) => void update((s) => ({ ...s, enabled }))}
        />
      </Card>

      <Card title={copy.options.mode} titleId="mode">
        <ModePicker hideLegend value={settings.mode} copy={copy} onChange={(mode) => void update((s) => ({ ...s, mode, overrides: {} }))} />
      </Card>

      <Card title={copy.options.protections} titleId="protections">
        <p className="mb-2 text-sm text-ink-soft">{copy.options.protectionsLead(copy.modes[settings.mode].title)}</p>
        <div className="divide-y divide-line">
          {(Object.keys(copy.features) as FeatureKey[]).map((key) => (
            <Switch
              key={key}
              label={copy.features[key].title + (features[key] !== preset[key] ? copy.changed : '')}
              description={copy.features[key].detail}
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
            {copy.options.resetPreset(copy.modes[settings.mode].title)}
          </button>
        )}
      </Card>

      <Card title={copy.options.imagesTitle} titleId="images">
        <ImagePolicy copy={copy} value={settings.imageAnimation} onChange={(imageAnimation) => void update((s) => ({ ...s, imageAnimation }))} />
        <p className="mt-2 text-sm text-ink-soft">{copy.options.imagesLead}</p>
      </Card>

      <Card title={copy.options.excluded} titleId="excluded">
        <ExcludedSites
          copy={copy}
          hosts={settings.excludedHosts}
          onChange={(excludedHosts) => void update((s) => ({ ...s, excludedHosts }))}
        />
      </Card>

      <Backup copy={copy} settings={settings} update={update} />

      <Card title={copy.options.keyboard} titleId="keyboard">
        <p className="text-sm">{copy.options.shortcutFreeze}</p>
        <p className="mt-2 text-sm">{copy.options.shortcutToggle}</p>
        {!IS_FIREFOX && (
          <button
            type="button"
            className="mt-2 text-sm font-semibold text-accent underline underline-offset-2"
            onClick={() => void browser.tabs.create({ url: 'chrome://extensions/shortcuts' })}
          >
            {copy.options.changeShortcut}
          </button>
        )}
      </Card>

      <Card title={copy.options.sliHow} titleId="sli">
        <p className="mb-2 text-sm">{copy.options.sliHowLead}</p>
        <ul className="grid gap-1 text-sm">
          {SIGNAL_KEYS.map((key) => (
            <li key={key} className="flex justify-between border-b border-line py-1 last:border-0">
              <span>{copy.signals[key]}</span>
              <span className="tabular-nums">{SLI_WEIGHTS[key]}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={copy.options.about} titleId="about">
        <p className="text-sm">{copy.disclaimer}</p>
        <p className="mt-2 text-sm">{copy.options.aboutPrivacy}</p>
      </Card>
    </main>
  );
}

const ALL_SITES = { origins: ['<all_urls>'] };

function Backup(props: { copy: UiCopy; settings: Settings; update: (patch: (s: Settings) => Settings) => Promise<void> }) {
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const { copy } = props;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(props.settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sukoon-settings.json';
    a.click();
    URL.revokeObjectURL(url);
    setMessage(copy.options.exported);
  };

  const importJson = async (file: File) => {
    try {
      const parsed = normalizeSettings(JSON.parse(await file.text()));
      await props.update(() => ({ ...parsed, onboarded: true }));
      setMessage(copy.options.imported);
    } catch {
      setMessage(copy.options.importBad);
    }
  };

  return (
    <Card title={copy.options.backup} titleId="backup">
      <p className="mb-3 text-sm text-ink-soft">{copy.options.backupLead}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-lg border-2 border-ink px-3 py-1.5 font-semibold" onClick={exportJson}>
          {copy.options.export}
        </button>
        <button
          type="button"
          className="rounded-lg border-2 border-ink px-3 py-1.5 font-semibold"
          onClick={() => fileRef.current?.click()}
        >
          {copy.options.import}
        </button>
        <button
          type="button"
          className="rounded-lg border-2 border-warn px-3 py-1.5 font-semibold text-warn"
          onClick={() => void props.update(() => ({ ...DEFAULT_SETTINGS, onboarded: true })).then(() => setMessage(copy.options.resetDone))}
        >
          {copy.options.reset}
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

function HostAccess(props: { copy: UiCopy }) {
  const [granted, setGranted] = useState(true);
  useEffect(() => {
    void browser.permissions.contains(ALL_SITES).then(setGranted);
  }, []);
  if (granted) return null;
  return (
    <section role="alert" className="rounded-xl border-2 border-warn bg-panel p-4">
      <h2 className="text-base font-bold">{props.copy.options.hostTitle}</h2>
      <p className="mt-1 text-sm">{props.copy.options.hostLead}</p>
      <button
        type="button"
        className="mt-3 rounded-lg border-2 border-ink bg-ink px-4 py-2 font-semibold text-paper"
        onClick={() => void browser.permissions.request(ALL_SITES).then(setGranted)}
      >
        {props.copy.options.hostAllow}
      </button>
    </section>
  );
}

function ImagePolicy(props: { copy: UiCopy; value: ImageAnimation; onChange: (v: ImageAnimation) => void }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="sr-only">{props.copy.options.imagesTitle}</legend>
      <div className="grid gap-2">
        {(Object.keys(props.copy.images) as ImageAnimation[]).map((value) => (
          <label key={value} className="flex cursor-pointer items-center gap-3">
            <input
              type="radio"
              name={name}
              checked={props.value === value}
              onChange={() => props.onChange(value)}
              className="h-4 w-4 accent-(--color-accent)"
            />
            {props.copy.images[value]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ExcludedSites(props: { copy: UiCopy; hosts: string[]; onChange: (hosts: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const inputId = useId();
  const errorId = useId();
  const { copy } = props;

  const add = (e: FormEvent) => {
    e.preventDefault();
    let host = draft.trim().toLowerCase();
    try {
      host = new URL(host.includes('://') ? host : `https://${host}`).hostname;
    } catch {
      setError(copy.options.excludeError);
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
        <p className="text-sm text-ink-soft">{copy.options.excludedEmpty}</p>
      ) : (
        <ul className="mb-3 divide-y divide-line">
          {props.hosts.map((host) => (
            <li key={host} className="flex items-center justify-between py-2">
              <span className="font-mono text-sm">{host}</span>
              <button
                type="button"
                className="rounded border-2 border-ink px-2 py-1 text-sm font-semibold"
                aria-label={copy.options.stopExcluding(host)}
                onClick={() => props.onChange(props.hosts.filter((h) => h !== host))}
              >
                {copy.options.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <label htmlFor={inputId} className="text-sm font-semibold">
            {copy.options.excludeLabel}
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
          {copy.options.add}
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

function Welcome(props: {
  copy: UiCopy;
  locale: Locale;
  onLocale: (locale: Locale) => void;
  onDone: (answers: OnboardingAnswers) => void;
}) {
  const osReduced = prefersReducedMotion();
  const [trigger, setTrigger] = useState<OnboardingAnswers['trigger']>('motion');
  const [photosensitive, setPhotosensitive] = useState(false);
  const q1 = useId();
  const q2 = useId();
  const { copy } = props;
  const suggested = suggestMode({ trigger, photosensitive });

  return (
    <section aria-labelledby="welcome-title" className="rounded-xl border-2 border-accent bg-panel p-5">
      <h2 id="welcome-title" className="text-xl font-bold">
        {copy.welcome.title}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">{copy.welcome.lead}</p>
      <div className="mt-3">
        <LanguagePicker value={props.locale} copy={copy} onChange={props.onLocale} />
      </div>
      {osReduced && <p className="mt-3 rounded border-2 border-line p-2 text-sm">{copy.welcome.osHint}</p>}
      <form
        className="mt-4 grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          props.onDone({ trigger, photosensitive });
        }}
      >
        <fieldset>
          <legend id={q1} className="font-semibold">
            {copy.welcome.q1}
          </legend>
          <div className="mt-2 grid gap-2">
            {(
              [
                ['motion', copy.welcome.motion],
                ['flashes', copy.welcome.flashes],
                ['distraction', copy.welcome.distraction],
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
            {copy.welcome.q2}
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
                {value ? copy.welcome.yes : copy.welcome.no}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="text-sm">{copy.welcome.suggested(copy.modes[suggested].title, copy.modes[suggested].who)}</p>
        <div>
          <button type="submit" className="rounded-lg border-2 border-ink bg-accent px-4 py-2 font-semibold text-accent-ink">
            {copy.welcome.useMode(copy.modes[suggested].title)}
          </button>
        </div>
      </form>
    </section>
  );
}
