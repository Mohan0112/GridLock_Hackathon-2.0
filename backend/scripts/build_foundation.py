"""
Phase 1 entrypoint — build the data foundation.

Usage:
    python -m scripts.build_foundation [path/to/violations.csv]

If no path is given it uses the seeded file at backend/data/raw/violations.csv.
Prints a validation report so you can eyeball that the foundation is sound.
"""
from __future__ import annotations
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import config as C            # noqa: E402
from app.db import get_connection      # noqa: E402
from app.ingestion.pipeline import run_pipeline  # noqa: E402


def report(db_path: str, stats: dict) -> None:
    con = get_connection(db_path)
    line = "─" * 64
    print(f"\n{line}\n  GRIDLOCK · DATA FOUNDATION BUILT\n{line}")
    print(f"  Records ingested        : {stats['rows']:,}")
    print(f"  Parking-related         : {stats['parking_rows']:,} "
          f"({stats['parking_rows']/stats['rows']*100:.1f}%)")
    print(f"  Kept for analysis       : {stats['analysed_rows']:,} "
          f"(rejected/duplicate excluded)")
    print(f"  Tag rows (long table)   : {stats['tag_rows']:,}")
    print(f"  Date range (IST)        : {stats['date_min']} → {stats['date_max']}")
    print(f"  Police stations         : {stats['stations']}")
    print(f"  Named junctions         : {stats['junctions']}")
    print(f"  Distinct hotspot cells  : {stats['hotspot_cells']:,} (H3 r{C.HOTSPOT_RES})")

    print(f"\n  Top 5 hotspot cells by raw volume (r{C.HOTSPOT_RES}):")
    rows = con.execute("""
        SELECT h3_r11, count(*) n, round(avg(latitude),4) lat, round(avg(longitude),4) lon,
               mode(police_station) station
        FROM violations WHERE include_in_analysis
        GROUP BY h3_r11 ORDER BY n DESC LIMIT 5
    """).fetchall()
    for c, n, lat, lon, st in rows:
        print(f"    {c}  {n:>5} viols  @({lat},{lon})  {st}")

    print("\n  Violation-flag coverage (analysed rows):")
    flags = ["is_no_parking", "is_wrong_parking", "is_main_road", "is_footpath",
             "is_double_parking", "is_near_sensitive", "is_near_crossing"]
    for f in flags:
        n = con.execute(f"SELECT count(*) FROM violations WHERE include_in_analysis AND {f}").fetchone()[0]
        print(f"    {f:<20}: {n:>7,}")

    print("\n  Foundation supports effort-adjustment — station preview"
          " (violations vs officer-days):")
    rows = con.execute("""
        WITH eff AS (
          SELECT police_station,
                 count(*) viols,
                 count(DISTINCT (created_by_id || '|' || date::VARCHAR)) officer_days
          FROM violations WHERE include_in_analysis
          GROUP BY police_station HAVING viols >= 2000)
        SELECT police_station, viols, officer_days,
               round(viols::DOUBLE/officer_days, 1) per_officer_day
        FROM eff ORDER BY per_officer_day DESC LIMIT 5
    """).fetchall()
    for st, v, od, rate in rows:
        print(f"    {st:<18} {v:>6} viols / {od:>5} officer-days = {rate} per visit")

    con.close()
    print(f"\n  DB written: {db_path}")
    sz = os.path.getsize(db_path) / 1e6
    print(f"  Size: {sz:.1f} MB\n{line}")


if __name__ == "__main__":
    csv = sys.argv[1] if len(sys.argv) > 1 else C.DEFAULT_RAW_CSV
    db = C.DEFAULT_DB_PATH
    os.makedirs(os.path.dirname(db), exist_ok=True)
    stats = run_pipeline(csv, db)
    report(db, stats)
