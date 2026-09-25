/**
 * M9 — Flash detection following the WCAG 2.x definitions.
 *
 * - General flash: a pair of opposing changes in relative luminance of 10% or
 *   more, where the darker image is below 0.80.
 * - Red flash: a pair of opposing transitions involving a saturated red
 *   (R / (R+G+B) >= 0.8), where the change in (R - G - B) × 320 exceeds 20.
 * - Content is safe when there are no more than three flashes (six transitions)
 *   in any one-second period, OR the concurrently flashing area stays under 25%
 *   of any 10° visual field. At 1024×768 that field is ~341×256 px, so the
 *   limit is 0.25 × 341 × 256 / (1024 × 768) ≈ 2.78% of the screen.
 *
 * The frame is split into a grid; each cell keeps its own transition history in
 * a sliding one-second window. Pure module — fed with RGBA pixels, no DOM.
 */

export const LUMINANCE_DELTA = 0.1;
export const DARK_LIMIT = 0.8;
export const RED_DELTA = 20;
export const MAX_TRANSITIONS_PER_WINDOW = 6;
export const AREA_THRESHOLD = (0.25 * 341 * 256) / (1024 * 768);

const SRGB_TO_LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG "saturated red" metric on linear RGB in 0..1; 0 when the colour is not saturated red. */
export function redValue(r: number, g: number, b: number): number {
  const sum = r + g + b;
  if (sum <= 0 || r / sum < 0.8) return 0;
  return Math.max(0, (r - g - b) * 320);
}

/**
 * Counts transitions of one signal. A trend is a run of changes in one
 * direction; it counts once, when its total swing reaches the threshold.
 * Counted transitions must alternate direction (a flash is a *pair of opposing* changes).
 */
export class TransitionTracker {
  private last = Number.NaN;
  private ref = 0;
  private dir = 0;
  private counted = false;
  private lastCountedDir = 0;
  private readonly times: number[] = [];

  private readonly isTransition: (a: number, b: number) => boolean;
  private readonly windowMs: number;

  constructor(isTransition: (a: number, b: number) => boolean, windowMs = 1000) {
    this.isTransition = isTransition;
    this.windowMs = windowMs;
  }

  push(value: number, t: number): number {
    if (Number.isNaN(this.last)) {
      this.last = value;
      this.ref = value;
      return 0;
    }
    const delta = value - this.last;
    if (Math.abs(delta) > 1e-6) {
      const dir = Math.sign(delta);
      if (dir !== this.dir) {
        this.dir = dir;
        this.ref = this.last;
        this.counted = false;
      }
      if (!this.counted && this.dir !== this.lastCountedDir && this.isTransition(this.ref, value)) {
        this.counted = true;
        this.lastCountedDir = this.dir;
        this.times.push(t);
      }
      this.last = value;
    }
    // Half-open window (t - 1 s, t]; the epsilon keeps exact 3 Hz content from flickering over the limit on float error.
    while (this.times.length > 0 && this.times[0]! <= t - this.windowMs + 1e-6) this.times.shift();
    return this.times.length;
  }
}

export const isLuminanceTransition = (a: number, b: number) =>
  Math.abs(a - b) >= LUMINANCE_DELTA && Math.min(a, b) < DARK_LIMIT;

export const isRedTransition = (a: number, b: number) => Math.abs(a - b) > RED_DELTA;

export interface FlashFrameResult {
  /** Fraction of the frame whose cells exceed three flashes per second (general). */
  generalArea: number;
  /** Same, for red flashes. */
  redArea: number;
  /** Highest transition count of any cell in the last second. */
  peakTransitions: number;
  hazard: boolean;
}

export interface FlashDetectorOptions {
  cols?: number;
  rows?: number;
  windowMs?: number;
  areaThreshold?: number;
}

export interface RgbaFrame {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export class FlashDetector {
  readonly cols: number;
  readonly rows: number;
  private readonly areaThreshold: number;
  private readonly luminance: TransitionTracker[];
  private readonly red: TransitionTracker[];

  constructor(options: FlashDetectorOptions = {}) {
    this.cols = options.cols ?? 16;
    this.rows = options.rows ?? 9;
    this.areaThreshold = options.areaThreshold ?? AREA_THRESHOLD;
    const windowMs = options.windowMs ?? 1000;
    const n = this.cols * this.rows;
    this.luminance = Array.from({ length: n }, () => new TransitionTracker(isLuminanceTransition, windowMs));
    this.red = Array.from({ length: n }, () => new TransitionTracker(isRedTransition, windowMs));
  }

  push(frame: RgbaFrame, t: number): FlashFrameResult {
    const { cols, rows } = this;
    const sums = new Float64Array(cols * rows * 4); // r, g, b, count
    const { data, width, height } = frame;
    for (let y = 0; y < height; y++) {
      const row = Math.min(rows - 1, Math.floor((y * rows) / height));
      for (let x = 0; x < width; x++) {
        const col = Math.min(cols - 1, Math.floor((x * cols) / width));
        const i = (y * width + x) * 4;
        const c = (row * cols + col) * 4;
        sums[c] = sums[c]! + SRGB_TO_LINEAR[data[i]!]!;
        sums[c + 1] = sums[c + 1]! + SRGB_TO_LINEAR[data[i + 1]!]!;
        sums[c + 2] = sums[c + 2]! + SRGB_TO_LINEAR[data[i + 2]!]!;
        sums[c + 3] = sums[c + 3]! + 1;
      }
    }
    let generalCells = 0;
    let redCells = 0;
    let peak = 0;
    for (let cell = 0; cell < cols * rows; cell++) {
      const count = sums[cell * 4 + 3]! || 1;
      const r = sums[cell * 4]! / count;
      const g = sums[cell * 4 + 1]! / count;
      const b = sums[cell * 4 + 2]! / count;
      const lt = this.luminance[cell]!.push(relativeLuminance(r, g, b), t);
      const rt = this.red[cell]!.push(redValue(r, g, b), t);
      peak = Math.max(peak, lt, rt);
      if (lt > MAX_TRANSITIONS_PER_WINDOW) generalCells++;
      if (rt > MAX_TRANSITIONS_PER_WINDOW) redCells++;
    }
    const total = cols * rows;
    const generalArea = generalCells / total;
    const redArea = redCells / total;
    return {
      generalArea,
      redArea,
      peakTransitions: peak,
      hazard: generalArea >= this.areaThreshold || redArea >= this.areaThreshold,
    };
  }
}
