"""Testes do planejador de takes (corte por IA encaixado nas cenas do Flow)."""
from typing import ClassVar

import pytest

from src.takes import (
    build_takes,
    format_mmss,
    parse_mmss,
    plan_takes,
    remap_boundaries,
    scene_boundaries,
    takes_from_bounds,
)


def test_parse_and_format_mmss():
    assert parse_mmss("01:30") == 90.0
    assert parse_mmss("1:00:00") == 3600.0
    assert parse_mmss(42) == 42.0
    assert parse_mmss("lixo") == 0.0
    assert format_mmss(90) == "01:30"
    assert format_mmss(3661) == "1:01:01"


def test_scene_boundaries_sem_transicao():
    assert scene_boundaries([10, 10, 10]) == [0.0, 10.0, 20.0, 30.0]


def test_scene_boundaries_com_transicao():
    # cada junção sobrepõe 0.4s: fins em 10, 19.6, 29.2
    b = scene_boundaries([10, 10, 10], transition_seconds=0.4)
    assert b == [0.0, 10.0, 19.6, 29.2]


def test_scene_boundaries_sempre_crescente():
    # cena menor que a transição não pode fazer a borda andar para trás
    b = scene_boundaries([0.2, 0.2, 10], transition_seconds=0.4)
    assert b == sorted(b)


def test_remap_boundaries_tira_pausa():
    # vídeo original 0..30; mantidos 0..10 e 20..30 (removeu 10..20, 10s)
    bounds = [0.0, 10.0, 20.0, 30.0]
    out = remap_boundaries(bounds, [(0.0, 10.0), (20.0, 30.0)])
    # 20 cai na beira do trecho mantido -> 10; 30 -> 20
    assert out == [0.0, 10.0, 20.0]


def test_plan_takes_encaixa_nas_cenas():
    bounds = [0.0, 10.0, 20.0, 30.0, 40.0]
    # trecho da IA de 7s a 23s deve virar take 0..30 (desce para 0, sobe para 30)
    takes = plan_takes(
        [{"start": 7.0, "end": 23.0, "hook_title": "Gancho", "text": "oi", "score": 0.9}],
        bounds, min_len=5.0, max_len=90.0,
    )
    assert len(takes) == 1
    assert takes[0]["start"] == 0.0
    assert takes[0]["end"] == 30.0
    assert takes[0]["hook_title"] == "Gancho"


def test_plan_takes_resolve_sobreposicao_por_nota():
    bounds = [0.0, 10.0, 20.0, 30.0]
    takes = plan_takes([
        {"start": 1.0, "end": 12.0, "hook_title": "A", "text": "", "score": 0.6},   # -> 0..20
        {"start": 11.0, "end": 15.0, "hook_title": "B", "text": "", "score": 0.95},  # -> 10..20 (nota maior)
    ], bounds, min_len=5.0, max_len=90.0)
    # os dois encostam na cena 10..20: fica só o de nota maior
    assert len(takes) == 1
    assert takes[0]["hook_title"] == "B"


def test_plan_takes_respeita_max_len_sem_picar_cena():
    bounds = [0.0, 20.0, 40.0, 60.0]
    takes = plan_takes(
        [{"start": 1.0, "end": 58.0, "hook_title": "X", "text": "", "score": 0.8}],
        bounds, min_len=5.0, max_len=45.0,
    )
    # 0..60 passa de 45; apara para a última cena que cabe em 45 -> 0..40
    assert takes[0]["start"] == 0.0
    assert takes[0]["end"] == 40.0


def test_plan_takes_estende_take_curto():
    bounds = [0.0, 3.0, 6.0, 20.0]
    takes = plan_takes(
        [{"start": 0.5, "end": 2.0, "hook_title": "C", "text": "", "score": 0.7}],
        bounds, min_len=8.0, max_len=90.0,
    )
    # 0..3 é curto (3s < 8): estende para a próxima borda >= 8 -> 0..20
    assert takes[0]["start"] == 0.0
    assert takes[0]["end"] == 20.0


@pytest.mark.asyncio
async def test_takes_from_bounds_usa_bordas_prontas():
    class FakeAnalysis:
        most_relevant_segments: ClassVar = [
            {"start_time": "00:07", "end_time": "00:23", "hook_title": "H", "text": "x", "relevance_score": 0.8},
        ]

    async def fake_analyze(_t):
        return FakeAnalysis()

    # bordas já no tempo do vídeo final (o que o render guardou), 4 cenas de 10s
    takes = await takes_from_bounds("00:07 oi", [0.0, 10.0, 20.0, 30.0, 40.0], analyze=fake_analyze, min_len=5.0)
    assert len(takes) == 1
    assert takes[0]["start"] == 0.0 and takes[0]["end"] == 30.0
    assert takes[0]["hook_title"] == "H"


