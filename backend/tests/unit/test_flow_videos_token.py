import pytest
from fastapi import HTTPException

from src.api.routes import flow_videos as fv


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("BETTER_AUTH_SECRET", "unit-test-secret")
    monkeypatch.setattr(fv, "get_config", lambda: type("C", (), {"backend_auth_secret": None, "temp_dir": "/tmp"})())


def test_token_roundtrip():
    assert fv.read_token(fv.make_token("user-1")) == "user-1"


def test_token_rejects_tampering_and_expiry():
    token = fv.make_token("user-1", now=1000)
    with pytest.raises(HTTPException):
        fv.read_token(token, now=1000 + fv.TOKEN_TTL_SECONDS + 1)
    forged = fv.make_token("user-2").split(".")[0] + "." + token.split(".")[1]
    with pytest.raises(HTTPException):
        fv.read_token(forged)
    with pytest.raises(HTTPException):
        fv.read_token("lixo")


def test_clean_removes_path_chars():
    assert fv._clean("../a/b\\c.mp4\n", 50) == "..abc.mp4"
