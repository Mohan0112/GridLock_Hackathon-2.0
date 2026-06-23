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

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function request<T>(
  path: string,
  init?: RequestInit,
  retries = 4,
  timeoutMs = 15000,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const r = await fetch(`${BASE}${path}`, {
        ...init,
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(`${path} -> ${r.status}`);
      return (await r.json()) as T;
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
      await sleep(Math.min(12000, 700 * 2 ** attempt));
    } finally {
      window.clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Request failed: ${path}`);
}

async function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

export const api = {
  kpis: () => get<Kpis>("/api/kpis"),
  heatmap: (layer: "impact" | "density" | "blindspot", band?: string) =>
    get<Cell[]>(`/api/heatmap?layer=${layer}${band ? `&band=${band}` : ""}`),
  hotspot: (cell: string) => get<HotspotDetail>(`/api/hotspot/${cell}`),
  stationEffort: () => get<StationEffort[]>("/api/station-effort"),
  forecast: () => get<ForecastResp>("/api/forecast"),
  trend: () => get<TrendPoint[]>("/api/trend"),
  beatPlan: (teams: number, time_band: string, dow: number | null) =>
    request<BeatPlanResp>("/api/beat-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teams, time_band, dow }),
    }),
};
