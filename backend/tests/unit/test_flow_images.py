from src.api.routes.flow_videos import IMAGE_TYPES, _image_ext


def test_images_are_recognised_by_extension():
    assert _image_ext("Video01_Cena01.jpg") == ".jpg"
    assert _image_ext("Foto.PNG") == ".png"
    assert _image_ext("Video01_Cena01.mp4") is None
    assert IMAGE_TYPES[".jpg"] == "image/jpeg"
