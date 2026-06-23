"""
Phase 2 — Hotspot detection.

Three outputs, all from the provided data alone:
  1. Statistically significant hotspots  (Getis-Ord Gi* over the H3 grid)
  2. Effort-adjusted intensity           (violations per officer-day)
  3. Blind-spot candidates               (low volume, high per-visit yield)

Gi* is implemented directly (no heavy spatial-stats dependency) using H3 k-ring
adjacency, so we can defend "this is a real cluster, not just a high count."
"""
from __future__ import annotations
import h3
import numpy as np
import pandas as pd

from .. import config as C


def _cell_aggregates(con) -> pd.DataFrame:
    """One row per H3 r11 cell over the analysed parking violations."""
    return con.execute(f"""
        SELECT
            h3_r11 AS cell,
            count(*)                                   AS violations,
            round(avg(latitude), 6)                    AS lat,
            round(avg(longitude), 6)                   AS lon,
            sum(road_severity * footprint_weight)      AS severity_load,
            avg(confidence)                            AS confidence,
            count(DISTINCT date)                       AS active_days,
            count(DISTINCT (created_by_id||'|'||date::VARCHAR)) AS officer_days,
            mode(police_station)                       AS police_station,
            mode(junction_name)                        AS junction_name,
            mode(vehicle_type)                         AS top_vehicle,
            -- share of violations landing in the morning peak (07–11 IST)
            avg(CASE WHEN hour BETWEEN 7 AND 11 THEN 1.0 ELSE 0.0 END) AS peak_share
        FROM violations
        WHERE include_in_analysis AND is_parking
        GROUP BY h3_r11
    """).df()


def _getis_ord_gistar(df: pd.DataFrame, value_col: str = "violations") -> np.ndarray:
    """
    Local Gi* z-score per cell using a binary k-ring spatial weights matrix
    (neighbourhood includes the focal cell). Returns a z-score array aligned to df.
    """
    cells = df["cell"].to_numpy()
    x = df[value_col].to_numpy(dtype=float)
    idx = {c: i for i, c in enumerate(cells)}
    n = len(cells)

    X = x.mean()
    S = x.std()  # population std
    if S == 0 or n < 3:
        return np.zeros(n)

    z = np.empty(n)
    for i, c in enumerate(cells):
        neighbours = h3.grid_disk(c, C.GISTAR_K)        # includes c itself
        members = [idx[nb] for nb in neighbours if nb in idx]
        w_sum = len(members)                            # binary weights => sum = count
        local_sum = x[members].sum()
        # Gi* formula with binary weights
        num = local_sum - X * w_sum
        den = S * np.sqrt((n * w_sum - w_sum ** 2) / (n - 1))
        z[i] = num / den if den != 0 else 0.0
    return z


def build_hotspots(con) -> pd.DataFrame:
    df = _cell_aggregates(con)
    df = df[df["violations"] >= C.MIN_CELL_VIOLATIONS].reset_index(drop=True)

    # 1. statistical significance
    df["gi_z"] = _getis_ord_gistar(df, "violations")
    df["gi_significant"] = df["gi_z"] >= C.GISTAR_SIG_Z
    df["is_hotspot"] = df["gi_significant"]

    # 2. effort-adjusted intensity
    df["per_officer_day"] = (df["violations"] / df["officer_days"].clip(lower=1)).round(2)

    # 3. blind-spot candidates: below-median volume, above-median per-visit yield,
    #    with enough visits to trust the rate.
    vol_med = df["violations"].median()
    rate_med = df["per_officer_day"].median()
    eligible = (
        (df["officer_days"] >= C.BLINDSPOT_MIN_OFFICER_DAYS)
        & (df["violations"] >= C.BLINDSPOT_MIN_VIOLATIONS)
    )
    df["blindspot"] = eligible & (df["violations"] < vol_med) & (df["per_officer_day"] > rate_med)
    # confidence: how far above the median yield it sits (capped)
    df["blindspot_score"] = np.where(
        df["blindspot"],
        ((df["per_officer_day"] - rate_med) / (rate_med + 1e-9)).clip(0, 2).round(2),
        0.0,
    )
    return df


def build_station_effort(con) -> pd.DataFrame:
    """Station-level volume vs effort, with a 2x2 quadrant for the narrative."""
    df = con.execute("""
        SELECT police_station AS station,
               count(*) AS violations,
               count(DISTINCT (created_by_id||'|'||date::VARCHAR)) AS officer_days
        FROM violations WHERE include_in_analysis AND is_parking AND police_station IS NOT NULL
        GROUP BY police_station
    """).df()
    df["per_officer_day"] = (df["violations"] / df["officer_days"].clip(lower=1)).round(2)
    vmed, imed = df["violations"].median(), df["per_officer_day"].median()

    def quad(r):
        hv, hi = r["violations"] >= vmed, r["per_officer_day"] >= imed
        if hv and hi: return "known_hotspot"
        if not hv and hi: return "under_enforced"
        if hv and not hi: return "over_watched"
        return "quiet"
    df["quadrant"] = df.apply(quad, axis=1)
    return df.sort_values("per_officer_day", ascending=False).reset_index(drop=True)
