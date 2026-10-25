import subprocess
from pathlib import Path

import pytest

from src.media.ffmpeg import ffprobe_duration

pytestmark = pytest.mark.skipif(subprocess.run(["which", "ffmpeg"], capture_output=True).returncode != 0, reason="ffmpeg missing")


def test_duration_for_streamed_webm_without_container_duration(tmp_path: Path):
    # Streaming a webm to a pipe leaves the container duration out ("N/A").
    out = tmp_path / "live.webm"
    with open(out, "wb") as handle:
        subprocess.run(
            ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=3", "-c:v", "libvpx", "-f", "webm", "-"],
            stdout=handle, check=True,
        )
    assert ffprobe_duration(out) == pytest.approx(3, abs=0.6)
