from src import youtube_utils as yt


def test_info_tries_next_player_client_when_first_is_blocked(monkeypatch):
    seen = []

    class Fake:
        def __init__(self, opts):
            self.opts = opts

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def extract_info(self, url, download=False):
            client = (self.opts.get("extractor_args") or {}).get("youtube", {}).get("player_client")
            seen.append(client)
            if client != ["mweb"]:
                raise RuntimeError("Sign in to confirm you're not a bot")
            return {"id": "abcdefghijk", "title": "t", "duration": 90}

    monkeypatch.setattr(yt.yt_dlp, "YoutubeDL", Fake)
    info = yt._fetch_video_info_with_ytdlp("https://youtu.be/abcdefghijk")
    assert info["duration"] == 90
    assert seen == [None, ["tv"], ["mweb"]]


def test_proxy_env_is_applied(monkeypatch):
    monkeypatch.setenv("YOUTUBE_PROXY", "http://p:1")
    assert yt._apply_client({}, None)["proxy"] == "http://p:1"
