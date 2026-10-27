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


def test_cdn_downloads_are_limited_to_shopee_files():
    assert cp._is_shopee_cdn("https://down-bs.vod.susercontent.com/api/v4/1/mms/x.mp4")
    assert cp._is_shopee_cdn("https://down-br.img.susercontent.com/file/br-11134207-abc")
    assert not cp._is_shopee_cdn("https://susercontent.com.evil.com/x.mp4")
    assert not cp._is_shopee_cdn("http://down-br.img.susercontent.com/file/x")
    assert not cp._is_shopee_cdn("https://169.254.169.254/latest/meta-data")
    assert not cp._is_shopee_cdn("https://evil.com/?u=susercontent.com")


def test_short_link_resolves_to_the_product_page():
    html = 'x={"httpUrl":"https:\\/\\/shopee.com.br\\/opaanlp\\/1407654055\\/58219994665?__mobile__=1\\u0026exp_group=rollout","deepLinkUrl":"shopeebr:\\/\\/x"}'
    assert cp._shopee_short_target(html) == "https://shopee.com.br/product/1407654055/58219994665"


def test_affiliate_redirect_link_uses_origin_link():
    url = "https://shope.ee/an_redir?origin_link=https%3A%2F%2Fshopee.com.br%2Fproduct%2F1312814661%2F22198009726"
    assert cp._shopee_short_target("", url) == "https://shopee.com.br/product/1312814661/22198009726"


def test_short_target_ignores_other_sites():
    assert cp._shopee_short_target('{"httpUrl":"https:\\/\\/evil.com\\/a\\/1407654055\\/58219994665"}') is None
    assert cp._shopee_short_target("") is None


def test_shope_ee_is_a_shopee_host():
    assert cp._is_shopee_url("https://shope.ee/abc")
