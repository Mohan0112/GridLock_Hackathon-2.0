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
  // Callers can abort stale map requests while this helper still enforces
  // its own timeout and Render wake-up retries for normal requests.
  const externalSignal = init?.signal;
  const { signal: _signal, ...fetchInit } = init ?? {};

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      if (externalSignal?.aborted) controller.abort();
      externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

      const r = await fetch(`${BASE}${path}`, {
        ...fetchInit,
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(`${path} -> ${r.status}`);
      return (await r.json()) as T;
    } catch (err) {
      lastError = err;
      if (externalSignal?.aborted) break;
      if (attempt === retries) break;
      await sleep(Math.min(12000, 700 * 2 ** attempt));
    } finally {
      window.clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Request failed: ${path}`);
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, signal ? { signal } : undefined);
}

export const api = {
  kpis: () => get<Kpis>("/api/kpis"),
  heatmap: (layer: "impact" | "density" | "blindspot", band?: string, signal?: AbortSignal) =>
    get<Cell[]>(`/api/heatmap?layer=${layer}${band ? `&band=${band}` : ""}`, signal),
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
