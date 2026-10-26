from src.api.routes.flow_videos import IMAGE_TYPES, _image_ext


def test_images_are_recognised_by_extension():
    assert _image_ext("Video01_Cena01.jpg") == ".jpg"
    assert _image_ext("Foto.PNG") == ".png"
    assert _image_ext("Video01_Cena01.mp4") is None
    assert IMAGE_TYPES[".jpg"] == "image/jpeg"


def test_copy_from_description_tells_the_model_to_write_the_copy():
    from src.api.routes.clone_plan import _changes_block

    block = _changes_block({"copy_brief": True})
    assert "NOT a script" in block
    assert "original spoken copy" in block
    assert _changes_block({}) == ""
