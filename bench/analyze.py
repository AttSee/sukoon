#!/usr/bin/env python3
"""
M10 — Evidence bench, step 2: analyse every recorded video with neutral tools.

  * Motion energy: mean absolute luminance difference between consecutive
    frames, after downscaling to 160x90 greyscale (0 = perfectly still, 255 = max).
  * Flash risk: EA's IRIS (Python port, iris-pse-detection), which follows
    WCAG 2.3.1 and ISO 9241-391. Informational only, as IRIS itself states.

Both use a constant 30 fps copy of each recording, so the two conditions are
measured identically.

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


def motion_energy(video: Path, phases: dict | None) -> dict:
    """Per-phase mean frame difference. `idle` is the headline: motion nobody asked for."""
    raw = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(video),
         "-vf", f"scale={W}:{H}:flags=area,format=gray", "-f", "rawvideo", "-"],
        check=True, capture_output=True,
    ).stdout
    frames = np.frombuffer(raw, dtype=np.uint8).reshape(-1, H, W).astype(np.int16)
    if len(frames) < 2:
        return {"idle": 0.0, "scroll": 0.0, "all": 0.0, "frames": int(len(frames))}
    pixel_diffs = np.abs(np.diff(frames, axis=0))
    pixel_diffs[pixel_diffs < NOISE_FLOOR] = 0
    diffs = pixel_diffs.mean(axis=(1, 2))
    t = (np.arange(len(diffs)) + 1) / FPS  # time of the later frame of each pair

    def window_mean(windows: list) -> float:
        # 0.3 s margin at both ends: video timestamps run slightly ahead of the
        # wall clock used for phase boundaries, so frames from the wheel start
        # or the post-scenario scrollback can land right on the edge.
        mask = np.zeros(len(diffs), dtype=bool)
        for start, end in windows:
            mask |= (t >= start + 0.3) & (t <= end - 0.3)
        return round(float(diffs[mask].mean()), 4) if mask.any() else float("nan")

    idle = window_mean(phases["idle"]) if phases else float("nan")
    scroll = window_mean([phases["scroll"]]) if phases else float("nan")
    return {"idle": idle, "scroll": scroll, "all": round(float(diffs.mean()), 4), "frames": int(len(frames))}


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
        source = {"mtime": cfr.stat().st_mtime, "size": cfr.stat().st_size}
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
