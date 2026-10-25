from src.speech_law import apply_speech_law, enforce_dialogue


def test_no_caps_no_dashes_and_contractions_pt():
    out = apply_speech_law("Olha ISSO — eu estou usando para o meu cabelo, e NÃO para a pele.")
    assert "—" not in out and "ISSO" not in out and "NÃO" not in out
    assert "tô" in out and "pro meu" in out and "pra pele" in out


def test_idempotent_and_sentence_case():
    once = apply_speech_law("Isso é BOM – muito bom.")
    assert apply_speech_law(once) == once
    assert once.startswith("Isso")


def test_english_contractions():
    assert apply_speech_law("I do not think it is real, you are right.", "en") == "I don't think it's real, you're right."


def test_dialogue_verbatim_replaced_or_inserted():
    line = "Duas colheres disso toda manhã."
    p = 'CAMERA: x\nSUBJECT: y\nACTION: z\nDIALOGUE: "outra coisa"\nREALISM: r'
    assert f'DIALOGUE: "{line}"' in enforce_dialogue(p, line)
    q = "CAMERA: x\nREALISM: r"
    assert f'DIALOGUE: "{line}"\nREALISM: r' in enforce_dialogue(q, line)
    assert enforce_dialogue(f'DIALOGUE: "{line}"\nREALISM: r', line) == f'DIALOGUE: "{line}"\nREALISM: r'
