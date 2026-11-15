"""Variações de cenas: mesmo texto, um eixo trocado por variação, roteiro sempre inteiro."""
import pytest

from src.ai import SceneVariant, SceneVariations, plan_variation_axes, vary_scenes

SCENES = [
    {"text": "Stop scrolling if your knees hurt.", "scene_prompt": "Woman in her 50s, blue scrubs, clinic, looks at camera"},
    {"text": "Comment YES for the recipe.", "scene_prompt": "Same woman points down, clinic"},
]


class FakeAgent:
    def __init__(self, variants):
        self.variants = variants
        self.prompt = ""

    async def run(self, prompt):
        self.prompt = prompt
        return type("R", (), {"output": SceneVariations(variants=self.variants)})()


def test_axes_rotate_among_the_chosen_ones():
    assert plan_variation_axes(["roupa", "ambiente"], 3) == ["roupa", "ambiente", "roupa"]
    assert plan_variation_axes(["invalido"], 2) == ["pessoa", "roupa"]
    assert plan_variation_axes(None, 5)[4] == "pessoa"


@pytest.mark.asyncio
async def test_each_variant_keeps_one_prompt_per_scene():
    agent = FakeAgent([
        SceneVariant(label="Outra apresentadora", axis="pessoa", scene_prompts=["Different woman in her 50s, blue scrubs, clinic", "Same new woman points down, clinic"]),
        SceneVariant(label="Na varanda", axis="ambiente", scene_prompts=["Woman in her 50s, blue scrubs, balcony"]),
    ])

    out = await vary_scenes(SCENES, 2, ["pessoa", "ambiente"], agent=agent)

    assert [v.axis for v in out.variants] == ["pessoa", "ambiente"]
    assert all(len(v.scene_prompts) == 2 for v in out.variants)
    assert out.variants[1].scene_prompts[1] == SCENES[1]["scene_prompt"]  # cena que faltou fica com o original


@pytest.mark.asyncio
async def test_spoken_text_goes_in_as_frozen_and_is_never_returned():
    agent = FakeAgent([SceneVariant(label="Roupa verde", axis="roupa", scene_prompts=["Woman in her 50s, green scrubs, clinic", "Same woman points down, clinic, green scrubs"])])

    out = await vary_scenes(SCENES, 1, ["roupa"], note="sem óculos", agent=agent)

    assert "spoken text (frozen): Stop scrolling if your knees hurt." in agent.prompt
    assert "sem óculos" in agent.prompt and "WARDROBE" in agent.prompt
    assert not hasattr(out.variants[0], "text")


@pytest.mark.asyncio
async def test_copies_of_the_original_and_duplicates_are_dropped():
    same = [s["scene_prompt"] for s in SCENES]
    new = ["Man in his 50s, blue scrubs, clinic", "Same man points down, clinic"]
    agent = FakeAgent([SceneVariant(label="Igual", axis="pessoa", scene_prompts=same),
                       SceneVariant(label="Homem", axis="pessoa", scene_prompts=new),
                       SceneVariant(label="Homem de novo", axis="pessoa", scene_prompts=new)])

    out = await vary_scenes(SCENES, 3, ["pessoa"], agent=agent)

    assert [v.label for v in out.variants] == ["Homem"]


@pytest.mark.asyncio
async def test_needs_scene_prompts_and_caps_the_count():
    with pytest.raises(ValueError):
        await vary_scenes([{"text": "só texto", "scene_prompt": ""}], 3, agent=FakeAgent([]))
    agent = FakeAgent([SceneVariant(label=f"v{i}", axis="roupa", scene_prompts=[f"p{i}", f"q{i}"]) for i in range(15)])

    out = await vary_scenes(SCENES, 99, ["roupa"], agent=agent)

    assert len(out.variants) == 10
