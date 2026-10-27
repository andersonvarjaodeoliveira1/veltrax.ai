from src.api.routes import clone_plan as cp


def test_only_known_video_sites_over_https():
    for ok in ("https://www.tiktok.com/@a/video/1", "https://vm.tiktok.com/ZM123/", "https://www.instagram.com/reel/abc/", "https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=x", "https://x.com/u/status/1"):
        assert cp._is_link_video_url(ok), ok
    for bad in ("http://www.tiktok.com/x", "https://evil.com/tiktok.com", "https://tiktok.com.evil.com/x", "https://localhost/video", "https://169.254.169.254/latest", "file:///etc/passwd", "ftp://tiktok.com/x"):
        assert not cp._is_link_video_url(bad), bad
