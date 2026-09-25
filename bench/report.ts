/**
 * M10 — Evidence bench, step 3: turn runs.json + analysis.json (+ breakage.csv)
 * into bench/results/report.md. Every number in the pitch comes from here.
 *
 *   node bench/report.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RunRecord } from './run.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RESULTS = `${ROOT}bench/results`;

interface Analysis {
  motionEnergy: { idle: number; scroll: number; all: number; frames: number };
  iris: {
    overall: string;
    luminanceFailFrames: number;
    luminanceExtendedFailFrames: number;
    redFailFrames: number;
    redExtendedFailFrames: number;
  } | null;
}

const runs = JSON.parse(readFileSync(`${RESULTS}/runs.json`, 'utf8')) as { seconds: number; createdAt: string; records: RunRecord[] };
const analysis = JSON.parse(readFileSync(`${RESULTS}/analysis.json`, 'utf8')) as Record<string, Analysis>;

// ── helpers ────────────────────────────────────────────────────────────────
const median = (xs: number[]) => {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const ranks = (xs: number[]) => {
  const order = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j++;
    for (let k = i; k <= j; k++) r[order[k]![1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
};
const pearson = (a: number[], b: number[]) => {
  const ma = a.reduce((s, v) => s + v, 0) / a.length;
  const mb = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
};
const spearman = (a: number[], b: number[]) => pearson(ranks(a), ranks(b));
const fmt = (n: number | undefined, d = 2) => (n === undefined || Number.isNaN(n) ? '—' : n.toFixed(d));
const pct = (n: number) => (Number.isNaN(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(0)}%`);
const irisFails = (a?: Analysis) =>
  a?.iris ? a.iris.luminanceFailFrames + a.iris.luminanceExtendedFailFrames + a.iris.redFailFrames + a.iris.redExtendedFailFrames : undefined;

// ── per-site rows ──────────────────────────────────────────────────────────
const sites = [...new Set(runs.records.map((r) => r.site))];
interface Row {
  site: string;
  off?: RunRecord;
  on?: RunRecord;
  aOff?: Analysis;
  aOn?: Analysis;
}
const rows: Row[] = sites.map((site) => ({
  site,
  off: runs.records.find((r) => r.site === site && r.condition === 'off'),
  on: runs.records.find((r) => r.site === site && r.condition === 'on'),
  aOff: analysis[`${site}-off`],
  aOn: analysis[`${site}-on`],
}));
const complete = rows.filter((r) => r.off?.ok && r.on?.ok && r.aOff && r.aOn);

const change = (on: number, off: number) => (off > 0 ? (on / off - 1) * 100 : Number.NaN);
const idleChanges = complete.map((r) => change(r.aOn!.motionEnergy.idle, r.aOff!.motionEnergy.idle)).filter(Number.isFinite);
const scrollChanges = complete.map((r) => change(r.aOn!.motionEnergy.scroll, r.aOff!.motionEnergy.scroll)).filter(Number.isFinite);
const dclDelta = complete.map((r) => (r.on!.domContentLoadedMs ?? 0) - (r.off!.domContentLoadedMs ?? 0));
const lcpDelta = complete.filter((r) => r.on!.lcpMs && r.off!.lcpMs).map((r) => r.on!.lcpMs! - r.off!.lcpMs!);
const irisOff = complete.filter((r) => (irisFails(r.aOff) ?? 0) > 0).length;
const irisOn = complete.filter((r) => (irisFails(r.aOn) ?? 0) > 0).length;
// Validity check: the measure-only SLI (page as built) against idle motion measured without Sukoon.
const withSli = complete.filter((r) => r.off!.sliProbe !== undefined);
const sliBefore = withSli.map((r) => r.off!.sliProbe!);
const energyOff = withSli.map((r) => r.aOff!.motionEnergy.idle);
const rho = withSli.length >= 3 ? spearman(sliBefore, energyOff) : Number.NaN;

// ── breakage ───────────────────────────────────────────────────────────────
let breakage = 'not checked yet — fill bench/breakage.csv using bench/breakage-checklist.md';
const csvPath = `${ROOT}bench/breakage.csv`;
if (existsSync(csvPath)) {
  const lines = readFileSync(csvPath, 'utf8').trim().split('\n').slice(1).filter(Boolean);
  if (lines.length > 0) {
    const broken = lines.filter((l) => {
      const [, missing, broke] = l.split(',');
      return missing?.trim() === 'yes' || broke?.trim() === 'yes';
    }).length;
    breakage = `${broken} of ${lines.length} checked sites (${((broken / lines.length) * 100).toFixed(0)}%)`;
  }
}

// ── report ─────────────────────────────────────────────────────────────────
const table = [
  '| Site | Idle motion off | on | Change | Scroll motion off | on | IRIS fail frames off | on | DCL ms off | on | LCP ms off | on | SLI as built | SLI with Sukoon |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...rows.map((r) => {
    if (!(r.off?.ok && r.on?.ok)) return `| ${r.site} | failed: ${r.off?.error ?? r.on?.error ?? 'no recording'} |${' |'.repeat(13)}`;
    const idle = r.aOff && r.aOn ? change(r.aOn.motionEnergy.idle, r.aOff.motionEnergy.idle) : Number.NaN;
    const sli = `${r.off.sliProbe ?? '—'} | ${r.on.sli?.after.score ?? '—'}`;
    return `| ${r.site} | ${fmt(r.aOff?.motionEnergy.idle, 3)} | ${fmt(r.aOn?.motionEnergy.idle, 3)} | ${pct(idle)} | ${fmt(r.aOff?.motionEnergy.scroll, 3)} | ${fmt(r.aOn?.motionEnergy.scroll, 3)} | ${irisFails(r.aOff) ?? '—'} | ${irisFails(r.aOn) ?? '—'} | ${r.off.domContentLoadedMs ?? '—'} | ${r.on.domContentLoadedMs ?? '—'} | ${r.off.lcpMs || '—'} | ${r.on.lcpMs || '—'} | ${sli} |`;
  }),
].join('\n');

const report = `# Sukoon evidence report

Generated ${new Date().toISOString()} from recordings made ${runs.createdAt}.
Scenario: 1280×720, ${runs.seconds} s per run (4 s still, scripted wheel scrolling, 3 s still), bundled Chromium, each site
recorded once without and once with Sukoon (Vestibular mode). Reproduce with \`npm run bench\`.

## Summary

| Measure | Result |
| --- | --- |
| Sites with both runs analysed | ${complete.length} of ${rows.length} |
| Median change in motion while idle (motion nobody asked for) | ${pct(median(idleChanges))} |
| Median change in motion while scrolling | ${pct(median(scrollChanges))} |
| Sites with IRIS flash failures | ${irisOff} without Sukoon → ${irisOn} with Sukoon |
| Median DOMContentLoaded cost | ${fmt(median(dclDelta), 0)} ms |
| Median LCP cost | ${fmt(median(lcpDelta), 0)} ms |
| SLI (as built) vs. measured idle motion without Sukoon, Spearman ρ | ${fmt(rho)} (n = ${withSli.length}) |
| Breakage rate | ${breakage} |

## Per site

${table}

## How to read this

- **Idle motion**: mean absolute luminance difference between consecutive frames at 160×90 (0–255 scale; per-pixel
  changes under 4 are treated as video-codec noise), during the
  4 s before scrolling and the 3 s after it. Nothing the user does moves the screen then, so this is motion nobody
  asked for (including smooth-scroll inertia after the wheel stops).
- **Scroll motion**: the same measure while the wheel is turning. It includes the scrolling itself, so it never
  reaches zero, and native scrolling can move further than a hijacked one; read it as context, not as a score.
- **IRIS fail frames**: frames that EA's IRIS (Python port \`iris-pse-detection\`) marks as luminance or red flash
  failures under WCAG 2.3.1 / ISO 9241-391. IRIS judges the change in whole-frame average luminance with a 25% area
  rule, so it only fails large flashes; Sukoon's own Flash Guard uses the stricter 10° visual-field limit. IRIS output
  is informational and not a certification.
- **DCL / LCP**: single runs on a live network, so they are noisy; read the medians, not single rows.
- **SLI**: Sukoon's own index. "As built" comes from a separate measure-only pass (extension loaded, every
  protection off), so it sees the page exactly as its authors shipped it. Its credibility comes from the ρ above, not
  from Sukoon's claims.
- Live sites change daily; numbers will drift between runs. Publish the run you used.
`;

writeFileSync(`${RESULTS}/report.md`, report);
console.log(report.split('## Per site')[0]);
