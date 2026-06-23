"""
Central configuration for the Gridlock parking-intelligence engine.

Everything that is a *tunable assumption* (geographic bounds, spatial resolution,
impact weights) lives here so the model logic stays clean and the weights can be
defended / adjusted in front of judges without touching code.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Geography
# ---------------------------------------------------------------------------
# Bengaluru bounding box. The provided data sits entirely inside this; we use it
# to drop any stray / corrupt coordinates defensively.
BENGALURU_BBOX = {"lat_min": 12.70, "lat_max": 13.30, "lon_min": 77.30, "lon_max": 77.90}

# H3 hexagonal resolutions we materialise per record.
#   r11 (~25 m edge)  -> the "this corner" hotspot cell
#   r10 (~66 m edge)  -> block-level aggregation / display heatmap
#   r9  (~174 m edge) -> neighbourhood roll-up
HOTSPOT_RES = 11
DISPLAY_RES = 10
NEIGHBOURHOOD_RES = 9
H3_RESOLUTIONS = [NEIGHBOURHOOD_RES, DISPLAY_RES, HOTSPOT_RES]

# ---------------------------------------------------------------------------
# Time
# ---------------------------------------------------------------------------
IST = "Asia/Kolkata"
# Hour-of-day -> coarse band. (Patterns in the provided sim data skew to mornings;
# the band feature is still valid and downstream-useful.)
TIME_BANDS = {
    "night": range(0, 5),       # 00:00–04:59
    "morning": range(5, 12),    # 05:00–11:59
    "afternoon": range(12, 17), # 12:00–16:59
    "evening": range(17, 21),   # 17:00–20:59
    "late": range(21, 24),      # 21:00–23:59
}

# ---------------------------------------------------------------------------
# Impact precursors (atomic ingredients for the Congestion Impact Score, Phase 3)
# ---------------------------------------------------------------------------
# How much of the carriageway a parked vehicle of each type blocks (0–1).
# Buses / lorries choke a lane; two-wheelers barely dent it.
VEHICLE_FOOTPRINT_WEIGHTS = {
    "BUS (BMTC/KSRTC)": 1.0, "PRIVATE BUS": 1.0, "MINI BUS": 0.9,
    "HGV": 1.0, "LORRY/GOODS VEHICLE": 1.0, "TRUCK": 1.0,
    "LGV": 0.8, "TEMPO": 0.8, "MAXI-CAB": 0.8, "VAN": 0.7,
    "CAR": 0.6, "JEEP": 0.6, "TAXI": 0.6,
    "PASSENGER AUTO": 0.5, "GOODS AUTO": 0.5, "AUTO": 0.5,
    "MOTOR CYCLE": 0.3, "SCOOTER": 0.3, "MOPED": 0.3,
}
DEFAULT_FOOTPRINT_WEIGHT = 0.5  # unknown vehicle types

# Road / location severity multipliers, inferred from the violation tags
# themselves (no external data needed). Parking on a main road or by a junction
# crossing hurts flow far more than the same act on a quiet lane.
ROAD_SEVERITY_WEIGHTS = {
    "main_road": 1.0,
    "near_crossing": 0.9,
    "footpath": 0.7,        # pedestrians spill into the carriageway
    "near_sensitive": 0.7,  # bus stop / school / hospital frontage
    "double_parking": 0.8,
    "base": 0.4,            # generic no-/wrong-parking with no aggravating tag
}

# ---------------------------------------------------------------------------
# Violation taxonomy
# ---------------------------------------------------------------------------
# Substring -> canonical boolean flag. Tags are matched case-insensitively.
# (Discovered from the data's own tag vocabulary; substring match keeps it robust
# to the multi-label combinations like "PARKING IN A MAIN ROAD".)
TAG_FLAG_RULES = {
    "is_no_parking": ["NO PARKING"],
    "is_wrong_parking": ["WRONG PARKING"],
    "is_main_road": ["MAIN ROAD"],
    "is_footpath": ["FOOTPATH"],
    "is_double_parking": ["DOUBLE PARKING"],
    "is_near_sensitive": ["BUSTOP", "BUS STOP", "SCHOOL", "HOSPITAL"],
    "is_near_crossing": ["ROAD CROSSING", "JUNCTION"],
    "is_defective_plate": ["DEFECTIVE NUMBER PLATE", "NUMBER PLATE"],
}
PARKING_KEYWORD = "PARKING"  # marks a tag set as parking-relevant

# ---------------------------------------------------------------------------
# Validation workflow -> analysis treatment
# ---------------------------------------------------------------------------
# Statuses that mean "do not count this as a real violation by default".
EXCLUDE_STATUSES = {"rejected", "duplicate"}
HIGH_CONFIDENCE_STATUSES = {"approved"}

# ---------------------------------------------------------------------------
# Paths (defaults; overridable via build_foundation.py argument)
# ---------------------------------------------------------------------------
import os
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_RAW_CSV = os.path.join(BACKEND_DIR, "data", "raw", "violations.csv")
DEFAULT_DB_PATH = os.path.join(BACKEND_DIR, "data", "gridlock.duckdb")

# ===========================================================================
# Phase 2–5 parameters
# ===========================================================================
# Hotspot detection
GISTAR_K = 1                 # H3 k-ring used to build the spatial neighbourhood
GISTAR_SIG_Z = 1.96          # |z| above this => statistically significant (95%)
MIN_CELL_VIOLATIONS = 10     # a cell needs at least this many to be rankable
# Blind-spot (under-enforced) detection
BLINDSPOT_MIN_OFFICER_DAYS = 2   # need >=2 visits to trust a per-visit rate
BLINDSPOT_MIN_VIOLATIONS = 15

# Congestion Impact Score weights (sum need not be 1; score is normalised 0–100)
IMPACT_WEIGHTS = {
    "volume": 0.30,        # how many violations (log-scaled)
    "severity": 0.30,      # road-class x vehicle-footprint blockage
    "significance": 0.15,  # Gi* hotspot strength
    "persistence": 0.15,   # active across many distinct days
    "peak": 0.10,          # concentrated in peak hours (always-on chokepoint)
}

# Forecasting
FORECAST_HOLDOUT_DAYS = 14   # last N days held out to validate the forecast

# Enforcement optimiser (beat plan)
BEAT_MIN_SEPARATION_KM = 0.4     # keep assigned teams spatially spread
DEFAULT_PATROL_TEAMS = 5