@pytest.mark.asyncio
async def test_build_takes_usa_ia_injetada():
    class FakeAnalysis:
        most_relevant_segments: ClassVar = [
            {"start_time": "00:05", "end_time": "00:18", "hook_title": "Magnética", "text": "t", "relevance_score": 0.9},
        ]

    async def fake_analyze(_transcript):
        return FakeAnalysis()

    takes = await build_takes(
        "00:00 oi\n00:10 mundo",
        [10, 10, 10],
        transition_seconds=0.0,
        analyze=fake_analyze,
        min_len=5.0,
    )
    assert len(takes) == 1
    assert takes[0]["start"] == 0.0 and takes[0]["end"] == 20.0
    assert takes[0]["hook_title"] == "Magnética"


# ---------- receita do vencedor ----------

def test_recipe_weights_normaliza_pelo_beat_mais_longo():
    from src.takes import recipe_weights

    recipe = {"beats": [{"beat_role": "hook", "weight": 0.1}, {"beat_role": "Problema", "weight": 0.4}, {"beat_role": "cta", "weight": 0.2},
                        {"beat_role": "inventado", "weight": 0.9}, {"beat_role": "none", "weight": 0.5}, {"beat_role": "vilao", "weight": "x"}, "lixo"]}
    assert recipe_weights(recipe) == {"hook": 0.25, "problema": 1.0, "cta": 0.5}
    assert recipe_weights(recipe["beats"]) == recipe_weights(recipe)
    assert recipe_weights(None) == {} and recipe_weights({"beats": "nada"}) == {} and recipe_weights([{"beat_role": "hook", "weight": 0}]) == {}


def test_plan_takes_com_receita_desempata_a_favor_do_beat_do_vencedor():
    bounds = [0.0, 10.0, 20.0, 30.0]
    # dois trechos na mesma cena, notas quase iguais: sem receita ganha a nota; com receita, o beat forte do vencedor
    segments = [
        {"start": 1, "end": 9, "hook_title": "Solução", "text": "a", "score": 0.80, "beat_role": "solucao"},
        {"start": 2, "end": 8, "hook_title": "Problema", "text": "b", "score": 0.74, "beat_role": "problema"},
        {"start": 21, "end": 29, "hook_title": "Outro", "text": "c", "score": 0.5, "beat_role": "none"},
    ]
    plain = plan_takes(segments, bounds)
    assert [t["hook_title"] for t in plain] == ["Solução", "Outro"] and "in_recipe" not in plain[0]

    recipe = [{"beat_role": "problema", "weight": 0.6}, {"beat_role": "cta", "weight": 0.2}]
    guided = plan_takes(segments, bounds, recipe=recipe)
    assert [t["hook_title"] for t in guided] == ["Problema", "Outro"]
    assert [t["in_recipe"] for t in guided] == [True, False]


def test_plan_takes_com_receita_nao_derruba_take_claramente_melhor():
    bounds = [0.0, 10.0, 20.0]
    segments = [
        {"start": 1, "end": 9, "hook_title": "Forte", "text": "a", "score": 0.95, "beat_role": "solucao"},
        {"start": 2, "end": 8, "hook_title": "Fraco", "text": "b", "score": 0.60, "beat_role": "problema"},
    ]
    guided = plan_takes(segments, bounds, recipe=[{"beat_role": "problema", "weight": 1}])
    assert [t["hook_title"] for t in guided] == ["Forte"]


@pytest.mark.asyncio
async def test_takes_from_bounds_repassa_a_receita():
    async def fake_analyze(_transcript):
        return {"most_relevant_segments": [
            {"start_time": "00:01", "end_time": "00:09", "text": "a", "relevance_score": 0.8, "hook_title": "A", "beat_role": "solucao"},
            {"start_time": "00:02", "end_time": "00:08", "text": "b", "relevance_score": 0.75, "hook_title": "B", "beat_role": "cta"},
        ]}

    out = await takes_from_bounds("00:00 fala", [0.0, 10.0, 20.0], analyze=fake_analyze, recipe={"beats": [{"beat_role": "cta", "weight": 0.3}]})
    assert [t["hook_title"] for t in out] == ["B"] and out[0]["in_recipe"] is True
