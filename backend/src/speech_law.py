"""A Lei da Fala: regras fixas para tudo o que o avatar fala (a fala manda no take).

1. Zero caixa alta: o gerador lê palavra em maiúsculas como grito.
2. Zero travessão: o gerador lê como pausa longa.
3. Contrações sempre: sem elas a fala soa escrita.

O modelo recebe as regras no pedido (SPEECH_LAW), mas o texto também passa por `apply_speech_law`,
porque um traço solto estraga o take.
"""

from __future__ import annotations

import re

SPEECH_LAW = (
    "\nSPEECH LAW (applies to every spoken line, no exceptions): "
    "1) ZERO ALL CAPS: never write a word in capital letters, the generator reads it as shouting (write the word in normal case). "
    "2) ZERO DASHES: never use an em dash or en dash, the generator reads it as a long pause (use a comma or a period). "
    "3) CONTRACTIONS ALWAYS: write the way people really talk. In Brazilian Portuguese use pra, pro, tá, tô, tá bom, né; in English use don't, it's, you're, can't, I'm; in other languages use the usual spoken contractions. "
    "Without contractions the speech sounds written."
)

# Voz natural: vale só para o texto que a IA escreve do zero (aberturas alternativas, copy a partir de uma
# descrição, roteiro do influenciador). Nunca para a fala que tem de ficar igual à do anúncio validado ou à copy
# que o membro escreveu. O objetivo é a copy soar como gente falando, que é o que prende quem assiste; não é
# esconder nada de ninguém, por isso a regra 4 proíbe inventar história, resultado ou depoimento.
NATURAL_VOICE = (
    "\nNATURAL VOICE (applies to every line you write yourself, never to lines you must keep word for word): "
    "1) RHYTHM: mix sentence lengths on purpose. After a longer sentence, use a very short one (two to five words). "
    "Never write three sentences in a row with the same length or the same first word. "
    "2) EVERYDAY WORDS: write the way a person from this niche talks to a friend, with the everyday words and light slang "
    "that this audience really uses, in the requested language. No corporate words, no ad cliches (such as revolutionary, "
    "incredible, do not miss out), no slang the audience would not use, no profanity. "
    "3) TELL IT, DO NOT PITCH IT: open like someone talking to a person they know (a small everyday moment, a doubt, "
    "something they noticed), not with a slogan. Do not line the text up as promise, then benefit, then call to action: "
    "let the offer come up inside the talk. "
    "4) STAY TRUE: natural does not mean invented. Use only the facts you were given. Never invent a personal story, "
    "a result, a number, a testimonial or a customer. When no real story was given, speak in general terms "
    "(for example what many people go through) instead of saying it happened to the speaker. "
    "The call to action stays clear and is said once, at the end."
)

# A mesma ideia para texto escrito (a legenda do post), onde não há fala nem limite de palavras por cena.
NATURAL_POST = (
    "\nNATURAL VOICE: write like the Page owner talking to a follower, not like an ad. Mix a longer sentence with a very "
    "short one. Use the everyday words of this niche and audience, no corporate words and no ad cliches. Open with a "
    "small real-life moment, a doubt or something noticed, in place of a slogan, and let the value come up inside the "
    "text; do not line it up as promise, then benefit, then call to action. Natural does not mean invented: never invent "
    "a personal story, a result, a number or a testimonial."
)

DASHES = re.compile(r"\s*[—–]\s*|\s+-\s+")
CAPS_WORD = re.compile(r"\b[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]{2,}\b")

_PT = [
    (r"\bpara os\b", "pros"), (r"\bpara as\b", "pras"), (r"\bpara o\b", "pro"), (r"\bpara a\b", "pra"), (r"\bpara\b", "pra"),
    (r"\bestá\b", "tá"), (r"\bestão\b", "tão"), (r"\bestou\b", "tô"), (r"\bestava\b", "tava"), (r"\bestavam\b", "tavam"),
]
_EN = [
    (r"\bdo not\b", "don't"), (r"\bdoes not\b", "doesn't"), (r"\bdid not\b", "didn't"), (r"\bcannot\b", "can't"), (r"\bcan not\b", "can't"),
    (r"\bwill not\b", "won't"), (r"\bis not\b", "isn't"), (r"\bare not\b", "aren't"), (r"\bwas not\b", "wasn't"),
    (r"\bI am\b", "I'm"), (r"\bit is\b", "it's"), (r"\bthat is\b", "that's"), (r"\byou are\b", "you're"), (r"\bwe are\b", "we're"),
    (r"\bI have\b", "I've"), (r"\byou have\b", "you've"), (r"\bI will\b", "I'll"), (r"\byou will\b", "you'll"),
]


def _keep_case(match: re.Match[str], new: str) -> str:
    return new[:1].upper() + new[1:] if match.group(0)[:1].isupper() else new


def apply_speech_law(text: str, language: str = "pt-BR") -> str:
    """Aplica as três leis a uma fala. Idempotente."""
    out = DASHES.sub(", ", text or "")
    out = re.sub(r",\s*([.,!?;:])", r"\1", out)
    out = CAPS_WORD.sub(lambda m: m.group(0).lower(), out)
    rules = _PT if language.startswith("pt") else _EN if language.startswith("en") else []
    for pattern, new in rules:
        out = re.sub(pattern, lambda m, n=new: _keep_case(m, n), out, flags=re.IGNORECASE)
    out = re.sub(r"\s{2,}", " ", out).strip()
    # início de frase em minúscula depois de ponto vira maiúscula de novo (a caixa alta só some nas palavras gritadas)
    return re.sub(r"(^|[.!?]\s+)([a-záàâãéêíóôõúç])", lambda m: m.group(1) + m.group(2).upper(), out)


def enforce_dialogue(prompt: str, line: str) -> str:
    """Garante que a fala entra caractere por caractere dentro da tag DIALOGUE do prompt de vídeo."""
    line = line.strip()
    if not line:
        return prompt
    block = f'DIALOGUE: "{line}"'
    if f'"{line}"' in prompt and re.search(r"(?m)^DIALOGUE:", prompt):
        return prompt
    if re.search(r"(?m)^DIALOGUE:.*$", prompt):
        return re.sub(r"(?m)^DIALOGUE:.*$", lambda _m: block, prompt, count=1)
    # sem a tag: coloca antes de REALISM, ou no fim
    if re.search(r"(?m)^REALISM:", prompt):
        return re.sub(r"(?m)^REALISM:", lambda _m: block + "\nREALISM:", prompt, count=1)
    return prompt.rstrip() + "\n" + block
