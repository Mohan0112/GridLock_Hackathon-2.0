"""
Ingestion + cleaning pipeline.

Raw violation CSV  ->  cleaned, enriched, geo-binned records  ->  DuckDB.

Designed as a set of pure-ish transform steps so it can run on the seeded file
today and, in production, on a nightly batch from BTP's live feed without change.
"""
from __future__ import annotations
import ast
import json
from typing import Tuple

import duckdb
import h3
import numpy as np
import pandas as pd

from .. import config as C
from ..db import get_connection, init_schema


# ---------------------------------------------------------------------------
# 1. Load
# ---------------------------------------------------------------------------
def load_raw(csv_path: str) -> pd.DataFrame:
    df = pd.read_csv(csv_path, low_memory=False)
    print(f"  loaded {len(df):,} raw rows, {df.shape[1]} columns")
    return df


# ---------------------------------------------------------------------------
# 2. Violation tags (multi-label JSON -> flags + long table)
# ---------------------------------------------------------------------------
def _parse_tag_list(raw) -> list[str]:
    """Robustly parse a value like '["NO PARKING","WRONG PARKING"]' into a list."""
    if isinstance(raw, list):
        return [str(t).strip().upper() for t in raw]
    if pd.isna(raw):
        return []
    s = str(raw).strip()
    for parser in (json.loads, ast.literal_eval):
        try:
            val = parser(s)
            if isinstance(val, list):
                return [str(t).strip().upper() for t in val]
        except Exception:
            continue
    # last resort: treat the whole string as a single tag
    return [s.upper()] if s else []


