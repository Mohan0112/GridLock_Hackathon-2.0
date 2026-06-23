"""
Analytics orchestrator.

Runs Phases 2–5 on the foundation DB and persists artifacts:
  * DuckDB tables   : hotspots, station_effort, station_forecast, cell_profile
  * JSON exports    : artifacts/*.json  (what the dashboard / API serve)
This is the job the nightly scheduler (or an on-ingest trigger) re-runs.
"""
from __future__ import annotations
import json
import os

import pandas as pd

from .. import config as C
from ..db import get_connection
from .hotspots import build_hotspots, build_station_effort
from .impact import add_impact_score, explain
from .forecast import build_forecast, build_cell_profile
from .optimize import generate_beat_plan

ARTIFACT_DIR = os.path.join(C.BACKEND_DIR, "data", "artifacts")


def _write_table(con, name, df):
    con.execute(f"DROP TABLE IF EXISTS {name};")
    con.register("tmp_df", df)
    con.execute(f"CREATE TABLE {name} AS SELECT * FROM tmp_df;")
    con.unregister("tmp_df")


def _to_json(name, obj):
    os.makedirs(ARTIFACT_DIR, exist_ok=True)
    with open(os.path.join(ARTIFACT_DIR, name), "w") as f:
        json.dump(obj, f, default=str)


def compute_all(db_path: str = C.DEFAULT_DB_PATH) -> dict:
    con = get_connection(db_path)
    print("[analytics] Phase 2 — hotspots + effort + blind spots")
    hotspots = add_impact_score(build_hotspots(con))   # Phase 2 + 3
    hotspots["why"] = hotspots.apply(explain, axis=1)
    station_effort = build_station_effort(con)

    # per-time-band activity share per cell -> weight columns (w_morning, ...)
    bands = con.execute("""
        SELECT h3_r11 AS cell, time_band, count(*) AS n
        FROM violations WHERE include_in_analysis AND is_parking
        GROUP BY cell, time_band
    """).df()
    tot = bands.groupby("cell")["n"].transform("sum")
    bands["share"] = bands["n"] / tot
    piv = bands.pivot_table(index="cell", columns="time_band", values="share", fill_value=0.0)
    piv.columns = [f"w_{c}" for c in piv.columns]
    hotspots = hotspots.merge(piv.reset_index(), on="cell", how="left").fillna(0.0)

    print("[analytics] Phase 4 — forecasting")
    station_forecast, fc_metrics = build_forecast(con)
    cell_profile = build_cell_profile(con)

    print("[analytics] Phase 5 — beat plan")
    beat_plan = generate_beat_plan(hotspots, teams=C.DEFAULT_PATROL_TEAMS, time_band="morning")

    # persist tables
    _write_table(con, "hotspots", hotspots)
    _write_table(con, "station_effort", station_effort)
    _write_table(con, "station_forecast", station_forecast)
    _write_table(con, "cell_profile", cell_profile)

    # KPIs for the dashboard header
    kpis = {
        "total_violations": int(con.execute(
            "SELECT count(*) FROM violations WHERE include_in_analysis AND is_parking").fetchone()[0]),
        "hotspot_cells": int(hotspots["is_hotspot"].sum()),
        "blindspots": int(hotspots["blindspot"].sum()),
        "top_impact_score": float(hotspots["impact_score"].max()),
        "top_impact_station": hotspots.iloc[0]["police_station"],
        "under_enforced_stations": station_effort.query("quadrant=='under_enforced'")["station"].tolist(),
        "forecast": fc_metrics,
        "date_min": str(con.execute("SELECT min(date) FROM violations").fetchone()[0]),
        "date_max": str(con.execute("SELECT max(date) FROM violations").fetchone()[0]),
    }

    # JSON exports (compact records for the frontend)
    heatmap_cols = ["cell", "lat", "lon", "violations", "impact_score", "gi_z",
                    "is_hotspot", "blindspot", "per_officer_day", "police_station",
                    "junction_name", "top_vehicle", "active_days", "confidence", "why",
                    "impact_volume", "impact_severity", "impact_significance",
                    "impact_persistence", "impact_peak"]
    _to_json("heatmap.json", hotspots[heatmap_cols].to_dict(orient="records"))
    _to_json("station_effort.json", station_effort.to_dict(orient="records"))
    _to_json("forecast.json", {"metrics": fc_metrics,
                               "stations": station_forecast.to_dict(orient="records")})
    _to_json("beat_plan.json", beat_plan)
    _to_json("kpis.json", kpis)

    con.close()
    summary = {
        "hotspots_rows": len(hotspots),
        "significant_hotspots": kpis["hotspot_cells"],
        "blindspots": kpis["blindspots"],
        "forecast_metrics": fc_metrics,
        "beat_plan_size": len(beat_plan),
        "under_enforced": kpis["under_enforced_stations"],
    }
    return summary


if __name__ == "__main__":
    import pprint
    pprint.pp(compute_all())
