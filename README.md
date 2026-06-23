# Gridlock — Parking-Intelligence Engine

**AI-driven parking intelligence for the Bengaluru Traffic Police.** Detect illegal-parking
hotspots, quantify their impact on traffic flow, surface the under-enforced "blind spots" the
current patrol misses, and turn it all into a ready-to-deploy beat plan.

Built for **Gridlock Hackathon 2.0 — Theme 1: Poor Visibility on Parking-Induced Congestion.**

> Runs entirely on the provided violation dataset. No external data sources, no paid APIs.

---

## What it answers (the three BTP pain points)

| BTP pain point | Gridlock answer |
|---|---|
| Enforcement is reactive / patrol-based | Proactive, ranked hotspots + a generated beat plan for the next shift |
| No view of violations *vs* congestion impact | A dual-layer hex map: violation **density** and a transparent **Congestion Impact Score** |
| Hard to prioritise enforcement zones | Effort-adjusted ranking + statistically-significant clusters + blind-spot candidates |

---

## The idea that makes it defensible

The data records **where tickets were written**, which is really **where patrols already go**. Ranking by
raw count just re-finds the existing beat. Gridlock corrects for that:

- **Effort adjustment** — violations ÷ *officer-days* (distinct officer × day) per cell and per station.
  This separates "busy because it's watched" from "high-yield per visit".
- **Blind-spot detection** — cells with **below-median volume but above-median yield per visit** (and
  enough visits to trust the rate) → *candidate* zones flagged "send a patrol to confirm". Closes the loop.
- **Statistical significance** — a local **Getis-Ord Gi\*** z-score over the H3 grid, so a hotspot is "a real
  cluster", not a single high cell.

> Because the dataset is simulated, findings are framed as *"the method corrects a real enforcement bias"*,
> not as discoveries about the real city.

---

## Capabilities (all five MVP requirements + analytics depth)

1. **Hotspot detection** — Gi\* significance + effort-adjusted intensity over ~16.7k H3 cells.
2. **Congestion Impact Score** — transparent 0–100 composite, with per-component breakdown.
3. **Dual-layer heatmap** — 3-D extruded hexes (height = impact) with a cyan blind-spot overlay.
4. **Enforcement prioritisation** — station effort quadrants + ranked blind spots.
5. **Beat-plan generation** — pick K spatially-spread cells maximising expected impact for a shift.
6. **Next-day load forecast** — per-station, validated on a held-out fortnight.

### Congestion Impact Score

`impact = 100 · Σ weightₖ · normalisedₖ` — components and default weights (in `config.py`):

| Component | Weight | Meaning |
|---|---|---|
| Volume (log) | 0.30 | how many violations, with diminishing returns |
| Road severity | 0.30 | main-road / crossing × vehicle footprint (lane blockage) |
| Cluster significance | 0.15 | Gi\* strength (real cluster vs noise) |
| Persistence | 0.15 | active across many distinct days (chronic vs one-off) |
| Peak overlap | 0.10 | concentrated in the morning peak (always-on chokepoint) |

Every component's point-contribution is stored per cell, so the dashboard can explain *why* a spot scored high.

---

## Architecture

```
                 ┌──────────────────────────────────────────────┐
  violations CSV │  INGEST  clean · tag-explode · IST time       │
   (≈300k rows)  │          H3 r9/r10/r11 · weights · confidence │
                 └───────────────┬──────────────────────────────┘
                                 ▼  DuckDB (embedded, one file)
        ┌────────────────────────────────────────────────────────┐
        │ ANALYTICS                                                │
        │  Gi* hotspots · effort adj. · blind spots   (hotspots.py)│
        │  Congestion Impact Score                    (impact.py)  │
        │  per-station next-day forecast              (forecast.py)│
        │  greedy beat-plan optimiser                 (optimize.py)│
        └───────────────┬─────────────────────────────────────────┘
                        ▼  tables + JSON artifacts
        ┌────────────────────────────────────────────────────────┐
        │ FastAPI  /api/kpis /heatmap /hotspot /station-effort     │
        │          /forecast /beat-plan  + /ingest (live seam)     │
        │          serves the built frontend at /                  │
        └───────────────┬─────────────────────────────────────────┘
                        ▼
        React + deck.gl (H3 hexagons) + MapLibre + Recharts
```

