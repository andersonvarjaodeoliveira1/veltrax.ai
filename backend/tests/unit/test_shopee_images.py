import io
import zipfile

import cv2
import numpy as np

from src.api.routes import clone_plan as cp


def _jpg(w=300, h=200):
    ok, buf = cv2.imencode(".jpg", np.full((h, w, 3), 128, dtype=np.uint8))
    assert ok
    return bytes(buf)


def test_shopee_hosts_only():
    assert cp._is_shopee_url("https://shopee.com.br/Produto-i.123.456")
    assert cp._is_shopee_url("https://s.shopee.com.br/abc123")
    assert cp._is_shopee_url("https://shp.ee/xyz")
    assert not cp._is_shopee_url("https://evil.com/shopee.com.br")
    assert not cp._is_shopee_url("https://shopee.com.br.evil.com/x")
    assert not cp._is_shopee_url("http://shopee.com.br/x")


def test_page_images_title_and_full_size():
    html = (
        '<meta property="og:title" content="Creme Hidratante 200ml | Shopee Brasil">'
        '<meta property="og:image" content="https://down-br.img.susercontent.com/file/br-11134207-7r98o-abcdefghijklmnop_tn">'
        '<script>{"images":["a"],"x":"https:\\/\\/down-br.img.susercontent.com\\/file\\/br-11134207-7r98o-zyxwvutsrqponmlk"}</script>'
    )
    title, urls = cp._shopee_page_images(html)
    assert title == "Creme Hidratante 200ml"
    assert "https://down-br.img.susercontent.com/file/br-11134207-7r98o-abcdefghijklmnop" in urls  # sem _tn
    assert any(u.endswith("zyxwvutsrqponmlk") for u in urls)


def test_shrink_rejects_non_images_and_tiny_and_shrinks_big():
    assert cp._prepare_image(b"not an image") is None
    assert cp._prepare_image(_jpg(40, 40)) is None
    big, mime = cp._prepare_image(_jpg(2600, 1800))
    img = cv2.imdecode(np.frombuffer(big, dtype=np.uint8), cv2.IMREAD_COLOR)
    assert max(img.shape[:2]) == 1280 and mime == "image/jpeg"
    light = _jpg(600, 400)
    kept, kept_mime = cp._prepare_image(light)
    assert kept == light and kept_mime == "image/jpeg"  # imagem leve: o arquivo original do vendedor segue igual


def test_zip_extracts_only_images():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("fotos/1.jpg", _jpg())
        z.writestr("fotos/leia-me.txt", "oi")
        z.writestr("__MACOSX/._1.jpg", "x")
        z.writestr("2.PNG", _jpg())
    names = [n for n, _ in cp._images_from_zip(buf.getvalue())]
    assert names == ["1.jpg", "2.PNG"]


def test_reviews_and_recommended_images_are_left_out():
    seller = "br-11134207-aaaaaaaaaaaaaaaaaaaa"
    review = "br-11134103-bbbbbbbbbbbbbbbbbbbb"
    other = "br-11134207-cccccccccccccccccccc"
    html = (
        '<meta property="og:title" content="Fone | Shopee Brasil">'
        f'<script>{{"item":{{"images":["{seller}","{seller}x1x1x1x1x1x1x1x1"]}},'
        f'"item_rating":{{"rating_images":["{review}","{review}zzzz"]}},'
        f'"recommend":{{"images":["{other}"]}}}}</script>'
    )
    title, urls = cp._shopee_page_images(html)
    joined = " ".join(urls)
    assert seller in joined
    assert review not in joined and other not in joined
