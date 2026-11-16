import pytest

from src.landing_check import check, compare, first_link, page_facts, words

PAGE = """<html><head><title>Jogo de Len&ccedil;ol Queen 400 Fios | Loja Oficial</title>
<meta name="description" content="Lençóis macios de algodão egípcio, com frete grátis.">
<script>var titulo = "<h1>não é este</h1>";</script></head>
<body><h1>Durma melhor com o <b>lençol</b> certo</h1></body></html>"""


def test_first_link_ignores_trailing_punctuation():
    assert first_link("Oi! Aqui está: https://loja.exemplo.com/lencol?ref=1. Qualquer dúvida, chama") == "https://loja.exemplo.com/lencol?ref=1"
    assert first_link("sem link nenhum") == ""


def test_page_facts_reads_title_h1_and_description():
    facts = page_facts(PAGE)
    assert facts["title"] == "Jogo de Lençol Queen 400 Fios | Loja Oficial"
    assert facts["heading"] == "Durma melhor com o lençol certo"
    assert facts["description"].startswith("Lençóis macios")


def test_og_title_wins_over_title():
    assert page_facts('<meta property="og:title" content="Chá Detox"><title>Home</title>')["title"] == "Chá Detox"


def test_words_drop_filler_and_join_variations():
    found = words("Os melhores lençóis para a sua cama, e o lençol da loja oficial", drop_generic=True)
    assert list(found.values()) == ["lençóis", "cama"]  # lençol e lençóis contam como a mesma palavra; "loja", "oficial" saem


def test_aligned_when_product_name_is_on_the_page():
    out = compare("Lençol", "Eu não dormia direito até trocar isso aqui.", page_facts(PAGE))
    assert out["level"] == "alinhado" and out["product_on_page"] is True
    assert out["title"].startswith("Jogo de Lençol")


def test_aligned_when_half_of_the_title_words_are_in_the_ad():
    facts = {"title": "Chá detox para desinchar", "heading": "", "description": ""}
    out = compare("", "Esse chá detox me ajudou a desinchar a barriga.", facts)
    assert out["level"] == "alinhado" and out["shared"] == ["chá", "detox", "desinchar"]


def test_partial_when_only_some_words_match():
    facts = {"title": "Chá Detox Slim: emagreça com saúde em trinta dias", "heading": "", "description": ""}
    out = compare("", "Tomo esse chá toda manhã.", facts)
    assert out["level"] == "parcial"
    assert out["shared"] == ["chá"] and "detox" in out["only_page"]


def test_different_when_nothing_matches():
    facts = {"title": "Curso de inglês para viagem", "heading": "Aprenda inglês rápido", "description": ""}
    out = compare("Lençol", "Eu não dormia direito até trocar o lençol.", facts)
    assert out["level"] == "diferente" and out["shared"] == []


def test_no_title_to_compare():
    assert compare("Lençol", "copy", {"title": "Loja Oficial", "heading": "", "description": ""})["level"] == "sem_titulo"


@pytest.mark.asyncio
async def test_check_without_link_and_with_plain_http():
    assert (await check("Lençol", "copy", "Oi, tudo bem?"))["level"] == "sem_link"
    out = await check("Lençol", "copy", "Link: http://loja.exemplo.com")
    assert out == {"level": "nao_abriu", "url": "http://loja.exemplo.com", "reason": "http"}


@pytest.mark.asyncio
async def test_check_reads_the_page_and_survives_a_page_that_does_not_open():
    async def page(_link):
        return PAGE.encode("utf-8"), "text/html"

    async def down(_link):
        raise ValueError("status")

    async def pdf(_link):
        return b"%PDF", "application/pdf"

    ok = await check("Lençol", "Troquei o lençol e dormi melhor.", "Aqui: https://loja.exemplo.com/lencol", fetch=page)
    assert ok["level"] == "alinhado" and ok["url"] == "https://loja.exemplo.com/lencol"
    assert await check("Lençol", "copy", "https://loja.exemplo.com", fetch=down) == {"level": "nao_abriu", "url": "https://loja.exemplo.com", "reason": "status"}
    assert (await check("Lençol", "copy", "https://loja.exemplo.com/a.pdf", fetch=pdf))["level"] == "sem_titulo"
