"""
DuckDB store. Embedded, columnar, zero-config — it is both the database and the
analytics engine. No server to run; the whole thing ships in one file.
"""
from __future__ import annotations
import duckdb


def get_connection(db_path: str) -> duckdb.DuckDBPyConnection:
    return duckdb.connect(db_path)


# Main fact table: one cleaned, enriched row per violation ticket.
VIOLATIONS_DDL = """
CREATE TABLE violations (
    id                  VARCHAR PRIMARY KEY,
    -- geography
    latitude            DOUBLE,
    longitude           DOUBLE,
    location            VARCHAR,
    junction_name       VARCHAR,
    police_station      VARCHAR,
    h3_r9               VARCHAR,
    h3_r10              VARCHAR,
    h3_r11              VARCHAR,
    -- time (IST)
    created_ist         TIMESTAMP,
    date                DATE,
    hour                SMALLINT,
    dow                 SMALLINT,        -- 0 = Monday
    is_weekend          BOOLEAN,
    time_band           VARCHAR,
    month               SMALLINT,
    -- vehicle
    vehicle_type        VARCHAR,
    vehicle_number      VARCHAR,         -- anonymised but stable -> repeat-offender analysis
    footprint_weight    DOUBLE,
    -- violation character
    is_parking          BOOLEAN,
    is_no_parking       BOOLEAN,
    is_wrong_parking    BOOLEAN,
    is_main_road        BOOLEAN,
    is_footpath         BOOLEAN,
    is_double_parking   BOOLEAN,
    is_near_sensitive   BOOLEAN,
    is_near_crossing    BOOLEAN,
    is_defective_plate  BOOLEAN,
    road_severity       DOUBLE,          -- max road-class weight present on this ticket
    offence_code        VARCHAR,
    -- enforcement-effort proxy
    device_id           VARCHAR,
    created_by_id       VARCHAR,
    -- workflow / confidence
    validation_status   VARCHAR,
    is_rejected         BOOLEAN,
    is_duplicate_flag   BOOLEAN,
    include_in_analysis BOOLEAN,         -- default analytic filter
    confidence          DOUBLE,          -- 1.0 approved, 0.5 unknown, 0.0 rejected
    data_sent_to_scita  BOOLEAN
);
"""

# Long table: one row per (ticket, raw tag) — supports tag-level breakdowns.
TAGS_DDL = """
CREATE TABLE violation_tags (
    id   VARCHAR,
    tag  VARCHAR
);
"""


def init_schema(con: duckdb.DuckDBPyConnection) -> None:
    """Drop + recreate tables (idempotent for dev rebuilds)."""
    con.execute("DROP TABLE IF EXISTS violation_tags;")
    con.execute("DROP TABLE IF EXISTS violations;")
    con.execute(VIOLATIONS_DDL)
    con.execute(TAGS_DDL)
