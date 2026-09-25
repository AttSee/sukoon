import { describe, expect, it } from 'vitest';
import {
  AREA_THRESHOLD,
  FlashDetector,
  isLuminanceTransition,
  redValue,
  relativeLuminance,
  TransitionTracker,
} from '../src/shared/flash';

const W = 64;
const H = 36;
const FPS = 30;

type Rgb = [number, number, number];

/** Frame filled with `base`, with the first `cells` grid cells (16×9 grid) painted `patch`. */
function frame(base: Rgb, patch: Rgb, cells: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  const cw = W / 16;
  const ch = H / 9;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cell = Math.floor(y / ch) * 16 + Math.floor(x / cw);
      const [r, g, b] = cell < cells ? patch : base;
      const i = (y * W + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

/** Run `seconds` of video alternating between colours `a` and `b` at `hz` flashes per second. */
function run(opts: { a: Rgb; b: Rgb; hz: number; cells: number; seconds?: number; base?: Rgb }) {
  const detector = new FlashDetector();
  const base = opts.base ?? [20, 20, 20];
  let hazard = false;
  let peak = 0;
  const frames = (opts.seconds ?? 2) * FPS;
  for (let f = 0; f < frames; f++) {
    const t = (f * 1000) / FPS;
    const phase = Math.floor((t / 1000) * opts.hz * 2) % 2; // two transitions per flash
    const r = detector.push({ data: frame(base, phase ? opts.b : opts.a, opts.cells), width: W, height: H }, t);
    hazard ||= r.hazard;
    peak = Math.max(peak, r.peakTransitions);
  }
  return { hazard, peak };
}

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];
const ALL = 144;

describe('WCAG flash thresholds', () => {
  it('uses the 25%-of-10° area limit (~2.78% of the screen)', () => {
    expect(AREA_THRESHOLD).toBeCloseTo(0.0278, 3);
  });

  it('computes relative luminance on linear RGB', () => {
    expect(relativeLuminance(1, 1, 1)).toBeCloseTo(1);
    expect(relativeLuminance(0, 0, 0)).toBe(0);
  });

  it('needs a 10% swing with the darker state below 0.8', () => {
    expect(isLuminanceTransition(0.2, 0.35)).toBe(true);
    expect(isLuminanceTransition(0.2, 0.25)).toBe(false);
    expect(isLuminanceTransition(0.85, 1)).toBe(false);
  });

  it('only scores saturated red', () => {
    expect(redValue(1, 0, 0)).toBe(320);
    expect(redValue(1, 1, 1)).toBe(0);
  });
});

describe('TransitionTracker', () => {
  it('counts each trend once and requires alternation', () => {
    const t = new TransitionTracker(isLuminanceTransition);
    const series = [0, 0.05, 0.12, 0.2, 0.1, 0, 0.3, 0.3, 0];
    let n = 0;
    series.forEach((v, i) => (n = t.push(v, i * 10)));
    expect(n).toBe(4); // up, down, up, down
  });

  it('forgets transitions older than one second', () => {
    const t = new TransitionTracker(isLuminanceTransition);
    t.push(0, 0);
    t.push(0.5, 10);
    t.push(0, 20);
    expect(t.push(0, 1500)).toBe(0);
  });
});

describe('FlashDetector', () => {
  it('flags full-screen black/white flashing at 5 Hz', () => {
    expect(run({ a: BLACK, b: WHITE, hz: 5, cells: ALL }).hazard).toBe(true);
  });

  it('flags reduced-intensity mid-grey flashing at 5 Hz (the test page pattern)', () => {
    expect(run({ a: [124, 124, 124], b: [179, 179, 179], hz: 5, cells: ALL }).hazard).toBe(true);
  });

  it('passes three flashes per second', () => {
    const r = run({ a: BLACK, b: WHITE, hz: 3, cells: ALL });
    expect(r.hazard).toBe(false);
    expect(r.peak).toBeLessThanOrEqual(6);
  });

  it('passes fast flashing that covers less than the area limit', () => {
    // 3 of 144 cells ≈ 2.1% of the screen.
    expect(run({ a: BLACK, b: WHITE, hz: 8, cells: 3 }).hazard).toBe(false);
    // 5 of 144 cells ≈ 3.5% of the screen.
    expect(run({ a: BLACK, b: WHITE, hz: 8, cells: 5 }).hazard).toBe(true);
  });

  it('passes flicker between two very bright states', () => {
    expect(run({ a: [235, 235, 235], b: WHITE, hz: 8, cells: ALL }).hazard).toBe(false);
  });

  it('passes small luminance wobble', () => {
    expect(run({ a: [100, 100, 100], b: [110, 110, 110], hz: 8, cells: ALL }).hazard).toBe(false);
  });

  it('flags saturated red flashing', () => {
    expect(run({ a: [60, 0, 0], b: [255, 0, 0], hz: 5, cells: ALL, base: [60, 0, 0] }).hazard).toBe(true);
  });

  it('flags a still frame as safe', () => {
    expect(run({ a: WHITE, b: WHITE, hz: 5, cells: ALL }).hazard).toBe(false);
  });
});
