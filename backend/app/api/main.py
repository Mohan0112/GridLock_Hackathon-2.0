"""
Gridlock API.

Serves the precomputed parking intelligence and refreshes it on new data.

Concurrency model (robust for an embedded DuckDB file):
  * one shared connection; each request uses a short-lived cursor under a lock
  * ingestion runs the append + recompute in a FRESH SUBPROCESS, after the server
    releases its connection — heavy jobs never run inside the long-lived process
"""
from __future__ import annotations
import json
import os
import subprocess
import sys
import threading
from contextlib import contextmanager

import duckdb
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .. import config as C
from ..analytics.optimize import generate_beat_plan

app = FastAPI(title="Gridlock — Parking Intelligence API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DB = C.DEFAULT_DB_PATH
ARTIFACTS = os.path.join(C.BACKEND_DIR, "data", "artifacts")
_LOCK = threading.RLock()
_CON: duckdb.DuckDBPyConnection | None = None


def _main_con() -> duckdb.DuckDBPyConnection:
    global _CON
    if _CON is None:
        _CON = duckdb.connect(DB)
    return _CON


@contextmanager
def cursor():
    """Short-lived cursor off the shared connection, serialised by the lock."""
    with _LOCK:
        cur = _main_con().cursor()
        try:
            yield cur
        finally:
            cur.close()


def _has(con, table) -> bool:
    return con.execute(
        "SELECT count(*) FROM information_schema.tables WHERE table_name=?", [table]
    ).fetchone()[0] > 0


# --------------------------------------------------------------------------- #
# Read endpoints
# --------------------------------------------------------------------------- #
@app.get("/api/health")
def health():
    try:
        with cursor() as con:
            ok = _has(con, "violations") and _has(con, "hotspots")
            n = con.execute("SELECT count(*) FROM violations").fetchone()[0] if ok else 0
        return {"status": "ok" if ok else "no_data", "violations": n}
    except Exception as e:
        return JSONResponse({"status": "error", "detail": str(e)}, status_code=500)


@app.get("/api/kpis")
def kpis():
    with cursor() as con:
        total = con.execute("SELECT count(*) FROM violations WHERE include_in_analysis AND is_parking").fetchone()[0]
        h = con.execute("SELECT sum(CASE WHEN is_hotspot THEN 1 ELSE 0 END), "
                        "sum(CASE WHEN blindspot THEN 1 ELSE 0 END), max(impact_score) FROM hotspots").fetchone()
        top = con.execute("SELECT police_station FROM hotspots ORDER BY impact_score DESC LIMIT 1").fetchone()[0]
        under = con.execute("SELECT station FROM station_effort WHERE quadrant='under_enforced' "
                            "ORDER BY per_officer_day DESC").df()["station"].tolist()
        dmin, dmax = con.execute("SELECT min(date), max(date) FROM violations").fetchone()
        repeats = con.execute("""
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
        """).fetchone()
    repeat_violations = int(repeats[1] or 0)
    return {
        "total_violations": int(total),
        "significant_hotspots": int(h[0] or 0),
        "blindspots": int(h[1] or 0),
        "top_impact_score": float(h[2] or 0),
        "top_impact_station": top,
        "under_enforced_stations": under,
        "repeat_vehicles": int(repeats[0] or 0),
        "repeat_rate": round(repeat_violations / total, 4) if total else 0,
        "date_min": str(dmin), "date_max": str(dmax),
    }


@app.get("/api/heatmap")
def heatmap(layer: str = "impact", band: str | None = None):
    """Cells for the deck.gl H3 layer. layer = impact | density | blindspot."""
    with cursor() as con:
        df = con.execute("""
            SELECT cell, lat, lon, violations, impact_score, gi_z, is_hotspot,
                   blindspot, per_officer_day, police_station, junction_name,
                   top_vehicle, active_days, confidence, why,
                   w_night, w_morning, w_afternoon, w_evening, w_late
            FROM hotspots
        """).df()
    if layer == "blindspot":
        df = df[df["blindspot"]]
    base = df["violations"] if layer == "density" else df["impact_score"]
    if band and f"w_{band}" in df.columns:
        factor = df[f"w_{band}"].fillna(0.0)
        df["band_share"] = factor.round(3)
        df["value"] = (base * factor).round(2)
    else:
        df["band_share"] = 1.0
        df["value"] = base.round(2)
    df = df.drop(columns=[c for c in df.columns if c.startswith("w_")])
    return df.to_dict(orient="records")


@app.get("/api/trend")
def trend():
    with cursor() as con:
        rows = con.execute(
            "SELECT date, count(*) AS n FROM violations "
            "WHERE include_in_analysis AND is_parking AND date IS NOT NULL "
            "GROUP BY date ORDER BY date"
        ).fetchall()
    return [{"date": str(date), "n": int(n)} for date, n in rows]


@app.get("/api/hotspot/{cell}")
def hotspot_detail(cell: str):
    with cursor() as con:
        row = con.execute("SELECT * FROM hotspots WHERE cell=?", [cell]).df()
        if row.empty:
            return JSONResponse({"detail": "not found"}, status_code=404)
        veh = con.execute("""
            SELECT vehicle_type, count(*) n FROM violations
            WHERE h3_r11=? AND include_in_analysis GROUP BY vehicle_type ORDER BY n DESC LIMIT 6
        """, [cell]).df()
        tags = con.execute("""
            SELECT t.tag, count(*) n FROM violation_tags t JOIN violations v ON v.id=t.id
            WHERE v.h3_r11=? AND v.include_in_analysis GROUP BY t.tag ORDER BY n DESC LIMIT 8
        """, [cell]).df()
        hours = con.execute("""
            SELECT hour, count(*) n FROM violations
            WHERE h3_r11=? AND include_in_analysis GROUP BY hour ORDER BY hour
        """, [cell]).df()
        rep = con.execute("""
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
        """, [cell]).fetchone()
    r = row.iloc[0]
    repeat_share = (rep[0] / rep[1]) if rep and rep[1] else 0.0
    return {
        "hotspot": {k: (float(r[k]) if hasattr(r[k], "item") else r[k]) for k in row.columns},
        "vehicle_mix": veh.to_dict(orient="records"),
        "tags": tags.to_dict(orient="records"),
        "hourly": hours.to_dict(orient="records"),
        "impact_breakdown": {
            "volume": float(r["impact_volume"]), "severity": float(r["impact_severity"]),
            "significance": float(r["impact_significance"]),
            "persistence": float(r["impact_persistence"]), "peak": float(r["impact_peak"]),
        },
        "repeat": {
            "share": round(float(repeat_share), 3),
            "plates": int(rep[2] or 0) if rep else 0,
        },
    }


@app.get("/api/station-effort")
def station_effort():
    with cursor() as con:
        df = con.execute("SELECT * FROM station_effort ORDER BY per_officer_day DESC").df()
    return df.to_dict(orient="records")


@app.get("/api/forecast")
def forecast():
    with cursor() as con:
        sf = con.execute("SELECT * FROM station_forecast ORDER BY forecast DESC").df()
    metrics = {}
    p = os.path.join(ARTIFACTS, "forecast.json")
    if os.path.exists(p):
        metrics = json.load(open(p)).get("metrics", {})
    return {"metrics": metrics, "stations": sf.to_dict(orient="records")}


# --------------------------------------------------------------------------- #
# Beat plan (dynamic; light read + pure-python selection)
# --------------------------------------------------------------------------- #
class BeatRequest(BaseModel):
    teams: int = C.DEFAULT_PATROL_TEAMS
    time_band: str = "morning"
    dow: int | None = None


@app.post("/api/beat-plan")
def beat_plan(req: BeatRequest):
    with cursor() as con:
        hotspots = con.execute("SELECT * FROM hotspots").df()
    plan = generate_beat_plan(hotspots, teams=req.teams, time_band=req.time_band, dow=req.dow)
    return {"shift": {"time_band": req.time_band, "dow": req.dow, "teams": req.teams}, "plan": plan}


# --------------------------------------------------------------------------- #
# Ingest — append + recompute in a FRESH SUBPROCESS (the "live update" seam)
# --------------------------------------------------------------------------- #
def _run_ingest_job(csv_path: str) -> dict:
    """Release the shared connection, run the job in a subprocess, reopen."""
    global _CON
    with _LOCK:
        if _CON is not None:
            _CON.close()
            _CON = None
        proc = subprocess.run(
            [sys.executable, "-m", "app.ingest_job", csv_path],
            cwd=C.BACKEND_DIR, capture_output=True, text=True, timeout=600,
        )
        _main_con()  # reopen against the freshly-updated DB
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
    import shutil, tempfile
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".csv")
    with tmp:
        shutil.copyfileobj(file.file, tmp)
    try:
        res = _run_ingest_job(tmp.name)
    finally:
        os.unlink(tmp.name)
    return {"ingested": res["added"], "total_rows": res["total"],
            "date_max": str(res["date_max"]), "recompute": "done"}


# --------------------------------------------------------------------------- #
# Nightly recompute seam (production: swap ingest_job for a live BTP feed pull)
# --------------------------------------------------------------------------- #
scheduler = BackgroundScheduler()


def _nightly():
    with _LOCK:
        global _CON
        if _CON is not None:
            _CON.close(); _CON = None
        subprocess.run([sys.executable, "-m", "app.analytics.compute"],
                       cwd=C.BACKEND_DIR, timeout=600)
        _main_con()


@app.on_event("startup")
def _startup():
    scheduler.add_job(_nightly, "cron", hour=2, id="nightly", replace_existing=True)
    scheduler.start()


@app.on_event("shutdown")
def _shutdown():
    scheduler.shutdown(wait=False)


# --------------------------------------------------------------------------- #
# Serve built frontend (single-container deploy). Mounted last so /api wins.
# --------------------------------------------------------------------------- #
_DIST = os.path.join(os.path.dirname(C.BACKEND_DIR), "frontend", "dist")
if os.path.isdir(_DIST):
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="frontend")
