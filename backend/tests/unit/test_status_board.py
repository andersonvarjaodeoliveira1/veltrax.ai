"""Quadro de status do administrador e o plano B da leitura de visualizações."""
import httpx
import pytest

from src import facebook_meta
from src.status_board import meta_app_status, permission_rows


def test_permission_rows_tell_approved_pending_and_not_requested():
    rows = {r["name"]: r for r in permission_rows(
        [{"permission": "pages_show_list", "status": "live"}, {"permission": "pages_messaging", "status": "unapproved"}],
        ["pages_show_list", "pages_messaging"])}

    assert rows["pages_show_list"]["status"] == "aprovada" and rows["pages_show_list"]["granted"] == "sim"
    assert rows["pages_messaging"]["status"] == "pendente"
    assert rows["read_insights"]["status"] == "nao_pedida" and rows["read_insights"]["granted"] == "nao"


@pytest.mark.asyncio
async def test_meta_app_status_never_carries_secrets_and_survives_errors():
    seen = []

    async def graph(path, params):
        seen.append(path)
        if path.endswith("/permissions"):
            return {"data": [{"permission": "pages_manage_posts", "status": "live"}, {"permission": "email", "status": "live"}]}
        return {"data": {"scopes": ["pages_manage_posts"]}}

    out = await meta_app_status(graph, "token-do-acesso", ("123", "segredo"))

    assert seen == ["123/permissions", "debug_token"]
    assert "segredo" not in repr(out) and "token-do-acesso" not in repr(out)
    assert out["others_live"] == ["email"]
    assert next(r for r in out["permissions"] if r["name"] == "pages_manage_posts") == {"name": "pages_manage_posts", "use": "Publicar e agendar posts", "status": "aprovada", "granted": "sim"}

    async def broken(path, params):
        raise ValueError("(#100) sem acesso")

    out = await meta_app_status(broken, None, ("123", "segredo"))
    assert "sem acesso" in out["error"] and all(r["status"] == "nao_pedida" for r in out["permissions"])
    assert (await meta_app_status(broken, None, None))["configured"] is False


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_views_come_from_the_list_when_facebook_gives_them():
    def handler(request):
        assert "video_insights" not in request.url.path
        return httpx.Response(200, json={"data": [{"id": "1", "description": "a", "created_time": "2026-11-14T10:00:00+0000", "permalink_url": "/p/videos/1/", "views": 320}]})

    async with _client(handler) as client:
        out = await facebook_meta.page_videos("55", "tok", client)

    assert out[0]["views"] == 320 and out[0]["link"] == "https://www.facebook.com/p/videos/1/"


@pytest.mark.asyncio
async def test_zeroed_views_fall_back_to_video_insights():
    def handler(request):
        if "video_insights" in request.url.path:
            return httpx.Response(200, json={"data": [{"name": "total_video_views", "values": [{"value": 0}]}, {"name": "blue_reels_play_count", "values": [{"value": 5400}]}]})
        return httpx.Response(200, json={"data": [{"id": "1", "description": "a", "views": 0}]})

    async with _client(handler) as client:
        out = await facebook_meta.page_videos("55", "tok", client)

    assert out[0]["views"] == 5400


@pytest.mark.asyncio
async def test_denied_views_keep_the_reason():
    def handler(request):
        if "views" in request.url.params.get("fields", "") or "video_insights" in request.url.path:
            return httpx.Response(400, json={"error": {"message": "(#10) Application does not have permission for this action", "code": 10}})
        return httpx.Response(200, json={"data": [{"id": "1", "description": "a"}]})

    async with _client(handler) as client:
        with pytest.raises(ValueError) as failure:
            await facebook_meta.page_videos("55", "tok", client)

    assert "read_insights" in str(failure.value) and "postar" not in str(failure.value)


@pytest.mark.asyncio
async def test_zero_from_the_list_stands_when_statistics_are_denied():
    """A lista trouxe o campo (zerado) e as estatísticas foram negadas: é zero, não é erro."""
    def handler(request):
        if "video_insights" in request.url.path:
            return httpx.Response(400, json={"error": {"message": "(#200) Requires read_insights permission", "code": 200}})
        return httpx.Response(200, json={"data": [{"id": "1", "description": "a", "views": 0}, {"id": "2", "description": "b", "views": 0}]})

    async with _client(handler) as client:
        out = await facebook_meta.page_videos("55", "tok", client)

    assert [v["views"] for v in out] == [0, 0]


@pytest.mark.asyncio
async def test_real_zero_views_are_not_an_error():
    def handler(request):
        if "video_insights" in request.url.path:
            return httpx.Response(200, json={"data": [{"name": "total_video_views", "values": [{"value": 0}]}]})
        return httpx.Response(200, json={"data": [{"id": "1", "description": "a", "views": 0}]})

    async with _client(handler) as client:
        out = await facebook_meta.page_videos("55", "tok", client)

    assert out[0]["views"] == 0
