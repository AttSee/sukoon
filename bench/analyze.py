#!/usr/bin/env python3
"""
M10 — Evidence bench, step 2: analyse every recorded video with neutral tools.

  * Motion energy: mean absolute luminance difference between consecutive
    frames, after downscaling to 160x90 greyscale (0 = perfectly still, 255 = max).
  * Flash risk: EA's IRIS (Python port, iris-pse-detection), which follows
    WCAG 2.3.1 and ISO 9241-391. Informational only, as IRIS itself states.

Both use a constant 30 fps copy of each recording, so the two conditions are
measured identically.

Phase windows come from the on-screen markers bench/run.ts shows at every
boundary (a 128 px two-tone square in the top-left corner that swaps its
tones at each boundary and stays): a Playwright recording starts at its first
captured frame, up to 1.6 s after the page was created on heavy sites, and
frames only arrive when the page repaints, so wall-clock windows caught the
wheel start and the post-scenario actions. Recordings without markers (older
runs, or a page whose top layer hides the square) fall back to the wall-clock
windows with a 0.3 s margin, and say so in analysis.json ("phaseSource").

  python3 bench/analyze.py            (uses bench/.venv if present)
Output: bench/results/analysis.json
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "bench" / "results"
VENV_PY = ROOT / "bench" / ".venv" / "bin" / "python"

# Re-run inside the bench virtualenv when started with the system Python.
if VENV_PY.exists() and Path(sys.prefix).resolve() != VENV_PY.parent.parent.resolve() and not os.environ.get("SUKOON_NO_VENV"):
    os.execv(str(VENV_PY), [str(VENV_PY), *sys.argv])

import numpy as np  # noqa: E402

W, H, FPS = 160, 90, 30
# Per-pixel changes below this (0-255 scale) are video-codec noise, not motion.
NOISE_FLOOR = 4


def constant_rate_copy(video: Path) -> Path:
    out = video.with_suffix(".cfr.mp4")
    if not out.exists() or out.stat().st_mtime < video.stat().st_mtime:
        subprocess.run(
            ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", str(video),
             "-vf", f"fps={FPS}", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", str(out)],
            check=True,
        )
    return out


# The 128 px marker at 1280×720 is 16 px at 160×90; one half is black, the other white, and the tones swap at every
# boundary. The marker stays up, so every captured frame carries its phase; the frame on which the tones change is the
# boundary, and within a phase the corner is constant, so the rest of the frame is measured as usual.
MARK_PX = 16
MARK_MIN_FRAMES = 2
# Analysis changes invalidate cached entries in analysis.json.
ANALYSER_VERSION = 3
# Frames excluded around a marker: the frame that shows it appearing or vanishing, plus codec ghosts.
MARK_MARGIN = 2
# The video timeline can run more than a second behind the wall clock; a marker further away than this is not ours.
MARK_TOLERANCE_S = 3.0


def marker_runs(frames: np.ndarray) -> list[tuple[int, int]]:
    """Frame ranges [start, end) showing one set of tones; a change of tones starts a new run."""
    corner = frames[:, :MARK_PX, :MARK_PX]
    left = corner[:, :, : MARK_PX // 2].mean(axis=(1, 2))
    right = corner[:, :, MARK_PX // 2 :].mean(axis=(1, 2))
    tone = np.where((left < 48) & (right > 208), 1, np.where((left > 208) & (right < 48), 2, 0))
    runs: list[tuple[int, int]] = []
    start = None
    for i, t in enumerate(tone):
        if start is not None and t != tone[start]:
            runs.append((start, i))
            start = None
        if t and start is None:
            start = i
    if start is not None:
        runs.append((start, len(tone)))
    return [r for r in runs if r[1] - r[0] >= MARK_MIN_FRAMES]


def marked_windows(runs: list[tuple[int, int]], phases: dict, n_diffs: int) -> dict | None:
    """
    The four markers bracket idle, scroll, idle. Each expected wall-clock boundary takes the nearest
    marker within the tolerance, in order; any boundary without one means no verdict.
    Windows are ranges of frame-pair indices (diffs[i] is between frame i and i + 1) from one marker's first
    frame to the next one's, minus the frames on which the tones change (or a marker vanishes).
    """
    expected = [phases["idle"][0][0], phases["idle"][0][1], phases["idle"][1][0], phases["idle"][1][1]]
    chosen: list[tuple[int, int]] = []
    pos = 0
    for wall in expected:
        best = None
        for j in range(pos, len(runs)):
            distance = abs(runs[j][0] / FPS - wall)
            if distance <= MARK_TOLERANCE_S and (best is None or distance < best[0]):
                best = (distance, j)
        if best is None:
            return None
        chosen.append(runs[best[1]])
        pos = best[1] + 1
    a, s, b, e = chosen

    def between(first: tuple[int, int], second: tuple[int, int]) -> list[tuple[int, int]]:
        lo = first[0] + MARK_MARGIN
        hi = min(second[0] - 1 - MARK_MARGIN, n_diffs - 1)
        if first[1] < second[0]:  # the first marker vanished before the next appeared: skip that transition too
            return [(lo, first[1] - 2 - MARK_MARGIN), (first[1] + MARK_MARGIN, hi)]
        return [(lo, hi)]

    return {"idle": between(a, s) + between(b, e), "scroll": between(s, b)}


def motion_energy(video: Path, phases: dict | None) -> dict:
    """Per-phase mean frame difference. `idle` is the headline: motion nobody asked for."""
    raw = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(video),
         "-vf", f"scale={W}:{H}:flags=area,format=gray", "-f", "rawvideo", "-"],
        check=True, capture_output=True,
    ).stdout
    frames = np.frombuffer(raw, dtype=np.uint8).reshape(-1, H, W).astype(np.int16)
    if len(frames) < 2:
        return {"idle": 0.0, "scroll": 0.0, "all": 0.0, "frames": int(len(frames)), "phaseSource": "none"}
    pixel_diffs = np.abs(np.diff(frames, axis=0))
    pixel_diffs[pixel_diffs < NOISE_FLOOR] = 0
    diffs = pixel_diffs.mean(axis=(1, 2))
    t = (np.arange(len(diffs)) + 1) / FPS  # time of the later frame of each pair

    def window_mean(mask: np.ndarray) -> float:
        return round(float(diffs[mask].mean()), 4) if mask.any() else float("nan")

    def wall_mask(windows: list) -> np.ndarray:
        # 0.3 s margin at both ends: the video timeline drifts against the wall clock, so frames from the
        # wheel start or from whatever follows the scenario can land right on the edge.
        mask = np.zeros(len(diffs), dtype=bool)
        for start, end in windows:
            mask |= (t >= start + 0.3) & (t <= end - 0.3)
        return mask

    def frame_mask(windows: list) -> np.ndarray:
        mask = np.zeros(len(diffs), dtype=bool)
        for lo, hi in windows:
            if hi >= lo:
                mask[lo : hi + 1] = True
        return mask

    if not phases:
        return {"idle": float("nan"), "scroll": float("nan"), "all": round(float(diffs.mean()), 4),
                "frames": int(len(frames)), "phaseSource": "none"}
    located = marked_windows(marker_runs(frames), phases, len(diffs)) if phases.get("marked") else None
    if located:
        idle, scroll = window_mean(frame_mask(located["idle"])), window_mean(frame_mask(located["scroll"]))
        seconds = {k: [[round(lo / FPS, 2), round((hi + 1) / FPS, 2)] for lo, hi in v if hi >= lo] for k, v in located.items()}
        return {"idle": idle, "scroll": scroll, "all": round(float(diffs.mean()), 4), "frames": int(len(frames)),
                "phaseSource": "markers", "windows": seconds}
    if phases.get("marked"):
        print("(markers not found, wall-clock windows) ", end="", flush=True)
    idle, scroll = window_mean(wall_mask(phases["idle"])), window_mean(wall_mask([phases["scroll"]]))
    return {"idle": idle, "scroll": scroll, "all": round(float(diffs.mean()), 4), "frames": int(len(frames)),
            "phaseSource": "wall-clock"}


def iris(video: Path) -> dict | None:
    try:
        from iris_pse_detection import Configuration, VideoAnalyser
    except ImportError:
        print("  (IRIS not installed: pip install -r bench/requirements.txt)", file=sys.stderr)
        return None
    import contextlib
    import io

    config = Configuration()
    # IRIS writes a framedata.csv per video into `results_path` (default "Results/",
    # relative to the CWD, which polluted the repository root). Keep it inside bench/.
    config.results_path = str(RESULTS / "iris")
    with contextlib.redirect_stdout(io.StringIO()):  # IRIS prints a disclaimer banner
        result = VideoAnalyser(config).analyse_video(str(video))
    lum = result.total_luminance_incidents
    red = result.total_red_incidents
    return {
        "overall": result.overall_result.name,
        "luminanceFailFrames": lum.flash_fail_frames,
        "luminanceExtendedFailFrames": lum.extended_fail_frames,
        "redFailFrames": red.flash_fail_frames,
        "redExtendedFailFrames": red.extended_fail_frames,
        "warningFrames": lum.pass_with_warning_frames + red.pass_with_warning_frames,
        "totalFrames": result.total_frames,
    }


def clean(value):
    """JSON has no NaN: missing measurements become null."""
    if isinstance(value, float) and value != value:
        return None
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items()}
    if isinstance(value, list):
        return [clean(v) for v in value]
    return value


def main() -> None:
    runs = json.loads((RESULTS / "runs.json").read_text())
    previous: dict = {}
    if (RESULTS / "analysis.json").exists():
        try:
            previous = json.loads((RESULTS / "analysis.json").read_text())
        except json.JSONDecodeError:
            previous = {}
    analysis: dict[str, dict] = {}
    analysed = cached = 0
    for record in runs["records"]:
        if not record.get("ok") or not record.get("video"):
            continue  # failed loads are reported as failures, not measured
        key = f'{record["site"]}-{record["condition"]}'
        video = ROOT / record["video"]
        cfr = constant_rate_copy(video)
        # Incremental: an unchanged constant-rate copy was already measured.
        source = {"mtime": cfr.stat().st_mtime, "size": cfr.stat().st_size, "analyser": ANALYSER_VERSION}
        prev = previous.get(key)
        if prev and prev.get("source") == source:
            analysis[key] = prev
            cached += 1
            continue
        print(f"{key} … ", end="", flush=True)
        entry = {"source": source, "motionEnergy": motion_energy(cfr, record.get("phases")), "iris": iris(cfr)}
        analysis[key] = entry
        analysed += 1
        flash = entry["iris"]["overall"] if entry["iris"] else "n/a"
        me = entry["motionEnergy"]
        print(f'idle motion {me["idle"]:.3f}, scroll motion {me["scroll"]:.3f}, IRIS {flash}')
    (RESULTS / "analysis.json").write_text(json.dumps(clean(analysis), indent=2, allow_nan=False))
    print(f"\n{len(analysis)} videos in analysis.json ({analysed} analysed now, {cached} cached) → bench/results/analysis.json")


if __name__ == "__main__":
    main()
