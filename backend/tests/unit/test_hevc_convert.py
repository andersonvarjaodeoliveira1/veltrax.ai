import shutil
import subprocess

import pytest

from src.api.routes.clone_plan import _ensure_browser_video, _video_codec

pytestmark = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="sem ffmpeg")


def _make(path, codec):
    r = subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=15:duration=1", "-c:v", codec, "-pix_fmt", "yuv420p", str(path)], capture_output=True)
    if r.returncode != 0:
        pytest.skip(f"ffmpeg sem {codec}")


def test_hevc_vira_h264(tmp_path):
    src = tmp_path / "a.mp4"
    _make(src, "libx265")
    assert _video_codec(str(src)) == "hevc"
    out = _ensure_browser_video(str(src))
    assert out != str(src)
    assert _video_codec(out) == "h264"


def test_h264_fica_como_esta(tmp_path):
    src = tmp_path / "b.mp4"
    _make(src, "libx264")
    assert _ensure_browser_video(str(src)) == str(src)
