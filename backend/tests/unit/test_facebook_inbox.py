"""Resposta automática da caixa de mensagens: assinatura, leitura do aviso e escolha da resposta."""
import hashlib
import hmac
import json

from src.facebook_inbox import choose_reply, incoming_messages, valid_signature

SECRET = "segredo-do-app"


def sign(body: bytes) -> str:
    return "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()


def test_only_requests_signed_with_the_app_secret_are_accepted():
    body = json.dumps({"object": "page"}).encode()

    assert valid_signature(body, sign(body), SECRET)
    assert not valid_signature(body + b" ", sign(body), SECRET)
    assert not valid_signature(body, sign(body), "outra-chave")
    assert not valid_signature(body, None, SECRET) and not valid_signature(body, "sha1=abc", SECRET)
    assert not valid_signature(body, sign(body), "")


def test_reads_people_messages_and_ignores_the_page_own_echo_and_receipts():
    payload = {"object": "page", "entry": [{"id": "PAGE", "messaging": [
        {"sender": {"id": "U1"}, "recipient": {"id": "PAGE"}, "message": {"mid": "m1", "text": " quero a receita "}},
        {"sender": {"id": "PAGE"}, "recipient": {"id": "U1"}, "message": {"mid": "m2", "text": "eco", "is_echo": True}},
        {"sender": {"id": "U1"}, "recipient": {"id": "PAGE"}, "delivery": {"mids": ["m2"]}},
        {"sender": {"id": "U2"}, "recipient": {"id": "PAGE"}, "message": {"mid": "m3", "attachments": [{"type": "image"}]}},
    ]}]}

    assert incoming_messages(payload) == [{"page_fb_id": "PAGE", "psid": "U1", "mid": "m1", "text": "quero a receita"}]
    assert incoming_messages({"object": "user", "entry": []}) == [] and incoming_messages("lixo") == []


def test_offer_keyword_wins_and_the_page_default_covers_the_rest():
    offers = [{"name": "Oferta A", "product": "A", "keyword": "YES", "dm_message": "Aqui está o link: https://exemplo.com/a"},
              {"name": "Oferta B", "product": "B", "keyword": "soda", "dm_message": ""}]

    assert choose_reply("yes please!", offers, "Olá! Já te respondo.") == ("Aqui está o link: https://exemplo.com/a", "YES")
    assert choose_reply("soda", offers, "Olá! Já te respondo.") == ("Olá! Já te respondo.", "")  # oferta sem mensagem cai na resposta padrão
    assert choose_reply("oi", offers, "") == ("", "")  # sem resposta padrão, não responde
