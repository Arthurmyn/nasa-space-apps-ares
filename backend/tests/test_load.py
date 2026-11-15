import threading

from fastapi.testclient import TestClient

from app.main import create_app
from app.services import hazards
from app.services.load import RouteGuard
from tests.test_routes import request, terrain  # noqa: F401  (pytest fixture)


def test_same_request_is_answered_from_the_cache(terrain, monkeypatch):  # noqa: F811
    path, meta, _ = terrain
    calls = []
    original = hazards.hazard_zones

    def counting(*args, **kwargs):
        calls.append(1)
        return original(*args, **kwargs)

    monkeypatch.setattr("app.services.routing.hazard_zones", counting)
    with TestClient(create_app(path)) as client:
        first = client.post("/api/v1/route", json=request(meta))
        second = client.post("/api/v1/route", json=request(meta))
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert len(calls) == 1


def test_no_route_answer_is_cached_as_a_422(terrain):  # noqa: F811
    path, meta, slope = terrain
    slope[:, 14:17] = 40  # a wall across the whole grid
    slope.tofile(path / "slope.bin")
    with TestClient(create_app(path)) as client:
        for _ in range(2):
            response = client.post("/api/v1/route", json=request(meta))
            assert response.status_code == 422
            assert response.json()["status"] == "NO-GO"


def test_rate_limit_answers_429_with_retry_after(terrain):  # noqa: F811
    path, meta, _ = terrain
    with TestClient(create_app(path, route_guard=lambda: RouteGuard(per_minute=2))) as client:
        codes = []
        for i in range(3):
            body = request(meta)
            body["stop_time_min"] = i  # a new request each time, so the cache does not answer
            codes.append(client.post("/api/v1/route", json=body))
        assert [r.status_code for r in codes] == [200, 200, 429]
        assert int(codes[2].headers["Retry-After"]) >= 1
        # A cached answer is still served to a client over the limit.
        body = request(meta)
        body["stop_time_min"] = 0
        assert client.post("/api/v1/route", json=body).status_code == 200


def test_busy_answers_503_when_no_slot_frees_up(terrain, monkeypatch):  # noqa: F811
    path, meta, _ = terrain
    release = threading.Event()
    started = threading.Event()
    original = hazards.hazard_zones

    def slow(*args, **kwargs):
        started.set()
        release.wait(5)
        return original(*args, **kwargs)

    monkeypatch.setattr("app.services.routing.hazard_zones", slow)
    guard = lambda: RouteGuard(slots=1, wait_s=0.2)  # noqa: E731
    with TestClient(create_app(path, route_guard=guard)) as client:
        results = {}

        def first():
            results["first"] = client.post("/api/v1/route", json=request(meta))

        worker = threading.Thread(target=first)
        worker.start()
        assert started.wait(5)
        body = request(meta)
        body["stop_time_min"] = 5
        second = client.post("/api/v1/route", json=body)
        release.set()
        worker.join(10)
    assert second.status_code == 503
    assert second.headers["Retry-After"] == "5"
    assert results["first"].status_code == 200


def test_steep_regions_are_cached_by_slope_level_and_bounded(terrain):  # noqa: F811
    path, meta, slope = terrain
    slope[:] = 0
    slope[2:8, 2:8] = 30  # 15 degrees
    slope[20:28, 20:28] = 10  # 5 degrees
    slope[30, 0:9] = range(9)  # 0 to 4 degrees: more distinct slope values, too few cells to count
    slope.tofile(path / "slope.bin")
    with TestClient(create_app(path)) as client:
        grid = client.app.state.grid
        # Limits between two stored slope values share one entry.
        assert hazards.steep_regions(grid, 6.0) is hazards.steep_regions(grid, 6.7)
        assert len(hazards.steep_regions(grid, 4.9)) == 2
        assert len(hazards.steep_regions(grid, 5.0)) == 1
        for limit in (0.1, 1, 2, 3, 4, 5):  # six different masks
            hazards.steep_regions(grid, limit)
        assert len(hazards._cache[grid]) == hazards.CACHE_ENTRIES
