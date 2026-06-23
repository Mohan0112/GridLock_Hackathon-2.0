from fastapi.testclient import TestClient

from app.api.main import app


client = TestClient(app)


def test_kpis():
    r = client.get("/api/kpis")
    assert r.status_code == 200
    data = r.json()
    for key in [
        "total_violations",
        "significant_hotspots",
        "blindspots",
        "repeat_rate",
        "date_min",
        "date_max",
    ]:
        assert key in data
    assert data["total_violations"] > 0


def test_heatmap_layers():
    for layer in ["impact", "density", "blindspot"]:
        r = client.get(f"/api/heatmap?layer={layer}")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


def test_trend():
    r = client.get("/api/trend")
    assert r.status_code == 200
    data = r.json()
    assert data
    assert {"date", "n"} <= set(data[0])


def test_heatmap_band_scales():
    base = {c["cell"]: c for c in client.get("/api/heatmap?layer=impact").json()}
    night = {
        c["cell"]: c
        for c in client.get("/api/heatmap?layer=impact&band=night").json()
    }
    cell = max(base, key=lambda c: base[c]["value"])
    assert night[cell]["value"] <= base[cell]["value"]


def test_beat_plan():
    r = client.post("/api/beat-plan", json={"teams": 3, "time_band": "morning"})
    assert r.status_code == 200
    assert len(r.json()["plan"]) <= 3


def test_forecast_metrics_have_defaults():
    r = client.get("/api/forecast")
    assert r.status_code == 200
    metrics = r.json()["metrics"]
    for key in ["model_mae", "baseline_mae", "improvement_pct", "holdout_days"]:
        assert key in metrics
        assert metrics[key] is not None


def test_impact_bounds():
    for cell in client.get("/api/heatmap?layer=impact").json():
        assert 0 <= cell["impact_score"] <= 100
