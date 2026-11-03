import asyncio

from src import activity


def test_record_never_raises_without_database(monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("db down")

    monkeypatch.setattr(activity, "_insert", boom, raising=False)
    asyncio.run(activity.record("u1", activity.IMAGE, "x"))


def test_error_kinds_cover_failures():
    assert activity.ERROR in activity.ERROR_KINDS
    assert activity.TEXT_FAIL in activity.ERROR_KINDS
