"""
Phase 5 — Enforcement optimiser (beat plan).

Given K patrol teams and a target shift (time-band), select K hotspot cells that
maximise expected impact for that window while staying spatially spread.

Greedy weighted max-coverage with a haversine separation constraint — pure-Python,
dependency-free, and safe to run inside the API request path. (OR-Tools CP-SAT is
the drop-in upgrade for travel-time-aware routing.)

Per-time-band weights are precomputed into the hotspots table at compute time,
so this step is a light read + selection — no large scans, no native calls.
"""
from __future__ import annotations
import math

import pandas as pd

from .. import config as C


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def generate_beat_plan(
    hotspots: pd.DataFrame,
    teams: int = C.DEFAULT_PATROL_TEAMS,
    time_band: str = "morning",
    dow: int | None = None,
) -> list[dict]:
    """Return up to `teams` spatially-spread beats for the chosen shift."""
    hs = hotspots.copy()

    # weight each hotspot's impact by its activity share in the chosen band
    wcol = f"w_{time_band}"
    hs["shift_weight"] = hs[wcol] if wcol in hs.columns else 0.2
    hs["shift_weight"] = hs["shift_weight"].fillna(0.0).clip(lower=0.05)  # small floor
    hs["expected_impact"] = (hs["impact_score"] * hs["shift_weight"]).round(2)
    hs = hs.sort_values("expected_impact", ascending=False).reset_index(drop=True)

    chosen: list[pd.Series] = []
    for _, r in hs.iterrows():
        if len(chosen) >= teams:
            break
        far_enough = all(
            _haversine_km(r["lat"], r["lon"], c["lat"], c["lon"]) >= C.BEAT_MIN_SEPARATION_KM
            for c in chosen
        )
        if far_enough:
            chosen.append(r)

    plan = []
    for i, r in enumerate(chosen, 1):
        plan.append({
            "priority": i,
            "cell": r["cell"],
            "lat": float(r["lat"]),
            "lon": float(r["lon"]),
            "police_station": r["police_station"],
            "junction_name": r["junction_name"],
            "time_band": time_band,
            "dow": dow,
            "impact_score": float(r["impact_score"]),
            "expected_impact": float(r["expected_impact"]),
            "top_vehicle": r["top_vehicle"],
            "blindspot": bool(r["blindspot"]),
            "is_hotspot": bool(r["is_hotspot"]),
        })
    return plan
