from types import SimpleNamespace

from src.security_guard import Guard


def req(path="/tasks/", ua="Mozilla/5.0", ip="8.8.4.4", xff=True):
    headers = {"user-agent": ua}
    if xff:
        headers["x-forwarded-for"] = ip
    return SimpleNamespace(url=SimpleNamespace(path=path), headers=headers, client=SimpleNamespace(host=ip))


def test_scanner_user_agent_is_blocked_and_banned():
    g = Guard()
    assert g.check(req(ua="sqlmap/1.7"), 0) == "scanner"
    assert g.check(req(), 1) == "banned"  # o IP fica bloqueado por um tempo
    assert g.check(req(), 10_000) is None  # e volta depois


def test_probe_paths_are_blocked():
    g = Guard()
    assert g.check(req("/.env"), 0) == "probe"
    assert Guard().check(req("/wp-login.php"), 0) == "probe"


def test_normal_browser_and_health_pass():
    g = Guard()
    assert g.check(req("/tasks/"), 0) is None
    for i in range(500):
        assert g.check(req("/health"), i * 0.01) is None


def test_rate_limit_for_external_ips_only():
    g = Guard()
    results = [g.check(req(), i * 0.01) for i in range(300)]
    assert "rate" in results
    internal = Guard()
    assert all(internal.check(req(ip="172.18.0.5", xff=False), i * 0.01) is None for i in range(1000))


def test_many_404s_ban_external_ip():
    g = Guard()
    for i in range(6):
        g.note_status(req("/nada-%d" % i), 404, i)
    assert g.check(req(), 7) == "banned"
