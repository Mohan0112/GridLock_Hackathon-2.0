"""
Phase 3 — Congestion Impact Score.

Turns "many violations here" into "this much traffic impact", as a transparent
0–100 composite of five normalised components. The component contributions are
kept on each row so the dashboard can explain *why* a spot scored high.

    impact = 100 * Σ_k  weight_k * normalised_component_k
"""
from __future__ import annotations
import numpy as np
import pandas as pd

from .. import config as C


def _minmax(s: pd.Series) -> pd.Series:
    lo, hi = s.min(), s.max()
    if hi - lo == 0:
        return pd.Series(np.zeros(len(s)), index=s.index)
    return (s - lo) / (hi - lo)


def add_impact_score(hotspots: pd.DataFrame) -> pd.DataFrame:
    df = hotspots.copy()
    w = C.IMPACT_WEIGHTS

    # normalised components (0–1)
    comp = pd.DataFrame(index=df.index)
    comp["volume"] = _minmax(np.log1p(df["violations"]))          # diminishing returns
    comp["severity"] = _minmax(df["severity_load"])               # main-road x footprint
    comp["significance"] = _minmax(df["gi_z"].clip(lower=0))      # only positive clustering
    comp["persistence"] = _minmax(df["active_days"])              # chronic vs one-off
    comp["peak"] = df["peak_share"].clip(0, 1)                    # already 0–1

    # weighted contributions (in score points) — stored for the breakdown panel
    for k in w:
        df[f"impact_{k}"] = (100 * w[k] * comp[k]).round(1)

    df["impact_score"] = sum(df[f"impact_{k}"] for k in w).round(1)
    df["impact_rank"] = df["impact_score"].rank(ascending=False, method="min").astype(int)
    return df.sort_values("impact_score", ascending=False).reset_index(drop=True)


def explain(row: pd.Series) -> str:
    """One-line human explanation of a hotspot's score (used in drill-down/API)."""
    bits = []
    parts = {
        "impact_volume": "violation volume",
        "impact_severity": "main-road / heavy-vehicle blockage",
        "impact_significance": "a statistically dense cluster",
        "impact_persistence": "near-daily recurrence",
        "impact_peak": "concentration in the morning peak",
    }
    top = sorted(parts, key=lambda k: row.get(k, 0), reverse=True)[:2]
    for k in top:
        if row.get(k, 0) > 0:
            bits.append(parts[k])
    drivers = " and ".join(bits) if bits else "general violation density"
    return f"High impact driven by {drivers}."
