"""Gridlock API.

The hosted app is intentionally read-mostly: Render serves a precomputed
DuckDB file baked into the Docker image. Heavy analytics recompute is disabled
by default because small free instances can be OOM-killed by it.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
import sys
import tempfile
import threading
from contextlib import contextmanager
from decimal import Decimal
from typing import Any

import duckdb
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .. import config as C

app = FastAPI(title="Gridlock - Parking Intelligence API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DB = C.DEFAULT_DB_PATH
ARTIFACTS = os.path.join(C.BACKEND_DIR, "data", "artifacts")
_LOCK = threading.RLock()


def _flag(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


READ_ONLY = _flag("GRIDLOCK_READ_ONLY", "1")
ENABLE_MUTATIONS = _flag("GRIDLOCK_ENABLE_MUTATIONS", "0")
ENABLE_SCHEDULER = _flag("GRIDLOCK_ENABLE_SCHEDULER", "0")
DUCKDB_CONFIG = {
    "threads": os.getenv("GRIDLOCK_DUCKDB_THREADS", "1"),
    "memory_limit": os.getenv("GRIDLOCK_DUCKDB_MEMORY_LIMIT", "256MB"),
}


def _connect(read_only: bool | None = None) -> duckdb.DuckDBPyConnection:
    mode = READ_ONLY if read_only is None else read_only
    try:
        return duckdb.connect(DB, read_only=mode, config=DUCKDB_CONFIG)
    except TypeError:
        return duckdb.connect(DB, read_only=mode)


@contextmanager
def cursor(read_only: bool | None = None):
    """Open a short-lived DuckDB connection and close it after each request."""
    with _LOCK:
        con = _connect(read_only=read_only)
        try:
            yield con
        finally:
            con.close()


def _has(con: duckdb.DuckDBPyConnection, table: str) -> bool:
    return (
        con.execute(
            "SELECT count(*) FROM information_schema.tables WHERE table_name=?",
            [table],
        ).fetchone()[0]
        > 0
    )


def _json(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, (dt.date, dt.datetime)):
        return str(v)
    if isinstance(v, Decimal):
        return float(v)
    if hasattr(v, "item"):
        return v.item()
    return v


def _rows(con: duckdb.DuckDBPyConnection, sql: str, params: list[Any] | None = None) -> list[dict]:
    res = con.execute(sql, params or [])
    cols = [d[0] for d in res.description]
    return [{cols[i]: _json(row[i]) for i in range(len(cols))} for row in res.fetchall()]


def _empty_kpis() -> dict:
    return {
        "total_violations": 0,
        "significant_hotspots": 0,
        "blindspots": 0,
        "top_impact_score": 0.0,
        "top_impact_station": "--",
        "under_enforced_stations": [],
        "repeat_vehicles": 0,
        "repeat_rate": 0,
        "date_min": "--",
        "date_max": "--",
    }


# --------------------------------------------------------------------------- #
# Read endpoints
# --------------------------------------------------------------------------- #
@app.get("/api/health")
def health():
    try:
        with cursor() as con:
            has_violations = _has(con, "violations")
            has_hotspots = _has(con, "hotspots")
            raw_rows = (
                con.execute("SELECT count(*) FROM violations").fetchone()[0]
                if has_violations
                else 0
            )
            hotspot_rows = (
                con.execute("SELECT count(*) FROM hotspots").fetchone()[0]
                if has_hotspots
                else 0
            )
        return {
            "status": "ok" if has_violations and hotspot_rows > 0 else "no_data",
            "violations": int(raw_rows),
            "hotspots": int(hotspot_rows),
            "read_only": READ_ONLY,
            "scheduler": ENABLE_SCHEDULER,
        }
    except Exception as e:
        return JSONResponse({"status": "error", "detail": str(e)}, status_code=500)


@app.get("/api/kpis")
def kpis():
    with cursor() as con:
        if not _has(con, "violations"):
            return _empty_kpis()

        total = con.execute(
            "SELECT count(*) FROM violations WHERE include_in_analysis AND is_parking"
        ).fetchone()[0]
        dmin, dmax = con.execute("SELECT min(date), max(date) FROM violations").fetchone()

        if _has(con, "hotspots"):
            h = con.execute(
                "SELECT sum(CASE WHEN is_hotspot THEN 1 ELSE 0 END), "
                "sum(CASE WHEN blindspot THEN 1 ELSE 0 END), max(impact_score) "
                "FROM hotspots"
            ).fetchone()
            top_row = con.execute(
                "SELECT police_station FROM hotspots ORDER BY impact_score DESC LIMIT 1"
            ).fetchone()
        else:
            h = (0, 0, 0)
            top_row = None

        under: list[str] = []
        if _has(con, "station_effort"):
            under = [
                row[0]
                for row in con.execute(
                    "SELECT station FROM station_effort "
                    "WHERE quadrant='under_enforced' ORDER BY per_officer_day DESC"
                ).fetchall()
            ]

        repeats = con.execute(
            """
            WITH repeaters AS (
                SELECT vehicle_number, count(*) AS n
                FROM violations
                WHERE include_in_analysis AND is_parking
                  AND vehicle_number IS NOT NULL AND vehicle_number <> ''
                GROUP BY vehicle_number
                HAVING count(*) > 1
            )
            SELECT count(*) AS repeat_vehicles, coalesce(sum(n), 0) AS repeat_violations
            FROM repeaters
            """
        ).fetchone()

    repeat_violations = int(repeats[1] or 0)
    return {
        "total_violations": int(total),
        "significant_hotspots": int(h[0] or 0),
        "blindspots": int(h[1] or 0),
        "top_impact_score": float(h[2] or 0),
        "top_impact_station": top_row[0] if top_row else "--",
        "under_enforced_stations": under,
        "repeat_vehicles": int(repeats[0] or 0),
        "repeat_rate": round(repeat_violations / total, 4) if total else 0,
        "date_min": str(dmin) if dmin else "--",
        "date_max": str(dmax) if dmax else "--",
    }


@app.get("/api/heatmap")
def heatmap(layer: str = "impact", band: str | None = None):
    allowed_bands = {"night", "morning", "afternoon", "evening", "late"}
    base = "violations" if layer == "density" else "impact_score"
    weight = f"coalesce(w_{band}, 0.0)" if band in allowed_bands else "1.0"
    where = "WHERE blindspot" if layer == "blindspot" else ""

    with cursor() as con:
        if not _has(con, "hotspots"):
            return []
        return _rows(
            con,
            f"""
            SELECT cell, lat, lon, violations, impact_score, gi_z, is_hotspot,
                   blindspot, per_officer_day, police_station, junction_name,
                   top_vehicle, active_days, confidence, why,
                   round({weight}, 3) AS band_share,
                   round(({base}) * ({weight}), 2) AS value
            FROM hotspots
            {where}
            ORDER BY value DESC
            """,
        )


@app.get("/api/trend")
def trend():
    with cursor() as con:
        if not _has(con, "violations"):
            return []
        rows = con.execute(
            "SELECT date, count(*) AS n FROM violations "
            "WHERE include_in_analysis AND is_parking AND date IS NOT NULL "
            "GROUP BY date ORDER BY date"
        ).fetchall()
    return [{"date": str(date), "n": int(n)} for date, n in rows]


@app.get("/api/hotspot/{cell}")
def hotspot_detail(cell: str):
    with cursor() as con:
        if not _has(con, "hotspots"):
            return JSONResponse({"detail": "not found"}, status_code=404)
        row = _rows(con, "SELECT * FROM hotspots WHERE cell=?", [cell])
        if not row:
            return JSONResponse({"detail": "not found"}, status_code=404)

        veh = _rows(
            con,
            """
            SELECT vehicle_type, count(*) n FROM violations
            WHERE h3_r11=? AND include_in_analysis GROUP BY vehicle_type ORDER BY n DESC LIMIT 6
            """,
            [cell],
        )
        tags = _rows(
            con,
            """
            SELECT t.tag, count(*) n FROM violation_tags t JOIN violations v ON v.id=t.id
            WHERE v.h3_r11=? AND v.include_in_analysis GROUP BY t.tag ORDER BY n DESC LIMIT 8
            """,
            [cell],
        )
        hours = _rows(
            con,
            """
            SELECT hour, count(*) n FROM violations
            WHERE h3_r11=? AND include_in_analysis GROUP BY hour ORDER BY hour
            """,
            [cell],
        )
        rep = con.execute(
            """
            WITH v AS (
                SELECT vehicle_number, count(*) c FROM violations
                WHERE h3_r11=? AND include_in_analysis
                  AND vehicle_number IS NOT NULL AND vehicle_number <> ''
                GROUP BY vehicle_number
            )
            SELECT coalesce(sum(c) FILTER (WHERE c >= 2), 0),
                   coalesce(sum(c), 0),
                   count(*) FILTER (WHERE c >= 2)
            FROM v
            """,
            [cell],
        ).fetchone()

    h = row[0]
    repeat_share = (rep[0] / rep[1]) if rep and rep[1] else 0.0
    return {
        "hotspot": h,
        "vehicle_mix": veh,
        "tags": tags,
        "hourly": hours,
        "impact_breakdown": {
            "volume": float(h.get("impact_volume") or 0),
            "severity": float(h.get("impact_severity") or 0),
            "significance": float(h.get("impact_significance") or 0),
            "persistence": float(h.get("impact_persistence") or 0),
            "peak": float(h.get("impact_peak") or 0),
        },
        "repeat": {
            "share": round(float(repeat_share), 3),
            "plates": int(rep[2] or 0) if rep else 0,
        },
    }


@app.get("/api/station-effort")
def station_effort():
    with cursor() as con:
        if not _has(con, "station_effort"):
            return []
        return _rows(con, "SELECT * FROM station_effort ORDER BY per_officer_day DESC")


@app.get("/api/forecast")
def forecast():
    with cursor() as con:
        stations = (
            _rows(con, "SELECT * FROM station_forecast ORDER BY forecast DESC")
            if _has(con, "station_forecast")
            else []
        )
    metrics = {}
    p = os.path.join(ARTIFACTS, "forecast.json")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            metrics = json.load(f).get("metrics", {})
    return {"metrics": metrics, "stations": stations}


# --------------------------------------------------------------------------- #
# Beat plan
# --------------------------------------------------------------------------- #
class BeatRequest(BaseModel):
    teams: int = C.DEFAULT_PATROL_TEAMS
    time_band: str = "morning"
    dow: int | None = None


@app.post("/api/beat-plan")
def beat_plan(req: BeatRequest):
    with cursor() as con:
        if not _has(con, "hotspots"):
            return {"shift": {"time_band": req.time_band, "dow": req.dow, "teams": req.teams}, "plan": []}
        hotspots = _rows(con, "SELECT * FROM hotspots")

    import pandas as pd
    from ..analytics.optimize import generate_beat_plan

    teams = max(1, min(8, int(req.teams)))
    plan = generate_beat_plan(
        pd.DataFrame(hotspots),
        teams=teams,
        time_band=req.time_band,
        dow=req.dow,
    )
    return {"shift": {"time_band": req.time_band, "dow": req.dow, "teams": teams}, "plan": plan}


# --------------------------------------------------------------------------- #
# Optional mutation jobs. Disabled by default on hosted deploys.
# --------------------------------------------------------------------------- #
def _run_ingest_job(csv_path: str) -> dict:
    proc = subprocess.run(
        [sys.executable, "-m", "app.ingest_job", csv_path],
        cwd=C.BACKEND_DIR,
        capture_output=True,
        text=True,
        timeout=600,
    )
    added = total = 0
    date_max = None
    for line in proc.stdout.splitlines():
        if line.startswith("RESULT"):
            kv = dict(p.split("=", 1) for p in line.split()[1:])
            added, total, date_max = int(kv["added"]), int(kv["total"]), kv["date_max"]
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-800:] or "ingest job failed")
    return {"added": added, "total": total, "date_max": date_max}


@app.post("/api/ingest")
def ingest(file: UploadFile = File(...)):
    if not ENABLE_MUTATIONS:
        return JSONResponse(
            {"detail": "Ingest is disabled for this deployment."},
            status_code=403,
        )

    import shutil

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".csv")
    with tmp:
        shutil.copyfileobj(file.file, tmp)
    try:
        res = _run_ingest_job(tmp.name)
    finally:
        os.unlink(tmp.name)
    return {
        "ingested": res["added"],
        "total_rows": res["total"],
        "date_max": str(res["date_max"]),
        "recompute": "done",
    }


_scheduler = None


def _nightly():
    subprocess.run(
        [sys.executable, "-m", "app.analytics.compute"],
        cwd=C.BACKEND_DIR,
        timeout=600,
        check=False,
    )


@app.on_event("startup")
def _startup():
    global _scheduler
    if not ENABLE_SCHEDULER:
        return
    from apscheduler.schedulers.background import BackgroundScheduler

    _scheduler = BackgroundScheduler()
    _scheduler.add_job(_nightly, "cron", hour=2, id="nightly", replace_existing=True)
    _scheduler.start()


@app.on_event("shutdown")
def _shutdown():
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)


# --------------------------------------------------------------------------- #
# Serve built frontend. Mounted last so /api wins.
# --------------------------------------------------------------------------- #
_DIST = os.path.join(os.path.dirname(C.BACKEND_DIR), "frontend", "dist")
if os.path.isdir(_DIST):
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="frontend")
