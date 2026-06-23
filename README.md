# Gridlock 2.0

Gridlock 2.0 is a parking-intelligence prototype for Bengaluru Traffic Police.
It turns parking violation records into an operational dashboard for finding
traffic-impacting hotspots, under-watched blind spots, and shift-specific patrol
plans.

The submitted source includes a precomputed DuckDB database at
`backend/data/gridlock.duckdb`, so reviewers can run the app without rebuilding
the analytics pipeline from the raw dataset.

## What The App Shows

- **Introduction**: short explanation of the workflow and tap-to-explain KPIs.
- **Overview**: enforcement-gap scatter, violation trend, forecast summary,
  repeat-offender signal, and clickable hotspot/blind-spot lists.
- **Map**: 3D H3 hex map with impact and density layers, blind-spot overlay,
  hotspot drilldown, and patrol plan generation in one shared workspace.

## Core Ideas

- **Hotspots**: statistically significant H3 cells ranked by violation pressure
  and congestion impact.
- **Blind spots**: high-yield cells that are under-watched after adjusting for
  officer-days.
- **Congestion Impact Score**: a 0-100 score built from volume, road severity,
  cluster significance, persistence, and peak-hour overlap.
- **Beat plan**: a greedy spatial optimizer that selects high-impact cells while
  keeping teams spread across the city.
- **Forecast**: a lightweight per-station next-day load estimate with safe
  fallback metrics for hosted deployments.

## Repository Layout

```text
backend/
  app/
    api/main.py              FastAPI service and static frontend serving
    analytics/
      compute.py             Analytics orchestrator
      hotspots.py            Gi* hotspot and blind-spot detection
      impact.py              Congestion impact scoring
      forecast.py            Per-station forecast
      optimize.py            Beat-plan optimizer
    ingestion/               Data cleaning and enrichment pipeline
    config.py                Shared assumptions and thresholds
  data/gridlock.duckdb       Precomputed demo database
  requirements.txt           Python dependencies

frontend/
  src/
    App.tsx                  Main app state and module routing
    pages/                   Introduction, Overview, and Map modules
    components/              Map, panels, modal, nav, and shared UI
    api.ts                   Frontend API client with retries/cancellation

Dockerfile                   Production build for Render or local Docker
render.yaml                  Render web-service configuration
DEPLOY.md                    Render deployment notes
```

## Run Locally

### Terminal 1: backend

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.api.main:app --host 127.0.0.1 --port 8000
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
```

Expected values include `status: ok`, about `299950` violations, and `3812`
hotspot rows.

### Terminal 2: frontend

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Open:

```text
http://127.0.0.1:5173/
```

## Docker Run

```powershell
docker build -t gridlock-2 .
docker run --rm -p 8000:8000 gridlock-2
```

Then open:

```text
http://127.0.0.1:8000/
```

## Tests

```powershell
cd backend
python -m pytest -q
```

Frontend production build:

```powershell
cd frontend
npm install
npm run build
```

## Deployment Notes

The hosted app is intentionally read-mostly. `backend/data/gridlock.duckdb` is
baked into the image so Render does not recompute analytics on a small instance.
The Docker entrypoint binds to Render's `$PORT` and starts Uvicorn.

Useful Render settings:

- Runtime: Docker
- Health check path: `/api/health`
- `GRIDLOCK_READ_ONLY=1`
- `GRIDLOCK_ENABLE_MUTATIONS=0`
- `GRIDLOCK_ENABLE_SCHEDULER=0`
- `GRIDLOCK_DUCKDB_THREADS=1`
- `GRIDLOCK_DUCKDB_MEMORY_LIMIT=256MB`

## Notes For Reviewers

- No external paid APIs are required.
- Frontend map tiles come from public CARTO basemap styles.
- The source package intentionally excludes `node_modules`, virtual
  environments, build output, logs, caches, and temporary recordings.
- The database is included because it is needed for an instant demo and is below
  the source upload size limit when zipped.
