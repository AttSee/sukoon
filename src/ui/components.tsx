import { useId, type ReactNode } from 'react';
import type { FlashSample } from '../shared/messages';
import { MODES, type Mode } from '../shared/settings';
import { SIGNAL_KEYS, SIGNAL_LABELS, SLI_WEIGHTS, type SliReport } from '../shared/sli';
import { AREA_THRESHOLD } from '../shared/flash';
import { MODE_COPY } from './copy';

export function Switch(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const descId = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="font-semibold">{props.label}</div>
        {props.description && (
          <p id={descId} className="text-sm text-ink-soft">
            {props.description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        aria-label={props.label}
        aria-describedby={props.description ? descId : undefined}
        disabled={props.disabled}
        onClick={() => props.onChange(!props.checked)}
        className={`relative mt-0.5 h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-ink disabled:cursor-not-allowed disabled:opacity-50 ${
          props.checked ? 'bg-accent' : 'bg-panel'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 h-5 w-5 rounded-full border-2 border-ink ${
            props.checked ? 'left-[22px] bg-accent-ink' : 'left-0.5 bg-ink'
          }`}
        />
      </button>
    </div>
  );
}

export function ModePicker(props: { value: Mode; onChange: (mode: Mode) => void; compact?: boolean; hideLegend?: boolean }) {
  const name = useId();
  return (
    <fieldset>
      <legend className={props.hideLegend ? 'sr-only' : 'mb-2 font-semibold'}>Mode</legend>
      <div className="grid gap-2">
        {MODES.map((mode) => {
          const checked = props.value === mode;
          return (
            <label
              key={mode}
              className={`flex cursor-pointer gap-3 rounded-lg border-2 p-3 ${
                checked ? 'border-accent bg-panel' : 'border-line bg-panel'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={mode}
                checked={checked}
                onChange={() => props.onChange(mode)}
                className="mt-1 h-4 w-4 accent-(--color-accent)"
              />
              <span>
                <span className="block font-semibold">{MODE_COPY[mode].title}</span>
                {!props.compact || checked ? (
                  <span className="block text-sm text-ink-soft">{MODE_COPY[mode].who}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Card(props: { title: string; children: ReactNode; titleId?: string }) {
  return (
    <section aria-labelledby={props.titleId} className="rounded-xl border-2 border-line bg-panel p-4">
      <h2 id={props.titleId} className="mb-2 text-base font-bold">
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

export function SliTable({ report }: { report: SliReport }) {
  return (
    <div>
      <p className="mb-3 text-sm">
        <span className="text-3xl font-bold tabular-nums">{report.after.score}</span>
        <span className="text-ink-soft"> / 100 now</span>
        {report.active && (
          <span className="ms-2 text-ink-soft">
            (page as built: <strong className="tabular-nums text-ink">{report.before.score}</strong>)
          </span>
        )}
      </p>
      <table className="w-full text-sm">
        <caption className="sr-only">Sensory load breakdown</caption>
        <thead>
          <tr className="border-b border-line text-start text-ink-soft">
            <th scope="col" className="py-1 text-start font-medium">
              Signal
            </th>
            <th scope="col" className="py-1 text-end font-medium">
              As built
            </th>
            <th scope="col" className="py-1 text-end font-medium">
              Now
            </th>
            <th scope="col" className="py-1 text-end font-medium">
              Max
            </th>
          </tr>
        </thead>
        <tbody>
          {SIGNAL_KEYS.map((key) => (
            <tr key={key} className="border-b border-line last:border-0">
              <th scope="row" className="py-1 text-start font-normal">
                {SIGNAL_LABELS[key]}
              </th>
              <td className="py-1 text-end tabular-nums">{report.before.breakdown[key]}</td>
              <td className="py-1 text-end font-semibold tabular-nums">{report.after.breakdown[key]}</td>
              <td className="py-1 text-end tabular-nums text-ink-soft">{SLI_WEIGHTS[key]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Static chart of the flashing area over the last 10 s. Redrawn, never animated. */
export function FlashChart({ samples }: { samples: FlashSample[] }) {
  const width = 300;
  const height = 64;
  const now = samples.at(-1)?.t ?? Date.now();
  const span = 10_000;
  const yMax = Math.max(AREA_THRESHOLD * 3, ...samples.map((s) => Math.max(s.generalArea, s.redArea)));
  const x = (t: number) => width - ((now - t) / span) * width;
  const y = (v: number) => height - (v / yMax) * height;
  const points = samples.map((s) => `${x(s.t).toFixed(1)},${y(Math.max(s.generalArea, s.redArea)).toFixed(1)}`).join(' ');
  const peak = samples.reduce((m, s) => Math.max(m, s.generalArea, s.redArea), 0);
  return (
    <figure>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-16 w-full rounded border border-line"
        role="img"
        aria-label={`Flashing area over the last 10 seconds. Peak ${(peak * 100).toFixed(1)}% of the screen; the WCAG limit is ${(AREA_THRESHOLD * 100).toFixed(1)}%.`}
      >
        <line
          x1="0"
          x2={width}
          y1={y(AREA_THRESHOLD)}
          y2={y(AREA_THRESHOLD)}
          stroke="var(--color-warn)"
          strokeDasharray="4 3"
          strokeWidth="1.5"
        />
        {samples.length > 1 && <polyline points={points} fill="none" stroke="var(--color-ink)" strokeWidth="2" />}
      </svg>
      <figcaption className="mt-1 text-xs text-ink-soft">
        Flashing area, last 10 s. Dashed line: WCAG 2.3.1 limit ({(AREA_THRESHOLD * 100).toFixed(1)}% of the screen).
      </figcaption>
    </figure>
  );
}
