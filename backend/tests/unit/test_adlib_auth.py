"""Renovação automática do acesso à Ad Library: troca, renovação, e os casos em que só um login novo resolve."""
import pytest

from src import adlib_auth as aa

DAY = aa.DAY
NOW = 1_800_000_000.0
APP = ("111", "segredo")


class FakeGraph:
    def __init__(self, tokens: dict[str, dict], exchange=None):
        self.tokens = tokens  # token -> {"expires_at": int, "app_id": str, "valid": bool}
        self.exchange = exchange  # (novo_token, expires_in) | Exception | None
        self.calls: list[str] = []

    async def __call__(self, path: str, params: dict[str, str]) -> dict:
        self.calls.append(path)
        if path == "debug_token":
            info = self.tokens.get(params["input_token"])
            if info is None:
                raise aa.GraphError("Session has expired", 190)
            return {"data": {"is_valid": info.get("valid", True), "expires_at": info["expires_at"], "app_id": info.get("app_id", APP[0])}}
        if path == "ads_archive":
            if not self.tokens.get(params["access_token"], {}).get("adlib", True):
                raise aa.GraphError("Application does not have permission for this action", 10)
            return {"data": []}
        assert path == "oauth/access_token" and params["grant_type"] == "fb_exchange_token"
        assert params["client_id"] == APP[0] and params["client_secret"] == APP[1]
        if isinstance(self.exchange, Exception):
            raise self.exchange
        token, expires_in = self.exchange
        self.tokens[token] = {"expires_at": int(NOW + expires_in)}
        return {"access_token": token, "expires_in": expires_in}


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    aa._state.clear()
    monkeypatch.setattr(aa, "_loaded", True)
    seeds: list[tuple[str, str]] = []
    saved: list[dict] = []
    alerts: list[float] = []

    async def fake_save(_factory):
        saved.append(dict(aa._state))

    async def fake_alert(now):
        alerts.append(now)
        return True

    logins: list[tuple[str, str]] = []

    async def fake_logins(_factory):
        return list(logins)

    monkeypatch.setattr(aa, "_login_candidates", fake_logins)
    monkeypatch.setattr(aa, "_seeds", lambda: list(seeds))
    monkeypatch.setattr(aa, "_save", fake_save)
    monkeypatch.setattr(aa, "_maybe_alert", fake_alert)
    monkeypatch.setattr(aa, "app_credentials", lambda: APP)
    return {"seeds": seeds, "saved": saved, "alerts": alerts, "logins": logins}


async def test_short_token_is_exchanged_for_a_long_one_right_away(clean):
    clean["seeds"].append(("admin", "curto"))
    graph = FakeGraph({"curto": {"expires_at": int(NOW + 3600)}}, exchange=("longo", 60 * DAY))

    snap = await aa.tick(None, now=NOW, graph=graph)

    assert aa.current_token() == "longo"
    assert snap["status"] == "ok" and snap["auto"] is True and snap["days_left"] == 60
    assert clean["saved"] and clean["saved"][-1]["token"] == "longo"


async def test_no_meta_calls_between_routine_checks(clean):
    clean["seeds"].append(("ambiente", "curto"))
    graph = FakeGraph({"curto": {"expires_at": int(NOW + 3600)}}, exchange=("longo", 60 * DAY))
    await aa.tick(None, now=NOW, graph=graph)
    graph.calls.clear()

    await aa.tick(None, now=NOW + 3600, graph=graph)

    assert graph.calls == []


async def test_long_token_is_renewed_after_a_week(clean):
    clean["seeds"].append(("admin", "curto"))
    graph = FakeGraph({"curto": {"expires_at": int(NOW + 3600)}}, exchange=("longo", 60 * DAY))
    await aa.tick(None, now=NOW, graph=graph)

    later = NOW + 8 * DAY
    graph.exchange = ("longo2", 60 * DAY)
    graph.tokens["longo2"] = {"expires_at": int(later + 60 * DAY)}

    async def graph_later(path, params):
        out = await graph(path, params)
        if path == "oauth/access_token":
            graph.tokens["longo2"] = {"expires_at": int(later + 60 * DAY)}
        return out

    snap = await aa.tick(None, now=later, graph=graph_later)

    assert aa.current_token() == "longo2"
    assert snap["status"] == "ok" and snap["days_left"] == 60


async def test_fresh_long_token_is_left_alone(clean):
    clean["seeds"].append(("admin", "longo"))
    graph = FakeGraph({"longo": {"expires_at": int(NOW + 59 * DAY)}})

    snap = await aa.tick(None, now=NOW, graph=graph)

    assert graph.calls == ["debug_token"]
    assert snap["status"] == "ok" and snap["auto"] is True


async def test_expired_token_asks_for_a_new_one(clean):
    clean["seeds"].append(("ambiente", "morto"))
    graph = FakeGraph({})

    snap = await aa.tick(None, now=NOW, graph=graph)

    assert snap["status"] == "expirado" and snap["auto"] is False
    assert "oauth/access_token" not in graph.calls


async def test_token_from_another_app_cannot_be_renewed(clean):
    clean["seeds"].append(("admin", "alheio"))
    graph = FakeGraph({"alheio": {"expires_at": int(NOW + 40 * DAY), "app_id": "999"}})

    snap = await aa.tick(None, now=NOW, graph=graph)

    assert snap["status"] == "outro_app" and snap["auto"] is False
    assert aa.current_token() == "alheio"


