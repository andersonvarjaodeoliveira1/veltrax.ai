import shutil
import subprocess

import pytest

from src.final_video import clean_options, render_final

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg ausente")


def _clip(path, color, seconds=2):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"color=c={color}:s=720x1280:r=30:d={seconds}",
         "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(path)],
        check=True,
    )


def test_options_fall_back_to_defaults():
    o = clean_options({"aspect": "4:3", "template": "nao-existe", "speed": 9, "title": "  Olá   mundo "})
    assert o["aspect"] == "9:16" and o["template"] == "default" and o["speed"] == 1.3 and o["title"] == "Olá mundo"


def test_joins_scenes_and_burns_caption_and_title(tmp_path):
    a, b = tmp_path / "a.mp4", tmp_path / "b.mp4"
    _clip(a, "blue"), _clip(b, "red")
    words = [{"text": t, "start": i * 0.5, "end": i * 0.5 + 0.45, "confidence": 1.0} for i, t in enumerate("olha isso aqui agora".split())]
    out = tmp_path / "final.mp4"
    steps: list[str] = []
    info = render_final([a, b], out, tmp_path, clean_options({"title": "Isso muda tudo", "speed": 1.1}), lambda _p: words, steps.append)
    assert out.exists() and out.stat().st_size > 0
    assert 3.2 < info["duration"] < 4.0  # 4 s acelerados 1,1x
    assert info["warning"] == ""
    assert steps[0] == "Juntando as cenas" and steps[-1] == "Gerando o vídeo final"


def test_no_speech_still_exports_with_warning(tmp_path):
    a = tmp_path / "a.mp4"
    _clip(a, "green")
    out = tmp_path / "final.mp4"
    info = render_final([a], out, tmp_path, clean_options({}), lambda _p: [], lambda _s: None)
    assert out.exists() and "sem legenda" in info["warning"]


from src.final_video import keep_ranges, remap_words


def test_keep_ranges_shortens_long_pauses_and_trims_edges():
    words = [{"text": "a", "start": 1.0, "end": 1.4}, {"text": "b", "start": 1.5, "end": 1.9}, {"text": "c", "start": 4.0, "end": 4.4}]
    ranges = keep_ranges(words, 6.0, "light")
    assert len(ranges) == 2 and ranges[0][0] < 1.0 and ranges[1][1] > 4.4
    assert keep_ranges(words, 6.0, "off") == [(0.0, 6.0)]
    new = remap_words(words, ranges)
    assert len(new) == 3 and new[2]["start"] < 4.0 - 1.0  # a pausa sumiu: "c" chega mais cedo
    assert all(w["end"] > w["start"] for w in new)


def test_silence_transition_and_denoise_end_to_end(tmp_path):
    a, b = tmp_path / "a.mp4", tmp_path / "b.mp4"
    _clip(a, "blue", 3), _clip(b, "red", 3)
    words = [{"text": "oi", "start": 0.8, "end": 1.2}, {"text": "tudo", "start": 1.3, "end": 1.7}, {"text": "bem", "start": 4.6, "end": 5.0}]
    out = tmp_path / "final.mp4"
    info = render_final([a, b], out, tmp_path, clean_options({"silence": "strong", "transition": "fade", "denoise": True, "title": "Teste"}), lambda _p: words, lambda _s: None)
    assert out.exists()
    assert info["duration"] < 5.6  # 6 s - 0,4 de transição, e as pausas saíram
    assert info["duration"] > 1.5


def test_options_new_fields_default_off():
    o = clean_options({})
    assert o["silence"] == "off" and o["transition"] == "none" and o["denoise"] is False
    o = clean_options({"silence": "x", "transition": "star", "denoise": "yes"})
    assert o["silence"] == "off" and o["transition"] == "none" and o["denoise"] is False
