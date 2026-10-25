import asyncio

import cv2
import numpy as np

from src.api.routes import clone_plan, multiplier


def test_silent_video_reads_burned_subtitles(tmp_path, monkeypatch):
    def fake_ffmpeg(command, timeout=900):
        pattern = command[-1]
        image = np.full((200, 100, 3), 90, dtype=np.uint8)
        for i in range(1, 5):
            cv2.imwrite(pattern.replace("%03d", f"{i:03d}"), image)

    class Out:
        lines = ["First sentence.", "  Second   sentence. ", ""]

    async def fake_run_parts(system, output_type, parts, model=None):
        assert sum(1 for part in parts if not isinstance(part, str)) == 4
        return Out()

    monkeypatch.setattr(multiplier, "run_ffmpeg_command", fake_ffmpeg)
    monkeypatch.setattr(clone_plan, "_run_parts", fake_run_parts)
    video = tmp_path / "v.mp4"
    video.write_bytes(b"x")
    lines = asyncio.run(multiplier._read_onscreen_text(video, 30.0, tmp_path))
    assert [line["text"] for line in lines] == ["First sentence.", "Second sentence."]
    assert lines[0]["start"] == 0 and lines[1]["end"] == 30.0
