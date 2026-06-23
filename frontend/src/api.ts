import type {
  BeatPlanResp,
  Cell,
  ForecastResp,
  HotspotDetail,
  Kpis,
  StationEffort,
  TrendPoint,
} from "./types";

const BASE = ""; // relative - dev proxy or same-origin prod

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

export const api = {
  kpis: () => get<Kpis>("/api/kpis"),
  heatmap: (layer: "impact" | "density" | "blindspot", band?: string) =>
    get<Cell[]>(`/api/heatmap?layer=${layer}${band ? `&band=${band}` : ""}`),
  hotspot: (cell: string) => get<HotspotDetail>(`/api/hotspot/${cell}`),
  stationEffort: () => get<StationEffort[]>("/api/station-effort"),
  forecast: () => get<ForecastResp>("/api/forecast"),
  trend: () => get<TrendPoint[]>("/api/trend"),
  beatPlan: async (teams: number, time_band: string, dow: number | null) => {
    const r = await fetch(`${BASE}/api/beat-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teams, time_band, dow }),
    });
    if (!r.ok) throw new Error(`beat-plan -> ${r.status}`);
    return r.json() as Promise<BeatPlanResp>;
  },
};