**Stack** — FastAPI · DuckDB · pandas/numpy · H3 · scikit-learn · APScheduler ·
React + Vite + TypeScript · deck.gl + react-map-gl · MapLibre GL · Recharts · Tailwind.

Everything heavy is intentionally light-weight and swappable: Gi\* is hand-rolled (drop-in: PySAL),
the forecaster is a gradient-boosting + seasonal ensemble (drop-in: LightGBM), the optimiser is greedy
(drop-in: OR-Tools CP-SAT). 300k rows do not need Spark/Postgres/Kafka.

---

## Run it

### Option A — instant (prebuilt store + frontend included)

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.api.main:app --port 8000
# open http://localhost:8000
```

The shipped `data/gridlock.duckdb` and `frontend/dist/` mean the full UI comes up immediately on real data.

### Option B — build from the raw dataset

```bash
cd backend
python -m pip install -r requirements.txt
python -m scripts.build_foundation /path/to/violations.csv   # clean + enrich -> DuckDB
python -m app.analytics.compute                              # hotspots, impact, forecast, beat plan
python -m uvicorn app.api.main:app --port 8000
```

### Option C — Docker (single self-contained container)

```bash
# place your dataset at ./backend/data/raw/violations.csv (only needed if no DB yet)
docker compose up --build
# open http://localhost:8000
```

The container builds the foundation + analytics on first boot if the store is absent, then serves.

### Frontend dev (hot reload)

```bash
cd frontend && npm install && npm run dev   # proxies /api to :8000
```

### Tests

```bash
cd backend
python -m pytest -q
```

---

## API

| Method | Endpoint | Returns |
|---|---|---|
| GET | `/api/kpis` | headline counts + highest-impact zone + under-enforced stations |
| GET | `/api/heatmap?layer=impact\|density\|blindspot` | cells for the map layer |
| GET | `/api/trend` | daily city-wide parking violation counts |
| GET | `/api/hotspot/{cell}` | drill-down: impact breakdown, vehicle mix, tags, hourly |
| GET | `/api/station-effort` | per-station volume vs yield + quadrant |
| GET | `/api/forecast` | holdout metrics + per-station next-day load |
| POST | `/api/beat-plan` | `{teams, time_band, dow}` → ranked, spread beats |
| POST | `/api/ingest` | upload a CSV → append unseen rows → recompute (the "live update" seam) |

---

## Production seams (built, not faked)

- **Ingestion** is idempotent and append-only (`append_file` adds only unseen IDs) — the same path a nightly
  BTP feed would use. `/api/ingest` runs the append + recompute in a **fresh subprocess** so the long-lived
  server never blocks and the embedded DB stays single-writer-safe.
- **Nightly recompute** is wired via APScheduler (2 AM cron); in production swap the seed step for a live pull.
- **Demo "live update"** is honest: replay a held-out month and watch the forecast validate, rather than
  pretending a public real-time API exists.

---

## Layout

```
backend/
  app/
    config.py                 # every tunable assumption (bbox, H3 res, weights, thresholds)
    db.py                     # DuckDB schema
    ingestion/pipeline.py     # load → clean → enrich → write (+ append-only ingest)
    analytics/
      hotspots.py             # Gi* + effort adjustment + blind spots
      impact.py               # Congestion Impact Score (+ explanations)
      forecast.py             # per-station next-day ensemble forecast
      optimize.py             # greedy beat-plan optimiser (haversine spread)
      compute.py              # orchestrator → tables + JSON artifacts
    api/main.py               # FastAPI service (+ serves the frontend)
    ingest_job.py             # subprocess entry for append + recompute
  scripts/build_foundation.py # Phase 1 entrypoint + validation report
  data/gridlock.duckdb        # embedded store (prebuilt)
frontend/
  src/
    App.tsx                   # layout, state, map overlays, tabbed rail
    components/MapView.tsx     # deck.gl extruded H3 map + blind-spot overlay + beats
    components/{KpiHeader,OverviewPanel,HotspotPanel,DeployPanel}.tsx
    api.ts, types.ts, lib/viz.ts
Dockerfile · docker-compose.yml
```
