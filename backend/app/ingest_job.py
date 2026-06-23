"""
Standalone ingest job — append a batch and recompute analytics in a FRESH process.

Run as a subprocess by the API so the heavy recompute never executes inside the
long-lived server process. Prints a machine-readable result line for the caller.
"""
import sys
from . import config as C
from .ingestion.pipeline import append_file
from .analytics.compute import compute_all

if __name__ == "__main__":
    csv = sys.argv[1]
    stats = append_file(csv, C.DEFAULT_DB_PATH)
    compute_all(C.DEFAULT_DB_PATH)
    print(f"RESULT added={stats.get('added', 0)} total={stats['rows']} date_max={stats['date_max']}")
