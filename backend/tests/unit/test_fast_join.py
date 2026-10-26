import subprocess
from pathlib import Path

from src.api.routes.multiplier import render_combination
from src.media.ffmpeg import can_join_without_reencoding, ffprobe_duration


def _clip(path: Path, color: str, size: str = "270x480", seconds: int = 1) -> Path:
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"color=c={color}:s={size}:d={seconds}:r=30",
         "-f", "lavfi", "-i", f"sine=frequency=440:d={seconds}:sample_rate=48000", "-c:v", "libx264", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-shortest", str(path)],
        check=True,
    )
    return path


def test_same_format_clips_join_without_reencoding(tmp_path):
    parts = [_clip(tmp_path / "a.mp4", "red"), _clip(tmp_path / "b.mp4", "blue")]
    assert can_join_without_reencoding(parts, 270, 480)
    out = tmp_path / "out.mp4"
    render_combination(parts, out, 270, 480)
    assert out.exists() and 1.8 < ffprobe_duration(out) < 2.3


def test_different_sizes_are_reencoded_to_the_target(tmp_path):
    parts = [_clip(tmp_path / "a.mp4", "red"), _clip(tmp_path / "b.mp4", "blue", size="180x320")]
    assert not can_join_without_reencoding(parts, 270, 480)
    out = tmp_path / "out.mp4"
    render_combination(parts, out, 270, 480)
    assert out.exists() and 1.8 < ffprobe_duration(out) < 2.3
