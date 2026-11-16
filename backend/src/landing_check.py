"""Coerência entre o anúncio e a página de destino.

A oferta guarda o que é dito no vídeo (copy aprovada), o produto e a mensagem com o link que a Página
manda para quem comenta a palavra-chave. Aqui a gente abre esse link e compara o título da página com
o anúncio, para avisar quando a pessoa vai cair numa página que fala de outra coisa (ou que não abre).

É só um aviso para o membro, antes de publicar. Não bloqueia nada e não muda o anúncio.
A comparação é por palavras (sem IA): rápida, sem custo e igual toda vez. Ela erra em casos de
sinônimos, por isso o resultado mostra o título lido e as palavras, para a pessoa julgar.
"""

from __future__ import annotations

import html as html_lib
import re
import unicodedata
from typing import Any

LINK = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)
MAX_PAGE_BYTES = 400_000
USER_AGENT = "ClipGringa-LinkCheck/1.0 (+https://clipgringa.gringatools.com)"

# Palavras que não dizem do que a página trata.
STOPWORDS = frozenset("""
a o as os um uma uns umas de da do das dos em no na nos nas por para pra pro com sem e ou que se sua seu suas seus
meu minha este esta esse essa isso isto aquele aquela como mais menos muito muita ja nao sim ao aos pela pelo pelas
pelos sobre entre ate tem ter ser foi sao esta estao voce voces ele ela eles elas nos lhe the an and or of to in on
for with your you our is are it this that from by at be as el la los las un una unos unas del y con sin su sus tu tus
para por que en es al lo
""".split())
# Palavras de vitrine: aparecem em quase todo título e não ligam a página ao anúncio.
GENERIC = frozenset("""
site oficial official home inicio pagina page loja store shop online brasil www com br net compre comprar compra
agora hoje aqui bem vindo welcome produto produtos melhor melhores novo nova frete gratis oferta ofertas promocao
desconto garanta clique saiba checkout
""".split())


def first_link(text: str) -> str:
    """O primeiro endereço que aparece na mensagem, sem a pontuação colada no fim."""
    found = LINK.search(text or "")
    return found.group(0).rstrip(".,;:!?)]}") if found else ""


def _plain(fragment: str) -> str:
    return re.sub(r"\s+", " ", html_lib.unescape(re.sub(r"<[^>]+>", " ", fragment or ""))).strip()


def _meta(page: str, key: str) -> str:
    for tag in re.findall(r"<meta\b[^>]*>", page, flags=re.IGNORECASE):
        if re.search(rf"""(?:name|property)\s*=\s*["']{re.escape(key)}["']""", tag, flags=re.IGNORECASE):
            content = re.search(r"""content\s*=\s*(?:"([^"]*)"|'([^']*)')""", tag, flags=re.IGNORECASE)
            if content:
                return _plain(content.group(1) or content.group(2) or "")
    return ""


def page_facts(page: str) -> dict[str, str]:
    """O que a página diz de si mesma: título, primeiro título grande (h1) e descrição."""
    page = re.sub(r"<(script|style|noscript)\b.*?</\1>", " ", page or "", flags=re.IGNORECASE | re.DOTALL)
    title = re.search(r"<title\b[^>]*>(.*?)</title>", page, flags=re.IGNORECASE | re.DOTALL)
    heading = re.search(r"<h1\b[^>]*>(.*?)</h1>", page, flags=re.IGNORECASE | re.DOTALL)
    return {
        "title": (_meta(page, "og:title") or _plain(title.group(1) if title else ""))[:200],
        "heading": _plain(heading.group(1) if heading else "")[:200],
        "description": (_meta(page, "description") or _meta(page, "og:description"))[:400],
    }


def _fold(word: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFD", word.lower()) if unicodedata.category(ch) != "Mn")


def _key(folded: str) -> str:
    """Junta variações da mesma palavra: lençol e lençóis, emagrecer e emagrecimento (os 5 primeiros sons)."""
    if len(folded) > 5:
        return folded[:5]
    return folded[:-1] if len(folded) > 3 and folded.endswith("s") else folded


def words(text: str, *, drop_generic: bool = False) -> dict[str, str]:
    """Palavras que carregam assunto, na ordem em que aparecem: {chave de comparação: palavra como foi escrita}."""
    out: dict[str, str] = {}
    for raw in re.findall(r"[^\W_]+", text or "", flags=re.UNICODE):
        folded = _fold(raw)
        if len(folded) < 3 or folded.isdigit() or folded in STOPWORDS or (drop_generic and folded in GENERIC):
            continue
        out.setdefault(_key(folded), raw.lower())
    return out


def compare(product: str, copy: str, facts: dict[str, str]) -> dict[str, Any]:
    """Compara o anúncio (produto e copy) com o que a página diz no título.

    - alinhado: o nome do produto está na página, ou pelo menos metade das palavras do título está no anúncio.
    - parcial: há alguma palavra em comum, mas menos da metade.
    - diferente: nenhuma palavra do título aparece no anúncio.
    - sem_titulo: a página não tem título nem h1 para comparar.
    """
    headline = words(f"{facts.get('title', '')} {facts.get('heading', '')}", drop_generic=True)
    everything = words(f"{facts.get('title', '')} {facts.get('heading', '')} {facts.get('description', '')}")
    ad = words(f"{product} {copy}")
    name = words(product, drop_generic=True)
    shared = [word for key, word in headline.items() if key in ad]
    only_page = [word for key, word in headline.items() if key not in ad]
    product_on_page = bool(name) and all(key in everything for key in name)
    if not headline:
        level = "sem_titulo"
    elif product_on_page or len(shared) * 2 >= len(headline):
        level = "alinhado"
    elif shared or any(key in everything for key in name):
        level = "parcial"
    else:
        level = "diferente"
    return {
        "level": level,
        "title": facts.get("title") or facts.get("heading") or "",
        "shared": shared[:8],
        "only_page": only_page[:8],
        "product_on_page": product_on_page,
    }


async def check(product: str, copy: str, message: str, fetch: Any = None) -> dict[str, Any]:
    """Abre o link da mensagem e devolve o resultado da comparação. Nunca levanta erro por causa da página."""
    link = first_link(message)
    if not link:
        return {"level": "sem_link"}
    if not link.lower().startswith("https://"):
        return {"level": "nao_abriu", "url": link, "reason": "http"}
    try:
        body, kind = await (fetch or _fetch)(link)
    except Exception as exc:  # página fora do ar, bloqueada, redirecionando demais ou rede
        return {"level": "nao_abriu", "url": link, "reason": str(exc) if str(exc) in {"blocked", "status", "redirects"} else "rede"}
    if kind and "html" not in kind:
        return {"level": "sem_titulo", "url": link, "title": "", "shared": [], "only_page": [], "product_on_page": False}
    try:
        page = body.decode("utf-8")
    except UnicodeDecodeError:
        page = body.decode("latin-1", errors="replace")
    return {**compare(product, copy, page_facts(page)), "url": link}


async def _fetch(link: str) -> tuple[bytes, str]:
    """Busca a página com as mesmas travas dos outros acessos externos: só https, só endereço público, tamanho limitado."""
    import httpx

    from .api.routes.clone_plan import _safe_get

    async with httpx.AsyncClient(timeout=12, headers={"User-Agent": USER_AGENT, "Accept": "text/html,*/*;q=0.5"}) as client:
        return await _safe_get(client, link, MAX_PAGE_BYTES)
