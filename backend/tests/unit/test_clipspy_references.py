"""Arquivo de referências manual do ClipSpy: só entra o que a pessoa digitou."""
import pytest

from src.clipspy_references import link_key, manual_reference, parse_count


def test_counts_are_read_the_way_they_show_on_screen():
    assert parse_count("224 mil") == 224_000
    assert parse_count("1,5 mi") == 1_500_000
    assert parse_count("12k") == 12_000
    assert parse_count("224.000") == 224_000
    assert parse_count(" 1 500 ") == 1500
    assert parse_count(3200) == 3200
    assert parse_count("") is None and parse_count("muitas") is None and parse_count(None) is None


def test_same_video_has_the_same_key_whatever_the_tracking():
    a = link_key("https://www.facebook.com/reel/1234567890/?mibextid=abc&ref=share")
    assert a == link_key("https://m.facebook.com/reel/1234567890") == "facebook.com/reel/1234567890"
    assert link_key("https://www.youtube.com/watch?v=abc123&t=10s") == "youtube.com/watch?v=abc123"
    assert link_key("https://www.youtube.com/watch?v=abc123") != link_key("https://www.youtube.com/watch?v=zzz999")


def test_reference_keeps_only_what_was_typed():
    ref = manual_reference({"link": "https://www.facebook.com/reel/123/?mibextid=x", "text": "  Stop scrolling\n if your knees hurt. ",
                            "advertiser": "Página Exemplo", "views": "224 mil", "comments": "1.500", "note": "manequim, consultório", "champion": True})

    assert ref["source"] == "manual" and ref["permalink"].startswith("https://www.facebook.com/reel/123")
    assert ref["title"] == "Stop scrolling if your knees hurt."
    assert ref["metrics"] == {"views": 224_000, "comments": 1500, "note": "manequim, consultório"}
    assert ref["score"] == 224_000.0 and ref["is_champion"] is True and ref["term"] == "facebook.com"
    again = manual_reference({"link": "https://m.facebook.com/reel/123"})
    assert again["external_id"] == ref["external_id"] and again["metrics"] == {} and again["title"] == ""


def test_bad_link_and_bad_numbers_explain_what_to_fix():
    with pytest.raises(ValueError, match="link completo"):
        manual_reference({"link": "facebook reel do manequim"})
    with pytest.raises(ValueError, match="link completo"):
        manual_reference({"link": "javascript:alert(1)"})
    with pytest.raises(ValueError, match="números"):
        manual_reference({"link": "https://www.facebook.com/reel/1", "views": "bastante"})
