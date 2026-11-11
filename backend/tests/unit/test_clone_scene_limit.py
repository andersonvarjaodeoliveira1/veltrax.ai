from src.api.routes.clone_plan import MAX_SCENES, _context


def test_video_can_have_up_to_twelve_scenes():
    assert MAX_SCENES == 12
    assert _context({"reference": "texto de referência com mais de vinte caracteres", "keyword": "X", "scene_count": 12})["scene_count"] == 12
    assert _context({"reference": "texto de referência com mais de vinte caracteres", "keyword": "X", "scene_count": 30})["scene_count"] == 12
    assert _context({"reference": "texto de referência com mais de vinte caracteres", "keyword": "X", "scene_count": 1})["scene_count"] == 1