async def test_without_app_credentials_the_token_still_works(clean, monkeypatch):
    monkeypatch.setattr(aa, "app_credentials", lambda: None)
    clean["seeds"].append(("ambiente", "longo"))
    graph = FakeGraph({"longo": {"expires_at": int(NOW + 30 * DAY)}})

    snap = await aa.tick(None, now=NOW, graph=graph)

    assert snap["status"] == "sem_app" and snap["days_left"] == 30
    assert aa.current_token() == "longo"


async def test_refused_renewal_near_the_end_is_reported(clean):
    clean["seeds"].append(("admin", "curto"))
    graph = FakeGraph({"curto": {"expires_at": int(NOW + 3600)}}, exchange=aa.GraphError("Invalid OAuth access token", 190))

    snap = await aa.tick(None, now=NOW, graph=graph)

    assert snap["status"] == "vencendo" and snap["auto"] is False
    assert aa.current_token() == "curto"


async def test_same_expiry_from_meta_is_not_counted_as_renewed(clean):
    clean["seeds"].append(("admin", "longo"))
    aa._state.update(seen=[aa._fp("longo")], token="longo", status="ok", checked_at=0, renewed_at=0)
    graph = FakeGraph({"longo": {"expires_at": int(NOW + 5 * DAY)}}, exchange=("longo", 5 * DAY))

    snap = await aa.tick(None, now=NOW, graph=graph)

    assert snap["status"] == "vencendo" and snap["days_left"] == 5


async def test_a_newly_pasted_token_replaces_the_stored_one(clean):
    clean["seeds"].append(("ambiente", "velho"))
    graph = FakeGraph({"velho": {"expires_at": int(NOW + 59 * DAY)}, "novo": {"expires_at": int(NOW + 59 * DAY)}})
    await aa.tick(None, now=NOW, graph=graph)
    assert aa.current_token() == "velho"

    clean["seeds"].insert(0, ("admin", "novo"))
    assert aa.current_token() == "novo"  # vale na hora, antes mesmo do próximo ciclo
    await aa.tick(None, now=NOW + 60, graph=graph)

    assert aa._state["token"] == "novo" and aa._state["source"] == "admin"


async def test_facebook_login_of_an_admin_is_used_when_nothing_was_pasted(clean):
    clean["logins"].append(("facebook: Jaah Alves", "login"))
    graph = FakeGraph({"login": {"expires_at": int(NOW + 58 * DAY)}})

    snap = await aa.tick(None, now=NOW, graph=graph)

    assert aa.current_token() == "login"
    assert snap["status"] == "ok" and snap["auto"] is True and snap["source"] == "facebook: Jaah Alves"


async def test_expired_pasted_token_falls_back_to_the_facebook_login(clean):
    clean["seeds"].append(("ambiente", "morto"))
    graph = FakeGraph({"login": {"expires_at": int(NOW + 58 * DAY)}})
    assert (await aa.tick(None, now=NOW, graph=graph))["status"] == "expirado"

    clean["logins"].append(("facebook: Jaah Alves", "login"))
    snap = await aa.tick(None, now=NOW + 60, graph=graph)

    assert aa.current_token() == "login" and snap["status"] == "ok"


async def test_login_without_ad_library_access_is_skipped_and_explained(clean):
    clean["logins"].extend([("facebook: Perfil Novo", "sem-acesso"), ("facebook: Jaah Alves", "login")])
    graph = FakeGraph({"sem-acesso": {"expires_at": int(NOW + 58 * DAY), "adlib": False}, "login": {"expires_at": int(NOW + 58 * DAY)}})

    await aa.tick(None, now=NOW, graph=graph)
    assert aa.current_token() == "login"

    aa._state.clear()
    clean["logins"].pop()
    snap = await aa.tick(None, now=NOW, graph=graph)

    assert aa.current_token() is None and snap["status"] == "ausente"
    assert "Perfil Novo" in snap["detail"]
    graph.calls.clear()
    await aa.tick(None, now=NOW + 60, graph=graph)
    assert graph.calls == []  # não testa de novo o acesso que já não serviu


async def test_healthy_token_does_not_look_at_facebook_logins(clean):
    clean["seeds"].append(("admin", "longo"))
    clean["logins"].append(("facebook: Jaah Alves", "login"))
    graph = FakeGraph({"longo": {"expires_at": int(NOW + 59 * DAY)}, "login": {"expires_at": int(NOW + 58 * DAY)}})

    await aa.tick(None, now=NOW, graph=graph)
    await aa.tick(None, now=NOW + 7 * 3600, graph=graph)

    assert aa.current_token() == "longo" and "ads_archive" not in graph.calls


async def test_snapshot_never_carries_the_token(clean):
    clean["seeds"].append(("admin", "segredo-do-token"))
    graph = FakeGraph({"segredo-do-token": {"expires_at": int(NOW + 59 * DAY)}})

    snap = await aa.tick(None, now=NOW, graph=graph)

    assert "segredo-do-token" not in repr(snap)
    assert set(snap) == {"status", "days_left", "never_expires", "auto", "detail", "source", "checked_at", "renewed_at"}


async def test_alert_email_explains_what_to_do():
    content = aa._alert_content({"status": "vencendo", "days_left": 3, "detail": "A Meta não está renovando esse acesso."})

    assert "vence em 3 dias" in content.subject
    assert "Token da Ad Library" in content.text
