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
