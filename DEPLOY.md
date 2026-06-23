# Gridlock Render Deployment

This repo is configured for a single Docker web service on Render. The Docker image builds the frontend, installs the FastAPI backend, and ships the prebuilt DuckDB database so the deployed app has data immediately.

## Pre-flight

Run these from the project root:

```powershell
Select-String -Path backend\docker-entrypoint.sh -Pattern 'PORT="\$\{PORT:-8000\}"'
Select-String -Path .dockerignore -Pattern 'backend/data/\*.duckdb'
Test-Path render.yaml
Test-Path backend\data\gridlock.duckdb
```

Expected:

- The first command prints the `PORT` fallback line.
- The second command prints nothing.
- `render.yaml` exists.
- `backend\data\gridlock.duckdb` exists.

## GitHub

The database is intentionally included for the demo deploy. If your Git ignore rules skip `*.duckdb`, force-add it once:

```powershell
git add .
git add -f backend/data/gridlock.duckdb
git commit -m "Prepare Gridlock for Render deployment"
git push
```

## Render dashboard

1. Go to https://render.com and create a new Web Service.
2. Connect the GitHub repo.
3. Choose Docker runtime if Render does not auto-detect it.
4. Use the Free instance type for a demo.
5. Set Health Check Path to `/api/health`.
6. Leave Build Command and Start Command blank.
7. Create the service.

Render will provide a URL like:

```text
https://gridlock-xxxx.onrender.com
```

## Verify

After Render reports the service is live:

```powershell
Invoke-RestMethod https://gridlock-xxxx.onrender.com/api/health
Invoke-RestMethod https://gridlock-xxxx.onrender.com/api/kpis
```

Open the Render URL in a browser and confirm the map, KPIs, tabs, theme toggle, and beat planning work.

The boot log should include:

```text
[boot] database ready (hotspots: 3812 rows)
```

If the log warns that analytics tables are empty, do not recompute on Render. Commit and push the precomputed local database instead:

```powershell
git add -f backend/data/gridlock.duckdb
git commit -m "Ship precomputed analytics database"
git push
```

The KPI endpoint should include real values such as `"total_violations":249659`, not `null` or empty data.

## Notes

- Render provides a `PORT` environment variable. The entrypoint binds Uvicorn to that value, falling back to `8000` for local runs.
- Free Render web services sleep after idle time. Open the URL a minute or two before a demo so it wakes up.
- The app uses an image-baked DuckDB file. Local writes inside the container are not persistent on Render free tier, which is fine for this read-mostly prototype.
