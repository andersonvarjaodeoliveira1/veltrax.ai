import httpx
import pytest

from src import clipspy_pages as cp
from src.clipspy_references import manual_reference


@pytest.mark.parametrize("value, kind, out", [
    ("https://www.facebook.com/NationalGeographic", "username", "NationalGeographic"),
    ("facebook.com/nasa/", "username", "nasa"),
    ("https://m.facebook.com/profile.php?id=100064812345678", "id", "100064812345678"),
    ("https://www.facebook.com/people/Body-Explained/61550000000001/", "id", "61550000000001"),
    ("https://www.facebook.com/p/The-Curious-Mind-100091234567890/", "id", "100091234567890"),
    ("https://www.facebook.com/pages/Some-Page/123456789012", "id", "123456789012"),
    ("https://www.facebook.com/nasa/videos/123", "username", "nasa"),
    ("104958162837", "id", "104958162837"),
    ("@nasa.earth", "username", "nasa.earth"),
    ("  National   Geographic ", "name", "National Geographic"),
])
def test_what_the_person_typed_becomes_a_page_reference(value, kind, out):
    assert cp.parse_page_ref(value) == {"kind": kind, "value": out}


@pytest.mark.parametrize("value", ["", "https://www.instagram.com/nasa", "https://www.facebook.com/watch/?v=1", "https://www.facebook.com/reel/123", "https://www.facebook.com/groups/abc", "https://www.facebook.com/"])
def test_addresses_that_are_not_a_page_are_refused_with_a_message(value):
    with pytest.raises(ValueError):
        cp.parse_page_ref(value)


def test_post_row_keeps_only_public_totals():
    row = cp.post_row({"id": "1_2", "message": "Three  signs\nyou need water", "created_time": "2026-11-10T12:00:00+0000", "permalink_url": "https://www.facebook.com/1/posts/2",
                       "shares": {"count": 40}, "reactions": {"data": [], "summary": {"total_count": 900}}, "comments": {"data": [{"from": {"name": "Ana"}, "message": "wow"}], "summary": {"total_count": 60}},
                       "attachments": {"data": [{"media_type": "video"}]}})
    assert (row["reactions"], row["comments"], row["shares"], row["engagement"], row["kind"]) == (900, 60, 40, 1000, "vídeo")
    assert row["text"] == "Three signs you need water" and "Ana" not in str(row)


def test_rank_and_summary_point_to_the_standout():
    posts = [cp.post_row({"id": str(i), "created_time": f"2026-11-{i:02d}T10:00:00+0000", "reactions": {"summary": {"total_count": total}}}) for i, total in enumerate([20, 30, 25, 400, 22], start=1)]
    assert cp.rank(posts)[0]["id"] == "4" and cp.rank(posts, "recentes")[0]["id"] == "5"
    assert cp.summary(posts) == {"posts": 5, "average": 25, "standouts": 1}
    assert cp.summary([]) == {"posts": 0, "average": 0, "standouts": 0}


def test_facebook_refusals_become_clear_messages():
    blocked = cp.explain({"error": {"code": 10, "message": "(#10) To use 'Page Public Content Access', your use of this endpoint must be reviewed and approved by Facebook."}}, 400)
    assert blocked.needs_feature and "Page Public Content Access" in str(blocked)
    assert cp.explain({"error": {"code": 190, "message": "Error validating access token"}}, 400).expired
    missing = cp.explain({"error": {"code": 803, "message": "(#803) Some of the aliases you requested do not exist: xyz"}}, 404)
    assert "Não encontrei" in str(missing) and not missing.needs_feature


@pytest.mark.asyncio
async def test_page_and_posts_come_from_the_graph_api():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["access_token"] == "tok"
        if request.url.path.endswith("/55/posts"):
            assert "reactions.summary(total_count)" in request.url.params["fields"]
            return httpx.Response(200, json={"data": [{"id": "55_1", "message": "a", "reactions": {"summary": {"total_count": 7}}}, {"message": "sem id"}]})
        if request.url.path.endswith("/pages/search"):
            return httpx.Response(400, json={"error": {"code": 10, "message": "(#10) This endpoint requires the 'Page Public Metadata Access' feature"}})
        return httpx.Response(200, json={"id": "55", "name": "Body Explained", "followers_count": 1200, "picture": {"data": {"url": "https://x/p.jpg"}}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        page = await cp.page_info("bodyexplained", "tok", client)
        posts = await cp.page_posts(page["id"], "tok", client)
        with pytest.raises(cp.PageAccessError) as refusal:
            await cp.find_pages("body", "tok", client)

    assert page == {"id": "55", "name": "Body Explained", "link": "https://www.facebook.com/55", "followers": 1200, "category": "", "picture": "https://x/p.jpg"}
    assert [p["id"] for p in posts] == ["55_1"] and posts[0]["engagement"] == 7
    assert refusal.value.needs_feature


def test_reference_from_a_page_post_keeps_the_engagement():
    ref = manual_reference({"link": "https://www.facebook.com/55/posts/1", "text": "Three signs you need water", "advertiser": "Body Explained", "reactions": 900, "comments": "60", "shares": 40})
    assert ref["metrics"] == {"comments": 60, "reactions": 900, "shares": 40} and ref["score"] == 1000.0
