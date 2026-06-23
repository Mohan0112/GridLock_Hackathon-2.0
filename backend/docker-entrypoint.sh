#!/bin/sh
# Boot logic for the single-container deploy.
# - If the DuckDB store is missing, build it from the seed CSV and run analytics.
# - If the store exists but analytics tables are missing, run analytics only.
# - Then serve the API, which also serves the built frontend at /.
set -e

DB=/app/backend/data/gridlock.duckdb
RAW="${SEED_CSV:-/app/backend/data/raw/violations.csv}"
PORT="${PORT:-8000}"

cd /app/backend

if [ ! -f "$DB" ]; then
  if [ -f "$RAW" ]; then
    echo "[boot] no database found - building foundation from $RAW"
    python -m scripts.build_foundation "$RAW"
    echo "[boot] running analytics: hotspots, impact, forecast, beat plan"
    python -m app.analytics.compute
  else
    echo "[boot] WARNING: no database and no seed CSV at $RAW."
    echo "[boot] Place violations.csv there or set SEED_CSV, then restart."
  fi
else
  if ! python -c "import duckdb,sys; c=duckdb.connect('$DB'); n=c.execute(\"select count(*) from information_schema.tables where table_name='hotspots'\").fetchone()[0]; c.close(); sys.exit(0 if n>0 else 1)"; then
    echo "[boot] database present but analytics missing - computing"
    python -m app.analytics.compute
  else
    echo "[boot] database ready"
  fi
fi

echo "[boot] serving on port $PORT"
exec uvicorn app.api.main:app --host 0.0.0.0 --port "$PORT"
