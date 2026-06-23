// Types mirror the FastAPI responses 1:1.

export interface Kpis {
  total_violations: number;
  significant_hotspots: number;
  blindspots: number;
  top_impact_score: number;
  top_impact_station: string;
  under_enforced_stations: string[];
  repeat_vehicles: number;
  repeat_rate: number;
  date_min: string;
  date_max: string;
}

export interface Cell {
  cell: string;
  lat: number;
  lon: number;
  violations: number;
  impact_score: number;
  gi_z: number;
  is_hotspot: boolean;
  blindspot: boolean;
  per_officer_day: number;
  police_station: string;
  junction_name: string;
  top_vehicle: string;
  active_days: number;
  confidence: number;
  why: string;
  value: number;
  band_share?: number;
}

export interface HotspotDetail {
  hotspot: Record<string, any>;
  vehicle_mix: { vehicle_type: string; n: number }[];
  tags: { tag: string; n: number }[];
  hourly: { hour: number; n: number }[];
  impact_breakdown: {
    volume: number;
    severity: number;
    significance: number;
    persistence: number;
    peak: number;
  };
  repeat: {
    share: number;
    plates: number;
  };
}

export interface StationEffort {
  station: string;
  violations: number;
  officer_days: number;
  per_officer_day: number;
  quadrant: "under_enforced" | "over_watched" | "known_hotspot" | "quiet";
}

export interface ForecastResp {
  metrics: {
    holdout_days: number;
    model_mae: number;
    gbm_only_mae: number;
    baseline_mae: number;
    improvement_pct: number;
    test_rows: number;
    mean_daily_violations: number;
  };
  stations: { station: string; forecast: number; forecast_date: string }[];
}

export interface Beat {
  priority: number;
  cell: string;
  lat: number;
  lon: number;
  police_station: string;
  junction_name: string;
  time_band: string;
  dow: number | null;
  impact_score: number;
  expected_impact: number;
  top_vehicle: string;
  blindspot: boolean;
  is_hotspot: boolean;
}

export interface BeatPlanResp {
  shift: { time_band: string; dow: number | null; teams: number };
  plan: Beat[];
}

export interface TrendPoint {
  date: string;
  n: number;
}
