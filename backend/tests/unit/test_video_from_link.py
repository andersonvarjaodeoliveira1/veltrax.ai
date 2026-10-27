from src.api.routes import clone_plan as cp


def test_only_known_video_sites_over_https():
    for ok in ("https://www.tiktok.com/@a/video/1", "https://vm.tiktok.com/ZM123/", "https://www.instagram.com/reel/abc/", "https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=x", "https://x.com/u/status/1"):
        assert cp._is_link_video_url(ok), ok
    for bad in ("http://www.tiktok.com/x", "https://evil.com/tiktok.com", "https://tiktok.com.evil.com/x", "https://localhost/video", "https://169.254.169.254/latest", "file:///etc/passwd", "ftp://tiktok.com/x"):
        assert not cp._is_link_video_url(bad), bad


def test_shopee_links_are_accepted_for_video():
    assert cp._is_link_video_url("https://shopee.com.br/Produto-i.1.2")
    assert cp._is_link_video_url("https://s.shopee.com.br/abc")


def test_shopee_page_videos_only_from_the_listing():
    seller = "https://down-bs.vod.susercontent.com/api/v4/11110105/mms/br-11110105-6ke15-abc.16000081.mp4"
    review = "https://down-bs.vod.susercontent.com/api/v4/11110105/mms/br-11110105-6ke15-review.16000081.mp4"
    html = (
        f'{{"video_info_list":[{{"default_format":{{"url":"{seller.replace("/", chr(92) + "/")}"}}}}]}}'
        f'"item_rating":{{"rating_videos":[{{"url":"{review}"}}]}}'
    )
    urls = cp._shopee_page_videos(html)
    assert seller in urls
    assert review not in urls
