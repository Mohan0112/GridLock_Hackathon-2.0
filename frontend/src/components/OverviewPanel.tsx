import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { ForecastResp, Kpis, StationEffort, TrendPoint } from "../types";
import { api } from "../api";
import { QUADRANT_COLOR, QUADRANT_LABEL, fmt, fmt1 } from "../lib/viz";
import { Card, Chip, Eyebrow } from "./ui";

const ORDER = ["under_enforced", "known_hotspot", "over_watched", "quiet"];

export default function OverviewPanel({
  kpis,
  theme,
  onPickStation,
}: {
  kpis: Kpis | null;
  theme: "dark" | "light";
  onPickStation: (station: string) => void;
}) {
  const grid = theme === "light" ? "#D9DEE6" : "#2A323D";
  const axis = theme === "light" ? "#5A6675" : "#8B97A7";
  const [eff, setEff] = useState<StationEffort[]>([]);
  const [fc, setFc] = useState<ForecastResp | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);

  useEffect(() => {
    api.stationEffort().then(setEff).catch(() => {});
    api.forecast().then(setFc).catch(() => {});
    api.trend().then(setTrend).catch(() => {});
  }, []);

  const grouped = ORDER.map((q) => ({
    q,
    points: eff
      .filter((e) => e.quadrant === q)
      .map((e) => ({ ...e, x: e.violations, y: e.per_officer_day })),
  }));

  const under = eff
    .filter((e) => e.quadrant === "under_enforced")
    .sort((a, b) => b.per_officer_day - a.per_officer_day);
  const maxTrend = Math.max(1, ...trend.map((p) => p.n));
  const trendInterval = Math.max(0, Math.floor(trend.length / 4));

  return (
    <div className="space-y-3.5">
      <div>
        <Eyebrow>The enforcement gap</Eyebrow>
        <p className="mt-1.5 text-[13px] leading-relaxed text-paper/90">
          Tickets are logged where patrols already go. Dividing violations by{" "}
          <span className="text-amber">officer-days</span> exposes where each
          visit yields the most - the corners worth watching that the current
          beat misses.
        </p>
      </div>

      <Card className="p-3">
        <div className="mb-1 flex items-center justify-between">
          <Eyebrow>Volume vs. yield per visit / by station</Eyebrow>
        </div>
        <div className="h-[230px] w-full">
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 8, right: 10, bottom: 18, left: -8 }}>
              <CartesianGrid stroke={grid} strokeDasharray="2 4" />
              <XAxis
                type="number"
                dataKey="x"
                scale="log"
                domain={["auto", "auto"]}
                tick={{ fill: axis, fontSize: 10, fontFamily: "Inter" }}
                tickLine={{ stroke: grid }}
                axisLine={{ stroke: grid }}
                name="Violations"
                label={{
                  value: "violations (log)",
                  position: "insideBottom",
                  offset: -8,
                  fill: axis,
                  fontSize: 10,
                }}
              />
              <YAxis
                type="number"
                dataKey="y"
                tick={{ fill: axis, fontSize: 10, fontFamily: "Inter" }}
                tickLine={{ stroke: grid }}
                axisLine={{ stroke: grid }}
                name="Per officer-day"
                width={40}
              />
              <ZAxis range={[40, 40]} />
              <Tooltip
                cursor={{ stroke: grid }}
                content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs">
                      <div className="font-semibold text-paper">{d.station}</div>
                      <div className="tnum text-[11px] text-mist">
                        {fmt(d.violations)} viols / {fmt1(d.per_officer_day)}/visit
                      </div>
                      <div
                        className="mt-0.5 text-[10px]"
                        style={{ color: QUADRANT_COLOR[d.quadrant] }}
                      >
                        {QUADRANT_LABEL[d.quadrant]}
                      </div>
                    </div>
                  );
                }}
              />
              {grouped.map((g) => (
                <Scatter
                  key={g.q}
                  data={g.points}
                  fill={QUADRANT_COLOR[g.q]}
                  fillOpacity={g.q === "quiet" ? 0.5 : 0.95}
                  onClick={(p: any) => p?.station && onPickStation(p.station)}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {ORDER.map((q) => (
            <span key={q} className="flex items-center gap-1.5 text-[10px] text-mist">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: QUADRANT_COLOR[q] }}
              />
              {QUADRANT_LABEL[q]}
            </span>
          ))}
        </div>
      </Card>

      <Card>
        <Eyebrow>Violations over time</Eyebrow>
        <div className="mt-2 h-[135px] w-full">
          <ResponsiveContainer>
            <AreaChart data={trend} margin={{ top: 6, right: 6, bottom: 0, left: -24 }}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F2B33D" stopOpacity={0.65} />
                  <stop offset="100%" stopColor="#F2B33D" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                interval={trendInterval}
                tick={{ fill: axis, fontSize: 9, fontFamily: "Inter" }}
                tickLine={false}
                axisLine={{ stroke: grid }}
              />
              <YAxis hide domain={[0, maxTrend]} />
              <Tooltip
                content={({ active, payload, label }: any) =>
                  active && payload?.length ? (
                    <div className="rounded border border-line bg-panel px-2 py-1 text-[10px] text-paper">
                      {label} - {fmt(payload[0].value)}
                    </div>
                  ) : null
                }
              />
              <Area
                type="monotone"
                dataKey="n"
                stroke="#F2B33D"
                strokeWidth={1.5}
                fill="url(#trendFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <Eyebrow>Send a patrol to confirm</Eyebrow>
        <p className="mb-2 mt-1 text-[11px] text-mist">
          Under-enforced stations - highest yield, least watched.
        </p>
        <div className="space-y-1.5">
          {under.slice(0, 6).map((e) => (
            <button
              key={e.station}
              onClick={() => onPickStation(e.station)}
              className="flex w-full items-center justify-between rounded-md border border-line bg-panel2/60 px-2.5 py-1.5 text-left transition hover:border-unseen/50"
            >
              <span className="text-[13px] text-paper">{e.station}</span>
              <span className="tnum text-[11px] text-unseen">
                {fmt1(e.per_officer_day)}/visit
              </span>
            </button>
          ))}
          {under.length === 0 && <div className="text-xs text-mist">Loading...</div>}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <Eyebrow>Next-day load forecast</Eyebrow>
          {fc && (
            <Chip tone={fc.metrics.improvement_pct > 0 ? "amber" : "default"}>
              {fc.metrics.improvement_pct > 0 ? "Up " : ""}
              beats baseline by {fmt1(fc.metrics.improvement_pct)}%
            </Chip>
          )}
        </div>
        {fc ? (
          <>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <Metric label="Model MAE" value={fmt1(fc.metrics.model_mae)} />
              <Metric label="Baseline MAE" value={fmt1(fc.metrics.baseline_mae)} dim />
              <Metric label="Holdout" value={`${fc.metrics.holdout_days}d`} dim />
            </div>
            <div className="mt-2.5 border-t border-line pt-2">
              <div className="mb-1 text-[10px] text-mist">
                Highest forecast tomorrow
              </div>
              {fc.stations.slice(0, 3).map((s) => (
                <div
                  key={s.station}
                  className="flex items-center justify-between py-0.5 text-[13px]"
                >
                  <span className="text-paper">{s.station}</span>
                  <span className="tnum text-[11px] text-amber">
                    {fmt(Math.round(s.forecast))}/day
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-2 text-xs text-mist">Loading...</div>
        )}
      </Card>

      {kpis && (
        <Card>
          <Eyebrow>Repeat offenders</Eyebrow>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <div className="tnum font-display text-3xl font-bold text-amber">
                {Math.round(kpis.repeat_rate * 100)}%
              </div>
              <div className="text-[11px] text-mist">
                of violations come from repeat vehicles
              </div>
            </div>
            <div className="text-right">
              <div className="tnum text-sm text-paper">{fmt(kpis.repeat_vehicles)}</div>
              <div className="text-[9px] text-mist">plates seen 2+</div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-mist">
            Stable plate IDs let enforcement target chronic offenders, not just locations.
          </p>
        </Card>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  dim,
}: {
  label: string;
  value: string;
  dim?: boolean;
}) {
  return (
    <div className="rounded-md border border-line bg-panel2/50 py-1.5">
      <div
        className={`tnum font-display text-base font-semibold ${
          dim ? "text-mist" : "text-paper"
        }`}
      >
        {value}
      </div>
      <div className="text-[9px] text-mist">{label}</div>
    </div>
  );
}
