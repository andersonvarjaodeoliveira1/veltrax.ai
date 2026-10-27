import cv2
import numpy as np

from src.api.routes.clone_plan import _normalize_photo


def test_png_becomes_small_jpeg():
    image = np.full((2000, 1000, 3), 120, dtype=np.uint8)
    ok, buffer = cv2.imencode(".png", image)
    assert ok
    out = _normalize_photo(buffer.tobytes())
    assert out and out[1] == "image/jpeg"
    decoded = cv2.imdecode(np.frombuffer(out[0], dtype=np.uint8), cv2.IMREAD_COLOR)
    assert max(decoded.shape[:2]) == 1280


def test_garbage_is_rejected():
    assert _normalize_photo(b"not a picture") is None
import cv2
import numpy as np

from src.api.routes.clone_plan import _normalize_photo


def test_webp_saved_as_jpg_is_read_by_content():
    image = np.full((60, 40, 3), 200, dtype=np.uint8)
    ok, buf = cv2.imencode(".webp", image)
    assert ok
    out = _normalize_photo(buf.tobytes())
    assert out is not None and out[1] == "image/jpeg" and out[0][:3] == b"\xff\xd8\xff"


def test_garbage_is_rejected():
    assert _normalize_photo(b"not a picture") is None
