from src.api.routes import clone_plan, multiplier
from src.speech_law import NATURAL_POST, NATURAL_VOICE


def test_voice_rules_say_what_matters():
    for part in ("RHYTHM", "EVERYDAY WORDS", "TELL IT, DO NOT PITCH IT", "STAY TRUE"):
        assert part in NATURAL_VOICE
    # Natural não é inventado: a regra proíbe história, resultado e depoimento que não foram dados.
    assert "Never invent a personal story, a result, a number, a testimonial or a customer" in NATURAL_VOICE
    # Visto no primeiro teste no ar: a descrição dizia "algodão" e a copy saiu com "puro algodão".
    assert "Never add a quality of the product that was not given" in NATURAL_VOICE
    assert "never add a quality of the product that was not given" in NATURAL_POST
    assert "never to lines you must keep word for word" in NATURAL_VOICE
    assert "never invent" in NATURAL_POST
    # Os prompts usam f-string e replace("{LANG}"): o texto não pode ter chaves.
    assert "{" not in NATURAL_VOICE + NATURAL_POST


def test_voice_goes_where_the_ai_writes_copy_from_scratch():
    assert NATURAL_VOICE in clone_plan.MIX_SYSTEM
    assert "{KEYWORD}" in clone_plan.MIX_SYSTEM  # a chamada continua pedindo o comentário com a palavra
    assert NATURAL_VOICE in clone_plan.INFLUENCER_BRIEF_SYSTEM
    assert NATURAL_VOICE in clone_plan._changes_block({"copy_brief": True})
    assert NATURAL_VOICE in multiplier.SCRIPT_SYSTEM_PROMPT
    assert NATURAL_POST in clone_plan.CAPTION_SYSTEM
    for prompt in (clone_plan.MIX_SYSTEM, clone_plan.CAPTION_SYSTEM):
        assert clone_plan.SAFETY in prompt


def test_voice_stays_out_of_what_must_keep_the_original_words():
    # Cenas tiradas do anúncio validado, variações (mesma fala) e a copy escrita pelo membro não mudam de voz.
    assert NATURAL_VOICE not in clone_plan.scenes_system(3)
    assert NATURAL_VOICE not in clone_plan.VARIATIONS_SYSTEM
    assert NATURAL_VOICE not in clone_plan.videos_system(3, structured=True)
    assert NATURAL_VOICE not in clone_plan._changes_block({"own_copy": True})
    assert clone_plan._changes_block({}) == ""
