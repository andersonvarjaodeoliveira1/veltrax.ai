"""Leitura da página: média, destaques e o próximo passo (espalhar, achar, encher)."""
from datetime import UTC, datetime, timedelta

from src.facebook_reading import parse_countries, read_page

NOW = datetime(2026, 11, 15, tzinfo=UTC)


def videos(*views: int) -> list[dict]:
    """O primeiro número é o vídeo mais recente."""
    return [{"id": str(i), "title": f"vídeo {i}", "link": "", "published_at": NOW - timedelta(days=i), "views": v} for i, v in enumerate(views)]


def test_few_videos_asks_for_more():
    out = read_page(videos(200, 180, 90))

    assert out["status"] == "poucos" and out["total"] == 3


def test_flat_page_keeps_spreading():
    out = read_page(videos(200, 34, 3, 250, 208, 37, 180, 220))

    assert out["status"] == "espalhar" and "lead" not in out
    assert out["base"] == 190


def test_standout_video_switches_to_filling():
    out = read_page(videos(210, 5500, 180, 250, 230, 190, 260, 240))

    assert out["status"] == "encher"
    assert out["lead"]["views"] == 5500 and out["lead"]["tag"] == "viral"
    assert "Arquivo novo" in out["next"]


def test_three_times_the_average_is_a_signal_not_yet_viral():
    out = read_page(videos(250, 240, 800, 260, 230, 250, 245, 255))

    assert out["status"] == "encher" and out["lead"]["tag"] == "sinal"


def test_zero_view_page_does_not_call_thirty_views_a_standout():
    out = read_page(videos(0, 3, 30, 0, 2, 6, 4, 1))

    assert out["status"] == "espalhar" and out["base"] == 50
    assert all(v["tag"] == "" for v in out["videos"])


def test_standout_that_cooled_goes_back_to_spreading():
    out = read_page(videos(90, 120, 80, 5500, 250, 230, 260, 240, 250, 245))

    assert out["status"] == "espalhar" and out["lead"]["views"] == 5500
    assert "esfriou" in out["message"]


def test_old_standout_outside_the_recent_window_does_not_lead():
    recent = [200] * 10
    out = read_page(videos(*recent, 9000, 210, 190))

    assert out["status"] == "espalhar" and "ficou para trás" in out["message"]


def test_videos_without_date_go_last_and_order_is_newest_first():
    items = videos(100, 200, 300, 400, 500)
    items.append({"id": "x", "title": "sem data", "link": "", "published_at": None, "views": 999})

    out = read_page(items)

    assert [v["id"] for v in out["videos"]] == ["0", "1", "2", "3", "4", "x"]


def test_parse_countries_normalizes_and_limits():
    assert parse_countries("us, ca; UK au  nz") == ["US", "CA", "GB", "AU", "NZ"]
    assert parse_countries(["US", "us", "Brasil", "1A", ""]) == ["US"]
    assert parse_countries(None) == [] and parse_countries("") == []
