from src.api.routes import flow_videos


def test_mine_route_is_registered_and_shares_the_storage_helper():
    paths = {route.path for route in flow_videos.router.routes}
    assert "/multiplier/flow-videos/mine" in paths
    assert "/multiplier/flow-videos/upload" in paths
    assert callable(flow_videos._store)
