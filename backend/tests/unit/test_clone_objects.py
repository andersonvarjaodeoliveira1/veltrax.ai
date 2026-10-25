from src.api.routes.clone_plan import _changes_block, _context, _object_block


def ctx(objects):
    return _context({"reference": "x" * 40, "objects": objects})


def test_no_objects_gives_empty_block():
    assert _object_block(ctx([])) == ""
    assert _object_block(ctx("lixo")) == ""


def test_object_block_names_object_place_and_position():
    block = _object_block(ctx([{"name": "bandeira dos EUA", "place": "na varanda", "position": "side"}]))
    assert "bandeira dos EUA" in block and "na varanda" in block and "on the side" in block
    assert "EVERY SCENE" in block


def test_objects_are_limited_and_sanitised():
    rows = [{"name": f"obj{i}", "position": "xx"} for i in range(6)] + [{"name": "  "}]
    c = ctx(rows)
    assert len(c["objects"]) == 3
    assert all(o["position"] == "any" for o in c["objects"])


def test_member_changes_reach_every_stage_prompt():
    ctx = _context({"reference": "x" * 30, "changes": "troque o cenário para uma cozinha"})
    assert "cozinha" in _changes_block(ctx)
    assert _changes_block(_context({"reference": "x" * 30})) == ""