def parse_violation_types(df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
    tags = df["violation_type"].apply(_parse_tag_list)

    # boolean flags from substring rules
    joined = tags.apply(lambda lst: " | ".join(lst))
    for flag, keywords in C.TAG_FLAG_RULES.items():
        df[flag] = joined.apply(lambda s, kw=keywords: any(k in s for k in kw))
    df["is_parking"] = joined.str.contains(C.PARKING_KEYWORD, na=False)

    # per-ticket road-severity = strongest aggravating context present
    def severity(row) -> float:
        w = C.ROAD_SEVERITY_WEIGHTS
        vals = [w["base"]]
        if row["is_main_road"]:      vals.append(w["main_road"])
        if row["is_near_crossing"]:  vals.append(w["near_crossing"])
        if row["is_footpath"]:       vals.append(w["footpath"])
        if row["is_near_sensitive"]: vals.append(w["near_sensitive"])
        if row["is_double_parking"]: vals.append(w["double_parking"])
        return max(vals)
    df["road_severity"] = df.apply(severity, axis=1)

    # long table (id, tag)
    long = (
        pd.DataFrame({"id": df["id"], "tag": tags})
        .explode("tag")
        .dropna(subset=["tag"])
    )
    long = long[long["tag"] != ""]
    return df, long


# ---------------------------------------------------------------------------
# 3. Time normalisation (-> IST)
# ---------------------------------------------------------------------------
def _band(hour: int) -> str:
    for name, rng in C.TIME_BANDS.items():
        if hour in rng:
            return name
    return "unknown"


def normalize_time(df: pd.DataFrame) -> pd.DataFrame:
    ist = pd.to_datetime(df["created_datetime"], utc=True, errors="coerce").dt.tz_convert(C.IST)
    df["created_ist"] = ist.dt.tz_localize(None)  # naive IST for storage
    df["date"] = ist.dt.date
    df["hour"] = ist.dt.hour.astype("Int16")
    df["dow"] = ist.dt.dayofweek.astype("Int16")          # 0 = Monday
    df["is_weekend"] = ist.dt.dayofweek >= 5
    df["time_band"] = ist.dt.hour.map(lambda h: _band(h) if pd.notna(h) else "unknown")
    df["month"] = ist.dt.month.astype("Int16")
    return df


# ---------------------------------------------------------------------------
# 4. Geo normalisation + H3 binning
# ---------------------------------------------------------------------------
def normalize_geo(df: pd.DataFrame) -> pd.DataFrame:
    bb = C.BENGALURU_BBOX
    before = len(df)
    df = df[
        df["latitude"].between(bb["lat_min"], bb["lat_max"])
        & df["longitude"].between(bb["lon_min"], bb["lon_max"])
    ].copy()
    dropped = before - len(df)
    if dropped:
        print(f"  dropped {dropped:,} rows outside Bengaluru bbox")
    return df


def add_h3(df: pd.DataFrame) -> pd.DataFrame:
    # Compute the finest cell once, then derive parents (guarantees nesting + faster).
    lat = df["latitude"].to_numpy()
    lon = df["longitude"].to_numpy()
    fine = [h3.latlng_to_cell(la, lo, C.HOTSPOT_RES) for la, lo in zip(lat, lon)]
    df["h3_r11"] = fine
    df["h3_r10"] = [h3.cell_to_parent(c, C.DISPLAY_RES) for c in fine]
    df["h3_r9"] = [h3.cell_to_parent(c, C.NEIGHBOURHOOD_RES) for c in fine]
    return df


# ---------------------------------------------------------------------------
# 5. Vehicle footprint weight
# ---------------------------------------------------------------------------
def add_vehicle_weight(df: pd.DataFrame) -> pd.DataFrame:
    vt = df["vehicle_type"].fillna("").str.strip().str.upper()
    df["vehicle_type"] = vt.replace("", np.nan)
    df["footprint_weight"] = vt.map(C.VEHICLE_FOOTPRINT_WEIGHTS).fillna(C.DEFAULT_FOOTPRINT_WEIGHT)
    return df


# ---------------------------------------------------------------------------
# 6. Validation / confidence flags
# ---------------------------------------------------------------------------
def add_validation_flags(df: pd.DataFrame) -> pd.DataFrame:
    status = df["validation_status"].fillna("").str.strip().str.lower()
    df["is_rejected"] = status.eq("rejected")
    df["is_duplicate_flag"] = status.eq("duplicate")
    df["include_in_analysis"] = ~status.isin(C.EXCLUDE_STATUSES)
    df["confidence"] = np.where(
        status.isin(C.HIGH_CONFIDENCE_STATUSES), 1.0,
        np.where(df["is_rejected"], 0.0, 0.5),
    )
    df["validation_status"] = df["validation_status"]  # keep raw
    return df


# ---------------------------------------------------------------------------
# 7. Dedupe
# ---------------------------------------------------------------------------
def dedupe(df: pd.DataFrame) -> pd.DataFrame:
    before = len(df)
    df = df.drop_duplicates(subset=["id"], keep="first")
    if before - len(df):
        print(f"  removed {before - len(df):,} duplicate ids")
    return df


# ---------------------------------------------------------------------------
# 8. Coerce booleans + scita
# ---------------------------------------------------------------------------
def _coerce_bool(series: pd.Series) -> pd.Series:
    return series.astype(str).str.strip().str.lower().isin(["true", "1", "t", "yes"])


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------
FINAL_COLS = [
    "id", "latitude", "longitude", "location", "junction_name", "police_station",
    "h3_r9", "h3_r10", "h3_r11",
    "created_ist", "date", "hour", "dow", "is_weekend", "time_band", "month",
    "vehicle_type", "vehicle_number", "footprint_weight",
    "is_parking", "is_no_parking", "is_wrong_parking", "is_main_road", "is_footpath",
    "is_double_parking", "is_near_sensitive", "is_near_crossing", "is_defective_plate",
    "road_severity", "offence_code",
    "device_id", "created_by_id",
    "validation_status", "is_rejected", "is_duplicate_flag", "include_in_analysis",
    "confidence", "data_sent_to_scita",
]


def transform(df: pd.DataFrame):
    """Raw dataframe -> (fact, tags_long). Pure transform, no DB."""
    df = dedupe(df)
    df = normalize_geo(df)
    df, tags_long = parse_violation_types(df)
    df = normalize_time(df)
    df = add_h3(df)
    df = add_vehicle_weight(df)
    df = add_validation_flags(df)
    df["data_sent_to_scita"] = _coerce_bool(df["data_sent_to_scita"])
    df["offence_code"] = df["offence_code"].astype(str)
    df["id"] = df["id"].astype(str)
    fact = df[FINAL_COLS].copy()
    tags_long = tags_long[tags_long["id"].isin(fact["id"])]
    return fact, tags_long


def _stats(con) -> dict:
    q = con.execute
    return {
        "rows": q("SELECT count(*) FROM violations").fetchone()[0],
        "parking_rows": q("SELECT count(*) FROM violations WHERE is_parking").fetchone()[0],
        "analysed_rows": q("SELECT count(*) FROM violations WHERE include_in_analysis").fetchone()[0],
        "tag_rows": q("SELECT count(*) FROM violation_tags").fetchone()[0],
        "stations": q("SELECT count(DISTINCT police_station) FROM violations").fetchone()[0],
        "junctions": q("SELECT count(DISTINCT junction_name) FROM violations").fetchone()[0],
        "hotspot_cells": q("SELECT count(DISTINCT h3_r11) FROM violations").fetchone()[0],
        "date_min": q("SELECT min(date) FROM violations").fetchone()[0],
        "date_max": q("SELECT max(date) FROM violations").fetchone()[0],
    }


def run_pipeline(csv_path: str, db_path: str) -> dict:
    """Full (re)build: drop + load the file as the new baseline."""
    print(f"\n[ingest] {csv_path}")
    df = load_raw(csv_path)
    fact, tags_long = transform(df)
    con = get_connection(db_path)
    init_schema(con)
    con.register("fact_df", fact)
    con.register("tags_df", tags_long)
    con.execute("INSERT INTO violations SELECT * FROM fact_df;")
    con.execute("INSERT INTO violation_tags SELECT * FROM tags_df;")
    stats = _stats(con)
    con.close()
    return stats


def append_file(csv_path: str, db_path: str) -> dict:
    """Append a new batch (e.g. a fresh day/month) — only rows with unseen ids."""
    print(f"\n[append] {csv_path}")
    df = load_raw(csv_path)
    fact, tags_long = transform(df)
    con = get_connection(db_path)
    before = con.execute("SELECT count(*) FROM violations").fetchone()[0]
    con.register("fact_df", fact)
    con.register("tags_df", tags_long)
    con.execute("INSERT INTO violations SELECT * FROM fact_df "
                "WHERE id NOT IN (SELECT id FROM violations);")
    con.execute("INSERT INTO violation_tags SELECT * FROM tags_df "
                "WHERE id NOT IN (SELECT id FROM violation_tags);")
    after = con.execute("SELECT count(*) FROM violations").fetchone()[0]
    stats = _stats(con)
    stats["added"] = after - before
    con.close()
    return stats
