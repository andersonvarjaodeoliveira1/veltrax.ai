from src.api.routes.clone_plan import CLIP_WORDS, _spoken


def test_cta_fits_inside_the_clip():
    cta = "Comente QUERO para assistir o vídeo completo agora"
    long_line = "Esse é um jogo de lençol muito bonito e barato. Eu comprei porque estava em promoção e já tenho todas as cores disponíveis na loja"
    out = _spoken([{"line": "Oi, tudo bem com você hoje?"}, {"line": long_line}], cta)[-1]
    assert out.endswith(cta)
    assert len(out.split()) <= CLIP_WORDS


def test_short_line_is_untouched():
    out = _spoken([{"line": "Muito bom."}], "Comente LINK")[-1]
    assert out == "Muito bom. Comente LINK"
