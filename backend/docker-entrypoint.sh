#!/bin/sh
# Boot logic for the single-container deploy.
# - DB present with populated analytics: serve. This is the normal hosted path.
# - DB present but analytics empty/missing: warn loudly and serve anyway.
#   Do not recompute here: analytics compute is memory-heavy and can be killed on
#   small free instances. Commit a precomputed gridlock.duckdb instead.
# - No DB but seed CSV present: build + compute, intended for local/dev only.
set -e

DB=/app/backend/data/gridlock.duckdb
RAW="${SEED_CSV:-/app/backend/data/raw/violations.csv}"
PORT="${PORT:-8000}"

cd /app/backend

hotspot_rows() {
  python - "$DB" <<'PY' 2>/dev/null || echo 0
import duckdb
import sys

try:
    con = duckdb.connect(sys.argv[1], read_only=True)
    required = ("hotspots", "cell_profile", "station_effort")
    placeholders = ",".join(["?"] * len(required))
    have = con.execute(
        f"select count(*) from information_schema.tables where table_name in ({placeholders})",
        required,
    ).fetchone()[0]
    rows = con.execute("select count(*) from hotspots").fetchone()[0] if have == len(required) else 0
    con.close()
    print(rows)
except Exception:
    print(0)
PY
}

if [ ! -f "$DB" ]; then
  if [ -f "$RAW" ]; then
    echo "[boot] no database found - building foundation from $RAW"
    python -m scripts.build_foundation "$RAW"
    echo "[boot] running analytics: hotspots, impact, forecast, beat plan"
    python -m app.analytics.compute
  else
    echo "[boot] WARNING: no database and no seed CSV at $RAW."
    echo "[boot] Commit a prebuilt backend/data/gridlock.duckdb and redeploy."
  fi
else
  ROWS="$(hotspot_rows)"
  if [ "$ROWS" -gt 0 ] 2>/dev/null; then
    echo "[boot] database ready (hotspots: $ROWS rows)"
  else
    echo "[boot] =================================================================="
    echo "[boot] WARNING: the database has no populated analytics tables."
    echo "[boot] KPIs, map hexes and the scatter will be blank until this is fixed."
    echo "[boot] FIX: commit a fully precomputed backend/data/gridlock.duckdb."
    echo "[boot] Not recomputing here because analytics can OOM on a small host."
    echo "[boot] Starting the server anyway so logs and raw-data routes remain visible."
    echo "[boot] =================================================================="
  fi
fi

echo "[boot] serving on port $PORT"
exec uvicorn app.api.main:app --host 0.0.0.0 --port "$PORT"
